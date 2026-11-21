import type { SpanishTdtChannelDef } from './tdtTypes.ts';
import {
  MEGA_CHIRINGUITO_FAST_URL,
  MEGA_CHIRINGUITO_TV_URL,
} from '../services/chiringuitoLiveService.ts';

const MEGA_LOGO = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/spain/mega-es.png';

export const CHIRINGUITO_CHANNELS: SpanishTdtChannelDef[] = [
  {
    id: 'chiringuito-inside-live',
    dial: 151,
    name: 'Chiringuito Inside · Directo',
    shortMark: 'CHIRINGUITO',
    brandTone: '#E11D48',
    network: 'El Chiringuito de Jugones',
    category: 'entretenimiento',
    quality: '1080p Live',
    logoUrl: MEGA_LOGO,
    description:
      'Directo de Chiringuito Inside entre tiempos (Barça / Madrid) y tertulia deportiva en vivo',
    channels: [
      {
        id: 'chiringuito-inside-yt',
        label: 'Chiringuito Inside · YouTube Live',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'chiringuito://inside',
        resolverType: 'youtube',
      },
      {
        id: 'chiringuito-live-yt',
        label: 'El Chiringuito Directo · YouTube',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'chiringuito://live',
        resolverType: 'youtube',
      },
      {
        id: 'chiringuito-mega-hd',
        label: 'MEGA TV · Señal 1080p HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: MEGA_CHIRINGUITO_TV_URL,
        resolverType: 'tdt_hls',
      },
      {
        id: 'chiringuito-mega-fast',
        label: 'MEGA TV · Ligera 720p',
        lang: 'ES',
        quality: '720p',
        sourceUrl: MEGA_CHIRINGUITO_FAST_URL,
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'chiringuito-jugones-tv',
    dial: 152,
    name: 'El Chiringuito de Jugones (TV)',
    shortMark: 'MEGA',
    brandTone: '#DC2626',
    network: 'Atresmedia · El Chiringuito',
    category: 'entretenimiento',
    quality: '1080p HD',
    logoUrl: MEGA_LOGO,
    description: 'Emisión directa de El Chiringuito de Jugones (Señal YouTube Live + Mega TDT)',
    channels: [
      {
        id: 'chiringuito-tv-yt',
        label: 'YouTube Live · Oficial',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'chiringuito://live',
        resolverType: 'youtube',
      },
      {
        id: 'chiringuito-tv-mega',
        label: 'MEGA TDT 1080p HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: MEGA_CHIRINGUITO_TV_URL,
        resolverType: 'tdt_hls',
      },
    ],
  },
];
