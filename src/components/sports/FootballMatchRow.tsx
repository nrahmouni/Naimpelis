import React from 'react';
import { Check, ChevronRight, Columns2, Loader2, Play, Star } from 'lucide-react';
import type {
  AppLanguage,
  FavoriteChannelItem,
  FootballMatchboardItem,
  MultiScreenSourceInput,
  StreamTrack,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { buildChannelFavId } from '../../utils/storage';
import { TeamCrestImg, hasValidScore } from './FootballMatchboardParts';
import {
  getTrackLanguageBucket,
  isPrioritySpanishHighlightMatch,
  pickPreferredChannelIndex,
  resolveRecommendedSportsLang,
} from './FootballMatchboardHelpers';

interface FootballMatchRowProps {
  item: FootballMatchboardItem;
  lang: AppLanguage;
  shareRoomId?: string;
  showLeagueBadge?: boolean;
  showZhIndicator?: boolean;
  activeVideoRawUrl?: string;
  activeMultiUrls?: string[];
  loadingItemId?: string | null;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (entry: Omit<FavoriteChannelItem, 'addedAt'>) => void;
  onOpenMatchSheet: (item: FootballMatchboardItem) => void;
  onQuickWatch: (e: React.MouseEvent, item: FootballMatchboardItem, channelIndex: number) => void;
  onAddToMultiScreen?: (source: MultiScreenSourceInput) => void;
}

function formatQuickChannelLabel(ch: StreamTrack, lang: AppLanguage): string {
  const raw = String(ch.label || '').trim();
  if (!raw) {
    return pickLang(lang, {
      es: 'Ver señal',
      ca: 'Veure senyal',
      en: 'Watch feed',
      zh: '观看直播',
      rif: 'Wali lqanat',
    });
  }
  const cleaned = raw
    .replace(/\b(disney\s*\+|star\s*\+|vix\s*\+|paramount\s*\+|peacock)\b/gi, 'Directo')
    .replace(/\s*\(Español\)/gi, '')
    .replace(/\s*\(English\)/gi, '')
    .replace(/\s*\(UK\)/gi, '')
    .replace(/\s*\(UK\s*1080p\)/gi, '')
    .replace(/\s*\(Oficial\s*España\)/gi, '')
    .replace(/\s*\(Oficial\)/gi, '')
    .replace(/\s*·\s*(Champions|Premier League|Nations League|Selecciones)/gi, '')
    .replace(/\s*\(Oficial\s*·\s*Guía\s*TV\)/gi, '')
    .replace(/\s*Señal\s*\d*/gi, '')
    .replace(/\s*1080p|\s*720p|\s*HD/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || /^(disney|star|vix|paramount)\+?$/i.test(cleaned)) {
    return pickLang(lang, {
      es: 'Directo HD',
      ca: 'Directe HD',
      en: 'Live HD',
      zh: '高清直播',
      rif: 'Srid HD',
    });
  }
  return cleaned;
}

export const FootballMatchRow = React.memo<FootballMatchRowProps>(({
  item,
  lang,
  showLeagueBadge = false,
  showZhIndicator = false,
  activeVideoRawUrl,
  activeMultiUrls = [],
  loadingItemId,
  isChannelFavorited,
  onToggleChannelFavorite,
  onOpenMatchSheet,
  onQuickWatch,
  onAddToMultiScreen,
}) => {
  const recommendedSportsLang = showZhIndicator ? 'ZH' : resolveRecommendedSportsLang(lang);
  const preferredIdx = React.useMemo(
    () => pickPreferredChannelIndex(item.channels, lang, showZhIndicator),
    [item.channels, lang, showZhIndicator]
  );

  const primaryCh = preferredIdx >= 0 ? item.channels[preferredIdx] : item.channels[0];
  const favId = buildChannelFavId(
    primaryCh?.sourceUrl || item.eventId || item.id,
    `${item.homeTeam} vs ${item.awayTeam}`
  );
  const isSaved = isChannelFavorited(favId);
  const isPlayingThisMatch = item.channels.some(
    (c) => activeVideoRawUrl && c.sourceUrl === activeVideoRawUrl
  );
  const isInMultiScreen = item.channels.some(
    (c) => c.sourceUrl && activeMultiUrls.includes(c.sourceUrl)
  );
  const isExtracting = Boolean(loadingItemId?.startsWith(item.id));
  const showNumericScore = hasValidScore(item.homeScore, item.awayScore);
  const isFeaturedClub = isPrioritySpanishHighlightMatch(item.homeTeam, item.awayTeam);
  const hasZhChannel =
    recommendedSportsLang === 'ZH' &&
    item.channels.some((c) => getTrackLanguageBucket(c) === 'ZH');

  const showNonDefaultStatus =
    item.statusState === 'finished' ||
    (item.statusLabel &&
      !/^por empezar$/i.test(item.statusLabel.trim()) &&
      item.statusState !== 'live');

  const showMatchday =
    Boolean(item.matchdayLabel) &&
    item.matchdayLabel!.toLowerCase() !== String(item.leagueName || '').toLowerCase();

  const broadcasterHint = React.useMemo(() => {
    if (recommendedSportsLang === 'EN') {
      if (item.verifiedTvGuide?.en?.length) {
        return { name: item.verifiedTvGuide.en.slice(0, 2).join(' · '), color: '#38BDF8' };
      }
      if (item.spanishBroadcaster) {
        return { name: item.spanishBroadcaster.name, color: item.spanishBroadcaster.badgeColor };
      }
      if (primaryCh) {
        return { name: formatQuickChannelLabel(primaryCh, lang), color: '#94A3B8' };
      }
      return null;
    }
    if (recommendedSportsLang === 'ZH') {
      if (item.verifiedTvGuide?.zh?.length) {
        return { name: item.verifiedTvGuide.zh.slice(0, 2).join(' · '), color: '#F87171' };
      }
      if (item.spanishBroadcaster) {
        return { name: item.spanishBroadcaster.name, color: item.spanishBroadcaster.badgeColor };
      }
      if (primaryCh) {
        return { name: formatQuickChannelLabel(primaryCh, lang), color: '#94A3B8' };
      }
      return null;
    }
    if (item.spanishBroadcaster) {
      return { name: item.spanishBroadcaster.name, color: item.spanishBroadcaster.badgeColor };
    }
    if (item.verifiedTvGuide?.es?.length) {
      return { name: item.verifiedTvGuide.es.slice(0, 2).join(' · '), color: '#F59E0B' };
    }
    if (item.verifiedTvGuide?.en?.length) {
      return { name: item.verifiedTvGuide.en.slice(0, 2).join(' · '), color: '#38BDF8' };
    }
    if (primaryCh) {
      return { name: formatQuickChannelLabel(primaryCh, lang), color: '#94A3B8' };
    }
    return null;
  }, [recommendedSportsLang, item.verifiedTvGuide, item.spanishBroadcaster, primaryCh, lang]);

  // Prioritize preferred channel index first while preserving all original indices
  const orderedFeedEntries = React.useMemo(() => {
    if (item.channels.length === 0) return [];
    const entries = item.channels.map((ch, idx) => ({ ch, idx }));
    if (preferredIdx > 0 && preferredIdx < entries.length) {
      const [pref] = entries.splice(preferredIdx, 1);
      entries.unshift(pref);
    }
    return entries;
  }, [item.channels, preferredIdx]);

  return (
    <article
      className={`cv-row-auto relative rounded-2xl p-4 space-y-3 border transition-colors ${
        isPlayingThisMatch
          ? 'bg-[#7C3AED]/[0.14] border-[#7C3AED] shadow-[0_8px_28px_rgba(124,58,237,0.22)]'
          : isFeaturedClub
          ? 'bg-[#0D0D12] border-[#7C3AED]/35 hover:border-[#7C3AED]/70'
          : 'bg-[#0D0D12] border-white/[0.08] hover:border-white/20'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpenMatchSheet(item)}
        aria-label={`${item.homeTeam} vs ${item.awayTeam} (${item.kickoffTime})`}
        className="absolute inset-0 z-0 rounded-2xl cursor-pointer"
      />

      {/* NIVEL 1: Cabecera (Horario / Vivo pulsante + Estrella Favorito con pop spring) */}
      <div className="relative z-[1] flex items-center justify-between gap-2 min-w-0">
        <div className="pointer-events-none flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0 text-xs leading-snug">
          {item.statusState === 'live' ? (
            <span className="inline-flex items-center gap-1.5 text-[#EF4444] font-bold tracking-wide">
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444]" />
              </span>
              <span>
                {pickLang(lang, { es: 'EN VIVO', ca: 'EN DIRECTE', en: 'LIVE', zh: '直播中', rif: 'Srid' })}
                {item.statusLabel && !/^en vivo$/i.test(item.statusLabel) ? ` · ${item.statusLabel}` : ''}
              </span>
            </span>
          ) : (
            <span className="font-bold tabular-nums text-[#A78BFA]">
              {(() => {
                if (item.kickoffDateLabel && item.kickoffDateLabel !== 'Hoy') {
                  if (item.kickoffDateLabel === 'Mañana') {
                    return `${pickLang(lang, { es: 'Mañana', ca: 'Demà', en: 'Tomorrow', zh: '明天', rif: 'Tiwečča' })} · ${item.kickoffTime}`;
                  }
                  return `${item.kickoffDateLabel} · ${item.kickoffTime}`;
                }
                if (!item.kickoffDateLabel && item.kickoffIso) {
                  const madridTodayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
                  const d = new Date(item.kickoffIso);
                  if (!Number.isNaN(d.getTime())) {
                    const itemIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
                    if (itemIso !== madridTodayIso) {
                      const shortLbl = new Intl.DateTimeFormat(
                        lang === 'ca' ? 'ca-ES' : lang === 'en' ? 'en-US' : 'es-ES',
                        { timeZone: 'Europe/Madrid', day: '2-digit', month: 'short' }
                      ).format(d);
                      return `${shortLbl} · ${item.kickoffTime}`;
                    }
                  }
                }
                return `${pickLang(lang, { es: 'Hoy', ca: 'Avui', en: 'Today', zh: '今天', rif: 'Assa' })} · ${item.kickoffTime}`;
              })()}
            </span>
          )}

          {showNonDefaultStatus && (
            <span className="text-zinc-400 font-semibold">· {item.statusLabel}</span>
          )}

          {showLeagueBadge && item.leagueName && (
            <span className="text-sky-300 font-semibold">· {item.leagueName}</span>
          )}

          {showMatchday && (
            <span className="text-zinc-400 font-medium">· {item.matchdayLabel}</span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic('light');
            onToggleChannelFavorite({
              favId,
              title: `${item.homeTeam} vs ${item.awayTeam}`,
              channelLabel:
                primaryCh?.label ||
                item.groupTitle ||
                pickLang(lang, { es: 'Partido', ca: 'Partit', en: 'Match' }),
              channelUrl: primaryCh?.sourceUrl || `match:${item.eventId || item.id}`,
              competition: item.groupTitle,
              sport: 'soccer',
            });
          }}
          aria-pressed={isSaved}
          aria-label={pickLang(lang, {
            es: 'Guardar partido en favoritos',
            ca: 'Desar partit als favorits',
            en: 'Save match to favorites',
            zh: '收藏比赛',
            rif: 'Ḥrez lmatch',
          })}
          className={`relative z-10 min-w-11 min-h-11 -my-1.5 -mr-1.5 rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-colors shrink-0 ${
            isSaved
              ? 'text-[#A78BFA] bg-[#7C3AED]/18'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <Star className={`w-4 h-4 ${isSaved ? 'fill-current nc-pop-spring' : ''}`} />
        </button>
      </div>

      {/* NIVEL 2: Cuerpo Central al 100% de ancho (Local arriba, Visitante abajo, cero truncate) */}
      <div className="relative z-[1] pointer-events-none w-full space-y-2.5">
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <TeamCrestImg
              src={item.homeLogo}
              shortCode={item.homeShort}
              alt={item.homeTeam}
            />
            <span className="text-[15px] font-semibold text-white leading-snug break-words">
              {item.homeTeam}
            </span>
            {hasZhChannel && (
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-200 text-[10px] font-bold shrink-0">
                ZH
              </span>
            )}
          </div>
          {showNumericScore && (
            <span className="text-base font-extrabold tabular-nums text-white shrink-0">
              {item.homeScore}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <TeamCrestImg
              src={item.awayLogo}
              shortCode={item.awayShort}
              alt={item.awayTeam}
            />
            <span className="text-[15px] font-semibold text-white leading-snug break-words">
              {item.awayTeam}
            </span>
          </div>
          {showNumericScore && (
            <span className="text-base font-extrabold tabular-nums text-white shrink-0">
              {item.awayScore}
            </span>
          )}
        </div>
      </div>

      {/* NIVEL 3: Pie de Señales (píldoras táctiles >= 38px con flex-wrap, cero recorte) */}
      <div className="relative z-10 pt-1 flex flex-wrap items-center justify-between gap-2">
        {orderedFeedEntries.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {orderedFeedEntries.map(({ ch, idx }) => {
              const langBucket = getTrackLanguageBucket(ch);
              const isFeedPlaying = Boolean(activeVideoRawUrl && ch.sourceUrl === activeVideoRawUrl);
              const isPrimarySlot = idx === (preferredIdx >= 0 ? preferredIdx : 0);
              return (
                <button
                  key={`${item.id}-feed-${ch.id || idx}-${idx}`}
                  type="button"
                  disabled={Boolean(loadingItemId)}
                  onClick={(e) => onQuickWatch(e, item, idx)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 border ${
                    isFeedPlaying
                      ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_16px_rgba(124,58,237,0.42)]'
                      : isPrimarySlot && langBucket === 'ES'
                      ? 'bg-[#7C3AED]/18 hover:bg-[#7C3AED] border-[#7C3AED]/45 hover:border-[#7C3AED] text-[#E9D5FF] hover:text-white'
                      : isPrimarySlot && langBucket === 'EN'
                      ? 'bg-sky-500/[0.14] hover:bg-sky-600 border-sky-500/40 text-sky-200 hover:text-white'
                      : 'bg-white/[0.06] hover:bg-[#7C3AED] border-white/[0.1] hover:border-[#7C3AED] text-zinc-100 hover:text-white'
                  }`}
                >
                  {isExtracting && isPrimarySlot ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                  )}
                  <span>{formatQuickChannelLabel(ch, lang)}</span>
                </button>
              );
            })}

            {onAddToMultiScreen && primaryCh?.sourceUrl && (
              <button
                type="button"
                disabled={Boolean(loadingItemId)}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('light');
                  const fallbackUrls = orderedFeedEntries
                    .map(({ ch }) => ch.sourceUrl)
                    .filter((u): u is string => Boolean(u && u !== primaryCh.sourceUrl));
                  onAddToMultiScreen({
                    sourceUrl: primaryCh.sourceUrl,
                    fallbackUrls,
                    title: `${item.homeTeam} vs ${item.awayTeam}`,
                    subtitle: item.leagueName || item.groupTitle || 'Multi-Partido HD',
                    matchId: item.id,
                  });
                }}
                aria-label={pickLang(lang, {
                  es: 'Añadir a Multi-Partido',
                  ca: 'Afegir a Multi-Partit',
                  en: 'Add to Multi-View',
                })}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 border whitespace-nowrap shrink-0 ${
                  isInMultiScreen
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                    : 'bg-sky-500/[0.12] hover:bg-sky-500/25 border-sky-400/35 text-sky-200 hover:text-white'
                }`}
              >
                {isInMultiScreen ? (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Columns2 className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {isInMultiScreen
                    ? pickLang(lang, { es: 'En Multi', ca: 'En Multi', en: 'In Multi' })
                    : '+ Multi'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenMatchSheet(item);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 hover:text-white transition-all active:scale-95"
            >
              <span>{pickLang(lang, { es: 'Detalles', ca: 'Detalls', en: 'Details' })}</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            {broadcasterHint ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: broadcasterHint.color }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: broadcasterHint.color }}
                />
                <span>{broadcasterHint.name}</span>
              </span>
            ) : (
              <span className="text-xs font-medium text-zinc-500">
                {item.statusState === 'finished'
                  ? pickLang(lang, { es: 'Finalizado', ca: 'Finalitzat', en: 'Full time' })
                  : pickLang(lang, {
                      es: 'TV por confirmar',
                      ca: 'TV per confirmar',
                      en: 'TV TBA',
                      zh: '频道待定',
                      rif: 'TV urɛad yettwaqqen',
                    })}
              </span>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenMatchSheet(item);
              }}
              aria-label={pickLang(lang, {
                es: 'Ver previa y detalles',
                ca: 'Veure prèvia i detalls',
                en: 'View preview and details',
                zh: '查看赛前详情',
                rif: 'Wali tfassil',
              })}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer bg-white/[0.05] hover:bg-[#7C3AED] border border-white/[0.08] hover:border-[#7C3AED] text-zinc-200 hover:text-white transition-all active:scale-95"
            >
              <span>{pickLang(lang, { es: 'Previa', ca: 'Prèvia', en: 'Preview', zh: '赛前', rif: 'Qbel' })}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
});
