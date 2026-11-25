/**
 * @module server/services/epgService
 * @description Real-time Spanish XMLTV + TDTChannels EPG loader, channel ID mapping, and `/api/epg/live` route.
 */
import https from 'https';
import zlib from 'zlib';
import type { Express } from 'express';
import { logger } from '../utils/logger.ts';
import { CHROME_UA } from '../extractors/httpHelpers.ts';

export interface RawEpgEvent {
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  icon?: string;
  startMs: number;
  stopMs: number;
  isLiveSport?: boolean;
}

export const EPG_CHANNEL_MAPPING: Record<string, { xmltv: string[]; tdtJson: string[] }> = {
  'tdt-la1': { xmltv: ['La 1 HD', 'La 1'], tdtJson: ['La1.TV'] },
  'tdt-la2': { xmltv: ['La 2', 'La 2 HD'], tdtJson: ['La2.TV'] },
  'tdt-antena3': { xmltv: ['Antena 3 HD', 'Antena 3'], tdtJson: ['Antena3.TV'] },
  'tdt-cuatro': { xmltv: ['Cuatro HD', 'Cuatro'], tdtJson: ['Cuatro.TV'] },
  'tdt-telecinco': { xmltv: ['Telecinco HD', 'Telecinco'], tdtJson: ['Telecinco.TV'] },
  'tdt-lasexta': { xmltv: ['La Sexta HD', 'La Sexta'], tdtJson: ['LaSexta.TV'] },
  'mplus-canal': { xmltv: ['Movistar Plus HD', 'M+ Cero'], tdtJson: [] },
  'mplus-vamos': { xmltv: ['M+ Vamos HD', 'M+ Vamos 2'], tdtJson: [] },
  'mplus-laliga': { xmltv: ['M+ LaLiga HD', 'M+ LaLiga HDR', 'M+ LaLiga 2 HD'], tdtJson: [] },
  'mplus-hypermotion': { xmltv: ['LaLiga TV Hypermotion HD', 'LaLiga TV Hypermotion 2'], tdtJson: [] },
  'mplus-champions': { xmltv: ['M+ Liga de Campeones HD'], tdtJson: [] },
  'mplus-deportes': { xmltv: ['M+ Deportes HD', 'M+ Baloncesto'], tdtJson: [] },
  'mplus-deportes2': { xmltv: ['M+ Deportes 2 HD', 'M+ Deportes 3'], tdtJson: [] },
  'mplus-golf': { xmltv: ['M+ Golf HD', 'M+ Golf 2 HD'], tdtJson: [] },
  'mplus-eurosport1': { xmltv: ['Eurosport 1 HD'], tdtJson: [] },
  'mplus-eurosport2': { xmltv: ['Eurosport 2'], tdtJson: [] },
  'dazn-laliga': { xmltv: ['DAZN LALIGA EA SPORTS', 'DAZN LaLiga HD', 'DAZN LaLiga 2 HD'], tdtJson: [] },
  'dazn-f1': { xmltv: ['DAZN F1 HD'], tdtJson: [] },
  'dazn-1': { xmltv: ['DAZN 1 HD', 'DAZN 1 BAR', 'DAZN MotoGP', 'DAZN Premier League'], tdtJson: [] },
  'dazn-2': { xmltv: ['DAZN 2 HD', 'DAZN 2 BAR', 'DAZN Baloncesto', 'DAZN Premier League 2'], tdtJson: [] },
  'dazn-3': { xmltv: ['DAZN 3 HD', 'DAZN Bundesliga', 'DAZN Premier League 3'], tdtJson: [] },
  'dazn-4': { xmltv: ['DAZN 4 HD', 'Unbeaten (DAZN)', 'Red Bull TV (DAZN)'], tdtJson: [] },
  'tdt-neox': { xmltv: ['Neox'], tdtJson: ['Neox.TV'] },
  'tdt-fdf': { xmltv: ['Factoría de Ficción'], tdtJson: ['FDF.TV'] },
  'tdt-nova': { xmltv: ['Nova'], tdtJson: ['Nova.TV'] },
  'tdt-energy': { xmltv: ['Energy'], tdtJson: ['Energy.TV'] },
  'tdt-atreseries': { xmltv: ['Atreseries'], tdtJson: ['Atreseries.TV'] },
  'tdt-bemad': { xmltv: ['Be Mad'], tdtJson: ['Bemad.TV'] },
  'tdt-paramount': { xmltv: ['Paramount Network', 'Squirrel TV'], tdtJson: ['Paramount.TV'] },
  'tdt-squirrel': { xmltv: ['Squirrel 2', 'Squirrel TV', 'Squirrel'], tdtJson: ['Squirrel2.TV', 'Squirrel.TV'] },
  'tdt-veo7': { xmltv: ['Veo 7', 'Veo7'], tdtJson: ['Veo7.TV'] },
  'tdt-bomcine': { xmltv: ['BOM Cine'], tdtJson: ['BOM.TV'] },
  'tdt-mega': { xmltv: ['Mega'], tdtJson: ['Mega.TV'] },
  'tdt-dmax': { xmltv: ['DMAX'], tdtJson: ['DMax.TV'] },
  'tdt-divinity': { xmltv: ['Divinity'], tdtJson: ['Divinity.TV'] },
  'tdt-dkiss': { xmltv: ['DKISS'], tdtJson: ['DKISS.TV'] },
  'tdt-ten': { xmltv: ['Ten'], tdtJson: ['TEN.TV'] },
  'tdt-trece': { xmltv: ['TRECE', 'TR3CE'], tdtJson: ['13.TV'] },
  'tdt-24h': { xmltv: ['24 Horas'], tdtJson: ['24Horas.TV'] },
  'tdt-teledeporte': { xmltv: ['Teledeporte'], tdtJson: ['TDP.TV'] },
  'tdt-rmtv': { xmltv: ['Real Madrid TV'], tdtJson: ['RMTV.TV'] },
  'tdt-clan': { xmltv: ['Clan'], tdtJson: ['Clan.TV'] },
  'tdt-boing': { xmltv: ['Boing'], tdtJson: ['Boing.TV'] },
  'tdt-canalsur': { xmltv: ['Canal Sur HD', 'Canal Sur Andalucía'], tdtJson: ['CanalSurA.TV'] },
  'tdt-3cat': { xmltv: ['TV3', 'TV3 Catalunya'], tdtJson: ['TV3.TV'] },
  'tdt-etb1': { xmltv: ['etb1', 'etb1 euskera'], tdtJson: ['ETB1.TV'] },
  'tdt-etb2': { xmltv: ['etb2', 'etb2 euskera'], tdtJson: ['ETB2.TV'] },
  'tdt-tvcanaria': { xmltv: ['TV Canaria', 'Atlántico TV'], tdtJson: ['TVCanaria.TV'] },
  'tdt-tvg': { xmltv: ['TVG', 'TVG Europa'], tdtJson: ['TVG.TV'] },
  'cat-sx3': { xmltv: ['SX3', 'SX3 Catalunya'], tdtJson: ['SX3.TV'] },
  'cat-sx3-live': { xmltv: ['SX3', 'SX3 Catalunya'], tdtJson: ['SX3.TV'] },
  'cat-tv3': { xmltv: ['TV3', 'TV3 Catalunya'], tdtJson: ['TV3.TV'] },
  'cat-tv3-live': { xmltv: ['TV3', 'TV3 Catalunya'], tdtJson: ['TV3.TV'] },
  'cat-esport3-live': { xmltv: ['Esport 3', 'Esport3 Catalunya'], tdtJson: ['Esport3.TV'] },
  'cat-324': { xmltv: ['3CatInfo', '3CatInfo Catalunya'], tdtJson: ['324.TV'] },
  'cat-324-live': { xmltv: ['3CatInfo', '3CatInfo Catalunya'], tdtJson: ['324.TV'] },
  'cat-c33': { xmltv: ['El 33 Catalunya'], tdtJson: ['C33.TV'] },
  'tnt-vivo': { xmltv: ['Warner TV HD', 'Warner TV'], tdtJson: [] },
  'tnt-sports': { xmltv: ['UK | TNT Sports 1'], tdtJson: [] },
  'dsports-1': { xmltv: ['DSPORTS'], tdtJson: [] },
  'dsports-2': { xmltv: ['DSPORTS 2'], tdtJson: [] },
  'dsports-plus': { xmltv: ['DSPORTS+'], tdtJson: [] },
  'dsports-motor': { xmltv: ['DSPORTS Motor'], tdtJson: [] },
  'dsports-fight': { xmltv: ['DSPORTS Fight'], tdtJson: [] },
  'espn-1': { xmltv: ['ESPN', 'ESPN Argentina', 'ESPN International'], tdtJson: [] },
  'espn-2': { xmltv: ['ESPN 2', 'ESPN 2 Argentina'], tdtJson: [] },
  'espn-3': { xmltv: ['ESPN 3', 'ESPN 3 Argentina'], tdtJson: [] },
  'espn-4': { xmltv: ['ESPN 4'], tdtJson: [] },
  'espn-5': { xmltv: ['ESPN Deportes', 'ESPN International'], tdtJson: [] },
  'espn-6': { xmltv: ['ESPN International'], tdtJson: [] },
  'bein-es-n': { xmltv: ['beIN SPORTS en español'], tdtJson: [] },
  'bein-xtra-hd': { xmltv: ['beIN SPORTS XTRA ñ'], tdtJson: [] },
  'bein-1': { xmltv: ['FR · beIN SPORTS 1'], tdtJson: [] },
  'bein-2': { xmltv: ['FR · beIN SPORTS 2'], tdtJson: [] },
  'bein-3': { xmltv: ['FR · beIN SPORTS 3'], tdtJson: [] },
  'bein-4': { xmltv: ['FR · beIN SPORTS MAX 4'], tdtJson: [] },
  'bein-5': { xmltv: ['FR · beIN SPORTS MAX 5'], tdtJson: [] },
  'bein-6': { xmltv: ['FR · beIN SPORTS MAX 6'], tdtJson: [] },
  'bein-7': { xmltv: ['FR · beIN SPORTS MAX 7'], tdtJson: [] },
  'uk-sky-premier': { xmltv: ['UK | Sky Sports Premier League'], tdtJson: [] },
  'uk-sky-f1': { xmltv: ['UK | Sky Sports F1'], tdtJson: [] },
  'uk-sky-action': { xmltv: ['UK | Sky Sports NFL', 'UK | Sky Sports Mix', 'UK | Sky Sports Tennis'], tdtJson: [] },
  'uk-sky-sports-1': { xmltv: ['UK | Sky Sports Main Event', 'UK | Sky Sports Football'], tdtJson: [] },
  'uk-sky-sports-2': { xmltv: ['UK | Sky Sports Mix', 'UK | Sky Sports Cricket', 'UK | Sky Sports Golf'], tdtJson: [] },
  'uk-eurosport-1': { xmltv: ['Eurosport 1 HD'], tdtJson: [] },
  'uk-eurosport-2': { xmltv: ['Eurosport 2'], tdtJson: [] },
  'uk-redbull': { xmltv: ['Red Bull TV (DAZN)', 'Red Bull TV'], tdtJson: [] },
  'uk-fifa-plus': { xmltv: ['FIFA+'], tdtJson: [] },
  'uk-fifa-women': { xmltv: ['FIFA+'], tdtJson: [] },
  'uk-bellator-mma': { xmltv: ['MMA TV', 'FightSports'], tdtJson: [] },
  'uk-dazn-combat': { xmltv: ['FightSports', 'Fight Box HD'], tdtJson: [] },
  'uk-sky-racing': { xmltv: ['UK | Sky Sports Racing'], tdtJson: [] },
};

