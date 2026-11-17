import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Music, Play, RotateCcw, Sparkles, Trophy, Volume2 } from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import {
  playKidsSound,
  playKidsSynthNote,
  type KidsSynthPreset,
} from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';

/* ============================================================================
 * 8-NOTE DIATONIC SCALE (C4..C5) + 4 CLASSIC SIMON PADS
 * ============================================================================ */
interface DiatonicNote {
  idx: number;
  label: string;
  hz: number;
  baseCls: string;
  litCls: string;
}

const PIANO_NOTES: DiatonicNote[] = [
  {
    idx: 0,
    label: 'DO',
    hz: 261.63,
    baseCls: 'bg-rose-600/85 border-rose-800 text-white',
    litCls: 'bg-rose-300 border-white text-slate-950 ring-4 ring-rose-200 scale-[1.04]',
  },
  {
    idx: 1,
    label: 'RE',
    hz: 293.66,
    baseCls: 'bg-orange-600/85 border-orange-800 text-white',
    litCls: 'bg-orange-300 border-white text-slate-950 ring-4 ring-orange-200 scale-[1.04]',
  },
  {
    idx: 2,
    label: 'MI',
    hz: 329.63,
    baseCls: 'bg-amber-500/90 border-amber-700 text-slate-950',
    litCls: 'bg-amber-200 border-white text-slate-950 ring-4 ring-amber-100 scale-[1.04]',
  },
  {
    idx: 3,
    label: 'FA',
    hz: 349.23,
    baseCls: 'bg-emerald-600/85 border-emerald-800 text-white',
    litCls: 'bg-emerald-300 border-white text-slate-950 ring-4 ring-emerald-200 scale-[1.04]',
  },
  {
    idx: 4,
    label: 'SOL',
    hz: 392.0,
    baseCls: 'bg-cyan-600/85 border-cyan-800 text-white',
    litCls: 'bg-cyan-300 border-white text-slate-950 ring-4 ring-cyan-200 scale-[1.04]',
  },
  {
    idx: 5,
    label: 'LA',
    hz: 440.0,
    baseCls: 'bg-indigo-600/85 border-indigo-800 text-white',
    litCls: 'bg-indigo-300 border-white text-slate-950 ring-4 ring-indigo-200 scale-[1.04]',
  },
  {
    idx: 6,
    label: 'SI',
    hz: 493.88,
    baseCls: 'bg-fuchsia-600/85 border-fuchsia-800 text-white',
    litCls: 'bg-fuchsia-300 border-white text-slate-950 ring-4 ring-fuchsia-200 scale-[1.04]',
  },
  {
    idx: 7,
    label: 'DO+',
    hz: 523.25,
    baseCls: 'bg-pink-500/85 border-pink-700 text-white',
    litCls: 'bg-pink-200 border-white text-slate-950 ring-4 ring-pink-100 scale-[1.04]',
  },
];

interface GuidedSong {
  id: string;
  title: string;
  origin: string;
  notes: number[];
}

const GUIDED_SONGS: GuidedSong[] = [
  {
    id: 'twinkle',
    title: 'Estrellita',
    origin: 'Clásica',
    notes: [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0],
  },
  {
    id: 'frere',
    title: 'Fray Santiago',
    origin: 'Francia',
    notes: [0, 1, 2, 0, 0, 1, 2, 0, 2, 3, 4, 2, 3, 4],
  },
  {
    id: 'joy',
    title: 'Alegría',
    origin: 'Beethoven',
    notes: [2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, 2, 1, 1],
  },
  {
    id: 'birthday',
    title: 'Cumpleaños Feliz',
    origin: 'Fiesta',
    notes: [0, 0, 1, 0, 3, 2, 0, 0, 1, 0, 4, 3],
  },
];

interface SimonPad {
  id: number;
  hz: number;
  noteName: string;
  baseCls: string;
  litCls: string;
  shape: 'circle' | 'triangle' | 'square' | 'diamond';
}

