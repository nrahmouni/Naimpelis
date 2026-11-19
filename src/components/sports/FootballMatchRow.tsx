import React from 'react';
import { ChevronRight, Loader2, Play, Share2, Sparkles, Star } from 'lucide-react';
import type {
  AppLanguage,
  FavoriteChannelItem,
  FootballMatchboardItem,
  StreamTrack,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { shareDedicatedLink } from '../../utils/shareDedicatedLink';
import { buildChannelFavId } from '../../utils/storage';
import { TeamCrestImg, hasValidScore } from './FootballMatchboardParts';
import { isBarcaOrRealMadridMatch } from './FootballMatchboardHelpers';

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

function isZhTrack(ch: StreamTrack): boolean {
  return ch.lang === 'ZH' || /中文/.test(ch.label || '');
}

function formatQuickChannelLabel(ch: StreamTrack, lang: AppLanguage): string {
  const raw = String(ch.label || '').trim();
  if (!raw) return pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' });
  const cleaned = raw
    .replace(/\b(disney\s*\+|star\s*\+|vix\s*\+|paramount\s*\+|peacock)\b/gi, 'Directo')
    .replace(/\s*\(Español\)/gi, '')
    .replace(/\s*·\s*(Champions|Premier League|Nations League)/gi, '')
    .replace(/\s*\(Oficial\s*·\s*Guía\s*TV\)/gi, '')
    .replace(/\s*Señal\s*\d*/gi, '')
    .replace(/\s*1080p|\s*720p|\s*HD/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || /^(disney|star|vix|paramount)\+?$/i.test(cleaned)) {
    return pickLang(lang, { es: 'Directo HD', ca: 'Directe HD', en: 'Live HD' });
  }
  return cleaned;
}

export const FootballMatchRow: React.FC<FootballMatchRowProps> = ({
  item,
  lang,
  shareRoomId,
  showLeagueBadge = false,
  showZhIndicator = false,
  activeVideoRawUrl,
  loadingItemId,
  isChannelFavorited,
  onToggleChannelFavorite,
  onOpenMatchSheet,
  onQuickWatch,
}) => {
  const preferredIdx = React.useMemo(() => {
    if (item.channels.length === 0) return -1;
    if (showZhIndicator) {
      const zhIdx = item.channels.findIndex((c) => isZhTrack(c));
      return zhIdx >= 0 ? zhIdx : 0;
    }
    const nonZhIdx = item.channels.findIndex((c) => !isZhTrack(c));
    return nonZhIdx >= 0 ? nonZhIdx : 0;
  }, [item.channels, showZhIndicator]);

  const primaryCh = preferredIdx >= 0 ? item.channels[preferredIdx] : undefined;
  const favId = primaryCh
    ? buildChannelFavId(primaryCh.sourceUrl, `${item.homeTeam} vs ${item.awayTeam}`)
    : '';
  const isSaved = favId ? isChannelFavorited(favId) : false;
  const isPlayingThisMatch = item.channels.some(
    (c) => activeVideoRawUrl && c.sourceUrl === activeVideoRawUrl
  );
  const isExtracting = Boolean(loadingItemId?.startsWith(item.id));
  const showNumericScore = hasValidScore(item.homeScore, item.awayScore);
  const isFeaturedClub = isBarcaOrRealMadridMatch(item.homeTeam, item.awayTeam);
  const hasZhChannel = showZhIndicator && item.channels.some((c) => isZhTrack(c));

  const showNonDefaultStatus =
    item.statusState === 'finished' ||
    (item.statusLabel &&
      !/^por empezar$/i.test(item.statusLabel.trim()) &&
      item.statusState !== 'live');

  const showMatchday =
    Boolean(item.matchdayLabel) &&
    item.matchdayLabel!.toLowerCase() !== String(item.leagueName || '').toLowerCase();

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
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EB0400] text-white text-[10px] font-extrabold tracking-wide whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {pickLang(lang, { es: 'EN VIVO', ca: 'EN DIRECTE', en: 'LIVE' })}
              {item.statusLabel && !/^en vivo$/i.test(item.statusLabel) ? ` · ${item.statusLabel}` : ''}
            </span>
          ) : (
            <span className="font-bold tabular-nums text-[#BF94FF] whitespace-nowrap">
              {item.kickoffDateLabel && item.kickoffDateLabel !== 'Hoy'
                ? `${item.kickoffDateLabel} · ${item.kickoffTime}`
                : `${pickLang(lang, { es: 'Hoy', ca: 'Avui', en: 'Today' })} · ${item.kickoffTime}`}
            </span>
          )}

          {showNonDefaultStatus && (
            <span className="text-zinc-400 font-semibold whitespace-nowrap">
              · {item.statusLabel}
            </span>
          )}

          {isFeaturedClub && (
            <span className="inline-flex items-center gap-0.5 text-[#D8B4FE] font-bold whitespace-nowrap">
              <span>·</span>
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>{pickLang(lang, { es: 'Destacado', ca: 'Destacat', en: 'Featured' })}</span>
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

        {item.spanishBroadcaster && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold whitespace-nowrap shrink-0"
            style={{ color: item.spanishBroadcaster.badgeColor }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: item.spanishBroadcaster.badgeColor }}
            />
            <span>{item.spanishBroadcaster.name}</span>
          </span>
        )}
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void shareDedicatedLink({
                target: {
                  kind: 'match',
                  id: item.id,
                  eventId: item.eventId,
                  homeTeam: item.homeTeam,
                  awayTeam: item.awayTeam,
                },
                roomId: shareRoomId,
                title: `${item.homeTeam} vs ${item.awayTeam}`,
              });
            }}
            aria-label={pickLang(lang, {
              es: 'Compartir partido',
              ca: 'Compartir partit',
              en: 'Share match',
            })}
            className="min-w-10 min-h-11 flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#BF94FF] cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
          </button>

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
                      pickLang(lang, { es: 'Señal 1', ca: 'Senyal 1', en: 'Feed 1' }),
                    channelUrl: primaryCh.sourceUrl,
                    competition: item.groupTitle,
                    sport: 'soccer',
                  });
                }}
                aria-label={pickLang(lang, {
                  es: 'Guardar partido',
                  ca: 'Desar partit',
                  en: 'Save match',
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
                    : item.spanishBroadcaster
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
              })}
              className="min-h-11 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 hover:text-white transition-all whitespace-nowrap active:scale-95"
            >
              <span>{pickLang(lang, { es: 'Previa', ca: 'Prèvia', en: 'Preview' })}</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
