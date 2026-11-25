import crypto from 'crypto';
import { CHROME_UA, type TrackRecord } from '../../extractors/httpHelpers.ts';

const MADRID_TIME_FMT = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const MADRID_DATE_KEY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
});

export function parseStreamXhdKickoffMs(rawTime: string): number {
  const s = String(rawTime || '').trim();
  if (!s) return 0;
  // ISO string with explicit timezone offset or Z
  if (/T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const parsed = Date.parse(s);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  // Unzoned 'YYYY-MM-DD HH:mm' on StreamXHD is in US/Eastern (-05:00)
  const dateTimeM = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (dateTimeM) {
    const parsed = Date.parse(`${dateTimeM[1]}T${dateTimeM[2]}:${dateTimeM[3] || '00'}-05:00`);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function detectSportKind(text: string): 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other' {
  const lower = text.toLowerCase();
  if (/baloncesto|basket|nba|eurocup|euroliga|acb|ncaa/.test(lower)) return 'basketball';
  if (/tenis|tennis|atp|wta|roland|wimbledon/.test(lower)) return 'tennis';
  if (/f1|formula|fórmula|motogp|motor|nascar|rally|indy/.test(lower)) return 'motor';
  if (/\b(hockey|ice\s*hockey|nhl|khl|nfl|american\s*football|mlb|baseball|beisbol|béisbol|ufc|mma|boxeo|boxing|wwe|rugby|ciclismo|cycling|padel|pádel|handball|balonmano|volleyball|voleibol|golf)\b/.test(lower)) {
    return 'other';
  }
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
    const nowMs = Date.now();
    const todayMadridKey = MADRID_DATE_KEY_FMT.format(new Date(nowMs)).replace(/-/g, '');

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
              const sportName = String(sp?.name || '');
              const mappedSport: 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other' =
                (sportId === 'football' || sportId === 'soccer') &&
                !/american|nfl|rugby|hockey|nhl/i.test(sportName)
                  ? 'soccer'
                  : sportId === 'basketball'
                  ? 'basketball'
                  : sportId === 'tennis'
                  ? 'tennis'
                  : sportId === 'motorsport' || sportId === 'f1'
                  ? 'motor'
                  : detectSportKind(`${sportId} ${sportName}`);

              for (const lg of sp?.leagues || []) {
                const leagueName = String(lg?.name || 'En Directo').trim();
                const effectiveSport =
                  mappedSport === 'soccer' ? detectSportKind(`${leagueName} ${sportName}`) : mappedSport;

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
                  const kickoffMs = parseStreamXhdKickoffMs(rawTime);
                  // Drop stale agenda entries that ended hours ago (e.g. yesterday's finished schedule)
                  if (kickoffMs > 0 && nowMs - kickoffMs > 3.5 * 60 * 60 * 1000) {
                    continue;
                  }

                  const timeMatch = rawTime.match(/(\d{1,2}:\d{2})/);
                  const timeStr =
                    kickoffMs > 0
                      ? MADRID_TIME_FMT.format(new Date(kickoffMs))
                      : timeMatch
                      ? timeMatch[1]
                      : 'EN VIVO';
                  const kickoffDateKey =
                    kickoffMs > 0
                      ? MADRID_DATE_KEY_FMT.format(new Date(kickoffMs)).replace(/-/g, '')
                      : todayMadridKey;
                  const isLiveNow =
                    kickoffMs > 0
                      ? nowMs >= kickoffMs - 5 * 60_000 && nowMs - kickoffMs <= 3 * 60 * 60 * 1000
                      : true;

                  const key = `sxhd-${leagueName}-${timeStr}-${matchTitle}`;
                  liveGrouped.set(key, {
                    id: `live-${crypto.createHash('sha1').update(key).digest('base64url').slice(0, 16)}`,
                    title: matchTitle,
                    homeTeam,
                    awayTeam,
                    competition: leagueName,
                    sport: effectiveSport,
                    time: timeStr,
                    kickoffMs: kickoffMs || undefined,
                    isLive: isLiveNow,
                    is247Channel: false,
                    channels: validTracks,
                  });

                  if (effectiveSport === 'soccer' && homeTeam && awayTeam) {
                    streamXhdFootball.push({
                      homeTeam,
                      awayTeam,
                      homeLogo: String(ev?.homeLogo || '').trim() || undefined,
                      awayLogo: String(ev?.awayLogo || '').trim() || undefined,
                      leagueName,
                      code: String(ev?.code || '').trim(),
                      rawTime,
                      timeStr,
                      kickoffMs,
                      kickoffDateKey,
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
