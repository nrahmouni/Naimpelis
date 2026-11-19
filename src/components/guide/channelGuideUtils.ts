import type { ChannelLiveEpg, EpgProgramItem, SpanishTdtChannel, TdtCategory } from '../../types';
import type { TvRegionId } from '../ui/ChannelLogoBadge';
import type { FlagCode } from '../ui/LanguageBadge';

export type GuideViewTab = 'channel' | 'all';

export const REGION_FILTER_TABS: {
  id: TvRegionId;
  flagCode: FlagCode;
  label: { es: string; ca: string; en: string };
}[] = [
  { id: 'all', flagCode: 'all', label: { es: 'Todos', ca: 'Tots', en: 'All' } },
  { id: 'es', flagCode: 'es', label: { es: 'España', ca: 'Espanya', en: 'Spain' } },
  { id: 'ar', flagCode: 'ar', label: { es: 'beIN العربية', ca: 'beIN العربية', en: 'beIN Arabic' } },
  { id: 'ma', flagCode: 'ma', label: { es: 'Marruecos', ca: 'Marroc', en: 'Morocco' } },
  { id: 'docs', flagCode: 'docs', label: { es: 'Documentales', ca: 'Documentals', en: 'Docs' } },
  { id: 'us', flagCode: 'us', label: { es: 'EE.UU.', ca: 'EUA', en: 'USA' } },
  { id: 'eu', flagCode: 'eu', label: { es: 'Europa', ca: 'Europa', en: 'Europe' } },
  { id: 'latam', flagCode: 'lat', label: { es: 'Latam / ES', ca: 'Latam / ES', en: 'Latam / ES' } },
  { id: 'uk', flagCode: 'uk', label: { es: 'UK (EN)', ca: 'UK (EN)', en: 'UK (EN)' } },
  { id: 'cn', flagCode: 'cn', label: { es: 'China (中文)', ca: 'Xina (中文)', en: 'China (中文)' } },
];

export const CATEGORY_FILTER_ORDER: { id: 'all' | TdtCategory; label: { es: string; ca: string; en: string } }[] = [
  { id: 'all', label: { es: 'Todos', ca: 'Tots', en: 'All' } },
  { id: 'generalistas', label: { es: 'Generalistas', ca: 'Generalistes', en: 'Main TV' } },
  { id: 'bein_arabic', label: { es: 'beIN العربية', ca: 'beIN العربية', en: 'beIN Arabic' } },
  { id: 'marruecos', label: { es: 'Marruecos', ca: 'Marroc', en: 'Morocco' } },
  { id: 'documentales', label: { es: 'Documentales', ca: 'Documentals', en: 'Docs' } },
  { id: 'usa_tv', label: { es: 'EE.UU.', ca: 'EUA', en: 'USA' } },
  { id: 'europa_tv', label: { es: 'Europa', ca: 'Europa', en: 'Europe' } },
  { id: 'noticias_intl', label: { es: 'Al Jazeera / MENA', ca: 'Al Jazeera / MENA', en: 'Al Jazeera / MENA' } },
  { id: 'cine_series', label: { es: 'Cine y Series', ca: 'Cinema i Sèries', en: 'Movies & Series' } },
  { id: 'entretenimiento', label: { es: 'Entretenimiento', ca: 'Entreteniment', en: 'Entertainment' } },
  { id: 'noticias_deportes', label: { es: 'Noticias y Deporte', ca: 'Notícies i Esports', en: 'News & Sports' } },
  { id: 'movistar', label: { es: 'Movistar+', ca: 'Movistar+', en: 'Movistar+' } },
  { id: 'dazn', label: { es: 'DAZN', ca: 'DAZN', en: 'DAZN' } },
  { id: 'espn', label: { es: 'ESPN', ca: 'ESPN', en: 'ESPN' } },
  { id: 'dsports', label: { es: 'DSports', ca: 'DSports', en: 'DSports' } },
  { id: 'beinsports', label: { es: 'beIN ES', ca: 'beIN ES', en: 'beIN ES' } },
  { id: 'uk_sports', label: { es: 'UK Sports', ca: 'UK Sports', en: 'UK Sports' } },
  { id: 'china_football', label: { es: 'China 中文', ca: 'Xina 中文', en: 'China 中文' } },
  { id: 'infantil_autonomicas', label: { es: 'Infantil / Auton.', ca: 'Infantil / Auton.', en: 'Kids / Regional' } },
];

export function computeLiveProgramSnapshot(
  raw: ChannelLiveEpg | undefined,
  clockMs: number
): ChannelLiveEpg | null {
  if (!raw) return null;
  const schedule: EpgProgramItem[] =
    Array.isArray(raw.upcoming) && raw.upcoming.length > 0
      ? raw.upcoming
      : ([raw.now, raw.next].filter(Boolean) as EpgProgramItem[]);
  if (schedule.length === 0) return raw;

  const activeIdx = schedule.findIndex((p) => p.startMs <= clockMs && p.stopMs > clockMs);
  if (activeIdx === -1) {
    const nextUpcoming = schedule.find((p) => p.startMs > clockMs) || null;
    return {
      ...raw,
      now: raw.now && raw.now.stopMs > clockMs ? raw.now : null,
      next: nextUpcoming,
      upcoming: schedule.filter((p) => p.stopMs > clockMs),
    };
  }

  const nowProg = schedule[activeIdx];
  const nextProg = schedule[activeIdx + 1] || null;
  const duration = Math.max(60_000, nowProg.stopMs - nowProg.startMs);
  const elapsed = Math.max(0, Math.min(duration, clockMs - nowProg.startMs));
  const progressPct = Math.max(2, Math.min(100, Math.round((elapsed / duration) * 100)));
  const remainingMin = Math.max(1, Math.ceil((nowProg.stopMs - clockMs) / 60_000));

  return {
    channelId: raw.channelId,
    now: nowProg,
    next: nextProg,
    progressPct,
    remainingMin,
    upcoming: schedule.filter((p) => p.stopMs > clockMs),
  };
}

export function resolveChannelMatch(
  channels: SpanishTdtChannel[],
  title: string,
  rawUrl?: string,
  subtitle?: string
): SpanishTdtChannel | null {
  if (channels.length === 0) return null;
  if (rawUrl) {
    const byUrl = channels.find((ch) =>
      ch.channels.some((sig) => sig.sourceUrl === rawUrl)
    );
    if (byUrl) return byUrl;
  }

  const norm = (val: string) =>
    val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const targetTitle = norm(title || '');
  if (targetTitle) {
    const exact = channels.find((ch) => norm(ch.name) === targetTitle);
    if (exact) return exact;
    const partial = channels.find(
      (ch) =>
        targetTitle.includes(norm(ch.name)) ||
        norm(ch.name).includes(targetTitle)
    );
    if (partial) return partial;
  }

  if (subtitle) {
    const subNorm = norm(subtitle);
    const bySub = channels.find((ch) => subNorm.includes(norm(ch.name)));
    if (bySub) return bySub;
  }

  return null;
}

export function cleanEpgDescription(desc?: string): string {
  if (!desc) return '';
  return desc.replace(/^\([^)]+\)\s*/, '').trim();
}
