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
    | 'infantil_autonomicas'
    | 'world_cricket'
    | 'elahmad_mena'
    | 'adrar_europa'
    | 'famelack_movies'
    | 'kids_world';
  quality: string;
  description: string;
  logoUrl?: string;
  countryCode?: string;
  sourceHub?: 'tdt' | 'famelack' | 'elahmad' | 'freetv' | 'iptvorg' | 'sportzfy';
  channels: TrackRecord[];
}
