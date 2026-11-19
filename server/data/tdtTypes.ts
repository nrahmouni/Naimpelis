import type { TrackRecord } from '../extractors/httpHelpers.ts';

export interface SpanishTdtChannelDef {
  id: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  network: string;
  category:
    | 'movistar'
    | 'dazn'
    | 'uk_sports'
    | 'china_football'
    | 'beinsports'
    | 'bein_arabic'
    | 'marruecos'
    | 'documentales'
    | 'usa_tv'
    | 'europa_tv'
    | 'noticias_intl'
    | 'espn'
    | 'dsports'
    | 'tnt_space'
    | 'generalistas'
    | 'cine_series'
    | 'entretenimiento'
    | 'noticias_deportes'
    | 'infantil_autonomicas';
  quality: string;
  description: string;
  logoUrl?: string;
  channels: TrackRecord[];
}
