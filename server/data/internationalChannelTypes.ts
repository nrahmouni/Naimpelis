import type { TrackRecord } from '../extractors/httpHelpers.ts';

export type InternationalTdtCategory =
  | 'bein_arabic'
  | 'marruecos'
  | 'documentales'
  | 'usa_tv'
  | 'europa_tv'
  | 'noticias_intl';

export interface InternationalTdtChannelDef {
  id: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  network: string;
  category: InternationalTdtCategory;
  quality: string;
  description: string;
  logoUrl?: string;
  channels: TrackRecord[];
}
