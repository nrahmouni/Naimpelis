export interface SmartTvChannelInfo {
  id: string;
  dial: number;
  name: string;
  category: string;
  groupTitle: string;
  quality: string;
  shortMark: string;
  brandTone: string;
  logoUrl?: string;
}

export const STATIC_CHANNELS_CATALOG: SmartTvChannelInfo[] = [
  // Fútbol & Deportes
  { id: 'mux-laliga', dial: 201, name: 'LaLiga EA Sports & Hypermotion HD', category: 'movistar', groupTitle: 'Fútbol · Movistar+ & LaLiga', quality: '1080p FHD', shortMark: 'LIGA', brandTone: '#0EA5E9' },
  { id: 'mux-f1-motor', dial: 202, name: 'DAZN F1 & Motor GP HD', category: 'dazn', groupTitle: 'Fútbol & Motor · DAZN', quality: '1080p FHD', shortMark: 'F1', brandTone: '#F59E0B' },
  { id: 'mux-champions', dial: 203, name: 'M+ Liga de Campeones & Fútbol Internacional', category: 'movistar', groupTitle: 'Fútbol · Movistar+ & LaLiga', quality: '1080p FHD', shortMark: 'UCL', brandTone: '#3B82F6' },
  { id: 'sport-ch-laliga-1', dial: 211, name: 'Movistar+ LaLiga HD', category: 'movistar', groupTitle: 'Fútbol · Movistar+ & LaLiga', quality: '1080p FHD', shortMark: 'MLIG', brandTone: '#0EA5E9' },
  { id: 'sport-ch-laliga-2', dial: 212, name: 'DAZN LaLiga HD', category: 'dazn', groupTitle: 'Fútbol & Motor · DAZN', quality: '1080p FHD', shortMark: 'DZNL', brandTone: '#F59E0B' },
  { id: 'sport-ch-laliga-3', dial: 213, name: 'LaLiga Hypermotion HD', category: 'movistar', groupTitle: 'Fútbol · Movistar+ & LaLiga', quality: '1080p FHD', shortMark: 'HYPR', brandTone: '#0EA5E9' },
  { id: 'sport-ch-ucl-1', dial: 214, name: 'Movistar+ Liga de Campeones HD', category: 'movistar', groupTitle: 'Fútbol · Movistar+ & LaLiga', quality: '1080p FHD', shortMark: 'MUCL', brandTone: '#3B82F6' },
  { id: 'sport-ch-f1-1', dial: 215, name: 'DAZN F1 1080p Oficial', category: 'dazn', groupTitle: 'Fútbol & Motor · DAZN', quality: '1080p FHD', shortMark: 'F1', brandTone: '#F59E0B' },
  { id: 'sport-ch-espn-1', dial: 216, name: 'ESPN En Vivo HD', category: 'espn', groupTitle: 'Fútbol & Deportes · ESPN 1-7', quality: '1080p HD', shortMark: 'ESPN', brandTone: '#E11D48' },
  { id: 'sport-ch-dsports-1', dial: 217, name: 'DSports En Vivo HD', category: 'dsports', groupTitle: 'Fútbol & Deportes · DSports', quality: '1080p HD', shortMark: 'DSP', brandTone: '#0284C7' },
  { id: 'sport-ch-tntsp-1', dial: 218, name: 'TNT Sports HD', category: 'tnt_space', groupTitle: 'Deportes · TNT Sports & Space', quality: '1080p HD', shortMark: 'TNT', brandTone: '#9146FF' },
  { id: 'bein-ar-1', dial: 301, name: 'beIN SPORTS 1 HD (العربية)', category: 'bein_arabic', groupTitle: 'Fútbol · beIN SPORTS (العربية)', quality: '1080p FHD', shortMark: 'beIN1', brandTone: '#6D28D9' },
  { id: 'bein-ar-2', dial: 302, name: 'beIN SPORTS 2 HD (العربية)', category: 'bein_arabic', groupTitle: 'Fútbol · beIN SPORTS (العربية)', quality: '1080p FHD', shortMark: 'beIN2', brandTone: '#6D28D9' },
  { id: 'bein-ar-3', dial: 303, name: 'beIN SPORTS 3 HD (العربية)', category: 'bein_arabic', groupTitle: 'Fútbol · beIN SPORTS (العربية)', quality: '1080p FHD', shortMark: 'beIN3', brandTone: '#6D28D9' },
  { id: 'bein-ar-4', dial: 304, name: 'beIN SPORTS 4 HD (العربية)', category: 'bein_arabic', groupTitle: 'Fútbol · beIN SPORTS (العربية)', quality: '1080p FHD', shortMark: 'beIN4', brandTone: '#6D28D9' },
  { id: 'bein-ar-5', dial: 305, name: 'beIN SPORTS 5 HD (العربية)', category: 'bein_arabic', groupTitle: 'Fútbol · beIN SPORTS (العربية)', quality: '1080p FHD', shortMark: 'beIN5', brandTone: '#6D28D9' },
  { id: 'bein-ar-6', dial: 306, name: 'beIN SPORTS 6 HD (العربية)', category: 'bein_arabic', groupTitle: 'Fútbol · beIN SPORTS (العربية)', quality: '1080p FHD', shortMark: 'beIN6', brandTone: '#6D28D9' },
  { id: 'bein-ar-xtra', dial: 310, name: 'beIN SPORTS XTRA HD', category: 'bein_arabic', groupTitle: 'Fútbol · beIN SPORTS (العربية)', quality: '1080p FHD', shortMark: 'XTRA', brandTone: '#6D28D9' },
  { id: 'uk-sky-pl', dial: 321, name: 'Sky Sports Premier League (EN)', category: 'uk_sports', groupTitle: 'Deportes UK · Sky Sports & Eurosport', quality: '1080p FHD', shortMark: 'SKYPL', brandTone: '#0284C7' },
  { id: 'uk-sky-football', dial: 322, name: 'Sky Sports Football (EN)', category: 'uk_sports', groupTitle: 'Deportes UK · Sky Sports & Eurosport', quality: '1080p FHD', shortMark: 'SKYFT', brandTone: '#0284C7' },
  { id: 'uk-eurosport-1', dial: 324, name: 'Eurosport 1 International HD', category: 'uk_sports', groupTitle: 'Deportes UK · Sky Sports & Eurosport', quality: '1080p FHD', shortMark: 'ES1', brandTone: '#2563EB' },
  { id: 'uk-eurosport-2', dial: 325, name: 'Eurosport 2 International HD', category: 'uk_sports', groupTitle: 'Deportes UK · Sky Sports & Eurosport', quality: '1080p FHD', shortMark: 'ES2', brandTone: '#2563EB' },
  { id: 'tdt-fifa-plus-es', dial: 87, name: 'FIFA+ Fútbol Clásico HD', category: 'noticias_deportes', groupTitle: 'Noticias y Deporte en Directo', quality: '1080p HD', shortMark: 'FIFA+', brandTone: '#0D9488' },
  { id: 'tdt-gol', dial: 23, name: 'Gol Play HD (Fútbol Abierto)', category: 'noticias_deportes', groupTitle: 'Noticias y Deporte en Directo', quality: '1080p HD', shortMark: 'GOL', brandTone: '#EA580C' },
  { id: 'tdt-rmtv', dial: 24, name: 'Real Madrid TV HD', category: 'noticias_deportes', groupTitle: 'Noticias y Deporte en Directo', quality: '1080p HD', shortMark: 'RMTV', brandTone: '#3B82F6' },
  { id: 'tdt-trace-sport-stars', dial: 88, name: 'Red Bull TV Deportes & Motor', category: 'noticias_deportes', groupTitle: 'Noticias y Deporte en Directo', quality: '1080p HD', shortMark: 'RBTV', brandTone: '#E11D48' },

  // TDT España Generalistas
  { id: 'tdt-la1', dial: 1, name: 'La 1 HD (RTVE)', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'LA 1', brandTone: '#2563EB' },
  { id: 'tdt-la2', dial: 2, name: 'La 2 HD (RTVE)', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'LA 2', brandTone: '#0D9488' },
  { id: 'tdt-antena3', dial: 3, name: 'Antena 3 HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'A3', brandTone: '#F97316' },
  { id: 'tdt-cuatro', dial: 4, name: 'Cuatro HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'CUAT', brandTone: '#DC2626' },
  { id: 'tdt-telecinco', dial: 5, name: 'Telecinco HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'T5', brandTone: '#0284C7' },
  { id: 'tdt-lasexta', dial: 6, name: 'La Sexta HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'SEX', brandTone: '#16A34A' },
  { id: 'tdt-24h', dial: 7, name: 'Canal 24 Horas RTVE', category: 'noticias_deportes', groupTitle: 'Noticias y Deporte en Directo', quality: '1080p HD', shortMark: '24H', brandTone: '#0284C7' },
  { id: 'tdt-tdp', dial: 8, name: 'Teledeporte HD (RTVE)', category: 'noticias_deportes', groupTitle: 'Noticias y Deporte en Directo', quality: '1080p HD', shortMark: 'TDP', brandTone: '#E11D48' },
  { id: 'tdt-clan', dial: 9, name: 'Clan TV Infantil', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: 'CLAN', brandTone: '#EAB308' },
  { id: 'tdt-neox', dial: 10, name: 'Neox HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'NEOX', brandTone: '#EAB308' },
  { id: 'tdt-nova', dial: 11, name: 'Nova HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'NOVA', brandTone: '#EC4899' },
  { id: 'tdt-mega', dial: 12, name: 'Mega HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'MEGA', brandTone: '#DC2626' },
  { id: 'tdt-atreseries', dial: 13, name: 'Atreseries HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'A3S', brandTone: '#3B82F6' },
  { id: 'tdt-fdf', dial: 14, name: 'Factoría de Ficción (FDF)', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'FDF', brandTone: '#16A34A' },
  { id: 'tdt-energy', dial: 15, name: 'Energy HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'NRG', brandTone: '#F97316' },
  { id: 'tdt-divinity', dial: 16, name: 'Divinity HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'DIV', brandTone: '#EC4899' },
  { id: 'tdt-bemad', dial: 17, name: 'Be Mad Cine HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'BMAD', brandTone: '#8B5CF6' },
  { id: 'tdt-boing', dial: 18, name: 'Boing Dibujos Animados', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: 'BOIN', brandTone: '#06B6D4' },
  { id: 'tdt-bomcine', dial: 19, name: 'BOM Cine HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'BOM', brandTone: '#B91C1C' },
  { id: 'tdt-squirrel', dial: 20, name: 'Squirrel Cine TV HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'SQRL', brandTone: '#2563EB' },
  { id: 'tdt-veo7', dial: 21, name: 'Veo 7 Cine HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'VEO7', brandTone: '#0EA5E9' },
  { id: 'tdt-dmax', dial: 22, name: 'DMAX Documentales', category: 'documentales', groupTitle: 'Documentales y Ciencia (Nat Geo & Discovery)', quality: '1080p HD', shortMark: 'DMAX', brandTone: '#000000' },
  { id: 'tdt-dkiss', dial: 23, name: 'DKISS HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'DKIS', brandTone: '#F43F5E' },
  { id: 'tdt-ten', dial: 24, name: 'TEN HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'TEN', brandTone: '#E11D48' },
  { id: 'tdt-trece', dial: 25, name: 'Trece (13TV) HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: '13TV', brandTone: '#0284C7' },

  // Cine & Series
  { id: 'tdt-rtve-star', dial: 82, name: 'RTVE Somos Cine HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'CINE', brandTone: '#2563EB' },
  { id: 'tdt-rakuten-top-movies-es', dial: 84, name: 'Top Películas FAST HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'TOPM', brandTone: '#9146FF' },
  { id: 'tdt-rakuten-action-es', dial: 85, name: 'Cine Acción FAST HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'ACTN', brandTone: '#EA580C' },
  { id: 'fast-anime-247', dial: 508, name: 'Anime 24/7 FAST HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'ANIM', brandTone: '#EC4899' },

  // Documentales & Ciencia
  { id: 'intl-natgeo-hd', dial: 401, name: 'National Geographic HD', category: 'documentales', groupTitle: 'Documentales y Ciencia (Nat Geo & Discovery)', quality: '1080p FHD', shortMark: 'NGEO', brandTone: '#EAB308' },
  { id: 'intl-natgeo-wild', dial: 402, name: 'Nat Geo Wild HD', category: 'documentales', groupTitle: 'Documentales y Ciencia (Nat Geo & Discovery)', quality: '1080p FHD', shortMark: 'WILD', brandTone: '#EAB308' },
  { id: 'intl-discovery-channel', dial: 403, name: 'Discovery Channel HD', category: 'documentales', groupTitle: 'Documentales y Ciencia (Nat Geo & Discovery)', quality: '1080p FHD', shortMark: 'DISC', brandTone: '#0284C7' },
  { id: 'intl-love-nature', dial: 404, name: 'Love Nature 4K/HD', category: 'documentales', groupTitle: 'Documentales y Ciencia (Nat Geo & Discovery)', quality: '1080p FHD', shortMark: 'LOVE', brandTone: '#16A34A' },
  { id: 'tdt-love-the-planet-es', dial: 86, name: 'Planeta Naturaleza ES HD', category: 'documentales', groupTitle: 'Documentales y Ciencia (Nat Geo & Discovery)', quality: '1080p HD', shortMark: 'NAT', brandTone: '#16A34A' },
  { id: 'intl-history-channel', dial: 405, name: 'The History Channel HD', category: 'documentales', groupTitle: 'Documentales y Ciencia (Nat Geo & Discovery)', quality: '1080p FHD', shortMark: 'HIST', brandTone: '#EA580C' },
  { id: 'fast-nasa-tv', dial: 505, name: 'NASA TV Live HD', category: 'documentales', groupTitle: 'Documentales y Ciencia (Nat Geo & Discovery)', quality: '1080p FHD', shortMark: 'NASA', brandTone: '#0284C7' },

  // Autonómicas
  { id: 'cat-tv3-live', dial: 30, name: 'TV3 Catalunya HD (3Cat)', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: 'TV3', brandTone: '#DC2626' },
  { id: 'cat-324-live', dial: 31, name: '324 Notícies HD', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: '324', brandTone: '#DC2626' },
  { id: 'cat-esport3-live', dial: 32, name: 'Esport3 Esports HD', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: 'E3', brandTone: '#DC2626' },
  { id: 'cat-sx3-live', dial: 33, name: 'SX3 Infantil & Super3 HD', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: 'SX3', brandTone: '#E11D48' },
  { id: 'tdt-telemadrid', dial: 34, name: 'Telemadrid HD', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: 'TMAD', brandTone: '#DC2626' },
  { id: 'tdt-canalsur', dial: 35, name: 'Canal Sur Andalucía HD', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: 'CSUR', brandTone: '#16A34A' },
  { id: 'tdt-tvg', dial: 36, name: 'TVG Galicia HD', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: 'TVG', brandTone: '#0284C7' },
  { id: 'tdt-tvcanaria', dial: 37, name: 'Televisión Canaria HD', category: 'infantil_autonomicas', groupTitle: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)', quality: '1080p HD', shortMark: 'TVC', brandTone: '#EAB308' },

  // TV Marruecos (المغرب · SNRT & 2M)
  { id: 'mor-al-aoula', dial: 601, name: 'Al Aoula HD (الأولى المغربية)', category: 'marruecos', groupTitle: 'TV Marruecos (المغرب · SNRT & 2M)', quality: '1080p FHD', shortMark: 'AOULA', brandTone: '#DC2626' },
  { id: 'mor-2m-monde', dial: 602, name: '2M Monde HD (دوزيم)', category: 'marruecos', groupTitle: 'TV Marruecos (المغرب · SNRT & 2M)', quality: '1080p FHD', shortMark: '2M', brandTone: '#2563EB' },
  { id: 'mor-arryadia', dial: 603, name: 'Arryadia HD (الرياضية المغربية)', category: 'marruecos', groupTitle: 'TV Marruecos (المغرب · SNRT & 2M)', quality: '1080p FHD', shortMark: 'ARRY', brandTone: '#16A34A' },
  { id: 'mor-athaqafia', dial: 604, name: 'Athaqafia HD (الثقافية)', category: 'marruecos', groupTitle: 'TV Marruecos (المغرب · SNRT & 2M)', quality: '1080p FHD', shortMark: 'THAQ', brandTone: '#7C3AED' },
  { id: 'mor-al-maghribia', dial: 605, name: 'Al Maghribia HD (المغربية)', category: 'marruecos', groupTitle: 'TV Marruecos (المغرب · SNRT & 2M)', quality: '1080p FHD', shortMark: 'MAGH', brandTone: '#DC2626' },
  { id: 'mor-tamazight', dial: 607, name: 'Tamazight HD (تمازيغت)', category: 'marruecos', groupTitle: 'TV Marruecos (المغرب · SNRT & 2M)', quality: '1080p FHD', shortMark: 'TAMZ', brandTone: '#EA580C' },
  { id: 'mor-medi1-arabic', dial: 609, name: 'Medi1TV Arabic HD (ميدي 1 تيفي)', category: 'marruecos', groupTitle: 'TV Marruecos (المغرب · SNRT & 2M)', quality: '1080p FHD', shortMark: 'MED1', brandTone: '#0284C7' },
  { id: 'mor-chada-tv', dial: 612, name: 'Chada TV HD (شدى تيفي)', category: 'marruecos', groupTitle: 'TV Marruecos (المغرب · SNRT & 2M)', quality: '1080p FHD', shortMark: 'CHAD', brandTone: '#F43F5E' },

  // Noticias e Internacional
  { id: 'intl-bbc-news', dial: 701, name: 'BBC News Channel HD', category: 'europa_tv', groupTitle: 'TV Europa (BBC · Euronews · DW · France 24)', quality: '1080p FHD', shortMark: 'BBC', brandTone: '#DC2626' },
  { id: 'intl-euronews-es', dial: 702, name: 'Euronews Español HD', category: 'europa_tv', groupTitle: 'TV Europa (BBC · Euronews · DW · France 24)', quality: '1080p FHD', shortMark: 'EUR_ES', brandTone: '#0284C7' },
  { id: 'intl-euronews-en', dial: 703, name: 'Euronews English HD', category: 'europa_tv', groupTitle: 'TV Europa (BBC · Euronews · DW · France 24)', quality: '1080p FHD', shortMark: 'EUR_EN', brandTone: '#0284C7' },
  { id: 'intl-france24-es', dial: 705, name: 'France 24 Español HD', category: 'europa_tv', groupTitle: 'TV Europa (BBC · Euronews · DW · France 24)', quality: '1080p FHD', shortMark: 'F24_ES', brandTone: '#0284C7' },
  { id: 'intl-dw-es', dial: 707, name: 'Deutsche Welle Español HD', category: 'europa_tv', groupTitle: 'TV Europa (BBC · Euronews · DW · France 24)', quality: '1080p FHD', shortMark: 'DW_ES', brandTone: '#2563EB' },
  { id: 'intl-fox-news', dial: 721, name: 'FOX News HD', category: 'usa_tv', groupTitle: 'TV Estados Unidos (FOX · NBC · CNN)', quality: '1080p FHD', shortMark: 'FOXN', brandTone: '#0284C7' },
  { id: 'intl-fox-weather', dial: 722, name: 'FOX Weather HD', category: 'usa_tv', groupTitle: 'TV Estados Unidos (FOX · NBC · CNN)', quality: '1080p FHD', shortMark: 'FOXW', brandTone: '#0EA5E9' },
  { id: 'intl-cnn-fast-es', dial: 724, name: 'CNN Fast en Español HD', category: 'usa_tv', groupTitle: 'TV Estados Unidos (FOX · NBC · CNN)', quality: '1080p FHD', shortMark: 'CNN', brandTone: '#DC2626' },
  { id: 'intl-bloomberg-us', dial: 725, name: 'Bloomberg TV HD', category: 'usa_tv', groupTitle: 'TV Estados Unidos (FOX · NBC · CNN)', quality: '1080p FHD', shortMark: 'BLMG', brandTone: '#000000' },
  { id: 'intl-cnbc-live', dial: 726, name: 'CNBC Business TV HD', category: 'usa_tv', groupTitle: 'TV Estados Unidos (FOX · NBC · CNN)', quality: '1080p FHD', shortMark: 'CNBC', brandTone: '#0284C7' },
  { id: 'intl-aljazeera-en', dial: 741, name: 'Al Jazeera English HD', category: 'noticias_intl', groupTitle: 'Noticias Internacionales (Al Jazeera · Al Arabiya)', quality: '1080p FHD', shortMark: 'AJE', brandTone: '#EA580C' },
  { id: 'intl-aljazeera-ar', dial: 742, name: 'Al Jazeera Arabic HD (الجزيرة)', category: 'noticias_intl', groupTitle: 'Noticias Internacionales (Al Jazeera · Al Arabiya)', quality: '1080p FHD', shortMark: 'AJA', brandTone: '#EA580C' },
  { id: 'intl-alarabiya', dial: 744, name: 'Al Arabiya News HD (العربية)', category: 'noticias_intl', groupTitle: 'Noticias Internacionales (Al Jazeera · Al Arabiya)', quality: '1080p FHD', shortMark: 'ARAB', brandTone: '#7C3AED' },
  { id: 'intl-alhadath', dial: 746, name: 'Al Hadath HD (الحدث)', category: 'noticias_intl', groupTitle: 'Noticias Internacionales (Al Jazeera · Al Arabiya)', quality: '1080p FHD', shortMark: 'HDTH', brandTone: '#DC2626' },
  { id: 'intl-skynews-arabia', dial: 747, name: 'Sky News Arabia HD (سكاي نيوز)', category: 'noticias_intl', groupTitle: 'Noticias Internacionales (Al Jazeera · Al Arabiya)', quality: '1080p FHD', shortMark: 'SKY_AR', brandTone: '#DC2626' },
];
