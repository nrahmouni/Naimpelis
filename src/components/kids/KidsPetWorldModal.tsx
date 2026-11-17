import React, { useState } from 'react';
import {
  CheckCircle2,
  Compass,
  Gift,
  Heart,
  Home,
  Lock,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import {
  isDailyMissionChestReady,
  KIDS_BADGES,
  KIDS_MASCOTS,
  KIDS_SHOP_ITEMS,
} from './kidsData';
import {
  findExtendedVocabEntry,
  KIDS_PET_TREATS,
  KIDS_ROOM_DECOR_ITEMS,
  KIDS_STICKER_ALBUM,
  type KidsStickerItem,
} from './kidsCurriculumData';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsAnimatedMascotSvg, KidsBadgeIcon, KidsVocabSvg } from './KidsSvgArt';

type PetWorldTab = 'pet' | 'room' | 'stickers' | 'rewards';
type StickerAlbumFilter = 'Todos' | KidsStickerItem['album'];

interface KidsPetWorldModalProps {
  open: boolean;
  onClose: () => void;
  kidsLang: KidsLanguageCode;
  onClaimChest: () => boolean;
  onOpenDiploma?: () => void;
}

export const KidsPetWorldModal: React.FC<KidsPetWorldModalProps> = ({
  open,
  onClose,
  kidsLang,
  onClaimChest,
  onOpenDiploma,
}) => {
  const profile = useKidsStore((s) => s.getActiveProfile());
  const ux = useKidsStore((s) => s.ux);
  const pickMascot = useKidsStore((s) => s.pickMascot);
  const careForPet = useKidsStore((s) => s.careForPet);
  const unlockRoomDecor = useKidsStore((s) => s.unlockRoomDecor);
  const unlockSticker = useKidsStore((s) => s.unlockSticker);
  const unlockReward = useKidsStore((s) => s.unlockReward);

  const [tab, setTab] = useState<PetWorldTab>('pet');
  const [albumFilter, setAlbumFilter] = useState<StickerAlbumFilter>('Todos');
  const [activeFact, setActiveFact] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<string>('');

  if (!open) return null;

  const dir = getKidsDir(kidsLang);
  const petCare = profile.petCare || { energy: 80, happiness: 85, xp: 0, level: 1 };
  const unlockedStickers = profile.unlockedStickers || [];
  const roomDecor = profile.roomDecor || [];
  const unlockedRewards = profile.unlockedRewards || [];
  const activeMascot = KIDS_MASCOTS.find((m) => m.id === profile.mascotId) || KIDS_MASCOTS[0];
  const speakRate = ux.tortoiseSpeech ? 0.72 : undefined;

  const missions = profile.dailyMissions || {
    date: '',
    watch: 0,
    play: 0,
    learn: 0,
    chestClaimed: false,
  };
  const chestReady = isDailyMissionChestReady(profile);

  const flashNotice = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => setStatusNotice((curr) => (curr === msg ? '' : curr)), 2800);
  };

  const handleTreat = (treat: (typeof KIDS_PET_TREATS)[number]) => {
    const ok = careForPet(treat.costStars, treat.energyGain, treat.happyGain, treat.xpGain);
    if (!ok) {
      playKidsSound('error', ux.soundEnabled, true);
      flashNotice('Necesitas más estrellas jugando o aprendiendo.');
      return;
    }
    triggerHaptic('success');
    playKidsSound('star', ux.soundEnabled, true);
    flashNotice(`${activeMascot.name} disfrutó: ${treat.label}`);
    if (ux.soundEnabled) {
      void speakKidsText(activeMascot.cheerEs, 'es', { ageGroup: profile.ageGroup, rate: speakRate });
    }
  };

  const handleInteractObject = (factEs: string, vocabId: string) => {
    setActiveFact(factEs);
    playKidsSound('tap', ux.soundEnabled, false);
    const entry = findExtendedVocabEntry(vocabId);
    const tr = entry.translations[kidsLang] || entry.translations.es;
    if (ux.soundEnabled) {
      void speakKidsText(`${tr.word}. ${factEs}`, 'es', { ageGroup: profile.ageGroup, rate: speakRate });
    }
  };

  const filteredStickers =
    albumFilter === 'Todos'
      ? KIDS_STICKER_ALBUM
      : KIDS_STICKER_ALBUM.filter((s) => s.album === albumFilter);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-tv-modal="true"
      dir={dir}
      className="fixed inset-0 z-[258] bg-[#050816]/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 landscape:p-1.5"
    >
      <div className="w-full max-w-4xl max-h-[92dvh] landscape:max-h-[96dvh] rounded-3xl bg-[#101836] border-2 border-amber-400/35 shadow-2xl flex flex-col overflow-hidden">
        {/* TOP BAR */}
        <div className="shrink-0 px-4 py-3 landscape:py-2 bg-[#0B1128] border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-300/35 flex items-center justify-center shrink-0">
              <KidsAnimatedMascotSvg id={profile.mascotId} size={36} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-black text-base sm:text-xl text-white truncate">
                Mi Mundo, Mascota y Cromos
              </h2>
              <p className="text-[11px] font-bold text-amber-300">
                Nivel Mascota {petCare.level} · {profile.stars} estrellas disponibles
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenDiploma && (
              <button
                type="button"
                data-tv-focusable="true"
                onClick={() => {
                  onClose();
                  onOpenDiploma();
                }}
                className="h-9 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow hover:brightness-105"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ver Diploma</span>
              </button>
            )}

            <button
              type="button"
              data-tv-focusable="true"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0 focus-visible:ring-4 focus-visible:ring-amber-300 outline-none"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="shrink-0 px-3 sm:px-4 pt-2.5 landscape:pt-1.5 flex flex-wrap gap-1.5 bg-[#0D142E] border-b border-white/10 pb-2.5 landscape:pb-1.5">
          {(
            [
              { id: 'pet', label: 'Mi Compañero', Icon: Heart },
              { id: 'room', label: 'Mi Cuarto', Icon: Home },
              { id: 'stickers', label: `Cromos (${unlockedStickers.length}/${KIDS_STICKER_ALBUM.length})`, Icon: Compass },
              { id: 'rewards', label: 'Misiones y Tienda', Icon: Gift },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                playKidsSound('tap', ux.soundEnabled, false);
                setTab(id);
                setActiveFact('');
              }}
              className={`h-9 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === id
                  ? 'bg-amber-400 text-slate-950 shadow'
                  : 'bg-[#17224B] text-sky-100 hover:bg-[#22326B]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {statusNotice && (
          <div className="shrink-0 mx-4 mt-2.5 px-3 py-2 rounded-xl bg-amber-400/15 border border-amber-300/40 text-amber-200 text-xs font-black text-center">
            {statusNotice}
          </div>
        )}

        {/* CONTENT BODY */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* ===============================================================
           * TAB 1: MI COMPAÑERO (PET CARE + MASCOT SWITCHER)
           * =============================================================== */}
          {tab === 'pet' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Living Companion Stage */}
              <div className="md:col-span-5 rounded-2xl bg-gradient-to-b from-[#1A2654] to-[#0E1531] border border-white/15 p-4 flex flex-col items-center justify-between gap-3 text-center">
                <div className="w-full flex items-center justify-between text-xs font-black">
                  <span className="px-2.5 py-1 rounded-lg bg-amber-400/20 text-amber-300">
                    {activeMascot.name} · Nv.{petCare.level}
                  </span>
                  <span className="text-sky-200 tabular-nums">{petCare.xp % 50}/50 XP</span>
                </div>

                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    triggerHaptic('light');
                    playKidsSound('tap', ux.soundEnabled, false);
                    if (ux.soundEnabled) {
                      void speakKidsText(activeMascot.cheerEs, 'es', {
                        ageGroup: profile.ageGroup,
                        rate: speakRate,
                      });
                    }
                  }}
                  className="p-4 rounded-full bg-amber-400/10 border-2 border-amber-300/30 hover:scale-105 transition-transform cursor-pointer"
                  aria-label={`Acariciar a ${activeMascot.name}`}
                >
                  <KidsAnimatedMascotSvg id={profile.mascotId} size={108} />
                </button>

                <div className="w-full space-y-2 text-xs font-black">
                  <div>
                    <div className="flex justify-between text-emerald-300 mb-1">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" /> Energía
                      </span>
                      <span className="tabular-nums">{petCare.energy}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all"
                        style={{ width: `${petCare.energy}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-pink-300 mb-1">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5" /> Felicidad
                      </span>
                      <span className="tabular-nums">{petCare.happiness}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-pink-400 rounded-full transition-all"
                        style={{ width: `${petCare.happiness}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Treats & Mascot Roster */}
              <div className="md:col-span-7 flex flex-col gap-3">
                <div className="rounded-2xl bg-[#0F1633] border border-white/10 p-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-300 mb-2">
                    Cuidar y Alimentar
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {KIDS_PET_TREATS.map((treat) => (
                      <button
                        key={treat.id}
                        type="button"
                        data-tv-focusable="true"
                        onClick={() => handleTreat(treat)}
                        className="p-2.5 rounded-xl bg-[#182352] hover:bg-[#223170] border border-white/15 flex items-center gap-2.5 text-start cursor-pointer transition-colors"
                      >
                        <KidsVocabSvg iconId={treat.iconId} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-white truncate">{treat.label}</div>
                          <div className="text-[11px] font-bold text-amber-300">
                            {treat.costStars} estrellas · +{treat.xpGain} XP
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#0F1633] border border-white/10 p-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-sky-300 mb-2">
                    Compañeros
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {KIDS_MASCOTS.map((m) => {
                      const owned =
                        m.costStars === 0 || unlockedRewards.includes(`mascot_${m.id}`);
                      const isCurrent = profile.mascotId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          data-tv-focusable="true"
                          onClick={() => {
                            const ok = pickMascot(m);
                            if (ok) {
                              playKidsSound('success', ux.soundEnabled, true);
                              flashNotice(`${m.name} es ahora tu compañero activo.`);
                            } else {
                              playKidsSound('error', ux.soundEnabled, false);
                              flashNotice(`Faltan estrellas para ${m.name} (${m.costStars}).`);
                            }
                          }}
                          className={`p-2 rounded-xl border-2 flex flex-col items-center gap-1 cursor-pointer transition-all ${
                            isCurrent
                              ? 'bg-amber-400/20 border-amber-300'
                              : 'bg-[#182352] border-white/10 hover:border-white/30'
                          }`}
                        >
                          <KidsAnimatedMascotSvg id={m.id} size={42} />
                          <span className="text-xs font-black text-white">{m.name}</span>
                          <span className="text-[10px] font-bold text-amber-300">
                            {isCurrent ? 'Activo' : owned ? 'Elegir' : `${m.costStars} est.`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===============================================================
           * TAB 2: MI CUARTO INTERACTIVO
           * =============================================================== */}
          {tab === 'room' && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-gradient-to-b from-[#1B2552] via-[#121A3D] to-[#0A0F24] border border-white/15 p-4 flex flex-col items-center gap-3">
                <div className="flex flex-wrap items-center justify-center gap-4 min-h-[120px] w-full">
                  {KIDS_ROOM_DECOR_ITEMS.filter((it) => roomDecor.includes(it.id)).length === 0 ? (
                    <p className="text-xs font-bold text-sky-200 text-center">
                      Desbloquea objetos abajo para decorar el cuarto de {activeMascot.name}.
                    </p>
                  ) : (
                    KIDS_ROOM_DECOR_ITEMS.filter((it) => roomDecor.includes(it.id)).map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        data-tv-focusable="true"
                        onClick={() => handleInteractObject(it.factEs, it.vocabId)}
                        className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-amber-300/40 flex flex-col items-center gap-1.5 cursor-pointer transition-transform hover:scale-105"
                      >
                        <KidsVocabSvg iconId={it.iconId} size={52} />
                        <span className="text-xs font-black text-white">{it.title}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-200">
                          <Volume2 className="w-3 h-3" /> Escuchar dato
                        </span>
                      </button>
                    ))
                  )}
                </div>

                {activeFact && (
                  <div className="w-full rounded-xl bg-sky-500/15 border border-sky-400/35 px-3 py-2 text-xs font-bold text-sky-100 text-center">
                    {activeFact}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {KIDS_ROOM_DECOR_ITEMS.map((item) => {
                  const owned = roomDecor.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-[#0F1633] border border-white/10 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <KidsVocabSvg iconId={item.iconId} size={42} />
                        <div className="min-w-0">
                          <div className="text-sm font-black text-white truncate">{item.title}</div>
                          <div className="text-[11px] font-bold text-sky-200/80 line-clamp-2">
                            {item.factEs}
                          </div>
                        </div>
                      </div>
                      {owned ? (
                        <button
                          type="button"
                          onClick={() => handleInteractObject(item.factEs, item.vocabId)}
                          className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-black cursor-pointer"
                        >
                          Colocado
                        </button>
                      ) : (
                        <KidsSquishButton
                          onClick={() => {
                            const ok = unlockRoomDecor(item.id, item.costStars);
                            if (ok) {
                              playKidsSound('levelUp', ux.soundEnabled, true);
                              flashNotice(`${item.title} añadido a tu cuarto.`);
                            } else {
                              playKidsSound('error', ux.soundEnabled, false);
                              flashNotice(`Necesitas ${item.costStars} estrellas.`);
                            }
                          }}
                          className="!min-h-[36px] h-9 px-3 rounded-xl bg-amber-400 text-slate-950 border-b-4 border-amber-700 text-xs font-black shrink-0"
                        >
                          {item.costStars} est.
                        </KidsSquishButton>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===============================================================
           * TAB 3: ÁLBUM DE 16 CROMOS EDUCATIVOS
           * =============================================================== */}
          {tab === 'stickers' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(['Todos', 'Atlas', 'Cosmos', 'Sabores', 'Música'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setAlbumFilter(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer ${
                      albumFilter === cat
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-[#17224B] text-sky-100 hover:bg-[#22326B]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {activeFact && (
                <div className="rounded-xl bg-amber-400/15 border border-amber-300/35 px-3 py-2 text-xs font-bold text-amber-100">
                  {activeFact}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {filteredStickers.map((stk) => {
                  const unlocked = unlockedStickers.includes(stk.id);
                  const vocab = findExtendedVocabEntry(stk.vocabId);
                  const tr = vocab.translations[kidsLang] || vocab.translations.es;
                  return (
                    <button
                      key={stk.id}
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => {
                        if (unlocked) {
                          handleInteractObject(stk.factEs, stk.vocabId);
                        } else {
                          const ok = unlockSticker(stk.id, stk.costStars);
                          if (ok) {
                            playKidsSound('levelUp', ux.soundEnabled, true);
                            setActiveFact(stk.factEs);
                            flashNotice(`Cromo conseguido: ${stk.titleEs}`);
                          } else {
                            playKidsSound('error', ux.soundEnabled, false);
                            flashNotice(`Cuesta ${stk.costStars} estrellas.`);
                          }
                        }
                      }}
                      className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 text-center cursor-pointer transition-all ${
                        unlocked
                          ? 'bg-[#182454] border-amber-300/60 hover:scale-[1.03]'
                          : 'bg-[#0E142D] border-white/10 opacity-85 hover:opacity-100'
                      }`}
                    >
                      <div className={!unlocked ? 'grayscale opacity-55' : ''}>
                        <KidsVocabSvg iconId={stk.iconId} size={46} />
                      </div>
                      <div className="text-xs font-black text-white leading-tight">{stk.titleEs}</div>
                      <div className="text-[11px] font-bold text-sky-300">{tr.word}</div>
                      <span
                        className={`mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                          unlocked
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-400/20 text-amber-300'
                        }`}
                      >
                        {unlocked ? (
                          <>
                            <Volume2 className="w-3 h-3" /> Escuchar
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" /> {stk.costStars} est.
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===============================================================
           * TAB 4: MISIONES DIARIAS + TIENDA + MEDALLAS
           * =============================================================== */}
          {tab === 'rewards' && (
            <div className="space-y-4">
              {/* Diploma Oficial de Honor Banner */}
              {onOpenDiploma && (
                <div className="rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-transparent border border-amber-300/40 p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white truncate">Diploma Oficial de Honor</div>
                      <div className="text-xs text-sky-200">
                        Descarga o imprime tu certificado con nombre, estrellas y sello dorado
                      </div>
                    </div>
                  </div>
                  <KidsSquishButton
                    onClick={() => {
                      onClose();
                      onOpenDiploma();
                    }}
                    className="!min-h-[38px] h-9 px-3.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-black shrink-0"
                  >
                    Ver Diploma
                  </KidsSquishButton>
                </div>
              )}

              {/* Daily Mission Chest */}
              <div className="rounded-2xl bg-gradient-to-r from-[#1A2552] to-[#12193B] border border-amber-400/35 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Misión Diaria (+10 Estrellas)
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-bold text-white">
                    <span className={missions.learn >= 1 ? 'text-emerald-300' : 'text-sky-200'}>
                      Idiomas: {Math.min(1, missions.learn)}/1
                    </span>
                    <span className={missions.play >= 1 ? 'text-emerald-300' : 'text-sky-200'}>
                      Juegos: {Math.min(1, missions.play)}/1
                    </span>
                    <span className={missions.watch >= 1 ? 'text-emerald-300' : 'text-sky-200'}>
                      Cine: {Math.min(1, missions.watch)}/1
                    </span>
                  </div>
                </div>

                {missions.chestClaimed ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-black">
                    <CheckCircle2 className="w-4 h-4" /> Cofre cobrado hoy
                  </span>
                ) : (
                  <KidsSquishButton
                    disabled={!chestReady}
                    onClick={() => {
                      const ok = onClaimChest();
                      if (ok) {
                        playKidsSound('chest', ux.soundEnabled, true);
                        flashNotice('+10 estrellas del cofre diario.');
                      }
                    }}
                    className="!min-h-[40px] h-10 px-4 rounded-xl bg-amber-400 text-slate-950 border-b-4 border-amber-700 text-xs font-black disabled:opacity-40"
                  >
                    {chestReady ? 'Abrir Cofre (+10)' : 'Completa 1 de cada bloque'}
                  </KidsSquishButton>
                )}
              </div>

              {/* Shop */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-sky-300 mb-2">
                  Tienda de Estrellas
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {KIDS_SHOP_ITEMS.map((item) => {
                    const owned = unlockedRewards.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl bg-[#0F1633] border border-white/10 p-3 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-amber-400/15 text-amber-300 flex items-center justify-center shrink-0">
                            <KidsBadgeIcon iconId={item.iconId} className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-black text-white truncate">{item.title}</div>
                            <div className="text-[11px] font-bold text-sky-200/80 line-clamp-1">
                              {item.desc}
                            </div>
                          </div>
                        </div>

                        {owned ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] font-black shrink-0">
                            Activado
                          </span>
                        ) : (
                          <KidsSquishButton
                            onClick={() => {
                              const ok = unlockReward(item.id, item.cost);
                              if (ok) {
                                playKidsSound('levelUp', ux.soundEnabled, true);
                                flashNotice(`${item.title} activado.`);
                              } else {
                                playKidsSound('error', ux.soundEnabled, false);
                                flashNotice(`Faltan estrellas (${item.cost}).`);
                              }
                            }}
                            className="!min-h-[34px] h-8 px-3 rounded-xl bg-amber-400 text-slate-950 border-b-4 border-amber-700 text-xs font-black shrink-0"
                          >
                            {item.cost} <Star className="w-3 h-3 inline fill-current" />
                          </KidsSquishButton>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Badges */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-purple-300 mb-2">
                  Medallas ({profile.badges.length}/{KIDS_BADGES.length})
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {KIDS_BADGES.map((b) => {
                    const earned = profile.badges.includes(b.id);
                    return (
                      <div
                        key={b.id}
                        className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-center ${
                          earned
                            ? 'bg-purple-500/20 border-purple-400/50 text-white'
                            : 'bg-[#0C1229] border-white/10 text-slate-500 opacity-60'
                        }`}
                      >
                        <KidsBadgeIcon iconId={b.iconId} className="w-5 h-5" />
                        <span className="text-[11px] font-black leading-tight">{b.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
