import React, { useState } from 'react';
import { Columns2, Globe, Play, Share2, Shield } from 'lucide-react';
import type {
  AppLanguage,
  FootballMatchDetails,
  FootballMatchboardItem,
  SportsMatch,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { shareDedicatedLink } from '../../utils/shareDedicatedLink';
import { BottomSheet, SegmentedControl } from '../ui/DesignSystem';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import {
  getTrackLanguageBucket,
  resolveRecommendedSportsLang,
} from './FootballMatchboardHelpers';

const LiveMatchCenter = lazyWithRetry(() =>
  import('../LiveMatchCenter').then((m) => ({ default: m.LiveMatchCenter }))
);

export type MatchSheetTab = 'signals' | 'stats';

export function formatOffsetDateKey(dayOffset: number): {
  dateKey: string;
  isoDate: string;
  labelEs: string;
  labelCa: string;
  labelEn: string;
} {
  const madridTodayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const baseNoonUtc = Date.parse(`${madridTodayIso}T12:00:00Z`);
  const d = Number.isNaN(baseNoonUtc)
    ? new Date(Date.now() + dayOffset * 86_400_000)
    : new Date(baseNoonUtc + dayOffset * 86_400_000);
  const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
  const dateKey = isoDate.replace(/-/g, '');
  if (dayOffset === 0) return { dateKey, isoDate, labelEs: 'Hoy', labelCa: 'Avui', labelEn: 'Today' };
  if (dayOffset === -1) return { dateKey, isoDate, labelEs: 'Ayer', labelCa: 'Ahir', labelEn: 'Yesterday' };
  if (dayOffset === 1) return { dateKey, isoDate, labelEs: 'Mañana', labelCa: 'Demà', labelEn: 'Tomorrow' };
  const shortEs = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
  }).format(d);
  const shortCa = new Intl.DateTimeFormat('ca-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
  }).format(d);
  const shortEn = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
  }).format(d);
  return { dateKey, isoDate, labelEs: shortEs, labelCa: shortCa, labelEn: shortEn };
}

export function computeDayOffsetFromIsoDate(isoDateStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDateStr)) return null;
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const todayUtc = Date.parse(`${todayIso}T00:00:00Z`);
  const targetUtc = Date.parse(`${isoDateStr}T00:00:00Z`);
  if (Number.isNaN(todayUtc) || Number.isNaN(targetUtc)) return null;
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

export function toSportsMatch(item: FootballMatchboardItem, lang: AppLanguage): SportsMatch {
  return {
    id: item.id,
    title: `${item.homeTeam} vs ${item.awayTeam}`,
    competition: item.groupTitle,
    sport: 'soccer',
    time:
      item.statusState === 'live'
        ? item.statusLabel || pickLang(lang, { es: 'EN VIVO', ca: 'EN DIRECTE', en: 'LIVE' })
        : item.kickoffTime,
    isLive: item.statusState === 'live',
    is247Channel: false,
    channels: item.channels,
    matchMeta: {
      eventId: item.eventId,
      fotmobMatchId: item.fotmobMatchId,
      leagueSlug: item.leagueSlug,
      leagueName: item.leagueName,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      homeShort: item.homeShort,
      awayShort: item.awayShort,
      homeLogo: item.homeLogo,
      awayLogo: item.awayLogo,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      statusState: item.statusState,
      statusLabel: item.statusLabel,
      kickoffMs: item.kickoffMs,
      kickoffIso: item.kickoffIso,
      kickoffTime: item.kickoffTime,
      spanishBroadcaster: item.spanishBroadcaster,
      verifiedTvGuide: item.verifiedTvGuide,
    },
  };
}

export function hasValidScore(homeScore?: string, awayScore?: string): boolean {
  const h = String(homeScore ?? '').trim();
  const a = String(awayScore ?? '').trim();
  if (!h || !a) return false;
  if (h === '-' || h === '–' || a === '-' || a === '–' || h === '·' || a === '·') {
    return false;
  }
  return /^\d+$/.test(h) && /^\d+$/.test(a);
}

export const TeamCrestImg: React.FC<{
  src?: string;
  shortCode?: string;
  alt: string;
}> = ({ src, shortCode = '', alt }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const abbr = String(shortCode || alt || '').trim().slice(0, 2).toUpperCase();
    return (
      <span
        aria-hidden="true"
        className="w-6 h-6 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-[10px] font-bold text-zinc-200 shrink-0"
      >
        {abbr || <Shield className="w-3.5 h-3.5 text-zinc-400" />}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-6 h-6 object-contain shrink-0"
    />
  );
};