const SIMON_PADS: SimonPad[] = [
  {
    id: 0,
    hz: 261.63,
    noteName: 'DO',
    baseCls: 'bg-rose-600/80 border-rose-800',
    litCls: 'bg-rose-400 border-white ring-4 ring-rose-200 scale-[1.04] shadow-[0_0_32px_rgba(251,113,133,0.85)]',
    shape: 'circle',
  },
  {
    id: 1,
    hz: 329.63,
    noteName: 'MI',
    baseCls: 'bg-sky-600/80 border-sky-800',
    litCls: 'bg-sky-400 border-white ring-4 ring-sky-200 scale-[1.04] shadow-[0_0_32px_rgba(56,189,248,0.85)]',
    shape: 'triangle',
  },
  {
    id: 2,
    hz: 392.0,
    noteName: 'SOL',
    baseCls: 'bg-emerald-600/80 border-emerald-800',
    litCls: 'bg-emerald-400 border-white ring-4 ring-emerald-200 scale-[1.04] shadow-[0_0_32px_rgba(52,211,153,0.85)]',
    shape: 'square',
  },
  {
    id: 3,
    hz: 523.25,
    noteName: 'DO+',
    baseCls: 'bg-amber-500/85 border-amber-700',
    litCls: 'bg-amber-300 border-white ring-4 ring-amber-100 scale-[1.04] shadow-[0_0_32px_rgba(252,211,77,0.9)]',
    shape: 'diamond',
  },
];

const SIMON_BEST_KEY = 'riffan_kids_simon_best_v1';

