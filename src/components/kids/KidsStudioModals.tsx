import React from 'react';
import { Flame, X } from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import type { KidsLanguageMeta, KidsVocabEntry } from './kidsData';
import type { ExtendedVocabItem, KidsIslandUnit } from './kidsCurriculumData';
import { playKidsSound } from './kidsAudioEngine';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import { KidsVocabSvg } from './KidsSvgArt';

export function extractCleanWord(rawWord: string): string {
  const idx = rawWord.indexOf('(');
  const base = (idx >= 0 ? rawWord.slice(0, idx) : rawWord).trim();
  return base || rawWord.trim();
}

export interface ActiveIslandLessonState {
  island: KidsIslandUnit;
  node: KidsIslandUnit['nodes'][number];
  stepIdx: number;
  vocabPool: ExtendedVocabItem[];
  quizIdx: number;
  quizAnswerPicked: string | null;
  quizScore: number;
}

interface KidsIslandLessonModalProps {
  activeLesson: ActiveIslandLessonState | null;
  setActiveLesson: React.Dispatch<React.SetStateAction<ActiveIslandLessonState | null>>;
  kidsLang: KidsLanguageCode;
  targetLang: KidsLanguageCode;
  soundEnabled: boolean;
  speakTarget: (text: string, langCode?: KidsLanguageCode) => void;
  completeCurriculumNode: (nodeId: string, stars: number) => void;
  setConfettiActive: (v: boolean) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionLearn?: () => void;
  handleLessonQuizPick: (chosenId: string) => void;
}

