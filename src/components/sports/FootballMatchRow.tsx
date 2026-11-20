import React from 'react';
import { ChevronRight, Loader2, Play, Star } from 'lucide-react';
import type {
  AppLanguage,
  FavoriteChannelItem,
  FootballMatchboardItem,
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
  loadingItemId?: string | null;
  isChannelFavorited: (favId: string) => boolean;
  onToggleChannelFavorite: (entry: Omit<FavoriteChannelItem, 'addedAt'>) => void;
  onOpenMatchSheet: (item: FootballMatchboardItem) => void;
  onQuickWatch: (e: React.MouseEvent, item: FootballMatchboardItem, channelIndex: number) => void;
}

function formatQuickChannelLabel(ch: StreamTrack, lang: AppLanguage): string {
  const raw = String(ch.label || '').trim();
  if (!raw) {
    return pickLang(lang, {
      es: 'Ver',
      ca: 'Veure',
      en: 'Watch',
      zh: '观看',
      rif: 'Wali',
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

export const FootballMatchRow: React.FC<FootballMatchRowProps> = ({
  item,
  lang,
  showLeagueBadge = false,
  showZhIndicator = false,
  activeVideoRawUrl,
  loadingItemId,
  isChannelFavorited,
  onToggleChannelFavorite,
  onOpenMatchSheet,
  onQuickWatch,
}) => {
  const recommendedSportsLang = showZhIndicator ? 'ZH' : resolveRecommendedSportsLang(lang);
  const preferredIdx = React.useMemo(
    () => pickPreferredChannelIndex(item.channels, lang, showZhIndicator),
    [item.channels, lang, showZhIndicator]
  );

  const primaryCh = preferredIdx >= 0 ? item.channels[preferredIdx] : undefined;
  const primaryLangBucket = primaryCh ? getTrackLanguageBucket(primaryCh) : recommendedSportsLang;
  const favId = primaryCh
    ? buildChannelFavId(primaryCh.sourceUrl, `${item.homeTeam} vs ${item.awayTeam}`)
    : '';
  const isSaved = favId ? isChannelFavorited(favId) : false;
  const isPlayingThisMatch = item.channels.some(
    (c) => activeVideoRawUrl && c.sourceUrl === activeVideoRawUrl
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

  return (
    <div
      className={`relative px-3.5 sm:px-4 py-3 flex flex-col gap-2 transition-colors ${
        isPlayingThisMatch
          ? 'bg-[#9146FF]/15'
          : isFeaturedClub
          ? 'bg-gradient-to-r from-[#9146FF]/[0.10] via-[#131624] to-[#10121C] hover:from-[#9146FF]/[0.15]'
          : 'bg-[#10121C] hover:bg-white/[0.03]'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpenMatchSheet(item)}
        aria-label={`${item.homeTeam} vs ${item.awayTeam} (${item.kickoffTime})`}
        className="absolute inset-0 z-0 cursor-pointer"
      />

      {/* Top Metadata Strip (Unboxed typographic row with · separators) */}
      <div className="relative z-[1] pointer-events-none flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 text-[11px] leading-tight">
          {item.statusState === 'live' ? (
            <span className="inline-flex items-center gap-1 text-[#FF6B6B] text-[11px] font-bold tracking-wide whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EB0400]" />
              {pickLang(lang, { es: 'EN VIVO', ca: 'EN DIRECTE', en: 'LIVE', zh: '直播中', rif: 'Srid' })}
              {item.statusLabel && !/^en vivo$/i.test(item.statusLabel) ? ` · ${item.statusLabel}` : ''}
            </span>
          ) : (
            <span className="font-bold tabular-nums text-[#C4A7FF] whitespace-nowrap">
              {item.kickoffDateLabel && item.kickoffDateLabel !== 'Hoy'
                ? `${item.kickoffDateLabel} · ${item.kickoffTime}`
                : `${pickLang(lang, { es: 'Hoy', ca: 'Avui', en: 'Today', zh: '今天', rif: 'Assa' })} · ${item.kickoffTime}`}
            </span>
          )}

          {showNonDefaultStatus && (
            <span className="text-zinc-400 font-semibold whitespace-nowrap">
              · {item.statusLabel}
            </span>
          )}

          {showLeagueBadge && item.leagueName && (
            <span className="text-sky-300 font-semibold whitespace-nowrap">
              · {item.leagueName}
            </span>
          )}

          {showMatchday && (
            <span className="text-zinc-400 font-medium whitespace-nowrap">
              · {item.matchdayLabel}
            </span>
          )}
        </div>

        {broadcasterHint ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold whitespace-nowrap shrink-0"
            style={{ color: broadcasterHint.color }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: broadcasterHint.color }}
            />
            <span>{broadcasterHint.name}</span>
          </span>
        ) : item.statusState !== 'finished' ? (
          <span className="text-[11px] font-medium text-zinc-500 whitespace-nowrap shrink-0">
            {pickLang(lang, {
              es: 'TV por confirmar',
              ca: 'TV per confirmar',
              en: 'TV TBA',
              zh: '频道待定',
              rif: 'TV urɛad yettwaqqen',
            })}
          </span>
        ) : null}
      </div>

      {/* Main Content Row: Spacious Team Rows + Star & Quick Watch CTA */}
      <div className="relative z-[1] flex items-center justify-between gap-2.5 min-w-0">
        <div className="pointer-events-none flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <TeamCrestImg
                src={item.homeLogo}
                shortCode={item.homeShort}
                alt={item.homeTeam}
              />
              <span className="text-sm font-semibold text-white leading-snug truncate">
                {item.homeTeam}
              </span>
              {hasZhChannel && (
                <span className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-200 text-[10px] font-bold shrink-0">
                  ZH
                </span>
              )}
            </div>
            {showNumericScore && (
              <span className="text-sm font-extrabold tabular-nums text-white shrink-0 pl-1">
                {item.homeScore}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <TeamCrestImg
                src={item.awayLogo}
                shortCode={item.awayShort}
                alt={item.awayTeam}
              />
              <span className="text-sm font-semibold text-zinc-200 leading-snug truncate">
                {item.awayTeam}
              </span>
            </div>
            {showNumericScore && (
              <span className="text-sm font-extrabold tabular-nums text-white shrink-0 pl-1">
                {item.awayScore}
              </span>
            )}
          </div>
        </div>

        <div className="relative z-10 pointer-events-auto shrink-0 flex items-center gap-1">
          {primaryCh ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('light');
                  onToggleChannelFavorite({
                    favId,
                    title: `${item.homeTeam} vs ${item.awayTeam}`,
                    channelLabel:
                      primaryCh.label ||
                      pickLang(lang, { es: 'Señal 1', ca: 'Senyal 1', en: 'Feed 1', zh: '信号 1', rif: 'Lqanat 1' }),
                    channelUrl: primaryCh.sourceUrl,
                    competition: item.groupTitle,
                    sport: 'soccer',
                  });
                }}
                aria-label={pickLang(lang, {
                  es: 'Guardar partido',
                  ca: 'Desar partit',
                  en: 'Save match',
                  zh: '收藏比赛',
                  rif: 'Ḥrez lmatch',
                })}
                className="min-w-11 min-h-11 flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#9146FF] cursor-pointer"
              >
                <Star
                  className={`w-4 h-4 ${isSaved ? 'fill-current text-[#9146FF]' : ''}`}
                />
              </button>

              <button
                type="button"
                disabled={Boolean(loadingItemId)}
                onClick={(e) => onQuickWatch(e, item, preferredIdx)}
                className={`min-h-11 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 whitespace-nowrap shrink-0 border ${
                  isPlayingThisMatch
                    ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.4)]'
                    : primaryLangBucket === 'EN'
                    ? 'bg-sky-500/[0.12] hover:bg-sky-500/[0.22] border-sky-500/40 text-sky-200 hover:text-white'
                    : primaryLangBucket === 'ES'
                    ? 'bg-amber-500/[0.12] hover:bg-amber-500/[0.22] border-amber-500/40 text-amber-200 hover:text-white'
                    : 'bg-white/[0.06] hover:bg-[#9146FF] border-white/[0.12] hover:border-[#9146FF] text-zinc-100 hover:text-white'
                }`}
              >
                {isExtracting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                )}
                <span>{formatQuickChannelLabel(primaryCh, lang)}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onOpenMatchSheet(item)}
              aria-label={pickLang(lang, {
                es: 'Ver previa y detalles',
                ca: 'Veure prèvia i detalls',
                en: 'View preview and details',
                zh: '查看赛前详情',
                rif: 'Wali tfassil',
              })}
              className="min-h-11 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 hover:text-white transition-all whitespace-nowrap active:scale-95"
            >
              <span>{pickLang(lang, { es: 'Previa', ca: 'Prèvia', en: 'Preview', zh: '赛前', rif: 'Qbel' })}</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
