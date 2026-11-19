import React from 'react';
import { Play } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanTrophyIcon, RiffanTvRemoteIcon } from '../ui/RiffanIcons';
import { PosterImage } from '../ui/PosterImage';
import type { VoiceCandidateItem } from './voiceAudioHelpers';

interface VoiceCandidateCardsProps {
  lang: AppLanguage;
  items: VoiceCandidateItem[];
  showQuickChips: boolean;
  quickChips: string[];
  onTriggerCandidatePlay: (item: VoiceCandidateItem) => void;
  onSelectQuickChip: (chip: string) => void;
}

export const VoiceCandidateCards: React.FC<VoiceCandidateCardsProps> = ({
  lang,
  items,
  showQuickChips,
  quickChips,
  onTriggerCandidatePlay,
  onSelectQuickChip,
}) => {
  return (
    <>
      {items.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span>
              {pickLang(lang, {
                es: `Resultados (${items.length})`,
                ca: `Resultats (${items.length})`,
                en: `Results (${items.length})`,
                zh: `找到内容 (${items.length})`,
              })}
              {' · '}
              <span className="text-[#BF94FF]">
                {pickLang(lang, {
                  es: 'Pulsa o di "pon la primera"',
                  ca: 'Prem o digues "posa la primera"',
                  en: 'Tap or say "play first"',
                  zh: '点击播放或说“播放第一个”',
                })}
              </span>
            </span>
          </div>

          <div className="space-y-2 max-h-[34dvh] overflow-y-auto pr-1">
            {items.map((it, idx) => (
              <button
                key={`${it.kind}-${it.id}-${idx}`}
                type="button"
                onClick={() => onTriggerCandidatePlay(it)}
                className="w-full p-2.5 rounded-2xl bg-[#10121C] hover:bg-[#171A29] border border-white/[0.08] hover:border-[#9146FF]/60 flex items-center gap-3 text-left group transition-all cursor-pointer"
              >
                <div className="relative w-12 h-16 sm:w-14 sm:h-18 rounded-xl overflow-hidden bg-black/60 shrink-0 border border-white/10 flex items-center justify-center">
                  {it.kind === 'channel' ? (
                    <div className="p-2 w-full h-full flex items-center justify-center">
                      {it.imageUrl ? (
                        <img
                          src={it.imageUrl}
                          alt={it.title}
                          className="max-h-full max-w-full object-contain filter drop-shadow"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <RiffanTvRemoteIcon size={22} animate="none" />
                      )}
                    </div>
                  ) : it.kind === 'match' ? (
                    <div className="p-1.5 w-full h-full flex items-center justify-center bg-emerald-950/40">
                      {it.imageUrl ? (
                        <img
                          src={it.imageUrl}
                          alt={it.title}
                          className="w-8 h-8 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <RiffanTrophyIcon size={24} animate="hover" />
                      )}
                    </div>
                  ) : (
                    <PosterImage
                      src={it.imageUrl || ''}
                      alt={it.title}
                      aspect="poster"
                      fallbackTitle={it.title}
                      imgClassName="w-full h-full object-cover"
                    />
                  )}

                  <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-[#9146FF] text-[10px] font-bold text-white flex items-center justify-center shadow">
                    {idx + 1}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-white/10 text-zinc-300">
                      {it.badge || it.kind}
                    </span>
                    {it.targetSeason && it.targetEpisode && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-[#9146FF]/30 text-[#D8B4FE]">
                        T{it.targetSeason}·E{it.targetEpisode}
                      </span>
                    )}
                  </div>
                  <h4 className="font-display font-bold text-sm text-white truncate mt-0.5 group-hover:text-[#BF94FF] transition-colors">
                    {it.title}
                  </h4>
                  {it.subtitle && (
                    <p className="text-xs text-zinc-400 truncate mt-0.5">{it.subtitle}</p>
                  )}
                </div>

                <span className="w-9 h-9 rounded-xl bg-white/[0.06] group-hover:bg-[#9146FF] text-white flex items-center justify-center shrink-0 transition-colors">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showQuickChips && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
            {pickLang(lang, {
              es: 'Prueba diciendo o tocando:',
              ca: 'Prova dient o tocant:',
              en: 'Try asking:',
              zh: '试试这样问我：',
            })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onSelectQuickChip(chip);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-[#10121C] hover:bg-[#9146FF]/20 border border-white/[0.08] hover:border-[#9146FF]/60 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer text-left"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
