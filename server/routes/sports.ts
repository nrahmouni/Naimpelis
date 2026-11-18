/**
 * @module server/routes/sports
 * @description Live sports agenda feeds (24/7 multiplexes, StreamXHD, RojaDirecta), ESPN + FotMob scoreboards, football matchboard, and live match telemetry.
 */
import crypto from 'crypto';
import type { Express } from 'express';
import { CHROME_UA, type TrackRecord } from '../extractors/httpHelpers.ts';
import { getChineseFootballMatchTracks, getChineseFootballMultiplexCard } from '../extractors/chineseSports.ts';
import {
  doFootballTeamNamesMatch,
  fetchFotmobDayIndex,
  fetchRealFootballMatchDetails,
  getRegionLabelFromCcode,
} from '../services/footballLiveService.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';

let cachedSportsSchedule: { matches: any[]; ts: number } | null = null;
let liveScoresCache: { matches: any[]; ts: number } | null = null;
let cachedFootballBoard: { dateKey: string; matches: any[]; ts: number } | null = null;

export function getCachedSportsMatches(): any[] {
  return cachedSportsSchedule?.matches || [];
}

export function getPermanent247SportsMatches() {
  return [
    {
      id: 'mux-laliga',
      title: 'LaLiga EA Sports & Hypermotion · Movistar + DAZN 24/7',
      competition: 'Fútbol Español en Directo',
      sport: 'soccer',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-laliga-1',
          label: 'M+ LaLiga HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-2',
          label: 'DAZN LaLiga HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/538',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-3',
          label: 'LaLiga Hypermotion',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/522',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-4',
          label: 'Señal Satélite LaLiga',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/84',
          resolverType: 'sports_channel',
        },
      ],
    },
    {
      id: 'mux-f1-motor',
      title: 'DAZN F1, DSports Motor & Motorsport · Circuito 24/7',
      competition: 'Fórmula 1 · MotoGP · Automovilismo',
      sport: 'motor',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-f1-1',
          label: 'DAZN F1 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/60',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-dsp-mot',
          label: 'DSports Motor HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/96',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-f1-rb',
          label: 'Red Bull TV Motor 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
          resolverType: 'tdt_hls',
        },
      ],
    },
    {
      id: 'mux-champions',
      title: 'Champions, Libertadores & Internacional · beIN · ESPN · DSports · TNT',
      competition: 'UEFA Champions · Libertadores · Ligas',
      sport: 'soccer',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-ucl-1',
          label: 'M+ Liga de Campeones HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/mligacampeones.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-bein-es',
          label: 'beIN SPORTS Ñ 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-espn-1',
          label: 'ESPN En Vivo 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-dsports-1',
          label: 'DSports En Vivo 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://streamxhd.sbs/live2.php?stream=dsports',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-tntsp-1',
          label: 'TNT Sports HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://streamxhd.sbs/live2.php?stream=tntsports',
          resolverType: 'sports_channel',
        },
      ],
    },
    {
      id: 'mux-nba-tennis',
      title: 'Baloncesto, Tenis & Combate · Movistar Deportes · ESPN 2 · DSports Fight',
      competition: 'NBA · ACB · ATP/WTA · Boxeo/UFC',
      sport: 'basketball',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-mdep-1',
          label: 'Movistar Deportes HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/438',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-espn-2',
          label: 'ESPN 2 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn2',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-dsp-fight',
          label: 'DSports Fight HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/98',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-euro1',
          label: 'Eurosport 1 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/231',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-tdp',
          label: 'Teledeporte RTVE 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
          resolverType: 'tdt_hls',
        },
      ],
    },
    {
      id: 'mux-uk-sports',
      title: 'Sky Sports Premier League · F1 · Eurosport · DAZN UK (English 24/7)',
      competition: 'UK Sports · Premier League · F1 · Boxing · Golf',
      sport: 'soccer',
      time: 'LIVE EN',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-uk-pl',
          label: 'Sky Sports Premier League (UK)',
          lang: 'EN',
          quality: '1080p',
          sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_PREMIER_LEAGUE/index.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-f1',
          label: 'Sky Sports F1 (UK)',
          lang: 'EN',
          quality: '720p',
          sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_F1/index.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-action',
          label: 'Sky Sports Action / NFL (UK)',
          lang: 'EN',
          quality: '720p',
          sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_ACTION/index.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-es1',
          label: 'Eurosport 1 UK 1080p',
          lang: 'EN',
          quality: '1080p',
          sourceUrl: 'http://85.117.37.43/eurosport1/index.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-mutv',
          label: 'MUTV (Manchester Utd UK)',
          lang: 'EN',
          quality: '720p',
          sourceUrl:
            'https://fastly.live.brightcove.com/6374054671112/eu-west-1/6058004203001/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJob3N0IjoiYXplMnp5LmVncmVzcy55ODN1ZWIiLCJhY2NvdW50X2lkIjoiNjA1ODAwNDIwMzAwMSIsImVobiI6ImZhc3RseS5saXZlLmJyaWdodGNvdmUuY29tIiwiaXNzIjoiYmxpdmUtcGxheWJhY2stc291cmNlLWFwaSIsInN1YiI6InBhdGhtYXB0b2tlbiIsImF1ZCI6WyI2MDU4MDA0MjAzMDAxIl0sImp0aSI6IjYzNzQwNTQ2NzExMTIifQ.3FmuTna3DAmY7xlhK5fk6LMrosrtrR5VsU2QOgYO5y4/playlist-hls.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-talk',
          label: 'talkSPORT UK 1080p',
          lang: 'EN',
          quality: '1080p',
          sourceUrl:
            'https://af7a8b4e.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctZ2JfdGFsa1NQT1JUX0hMUw/playlist.m3u8',
          resolverType: 'tdt_hls',
        },
      ],
    },
    getChineseFootballMultiplexCard(),
  ];
}

