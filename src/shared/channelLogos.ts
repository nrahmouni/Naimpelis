const TV_LOGOS_BASE = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/';
const FAN_LOGOS_BASE = 'https://raw.githubusercontent.com/fanmingming/live/main/';

/**
 * Verified official broadcast channel logos (HTTP 200) sourced from
 * tv-logo/tv-logos, fanmingming/live, BurningC4/tvg-logo and official CDNs.
 */
export const OFFICIAL_CHANNEL_LOGO_URLS: Record<string, string> = {
  // España · Generalistas TDT
  'tdt-la1': `${TV_LOGOS_BASE}countries/spain/tve-1-es.png`,
  'tdt-la2': `${TV_LOGOS_BASE}countries/spain/tve-2-es.png`,
  'tdt-antena3': `${TV_LOGOS_BASE}countries/spain/antena-3-es.png`,
  'tdt-cuatro': `${TV_LOGOS_BASE}countries/spain/cuatro-es.png`,
  'tdt-telecinco': `${TV_LOGOS_BASE}countries/spain/telecinco-es.png`,
  'tdt-lasexta': `${TV_LOGOS_BASE}countries/spain/lasexta-es.png`,

  // Movistar Plus+
  'mplus-canal': `${TV_LOGOS_BASE}countries/spain/movistar-plus-es.png`,
  'mplus-vamos': `${TV_LOGOS_BASE}countries/spain/vamos-por-movistar-plus-es.png`,
  'mplus-laliga': `${TV_LOGOS_BASE}countries/spain/laliga-tv-por-movistar-plus-es.png`,
  'mplus-hypermotion': `${TV_LOGOS_BASE}countries/spain/laliga-tv-hypermotion-es.png`,
  'mplus-champions': `${TV_LOGOS_BASE}countries/spain/liga-de-campeones-por-movistar-plus-es.png`,
  'mplus-deportes': `${TV_LOGOS_BASE}countries/spain/deportes-por-movistar-plus-es.png`,
  'mplus-deportes2': `${TV_LOGOS_BASE}countries/spain/deportes-2-por-movistar-plus-es.png`,
  'mplus-golf': `${TV_LOGOS_BASE}countries/spain/golf-por-movistar-plus-es.png`,
  'mplus-eurosport1': `${TV_LOGOS_BASE}countries/spain/eurosport-1-es.png`,
  'mplus-eurosport2': `${TV_LOGOS_BASE}countries/spain/eurosport-2-es.png`,

  // DAZN España
  'dazn-laliga': `${TV_LOGOS_BASE}countries/spain/dazn-laliga-es.png`,
  'dazn-f1': `${TV_LOGOS_BASE}countries/spain/dazn-f1-es.png`,
  'dazn-1': `${TV_LOGOS_BASE}countries/spain/dazn-1-es.png`,
  'dazn-2': `${TV_LOGOS_BASE}countries/spain/dazn-2-es.png`,
  'dazn-3': `${TV_LOGOS_BASE}countries/spain/dazn-3-es.png`,
  'dazn-4': `${TV_LOGOS_BASE}countries/spain/dazn-4-es.png`,

  // TDT Temáticos, Noticias, Deportes, Infantil & Autonómicas
  'tdt-neox': `${TV_LOGOS_BASE}countries/spain/neox-es.png`,
  'tdt-fdf': `${TV_LOGOS_BASE}countries/spain/fdf-es.png`,
  'tdt-nova': `${TV_LOGOS_BASE}countries/spain/nova-es.png`,
  'tdt-energy': `${TV_LOGOS_BASE}countries/spain/energy-es.png`,
  'tdt-atreseries': `${TV_LOGOS_BASE}countries/spain/atreseries-es.png`,
  'tdt-bemad': `${TV_LOGOS_BASE}countries/spain/be-mad-tv-es.png`,
  'tdt-paramount': `${TV_LOGOS_BASE}countries/spain/paramount-network-es.png`,
  'tdt-bomcine': `${TV_LOGOS_BASE}countries/spain/bom-cine-es.png`,
  'tdt-mega': `${TV_LOGOS_BASE}countries/spain/mega-es.png`,
  'tdt-dmax': `${TV_LOGOS_BASE}countries/spain/dmax-es.png`,
  'tdt-divinity': `${TV_LOGOS_BASE}countries/spain/divinity-es.png`,
  'tdt-dkiss': `${TV_LOGOS_BASE}countries/spain/dkiss-es.png`,
  'tdt-ten': `${TV_LOGOS_BASE}countries/spain/ten-es.png`,
  'tdt-trece': `${TV_LOGOS_BASE}countries/spain/trece-es.png`,
  'tdt-24h': `${TV_LOGOS_BASE}countries/spain/24h-es.png`,
  'tdt-teledeporte': `${TV_LOGOS_BASE}countries/spain/tdp-es.png`,
  'tdt-rmtv': `${TV_LOGOS_BASE}countries/spain/real-madrid-tv-es.png`,
  'tdt-clan': `${TV_LOGOS_BASE}countries/spain/clan-es.png`,
  'tdt-boing': `${TV_LOGOS_BASE}countries/spain/boing-es.png`,
  'tdt-canalsur': `${TV_LOGOS_BASE}countries/spain/canal-sur-andalucia-es.png`,
  'tdt-3cat': `${TV_LOGOS_BASE}countries/spain/tv3-cat-es.png`,
  'tdt-etb1': `${TV_LOGOS_BASE}countries/spain/etb1-es.png`,
  'tdt-etb2': `${TV_LOGOS_BASE}countries/spain/etb2-es.png`,
  'tdt-tvcanaria': `${TV_LOGOS_BASE}countries/spain/television-canaria-es.png`,
  'cat-sx3-live': 'https://upload.wikimedia.org/wikipedia/commons/0/01/SX3_logo.svg',
  'cat-tv3-live': `${TV_LOGOS_BASE}countries/spain/tv3-cat-es.png`,
  'cat-esport3-live': `${TV_LOGOS_BASE}countries/spain/esport-3-es.png`,
  'cat-324-live': `${TV_LOGOS_BASE}countries/spain/3-24-es.png`,

  // beIN SPORTS
  'bein-es-n': `${TV_LOGOS_BASE}countries/united-states/bein-sports-espanol-us.png`,
  'bein-xtra-hd': `${TV_LOGOS_BASE}countries/united-states/bein-sports-xtra-espanol-us.png`,
  'bein-usa': `${TV_LOGOS_BASE}countries/united-states/bein-sports-us.png`,
  'bein-1': `${TV_LOGOS_BASE}countries/france/bein-sports-1-french-fr.png`,
  'bein-2': `${TV_LOGOS_BASE}countries/france/bein-sports-2-french-fr.png`,
  'bein-3': `${TV_LOGOS_BASE}countries/france/bein-sports-3-french-fr.png`,
  'bein-4': `${TV_LOGOS_BASE}countries/united-states/bein-sports-4-us.png`,
  'bein-5': `${TV_LOGOS_BASE}countries/united-states/bein-sports-5-us.png`,
  'bein-6': `${TV_LOGOS_BASE}countries/united-states/bein-sports-6-us.png`,
  'bein-7': `${TV_LOGOS_BASE}countries/united-states/bein-sports-7-us.png`,

  // UK & USA Sports
  'uk-sky-premier': `${TV_LOGOS_BASE}countries/united-kingdom/sky-sports-premier-league-uk.png`,
  'uk-sky-f1': `${TV_LOGOS_BASE}countries/united-kingdom/sky-sports-f1-uk.png`,
  'uk-sky-action': `${TV_LOGOS_BASE}countries/united-kingdom/sky-sports-action-uk.png`,
  'uk-sky-sports-1': `${TV_LOGOS_BASE}countries/united-kingdom/sky-sports-main-event-uk.png`,
  'uk-sky-sports-2': `${TV_LOGOS_BASE}countries/united-kingdom/sky-sports-arena-uk.png`,
  'uk-eurosport-1': `${TV_LOGOS_BASE}countries/united-kingdom/eurosport-1-uk.png`,
  'uk-eurosport-2': `${TV_LOGOS_BASE}countries/united-kingdom/eurosport-2-uk.png`,
  'uk-mutv': `${TV_LOGOS_BASE}countries/united-kingdom/mutv-uk.png`,
  'uk-talksport': 'https://upload.wikimedia.org/wikipedia/en/9/9d/Talksport_logo.png',
  'uk-dazn-darts': `${TV_LOGOS_BASE}countries/united-kingdom/dazn1-uk.png`,
  'uk-dazn-combat': `${TV_LOGOS_BASE}countries/international/dazn-int.png`,
  'uk-redbull': `${TV_LOGOS_BASE}countries/international/red-bull-tv-int.png`,
  'uk-fifa-plus': 'https://upload.wikimedia.org/wikipedia/commons/9/9c/FIFA%2B_%282025%29.svg',
  'uk-fifa-women': 'https://upload.wikimedia.org/wikipedia/commons/9/9c/FIFA%2B_%282025%29.svg',
  'uk-bellator-mma': `${TV_LOGOS_BASE}misc/vod/bellator-mma-vod.png`,
  'uk-cbs-sports': `${TV_LOGOS_BASE}countries/united-states/cbs-sports-hq-us.png`,
  'uk-strongman': `${TV_LOGOS_BASE}misc/vod/strongman-champions-league-vod.png`,
  'uk-floracing': 'https://images.fubo.tv/channel-config-ui/station-logos/on-dark/floracing-white.png',
  'uk-sky-racing': `${TV_LOGOS_BASE}countries/united-kingdom/sky-sports-racing-uk.png`,
  'uk-tsn-ocho': `${TV_LOGOS_BASE}countries/canada/tsn-1-ca.png`,

  // Latam Sports & Entretenimiento (ESPN, DSports, TNT, Space)
  'espn-1': `${TV_LOGOS_BASE}countries/world-latin-america/espn-lam.png`,
  'espn-2': `${TV_LOGOS_BASE}countries/world-latin-america/espn-2-lam.png`,
  'espn-3': `${TV_LOGOS_BASE}countries/world-latin-america/espn-3-lam.png`,
  'espn-4': `${TV_LOGOS_BASE}countries/world-latin-america/espn-4-lam.png`,
  'espn-5': `${TV_LOGOS_BASE}countries/world-latin-america/espn-5-lam.png`,
  'espn-6': `${TV_LOGOS_BASE}countries/world-latin-america/espn-6-lam.png`,
  'espn-7': `${TV_LOGOS_BASE}countries/world-latin-america/espn-7-lam.png`,
  'espn-premium': `${TV_LOGOS_BASE}countries/world-latin-america/espn-premium-lam.png`,
  'dsports-1': `${TV_LOGOS_BASE}countries/world-latin-america/dsports-lam.png`,
  'dsports-2': `${TV_LOGOS_BASE}countries/world-latin-america/dsports2-lam.png`,
  'dsports-plus': `${TV_LOGOS_BASE}countries/world-latin-america/dsports-plus-lam.png`,
  'dsports-motor': `${TV_LOGOS_BASE}countries/world-latin-america/dsports-lam.png`,
  'dsports-fight': `${TV_LOGOS_BASE}countries/world-latin-america/dsports-lam.png`,
  'tnt-sports': `${TV_LOGOS_BASE}countries/world-latin-america/tnt-sports-lam.png`,
  'tnt-vivo': `${TV_LOGOS_BASE}countries/united-states/tnt-us.png`,
  'space-vivo': `${TV_LOGOS_BASE}countries/world-latin-america/space-lam.png`,

  // China Football (CCTV & Regional Sports)
  'cn-cctv5': `${FAN_LOGOS_BASE}tv/CCTV5.png`,
  'cn-cctv5plus': `${FAN_LOGOS_BASE}tv/CCTV5%2B.png`,
  'cn-cctv16': `${FAN_LOGOS_BASE}tv/CCTV16.png`,
  'cn-guangdong-sports': `${FAN_LOGOS_BASE}tv/GDTV3.png`,
  'cn-tianjin-sports': `${FAN_LOGOS_BASE}tv/tianjin.png`,
  'cn-btv6-sports': 'https://raw.githubusercontent.com/BurningC4/tvg-logo/master/btv1.png',
  'cn-fengyun-football': `${FAN_LOGOS_BASE}tv/CCTV5.png`,
};

export function resolveOfficialChannelLogoUrl(
  ch: { id: string; logoUrl?: string | null }
): string | null {
  return ch.logoUrl || OFFICIAL_CHANNEL_LOGO_URLS[ch.id] || null;
}
