import React, { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Star,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import {
  KIDS_AVATAR_CHOICES,
  KIDS_LANGUAGES,
  type KidsMascotId,
  type KidsProgressState,
} from './kidsData';
import { playKidsSound } from './kidsAudioEngine';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsAnimatedMascotSvg } from './KidsSvgArt';

export interface SiblingDraft {
  name: string;
  ageGroup: KidsAgeGroup;
  avatarId: string;
  mascotId: KidsMascotId;
  preferredLang: KidsLanguageCode;
}

const AVATAR_SPECIES: Array<{ id: string; mascotId: KidsMascotId; name: string }> = [
  { id: 'fennec', mascotId: 'fox', name: 'Zorro del Atlas' },
  { id: 'lion', mascotId: 'dino', name: 'León Valiente' },
  { id: 'cat', mascotId: 'cat', name: 'Gato Curioso' },
  { id: 'rabbit', mascotId: 'bot', name: 'Conejo Robot' },
];

const DEFAULT_NAMES = ['Leo', 'Amira', 'Adam', 'Sofía'];

interface KidsFamilyOnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

export const KidsFamilyOnboardingModal: React.FC<KidsFamilyOnboardingModalProps> = ({
  open,
  onClose,
  onCompleted,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const profilesStore = useKidsStore((s) => s.profilesStore);
  const updateActiveProfile = useKidsStore((s) => s.updateActiveProfile);
  const createProfile = useKidsStore((s) => s.createProfile);
  const switchProfile = useKidsStore((s) => s.switchProfile);

  // Step 1 = How many kids (1..4)
  // Step 2 = Configure kid i
  // Step 3 = All done summary
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kidsCount, setKidsCount] = useState<number>(1);
  const [currentKidIndex, setCurrentKidIndex] = useState<number>(0);

  const [siblings, setSiblings] = useState<SiblingDraft[]>([
    {
      name: 'Peque 1',
      ageGroup: '6-8',
      avatarId: 'fennec',
      mascotId: 'fox',
      preferredLang: 'es',
    },
    {
      name: 'Peque 2',
      ageGroup: '3-5',
      avatarId: 'cat',
      mascotId: 'cat',
      preferredLang: 'es',
    },
    {
      name: 'Peque 3',
      ageGroup: '6-8',
      avatarId: 'lion',
      mascotId: 'dino',
      preferredLang: 'es',
    },
    {
      name: 'Peque 4',
      ageGroup: '9-12',
      avatarId: 'rabbit',
      mascotId: 'bot',
      preferredLang: 'es',
    },
  ]);

  if (!open) return null;

  const currentKid = siblings[currentKidIndex] || siblings[0];

  const updateCurrentKid = (patch: Partial<SiblingDraft>) => {
    setSiblings((prev) => {
      const next = [...prev];
      next[currentKidIndex] = { ...next[currentKidIndex], ...patch };
      return next;
    });
  };

  const handleSelectCount = (count: number) => {
    triggerHaptic('medium');
    playKidsSound('tap', ux.soundEnabled, true);
    setKidsCount(count);
    setCurrentKidIndex(0);
    // Preset names if default
    setSiblings((prev) =>
      prev.map((s, idx) => ({
        ...s,
        name: s.name.startsWith('Peque') ? DEFAULT_NAMES[idx] || `Peque ${idx + 1}` : s.name,
      }))
    );
    setStep(2);
    if (ux.soundEnabled) {
      void speakKidsText('¡Genial! Vamos a configurar a cada peque.', 'es');
    }
  };

  const handleNextKidOrFinish = () => {
    triggerHaptic('success');
    playKidsSound('tap', ux.soundEnabled, true);

    if (currentKidIndex + 1 < kidsCount) {
      setCurrentKidIndex((idx) => idx + 1);
    } else {
      setStep(3);
      playKidsSound('levelUp', ux.soundEnabled, true);
    }
  };

  const handleFinishAll = () => {
    triggerHaptic('success');
    playKidsSound('levelUp', ux.soundEnabled, true);

    const activeSiblings = siblings.slice(0, kidsCount);

    // Update active profile with first sibling
    const first = activeSiblings[0];
    updateActiveProfile((prev: KidsProgressState) => ({
      ...prev,
      name: first.name.trim() || 'Peque 1',
      ageGroup: first.ageGroup,
      avatarEmoji: first.avatarId,
      mascotId: first.mascotId,
      preferredLang: first.preferredLang,
    }));

    // If there are more siblings, create extra profiles if they don't exist yet
    for (let i = 1; i < activeSiblings.length; i++) {
      const s = activeSiblings[i];
      const existing = profilesStore.profiles[i];
      if (!existing) {
        createProfile(s.name.trim() || `Peque ${i + 1}`, s.avatarId, s.ageGroup);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('riffan_kids_family_setup_done', 'true');
      } catch {
        // ignore storage error
      }
    }

    onCompleted?.();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-tv-modal="true"
      className="fixed inset-0 z-[290] bg-[#030614]/92 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none overflow-hidden"
    >
      <div className="w-full max-w-xl max-h-[96dvh] rounded-3xl bg-gradient-to-b from-[#141C42] via-[#0E1536] to-[#080D24] border-2 sm:border-4 border-amber-400/80 shadow-[0_0_50px_rgba(245,158,11,0.25)] flex flex-col overflow-hidden">
        {/* TOP BAR: Clean, zero-scroll header */}
        <div className="shrink-0 px-4 py-3 bg-[#0B112B] border-b border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-black text-sm sm:text-base text-white truncate">
                {step === 1
                  ? '¿Cuántos peques son en casa?'
                  : step === 2
                  ? `Configurar Peque ${currentKidIndex + 1} de ${kidsCount}`
                  : '¡Familia lista para jugar!'}
              </h2>
              <p className="text-[11px] text-sky-200/80 font-bold">
                Riffan Kids · Multiplataforma para móvil, tablet y Google TV
              </p>
            </div>
          </div>

          <button
            type="button"
            data-tv-focusable="true"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-300 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: HOW MANY KIDS (1..4) - ZERO SCROLL */}
        {step === 1 && (
          <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col justify-between gap-4">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-300/40 text-amber-300 text-xs font-black">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Paso 1 de 2</span>
              </div>
              <h3 className="font-display font-black text-xl sm:text-2xl text-white">
                ¿Cuántos niños van a aprender y jugar?
              </h3>
              <p className="text-xs text-sky-200">
                Cada peque tendrá su propio perfil, estrellas, nivel de edad y avatar.
              </p>
            </div>

            {/* 4 Big Multiplatform Touch / D-Pad Cards */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 my-auto">
              {[
                { count: 1, label: '1 Peque', desc: 'Un solo perfil', iconId: 'fox' as const },
                { count: 2, label: '2 Hermanos', desc: 'Cambio con 1 toque', iconId: 'dino' as const },
                { count: 3, label: '3 Hermanos', desc: 'Perfiles separados', iconId: 'cat' as const },
                { count: 4, label: '4 Hermanos', desc: 'Para toda la familia', iconId: 'bot' as const },
              ].map((opt) => (
                <button
                  key={opt.count}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => handleSelectCount(opt.count)}
                  className="p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#182352] hover:bg-[#233374] border-2 border-white/15 hover:border-amber-400 text-start flex flex-col items-center justify-center gap-2 cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-amber-300 outline-none"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-400/15 border border-amber-300/40 p-1 flex items-center justify-center">
                    <KidsAnimatedMascotSvg id={opt.iconId} size={48} />
                  </div>
                  <span className="font-display font-black text-base sm:text-xl text-white">
                    {opt.label}
                  </span>
                  <span className="text-[11px] font-bold text-sky-200 text-center">
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-center text-[11px] text-zinc-400">
              Podrás cambiar o añadir más perfiles en cualquier momento desde el botón de candado.
            </p>
          </div>
        )}

        {/* STEP 2: CONFIGURE SIBLING i - ZERO SCROLL */}
        {step === 2 && (
          <div className="flex-1 min-h-0 p-3 sm:p-5 flex flex-col justify-between gap-3 overflow-hidden">
            {/* Sibling Tabs indicator */}
            <div className="flex items-center justify-center gap-2 shrink-0">
              {Array.from({ length: kidsCount }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentKidIndex(idx)}
                  className={`h-8 px-3 rounded-full text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors ${
                    idx === currentKidIndex
                      ? 'bg-amber-400 text-slate-950 shadow'
                      : 'bg-white/10 text-sky-200'
                  }`}
                >
                  <span>Peque {idx + 1}</span>
                  {idx < currentKidIndex && <Check className="w-3 h-3 text-emerald-400" />}
                </button>
              ))}
            </div>

            {/* Main Single-Screen Form (Fits without scrolling!) */}
            <div className="space-y-3 my-auto">
              {/* 1. Name Input */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-400/20 border-2 border-amber-300/40 flex items-center justify-center shrink-0">
                  <KidsAnimatedMascotSvg id={currentKid.mascotId} size={48} />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-black text-amber-300 mb-1">
                    ¿Cómo se llama el Peque {currentKidIndex + 1}?
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={currentKid.name}
                    onChange={(e) => updateCurrentKid({ name: e.target.value })}
                    placeholder={`Nombre del peque (Ej: ${DEFAULT_NAMES[currentKidIndex] || 'Leo'})`}
                    className="w-full h-11 px-3 rounded-xl bg-[#090D22] border-2 border-amber-300/40 focus:border-amber-300 text-white font-black text-sm outline-none"
                  />
                </div>
              </div>

              {/* 2. Age Selection (3 Giant Buttons) */}
              <div>
                <label className="block text-xs font-black text-sky-200 mb-1.5">
                  ¿Cuántos años tiene {currentKid.name || 'el peque'}?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: '3-5' as KidsAgeGroup, label: '3–5 años', desc: 'Preescolar' },
                      { id: '6-8' as KidsAgeGroup, label: '6–8 años', desc: 'Primaria' },
                      { id: '9-12' as KidsAgeGroup, label: '9–12 años', desc: 'Grandes' },
                    ] as const
                  ).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => {
                        triggerHaptic('light');
                        updateCurrentKid({ ageGroup: g.id });
                      }}
                      className={`p-2.5 rounded-2xl border-2 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                        currentKid.ageGroup === g.id
                          ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-md scale-[1.02]'
                          : 'bg-[#182352] text-white border-white/10 hover:border-white/25'
                      }`}
                    >
                      <span className="font-display font-black text-sm">{g.label}</span>
                      <span className="text-[10px] font-bold opacity-80">{g.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Avatar of Choice (6 Vector Animals, zero emoji slop) */}
              <div>
                <label className="block text-xs font-black text-pink-300 mb-1.5">
                  Elige su avatar de perfil:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {AVATAR_SPECIES.map((spec) => (
                    <button
                      key={spec.id}
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => {
                        triggerHaptic('light');
                        playKidsSound('tap', ux.soundEnabled, false);
                        updateCurrentKid({
                          avatarId: spec.id,
                          mascotId: spec.mascotId,
                        });
                      }}
                      className={`p-2 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                        currentKid.avatarId === spec.id
                          ? 'bg-pink-500/25 border-pink-400 text-white shadow-md scale-105'
                          : 'bg-[#182352] border-white/10 hover:border-white/25 text-zinc-300'
                      }`}
                    >
                      <KidsAnimatedMascotSvg id={spec.mascotId} size={36} />
                      <span className="text-[10px] font-black truncate w-full text-center">
                        {spec.name.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="shrink-0 flex items-center justify-between gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                data-tv-focusable="true"
                disabled={currentKidIndex === 0}
                onClick={() => setCurrentKidIndex((idx) => Math.max(0, idx - 1))}
                className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              <KidsSquishButton
                onClick={handleNextKidOrFinish}
                className="!min-h-[42px] h-11 px-5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-display font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg"
              >
                <span>{currentKidIndex + 1 < kidsCount ? 'Siguiente Peque' : 'Ver Resumen'}</span>
                <ChevronRight className="w-4 h-4" />
              </KidsSquishButton>
            </div>
          </div>
        )}

        {/* STEP 3: READY TO DIVE IN! */}
        {step === 3 && (
          <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col justify-between gap-4">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black border border-emerald-400/40">
                <Check className="w-3.5 h-3.5" />
                <span>¡Perfiles configurados con éxito!</span>
              </div>
              <h3 className="font-display font-black text-2xl text-white">
                ¡Bienvenidos a Riffan Kids!
              </h3>
              <p className="text-xs text-sky-200">
                Podréis alternar de hermano con 1 toque en cualquier momento.
              </p>
            </div>

            {/* Summary cards of all siblings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-auto">
              {siblings.slice(0, kidsCount).map((s, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-[#182352] border border-amber-300/35 flex items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-400/20 flex items-center justify-center shrink-0">
                    <KidsAnimatedMascotSvg id={s.mascotId} size={38} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-black text-sm text-white truncate">
                      {s.name || `Peque ${idx + 1}`}
                    </div>
                    <div className="text-xs text-amber-300 font-bold">
                      {s.ageGroup} años · {s.avatarId}
                    </div>
                  </div>
                  {idx === 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black shrink-0">
                      Activo
                    </span>
                  )}
                </div>
              ))}
            </div>

            <KidsSquishButton
              onClick={handleFinishAll}
              className="!min-h-[48px] h-12 w-full rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-slate-950 font-display font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl"
            >
              <Star className="w-5 h-5 fill-slate-950" />
              <span>¡Entrar a Riffan Kids ahora!</span>
            </KidsSquishButton>
          </div>
        )}
      </div>
    </div>
  );
};