function readSimonBest(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    return Number(localStorage.getItem(SIMON_BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function saveSimonBest(level: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SIMON_BEST_KEY, String(level));
  } catch {
    // ignore
  }
}

const PadShapeSvg: React.FC<{ shape: SimonPad['shape'] }> = ({ shape }) => (
  <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
    {shape === 'circle' && (
      <circle cx="24" cy="24" r="15" fill="rgba(255,255,255,0.92)" />
    )}
    {shape === 'triangle' && (
      <polygon points="24,8 40,38 8,38" fill="rgba(255,255,255,0.92)" />
    )}
    {shape === 'square' && (
      <rect x="10" y="10" width="28" height="28" rx="6" fill="rgba(255,255,255,0.92)" />
    )}
    {shape === 'diamond' && (
      <polygon points="24,6 42,24 24,42 6,24" fill="rgba(15,23,42,0.88)" />
    )}
  </svg>
);

interface KidsSimonGameProps {
  kidsLang: KidsLanguageCode;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionPlay?: () => void;
}

export const KidsSimonGame: React.FC<KidsSimonGameProps> = ({
  kidsLang,
  onEarnStar,
  onMissionPlay,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const recordDomainResult = useKidsStore((s) => s.recordDomainResult);
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const [synthMode, setSynthMode] = useState<'songs' | 'challenge' | 'freeplay'>('songs');
  const [preset, setPreset] = useState<KidsSynthPreset>('marimba');

  // --- Classic Echo Challenge State ---
  const [sequence, setSequence] = useState<number[]>([]);
  const [userIdx, setUserIdx] = useState(0);
  const [litPad, setLitPad] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'watching' | 'input' | 'lost'>('idle');
  const [bestStreak, setBestStreak] = useState<number>(() => readSimonBest());

  // --- Guided Songs & 8-Key Piano State ---
  const [songId, setSongId] = useState<string>(GUIDED_SONGS[0].id);
  const [songStep, setSongStep] = useState(0);
  const [songMistakes, setSongMistakes] = useState(0);
  const [songDone, setSongDone] = useState(false);
  const [litPianoIdx, setLitPianoIdx] = useState<number | null>(null);

  const [confettiActive, setConfettiActive] = useState(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const activeSong = GUIDED_SONGS.find((s) => s.id === songId) || GUIDED_SONGS[0];

  const previewSong = () => {
    clearTimers();
    activeSong.notes.forEach((noteIdx, i) => {
      const startMs = i * 320;
      const onT = window.setTimeout(() => {
        setLitPianoIdx(noteIdx);
        playKidsSynthNote(PIANO_NOTES[noteIdx].hz, ux.soundEnabled, 0.28, preset);
      }, startMs);
      const offT = window.setTimeout(() => {
        setLitPianoIdx(null);
      }, startMs + 220);
      timersRef.current.push(onT, offT);
    });
  };

  const playSequence = useCallback(
    (seq: number[]) => {
      clearTimers();
      setPhase('watching');
      setUserIdx(0);
      const stepMs = Math.max(360, 620 - seq.length * 22);
      const holdMs = Math.round(stepMs * 0.62);

      seq.forEach((padId, stepIdx) => {
        const startMs = 360 + stepIdx * stepMs;
        const onT = window.setTimeout(() => {
          setLitPad(padId);
          playKidsSynthNote(SIMON_PADS[padId].hz, ux.soundEnabled, 0.34, preset);
        }, startMs);
        const offT = window.setTimeout(() => {
          setLitPad(null);
        }, startMs + holdMs);
        timersRef.current.push(onT, offT);
      });

      const doneT = window.setTimeout(() => {
        setPhase('input');
      }, 420 + seq.length * stepMs);
      timersRef.current.push(doneT);
    },
    [preset, ux.soundEnabled]
  );

  const startSimon = () => {
    triggerHaptic('medium');
    onMissionPlay?.();
    setSynthMode('challenge');
    const first = Math.floor(Math.random() * 4);
    const nextSeq = [first];
    setSequence(nextSeq);
    playSequence(nextSeq);
  };

  const handlePadPress = useCallback(
    (padId: number) => {
      if (phase !== 'input') return;
      triggerHaptic('light');
      setLitPad(padId);
      playKidsSynthNote(SIMON_PADS[padId].hz, ux.soundEnabled, 0.28, preset);
      const tOff = window.setTimeout(() => setLitPad(null), 210);
      timersRef.current.push(tOff);

      if (sequence[userIdx] === padId) {
        const nextIdx = userIdx + 1;
        if (nextIdx >= sequence.length) {
          const scoreRound = sequence.length;
          if (scoreRound > bestStreak) {
            setBestStreak(scoreRound);
            saveSimonBest(scoreRound);
          }
          if (scoreRound >= 5) {
            setConfettiActive(true);
          }
          recordDomainResult('music', true);
          onEarnStar(2, scoreRound >= 3 ? 'simon_musical' : undefined);
          playKidsSound('success', ux.soundEnabled, true);
          const nextSeq = [...sequence, Math.floor(Math.random() * 4)];
          setSequence(nextSeq);
          const nextRoundTimer = window.setTimeout(() => {
            playSequence(nextSeq);
          }, 640);
          timersRef.current.push(nextRoundTimer);
        } else {
          setUserIdx(nextIdx);
        }
      } else {
        playKidsSound('error', ux.soundEnabled, true);
        recordDomainResult('music', false);
        setPhase('lost');
      }
    },
    [bestStreak, onEarnStar, phase, playSequence, preset, recordDomainResult, sequence, userIdx, ux.soundEnabled]
  );

  const handlePianoPress = useCallback(
    (noteIdx: number) => {
      triggerHaptic('light');
      setLitPianoIdx(noteIdx);
      playKidsSynthNote(PIANO_NOTES[noteIdx].hz, ux.soundEnabled, 0.32, preset);
      const offT = window.setTimeout(() => setLitPianoIdx(null), 220);
      timersRef.current.push(offT);

      if (synthMode !== 'songs' || songDone) return;

      const expectedIdx = activeSong.notes[songStep];
      if (noteIdx === expectedIdx) {
        const nextStep = songStep + 1;
        if (nextStep >= activeSong.notes.length) {
          setSongDone(true);
          setConfettiActive(true);
          playKidsSound('levelUp', ux.soundEnabled, true);
          recordDomainResult('music', true);
          onMissionPlay?.();
          onEarnStar(songMistakes <= 1 ? 4 : 3, 'simon_musical');
        } else {
          setSongStep(nextStep);
        }
      } else {
        setSongMistakes((m) => m + 1);
        recordDomainResult('music', false);
      }
    },
    [
      activeSong.notes,
      onEarnStar,
      onMissionPlay,
      preset,
      recordDomainResult,
      songDone,
      songMistakes,
      songStep,
      synthMode,
      ux.soundEnabled,
    ]
  );

  // Keyboard shortcuts 1-8
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = ['1', '2', '3', '4', '5', '6', '7', '8'].indexOf(e.key);
      if (idx < 0) return;
      e.preventDefault();
      if (synthMode === 'challenge' && idx < 4 && phase === 'input') {
        handlePadPress(idx);
      } else if (synthMode !== 'challenge') {
        handlePianoPress(idx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePadPress, handlePianoPress, phase, synthMode]);

  const statusText =
    synthMode === 'songs'
      ? activeSong.title
      : synthMode === 'freeplay'
      ? 'Piano Libre'
      : phase === 'watching'
      ? t.funSimonWatch
      : phase === 'input'
      ? t.funSimonTurn
      : phase === 'lost'
      ? t.funSimonAlmost
      : t.funSimonTitle;

  const PRESETS: Array<{ id: KidsSynthPreset; label: string }> = [
    { id: 'marimba', label: 'Marimba' },
    { id: 'space', label: 'Synth' },
    { id: 'crystal', label: 'Cristal' },
  ];

  const accuracyPct =
    songStep + songMistakes > 0
      ? Math.max(0, Math.round((songStep / (songStep + songMistakes)) * 100))
      : 100;

  return (
    <div
      dir={dir}
      className="flex-1 min-h-0 rounded-2xl bg-[#101836] border-2 border-emerald-400/25 p-2.5 sm:p-4 flex flex-col gap-2.5 overflow-hidden relative"
    >
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* WORKSTATION HEADER */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#0B1128] border border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <Music className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="font-display font-black text-sm sm:text-base text-white truncate">
            {statusText}
          </span>
          {synthMode === 'challenge' && bestStreak > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-400/15 text-amber-300 text-xs font-black tabular-nums">
              <Trophy className="w-3.5 h-3.5" />
              {bestStreak}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex bg-[#162048] p-0.5 rounded-xl border border-white/10">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`px-2 py-1 rounded-lg text-[11px] font-black cursor-pointer transition-colors ${
                  preset === p.id
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-sky-200 hover:bg-white/5'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="inline-flex bg-[#162048] p-0.5 rounded-xl border border-white/10">
            {(
              [
                { id: 'songs', label: 'Canciones' },
                { id: 'challenge', label: 'Eco' },
                { id: 'freeplay', label: 'Piano' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                data-tv-focusable="true"
                onClick={() => {
                  clearTimers();
                  setPhase('idle');
                  setSynthMode(m.id);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer transition-colors ${
                  synthMode === m.id
                    ? 'bg-emerald-400 text-slate-950'
                    : 'text-emerald-100 hover:bg-white/5'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* =====================================================================
       * MODE 1 & 3: GUIDED SONGS & 8-KEY FREE PIANO
       * ===================================================================== */}
      {synthMode !== 'challenge' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto no-scrollbar">
          {synthMode === 'songs' && (
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 bg-[#0B1128] rounded-xl border border-white/10 p-2.5">
              <div className="flex flex-wrap gap-1.5">
                {GUIDED_SONGS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    data-tv-focusable="true"
                    onClick={() => {
                      clearTimers();
                      setSongId(s.id);
                      setSongStep(0);
                      setSongMistakes(0);
                      setSongDone(false);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-colors ${
                      songId === s.id
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-[#162048] text-sky-100 hover:bg-[#223066]'
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-emerald-300 tabular-nums">
                  {songStep}/{activeSong.notes.length} · {accuracyPct}%
                </span>
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={previewSong}
                  className="h-9 px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-xs font-black flex items-center gap-1 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Oír</span>
                </button>
              </div>
            </div>
          )}

          {/* Note Sheet Timeline for Guided Songs */}
          {synthMode === 'songs' && (
            <div className="shrink-0 flex flex-wrap items-center justify-center gap-1.5 px-2">
              {activeSong.notes.map((nIdx, i) => {
                const isDone = i < songStep || songDone;
                const isCurrent = !songDone && i === songStep;
                return (
                  <span
                    key={i}
                    className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all ${
                      isDone
                        ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
                        : isCurrent
                        ? 'bg-amber-400 text-slate-950 scale-110 shadow'
                        : 'bg-white/5 text-slate-400 border border-white/10'
                    }`}
                  >
                    {PIANO_NOTES[nIdx].label}
                  </span>
                );
              })}
            </div>
          )}

          {songDone && synthMode === 'songs' && (
            <div className="shrink-0 rounded-xl bg-emerald-500/20 border border-emerald-400 p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-200 text-sm font-black">
                <CheckCircle2 className="w-5 h-5" />
                <span>Melodía completada ({accuracyPct}% precisión).</span>
              </div>
              <KidsSquishButton
                onClick={() => {
                  setSongStep(0);
                  setSongMistakes(0);
                  setSongDone(false);
                }}
                className="!min-h-[36px] h-9 px-4 rounded-xl bg-emerald-400 text-slate-950 border-b-4 border-emerald-700 text-xs font-black"
              >
                Tocar otra vez
              </KidsSquishButton>
            </div>
          )}

          {/* 8-Key Xylophone / Synth Keys */}
          <div className="flex-1 min-h-0 grid grid-cols-4 sm:grid-cols-8 gap-2 sm:gap-2.5 py-1">
            {PIANO_NOTES.map((note) => {
              const isCue = synthMode === 'songs' && !songDone && activeSong.notes[songStep] === note.idx;
              const isLit = litPianoIdx === note.idx;
              return (
                <button
                  key={note.idx}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => handlePianoPress(note.idx)}
                  aria-label={`Nota ${note.label}`}
                  className={`min-h-[110px] rounded-2xl border-4 border-b-8 flex flex-col items-center justify-end p-2.5 gap-2 transition-all duration-100 cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-white relative ${
                    isLit
                      ? note.litCls
                      : isCue
                      ? `${note.baseCls} ring-4 ring-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.6)]`
                      : note.baseCls
                  }`}
                >
                  {isCue && (
                    <span className="absolute top-2 px-1.5 py-0.5 rounded bg-amber-300 text-slate-950 text-[9px] font-black uppercase">
                      Toca
                    </span>
                  )}
                  <Sparkles className="w-5 h-5 opacity-80" />
                  <span className="font-display font-black text-base sm:text-lg">{note.label}</span>
                  <span className="px-2 py-0.5 rounded-full bg-black/25 text-[10px] font-black tabular-nums">
                    {note.idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
       * MODE 2: CLASSIC 4-PAD ECHO CHALLENGE
       * ===================================================================== */}
      {synthMode === 'challenge' && (
        <>
          <div className="shrink-0 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              {sequence.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-2.5 rounded-full transition-all ${
                    idx < userIdx
                      ? 'w-5 bg-emerald-400'
                      : idx === userIdx && phase === 'input'
                      ? 'w-5 bg-amber-300 animate-pulse'
                      : 'w-2.5 bg-white/20'
                  }`}
                />
              ))}
            </div>
            <KidsSquishButton
              onClick={startSimon}
              className="!min-h-[36px] h-9 px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 border-b-4 border-amber-600 text-slate-950 font-black text-xs flex items-center gap-1"
            >
              {phase === 'idle' ? <Play className="w-3.5 h-3.5 fill-current" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span>{phase === 'idle' ? t.gameStartBtn : t.funPlayAgain}</span>
            </KidsSquishButton>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-2 landscape:grid-cols-4 gap-3 sm:gap-4 max-w-3xl w-full mx-auto py-1">
            {SIMON_PADS.map((pad) => {
              const isLit = litPad === pad.id;
              return (
                <button
                  key={pad.id}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => handlePadPress(pad.id)}
                  aria-label={`Nota ${pad.noteName}`}
                  className={`min-h-[96px] rounded-3xl border-4 border-b-8 flex flex-col items-center justify-center gap-2 transition-all duration-150 cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-white ${
                    isLit ? pad.litCls : pad.baseCls
                  }`}
                >
                  <PadShapeSvg shape={pad.shape} />
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/30 text-white text-xs font-black tabular-nums">
                    <span>{pad.id + 1}</span>
                    <span className="text-white/70">·</span>
                    <span>{pad.noteName}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
