import React, { useState } from 'react';
import { Columns2, Globe, Play, Shield } from 'lucide-react';
import type {
  AppLanguage,
  FootballMatchDetails,
  FootballMatchboardItem,
  SportsMatch,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { BottomSheet, SegmentedControl } from '../ui/DesignSystem';

const LiveMatchCenter = React.lazy(() =>
  import('../LiveMatchCenter').then((m) => ({ default: m.LiveMatchCenter }))
);

export type MatchSheetTab = 'signals' | 'stats';

export function formatOffsetDateKey(dayOffset: number): {
  dateKey: string;
  labelEs: string;
  labelCa: string;
  labelEn: string;
} {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
    .format(d)
    .replace(/-/g, '');
  if (dayOffset === 0) return { dateKey, labelEs: 'Hoy', labelCa: 'Avui', labelEn: 'Today' };
  if (dayOffset === -1) return { dateKey, labelEs: 'Ayer', labelCa: 'Ahir', labelEn: 'Yesterday' };
  if (dayOffset === 1) return { dateKey, labelEs: 'Mañana', labelCa: 'Demà', labelEn: 'Tomorrow' };
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
  return { dateKey, labelEs: shortEs, labelCa: shortCa, labelEn: shortEn };
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
  shortCode: string;
  alt: string;
}> = ({ src, shortCode, alt }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className="w-6 h-6 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-[10px] font-bold text-zinc-200 shrink-0"
      >
        {shortCode.slice(0, 2) || <Shield className="w-3.5 h-3.5 text-zinc-400" />}
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
}) => (
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

        {sheetTab === 'signals' ? (
          <div className="space-y-2.5">
            {selectedMatchObj.channels.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {selectedMatchObj.channels.map((ch, idx) => {
                  const isActiveSignal = activeVideoRawUrl === ch.sourceUrl;
                  const isZh = ch.lang === 'ZH' || /中文/.test(ch.label || '');
                  const isSpanish =
                    ch.lang === 'ES' ||
                    /(español|dazn|movistar|m\+|laliga|campeones|vamos|rtve|la 1|teledeporte)/i.test(
                      ch.label || ''
                    );
                  const isMplus = /movistar|m\+/i.test(ch.label || '');
                  const isDazn = /dazn/i.test(ch.label || '');

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
                        className={`flex-1 min-h-14 px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center justify-between gap-2.5 cursor-pointer transition-colors border ${
                          isActiveSignal
                            ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-lg'
                            : isSpanish
                            ? 'bg-amber-500/[0.08] hover:bg-amber-500/[0.16] border-amber-500/30 text-white'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/[0.1]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Play className="w-3.5 h-3.5 fill-current shrink-0 text-[#BF94FF]" />
                          <div className="text-left min-w-0">
                            <p className="truncate text-xs font-bold text-white">
                              {ch.label ||
                                `${pickLang(lang, { es: 'Señal', ca: 'Senyal', en: 'Feed' })} ${idx + 1}`}
                            </p>
                            <p className="text-[10px] font-medium text-zinc-400 truncate">
                              {isSpanish
                                ? isMplus
                                  ? 'Movistar Plus+ · Español'
                                  : isDazn
                                  ? 'DAZN España · Español'
                                  : 'Español Oficial'
                                : isZh
                                ? 'Transmisión China · 中文'
                                : 'Señal Internacional'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {isSpanish && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 text-[10px] font-extrabold tracking-wide border border-amber-500/40">
                              ES
                            </span>
                          )}
                          {isZh && (
                            <span className="px-1.5 py-0.5 rounded bg-white/15 text-zinc-200 text-[10px] font-bold">
                              中文
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300 text-[10px] font-mono">
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
            ) : (
              <p className="text-sm text-zinc-300 py-3">
                {selectedMatchObj.statusState === 'finished'
                  ? pickLang(lang, {
                      es: 'Partido finalizado.',
                      ca: 'Partit finalitzat.',
                      en: 'Match finished.',
                    })
                  : pickLang(lang, {
                      es: `Las señales se activarán antes del inicio (${selectedMatchObj.kickoffTime}).`,
                      ca: `Els senyals s’activaran abans de l’inici (${selectedMatchObj.kickoffTime}).`,
                      en: `Streams open before kickoff (${selectedMatchObj.kickoffTime}).`,
                    })}
              </p>
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