export interface EpgVerifiedBroadcast {
  channelId: string;
  channelLabel: string;
  lang: 'ES' | 'EN';
  sourceUrl: string;
  resolverType: 'sports_channel' | 'tdt_hls';
  programTitle: string;
}

export const EPG_CHANNEL_STREAM_INFO: Record<
  string,
  { label: string; lang: 'ES' | 'EN'; sourceUrl: string; resolverType: 'sports_channel' | 'tdt_hls' }
> = {
  'mplus-laliga': {
    label: 'M+ LaLiga HD',
    lang: 'ES',
    sourceUrl: 'https://streamxhd.sbs/live1.php?stream=mlaliga',
    resolverType: 'sports_channel',
  },
  'mplus-canal': {
    label: 'Movistar Plus+ HD',
    lang: 'ES',
    sourceUrl: 'https://pig.footunder.online/stream/537',
    resolverType: 'sports_channel',
  },
  'dazn-laliga': {
    label: 'DAZN LaLiga HD',
    lang: 'ES',
    sourceUrl: 'https://pig.footunder.online/stream/84',
    resolverType: 'sports_channel',
  },
  'mplus-champions': {
    label: 'M+ Liga de Campeones HD',
    lang: 'ES',
    sourceUrl: 'https://streamxhd.sbs/live1.php?stream=mligacampeones',
    resolverType: 'sports_channel',
  },
  'dazn-1': {
    label: 'DAZN 1 HD',
    lang: 'ES',
    sourceUrl: 'https://pig.footunder.online/stream/445',
    resolverType: 'sports_channel',
  },
  'dazn-2': {
    label: 'DAZN 2 HD',
    lang: 'ES',
    sourceUrl: 'https://pig.footunder.online/stream/446',
    resolverType: 'sports_channel',
  },
  'dazn-3': {
    label: 'DAZN 3 HD',
    lang: 'ES',
    sourceUrl: 'https://pig.footunder.online/stream/447',
    resolverType: 'sports_channel',
  },
  'dazn-4': {
    label: 'DAZN 4 HD',
    lang: 'ES',
    sourceUrl: 'https://pig.footunder.online/stream/448',
    resolverType: 'sports_channel',
  },
  'dazn-f1': {
    label: 'DAZN F1 HD',
    lang: 'ES',
    sourceUrl: 'https://footunder.online/tvtodo/daznf1.php',
    resolverType: 'sports_channel',
  },
  'tdt-teledeporte': {
    label: 'Teledeporte RTVE HD',
    lang: 'ES',
    sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
    resolverType: 'tdt_hls',
  },
  'tdt-la1': {
    label: 'La 1 RTVE 1080p',
    lang: 'ES',
    sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
    resolverType: 'tdt_hls',
  },
  'cat-esport3-live': {
    label: 'Esport3 HD',
    lang: 'ES',
    sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-origin/esport3-hls/master.m3u8',
    resolverType: 'tdt_hls',
  },
  'mplus-vamos': {
    label: 'Movistar Vamos HD',
    lang: 'ES',
    sourceUrl: 'https://pig.footunder.online/stream/526',
    resolverType: 'sports_channel',
  },
  'mplus-hypermotion': {
    label: 'LaLiga Hypermotion HD',
    lang: 'ES',
    sourceUrl: 'https://footunder.online/tvtodo/laliga2.php',
    resolverType: 'sports_channel',
  },
  'mplus-deportes': {
    label: 'M+ Deportes HD',
    lang: 'ES',
    sourceUrl: 'https://pig.footunder.online/stream/438',
    resolverType: 'sports_channel',
  },
  'tdt-rmtv': {
    label: 'Real Madrid TV HD',
    lang: 'ES',
    sourceUrl: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8',
    resolverType: 'tdt_hls',
  },
  'uk-sky-premier': {
    label: 'Sky Sports Premier League (UK)',
    lang: 'EN',
    sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_PREMIER_LEAGUE/index.m3u8',
    resolverType: 'tdt_hls',
  },
  'uk-sky-sports-1': {
    label: 'Sky Sports 1 (UK 1080p)',
    lang: 'EN',
    sourceUrl: 'http://45.228.234.9:8000/play/a06b/index.m3u8',
    resolverType: 'tdt_hls',
  },
  'uk-sky-sports-2': {
    label: 'Sky Sports 2 (UK 1080p)',
    lang: 'EN',
    sourceUrl: 'http://200.115.120.1:8000/play/ca82266/index.m3u8',
    resolverType: 'tdt_hls',
  },
  'tnt-sports': {
    label: 'TNT Sports UK',
    lang: 'EN',
    sourceUrl: 'https://streamxhd.sbs/live2.php?stream=tntsports',
    resolverType: 'sports_channel',
  },
};