function detectSportKind(text: string): 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other' {
  const lower = text.toLowerCase();
  if (/baloncesto|basket|nba|eurocup|euroliga|acb|ncaa/.test(lower)) return 'basketball';
  if (/tenis|tennis|atp|wta|roland|wimbledon/.test(lower)) return 'tennis';
  if (/f1|formula|fórmula|motogp|motor|nascar|rally|indy/.test(lower)) return 'motor';
  return 'soccer';
}

let cachedLiveAgendaFeeds: {
  rojaMatches: any[];
  streamXhdFootball: any[];
  ts: number;
} | null = null;
let inFlightLiveAgendaPromise: Promise<{
  rojaMatches: any[];
  streamXhdFootball: any[];
}> | null = null;
let rojaAgendaCooldownUntil = 0;

export async function fetchLiveSportsAgendaFeeds(): Promise<{
  rojaMatches: any[];
  streamXhdFootball: any[];
}> {
  if (cachedLiveAgendaFeeds && Date.now() - cachedLiveAgendaFeeds.ts < 90 * 1000) {
    return cachedLiveAgendaFeeds;
  }
  if (inFlightLiveAgendaPromise) {
    return inFlightLiveAgendaPromise;
  }

  inFlightLiveAgendaPromise = (async () => {
    const liveGrouped = new Map<string, any>();
    const streamXhdFootball: any[] = [];

    await Promise.all([
      (async () => {
        for (const domain of ['https://streamxhd.sbs', 'https://streamxhd.st']) {
          try {
            const evRes = await fetch(`${domain}/eventos.json`, {
              headers: { 'User-Agent': CHROME_UA },
              signal: AbortSignal.timeout(4500),
            });
            if (!evRes.ok) continue;
            const evJson: any = await evRes.json();
            for (const sp of evJson?.sports || []) {
              const sportId = String(sp?.id || '').toLowerCase();
              const mappedSport: 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other' =
                sportId === 'football' || sportId === 'soccer'
                  ? 'soccer'
                  : sportId === 'basketball'
                  ? 'basketball'
                  : sportId === 'tennis'
                  ? 'tennis'
                  : sportId === 'motorsport' || sportId === 'f1'
                  ? 'motor'
                  : detectSportKind(String(sp?.name || ''));

              for (const lg of sp?.leagues || []) {
                const leagueName = String(lg?.name || 'En Directo').trim();
                for (const ev of lg?.events || []) {
                  const servers: any[] = Array.isArray(ev?.servers) ? ev.servers : [];
                  const validTracks: TrackRecord[] = [];
                  for (const srv of servers) {
                    const srvUrl = String(srv?.url || '').trim();
                    if (!srvUrl.startsWith('http')) continue;
                    if (validTracks.some((t) => t.sourceUrl === srvUrl)) continue;
                    validTracks.push({
                      id: `sxhd-${validTracks.length + 1}`,
                      label: String(srv?.name || `Señal ${validTracks.length + 1}`).trim(),
                      lang: 'LIVE',
                      quality: '1080p',
                      sourceUrl: srvUrl,
                      resolverType: 'sports_channel',
                    });
                  }
                  if (validTracks.length === 0) continue;

                  const homeTeam = String(ev?.homeTeam || '').trim();
                  const awayTeam = String(ev?.awayTeam || '').trim();
                  const matchTitle =
                    homeTeam && awayTeam
                      ? `${homeTeam} vs ${awayTeam}`
                      : String(ev?.title || 'Evento en Vivo').trim();
                  const rawTime = String(ev?.time || '').trim();
                  const timeMatch = rawTime.match(/(\d{1,2}:\d{2})/);
                  const timeStr = timeMatch ? timeMatch[1] : 'EN VIVO';

                  const key = `sxhd-${leagueName}-${timeStr}-${matchTitle}`;
                  liveGrouped.set(key, {
                    id: `live-${crypto.createHash('sha1').update(key).digest('base64url').slice(0, 16)}`,
                    title: matchTitle,
                    homeTeam,
                    awayTeam,
                    competition: leagueName,
                    sport: mappedSport,
                    time: timeStr,
                    isLive: true,
                    is247Channel: false,
                    channels: validTracks,
                  });

                  if (mappedSport === 'soccer' && homeTeam && awayTeam) {
                    streamXhdFootball.push({
                      homeTeam,
                      awayTeam,
                      homeLogo: String(ev?.homeLogo || '').trim() || undefined,
                      awayLogo: String(ev?.awayLogo || '').trim() || undefined,
                      leagueName,
                      code: String(ev?.code || '').trim(),
                      rawTime,
                      timeStr,
                      channels: validTracks,
                    });
                  }
                }
              }
            }
            break;
          } catch {
            // try backup domain
          }
        }
      })(),

      (async () => {
        if (Date.now() < rojaAgendaCooldownUntil) return;

        let agendaHtml = '';
        for (const mirrorUrl of [
          'https://www.rojadirectv.live/',
          'https://rojadirectv.live/',
        ]) {
          try {
            const resp = await fetch(mirrorUrl, {
              headers: { 'User-Agent': CHROME_UA },
              signal: AbortSignal.timeout(5500),
            });
            if (resp.ok) {
              const html = await resp.text();
              if (html && html.includes('btn-canal')) {
                agendaHtml = html;
                break;
              }
            }
          } catch {
            // mirror timed out
          }
        }

        if (!agendaHtml) {
          rojaAgendaCooldownUntil = Date.now() + 5 * 60 * 1000;
          return;
        }

        const rowRegex =
          /<tr>\s*<td><span class="t">([^<]+)<\/span><\/td>[\s\S]*?<td align="left">([\s\S]*?)<\/td>\s*<\/tr>/gi;

        for (const rowMatch of agendaHtml.matchAll(rowRegex)) {
          const timeStr = rowMatch[1].trim();
          const cellHtml = rowMatch[2];

          const titleMatch = cellHtml.match(/<b>([^<]+)<\/b>/i);
          const compPrefix = cellHtml
            .split('<a')[0]
            .replace(/<[^>]+>/g, '')
            .replace(/:\s*$/, '')
            .trim();
          const b64Links = [
            ...cellHtml.matchAll(/\?r=([A-Za-z0-9+/=]+)"[^>]*class="btn-canal"[^>]*>([^<]+)</gi),
          ];

          if (!titleMatch || b64Links.length === 0) continue;
          const matchTitle = titleMatch[1].trim();
          const key = `${timeStr}-${matchTitle}`;

          if (!liveGrouped.has(key)) {
            liveGrouped.set(key, {
              id: `live-${crypto.createHash('sha1').update(key).digest('base64url').slice(0, 16)}`,
              title: matchTitle,
              competition: compPrefix || 'Agenda en Directo',
              sport: detectSportKind(`${compPrefix} ${matchTitle}`),
              time: timeStr,
              isLive: true,
              is247Channel: false,
              channels: [],
            });
          }

          const entry = liveGrouped.get(key);
          for (const link of b64Links) {
            try {
              const decodedChannelUrl = Buffer.from(link[1], 'base64').toString('utf8').trim();
              if (!decodedChannelUrl.startsWith('http')) continue;
              if (entry.channels.some((c: any) => c.sourceUrl === decodedChannelUrl)) continue;
              entry.channels.push({
                id: `live-ch-${entry.channels.length + 1}`,
                label: link[2].trim() || `Señal ${entry.channels.length + 1}`,
                lang: 'LIVE',
                quality: 'HD',
                sourceUrl: decodedChannelUrl,
                resolverType: 'sports_channel',
              });
            } catch {
              // skip malformed base64
            }
          }
        }
      })(),
    ]);

    const rojaMatches = Array.from(liveGrouped.values()).filter(
      (ev) => Array.isArray(ev.channels) && ev.channels.length > 0
    );
    cachedLiveAgendaFeeds = {
      rojaMatches:
        rojaMatches.length > 0
          ? rojaMatches
          : cachedLiveAgendaFeeds?.rojaMatches || [],
      streamXhdFootball:
        streamXhdFootball.length > 0
          ? streamXhdFootball
          : cachedLiveAgendaFeeds?.streamXhdFootball || [],
      ts: Date.now(),
    };
    return cachedLiveAgendaFeeds;
  })().finally(() => {
    inFlightLiveAgendaPromise = null;
  });

  return inFlightLiveAgendaPromise;
}

export async function getLiveVoiceMatches() {
  if (cachedSportsSchedule && cachedSportsSchedule.matches.length > 0) {
    return cachedSportsSchedule.matches;
  }
  const permanent = getPermanent247SportsMatches();
  try {
    const { rojaMatches } = await fetchLiveSportsAgendaFeeds();
    return [...permanent, ...rojaMatches];
  } catch {
    return permanent;
  }
}

interface SoccerLeagueFeedDef {
  slug: string;
  regionName: string;
  leagueName: string;
  regionFlagUrl: string;
  priority: number;
  broadcasterProfile: 'spain_nt' | 'laliga' | 'copa_rey' | 'uefa' | 'europe' | 'americas';
}

const SOCCER_BOARD_LEAGUES: SoccerLeagueFeedDef[] = [
  { slug: 'esp.1', regionName: 'España', leagueName: 'LaLiga EA Sports', regionFlagUrl: 'https://flagcdn.com/w40/es.png', priority: 1, broadcasterProfile: 'laliga' },
  { slug: 'uefa.champions', regionName: 'Europa', leagueName: 'Champions League', regionFlagUrl: 'https://flagcdn.com/w40/eu.png', priority: 2, broadcasterProfile: 'uefa' },
  { slug: 'uefa.nations', regionName: 'Europa', leagueName: 'Liga de Naciones UEFA', regionFlagUrl: 'https://flagcdn.com/w40/eu.png', priority: 3, broadcasterProfile: 'spain_nt' },
  { slug: 'esp.copa_del_rey', regionName: 'España', leagueName: 'Copa del Rey', regionFlagUrl: 'https://flagcdn.com/w40/es.png', priority: 4, broadcasterProfile: 'copa_rey' },
  { slug: 'esp.2', regionName: 'España', leagueName: 'LaLiga Hypermotion', regionFlagUrl: 'https://flagcdn.com/w40/es.png', priority: 5, broadcasterProfile: 'laliga' },
  { slug: 'uefa.europa', regionName: 'Europa', leagueName: 'Europa League', regionFlagUrl: 'https://flagcdn.com/w40/eu.png', priority: 6, broadcasterProfile: 'uefa' },
  { slug: 'uefa.europa.conf', regionName: 'Europa', leagueName: 'Conference League', regionFlagUrl: 'https://flagcdn.com/w40/eu.png', priority: 7, broadcasterProfile: 'uefa' },
  { slug: 'uefa.wchampions', regionName: 'Europa', leagueName: 'Champions League Femenina', regionFlagUrl: 'https://flagcdn.com/w40/eu.png', priority: 8, broadcasterProfile: 'uefa' },
  { slug: 'eng.1', regionName: 'Inglaterra', leagueName: 'Premier League', regionFlagUrl: 'https://flagcdn.com/w40/gb-eng.png', priority: 9, broadcasterProfile: 'europe' },
  { slug: 'eng.fa', regionName: 'Inglaterra', leagueName: 'FA Cup', regionFlagUrl: 'https://flagcdn.com/w40/gb-eng.png', priority: 10, broadcasterProfile: 'europe' },
  { slug: 'ita.1', regionName: 'Italia', leagueName: 'Serie A', regionFlagUrl: 'https://flagcdn.com/w40/it.png', priority: 11, broadcasterProfile: 'europe' },
  { slug: 'ger.1', regionName: 'Alemania', leagueName: 'Bundesliga', regionFlagUrl: 'https://flagcdn.com/w40/de.png', priority: 12, broadcasterProfile: 'europe' },
  { slug: 'fra.1', regionName: 'Francia', leagueName: 'Ligue 1', regionFlagUrl: 'https://flagcdn.com/w40/fr.png', priority: 13, broadcasterProfile: 'europe' },
  { slug: 'fra.coupe_de_france', regionName: 'Francia', leagueName: 'Coupe de France', regionFlagUrl: 'https://flagcdn.com/w40/fr.png', priority: 14, broadcasterProfile: 'europe' },
  { slug: 'por.1', regionName: 'Portugal', leagueName: 'Primeira Liga', regionFlagUrl: 'https://flagcdn.com/w40/pt.png', priority: 15, broadcasterProfile: 'europe' },
  { slug: 'ned.1', regionName: 'Países Bajos', leagueName: 'Eredivisie', regionFlagUrl: 'https://flagcdn.com/w40/nl.png', priority: 16, broadcasterProfile: 'europe' },
  { slug: 'fifa.worldq.uefa', regionName: 'Europa', leagueName: 'Clasificación Mundial UEFA', regionFlagUrl: 'https://flagcdn.com/w40/eu.png', priority: 17, broadcasterProfile: 'spain_nt' },
  { slug: 'fifa.worldq.conmebol', regionName: 'Sudamérica', leagueName: 'Eliminatorias CONMEBOL', regionFlagUrl: 'https://flagcdn.com/w40/ar.png', priority: 18, broadcasterProfile: 'americas' },
  { slug: 'fifa.worldq.caf', regionName: 'África', leagueName: 'Clasificación CAF', regionFlagUrl: 'https://flagcdn.com/w40/ma.png', priority: 19, broadcasterProfile: 'europe' },
  { slug: 'fifa.friendly', regionName: 'Internacional', leagueName: 'Amistosos Internacionales', regionFlagUrl: 'https://flagcdn.com/w40/un.png', priority: 20, broadcasterProfile: 'spain_nt' },
  { slug: 'conmebol.libertadores', regionName: 'Sudamérica', leagueName: 'Copa Libertadores', regionFlagUrl: 'https://flagcdn.com/w40/br.png', priority: 21, broadcasterProfile: 'americas' },
  { slug: 'bra.1', regionName: 'Brasil', leagueName: 'Brasileirao Serie A', regionFlagUrl: 'https://flagcdn.com/w40/br.png', priority: 22, broadcasterProfile: 'americas' },
  { slug: 'bra.2', regionName: 'Brasil', leagueName: 'Brasileirao Serie B', regionFlagUrl: 'https://flagcdn.com/w40/br.png', priority: 23, broadcasterProfile: 'americas' },
  { slug: 'arg.1', regionName: 'Argentina', leagueName: 'Liga Profesional', regionFlagUrl: 'https://flagcdn.com/w40/ar.png', priority: 24, broadcasterProfile: 'americas' },
  { slug: 'mex.1', regionName: 'México', leagueName: 'Liga MX', regionFlagUrl: 'https://flagcdn.com/w40/mx.png', priority: 25, broadcasterProfile: 'americas' },
  { slug: 'usa.1', regionName: 'EE. UU.', leagueName: 'MLS', regionFlagUrl: 'https://flagcdn.com/w40/us.png', priority: 26, broadcasterProfile: 'americas' },
];

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  espana: 'es', spain: 'es', francia: 'fr', france: 'fr', italia: 'it', italy: 'it',
  alemania: 'de', germany: 'de', inglaterra: 'gb-eng', england: 'gb-eng', escocia: 'gb-sct',
  gales: 'gb-wls', portugal: 'pt', croacia: 'hr', croatia: 'hr', republica_checa: 'cz',
  chequia: 'cz', czechia: 'cz', montenegro: 'me', letonia: 'lv', latvia: 'lv', albania: 'al',
  finlandia: 'fi', finland: 'fi', san_marino: 'sm', bielorrusia: 'by', belarus: 'by',
  paises_bajos: 'nl', holanda: 'nl', belgica: 'be', suiza: 'ch', austria: 'at', dinamarca: 'dk',
  suecia: 'se', noruega: 'no', polonia: 'pl', turquia: 'tr', grecia: 'gr', serbia: 'rs',
  rumania: 'ro', ucrania: 'ua', hungria: 'hu', irlanda: 'ie', islandia: 'is', eslovaquia: 'sk',
  eslovenia: 'si', georgia: 'ge', armenia: 'am', chipre: 'cy', rusia: 'ru', brasil: 'br',
  argentina: 'ar', uruguay: 'uy', colombia: 'co', chile: 'cl', paraguay: 'py', peru: 'pe',
  ecuador: 'ec', venezuela: 've', bolivia: 'bo', mexico: 'mx', estados_unidos: 'us', canada: 'ca',
  japon: 'jp', marruecos: 'ma', nigeria: 'ng', senegal: 'sn', egipto: 'eg', camerun: 'cm',
  ghana: 'gh', argelia: 'dz', tunez: 'tn',
};

