import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, Play, Radio, Shield } from 'lucide-react';
import type { AppLanguage, SportsMatch } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  getBarcaMadridBannerDisplayMeta,
  getPreferredBarcaMadridChannelIndex,
} from './barcaMadridHomeHelper';

interface BarcaMadridDirectBannerProps {
  lang: AppLanguage;
  matches: SportsMatch[];
  nowMs: number;
  loadingItemId?: string | null;
  onPlayMatch: (match: SportsMatch, channelIndex?: number) => void;
}

const CrestBadge: React.FC<{ src?: string; shortCode: string; alt: string }> = ({
  src,
  shortCode,
  alt,
}) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/[0.08] border border-white/[0.14] flex items-center justify-center text-xs font-bold text-white shrink-0"
      >
        {shortCode.slice(0, 3) || <Shield className="w-4 h-4 text-zinc-400" />}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="eager"
      onError={() => setFailed(true)}
      className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
    />
  );
};

export const BarcaMadridDirectBanner: React.FC<BarcaMadridDirectBannerProps> = ({
  lang,
  matches,
  nowMs,
  loadingItemId,
  onPlayMatch,
}) => {
  if (!matches || matches.length === 0) return null;

  return (
    <section
      aria-label={pickLang(lang, {
        es: 'Partido destacado listo para ver',
        ca: 'Partit destacat llest per veure',
        en: 'Featured match ready to watch',
      })}
      className="space-y-2.5"
    >
      {matches.map((match) => {
        const meta = match.matchMeta;
        if (!meta) return null;
        const display = getBarcaMadridBannerDisplayMeta(match, nowMs, lang);
        const preferredIdx = getPreferredBarcaMadridChannelIndex(match, lang);
        const isStarting = Boolean(loadingItemId && loadingItemId.startsWith(`${match.id}-`));

        return (
          <motion.button
            key={match.id}
            type="button"
            data-tv-focusable="true"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
            whileTap={{ scale: 0.985 }}
            disabled={isStarting}
            onClick={() => {
              triggerHaptic('medium');
              onPlayMatch(match, preferredIdx);
            }}
            className="w-full text-left rounded-2xl bg-gradient-to-r from-[#11121E] via-[#0E1019] to-[#0D1624] hover:from-[#16182A] hover:to-[#111D30] border border-[#7C3AED]/45 hover:border-[#8B5CF6]/80 p-3.5 sm:p-4 shadow-[0_14px_36px_rgba(0,0,0,0.55)] cursor-pointer transition-all group tv-focus-ring"
          >
            {/* Top status + broadcaster bar */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    display.isLiveNow
                      ? 'bg-[#FF4B4B] shadow-[0_0_8px_#FF4B4B] animate-pulse'
                      : 'bg-emerald-400 shadow-[0_0_8px_#34D399] animate-pulse'
                  }`}
                />
                <span
                  className={`text-[11px] font-bold tracking-wide truncate ${
                    display.isLiveNow ? 'text-[#FF7A7A]' : 'text-emerald-300'
                  }`}
                >
                  {display.statusHeadline}
                </span>
              </div>

              <span className="text-[11px] font-semibold text-zinc-300 truncate shrink-0 max-w-[48%] flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-[#60A5FA] shrink-0" />
                <span className="truncate">{display.channelLabel}</span>
              </span>
            </div>

            {/* Teams + Score + Direct Play CTA */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <CrestBadge
                    src={meta.homeLogo}
                    shortCode={meta.homeShort || meta.homeTeam}
                    alt={meta.homeTeam}
                  />
                  <span className="font-display font-bold text-sm sm:text-base text-white truncate">
                    {meta.homeTeam}
                  </span>
                </div>

                <div className="shrink-0 px-2.5 py-1 rounded-xl bg-black/55 border border-white/[0.08] text-center min-w-[54px]">
                  {display.isLiveNow && display.hasScore ? (
                    <span className="font-display font-extrabold text-sm sm:text-base text-white tabular-nums">
                      {display.homeScore} - {display.awayScore}
                    </span>
                  ) : (
                    <span className="font-display font-bold text-xs text-zinc-300 tabular-nums">
                      {display.kickoffTimeLabel || 'VS'}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 min-w-0 flex-1">
                  <span className="font-display font-bold text-sm sm:text-base text-white truncate text-right">
                    {meta.awayTeam}
                  </span>
                  <CrestBadge
                    src={meta.awayLogo}
                    shortCode={meta.awayShort || meta.awayTeam}
                    alt={meta.awayTeam}
                  />
                </div>
              </div>

              <span className="shrink-0 min-h-11 px-3.5 sm:px-4 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#3B82F6] group-hover:from-[#8B5CF6] group-hover:to-[#60A5FA] text-white font-display font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-[0_6px_20px_rgba(124,58,237,0.4)] transition-all whitespace-nowrap">
                {isStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>
                  {isStarting
                    ? pickLang(lang, {
                        es: 'Abriendo...',
                        ca: 'Obrint...',
                        en: 'Opening...',
                        rif: 'Yettarezem...',
                      })
                    : pickLang(lang, {
                        es: 'Ver ahora',
                        ca: 'Veure ara',
                        en: 'Watch now',
                        zh: '立即观看',
                        rif: 'Xzar lexxu',
                      })}
                </span>
              </span>
            </div>

            <p className="mt-2 text-[11px] text-zinc-400 truncate">
              {display.competitionLabel} ·{' '}
              {pickLang(lang, {
                es: 'Toca para reproducir directo en Riffan',
                ca: 'Toca per reproduir en directe a Riffan',
                en: 'Tap to play live on Riffan',
                rif: 'Ttek i ad txzared direkt di Riffan',
              })}
            </p>
          </motion.button>
        );
      })}
    </section>
  );
};