const TEAM_EPG_KEYWORD_ALIASES: Record<string, string[]> = {
  vienna: ['vienna', 'austria wien', 'viena', 'fkv'],
  austria_wien: ['austria wien', 'vienna', 'viena', 'austria de viena'],
  bayern: ['bayern', 'munchen', 'munich', 'fcb'],
  bayern_munich: ['bayern', 'munchen', 'munich'],
  bayern_munchen: ['bayern', 'munchen', 'munich'],
  koge: ['koge', 'hb koge', 'koege'],
  hb_koge: ['hb koge', 'koge', 'koege'],
  paris_fc: ['paris fc', 'pfc'],
  lyon: ['lyon', 'olympique lyon'],
  servette: ['servette', 'chenois'],
  real_madrid: ['real madrid', 'madrid'],
  madrid: ['real madrid'],
  barcelona: ['barcelona', 'barca', 'fc barcelona'],
  barca: ['barcelona', 'barca'],
  atletico_madrid: ['atletico madrid', 'atletico de madrid', 'at. madrid', 'atleti'],
  celta: ['celta', 'celta vigo', 'celta de vigo', 'rc celta'],
  celta_vigo: ['celta', 'celta vigo', 'rc celta'],
  alaves: ['alaves', 'deportivo alaves'],
  deportivo_alaves: ['alaves', 'deportivo alaves'],
  deportivo_la_coruna: ['deportivo la coruna', 'deportivo a coruna', 'coruna'],
  deportivo_a_coruna: ['deportivo la coruna', 'deportivo a coruna', 'coruna'],
  rayo_vallecano: ['rayo', 'rayo vallecano'],
  osasuna: ['osasuna', 'ca osasuna'],
  betis: ['betis', 'real betis'],
  sevilla: ['sevilla', 'sevilla fc'],
  valencia: ['valencia', 'valencia cf'],
  espanyol: ['espanyol', 'rcd espanyol'],
  mallorca: ['mallorca', 'rcd mallorca'],
  athletic_club: ['athletic', 'athletic bilbao', 'athletic club'],
  real_sociedad: ['real sociedad', 'la real'],
  manchester_united: ['manchester united', 'manchester utd', 'man utd'],
  manchester_city: ['manchester city', 'man city'],
  eintracht_frankfurt: ['eintracht', 'frankfurt', 'eintracht frankfurt'],
  psv_eindhoven: ['psv', 'psv eindhoven'],
  espana: ['espana', 'spain'],
  spain: ['espana', 'spain'],
};