export const RegionFlagImg: React.FC<{
  src?: string;
  alt: string;
  groupTitle?: string;
}> = ({ src, alt, groupTitle = '' }) => {
  const [failed, setFailed] = useState(false);
  const haystack = `${alt} ${groupTitle}`.toLowerCase();
  const isNonEuOrIntl =
    /africa|caf|afcon|azadegan|iran|asia|afc|concacaf|conmebol|world|mundial|friendly|amistoso|internacional|fifa|liberta|sudam|qualif/i.test(
      haystack
    );
  const isGenericEuFlag =
    !src || /\/(eu|europe|uefa)(\.|_|-)/i.test(src) || /euro-flag/i.test(src);

  if (!src || failed || (isNonEuOrIntl && (isGenericEuFlag || !/^[a-z]{2}$/i.test(alt)))) {
    return <Globe className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-5 h-3.5 rounded-[2px] object-cover shrink-0 border border-white/10"
    />
  );
};

interface FootballMatchDetailSheetProps {
  lang: AppLanguage;
  shareRoomId?: string;
  showZhIndicator?: boolean;
  selectedMatchObj: FootballMatchboardItem | null;
  selectedSportsMatch: SportsMatch | null;
  selectedMatchDetails: FootballMatchDetails | null;
  sheetTab: MatchSheetTab;
  setSheetTab: (t: MatchSheetTab) => void;
  activeVideoRawUrl?: string;
  loadingItemId?: string | null;
  loadingDetailId: string | null;
  onClose: () => void;
  onLoadDetails: (item: FootballMatchboardItem, force: boolean) => void;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlaySecondaryChannel?: (match: SportsMatch, channelIndex: number) => void;
}