function normalizeTeamToken(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveTeamBadgeUrl(teamObj: any, isInternational: boolean): string | undefined {
  const directLogo = String(teamObj?.logo || teamObj?.logos?.[0]?.href || '').trim();
  if (directLogo.startsWith('http')) {
    return directLogo;
  }
  if (isInternational) {
    const slug = normalizeTeamToken(teamObj?.displayName || teamObj?.shortDisplayName || '');
    const iso = COUNTRY_NAME_TO_ISO2[slug];
    if (iso) return `https://flagcdn.com/w40/${iso}.png`;
  }
  return undefined;
}

const BILINGUAL_TEAM_ALIASES: Record<string, string[]> = {
  espana: ['espana', 'spain'],
  francia: ['francia', 'france'],
  italia: ['italia', 'italy'],
  inglaterra: ['inglaterra', 'england'],
  alemania: ['alemania', 'germany'],
  paises_bajos: ['paises bajos', 'holanda', 'netherlands'],
  escocia: ['escocia', 'scotland'],
  gales: ['gales', 'wales'],
  suiza: ['suiza', 'switzerland'],
  suecia: ['suecia', 'sweden'],
  dinamarca: ['dinamarca', 'denmark'],
  noruega: ['noruega', 'norway'],
  polonia: ['polonia', 'poland'],
  turquia: ['turquia', 'turkey', 'turkiye'],
  grecia: ['grecia', 'greece'],
  hungria: ['hungria', 'hungary'],
  belgica: ['belgica', 'belgium'],
  croacia: ['croacia', 'croatia'],
  republica_checa: ['republica checa', 'chequia', 'czech', 'czechia'],
  letonia: ['letonia', 'latvia'],
  finlandia: ['finlandia', 'finland'],
  bielorrusia: ['bielorrusia', 'belarus'],
  eslovaquia: ['eslovaquia', 'slovakia'],
  eslovenia: ['eslovenia', 'slovenia'],
  islandia: ['islandia', 'iceland'],
  irlanda: ['irlanda', 'ireland'],
  ucrania: ['ucrania', 'ukraine'],
  rumania: ['rumania', 'romania'],
  rusia: ['rusia', 'russia'],
  chipre: ['chipre', 'cyprus'],
  estados_unidos: ['estados unidos', 'usa', 'united states'],
  brasil: ['brasil', 'brazil'],
  marruecos: ['marruecos', 'morocco'],
  argelia: ['argelia', 'algeria'],
  egipto: ['egipto', 'egypt'],
  tunez: ['tunez', 'tunisia'],
  camerun: ['camerun', 'cameroon'],
  costa_de_marfil: ['costa de marfil', 'ivory coast', 'cote divoire'],
  sudafrica: ['sudafrica', 'south africa'],
  japon: ['japon', 'japan'],
  corea_del_sur: ['corea del sur', 'south korea', 'korea'],
};

const GENERIC_TEAM_STOPWORDS = new Set([
  'fc', 'cf', 'sc', 'ac', 'cd', 'ud', 'sd', 'ca', 'rc', 'rcd', 'club', 'real', 'united', 'city',
  'sporting', 'atletico', 'deportivo', 'nacional', 'union', 'america', 'racing', 'independiente',
  'republica', 'san', 'santa', 'st', 'al', 'de', 'del', 'la', 'el', 'los', 'las', 'women',
  'femenino', 'fem', 'u21', 'u20', 'u19',
]);

function doesSingleTeamMatchCandidate(boardTeamRaw: string, candidateSideRaw: string): boolean {
  const boardSlug = normalizeTeamToken(boardTeamRaw);
  const candSpace = normalizeTeamToken(candidateSideRaw).replace(/_/g, ' ');
  const boardSpace = boardSlug.replace(/_/g, ' ');
  if (!boardSpace || !candSpace) return false;
  if (candSpace === boardSpace || candSpace.includes(boardSpace) || boardSpace.includes(candSpace)) {
    if (GENERIC_TEAM_STOPWORDS.has(candSpace) || GENERIC_TEAM_STOPWORDS.has(boardSpace)) {
      return candSpace === boardSpace;
    }
    return true;
  }

  const aliases = BILINGUAL_TEAM_ALIASES[boardSlug];
  if (aliases && aliases.some((al) => candSpace.includes(al) || al.includes(candSpace))) {
    return true;
  }

  const distinctiveTokens = boardSpace
    .split(' ')
    .filter((w) => w.length >= 4 && !GENERIC_TEAM_STOPWORDS.has(w));
  if (distinctiveTokens.length === 0) return false;
  return distinctiveTokens.some((tok) => {
    const aliasList = BILINGUAL_TEAM_ALIASES[tok] || [tok];
    return aliasList.some((al) => candSpace.includes(al));
  });
}

function doesScrapedEventMatchFixture(
  homeTeam: string,
  awayTeam: string,
  scrapedEvent: { title?: string; homeTeam?: string; awayTeam?: string }
): boolean {
  if (scrapedEvent.homeTeam && scrapedEvent.awayTeam) {
    return (
      (doesSingleTeamMatchCandidate(homeTeam, scrapedEvent.homeTeam) &&
        doesSingleTeamMatchCandidate(awayTeam, scrapedEvent.awayTeam)) ||
      (doesSingleTeamMatchCandidate(homeTeam, scrapedEvent.awayTeam) &&
        doesSingleTeamMatchCandidate(awayTeam, scrapedEvent.homeTeam))
    );
  }

  const rawTitle = String(scrapedEvent.title || '');
  const parts = rawTitle.split(/\s+(?:vs\.?|v\.?|-|contra)\s+/i);
  if (parts.length >= 2) {
    const sideA = parts[0].trim();
    const sideB = parts.slice(1).join(' ').trim();
    return (
      (doesSingleTeamMatchCandidate(homeTeam, sideA) &&
        doesSingleTeamMatchCandidate(awayTeam, sideB)) ||
      (doesSingleTeamMatchCandidate(homeTeam, sideB) &&
        doesSingleTeamMatchCandidate(awayTeam, sideA))
    );
  }
  return false;
}

function buildFootballMatchChannels(params: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  statusState: 'live' | 'upcoming' | 'finished';
  league: SoccerLeagueFeedDef;
  scrapedMatches: any[];
}): TrackRecord[] {
  const { matchId, homeTeam, awayTeam, statusState, league, scrapedMatches } = params;
  if (statusState === 'finished') return [];

  const channels: TrackRecord[] = [];
  const seenUrls = new Set<string>();

  const pushTrack = (track: TrackRecord) => {
    if (!track.sourceUrl || seenUrls.has(track.sourceUrl)) return;
    seenUrls.add(track.sourceUrl);
    channels.push(track);
  };

  for (const sm of scrapedMatches) {
    if (sm.is247Channel) continue;
    if (doesScrapedEventMatchFixture(homeTeam, awayTeam, sm)) {
      for (const ch of sm.channels || []) {
        pushTrack({
          id: `${matchId}-live-${channels.length + 1}`,
          label: ch.label || `Señal Directo ${channels.length + 1}`,
          lang: ch.lang || 'ES',
          quality: ch.quality || 'HD',
          sourceUrl: ch.sourceUrl,
          resolverType: ch.resolverType || 'sports_channel',
        });
      }
    }
  }

  const homeNorm = normalizeTeamToken(homeTeam);
  const awayNorm = normalizeTeamToken(awayTeam);
  const isSpainNationalMatch =
    (homeNorm === 'espana' || homeNorm === 'spain' || awayNorm === 'espana' || awayNorm === 'spain') &&
    (league.slug.startsWith('uefa.nations') ||
      league.slug.startsWith('uefa.euro') ||
      league.slug.startsWith('fifa.'));

  if (isSpainNationalMatch) {
    pushTrack({
      id: `${matchId}-la1`,
      label: 'La 1 RTVE HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
      resolverType: 'tdt_hls',
    });
  }

  for (const zhTrack of getChineseFootballMatchTracks(league.slug, matchId)) {
    pushTrack(zhTrack);
  }

  return channels.slice(0, 10);
}