function extractTokensForEpgMatch(name: string): string[] {
  const norm = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!norm) return [];
  const key = norm.replace(/\s+/g, '_');
  const aliases = TEAM_EPG_KEYWORD_ALIASES[key] || [];
  const words = norm.split(' ').filter(
    (w) =>
      w.length >= 4 &&
      !['club', 'real', 'city', 'united', 'women', 'femenino', 'deportivo', 'futbol'].includes(w)
  );
  return Array.from(new Set([norm, ...aliases, ...words]));
}

export function getCachedEpgStore(): Map<string, RawEpgEvent[]> | null {
  return cachedEpgStore?.byChannel || null;
}

const EPG_NON_LIVE_REPLAY_RE =
  /\b(resumen|resumenes|highlights|historias|classic|classics|retro|legends|magazine|el dia despues|el tercer tiempo|previa\b|postpartido|tertulia|analisis|reportaje|un dia de partit|la transmissio|tiempo de juego|carrusel|radioestadio|review|interview|xtra time|premier corner)\b/i;

const EPG_NON_FIRST_TEAM_CATEGORY_RE =
  /\b(u19|u21|u20|u17|sub-?\d{2}|juvenil|youth league|femen[ií]|femenin[oa]|women|liga f|baloncesto|basquet|básquet|acb|euroliga|euroleague|futsal|futbol sala|fútbol sala|balonmano|handbol|hockey)\b/i;

