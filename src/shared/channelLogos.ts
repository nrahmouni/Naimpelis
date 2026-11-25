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
  'dazn-combat': `${TV_LOGOS_BASE}countries/international/dazn-int.png`,

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

  // beIN SPORTS Árabe & Deportes MENA
  'bein-ar-1': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-1-mea.png`,
  'bein-ar-2': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-2-mea.png`,
  'bein-ar-3': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-3-mea.png`,
  'bein-ar-4': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-4-mea.png`,
  'bein-ar-5': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-5-mea.png`,
  'bein-ar-6': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-6-mea.png`,
  'bein-ar-7': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-7-mea.png`,
  'bein-ar-8': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-arabic-mea.png`,
  'bein-ar-9': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-arabic-mea.png`,
  'bein-ar-news': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-arabic-mea.png`,
  'bein-ar-free': `${TV_LOGOS_BASE}countries/world-middle-east/bein-sports/bein-sports-mea.png`,
  'ar-bahrain-sports1': 'https://i.imgur.com/fBpLsbC.png',
  'ar-bahrain-sports2': 'https://i.imgur.com/ZkuZmIo.png',
  'ar-oman-sports': 'https://i.imgur.com/1omi7p8.png',

  // Canales Marroquíes (Marruecos)
  'ma-alaoula': 'https://i.imgur.com/nq53d2N.png',
  'ma-arryadia': 'https://i.imgur.com/XjzK3gZ.png',
  'ma-2m': 'https://i.imgur.com/PJYTfHi.png',
  'ma-2m-monde': 'https://i.imgur.com/PJYTfHi.png',
  'ma-maghribia': 'https://i.imgur.com/7GaahYh.png',
  'ma-assadissa': 'https://freebox.cdn.scw.iliad.fr/medium_Assadissa_f8b25de821.png',
  'ma-athaqafia': 'https://freebox.cdn.scw.iliad.fr/medium_Athaqafia_fdc90e055e.png',
  'ma-tamazight': 'https://freebox.cdn.scw.iliad.fr/552_56201db052.png',
  'ma-laayoune': 'https://i.ibb.co/Q3r5D5d0/image-removebg-preview.png',
  'ma-medi1-ar': 'https://i.imgur.com/3YsZPY6.jpeg',
  'ma-medi1-maghreb': 'https://i.imgur.com/F5OFQsp.jpeg',
  'ma-medi1-afrique': 'https://i.imgur.com/a20DHnj.png',
  'ma-chada': 'https://freebox.cdn.scw.iliad.fr/medium_Logo_chada_tv_2ee1412d38.png',

  // Documentales y Ciencia (Nat Geo, Discovery, History)
  'doc-natgeo-us': `${TV_LOGOS_BASE}countries/united-states/hd/national-geographic-hd-us.png`,
  'doc-natgeo-latam': `${TV_LOGOS_BASE}countries/world-latin-america/national-geographic-hd-lam.png`,
  'doc-natgeo-mx': `${TV_LOGOS_BASE}countries/world-latin-america/national-geographic-lam.png`,
  'doc-natgeo-wild': `${TV_LOGOS_BASE}countries/united-states/hd/national-geographic-wild-hd-us.png`,
  'doc-natgeo-ad': `${TV_LOGOS_BASE}countries/united-kingdom/hd/national-geographic-hd-uk.png`,
  'doc-discovery-us': `${TV_LOGOS_BASE}countries/united-states/hd/discovery-channel-hd-us.png`,
  'doc-discovery-it': `${TV_LOGOS_BASE}countries/united-kingdom/hd/discovery-channel-hd-uk.png`,
  'doc-lovenature-es': `${TV_LOGOS_BASE}misc/vod/love-nature-en-espanol-vod.png`,
  'doc-naturetime': `${TV_LOGOS_BASE}misc/vod/nature-vod.png`,
  'doc-pluto-naturaleza': `${TV_LOGOS_BASE}misc/vod/pluto-tv-animals-vod-us.png`,
  'doc-pluto-science': `${TV_LOGOS_BASE}countries/united-kingdom/discovery-science-uk.png`,
  'doc-history': `${TV_LOGOS_BASE}countries/united-states/history-channel-us.png`,
  'doc-history-hit': `${TV_LOGOS_BASE}misc/vod/pluto-tv-history-vod-us.png`,
  'doc-smithsonian': `${TV_LOGOS_BASE}countries/united-states/hd/smithsonian-channel-hd-us.png`,

  // Estados Unidos (FOX, ABC, CBS, NBC, CNN, Bloomberg)
  'us-fox-livenow': `${TV_LOGOS_BASE}countries/united-states/fox-news-us.png`,
  'us-fox-weather': `${TV_LOGOS_BASE}countries/united-states/fox-weather-us.png`,
  'us-fox5-ny': `${TV_LOGOS_BASE}countries/united-states/us-local/fox-5-wnyw-us.png`,
  'us-fox-news': `${TV_LOGOS_BASE}countries/united-states/fox-news-us.png`,
  'us-fox-sports1': `${TV_LOGOS_BASE}countries/united-states/fox-sports-1-us.png`,
  'us-abc-news': `${TV_LOGOS_BASE}countries/united-states/abc-news-live-us.png`,
  'us-cbs-news': `${TV_LOGOS_BASE}countries/united-states/cbs-news-24-7-us.png`,
  'us-nbc-news': `${TV_LOGOS_BASE}countries/united-states/nbc-news-now-us.png`,
  'us-cnn-int': `${TV_LOGOS_BASE}countries/united-states/cnn-us.png`,
  'us-cnn-es': `${TV_LOGOS_BASE}countries/world-latin-america/cnn-en-espanol-lam.png`,
  'us-bloomberg': `${TV_LOGOS_BASE}countries/united-states/bloomberg-television-us.png`,
  'us-scripps': `${TV_LOGOS_BASE}countries/united-states/scripps-news-us.png`,

  // Europa (BBC, Euronews, France 24, DW, BFM, TV5, ARD, RAI, RTP)
  'eu-bbc-news': `${TV_LOGOS_BASE}countries/united-kingdom/bbc-news-uk.png`,
  'eu-euronews-es': `${TV_LOGOS_BASE}misc/vod/euronews-espanol-vod.png`,
  'eu-euronews-en': `${TV_LOGOS_BASE}misc/vod/euronews-espanol-vod.png`,
  'eu-euronews-fr': `${TV_LOGOS_BASE}misc/vod/euronews-espanol-vod.png`,
  'eu-france24-es': `${TV_LOGOS_BASE}countries/france/france-24-fr.png`,
  'eu-france24-en': `${TV_LOGOS_BASE}countries/france/france-24-fr.png`,
  'eu-dw-es': `${TV_LOGOS_BASE}countries/germany/dw-de.png`,
  'eu-dw-en': `${TV_LOGOS_BASE}countries/germany/dw-de.png`,
  'eu-dw-ar': `${TV_LOGOS_BASE}countries/germany/dw-de.png`,
  'eu-bfmtv': `${TV_LOGOS_BASE}countries/france/bfm-tv-fr.png`,
  'eu-tv5monde': `${TV_LOGOS_BASE}countries/france/tv5-monde-fr.png`,
  'eu-tagesschau24': `${TV_LOGOS_BASE}countries/germany/tagesschau24-de.png`,
  'eu-daserste': `${TV_LOGOS_BASE}countries/germany/das-erste-de.png`,
  'eu-rai1': `${TV_LOGOS_BASE}countries/italy/hd/rai-1-hd-it.png`,
  'eu-rainews24': `${TV_LOGOS_BASE}countries/italy/hd/rai-news-24-hd-it.png`,
  'eu-rtp1': `${TV_LOGOS_BASE}countries/portugal/rtp-1-hd-pt.png`,
  'eu-rtp3': `${TV_LOGOS_BASE}countries/portugal/rtp-noticias-pt.png`,

  // Noticias Internacionales (Al Jazeera, Al Arabiya, Sky Arabia, CNBC)
  'news-aj-en': `${TV_LOGOS_BASE}countries/united-kingdom/aljazeera-uk.png`,
  'news-aj-ar': 'https://dtil.tmsimg.com/assets/s159135_ld_h15_aa.png?lock=720x540',
  'news-aj-mubasher': 'https://i.imgur.com/DfJI4t5.png',
  'news-alarabiya': `${TV_LOGOS_BASE}countries/united-arab-emirates/al-arabiya-ae.png`,
  'news-alarabiya-en': `${TV_LOGOS_BASE}countries/united-arab-emirates/al-arabiya-ae.png`,
  'news-alhadath': `${TV_LOGOS_BASE}countries/united-arab-emirates/al-arabiya-al-hadath-ae.png`,
  'news-sky-arabia': `${TV_LOGOS_BASE}countries/world-middle-east/sky-news-arabia-mea.png`,
  'news-alaraby': 'https://i.imgur.com/YMqWEe4.png',
  'news-alaraby-2': 'https://i.imgur.com/YMqWEe4.png',
  'news-cnbc-arabia': `${TV_LOGOS_BASE}countries/world-middle-east/cnbc-arabiya-mea.png`,
  'news-cnbc-eu': `${TV_LOGOS_BASE}countries/world-europe/cnbc-eu.png`,
};

const GENERIC_FLAG_OR_PLACEHOLDER_LOGO_RX =
  /(?:flagcdn\.com|\/flags\/|country-?flags?|spain[-_]?flag|bandera[-_]?esp|\/es\.png(?:\?|$)|\/spain\.png(?:\?|$)|placeholder)/i;

export function isGenericFlagOrBadLogoUrl(url?: string | null): boolean {
  const clean = String(url || '').trim();
  if (!clean) return true;
  return GENERIC_FLAG_OR_PLACEHOLDER_LOGO_RX.test(clean);
}

export function resolveOfficialChannelLogoUrl(
  ch: { id: string; logoUrl?: string | null }
): string | null {
  const official = OFFICIAL_CHANNEL_LOGO_URLS[ch.id];
  if (official) return official;
  const fallback = String(ch.logoUrl || '').trim();
  if (!fallback || isGenericFlagOrBadLogoUrl(fallback)) return null;
  return fallback;
}

