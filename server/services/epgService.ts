/**
 * @module server/services/epgService
 * @description Real-time Spanish XMLTV + TDTChannels EPG loader, channel ID mapping, and `/api/epg/live` route.
 */
import zlib from 'zlib';
import { Readable } from 'stream';
import type { Express } from 'express';
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
  'mplus-champions': { xmltv: ['M+ Liga de Campeones HD', 'M+ Liga de Campeones 2 HD'], tdtJson: [] },
  'mplus-deportes': { xmltv: ['M+ Deportes HD', 'M+ Baloncesto'], tdtJson: [] },
  'mplus-deportes2': { xmltv: ['M+ Deportes 2 HD', 'M+ Deportes 3'], tdtJson: [] },
  'mplus-golf': { xmltv: ['M+ Golf HD', 'M+ Golf 2 HD'], tdtJson: [] },
  'mplus-eurosport1': { xmltv: ['Eurosport 1 HD'], tdtJson: [] },
  'mplus-eurosport2': { xmltv: ['Eurosport 2'], tdtJson: [] },
  'dazn-laliga': { xmltv: ['DAZN LaLiga HD', 'DAZN LaLiga 2 HD'], tdtJson: [] },
  'dazn-f1': { xmltv: ['DAZN F1 HD'], tdtJson: [] },
  'dazn-1': { xmltv: ['DAZN 1 HD', 'DAZN MotoGP'], tdtJson: [] },
  'dazn-2': { xmltv: ['DAZN 2 HD', 'DAZN Baloncesto'], tdtJson: [] },
  'dazn-3': { xmltv: ['DAZN 3 HD', 'DAZN Bundesliga'], tdtJson: [] },
  'dazn-4': { xmltv: ['DAZN 4 HD', 'Unbeaten (DAZN)', 'Red Bull TV (DAZN)'], tdtJson: [] },
  'tdt-neox': { xmltv: ['Neox'], tdtJson: ['Neox.TV'] },
  'tdt-fdf': { xmltv: ['Factoría de Ficción'], tdtJson: ['FDF.TV'] },
  'tdt-nova': { xmltv: ['Nova'], tdtJson: ['Nova.TV'] },
  'tdt-energy': { xmltv: ['Energy'], tdtJson: ['Energy.TV'] },
  'tdt-atreseries': { xmltv: ['Atreseries'], tdtJson: ['Atreseries.TV'] },
  'tdt-bemad': { xmltv: ['Be Mad'], tdtJson: ['Bemad.TV'] },
  'tdt-paramount': { xmltv: ['Paramount Network', 'Squirrel TV'], tdtJson: ['Paramount.TV'] },
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
  'cat-sx3': { xmltv: ['SX3', 'SX3 Catalunya'], tdtJson: ['SX3.TV'] },
  'cat-sx3-live': { xmltv: ['SX3', 'SX3 Catalunya'], tdtJson: ['SX3.TV'] },
  'cat-tv3': { xmltv: ['TV3', 'TV3 Catalunya'], tdtJson: ['TV3.TV'] },
  'cat-tv3-live': { xmltv: ['TV3', 'TV3 Catalunya'], tdtJson: ['TV3.TV'] },
  'cat-esport3-live': { xmltv: ['Esport 3', 'Esport3 Catalunya'], tdtJson: ['Esport3.TV'] },
  'cat-324': { xmltv: ['3CatInfo', '3CatInfo Catalunya'], tdtJson: ['324.TV'] },
  'cat-324-live': { xmltv: ['3CatInfo', '3CatInfo Catalunya'], tdtJson: ['324.TV'] },
  'cat-c33': { xmltv: ['El 33 Catalunya'], tdtJson: ['C33.TV'] },
  'tnt-vivo': { xmltv: ['Warner TV HD', 'Warner TV'], tdtJson: [] },
  'tnt-sports': { xmltv: ['UK | TNT Sports 1', 'UK | TNT Sports 2'], tdtJson: [] },
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

export const EPG_CHANNEL_STREAM_INFO: Record<
  string,
  { label: string; sourceUrl: string; resolverType: 'sports_channel' | 'tdt_hls' }