export function findEpgVerifiedBroadcastersForFixture(
  homeTeam: string,
  awayTeam: string,
  kickoffMs: number,
  epgStoreOverride?: Map<string, RawEpgEvent[]>
): EpgVerifiedBroadcast[] {
  const store = epgStoreOverride || cachedEpgStore?.byChannel;
  if (!store || store.size === 0) return [];

  const homeTokens = extractTokensForEpgMatch(homeTeam);
  const awayTokens = extractTokensForEpgMatch(awayTeam);
  if (homeTokens.length === 0 || awayTokens.length === 0) return [];
  const fixtureHasSpecialCategory = EPG_NON_FIRST_TEAM_CATEGORY_RE.test(`${homeTeam} ${awayTeam}`);

  const targetTime = kickoffMs > 0 ? kickoffMs : Date.now();
  // Live match program must actually overlap kickoff (+30m..+95m) and start within 60m before kickoff
  const earliestStart = targetTime - 60 * 60 * 1000;
  const latestStart = targetTime + 35 * 60 * 1000;
  const minStopMs = targetTime + 35 * 60 * 1000;

  const channelsToCheck = [
    'dazn-laliga',
    'mplus-laliga',
    'mplus-canal',
    'dazn-1',
    'dazn-2',
    'mplus-champions',
    'dazn-3',
    'dazn-4',
    'tdt-teledeporte',
    'tdt-la1',
    'cat-esport3-live',
    'mplus-vamos',
    'mplus-hypermotion',
    'tdt-rmtv',
    'uk-sky-premier',
    'uk-sky-sports-1',
    'uk-sky-sports-2',
    'tnt-sports',
  ];

  const found: EpgVerifiedBroadcast[] = [];
  for (const chId of channelsToCheck) {
    const streamDef = EPG_CHANNEL_STREAM_INFO[chId];
    if (!streamDef) continue;
    const events = store.get(chId) || [];
    for (const ev of events) {
      if (ev.startMs < earliestStart || ev.startMs > latestStart || ev.stopMs < minStopMs) {
        continue;
      }
      const evFullText = `${ev.title} ${ev.subtitle || ''} ${ev.description || ''}`;
      if (EPG_NON_LIVE_REPLAY_RE.test(evFullText)) continue;
      if (!fixtureHasSpecialCategory && EPG_NON_FIRST_TEAM_CATEGORY_RE.test(evFullText)) continue;
      const hay = evFullText
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      const matchHome = homeTokens.some((tok) => hay.includes(tok));
      const matchAway = awayTokens.some((tok) => hay.includes(tok));

      if (matchHome && matchAway) {
        found.push({
          channelId: chId,
          channelLabel: streamDef.label,
          lang: streamDef.lang,
          sourceUrl: streamDef.sourceUrl,
          resolverType: streamDef.resolverType,
          programTitle: ev.title,
        });
        break;
      }
    }
  }

  return found;
}