export const FootballMatchDetailSheet: React.FC<FootballMatchDetailSheetProps> = ({
  lang,
  shareRoomId,
  showZhIndicator = false,
  selectedMatchObj,
  selectedSportsMatch,
  selectedMatchDetails,
  sheetTab,
  setSheetTab,
  activeVideoRawUrl,
  loadingItemId,
  loadingDetailId,
  onClose,
  onLoadDetails,
  onPlaySportsMatch,
  onPlaySecondaryChannel,
}) => {
  const [expandOtherLangs, setExpandOtherLangs] = useState(false);

  const recommendedLang = showZhIndicator ? 'ZH' : resolveRecommendedSportsLang(lang);
  const channelEntries = (selectedMatchObj?.channels || []).map((ch, idx) => {
    const langBucket = getTrackLanguageBucket(ch);
    return {
      ch,
      idx,
      langBucket,
      isZh: langBucket === 'ZH',
      isEn: langBucket === 'EN',
      isSpanish: langBucket === 'ES',
    };
  });
  const mainChannels = channelEntries.filter((e) => e.langBucket === recommendedLang);
  const otherLangChannels = channelEntries.filter((e) => e.langBucket !== recommendedLang);
  const orderedAllChannels = [...mainChannels, ...otherLangChannels];
  const visibleChannels =
    expandOtherLangs || mainChannels.length === 0 ? orderedAllChannels : mainChannels;

  return (
    <BottomSheet
      isOpen={Boolean(selectedMatchObj)}
      onClose={onClose}
      title={selectedMatchObj ? `${selectedMatchObj.homeTeam} vs ${selectedMatchObj.awayTeam}` : ''}
      subtitle={selectedMatchObj?.groupTitle}
      maxWidth="sm:max-w-2xl"
      lang={lang}
    >
      {selectedMatchObj && selectedSportsMatch && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SegmentedControl<MatchSheetTab>
                value={sheetTab}
                onChange={(val) => {
                  setSheetTab(val);
                  if (val === 'stats') onLoadDetails(selectedMatchObj, false);
                }}
                layoutId="match-detail-sheet-tabs"
                options={[
                  {
                    id: 'signals',
                    label: pickLang(lang, { es: 'Señales', ca: 'Senyals', en: 'Signals' }),
                  },
                  {
                    id: 'stats',
                    label: pickLang(lang, {
                      es: 'Estadísticas y alineaciones',
                      ca: 'Estadístiques i alineacions',
                      en: 'Stats & lineups',
                    }),
                  },
                ]}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                void shareDedicatedLink({
                  target: {
                    kind: 'match',
                    id: selectedMatchObj.id,
                    eventId: selectedMatchObj.eventId,
                    homeTeam: selectedMatchObj.homeTeam,
                    awayTeam: selectedMatchObj.awayTeam,
                  },
                  roomId: shareRoomId,
                  title: `${selectedMatchObj.homeTeam} vs ${selectedMatchObj.awayTeam}`,
                });
              }}
              aria-label={pickLang(lang, {
                es: 'Compartir partido',
                ca: 'Compartir partit',
                en: 'Share match',
              })}
              className="min-h-11 px-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-zinc-100 flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-[#A78BFA]" />
              <span className="hidden sm:inline">
                {pickLang(lang, { es: 'Compartir partido', ca: 'Compartir partit', en: 'Share match' })}
              </span>
            </button>
          </div>

          {sheetTab === 'signals' ? (
            <div className="space-y-2.5">
              {visibleChannels.length > 0 && (() => {
                const guide = selectedMatchObj.verifiedTvGuide;
                const preferredGuideList =
                  recommendedLang === 'EN'
                    ? guide?.en
                    : recommendedLang === 'ZH'
                      ? guide?.zh
                      : guide?.es;
                const hasPreferredSignal = mainChannels.length > 0;
                const guideText = preferredGuideList?.length
                  ? preferredGuideList.join(' · ')
                  : guide?.es?.length
                    ? guide.es.join(' · ')
                    : guide?.en?.length
                      ? guide.en.join(' · ')
                      : '';
                const bannerBadgeLang = hasPreferredSignal
                  ? recommendedLang
                  : visibleChannels[0]?.langBucket || recommendedLang;

                return (
                  <div
                    className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-[11px] ${
                      bannerBadgeLang === 'EN'
                        ? 'bg-sky-500/[0.08] border-sky-500/25'
                        : bannerBadgeLang === 'ZH'
                          ? 'bg-rose-500/[0.08] border-rose-500/25'
                          : 'bg-amber-500/[0.08] border-amber-500/25'
                    }`}
                  >
                    <span
                      className={`font-semibold ${
                        bannerBadgeLang === 'EN'
                          ? 'text-sky-200'
                          : bannerBadgeLang === 'ZH'
                            ? 'text-rose-200'
                            : 'text-amber-200'
                      }`}
                    >
                      {guideText
                        ? pickLang(lang, {
                            es: `Programación TV confirmada: ${guideText}`,
                            ca: `Programació TV confirmada: ${guideText}`,
                            en: `Confirmed TV schedule: ${guideText}`,
                            zh: `已核实电视转播：${guideText}`,
                            rif: `Lbaramij n TV yettwasnen: ${guideText}`,
                          })
                        : !hasPreferredSignal
                          ? pickLang(lang, {
                              es: `Sin emisión confirmada en ${recommendedLang} · Mostrando señales verificadas (${bannerBadgeLang})`,
                              ca: `Sense emissió confirmada en ${recommendedLang} · Mostrant senyals verificats (${bannerBadgeLang})`,
                              en: `No ${recommendedLang} broadcast scheduled · Showing verified feeds (${bannerBadgeLang})`,
                              zh: `暂无${recommendedLang === 'ZH' ? '中文' : recommendedLang}转播安排 · 显示已核实信号 (${bannerBadgeLang})`,
                              rif: `Ulac lqanat s ${recommendedLang} · Tbanen lqanawat yettwaqqnen (${bannerBadgeLang})`,
                            })
                          : pickLang(lang, {
                              es: 'Emisión verificada en la guía TV oficial',
                              ca: 'Emissió verificada a la guia TV oficial',
                              en: 'Broadcast verified against official TV schedule',
                              zh: '已核对官方节目单直播信号',
                              rif: 'Lqanat tettwaqqen deg lbaramij n TV',
                            })}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] shrink-0 ${
                        bannerBadgeLang === 'EN'
                          ? 'bg-sky-500/20 text-sky-300'
                          : bannerBadgeLang === 'ZH'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {bannerBadgeLang} · 1080p
                    </span>
                  </div>
                );
              })()}
              {visibleChannels.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {visibleChannels.map(({ ch, idx, isZh, isEn, isSpanish }) => {
                      const isActiveSignal = activeVideoRawUrl === ch.sourceUrl;
                      const isMplus = /movistar|m\+/i.test(ch.label || '');
                      const isDazn = /dazn/i.test(ch.label || '');
                      const isSky = /sky sports/i.test(ch.label || '');
                      const isTnt = /tnt sports/i.test(ch.label || '');
                      const isFifa = /fifa\+/i.test(ch.label || '');

                      return (
                        <div key={`${selectedMatchObj.id}-${ch.id}-${idx}`} className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={Boolean(loadingItemId)}
                            onClick={() => {
                              triggerHaptic('medium');
                              onPlaySportsMatch(selectedSportsMatch, idx);
                              onClose();
                            }}
                            className={`flex-1 min-h-14 px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center justify-between gap-2.5 cursor-pointer active:scale-95 transition-all border ${
                              isActiveSignal
                                ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-lg'
                                : isSpanish
                                ? 'bg-amber-500/[0.08] hover:bg-amber-500/[0.16] border-amber-500/30 text-white'
                                : isEn
                                ? 'bg-sky-500/[0.08] hover:bg-sky-500/[0.16] border-sky-500/30 text-white'
                                : 'bg-white/[0.05] hover:bg-white/[0.1] text-white border-white/[0.09]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Play className="w-3.5 h-3.5 fill-current shrink-0 text-[#A78BFA]" />
                              <div className="text-left min-w-0">
                                <p className="text-xs font-bold text-white leading-snug break-words">
                                  {ch.label ||
                                    `${pickLang(lang, { es: 'Señal', ca: 'Senyal', en: 'Feed', zh: '信号', rif: 'Lqanat' })} ${idx + 1}`}
                                </p>
                                <p className="text-[10px] font-medium text-zinc-400 leading-snug">
                                  {isSpanish
                                    ? isDazn
                                      ? 'DAZN España · Guía TV'
                                      : isMplus
                                      ? 'Movistar Plus+ · Guía TV'
                                      : 'Español · Guía TV'
                                    : isEn
                                    ? isSky
                                      ? 'Sky Sports UK · TV Guide'
                                      : isTnt
                                      ? 'TNT Sports UK · TV Guide'
                                      : isFifa
                                      ? 'FIFA+ · TV Guide'
                                      : 'English · TV Guide'
                                    : isZh
                                    ? pickLang(lang, {
                                        es: 'Televisión china confirmada (CNTV EPG)',
                                        ca: 'Televisió xinesa confirmada (CNTV EPG)',
                                        en: 'Confirmed Chinese TV broadcast (CNTV EPG)',
                                        zh: '央视/中国体育节目单已确认',
                                        rif: 'Tacinwit · Lbaramij n TV yettwaqqnen',
                                      })
                                    : pickLang(lang, {
                                        es: 'Señal Internacional',
                                        ca: 'Senyal Internacional',
                                        en: 'International Feed',
                                        zh: '国际信号',
                                        rif: 'Lqanat tagraɣlant',
                                      })}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isSpanish && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 text-[10px] font-extrabold tracking-wide border border-amber-500/40">
                                  ES
                                </span>
                              )}
                              {isEn && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-500/25 text-sky-300 text-[10px] font-extrabold tracking-wide border border-sky-500/40">
                                  EN
                                </span>
                              )}
                              {isZh && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-200 text-[10px] font-bold border border-rose-500/40">
                                  ZH
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-200 text-[10px] font-mono font-bold">
                                {ch.quality || '1080p'}
                              </span>
                            </div>
                          </button>

                          {activeVideoRawUrl && !isActiveSignal && onPlaySecondaryChannel && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                onPlaySecondaryChannel(selectedSportsMatch, idx);
                                onClose();
                              }}
                              aria-label={pickLang(lang, {
                                es: 'Segunda pantalla',
                                ca: 'Segona pantalla',
                                en: 'Second screen',
                                zh: '双屏观看',
                                rif: 'Caca tis snat',
                              })}
                              className="min-w-12 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200 flex items-center justify-center cursor-pointer"
                            >
                              <Columns2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {otherLangChannels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandOtherLangs((v) => !v)}
                      className="w-full min-h-10 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
                    >
                      {expandOtherLangs
                        ? pickLang(lang, {
                            es: 'Ocultar otros idiomas',
                            ca: 'Amagar altres idiomes',
                            en: 'Hide other languages',
                            zh: '收起其他语言频道',
                            rif: 'Ffer tutlayin nniḍen',
                          })
                        : pickLang(lang, {
                            es: `Mostrar ${otherLangChannels.length} señales en otros idiomas`,
                            ca: `Mostrar ${otherLangChannels.length} senyals en altres idiomes`,
                            en: `Show ${otherLangChannels.length} feeds in other languages`,
                            zh: `显示另外 ${otherLangChannels.length} 个其他语言频道`,
                            rif: `Ssken ${otherLangChannels.length} n lqanawat s tutlayin nniḍen`,
                          })}
                    </button>
                  )}
                </>
              ) : (
                <div className="py-3 space-y-1.5">
                  <p className="text-sm text-zinc-300">
                    {selectedMatchObj.statusState === 'finished'
                      ? pickLang(lang, {
                          es: 'Partido finalizado.',
                          ca: 'Partit finalitzat.',
                          en: 'Match finished.',
                          zh: '比赛已结束。',
                          rif: 'Lmatch ikemmel.',
                        })
                      : (() => {
                          const g = selectedMatchObj.verifiedTvGuide;
                          const allGuide = [
                            ...(g?.es || []),
                            ...(g?.en || []),
                            ...(g?.zh || []),
                          ];
                          if (allGuide.length > 0) {
                            const listed = allGuide.slice(0, 3).join(' · ');
                            return pickLang(lang, {
                              es: `Emisión oficial según guía TV: ${listed}. Señal en directo disponible antes del inicio (${selectedMatchObj.kickoffTime}).`,
                              ca: `Emissió oficial segons guia TV: ${listed}. Senyal en directe disponible abans de l’inici (${selectedMatchObj.kickoffTime}).`,
                              en: `Official TV listing: ${listed}. Live feed becomes active before kickoff (${selectedMatchObj.kickoffTime}).`,
                              zh: `官方电视转播信息：${listed}。直播信号将在开赛前开放（${selectedMatchObj.kickoffTime}）。`,
                              rif: `Lbaramij n TV: ${listed}. Lqanat ad tili qbel ma yebdu (${selectedMatchObj.kickoffTime}).`,
                            });
                          }
                          return pickLang(lang, {
                            es: `Programación TV aún no confirmada para este partido. El canal oficial se mostrará en cuanto salga publicado en la guía TV (${selectedMatchObj.kickoffTime}).`,
                            ca: `Programació TV encara per confirmar per a aquest partit. El canal oficial es mostrarà quan es publiqui a la guia TV (${selectedMatchObj.kickoffTime}).`,
                            en: `TV broadcast schedule not yet announced for this match. Verified channels will appear once published (${selectedMatchObj.kickoffTime}).`,
                            zh: `该比赛的电视转播频道尚未公布。官方节目单更新后将立即显示（${selectedMatchObj.kickoffTime}）。`,
                            rif: `Lbaramij n TV urɛad yettwaqqen i lmatch-a. Ad tban lqanat mi d-yeffeɣ deg ugid n TV (${selectedMatchObj.kickoffTime}).`,
                          });
                        })()}
                  </p>
                </div>
              )}
            </div>
        ) : (
          <React.Suspense
            fallback={<div className="py-8 text-center text-xs text-zinc-400">Cargando...</div>}
          >
            <LiveMatchCenter
              lang={lang}
              details={selectedMatchDetails}
              loading={loadingDetailId === selectedMatchObj.id}
              homeTeam={selectedMatchObj.homeTeam}
              awayTeam={selectedMatchObj.awayTeam}
              homeShort={selectedMatchObj.homeShort}
              awayShort={selectedMatchObj.awayShort}
              homeLogo={selectedMatchObj.homeLogo}
              awayLogo={selectedMatchObj.awayLogo}
              homeScore={selectedMatchObj.homeScore}
              awayScore={selectedMatchObj.awayScore}
              statusState={selectedMatchObj.statusState}
              statusLabel={selectedMatchObj.statusLabel}
              competition={selectedMatchObj.groupTitle}
              variant="expanded"
              defaultTab="lineups"
              onRefresh={() => onLoadDetails(selectedMatchObj, true)}
            />
          </React.Suspense>
        )}
      </div>
    )}
    </BottomSheet>
  );
};
