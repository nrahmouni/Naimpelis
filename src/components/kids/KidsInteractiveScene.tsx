import React, { useMemo, useState } from 'react';
import { CheckCircle2, Ear, Snail, Volume2 } from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import {
  findExtendedVocabEntry,
  KIDS_EXPLORE_SCENES,
} from './kidsCurriculumData';
import { playKidsSound } from './kidsAudioEngine';
import { speakKidsText } from './kidsTtsHelper';
import { KidsVocabSvg } from './KidsSvgArt';
import { KidsSquishButton } from './KidsPrimitives';

interface KidsInteractiveSceneProps {
  nativeLang: KidsLanguageCode;
  targetLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  onSuccessChallenge: (vocabId: string) => void;
}

function cleanWord(w: string): string {
  const idx = w.indexOf('(');
  return (idx >= 0 ? w.slice(0, idx) : w).trim() || w.trim();
}

export const KidsInteractiveScene: React.FC<KidsInteractiveSceneProps> = ({
  nativeLang,
  targetLang,
  ageGroup,
  onSuccessChallenge,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string>('bread');
  const [listenMode, setListenMode] = useState(false);
  const [challengeIdx, setChallengeIdx] = useState(0);
  const [feedback, setFeedback] = useState<'ok' | 'retry' | null>(null);

  const scene = KIDS_EXPLORE_SCENES[sceneIdx % KIDS_EXPLORE_SCENES.length];

  const challengeTargetId = useMemo(() => {
    const hs = scene.hotspots[challengeIdx % scene.hotspots.length];
    return hs?.vocabId || scene.hotspots[0].vocabId;
  }, [scene, challengeIdx]);

  const activeEntry = findExtendedVocabEntry(selectedId);
  const challengeEntry = findExtendedVocabEntry(challengeTargetId);

  const speakWord = async (vocabId: string, slow = false) => {
    const entry = findExtendedVocabEntry(vocabId);
    const tr = entry.translations[targetLang] || entry.translations.en;
    const nat = entry.translations[nativeLang] || entry.translations.es;
    await speakKidsText(cleanWord(tr.word), targetLang, {
      ageGroup,
      rate: slow || ux.tortoiseSpeech ? 0.66 : undefined,
    });
    if (nativeLang !== targetLang) {
      window.setTimeout(() => {
        void speakKidsText(cleanWord(nat.word), nativeLang, { ageGroup });
      }, 900);
    }
  };

  const handleHotspotTap = (vocabId: string) => {
    triggerHaptic('light');
    setSelectedId(vocabId);

    if (!listenMode) {
      playKidsSound('tap', ux.soundEnabled, true);
      void speakWord(vocabId, false);
      return;
    }

    if (vocabId === challengeTargetId) {
      playKidsSound('success', ux.soundEnabled, true);
      setFeedback('ok');
      onSuccessChallenge(vocabId);
      window.setTimeout(() => {
        setFeedback(null);
        const nextIdx = (challengeIdx + 1) % scene.hotspots.length;
        setChallengeIdx(nextIdx);
        const nextEntry = findExtendedVocabEntry(scene.hotspots[nextIdx].vocabId);
        const nextWord = cleanWord(nextEntry.translations[targetLang]?.word || '');
        void speakKidsText(nextWord, targetLang, { ageGroup });
      }, 850);
    } else {
      playKidsSound('error', ux.soundEnabled, true);
      setFeedback('retry');
    }
  };

  const trTarget = activeEntry.translations[targetLang] || activeEntry.translations.en;
  const trNative = activeEntry.translations[nativeLang] || activeEntry.translations.es;
  const chalTr = challengeEntry.translations[targetLang] || challengeEntry.translations.en;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-y-auto no-scrollbar pb-2">
      {/* Scene Selector + Listen-and-Tap Challenge Toggle */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {KIDS_EXPLORE_SCENES.map((sc, idx) => (
            <button
              key={sc.id}
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                playKidsSound('tap', ux.soundEnabled, true);
                setSceneIdx(idx);
                setSelectedId(sc.hotspots[0].vocabId);
                setChallengeIdx(0);
                setFeedback(null);
              }}
              className={`h-9 px-3 rounded-xl text-xs font-black cursor-pointer border focus-visible:ring-4 focus-visible:ring-amber-300 outline-none ${
                sceneIdx === idx
                  ? 'bg-amber-400 text-slate-950 border-amber-200'
                  : 'bg-[#172149] text-sky-100 border-white/10'
              }`}
            >
              {sc.titleEs}
            </button>
          ))}
        </div>

        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => {
            const next = !listenMode;
            playKidsSound('tap', ux.soundEnabled, true);
            setListenMode(next);
            setFeedback(null);
            if (next) {
              const word = cleanWord(chalTr.word);
              void speakKidsText(word, targetLang, { ageGroup });
            }
          }}
          className={`h-9 px-3.5 rounded-xl text-xs font-black cursor-pointer border flex items-center gap-1.5 focus-visible:ring-4 focus-visible:ring-amber-300 outline-none ${
            listenMode
              ? 'bg-emerald-400 text-slate-950 border-emerald-200 shadow-lg'
              : 'bg-[#1D2B64] text-sky-100 border-sky-400/35'
          }`}
        >
          <Ear className="w-4 h-4" />
          <span>{listenMode ? 'Reto: Escucha y Toca (Activo)' : 'Jugar: Escucha y Toca'}</span>
        </button>
      </div>

      {/* Interactive Montessori Scene Canvas */}
      <div className="flex-1 min-h-[250px] landscape:min-h-[180px] grid grid-cols-1 md:grid-cols-12 landscape:grid-cols-12 gap-3 items-stretch">
        <div
          className={`md:col-span-8 landscape:col-span-8 relative rounded-3xl bg-gradient-to-b ${scene.bgGradient} border-2 border-white/15 overflow-hidden min-h-[235px] landscape:min-h-[180px] shadow-2xl`}
        >
          {/* Decorative Ambient Scene Horizon */}
          <svg
            viewBox="0 0 800 450"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
            aria-hidden="true"
          >
            <path d="M0 330 Q200 280 420 330 T800 315 L800 450 L0 450 Z" fill="rgba(15, 23, 42, 0.45)" />
            <circle cx="110" cy="70" r="2.5" fill="#FDE047" />
            <circle cx="670" cy="60" r="3" fill="#BAE6FD" />
            <circle cx="490" cy="85" r="2" fill="#FFFFFF" />
          </svg>

          {listenMode && (
            <div className="relative z-20 m-3 p-2.5 rounded-2xl bg-[#090F24]/90 border border-emerald-400/45 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold text-emerald-300 uppercase">
                  Escucha y toca el objeto correcto
                </div>
                <div className="text-sm font-black text-white truncate">
                  {chalTr.word} <span className="text-sky-200/75 font-semibold">[{chalTr.phonetic}]</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void speakKidsText(cleanWord(chalTr.word), targetLang, {
                    ageGroup,
                    rate: 0.68,
                  })
                }
                className="h-9 px-3 rounded-xl bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Volume2 className="w-4 h-4" />
                <span>Oír</span>
              </button>
            </div>
          )}

          {/* Clickable Object Hotspots */}
          {scene.hotspots.map((hs) => {
            const entry = findExtendedVocabEntry(hs.vocabId);
            const isSelected = selectedId === hs.vocabId && !listenMode;
            const label = cleanWord(entry.translations[targetLang]?.word || '');
            return (
              <button
                key={hs.vocabId}
                type="button"
                data-tv-focusable="true"
                onClick={() => handleHotspotTap(hs.vocabId)}
                style={{ left: `${hs.xPct}%`, top: `${hs.yPct}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 p-2 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center gap-1 ${
                  isSelected
                    ? 'bg-amber-400/25 border-amber-300 scale-110 shadow-[0_0_24px_rgba(251,191,36,0.45)] z-10'
                    : 'bg-[#0F1738]/85 hover:bg-[#1E2B61] border-white/20 hover:scale-105'
                }`}
              >
                <KidsVocabSvg iconId={hs.iconId} size={ageGroup === '3-5' ? 52 : 44} />
                {!listenMode && (
                  <span className="text-[11px] font-black text-white px-1.5 py-0.5 rounded bg-black/50 whitespace-nowrap">
                    {label}
                  </span>
                )}
              </button>
            );
          })}

          {feedback && (
            <div
              className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-lg ${
                feedback === 'ok'
                  ? 'bg-emerald-400 text-slate-950'
                  : 'bg-amber-400 text-slate-950'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{feedback === 'ok' ? '¡Exacto! +2 estrellas' : 'Escucha otra vez y prueba otro objeto'}</span>
            </div>
          )}
        </div>

        {/* Bilingual Card Readout */}
        <div className="md:col-span-4 landscape:col-span-4 rounded-3xl bg-[#161F45] border border-white/15 p-4 landscape:p-3 flex flex-col justify-between gap-3 landscape:gap-2">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-20 h-20 rounded-2xl bg-[#0D132B] border border-white/10 flex items-center justify-center">
              <KidsVocabSvg iconId={activeEntry.iconId} size={62} />
            </div>
            <div>
              <div className="font-display font-black text-2xl text-amber-300">
                {trTarget.word}
              </div>
              <div className="text-xs font-bold text-sky-200/80">[{trTarget.phonetic}]</div>
              <div className="text-sm font-extrabold text-white mt-1.5">
                {trNative.word}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <KidsSquishButton
              onClick={() => void speakWord(activeEntry.id, false)}
              className="flex-1 !min-h-[44px] px-3 rounded-xl bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5"
            >
              <Volume2 className="w-4 h-4" />
              <span>Voz Doble</span>
            </KidsSquishButton>
            <KidsSquishButton
              onClick={() => void speakWord(activeEntry.id, true)}
              className="!min-h-[44px] px-3 rounded-xl bg-[#222F66] text-sky-100 font-black text-xs flex items-center justify-center gap-1.5"
            >
              <Snail className="w-4 h-4 text-emerald-300" />
              <span>0.7x</span>
            </KidsSquishButton>
          </div>
        </div>
      </div>
    </div>
  );
};