export function findEpgVerifiedBroadcasterForFixture(
  homeTeam: string,
  awayTeam: string,
  kickoffMs: number,
  epgStoreOverride?: Map<string, RawEpgEvent[]>
): EpgVerifiedBroadcast | null {
  return findEpgVerifiedBroadcastersForFixture(homeTeam, awayTeam, kickoffMs, epgStoreOverride)[0] || null;
}

const madridTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatMadridHHMM(ms: number): string {
  try {
    return madridTimeFormatter.format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseXmltvTimeMs(raw: string): number {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/);
  if (!m) return 0;
  const [, y, mo, d, h, mi, s, sign, offH, offM] = m;
  const utcBase = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );
  if (!sign) return utcBase;
  const offsetMs = (Number(offH) * 60 + Number(offM)) * 60_000 * (sign === '+' ? 1 : -1);
  return utcBase - offsetMs;
}

function isSportsProgramText(title: string, category: string): boolean {
  const txt = `${title} ${category}`.toLowerCase();
  return /fútbol|futbol|laliga|champions|premier|bundesliga|f1|fórmula 1|formula 1|motogp|baloncesto|nba|acb|euroliga|tenis|golf|ciclismo|boxeo|ufc|deporte|directo:\s| vs | - /i.test(
    txt
  );
}

let cachedEpgStore: { byChannel: Map<string, RawEpgEvent[]>; fetchedAt: number } | null = null;
let lastEpgFailureAt = 0;
let inflightEpgPromise: Promise<Map<string, RawEpgEvent[]>> | null = null;

const XMLTV_EPG_MIRRORS = [
  'https://cdn.jsdelivr.net/gh/davidmuma/EPG_dobleM@master/guiatv_sincolor.xml.gz',
  'https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiatv_sincolor.xml.gz',
];