export const KidsIslandLessonModal: React.FC<KidsIslandLessonModalProps> = ({
  activeLesson,
  setActiveLesson,
  kidsLang,
  targetLang,
  soundEnabled,
  speakTarget,
  completeCurriculumNode,
  setConfettiActive,
  onEarnStar,
  onMissionLearn,
  handleLessonQuizPick,
}) => {
  if (!activeLesson) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[262] bg-black/82 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#141B38] border-2 border-amber-400/50 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-black uppercase text-amber-300">
              {activeLesson.island.titleByLang[kidsLang] || activeLesson.island.titleByLang.es}
            </span>
            <h3 className="font-display font-black text-lg text-white truncate">
              {activeLesson.node.labelEs}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setActiveLesson(null)}
            aria-label="Close"
            className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {activeLesson.node.kind === 'vocab' && activeLesson.stepIdx < activeLesson.vocabPool.length ? (
          (() => {
            const item = activeLesson.vocabPool[activeLesson.stepIdx];
            const tr = item.translations[targetLang] || item.translations.en;
            const nat = item.translations[kidsLang] || item.translations.es;
            return (
              <div className="space-y-4 text-center">
                <div className="p-6 rounded-3xl bg-[#0D132B] border border-white/15 flex flex-col items-center gap-3">
                  <KidsVocabSvg iconId={item.iconId} size={78} />
                  <div className="font-display font-black text-3xl text-amber-300">
                    {extractCleanWord(tr.word)}
                  </div>
                  <div className="text-xs font-bold text-sky-200">
                    [{tr.phonetic}] · {extractCleanWord(nat.word)}
                  </div>
                  <KidsSpeakButton text={extractCleanWord(tr.word)} lang={targetLang} size="lg" />
                </div>
                <KidsSquishButton
                  onClick={() => {
                    playKidsSound('tap', soundEnabled, true);
                    const nextIdx = activeLesson.stepIdx + 1;
                    if (nextIdx >= activeLesson.vocabPool.length) {
                      completeCurriculumNode(activeLesson.node.id, activeLesson.node.rewardStars);
                      setConfettiActive(true);
                      onEarnStar(activeLesson.node.rewardStars, 'tarifit_friend');
                      onMissionLearn?.();
                      setActiveLesson(null);
                    } else {
                      const nTr = activeLesson.vocabPool[nextIdx].translations[targetLang];
                      speakTarget(extractCleanWord(nTr.word), targetLang);
                      setActiveLesson({ ...activeLesson, stepIdx: nextIdx });
                    }
                  }}
                  className="w-full rounded-2xl bg-emerald-400 text-slate-950 font-black text-base"
                >
                  {activeLesson.stepIdx + 1 >= activeLesson.vocabPool.length
                    ? `Completar paso (+${activeLesson.node.rewardStars})`
                    : 'Siguiente palabra'}
                </KidsSquishButton>
              </div>
            );
          })()
        ) : (
          (() => {
            const targetItem =
              activeLesson.vocabPool[activeLesson.quizIdx % activeLesson.vocabPool.length];
            const tr = targetItem.translations[targetLang] || targetItem.translations.en;
            const options = [
              targetItem,
              ...activeLesson.vocabPool.filter((v) => v.id !== targetItem.id).slice(0, 3),
            ]
              .slice(0, 4)
              .sort((a, b) => a.id.localeCompare(b.id));

            return (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#0D132B] border border-white/15 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-sky-300 uppercase">
                      Reto {activeLesson.quizIdx + 1} · ¿Cuál corresponde a:
                    </div>
                    <div className="font-display font-black text-2xl text-white truncate">
                      {extractCleanWord(tr.word)}
                    </div>
                    <div className="text-xs font-bold text-amber-200/80">[{tr.phonetic}]</div>
                  </div>
                  <KidsSpeakButton text={extractCleanWord(tr.word)} lang={targetLang} size="md" />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {options.map((opt) => {
                    const natOpt = opt.translations[kidsLang] || opt.translations.es;
                    const pickedThis = activeLesson.quizAnswerPicked === opt.id;
                    const isRight = opt.id === targetItem.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleLessonQuizPick(opt.id)}
                        className={`p-3.5 rounded-2xl border-2 flex flex-col items-center gap-2 cursor-pointer transition-all ${
                          activeLesson.quizAnswerPicked && isRight
                            ? 'bg-emerald-500/25 border-emerald-400'
                            : pickedThis
                            ? 'bg-rose-500/25 border-rose-400'
                            : 'bg-[#1B2552] hover:bg-[#253370] border-white/15'
                        }`}
                      >
                        <KidsVocabSvg iconId={opt.iconId} size={50} />
                        <span className="font-display font-black text-sm text-white">
                          {extractCleanWord(natOpt.word)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
};

interface KidsPlacementModalProps {
  open: boolean;
  onClose: () => void;
  placementItems: Array<KidsVocabEntry | ExtendedVocabItem>;
  placementStep: number;
  kidsLang: KidsLanguageCode;
  targetLang: KidsLanguageCode;
  targetMeta: KidsLanguageMeta;
  onAnswer: (chosenId: string) => void;
}

export const KidsPlacementModal: React.FC<KidsPlacementModalProps> = ({
  open,
  onClose,
  placementItems,
  placementStep,
  kidsLang,
  targetLang,
  targetMeta,
  onAnswer,
}) => {
  if (!open) return null;
  const target = placementItems[placementStep];
  const tr = target.translations[targetLang] || target.translations.en;
  const opts = [
    target,
    ...placementItems.filter((x) => x.id !== target.id).slice(0, 3),
  ].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[262] bg-black/82 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-3xl bg-[#141B38] border-2 border-sky-400/50 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
            <Flame className="w-4 h-4" />
            <span>Test Rápido de Nivel ({placementStep + 1}/{placementItems.length})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-[#0D132B] border border-white/10 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-sky-300">{targetMeta.nativeLabel}</div>
            <div className="font-display font-black text-2xl text-white">
              {extractCleanWord(tr.word)}
            </div>
          </div>
          <KidsSpeakButton text={extractCleanWord(tr.word)} lang={targetLang} size="md" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onAnswer(o.id)}
              className="p-3 rounded-2xl bg-[#1B2552] hover:bg-[#253370] border border-white/15 flex flex-col items-center gap-2 cursor-pointer"
            >
              <KidsVocabSvg iconId={o.iconId} size={44} />
              <span className="text-xs font-black text-white">
                {extractCleanWord((o.translations[kidsLang] || o.translations.es).word)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