export function registerSportsRoutes(app: Express): void {
  app.get('/api/catalog/sports', async (_req, res) => {
    if (cachedSportsSchedule && Date.now() - cachedSportsSchedule.ts < 90 * 1000) {
      return res.json({
        success: true,
        events: channelHealthMonitor.prioritizeChannels(cachedSportsSchedule.matches),
      });
    }

    const permanentChannels = getPermanent247SportsMatches();
    const { rojaMatches } = await fetchLiveSportsAgendaFeeds();
    const combined = [...permanentChannels, ...rojaMatches.slice(0, 40)];
    cachedSportsSchedule = { matches: combined, ts: Date.now() };

    res.json({
      success: true,
      events: channelHealthMonitor.prioritizeChannels(combined),
    });
  });

  app.get('/api/sports/scores', async (_req, res) => {
    if (liveScoresCache && Date.now() - liveScoresCache.ts < 45 * 1000) {
      return res.json({ success: true, scores: liveScoresCache.matches });
    }

    const feeds: { url: string; league: string; sport: 'soccer' | 'basketball' }[] = [
      { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard', league: 'LaLiga', sport: 'soccer' },
      { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard', league: 'Champions', sport: 'soccer' },
      { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', league: 'Premier', sport: 'soccer' },
      { url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', league: 'NBA', sport: 'basketball' },
    ];

    try {
      const responses = await Promise.all(
        feeds.map((f) =>
          fetch(f.url, { signal: AbortSignal.timeout(4000) })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => ({ feed: f, json }))
            .catch(() => ({ feed: f, json: null }))
        )
      );

      const parsed: any[] = [];
      for (const { feed, json } of responses) {
        const events: any[] = Array.isArray(json?.events) ? json.events : [];
        for (const ev of events.slice(0, 6)) {
          const comp = ev?.competitions?.[0];
          const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
          const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
          if (!home || !away) continue;

          const stateStr = String(ev?.status?.type?.state || '');
          const isLive = stateStr === 'in';
          const shortDetail =
            ev?.status?.type?.shortDetail || ev?.status?.displayClock || (isLive ? 'EN JUEGO' : '');

          parsed.push({
            id: `${feed.league}-${ev.id}`,
            league: feed.league,
            sport: feed.sport,
            homeTeam: home.team?.shortDisplayName || home.team?.displayName || 'Local',
            awayTeam: away.team?.shortDisplayName || away.team?.displayName || 'Visitante',
            homeScore: stateStr === 'pre' ? '-' : String(home.score ?? '0'),
            awayScore: stateStr === 'pre' ? '-' : String(away.score ?? '0'),
            homeLogo: home.team?.logo || undefined,
            awayLogo: away.team?.logo || undefined,
            statusText: shortDetail,
            isLive,
          });
        }
      }

      parsed.sort((a, b) => Number(b.isLive) - Number(a.isLive));
      liveScoresCache = { matches: parsed.slice(0, 18), ts: Date.now() };
      res.json({ success: true, scores: liveScoresCache.matches });
    } catch {
      res.json({ success: true, scores: [] });
    }
  });

  app.get('/api/sports/football-board', async (req, res) => {
    const requestedDate = String(req.query.date || '').replace(/\D/g, '').slice(0, 8);
    const madridToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
      .format(new Date())
      .replace(/-/g, '');
    const dateKey = requestedDate.length === 8 ? requestedDate : madridToday;
    const isToday = dateKey === madridToday;
    const cacheTtlMs = isToday ? 18 * 1000 : 2 * 60 * 1000;

    if (
      cachedFootballBoard &&
      cachedFootballBoard.dateKey === dateKey &&
      Date.now() - cachedFootballBoard.ts < cacheTtlMs
    ) {
      return res.json({ success: true, dateKey, matches: cachedFootballBoard.matches });
    }

    try {
      const madridTimeFmt = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const [liveFeeds, fotmobMatches, ...responses] = await Promise.all([
        isToday
          ? fetchLiveSportsAgendaFeeds()
          : Promise.resolve({ rojaMatches: [], streamXhdFootball: [] }),
        fetchFotmobDayIndex(dateKey).catch(() => []),
        ...SOCCER_BOARD_LEAGUES.map((league) =>
          fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard?dates=${dateKey}&lang=es&region=es`,
            { signal: AbortSignal.timeout(4500) }
          )
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => ({ league, json }))
            .catch(() => ({ league, json: null }))
        ),
      ]);

      const scrapedMatches = liveFeeds.rojaMatches;
      const items: any[] = [];
      const seenEventIds = new Set<string>();
      const matchedFotmobIds = new Set<string>();

      const findFotmobMatch = (homeName: string, awayName: string) =>
        fotmobMatches.find(
          (fm) =>
            (doFootballTeamNamesMatch(homeName, fm.homeName) &&
              doFootballTeamNamesMatch(awayName, fm.awayName)) ||
            (doFootballTeamNamesMatch(homeName, fm.awayName) &&
              doFootballTeamNamesMatch(awayName, fm.homeName))
        );

      for (const { league, json } of responses) {
        const events: any[] = Array.isArray(json?.events) ? json.events : [];
        const espnLeagueLogo = String(json?.leagues?.[0]?.logos?.[0]?.href || '').trim() || undefined;
        const isInternational =
          league.slug.startsWith('uefa.nations') || league.slug.startsWith('fifa.');

        for (const ev of events) {
          const eventId = String(ev?.id || '').trim();
          if (!eventId || seenEventIds.has(eventId)) continue;
          seenEventIds.add(eventId);

          const comp = ev?.competitions?.[0];
          const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
          const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
          if (!home || !away) continue;

          const kickoffDate = ev?.date ? new Date(ev.date) : new Date();
          const kickoffTime = Number.isNaN(kickoffDate.getTime())
            ? '20:45'
            : madridTimeFmt.format(kickoffDate);

          const rawState = String(ev?.status?.type?.state || '').toLowerCase();
          const statusName = String(ev?.status?.type?.name || '');
          let statusState: 'live' | 'upcoming' | 'finished' =
            rawState === 'in' ? 'live' : rawState === 'post' ? 'finished' : 'upcoming';

          let statusLabel = '';
          if (statusState === 'live') {
            if (statusName.includes('HALFTIME')) {
              statusLabel = 'Descanso';
            } else {
              const clk = String(
                ev?.status?.displayClock || ev?.status?.type?.shortDetail || ''
              ).trim();
              statusLabel = /^(ht|half-time|half time)$/i.test(clk) ? 'Descanso' : (clk || 'EN VIVO');
            }
          } else if (statusState === 'finished') {
            statusLabel = statusName.includes('PEN') ? 'Penaltis' : statusName.includes('AET') ? 'Prórroga' : 'Final';
          } else {
            statusLabel = 'Por empezar';
          }

          const homeTeam = String(
            home.team?.shortDisplayName || home.team?.displayName || 'Local'
          ).trim();
          const awayTeam = String(
            away.team?.shortDisplayName || away.team?.displayName || 'Visitante'
          ).trim();

          const fm = findFotmobMatch(homeTeam, awayTeam);
          if (fm) {
            matchedFotmobIds.add(fm.fotmobId);
            if (fm.statusState === 'live') {
              statusState = 'live';
              if (fm.statusLabel) {
                statusLabel = /^(ht|half-time|half time)$/i.test(fm.statusLabel)
                  ? 'Descanso'
                  : fm.statusLabel;
              }
            } else if (fm.statusState === 'finished' && statusState !== 'finished') {
              statusState = 'finished';
              statusLabel = fm.statusLabel && !/^(ft|full-time)$/i.test(fm.statusLabel) ? fm.statusLabel : 'Final';
            }
          }

          const resolvedHomeScore =
            fm && fm.statusState !== 'upcoming'
              ? fm.homeScore
              : statusState === 'upcoming'
              ? '-'
              : String(home.score ?? '0');
          const resolvedAwayScore =
            fm && fm.statusState !== 'upcoming'
              ? fm.awayScore
              : statusState === 'upcoming'
              ? '-'
              : String(away.score ?? '0');

          const channels = buildFootballMatchChannels({
            matchId: `fb-${eventId}`,
            homeTeam,
            awayTeam,
            statusState,
            league,
            scrapedMatches,
          });

          items.push({
            id: `fb-${eventId}`,
            eventId,
            fotmobMatchId: fm?.fotmobId,
            leagueSlug: league.slug,
            regionName: league.regionName,
            leagueName: league.leagueName,
            groupTitle: `${league.regionName}: ${league.leagueName}`,
            regionFlagUrl: league.regionFlagUrl,
            leagueLogoUrl: espnLeagueLogo,
            priority: league.priority,
            kickoffIso: kickoffDate.toISOString(),
            kickoffTime: fm?.kickoffTime || kickoffTime,
            kickoffMs: fm?.kickoffMs || kickoffDate.getTime() || 0,
            statusState,
            statusLabel,
            homeTeam,
            awayTeam,
            homeShort: String(home.team?.abbreviation || homeTeam.slice(0, 3)).toUpperCase(),
            awayShort: String(away.team?.abbreviation || awayTeam.slice(0, 3)).toUpperCase(),
            homeLogo: resolveTeamBadgeUrl(home.team, isInternational) || fm?.homeLogo,
            awayLogo: resolveTeamBadgeUrl(away.team, isInternational) || fm?.awayLogo,
            homeScore: resolvedHomeScore,
            awayScore: resolvedAwayScore,
            homeRedCards: fm?.homeRedCards || 0,
            awayRedCards: fm?.awayRedCards || 0,
            channels,
          });
        }
      }

      if (isToday && liveFeeds.streamXhdFootball.length > 0) {
        for (let idx = 0; idx < liveFeeds.streamXhdFootball.length; idx++) {
          const sx = liveFeeds.streamXhdFootball[idx];
          const alreadyInBoard = items.some((it) =>
            doesScrapedEventMatchFixture(it.homeTeam, it.awayTeam, sx)
          );
          if (alreadyInBoard) continue;

          const fm = findFotmobMatch(sx.homeTeam, sx.awayTeam);
          if (fm) matchedFotmobIds.add(fm.fotmobId);

          const sxId = `sxhd-${idx + 1}-${normalizeTeamToken(sx.homeTeam).slice(0, 8)}`;
          const codeUpper = String(sx.code || '').toUpperCase();
          const flagIso =
            codeUpper === 'COL' ? 'co' : codeUpper === 'ARG' ? 'ar' : codeUpper === 'MEX' ? 'mx'
            : codeUpper === 'CHL' || codeUpper === 'CHI' ? 'cl' : codeUpper === 'PER' ? 'pe'
            : codeUpper === 'BRA' ? 'br' : codeUpper === 'URU' ? 'uy' : codeUpper === 'ECU' ? 'ec' : 'un';

          items.push({
            id: `fb-${sxId}`,
            eventId: fm?.fotmobId || sxId,
            fotmobMatchId: fm?.fotmobId,
            leagueSlug: fm ? `fotmob.${fm.leagueId}` : `live.${normalizeTeamToken(sx.leagueName || 'directo')}`,
            regionName: fm ? getRegionLabelFromCcode(fm.ccode) : codeUpper || 'Internacional',
            leagueName: fm?.leagueName || sx.leagueName || 'Fútbol en Vivo',
            groupTitle: `${codeUpper || 'En Vivo'}: ${fm?.leagueName || sx.leagueName || 'Fútbol en Directo'}`,
            regionFlagUrl: fm?.regionFlagUrl || `https://flagcdn.com/w40/${flagIso}.png`,
            priority: 12,
            kickoffIso: fm?.utcTime || new Date().toISOString(),
            kickoffTime: fm?.kickoffTime || sx.timeStr || 'EN VIVO',
            kickoffMs: fm?.kickoffMs || Date.now(),
            statusState: fm?.statusState || 'live',
            statusLabel: fm?.statusLabel || 'EN VIVO',
            homeTeam: fm?.homeName || sx.homeTeam,
            awayTeam: fm?.awayName || sx.awayTeam,
            homeShort: (fm?.homeName || sx.homeTeam).slice(0, 3).toUpperCase(),
            awayShort: (fm?.awayName || sx.awayTeam).slice(0, 3).toUpperCase(),
            homeLogo: fm?.homeLogo || sx.homeLogo,
            awayLogo: fm?.awayLogo || sx.awayLogo,
            homeScore: fm ? fm.homeScore : '•',
            awayScore: fm ? fm.awayScore : '•',
            homeRedCards: fm?.homeRedCards || 0,
            awayRedCards: fm?.awayRedCards || 0,
            channels: sx.channels,
          });
        }
      }

      for (const fm of fotmobMatches) {
        if (matchedFotmobIds.has(fm.fotmobId)) continue;
        if (fm.statusState !== 'live' && fm.ccode !== 'INT' && fm.ccode !== 'ESP' && fm.ccode !== 'EUR') {
          continue;
        }
        const pseudoLeague: SoccerLeagueFeedDef = {
          slug: `fotmob.${fm.leagueId}`,
          regionName: getRegionLabelFromCcode(fm.ccode),
          leagueName: fm.leagueName,
          regionFlagUrl: fm.regionFlagUrl,
          priority: fm.statusState === 'live' ? 11 : 28,
          broadcasterProfile: fm.ccode === 'ESP' ? 'laliga' : fm.ccode === 'INT' ? 'spain_nt' : 'europe',
        };
        const channels = buildFootballMatchChannels({
          matchId: `fb-fm-${fm.fotmobId}`,
          homeTeam: fm.homeName,
          awayTeam: fm.awayName,
          statusState: fm.statusState,
          league: pseudoLeague,
          scrapedMatches,
        });

        items.push({
          id: `fb-fm-${fm.fotmobId}`,
          eventId: fm.fotmobId,
          fotmobMatchId: fm.fotmobId,
          leagueSlug: pseudoLeague.slug,
          regionName: pseudoLeague.regionName,
          leagueName: fm.leagueName,
          groupTitle: `${pseudoLeague.regionName}: ${fm.leagueName}`,
          regionFlagUrl: fm.regionFlagUrl,
          priority: pseudoLeague.priority,
          kickoffIso: fm.utcTime || new Date().toISOString(),
          kickoffTime: fm.kickoffTime,
          kickoffMs: fm.kickoffMs,
          statusState: fm.statusState,
          statusLabel: fm.statusLabel,
          homeTeam: fm.homeName,
          awayTeam: fm.awayName,
          homeShort: fm.homeName.slice(0, 3).toUpperCase(),
          awayShort: fm.awayName.slice(0, 3).toUpperCase(),
          homeLogo: fm.homeLogo,
          awayLogo: fm.awayLogo,
          homeScore: fm.homeScore,
          awayScore: fm.awayScore,
          homeRedCards: fm.homeRedCards,
          awayRedCards: fm.awayRedCards,
          channels,
        });
      }

      items.sort((a, b) => {
        const rank = (s: string) => (s === 'live' ? 0 : s === 'upcoming' ? 1 : 2);
        if (rank(a.statusState) !== rank(b.statusState)) {
          return rank(a.statusState) - rank(b.statusState);
        }
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.kickoffMs - b.kickoffMs;
      });

      cachedFootballBoard = { dateKey, matches: items, ts: Date.now() };
      const prioritizedItems = items.map((m) => ({
        ...m,
        channels: channelHealthMonitor.prioritizeTracks(m.channels || []),
      }));
      res.json({ success: true, dateKey, matches: prioritizedItems });
    } catch (err) {
      console.warn('Football matchboard fetch error:', err);
      const fallbackItems = (cachedFootballBoard?.matches || []).map((m: any) => ({
        ...m,
        channels: channelHealthMonitor.prioritizeTracks(m.channels || []),
      }));
      res.json({ success: true, dateKey, matches: fallbackItems });
    }
  });

  app.get('/api/sports/match-details', async (req, res) => {
    const eventId = String(req.query.eventId || '').trim();
    const fotmobMatchId = String(req.query.fotmobMatchId || '').trim();
    const leagueSlug = String(req.query.leagueSlug || 'all').replace(/[^a-z0-9._-]/gi, '') || 'all';
    const homeTeam = String(req.query.homeTeam || '').trim();
    const awayTeam = String(req.query.awayTeam || '').trim();
    const dateKey = String(req.query.date || '').replace(/\D/g, '').slice(0, 8);

    if (!eventId && !fotmobMatchId && !(homeTeam && awayTeam)) {
      return res.status(400).json({ success: false, error: 'Missing eventId or team info' });
    }

    try {
      const details = await fetchRealFootballMatchDetails({
        eventId,
        fotmobMatchId,
        leagueSlug,
        homeTeam,
        awayTeam,
        dateKey: dateKey || undefined,
      });
      res.json({ success: true, details });
    } catch (err) {
      console.warn('Match details error:', err);
      res.json({
        success: true,
        details: { eventId: eventId || fotmobMatchId, stats: [], events: [], commentary: [], shotsMap: [] },
      });
    }
  });
}