function openIpv4HttpsStream(
  targetUrl: string,
  timeoutMs: number,
  redirectsLeft = 3
): Promise<import('http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      targetUrl,
      {
        family: 4,
        timeout: timeoutMs,
        headers: {
          'User-Agent': CHROME_UA,
          Accept: '*/*',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          openIpv4HttpsStream(nextUrl, timeoutMs, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        resolve(res);
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout (${timeoutMs}ms)`));
    });
    req.on('error', reject);
  });
}

async function fetchIpv4Json(targetUrl: string, timeoutMs: number): Promise<any> {
  const res = await openIpv4HttpsStream(targetUrl, timeoutMs);
  const chunks: Buffer[] = [];
  for await (const chunk of res) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function loadSpanishEpgSchedule(): Promise<Map<string, RawEpgEvent[]>> {
  if (cachedEpgStore && Date.now() - cachedEpgStore.fetchedAt < 20 * 60 * 1000) {
    return cachedEpgStore.byChannel;
  }
  if (Date.now() - lastEpgFailureAt < 2 * 60 * 1000) {
    return cachedEpgStore?.byChannel || new Map();
  }
  if (inflightEpgPromise) return inflightEpgPromise;

  inflightEpgPromise = (async () => {
    const result = new Map<string, RawEpgEvent[]>();
    const now = Date.now();
    const minWindow = now - 6 * 60 * 60 * 1000;
    const maxWindow = now + 7 * 24 * 60 * 60 * 1000;

    const xmltvToOurIds = new Map<string, { ourId: string; priority: number }[]>();
    const jsonToOurIds = new Map<string, string[]>();

    for (const [ourId, cfg] of Object.entries(EPG_CHANNEL_MAPPING)) {
      cfg.xmltv.forEach((xName, idx) => {
        const list = xmltvToOurIds.get(xName) || [];
        list.push({ ourId, priority: idx });
        xmltvToOurIds.set(xName, list);
      });
      cfg.tdtJson.forEach((jName) => {
        const list = jsonToOurIds.get(jName.toLowerCase()) || [];
        list.push(ourId);
        jsonToOurIds.set(jName.toLowerCase(), list);
      });
    }

    // 1. Stream-gunzip EPG_dobleM via IPv4 + CDN mirror fallback
    for (const mirrorUrl of XMLTV_EPG_MIRRORS) {
      try {
        const xmlByPriority = new Map<string, { priority: number; events: RawEpgEvent[] }>();
        const res = await openIpv4HttpsStream(mirrorUrl, 9_000);
        const gunzip = zlib.createGunzip();
        gunzip.setEncoding('utf8');
        let leftover = '';

        await new Promise<void>((resolve) => {
          gunzip.on('data', (chunk: string) => {
            leftover += chunk;
            let endIdx = leftover.indexOf('</programme>');
            while (endIdx !== -1) {
              const block = leftover.slice(0, endIdx + 12);
              leftover = leftover.slice(endIdx + 12);
              endIdx = leftover.indexOf('</programme>');

              const pStart = block.indexOf('<programme ');
              if (pStart === -1) continue;
              const tagEnd = block.indexOf('>', pStart);
              if (tagEnd === -1) continue;
              const header = block.slice(pStart, tagEnd);

              const chMatch = header.match(/channel="([^"]+)"/);
              if (!chMatch) continue;
              const chName = decodeXmlEntities(chMatch[1]);
              const targets = xmltvToOurIds.get(chName);
              if (!targets) continue;

              const startMatch = header.match(/start="([^"]+)"/);
              const stopMatch = header.match(/stop="([^"]+)"/);
              if (!startMatch || !stopMatch) continue;

              const startMs = parseXmltvTimeMs(startMatch[1]);
              const stopMs = parseXmltvTimeMs(stopMatch[1]);
              if (!startMs || !stopMs || stopMs < minWindow || startMs > maxWindow) continue;

              const body = block.slice(tagEnd + 1);
              const titleM = body.match(/<title[^>]*>([\s\S]*?)<\/title>/);
              if (!titleM) continue;
              const title = decodeXmlEntities(titleM[1]);
              if (!title) continue;

              const subM = body.match(/<sub-title[^>]*>([\s\S]*?)<\/sub-title>/);
              const descM = body.match(/<desc[^>]*>([\s\S]*?)<\/desc>/);
              const catM = body.match(/<category[^>]*>([\s\S]*?)<\/category>/);
              const iconM = body.match(/<icon[^>]+src="([^"]+)"/);

              const category = catM ? decodeXmlEntities(catM[1]) : undefined;
              const ev: RawEpgEvent = {
                title,
                subtitle: subM ? decodeXmlEntities(subM[1]) : undefined,
                description: descM ? decodeXmlEntities(descM[1]) : undefined,
                category,
                icon: iconM ? iconM[1] : undefined,
                startMs,
                stopMs,
                isLiveSport: isSportsProgramText(title, category || ''),
              };

              for (const t of targets) {
                const cur = xmlByPriority.get(t.ourId);
                if (!cur || t.priority < cur.priority) {
                  xmlByPriority.set(t.ourId, { priority: t.priority, events: [ev] });
                } else if (t.priority === cur.priority) {
                  cur.events.push(ev);
                }
              }
            }
            if (leftover.length > 250_000) {
              const lastProg = leftover.lastIndexOf('<programme ');
              leftover = lastProg !== -1 ? leftover.slice(lastProg) : leftover.slice(-60_000);
            }
          });
          gunzip.on('end', () => resolve());
          gunzip.on('error', () => resolve());
          res.on('error', () => resolve());
          res.pipe(gunzip);
        });

        for (const [ourId, data] of xmlByPriority.entries()) {
          if (data.events.length > 0) {
            data.events.sort((a, b) => a.startMs - b.startMs);
            result.set(ourId, data.events);
          }
        }
        if (result.size > 0) break;
      } catch {
        // Try next XMLTV mirror or fall back to TDTChannels JSON
      }
    }

    // 2. Fallback / complement from TDTChannels JSON EPG
    try {
      const missingJsonTargets = Array.from(jsonToOurIds.values()).some((ids) =>
        ids.some((id) => !result.has(id))
      );
      if (missingJsonTargets) {
        const jList: any[] = await fetchIpv4Json('https://www.tdtchannels.com/epg/TV.json', 8_000);
        if (Array.isArray(jList)) {
            for (const entry of jList) {
              const nameKey = String(entry?.name || '').toLowerCase();
              const ourIds = jsonToOurIds.get(nameKey);
              if (!ourIds || !Array.isArray(entry?.events)) continue;
              const parsed: RawEpgEvent[] = [];
              for (const ev of entry.events) {
                const startMs = Number(ev.hi || 0) * 1000;
                const stopMs = Number(ev.hf || 0) * 1000;
                if (!startMs || !stopMs || stopMs < minWindow || startMs > maxWindow) continue;
                const title = String(ev.t || '').trim();
                if (!title) continue;
                const category = String(ev.g || '').trim() || undefined;
                parsed.push({
                  title,
                  description: String(ev.d || '').trim() || undefined,
                  category,
                  startMs,
                  stopMs,
                  isLiveSport: isSportsProgramText(title, category || ''),
                });
              }
              if (parsed.length > 0) {
                parsed.sort((a, b) => a.startMs - b.startMs);
                for (const oid of ourIds) {
                  if (!result.has(oid)) {
                    result.set(oid, parsed);
                  }
                }
              }
            }
          }
        }
    } catch {
      // keep XMLTV results
    }

    if (result.size > 0) {
      cachedEpgStore = { byChannel: result, fetchedAt: Date.now() };
      lastEpgFailureAt = 0;
    } else {
      lastEpgFailureAt = Date.now();
    }
    return result.size > 0 ? result : cachedEpgStore?.byChannel || result;
  })().finally(() => {
    inflightEpgPromise = null;
  });

  return inflightEpgPromise;
}

export function registerEpgRoutes(app: Express): void {
  setTimeout(() => {
    loadSpanishEpgSchedule().catch(() => {});
  }, 800);

  app.get('/api/epg/live', async (_req, res) => {
    try {
      const store = await loadSpanishEpgSchedule();
      const now = Date.now();
      const epgMap: Record<string, any> = {};

      const allKnownChannelIds = Object.keys(EPG_CHANNEL_MAPPING);
      for (const chId of allKnownChannelIds) {
        const events = store.get(chId) || [];
        if (events.length === 0) continue;

        let nowIdx = events.findIndex((e) => e.startMs <= now && e.stopMs > now);
        if (nowIdx === -1) {
          nowIdx = events.findIndex((e) => e.startMs > now);
          if (nowIdx > 0) nowIdx = nowIdx - 1;
        }

        const activeEv =
          nowIdx >= 0 && events[nowIdx] && events[nowIdx].stopMs > now ? events[nowIdx] : null;
        const nextIdx = activeEv
          ? nowIdx + 1
          : events.findIndex((e) => e.startMs > now);
        const nextEv = nextIdx >= 0 && nextIdx < events.length ? events[nextIdx] : null;

        const upcomingSlice = events
          .filter((e) => e.stopMs > now)
          .slice(0, 18)
          .map((e) => ({
            title: e.title,
            subtitle: e.subtitle,
            description: e.description,
            category: e.category,
            icon: e.icon,
            startMs: e.startMs,
            stopMs: e.stopMs,
            startLabel: formatMadridHHMM(e.startMs),
            stopLabel: formatMadridHHMM(e.stopMs),
            isLiveSport: e.isLiveSport,
          }));

        let progressPct = 0;
        let remainingMin = 0;
        if (activeEv) {
          const dur = Math.max(1, activeEv.stopMs - activeEv.startMs);
          progressPct = Math.max(2, Math.min(99, Math.round(((now - activeEv.startMs) / dur) * 100)));
          remainingMin = Math.max(1, Math.ceil((activeEv.stopMs - now) / 60_000));
        }

        epgMap[chId] = {
          channelId: chId,
          now: activeEv
            ? {
                title: activeEv.title,
                subtitle: activeEv.subtitle,
                description: activeEv.description,
                category: activeEv.category,
                icon: activeEv.icon,
                startMs: activeEv.startMs,
                stopMs: activeEv.stopMs,
                startLabel: formatMadridHHMM(activeEv.startMs),
                stopLabel: formatMadridHHMM(activeEv.stopMs),
                isLiveSport: activeEv.isLiveSport,
              }
            : null,
          next: nextEv
            ? {
                title: nextEv.title,
                subtitle: nextEv.subtitle,
                description: nextEv.description,
                category: nextEv.category,
                icon: nextEv.icon,
                startMs: nextEv.startMs,
                stopMs: nextEv.stopMs,
                startLabel: formatMadridHHMM(nextEv.startMs),
                stopLabel: formatMadridHHMM(nextEv.stopMs),
                isLiveSport: nextEv.isLiveSport,
              }
            : null,
          upcoming: upcomingSlice,
          progressPct,
          remainingMin,
        };
      }

      res.setHeader('Cache-Control', 'public, max-age=45');
      res.json({
        success: true,
        serverTimeMs: now,
        madridTimeLabel: formatMadridHHMM(now),
        channelsCount: Object.keys(epgMap).length,
        epg: epgMap,
      });
    } catch (err) {
      logger.warn({ err }, '/api/epg/live error');
      res.json({ success: true, serverTimeMs: Date.now(), epg: {} });
    }
  });
}