> = {
  'mplus-laliga': {
    label: 'M+ LaLiga HD',
    sourceUrl: 'https://pig.footunder.online/stream/84',
    resolverType: 'sports_channel',
  },
  'dazn-laliga': {
    label: 'DAZN LaLiga HD',
    sourceUrl: 'https://pig.footunder.online/stream/84',
    resolverType: 'sports_channel',
  },
  'mplus-champions': {
    label: 'M+ Liga de Campeones HD',
    sourceUrl: 'https://streamxhd.sbs/live1.php?stream=mligacampeones',
    resolverType: 'sports_channel',
  },
  'dazn-1': {
    label: 'DAZN 1 HD',
    sourceUrl: 'https://pig.footunder.online/stream/445',
    resolverType: 'sports_channel',
  },
  'dazn-2': {
    label: 'DAZN 2 HD',
    sourceUrl: 'https://pig.footunder.online/stream/446',
    resolverType: 'sports_channel',
  },
  'dazn-3': {
    label: 'DAZN 3 HD',
    sourceUrl: 'https://pig.footunder.online/stream/447',
    resolverType: 'sports_channel',
  },
  'dazn-4': {
    label: 'DAZN 4 HD',
    sourceUrl: 'https://pig.footunder.online/stream/448',
    resolverType: 'sports_channel',
  },
  'dazn-f1': {
    label: 'DAZN F1 HD',
    sourceUrl: 'https://pig.footunder.online/stream/436',
    resolverType: 'sports_channel',
  },
  'tdt-teledeporte': {
    label: 'Teledeporte RTVE HD',
    sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
    resolverType: 'tdt_hls',
  },
  'tdt-la1': {
    label: 'La 1 RTVE 1080p',
    sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
    resolverType: 'tdt_hls',
  },
  'mplus-vamos': {
    label: 'Movistar Vamos HD',
    sourceUrl: 'https://pig.footunder.online/stream/526',
    resolverType: 'sports_channel',
  },
  'mplus-hypermotion': {
    label: 'LaLiga Hypermotion HD',
    sourceUrl: 'https://footunder.online/tvtodo/laliga2.php',
    resolverType: 'sports_channel',
  },
  'mplus-deportes': {
    label: 'M+ Deportes HD',
    sourceUrl: 'https://pig.footunder.online/stream/435',
    resolverType: 'sports_channel',
  },
  'tdt-rmtv': {
    label: 'Real Madrid TV HD',
    sourceUrl: 'https://pig.footunder.online/stream/516',
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
  atletico_madrid: ['atletico madrid', 'atletico de madrid', 'atletico'],
  celta: ['celta', 'celta vigo', 'celta de vigo'],
  celta_vigo: ['celta', 'celta vigo'],
  osasuna: ['osasuna', 'ca osasuna'],
  betis: ['betis', 'real betis'],
  sevilla: ['sevilla', 'sevilla fc'],
  valencia: ['valencia', 'valencia cf'],
  espanyol: ['espanyol', 'rcd espanyol'],
  mallorca: ['mallorca', 'rcd mallorca'],
  athletic_club: ['athletic', 'athletic bilbao', 'bilbao'],
  real_sociedad: ['real sociedad', 'la real'],
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

export function findEpgVerifiedBroadcasterForFixture(
  homeTeam: string,
  awayTeam: string,
  kickoffMs: number,
  epgStoreOverride?: Map<string, RawEpgEvent[]>
): {
  channelId: string;
  channelLabel: string;
  sourceUrl: string;
  resolverType: 'sports_channel' | 'tdt_hls';
  programTitle: string;
} | null {
  const store = epgStoreOverride || cachedEpgStore?.byChannel;
  if (!store || store.size === 0) return null;

  const homeTokens = extractTokensForEpgMatch(homeTeam);
  const awayTokens = extractTokensForEpgMatch(awayTeam);
  if (homeTokens.length === 0 || awayTokens.length === 0) return null;

  const targetTime = kickoffMs > 0 ? kickoffMs : Date.now();
  // Window: program starts within 2 hours before or 1 hour after kickoff
  const windowStart = targetTime - 2 * 60 * 60 * 1000;
  const windowEnd = targetTime + 2.5 * 60 * 60 * 1000;

  // Check sports channels in priority order
  const channelsToCheck = [
    'dazn-laliga',
    'mplus-laliga',
    'dazn-1',
    'dazn-2',
    'mplus-champions',
    'dazn-3',
    'dazn-4',
    'tdt-teledeporte',
    'tdt-la1',
    'mplus-vamos',
    'mplus-hypermotion',
    'tdt-rmtv',
  ];

  for (const chId of channelsToCheck) {
    const streamDef = EPG_CHANNEL_STREAM_INFO[chId];
    if (!streamDef) continue;
    const events = store.get(chId) || [];
    for (const ev of events) {
      if (ev.stopMs < windowStart || ev.startMs > windowEnd) continue;
      const hay = `${ev.title} ${ev.subtitle || ''} ${ev.description || ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      const matchHome = homeTokens.some((tok) => hay.includes(tok));
      const matchAway = awayTokens.some((tok) => hay.includes(tok));

      if (matchHome && matchAway) {
        return {
          channelId: chId,
          channelLabel: streamDef.label,
          sourceUrl: streamDef.sourceUrl,
          resolverType: streamDef.resolverType,
          programTitle: ev.title,
        };
      }
    }
  }

  return null;
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
let inflightEpgPromise: Promise<Map<string, RawEpgEvent[]>> | null = null;

export async function loadSpanishEpgSchedule(): Promise<Map<string, RawEpgEvent[]>> {
  if (cachedEpgStore && Date.now() - cachedEpgStore.fetchedAt < 20 * 60 * 1000) {
    return cachedEpgStore.byChannel;
  }
  if (inflightEpgPromise) return inflightEpgPromise;

  inflightEpgPromise = (async () => {
    const result = new Map<string, RawEpgEvent[]>();
    const now = Date.now();
    const minWindow = now - 3 * 60 * 60 * 1000;
    const maxWindow = now + 18 * 60 * 60 * 1000;

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

    // 1. Stream-gunzip EPG_dobleM (Movistar+, DAZN, TDT & 3Cat complete XMLTV)
    try {
      const xmlByPriority = new Map<string, { priority: number; events: RawEpgEvent[] }>();
      const resp = await fetch(
        'https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiatv_sincolor.xml.gz',
        {
          headers: { 'User-Agent': CHROME_UA },
          signal: AbortSignal.timeout(14_000),
        }
      );

      if (resp.ok && resp.body) {
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
              leftover = leftover.slice(-60_000);
            }
          });
          gunzip.on('end', () => resolve());
          gunzip.on('error', () => resolve());
          Readable.fromWeb(resp.body as any)
            .on('error', () => resolve())
            .pipe(gunzip);
        });

        for (const [ourId, data] of xmlByPriority.entries()) {
          if (data.events.length > 0) {
            data.events.sort((a, b) => a.startMs - b.startMs);
            result.set(ourId, data.events);
          }
        }
      }
    } catch (err) {
      console.warn('EPG XMLTV stream warning:', err);
    }

    // 2. Fallback / complement from TDTChannels JSON EPG
    try {
      const missingJsonTargets = Array.from(jsonToOurIds.values()).some((ids) =>
        ids.some((id) => !result.has(id))
      );
      if (missingJsonTargets) {
        const jResp = await fetch('https://www.tdtchannels.com/epg/TV.json', {
          headers: { 'User-Agent': CHROME_UA },
          signal: AbortSignal.timeout(8000),
        });
        if (jResp.ok) {
          const jList: any[] = await jResp.json();
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
      }
    } catch {
      // keep XMLTV results
    }

    if (result.size > 0) {
      cachedEpgStore = { byChannel: result, fetchedAt: Date.now() };
    }
    return result;
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
      console.warn('/api/epg/live error:', err);
      res.json({ success: true, serverTimeMs: Date.now(), epg: {} });
    }
  });
}
