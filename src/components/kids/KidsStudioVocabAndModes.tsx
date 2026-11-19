import React from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Ear,
  Mic,
  Star,
  Volume2,
} from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_LANGUAGES,
  type KidsLanguageMeta,
  type KidsVocabEntry,
} from './kidsData';
import {
  KIDS_SENTENCE_BANK,
  type ExtendedVocabCategory,
  type ExtendedVocabItem,
  type KidsSentenceExercise,
} from './kidsCurriculumData';
import { playKidsSound } from './kidsAudioEngine';
import type { KidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import { KidsVocabSvg } from './KidsSvgArt';
import { KidsInteractiveScene } from './KidsInteractiveScene';
import { extractCleanWord } from './KidsStudioModals';

interface KidsSentencesModeProps {
  kidsLang: KidsLanguageCode;
  targetLang: KidsLanguageCode;
  targetMeta: KidsLanguageMeta;
  t: KidsUiCopy;
  activeSentence: KidsSentenceExercise;
  sentenceData: { full: string; phonetic: string; tokens: string[]; distractor: string };
  sentenceNative: { full: string; phonetic: string; tokens: string[]; distractor: string };
  shuffledSentenceTokens: string[];
  pickedWordIdx: number[];
  setPickedWordIdx: React.Dispatch<React.SetStateAction<number[]>>;
  sentenceStatus: 'playing' | 'won' | 'wrong';
  setSentenceStatus: React.Dispatch<React.SetStateAction<'playing' | 'won' | 'wrong'>>;
  setSentenceIdx: React.Dispatch<React.SetStateAction<number>>;
  listeningMic: boolean;
  micResult: { text: string; ok: boolean } | null;
  supportsSpeechRec: boolean;
  onPracticeVoice: () => void;
  onPickSentenceWord: (idx: number) => void;
}

export const KidsSentencesMode: React.FC<KidsSentencesModeProps> = ({
  targetLang,
  targetMeta,
  t,
  activeSentence,
  sentenceData,
  sentenceNative,
  shuffledSentenceTokens,
  pickedWordIdx,
  setPickedWordIdx,
  sentenceStatus,
  setSentenceStatus,
  setSentenceIdx,
  listeningMic,
  micResult,
  supportsSpeechRec,
  onPracticeVoice,
  onPickSentenceWord,
}) => (
  <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-y-auto no-scrollbar pb-3">
    <div className="rounded-3xl bg-gradient-to-br from-[#1B2654] to-[#111838] border-2 border-emerald-400/40 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-16 h-16 rounded-2xl bg-[#0B1026] border border-white/15 flex items-center justify-center shrink-0">
          <KidsVocabSvg iconId={activeSentence.iconId} size={46} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
            <FlagBadgeSvg code={targetMeta.flagCode} className="w-4 h-2.5 shrink-0" />
            <span>Forma la frase · [{sentenceData.phonetic}]</span>
          </div>
          <div className="font-display font-black text-lg sm:text-2xl text-white">
            {sentenceNative.full}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <KidsSpeakButton text={sentenceData.full} lang={targetLang} size="md" />
        <KidsSquishButton
          onClick={onPracticeVoice}
          className={`!min-h-[42px] px-3 rounded-xl font-black text-xs flex items-center gap-1.5 ${
            listeningMic
              ? 'bg-rose-500 text-white animate-pulse'
              : 'bg-pink-400 text-slate-950 border-b-4 border-pink-600'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>{supportsSpeechRec ? 'Pronunciar' : 'Escucha y Repite'}</span>
        </KidsSquishButton>
        <KidsSquishButton
          onClick={() => setSentenceIdx((i) => (i + 1) % KIDS_SENTENCE_BANK.length)}
          ariaLabel={t.vocabNextWord}
          className="w-11 !min-h-[42px] rounded-xl bg-[#243272] text-white flex items-center justify-center"
        >
          <ChevronRight className="w-5 h-5 rtl:rotate-180" />
        </KidsSquishButton>
      </div>
    </div>

    {micResult && (
      <div
        className={`px-3.5 py-2 rounded-2xl border text-xs font-extrabold flex items-center justify-between gap-2 ${
          micResult.ok
            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100'
            : 'bg-amber-500/20 border-amber-400 text-amber-100'
        }`}
      >
        <span>
          {micResult.ok ? '¡Muy bien pronunciado!' : 'Prueba otra vez despacio:'} "{micResult.text}"
        </span>
        {micResult.ok && <span>+3 estrellas</span>}
      </div>
    )}

    <div
      dir={targetLang === 'ar' ? 'rtl' : 'ltr'}
      className="rounded-3xl bg-[#0D132B] border-2 border-white/15 p-4 flex flex-wrap items-center justify-center gap-2.5 min-h-[88px]"
    >
      {sentenceData.tokens.map((expected, slotIdx) => {
        const pickedIdx = pickedWordIdx[slotIdx];
        const word = pickedIdx !== undefined ? shuffledSentenceTokens[pickedIdx] : null;
        return (
          <button
            key={`${slotIdx}-${expected}`}
            type="button"
            onClick={() => {
              if (pickedIdx === undefined || sentenceStatus === 'won') return;
              setPickedWordIdx((prev) => prev.filter((_, i) => i !== slotIdx));
              setSentenceStatus('playing');
            }}
            className={`min-w-[68px] h-12 px-3.5 rounded-2xl border-2 font-display font-black text-base sm:text-lg flex items-center justify-center transition-all ${
              sentenceStatus === 'won'
                ? 'bg-emerald-400 text-slate-950 border-emerald-200 scale-105'
                : sentenceStatus === 'wrong'
                ? 'bg-rose-500/25 text-rose-200 border-rose-400'
                : word !== null
                ? 'bg-amber-400 text-slate-950 border-amber-200 cursor-pointer'
                : 'bg-white/5 text-white/25 border-dashed border-white/25'
            }`}
          >
            {word !== null ? word : '____'}
          </button>
        );
      })}
    </div>

    <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[#12193B] border border-white/10 p-4">
      <p className="text-[11px] font-bold text-sky-200/75">
        Toca las palabras en orden correcto (cuidado: hay 1 palabra trampa):
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {shuffledSentenceTokens.map((tk, idx) => {
          const used = pickedWordIdx.includes(idx);
          return (
            <KidsSquishButton
              key={`${idx}-${tk}`}
              disabled={used || sentenceStatus === 'won'}
              onClick={() => onPickSentenceWord(idx)}
              className={`h-12 px-4 rounded-2xl border-b-4 font-display font-black text-base sm:text-lg ${
                used
                  ? 'opacity-25 bg-[#1B254D] border-[#0E142E] text-white'
                  : 'bg-[#1F2D69] hover:bg-[#2A3D8D] border-[#0E1538] text-white'
              }`}
            >
              {tk}
            </KidsSquishButton>
          );
        })}
      </div>

      {sentenceStatus === 'wrong' && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-rose-300">{t.mathTryAnother}</span>
          <button
            type="button"
            onClick={() => {
              setPickedWordIdx([]);
              setSentenceStatus('playing');
            }}
            className="text-xs font-black text-amber-300 underline cursor-pointer"
          >
            Reiniciar
          </button>
        </div>
      )}

      {sentenceStatus === 'won' && (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-black text-emerald-300">
            <CheckCircle2 className="w-4 h-4" />
            <span>{sentenceData.full} (+4)</span>
          </span>
          <KidsSquishButton
            onClick={() => setSentenceIdx((i) => (i + 1) % KIDS_SENTENCE_BANK.length)}
            className="!min-h-[38px] h-9 px-4 rounded-xl bg-amber-400 text-slate-950 font-black text-xs"
          >
            Siguiente frase
          </KidsSquishButton>
        </div>
      )}
    </div>
  </div>
);

interface KidsScenesModeProps {
  kidsLang: KidsLanguageCode;
  targetLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  soundEnabled: boolean;
  tortoiseSpeech: boolean;
  sceneSubTab: 'montessori' | 'phonics' | 'minimal';
  setSceneSubTab: React.Dispatch<React.SetStateAction<'montessori' | 'phonics' | 'minimal'>>;
  activePhonics: {
    lang: KidsLanguageCode;
    iconId: string;
    leftPart: string;
    rightPart: string;
    combined: string;
    meaningEs: string;
    tip: string;
  } | undefined;
  blended: boolean;
  setBlended: React.Dispatch<React.SetStateAction<boolean>>;
  setPhonicsIdx: React.Dispatch<React.SetStateAction<number>>;
  langPhonicsLen: number;
  activeMinimal: {
    lang: KidsLanguageCode;
    wordA: string;
    wordB: string;
    phoneticA: string;
    phoneticB: string;
    contrastNote: string;
  } | undefined;
  minimalChallengeTarget: 'A' | 'B';
  setMinimalChallengeTarget: React.Dispatch<React.SetStateAction<'A' | 'B'>>;
  minimalFeedback: 'ok' | 'retry' | null;
  setMinimalFeedback: React.Dispatch<React.SetStateAction<'ok' | 'retry' | null>>;
  setMinimalIdx: React.Dispatch<React.SetStateAction<number>>;
  langMinimalLen: number;
  speakTarget: (text: string, langCode?: KidsLanguageCode, slowOverride?: boolean) => void;
  recordDomainResult: (domain: 'math' | 'lang' | 'logic', ok: boolean, itemId?: string) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionLearn?: () => void;
}

export const KidsScenesAndPhonicsMode: React.FC<KidsScenesModeProps> = ({
  kidsLang,
  targetLang,
  ageGroup,
  soundEnabled,
  tortoiseSpeech,
  sceneSubTab,
  setSceneSubTab,
  activePhonics,
  blended,
  setBlended,
  setPhonicsIdx,
  langPhonicsLen,
  activeMinimal,
  minimalChallengeTarget,
  setMinimalChallengeTarget,
  minimalFeedback,
  setMinimalFeedback,
  setMinimalIdx,
  langMinimalLen,
  speakTarget,
  recordDomainResult,
  onEarnStar,
  onMissionLearn,
}) => (
  <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
    <div className="shrink-0 flex items-center gap-1.5">
      {(
        [
          { id: 'montessori', label: 'Escenas Vivas' },
          { id: 'phonics', label: 'Fonética y Sílabas' },
          { id: 'minimal', label: 'Oído Fino (Pares)' },
        ] as const
      ).map((sub) => (
        <button
          key={sub.id}
          type="button"
          onClick={() => {
            playKidsSound('tap', soundEnabled, true);
            setSceneSubTab(sub.id);
          }}
          className={`h-8 px-3 rounded-xl text-xs font-black border cursor-pointer ${
            sceneSubTab === sub.id
              ? 'bg-pink-400 text-slate-950 border-pink-200'
              : 'bg-[#141D42] text-sky-100 border-white/10'
          }`}
        >
          {sub.label}
        </button>
      ))}
    </div>

    {sceneSubTab === 'montessori' && (
      <KidsInteractiveScene
        nativeLang={kidsLang}
        targetLang={targetLang}
        ageGroup={ageGroup}
        onSuccessChallenge={(vocabId) => {
          recordDomainResult('lang', true, vocabId);
          onEarnStar(2, 'tarifit_friend');
          onMissionLearn?.();
        }}
      />
    )}

    {sceneSubTab === 'phonics' && activePhonics && (
      <div className="flex-1 min-h-0 rounded-3xl bg-[#141C42] border-2 border-pink-400/35 p-4 sm:p-6 flex flex-col items-center justify-center gap-5 text-center overflow-y-auto">
        <KidsVocabSvg iconId={activePhonics.iconId} size={68} />

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => speakTarget(activePhonics.leftPart, activePhonics.lang, true)}
            className="px-5 py-3 rounded-2xl bg-sky-500/25 border-2 border-sky-400 font-display font-black text-2xl sm:text-3xl text-white cursor-pointer"
          >
            {activePhonics.leftPart}
          </button>
          <span className="text-2xl font-black text-amber-300">+</span>
          <button
            type="button"
            onClick={() => speakTarget(activePhonics.rightPart, activePhonics.lang, true)}
            className="px-5 py-3 rounded-2xl bg-pink-500/25 border-2 border-pink-400 font-display font-black text-2xl sm:text-3xl text-white cursor-pointer"
          >
            {activePhonics.rightPart}
          </button>
          <span className="text-2xl font-black text-emerald-300">=</span>
          <KidsSquishButton
            onClick={() => {
              setBlended(true);
              playKidsSound('success', soundEnabled, true);
              speakTarget(activePhonics.combined, activePhonics.lang, false);
              onEarnStar(2);
              onMissionLearn?.();
            }}
            className={`px-6 py-3 rounded-2xl border-b-4 font-display font-black text-2xl sm:text-3xl ${
              blended
                ? 'bg-emerald-400 text-slate-950 border-emerald-600'
                : 'bg-amber-400 text-slate-950 border-amber-600'
            }`}
          >
            {activePhonics.combined}
          </KidsSquishButton>
        </div>

        <div className="max-w-md space-y-1">
          <div className="text-sm font-black text-white">{activePhonics.meaningEs}</div>
          <p className="text-xs font-semibold text-sky-200/80">{activePhonics.tip}</p>
        </div>

        <KidsSquishButton
          onClick={() => {
            setBlended(false);
            setPhonicsIdx((i) => (i + 1) % langPhonicsLen);
          }}
          className="px-5 rounded-xl bg-[#22306B] text-white text-xs font-black flex items-center gap-1.5"
        >
          <span>Siguiente sílaba</span>
          <ChevronRight className="w-4 h-4" />
        </KidsSquishButton>
      </div>
    )}

    {sceneSubTab === 'minimal' && activeMinimal && (
      <div className="flex-1 min-h-0 rounded-3xl bg-[#141C42] border-2 border-amber-400/35 p-4 sm:p-6 flex flex-col items-center justify-center gap-4 text-center overflow-y-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-200 text-xs font-black">
          <Ear className="w-4 h-4" />
          <span>Pulsa Oír Reto y distingue qué palabra suena</span>
        </div>

        <KidsSquishButton
          onClick={() => {
            const chosenTarget: 'A' | 'B' = Math.random() > 0.5 ? 'A' : 'B';
            setMinimalChallengeTarget(chosenTarget);
            setMinimalFeedback(null);
            const w = chosenTarget === 'A' ? activeMinimal.wordA : activeMinimal.wordB;
            speakTarget(w, activeMinimal.lang, tortoiseSpeech);
          }}
          className="px-6 rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-slate-950 font-black text-sm flex items-center gap-2"
        >
          <Volume2 className="w-5 h-5" />
          <span>Oír Palabra Misteriosa</span>
        </KidsSquishButton>

        <div className="grid grid-cols-2 gap-3 w-full max-w-md">
          {(['A', 'B'] as const).map((side) => {
            const word = side === 'A' ? activeMinimal.wordA : activeMinimal.wordB;
            const phon = side === 'A' ? activeMinimal.phoneticA : activeMinimal.phoneticB;
            return (
              <button
                key={side}
                type="button"
                onClick={() => {
                  const ok = side === minimalChallengeTarget;
                  setMinimalFeedback(ok ? 'ok' : 'retry');
                  recordDomainResult('lang', ok);
                  if (ok) {
                    playKidsSound('success', soundEnabled, true);
                    onEarnStar(2);
                    onMissionLearn?.();
                  } else {
                    playKidsSound('error', soundEnabled, true);
                    speakTarget(word, activeMinimal.lang, true);
                  }
                }}
                className="p-4 rounded-2xl bg-[#1B275C] hover:bg-[#243478] border-2 border-sky-400/35 text-center cursor-pointer space-y-1"
              >
                <div className="font-display font-black text-2xl text-white">{word}</div>
                <div className="text-xs font-bold text-amber-200">{phon}</div>
              </button>
            );
          })}
        </div>

        <p className="text-xs font-bold text-sky-200/80 max-w-md">{activeMinimal.contrastNote}</p>

        {minimalFeedback && (
          <div
            className={`text-xs font-black ${
              minimalFeedback === 'ok' ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            {minimalFeedback === 'ok' ? '¡Oído perfecto! +2 estrellas' : 'Escucha otra vez despacio'}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setMinimalFeedback(null);
            setMinimalIdx((i) => (i + 1) % langMinimalLen);
          }}
          className="text-xs font-black text-sky-300 underline cursor-pointer"
        >
          Siguiente contraste
        </button>
      </div>
    )}
  </div>
);

