import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Magnet,
  Play,
  Rocket,
  RotateCcw,
  Shield,
  Star,
  Trophy,
  Volume2,
} from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import { FlagBadgeSvg, type FlagCode } from '../ui/LanguageBadge';
import { KIDS_LANGUAGES } from './kidsData';
import type { KidsUiCopy } from './kidsI18n';
import { KidsSquishButton } from './KidsPrimitives';
import type { SpaceMissionChallenge } from './kidsStarCatcherCanvas';

interface KidsStarCatcherHudProps {
  t: KidsUiCopy;
  practiceLang: KidsLanguageCode;
  practiceLangFlag: FlagCode;
  challenge: SpaceMissionChallenge;
  score: number;
  combo: number;
  lives: number;
  shieldActive: boolean;
  magnetActive: boolean;
  timeLeft: number;
  onChangePracticeLang: (nl: KidsLanguageCode) => void;
  onSpeakPrompt: () => void;
}

export const KidsStarCatcherHud: React.FC<KidsStarCatcherHudProps> = ({
  t,
  practiceLang,
  practiceLangFlag,
  challenge,
  score,
  combo,
  lives,
  shieldActive,
  magnetActive,
  timeLeft,
  onChangePracticeLang,
  onSpeakPrompt,
}) => (
  <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-2xl bg-[#101836] border border-white/15 text-xs font-black">
    <div className="flex items-center gap-2 min-w-0">
      <FlagBadgeSvg code={practiceLangFlag} className="w-4 h-3 shrink-0" />
      <select
        aria-label={t.chooseLanguageTitle}
        value={practiceLang}
        onChange={(e) => onChangePracticeLang(e.target.value as KidsLanguageCode)}
        className="h-8 px-2 rounded-lg bg-[#1A244D] border border-white/15 text-xs font-black text-white outline-none cursor-pointer"
      >
        {KIDS_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeLabel}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onSpeakPrompt}
        className="h-8 px-2.5 rounded-lg bg-amber-400 text-slate-950 font-black flex items-center gap-1.5 cursor-pointer"
      >
        <Volume2 className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate max-w-[140px]">Atrapa: {challenge.promptDisplay}</span>
      </button>
    </div>

    <div className="flex items-center gap-2 shrink-0">
      <span className="inline-flex items-center gap-1 text-amber-300 tabular-nums">
        <Star className="w-3.5 h-3.5 fill-amber-300" />
        {score}
      </span>
      {combo > 1 && (
        <span className="px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-300 tabular-nums">
          x{combo}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <Heart
            key={i}
            className={`w-3.5 h-3.5 ${
              i < lives ? 'fill-rose-500 text-rose-500' : 'text-white/20'
            }`}
          />
        ))}
      </div>
      {shieldActive && <Shield className="w-3.5 h-3.5 text-sky-300" />}
      {magnetActive && <Magnet className="w-3.5 h-3.5 text-emerald-300" />}
      <span className="px-2 py-0.5 rounded-lg bg-white/10 text-white tabular-nums">
        {timeLeft}s
      </span>
    </div>
  </div>
);

interface KidsStarCatcherOverlayProps {
  t: KidsUiCopy;
  gameState: 'menu' | 'gameover';
  score: number;
  wordsCaught: number;
  bestScore: number;
  practiceLangLabel: string;
  onStart: () => void;
}

export const KidsStarCatcherOverlay: React.FC<KidsStarCatcherOverlayProps> = ({
  t,
  gameState,
  score,
  wordsCaught,
  bestScore,
  practiceLangLabel,
  onStart,
}) => (
  <div className="absolute inset-0 bg-[#070C24]/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center gap-3">
    <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-300/45 flex items-center justify-center shadow-lg">
      {gameState === 'gameover' ? (
        <Trophy className="w-9 h-9 text-amber-300" />
      ) : (
        <Rocket className="w-9 h-9 text-amber-300" />
      )}
    </div>

    <div>
      <h3 className="font-display font-black text-2xl sm:text-3xl text-white">
        {gameState === 'gameover'
          ? `${t.mathScore}: ${score} (${wordsCaught} palabras)`
          : 'Misión Lingüística Espacial'}
      </h3>
      {gameState === 'gameover' && (
        <p className="text-xs font-extrabold text-amber-300 mt-1 tabular-nums">
          Record: {bestScore}
        </p>
      )}
      <p className="text-xs sm:text-sm font-semibold text-sky-200/85 max-w-md mt-1">
        Escucha la radio y pilota el cohete para atrapar la cápsula en {practiceLangLabel} mientras esquivas meteoros.
      </p>
    </div>

    <KidsSquishButton
      onClick={onStart}
      className="px-7 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-b-4 border-amber-700 font-black text-base flex items-center gap-2 shadow-xl"
    >
      {gameState === 'gameover' ? (
        <RotateCcw className="w-4 h-4" />
      ) : (
        <Play className="w-4 h-4 fill-current" />
      )}
      <span>{gameState === 'gameover' ? t.funPlayAgain : t.funPlayNow}</span>
    </KidsSquishButton>
  </div>
);

export const KidsStarCatcherBumpers: React.FC<{ onNudge: (delta: number) => void }> = ({
  onNudge,
}) => (
  <div className="shrink-0 grid grid-cols-2 gap-2">
    <KidsSquishButton
      onClick={() => onNudge(-0.14)}
      ariaLabel="Mover izquierda"
      className="landscape:h-11 rounded-2xl bg-[#1A2552] hover:bg-[#253470] border-2 border-b-4 border-sky-400/40 text-white font-black flex items-center justify-center"
    >
      <ChevronLeft className="w-6 h-6" />
    </KidsSquishButton>
    <KidsSquishButton
      onClick={() => onNudge(0.14)}
      ariaLabel="Mover derecha"
      className="landscape:h-11 rounded-2xl bg-[#1A2552] hover:bg-[#253470] border-2 border-b-4 border-sky-400/40 text-white font-black flex items-center justify-center"
    >
      <ChevronRight className="w-6 h-6" />
    </KidsSquishButton>
  </div>
);
