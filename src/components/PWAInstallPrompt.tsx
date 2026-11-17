import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Smartphone,
  Share,
  MoreVertical,
  Monitor,
  Tv,
  Loader2,
  Check,
  Copy,
  CheckCheck,
  ExternalLink,
  Search,
  BookOpen,
  ListOrdered,
  Link as LinkIcon,
  ChevronRight,
  ArrowLeft,
  Flame,
  Radio,
  Sparkles,
} from 'lucide-react';
import { AppLanguage } from '../types';
import { useOnlineStatus, usePWAInstall } from '../utils/usePWAInstall';
import { triggerHaptic } from '../utils/haptics';
import { triggerApkDownload } from '../utils/apkDownload';
import { pickLang } from '../utils/i18n';
import { isSmartTvBrowser } from '../utils/shortLink';
import { BottomSheet, SecondaryButton } from './ui/DesignSystem';

// ============================================================================
// CURATED STATIC CHANNEL FALLBACK CATALOG (Guarantees instant UI + offline support)
// ============================================================================
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

const STATIC_CHANNELS_CATALOG: SmartTvChannelInfo[] = [
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
  { id: 'tdt-paramount', dial: 19, name: 'Paramount Network HD', category: 'cine_series', groupTitle: 'Cine y Series 24/7', quality: '1080p HD', shortMark: 'PARA', brandTone: '#2563EB' },
  { id: 'tdt-dmax', dial: 20, name: 'DMAX Documentales', category: 'documentales', groupTitle: 'Documentales y Ciencia (Nat Geo & Discovery)', quality: '1080p HD', shortMark: 'DMAX', brandTone: '#000000' },
  { id: 'tdt-dkiss', dial: 21, name: 'DKISS HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'DKIS', brandTone: '#F43F5E' },
  { id: 'tdt-ten', dial: 22, name: 'TEN HD', category: 'generalistas', groupTitle: 'TDT España Generalistas', quality: '1080p HD', shortMark: 'TEN', brandTone: '#E11D48' },
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

interface PWAInstallButtonProps {
  lang: AppLanguage;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  lang,
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showSheet, setShowSheet] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    triggerHaptic('medium');
    if (isInstallable) {
      await install();
      return;
    }
    setShowSheet(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`min-h-12 ${
          compact ? 'px-3' : 'px-4'
        } rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-xs font-semibold text-white flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
      >
        <Download className="w-4 h-4 text-[#BF94FF]" />
        <span>
          {pickLang(lang, {
            es: 'Instalar NAIMCINE (Smart TV & App)',
            ca: 'Instal·lar NAIMCINE (Smart TV & App)',
            en: 'Install NAIMCINE (Smart TV & App)',
          })}
        </span>
      </button>

      <PWAInstallOptionsSheet
        isOpen={showSheet}
        onClose={() => setShowSheet(false)}
        lang={lang}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </>
  );
};

interface PWAInstallLandingCardProps {
  lang: AppLanguage;
  isDesktop?: boolean;
  alwaysShow?: boolean;
}

export const PWAInstallLandingCard: React.FC<PWAInstallLandingCardProps> = ({
  lang,
  alwaysShow = false,
}) => {
  const { isInstalled, isIOS, isAndroid } = usePWAInstall();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isInstalled && !alwaysShow) return null;

  return (
    <>
      <SecondaryButton fullWidth onClick={() => setSheetOpen(true)}>
        <Download className="w-4 h-4 text-[#BF94FF]" />
        <span>
          {pickLang(lang, {
            es: 'Instalar NAIMCINE · Smart TV & Móvil',
            ca: 'Instal·lar NAIMCINE · Smart TV & Mòbil',
            en: 'Install NAIMCINE · Smart TV & Mobile',
            zh: '安装 NAIMCINE',
          })}
        </span>
      </SecondaryButton>

      <PWAInstallOptionsSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        lang={lang}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </>
  );
};

export interface PWAInstallOptionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  isIOS?: boolean;
  isAndroid?: boolean;
  initialSection?: 'main' | 'samsung_tizen';
}

export const PWAInstallOptionsSheet: React.FC<PWAInstallOptionsSheetProps> = ({
  isOpen,
  onClose,
  lang,
  isIOS: propIsIos,
  isAndroid: propIsAndroid,
  initialSection = 'main',
}) => {
  const pwa = usePWAInstall();
  const isIOS = propIsIos ?? pwa.isIOS;
  const isAndroid = propIsAndroid ?? pwa.isAndroid;
  const isTvDevice = typeof window !== 'undefined' && isSmartTvBrowser();

  const [viewingSection, setViewingSection] = useState<'main' | 'samsung_tizen'>(initialSection);
  const [tizenTab, setTizenTab] = useState<'guide' | 'channels' | 'urls'>('guide');
  const [apkDownloading, setApkDownloading] = useState<'mobile' | 'tv' | null>(null);
  const [apkDone, setApkDone] = useState<'mobile' | 'tv' | null>(null);
  const [apkError, setApkError] = useState<string | null>(null);
  const [showWebSteps, setShowWebSteps] = useState(false);

  // M3U & EPG XML dynamic state
  const [copiedType, setCopiedType] = useState<'m3u' | 'epg' | 'tv' | null>(null);
  const [channelSearch, setChannelSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [dynamicChannels, setDynamicChannels] = useState<SmartTvChannelInfo[]>(STATIC_CHANNELS_CATALOG);
  const [totalCount, setTotalCount] = useState<number>(STATIC_CHANNELS_CATALOG.length);

  useEffect(() => {
    if (isOpen) {
      setViewingSection(initialSection);
    } else {
      setCopiedType(null);
      setChannelSearch('');
      setSelectedCategory('all');
    }
  }, [isOpen, initialSection]);

  // Fetch freshest channel list & summary from server
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    fetch('/api/iptv/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!isCancelled && data?.ok && Array.isArray(data.channels) && data.channels.length > 0) {
          setDynamicChannels(data.channels);
          setTotalCount(data.totalChannels || data.channels.length);
        }
      })
      .catch(() => {
        // Fallback to static catalog
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  const recommendedDevice: 'android' | 'tv' | 'samsung' | 'web' = isTvDevice
    ? 'tv'
    : isAndroid
    ? 'android'
    : 'web';

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://naimcine.ai.studio';
  const m3uUrl = `${originUrl}/naim-cine.m3u`;
  const m3uDownloadUrl = `${originUrl}/naim-cine.m3u?download=1`;
  const epgUrl = `${originUrl}/epg.xml`;
  const epgDownloadUrl = `${originUrl}/epg.xml?download=1`;
  const tvReceiverUrl = `${originUrl}/tv`;

  const handleCopy = async (text: string, type: 'm3u' | 'epg' | 'tv') => {
    triggerHaptic('medium');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadApk = async (
    flavor: 'mobile' | 'tv',
    url: string,
    filename: string
  ) => {
    if (apkDownloading) return;
    triggerHaptic('medium');
    setApkDownloading(flavor);
    setApkError(null);
    const res = await triggerApkDownload(url, filename);
    setApkDownloading(null);
    if (res.ok) {
      setApkDone(flavor);
      setTimeout(() => setApkDone(null), 3000);
    } else {
      setApkError(
        res.error ||
          pickLang(lang, {
            es: 'No se pudo iniciar la descarga',
            ca: 'No s’ha pogut iniciar la descàrrega',
            en: 'Could not start download',
          })
      );
    }
  };

  const handleInstallWeb = async () => {
    triggerHaptic('medium');
    if (pwa.isInstallable) {
      await pwa.install();
      return;
    }
    setShowWebSteps((v) => !v);
  };

  // Category filter options
  const categoryFilters = useMemo(() => {
    const counts: Record<string, number> = { all: dynamicChannels.length };
    dynamicChannels.forEach((c) => {
      const cat = c.category || 'generalistas';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    return [
      { id: 'all', label: `Todos (${dynamicChannels.length})` },
      { id: 'movistar', label: `Fútbol M+ (${counts['movistar'] || 0})` },
      { id: 'dazn', label: `DAZN & F1 (${counts['dazn'] || 0})` },
      { id: 'generalistas', label: `TDT España (${counts['generalistas'] || 0})` },
      { id: 'cine_series', label: `Cine & Series (${counts['cine_series'] || 0})` },
      { id: 'documentales', label: `Documentales (${counts['documentales'] || 0})` },
      { id: 'bein_arabic', label: `beIN Sports (${counts['bein_arabic'] || 0})` },
      { id: 'marruecos', label: `Marruecos (${counts['marruecos'] || 0})` },
      { id: 'europa_tv', label: `TV Europa (${counts['europa_tv'] || 0})` },
      { id: 'usa_tv', label: `EE.UU. (${counts['usa_tv'] || 0})` },
      { id: 'infantil_autonomicas', label: `Autonómicas (${counts['infantil_autonomicas'] || 0})` },
    ];
  }, [dynamicChannels]);

  // Filtered channels list
  const filteredChannels = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    return dynamicChannels.filter((c) => {
      const matchCat = selectedCategory === 'all' || c.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.groupTitle && c.groupTitle.toLowerCase().includes(q)) ||
        (c.shortMark && c.shortMark.toLowerCase().includes(q)) ||
        String(c.dial).includes(q)
      );
    });
  }, [dynamicChannels, selectedCategory, channelSearch]);

  const cardClass = (highlighted: boolean) =>
    `w-full min-h-14 px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.98] transition-all duration-150 ${
      highlighted
        ? 'bg-[#9146FF]/16 border-[#9146FF]/60 text-white'
        : 'bg-white/[0.045] hover:bg-white/[0.09] border-white/[0.09] text-white'
    }`;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth={viewingSection === 'samsung_tizen' ? 'sm:max-w-xl' : 'sm:max-w-md'}
      icon={<Download className="w-5 h-5 text-[#BF94FF]" />}
      title={
        viewingSection === 'samsung_tizen'
          ? pickLang(lang, {
              es: 'Samsung Tizen / LG webOS',
              ca: 'Samsung Tizen / LG webOS',
              en: 'Samsung Tizen / LG webOS',
              zh: '三星 Tizen / LG webOS 安装指南',
            })
          : pickLang(lang, {
              es: 'Instalar NAIMCINE',
              ca: 'Instal·lar NAIMCINE',
              en: 'Install NAIMCINE',
              zh: '安装 NAIMCINE',
            })
      }
      subtitle={
        viewingSection === 'samsung_tizen'
          ? pickLang(lang, {
              es: 'Lista M3U con +160 canales, guía EPG XML y tutorial de instalación',
              ca: 'Llista M3U amb +160 canals, guia EPG XML i tutorial d’instal·lació',
              en: 'M3U playlist with 160+ channels, EPG XML guide & setup tutorial',
              zh: '提供 160+ 频道 M3U 播放列表与 EPG XML 电子节目指南',
            })
          : pickLang(lang, {
              es: 'Elige tu Smart TV, Android APK, Google TV o navegador',
              ca: 'Tria la teva Smart TV, Android APK, Google TV o navegador',
              en: 'Choose your Smart TV, Android APK, Google TV, or browser',
              zh: '选择您的设备随时快速访问',
            })
      }
    >
      {viewingSection === 'main' ? (
        <div className="space-y-2.5">
          {/* OPTION 1: Samsung Tizen & LG webOS (M3U + EPG XML + Guide) */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setViewingSection('samsung_tizen');
            }}
            className={cardClass(true)}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-[#9146FF]/20 border border-[#9146FF]/40 flex items-center justify-center shrink-0">
                <Tv className="w-5 h-5 text-[#BF94FF]" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="block text-sm font-bold text-white">
                    Samsung Tizen / LG webOS
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                    M3U + XML
                  </span>
                </span>
                <span className="block text-xs text-zinc-300 truncate">
                  {pickLang(lang, {
                    es: 'Guía paso a paso, lista M3U y guía EPG con +160 canales',
                    ca: 'Guia pas a pas, llista M3U i guia EPG amb +160 canals',
                    en: 'Step-by-step guide, M3U playlist & EPG XML with 160+ channels',
                  })}
                </span>
              </span>
            </span>
            <div className="flex items-center gap-1 shrink-0 text-[#BF94FF]">
              <span className="text-xs font-bold hidden sm:inline">Ver Guía</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </button>

          {/* OPTION 2: Android APK */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() =>
                void handleDownloadApk('mobile', '/RIFFAN-TV.apk?v=300', 'NAIMCINE.apk')
              }
              className={cardClass(recommendedDevice === 'android')}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                  {apkDownloading === 'mobile' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-[#BF94FF]" />
                  ) : apkDone === 'mobile' ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Smartphone className="w-5 h-5 text-[#BF94FF]" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">Android (APK Oficial)</span>
                  <span className="block text-xs text-zinc-400">
                    {pickLang(lang, {
                      es: 'Descarga directa para móvil o tablet Android',
                      ca: 'Descàrrega directa per a mòbil o tauleta Android',
                      en: 'Direct APK download for Android phone or tablet',
                    })}
                  </span>
                </span>
              </span>
              {recommendedDevice === 'android' && (
                <span className="px-2.5 py-1 rounded-full bg-[#9146FF] text-[10px] font-bold text-white shrink-0">
                  {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
                </span>
              )}
            </button>

            {pwa.isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  triggerHaptic('medium');
                  await pwa.install();
                }}
                className="w-full min-h-10 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#BF94FF]" />
                <span>
                  {pickLang(lang, {
                    es: 'O instalar versión web instantánea (PWA)',
                    ca: 'O instal·lar versió web instantània (PWA)',
                    en: 'Or install instant web app (PWA)',
                  })}
                </span>
              </button>
            )}
          </div>

          {/* OPTION 3: Google TV / Chromecast APK */}
          <button
            type="button"
            onClick={() =>
              void handleDownloadApk('tv', '/RIFFAN-TV-TV.apk?v=300', 'NAIMCINE-TV.apk')
            }
            className={cardClass(recommendedDevice === 'tv')}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                {apkDownloading === 'tv' ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#BF94FF]" />
                ) : apkDone === 'tv' ? (
                  <Check className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Tv className="w-5 h-5 text-[#BF94FF]" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">Google TV / Chromecast (APK)</span>
                <span className="block text-xs text-zinc-400">
                  {pickLang(lang, {
                    es: 'Adaptada para televisor y control con mando físico D-Pad',
                    ca: 'Adaptada per a televisor i control amb comandament físic',
                    en: 'Tailored for TV screens with physical remote D-Pad navigation',
                  })}
                </span>
              </span>
            </span>
            {recommendedDevice === 'tv' && (
              <span className="px-2.5 py-1 rounded-full bg-[#9146FF] text-[10px] font-bold text-white shrink-0">
                {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
              </span>
            )}
          </button>

          {/* OPTION 4: iPhone / PC */}
          <button
            type="button"
            onClick={() => void handleInstallWeb()}
            className={cardClass(recommendedDevice === 'web')}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 text-[#BF94FF]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">iPhone / iPad / PC</span>
                <span className="block text-xs text-zinc-400">
                  {pickLang(lang, {
                    es: 'Acceso directo en pantalla de inicio con Safari o Chrome',
                    ca: 'Accés ràpid des del navegador a la pantalla d’inici',
                    en: 'Quick browser install on your home screen',
                  })}
                </span>
              </span>
            </span>
            {recommendedDevice === 'web' && (
              <span className="px-2.5 py-1 rounded-full bg-[#9146FF] text-[10px] font-bold text-white shrink-0">
                {pickLang(lang, { es: 'Tu dispositivo', ca: 'El teu dispositiu', en: 'Your device' })}
              </span>
            )}
          </button>

          {apkError && (
            <p className="text-xs text-rose-300 px-1 pt-1">{apkError}</p>
          )}

          {showWebSteps && (
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-300 space-y-2">
              {isIOS ? (
                <div className="flex items-center gap-2">
                  <Share className="w-4 h-4 text-[#BF94FF] shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'Pulsa Compartir en Safari y elige «Añadir a pantalla de inicio».',
                      ca: 'Prem Compartir a Safari i tria «Afegir a la pantalla d’inici».',
                      en: 'Tap Share in Safari and pick "Add to Home Screen".',
                    })}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <MoreVertical className="w-4 h-4 text-[#BF94FF] shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'Abre el menú del navegador y pulsa «Instalar aplicación».',
                      ca: 'Obre el menú del navegador i prem «Instal·lar aplicació».',
                      en: 'Open your browser menu and select "Install app".',
                    })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* DEDICATED SAMSUNG TIZEN / LG WEBOS / SMART TV GUIDE & CHANNELS SCREEN */
        <div className="space-y-4">
          {/* Back button & top navigation */}
          <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setViewingSection('main');
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Volver a opciones',
                  ca: 'Tornar a opcions',
                  en: 'Back to options',
                })}
              </span>
            </button>

            <span className="px-2.5 py-0.5 rounded-full bg-[#9146FF]/20 border border-[#9146FF]/40 text-[#DFCCFF] text-[11px] font-bold flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-[#BF94FF] animate-pulse" />
              <span>+{totalCount} Canales en Directo</span>
            </span>
          </div>

          {/* Quick Action Download & Copy Grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Download M3U */}
            <a
              href={m3uDownloadUrl}
              download="NAIMCINE-Samsung-Tizen.m3u"
              onClick={() => triggerHaptic('medium')}
              className="p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] flex flex-col items-start gap-1 transition-colors group"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#BF94FF]">
                  Lista IPTV
                </span>
                <Download className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
              </div>
              <span className="text-xs font-bold text-white">Descargar M3U</span>
              <span className="text-[10px] text-zinc-400 truncate w-full">
                Archivo .m3u para Smart TV
              </span>
            </a>

            {/* Download EPG XML */}
            <a
              href={epgDownloadUrl}
              download="NAIMCINE-EPG.xml"
              onClick={() => triggerHaptic('medium')}
              className="p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] flex flex-col items-start gap-1 transition-colors group"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Guía TV (EPG)
                </span>
                <Download className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
              </div>
              <span className="text-xs font-bold text-white">Descargar XML EPG</span>
              <span className="text-[10px] text-zinc-400 truncate w-full">
                Horarios y logos en .xml
              </span>
            </a>
          </div>

          {/* Sub Navigation Tabs: Guía | Canales | Enlaces */}
          <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setTizenTab('guide');
              }}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                tizenTab === 'guide'
                  ? 'bg-[#9146FF] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Guía TV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setTizenTab('channels');
              }}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                tizenTab === 'channels'
                  ? 'bg-[#9146FF] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Canales ({dynamicChannels.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setTizenTab('urls');
              }}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                tizenTab === 'urls'
                  ? 'bg-[#9146FF] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Copiar URLs</span>
            </button>
          </div>

          {/* TAB 1: STEP-BY-STEP SETUP GUIDE */}
          {tizenTab === 'guide' && (
            <div className="space-y-3">
              {/* Samsung Tizen Instructions */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-[#9146FF]/20 text-[#BF94FF] text-xs font-black flex items-center justify-center">
                    1
                  </span>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Samsung Smart TV (Tizen OS)
                  </h4>
                </div>
                <ol className="text-xs text-zinc-300 space-y-1.5 pl-8 list-decimal">
                  <li>
                    Abre la tienda <strong>Samsung Apps</strong> en tu televisor.
                  </li>
                  <li>
                    Instala cualquiera de estas aplicaciones gratuitas recomendadas:{' '}
                    <strong className="text-white">IBO Player</strong>,{' '}
                    <strong className="text-white">Smart IPTV (SIPTV)</strong> o{' '}
                    <strong className="text-white">IPTV Smarters Pro</strong>.
                  </li>
                  <li>
                    Introduce la URL de tu lista M3U (o súbela desde la web de la app como{' '}
                    <code className="text-[#BF94FF]">iboplayer.com</code>).
                  </li>
                  <li>
                    En el campo EPG, añade la URL XML:{' '}
                    <code className="text-emerald-300">{epgUrl}</code>.
                  </li>
                  <li>
                    ¡Listo! Tendrás más de 160 canales organizados por carpetas con logos y guía.
                  </li>
                </ol>
              </div>

              {/* LG webOS Instructions */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-black flex items-center justify-center">
                    2
                  </span>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    LG Smart TV (webOS)
                  </h4>
                </div>
                <ol className="text-xs text-zinc-300 space-y-1.5 pl-8 list-decimal">
                  <li>
                    Abre el <strong>LG Content Store</strong> en tu TV LG.
                  </li>
                  <li>
                    Descarga <strong className="text-white">IBO Player</strong>,{' '}
                    <strong className="text-white">IPTV Smarters</strong> o{' '}
                    <strong className="text-white">SS IPTV</strong>.
                  </li>
                  <li>
                    Carga el enlace M3U y el enlace XML EPG facilitados en la pestaña{' '}
                    <strong>«Copiar URLs»</strong>.
                  </li>
                  <li>
                    Disfruta de las señales en directo 1080p con zapping rápido desde el mando.
                  </li>
                </ol>
              </div>

              {/* Native TV Web Browser Method (Zero App Install) */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#9146FF]/15 to-transparent border border-[#9146FF]/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#BF94FF]" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Método Directo: Navegador Web TV (/tv)
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-[#BF94FF] uppercase bg-[#9146FF]/20 px-2 py-0.5 rounded-full">
                    Sin instalar nada
                  </span>
                </div>
                <p className="text-xs text-zinc-300">
                  Abre el navegador integrado de tu televisor Samsung o LG y entra directamente en{' '}
                  <strong className="text-white">{tvReceiverUrl}</strong>. Se adaptará automáticamente
                  a pantalla completa con control por mando a distancia.
                </p>
                <a
                  href={tvReceiverUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full min-h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Abrir /tv en este dispositivo</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* TAB 2: ALL CHANNELS PREVIEW & SEARCH */}
          {tizenTab === 'channels' && (
            <div className="space-y-3">
              {/* Channel search bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={channelSearch}
                  onChange={(e) => setChannelSearch(e.target.value)}
                  placeholder="Buscar canal: La 1, Movistar, DAZN, Nat Geo, beIN..."
                  className="w-full min-h-10 pl-9 pr-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#9146FF]"
                />
              </div>

              {/* Category Pills Scroller */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {categoryFilters.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedCategory(cat.id);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-[#9146FF] text-white'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Channels count indicator */}
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                <span>Mostrando {filteredChannels.length} canales</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Flame className="w-3 h-3" />
                  HD 1080p sin anuncios
                </span>
              </div>

              {/* Scrollable Channels List */}
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 divide-y divide-white/[0.04]">
                {filteredChannels.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-400">
                    No se encontraron canales con ese término de búsqueda.
                  </div>
                ) : (
                  filteredChannels.map((ch) => (
                    <div
                      key={ch.id}
                      className="pt-1.5 first:pt-0 flex items-center justify-between gap-3 text-left py-1"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] text-white shrink-0 shadow-sm"
                          style={{ backgroundColor: ch.brandTone || '#9146FF' }}
                        >
                          {ch.shortMark || String(ch.dial)}
                        </span>
                        <div className="min-w-0">
                          <span className="block text-xs font-bold text-white truncate">
                            {ch.name}
                          </span>
                          <span className="block text-[10px] text-zinc-400 truncate">
                            {ch.groupTitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 text-[10px] font-semibold">
                          Dial {ch.dial}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                          {ch.quality || '1080p'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COPYABLE URLS & IPTV SERVERS */}
          {tizenTab === 'urls' && (
            <div className="space-y-3.5">
              {/* M3U URL Box */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-[#BF94FF]" />
                    URL de la Lista M3U
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopy(m3uUrl, 'm3u')}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#BF94FF] hover:text-[#DFCCFF] transition-colors cursor-pointer"
                  >
                    {copiedType === 'm3u' ? (
                      <>
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar URL</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06] font-mono text-xs text-zinc-200 select-all break-all">
                  {m3uUrl}
                </div>
                <p className="text-[11px] text-zinc-400">
                  Introduce esta dirección en el campo <strong>«Playlist URL»</strong> o{' '}
                  <strong>«M3U Link»</strong> de tu app IPTV.
                </p>
              </div>

              {/* EPG XML URL Box */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                    URL de la Guía EPG XML
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopy(epgUrl, 'epg')}
                    className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    {copiedType === 'epg' ? (
                      <>
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar URL</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06] font-mono text-xs text-zinc-200 select-all break-all">
                  {epgUrl}
                </div>
                <p className="text-[11px] text-zinc-400">
                  Introduce esta dirección en el campo <strong>«EPG URL»</strong> o{' '}
                  <strong>«XMLTV Link»</strong> para cargar la programación completa.
                </p>
              </div>

              {/* Web TV Direct Link */}
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-white">Receptor Web TV (/tv)</span>
                  <span className="block text-[11px] text-zinc-400 truncate">{tvReceiverUrl}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy(tvReceiverUrl, 'tv')}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedType === 'tv' ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[#BF94FF]" />
                  )}
                  <span>{copiedType === 'tv' ? '¡Listo!' : 'Copiar'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
};

export const OfflineIndicator: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 px-3.5 py-2 text-xs font-semibold text-zinc-950 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-zinc-950" />
      <span>
        {pickLang(lang, {
          es: 'Sin conexión — Reconectando...',
          ca: 'Sense connexió — Reconnectant...',
          en: 'Offline — Reconnecting...',
          zh: '离线 — 正在重连...',
        })}
      </span>
    </div>
  );
};