interface KidsVocabExplorerModeProps {
  ageGroup: KidsAgeGroup;
  targetLang: KidsLanguageCode;
  setTargetLang: (lang: KidsLanguageCode) => void;
  targetMeta: KidsLanguageMeta;
  soundEnabled: boolean;
  tortoiseSpeech: boolean;
  t: KidsUiCopy;
  category: 'all' | ExtendedVocabCategory;
  setCategory: (cat: 'all' | ExtendedVocabCategory) => void;
  setWordIndex: React.Dispatch<React.SetStateAction<number>>;
  setCustomResult: React.Dispatch<React.SetStateAction<KidsVocabEntry | null>>;
  compareOpen: boolean;
  setCompareOpen: React.Dispatch<React.SetStateAction<boolean>>;
  filteredVocabLen: number;
  currentWord: ExtendedVocabItem | KidsVocabEntry;
  targetTr: { word: string; phonetic: string };
  nativeTr: { word: string; phonetic: string };
  setConfettiActive: (v: boolean) => void;
  recordDomainResult: (domain: 'math' | 'lang' | 'logic', ok: boolean, itemId?: string) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionLearn?: () => void;
}

export const KidsVocabExplorerMode: React.FC<KidsVocabExplorerModeProps> = ({
  ageGroup,
  targetLang,
  setTargetLang,
  targetMeta,
  soundEnabled,
  tortoiseSpeech,
  t,
  category,
  setCategory,
  setWordIndex,
  setCustomResult,
  compareOpen,
  setCompareOpen,
  filteredVocabLen,
  currentWord,
  targetTr,
  nativeTr,
  setConfettiActive,
  recordDomainResult,
  onEarnStar,
  onMissionLearn,
}) => (
  <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
    <div className="shrink-0 flex items-center justify-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
      {(
        [
          { id: 'all', label: 'Todas' },
          { id: 'animals', label: 'Animales' },
          { id: 'food', label: 'Comida' },
          { id: 'nature', label: 'Naturaleza' },
          { id: 'numbers', label: 'Números' },
          { id: 'family', label: 'Familia' },
        ] as const
      ).map((cat) => (
        <button
          key={cat.id}
          type="button"
          data-tv-focusable="true"
          onClick={() => {
            setCustomResult(null);
            setCategory(cat.id as 'all' | ExtendedVocabCategory);
            setWordIndex(0);
          }}
          className={`h-7 px-3 rounded-full text-xs font-black cursor-pointer transition-all ${
            category === cat.id
              ? 'bg-amber-400 text-slate-950 shadow scale-105'
              : 'bg-[#151E46] text-sky-100 hover:bg-[#202D68] border border-white/10'
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>

    <div className="flex-1 min-h-0 rounded-3xl bg-gradient-to-b from-[#182455] via-[#12193D] to-[#0A0F26] border-2 border-sky-400/40 p-3 sm:p-5 flex flex-col items-center justify-between shadow-2xl relative">
      <div className="w-full flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-black text-amber-300">
          <FlagBadgeSvg code={targetMeta.flagCode} className="w-4 h-2.5 shrink-0" />
          <span>{targetMeta.nativeLabel}</span>
        </div>

        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => setCompareOpen((v) => !v)}
          className="h-7 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-sky-200 text-xs font-bold cursor-pointer"
        >
          {compareOpen ? 'Ocultar otros idiomas' : 'Ver en 8 idiomas'}
        </button>
      </div>

      <div className="flex flex-col items-center justify-center text-center my-auto space-y-2">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-[#090E24] border-2 border-amber-300/40 flex items-center justify-center shadow-xl p-2">
          <KidsVocabSvg iconId={currentWord.iconId} size={64} />
        </div>

        <div className="space-y-0.5">
          <h3 className="font-display font-black text-3xl sm:text-4xl text-white tracking-tight leading-tight">
            {extractCleanWord(targetTr.word)}
          </h3>
          <p className="text-xs sm:text-sm font-bold text-amber-300">
            [{targetTr.phonetic}] · {extractCleanWord(nativeTr.word)}
          </p>
        </div>
      </div>

      {compareOpen && (
        <div className="w-full grid grid-cols-4 sm:grid-cols-8 gap-1 my-1">
          {KIDS_LANGUAGES.map((langMeta) => {
            const entry = currentWord.translations[langMeta.code];
            const isTarget = langMeta.code === targetLang;
            return (
              <button
                key={langMeta.code}
                type="button"
                onClick={() => {
                  setTargetLang(langMeta.code);
                  void speakKidsText(extractCleanWord(entry.word), langMeta.code, {
                    ageGroup,
                    rate: tortoiseSpeech ? 0.72 : undefined,
                  });
                }}
                className={`p-1 rounded-lg border text-center flex flex-col items-center gap-0.5 cursor-pointer ${
                  isTarget
                    ? 'bg-amber-400 text-slate-950 border-amber-300 font-black'
                    : 'bg-[#151F48] text-white border-white/10'
                }`}
              >
                <FlagBadgeSvg code={langMeta.flagCode} className="w-3.5 h-2" />
                <span className="text-[9px] truncate w-full">{extractCleanWord(entry.word)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="w-full flex items-center justify-between gap-2 pt-1">
        <KidsSquishButton
          onClick={() => {
            setCustomResult(null);
            setWordIndex((i) => (i - 1 + filteredVocabLen) % filteredVocabLen);
          }}
          ariaLabel={t.vocabPrevWord}
          className="!min-w-[44px] !min-h-[44px] h-11 w-11 sm:w-12 rounded-2xl bg-[#1C2858] hover:bg-[#253574] text-white flex items-center justify-center shadow-md"
        >
          <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
        </KidsSquishButton>

        <div className="flex items-center gap-2">
          <KidsSpeakButton text={extractCleanWord(targetTr.word)} lang={targetLang} size="lg" />

          <KidsSquishButton
            onClick={() => {
              playKidsSound('star', soundEnabled, true);
              setConfettiActive(true);
              recordDomainResult('lang', true, currentWord.id);
              onEarnStar(1, 'tarifit_friend');
              onMissionLearn?.();
              setWordIndex((i) => (i + 1) % filteredVocabLen);
            }}
            className="!min-h-[44px] h-11 px-4 sm:px-5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-display font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg"
          >
            <Star className="w-4 h-4 fill-slate-950" />
            <span>¡Me la sé! (+1)</span>
          </KidsSquishButton>
        </div>

        <KidsSquishButton
          onClick={() => {
            setCustomResult(null);
            setWordIndex((i) => (i + 1) % filteredVocabLen);
          }}
          ariaLabel={t.vocabNextWord}
          className="!min-w-[44px] !min-h-[44px] h-11 w-11 sm:w-12 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-md"
        >
          <ChevronRight className="w-5 h-5 rtl:rotate-180" />
        </KidsSquishButton>
      </div>
    </div>
  </div>
);
