import React from 'react';
import {
  Award,
  Cake,
  Check,
  CheckCircle2,
  Gift,
  Moon,
  Music,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import type { KidsAgeGroup } from '../../types';
import type { KidsUxSettings } from '../../store/useKidsStore';
import {
  KIDS_AVATAR_CHOICES,
  KIDS_BADGES,
  KIDS_MASCOTS,
  KIDS_SHOP_ITEMS,
  type KidsMascotMeta,
  type KidsProfilesStore,
  type KidsProgressState,
} from './kidsData';
import type { KidsUiCopy } from './kidsI18n';
import {
  KidsAnimatedMascotSvg,
  KidsAvatarArtworkSvg,
  KidsBadgeIcon,
  KidsUniqueNameAvatarSvg,
} from './KidsSvgArt';

interface KidsAlbumModalProps {
  open: boolean;
  onClose: () => void;
  dir: 'ltr' | 'rtl';
  progress: KidsProgressState;
  profilesStore: KidsProfilesStore;
  ux: KidsUxSettings;
  bedtimeMode: boolean;
  lullabyPlaying: boolean;
  activeMascot: KidsMascotMeta;
  dailyMissions: NonNullable<KidsProgressState['dailyMissions']>;
  chestReady: boolean;
  levelInfo: { level: number; starsIntoLevel: number; starsForNextLevel: number; progressPct: number };
  rankLabel: string;
  t: KidsUiCopy;
  newSiblingName: string;
  setNewSiblingName: (val: string) => void;
  newSiblingAvatar: string;
  setNewSiblingAvatar: (val: string) => void;
  newSiblingAge: KidsAgeGroup;
  setNewSiblingAge: (val: KidsAgeGroup) => void;
  cycleMobileAgeGroup: () => void;
  onOpenWizard: () => void;
  toggleLowStimulation: () => void;
  setBedtimeMode: (next: boolean) => void;
  setLullabyPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  handleClaimChest: () => boolean;
  handleSwitchSibling: (id: string) => void;
  handleDeleteSibling: (id: string) => void;
  handleCreateSibling: (e: React.FormEvent) => void;
  handlePickMascot: (mascot: KidsMascotMeta) => void;
  handleUnlockShopItem: (rewardId: string, cost: number) => void;
}

export const KidsAlbumModal: React.FC<KidsAlbumModalProps> = ({
  open,
  onClose,
  dir,
  progress,
  profilesStore,
  ux,
  bedtimeMode,
  lullabyPlaying,
  activeMascot,
  dailyMissions,
  chestReady,
  levelInfo,
  rankLabel,
  t,
  newSiblingName,
  setNewSiblingName,
  newSiblingAvatar,
  setNewSiblingAvatar,
  newSiblingAge,
  setNewSiblingAge,
  cycleMobileAgeGroup,
  onOpenWizard,
  toggleLowStimulation,
  setBedtimeMode,
  setLullabyPlaying,
  handleClaimChest,
  handleSwitchSibling,
  handleDeleteSibling,
  handleCreateSibling,
  handlePickMascot,
  handleUnlockShopItem,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir={dir}
      className="fixed inset-0 z-[258] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
    >
      <div className="w-full max-w-lg max-h-[90dvh] rounded-3xl bg-[#141B38] border-2 border-amber-400/40 p-4 sm:p-5 shadow-2xl flex flex-col gap-3 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <KidsUniqueNameAvatarSvg
              name={progress.name || 'Peque 1'}
              fallbackAvatarId={progress.avatarEmoji || 'fennec'}
              size={48}
            />
            <KidsAnimatedMascotSvg id={activeMascot.id} size={42} />
            <div className="min-w-0">
              <h2 className="font-display font-extrabold text-base sm:text-lg text-white truncate">
                {t.albumTitlePrefix} {progress.name || 'Peque 1'}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold tabular-nums">
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <Star className="w-3.5 h-3.5 fill-amber-300" />
                  {progress.stars} {t.starsAvailableSuffix}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-200 text-[11px]">
                  {t.levelLabel} {levelInfo.level} · {rankLabel}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Explorer XP Bar */}
        <div className="shrink-0 px-3 py-2 rounded-2xl bg-[#0F152D] border border-sky-400/25 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-extrabold text-sky-200">
            <span className="inline-flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-300" />
              {t.levelLabel} {levelInfo.level} · {rankLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-amber-300 tabular-nums">
              {levelInfo.starsIntoLevel}/{levelInfo.starsForNextLevel} ({levelInfo.progressPct}%)
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 via-pink-400 to-sky-400 transition-all duration-300"
              style={{ width: `${levelInfo.progressPct}%` }}
            />
          </div>
        </div>

        {/* Quick Controls */}
        <div className="shrink-0 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={cycleMobileAgeGroup}
            className="h-9 px-3 rounded-xl bg-[#1C264E] border border-sky-400/30 text-xs font-black text-sky-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Cake className="w-3.5 h-3.5 text-amber-300" />
            <span>
              {progress.ageGroup} {t.yearsLabel}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenWizard();
            }}
            className="h-9 px-3 rounded-xl bg-[#1C264E] border border-amber-400/35 text-xs font-black text-amber-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>{t.stepWizardShort}</span>
          </button>
          <button
            type="button"
            onClick={toggleLowStimulation}
            className={`h-9 px-3 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
              ux.lowStimulation
                ? 'bg-teal-500/30 border-teal-300 text-teal-100'
                : 'bg-[#1C264E] border-white/10 text-teal-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.calmMode}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !bedtimeMode;
              setBedtimeMode(next);
              if (!next) setLullabyPlaying(false);
            }}
            className={`h-9 px-3 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
              bedtimeMode
                ? 'bg-indigo-500 border-indigo-300 text-white'
                : 'bg-[#1C264E] border-white/10 text-indigo-200'
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>{t.bedtimeMode}</span>
          </button>
          {bedtimeMode && (
            <button
              type="button"
              onClick={() => setLullabyPlaying((v) => !v)}
              className={`h-9 px-3 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 cursor-pointer ${
                lullabyPlaying
                  ? 'bg-amber-400 border-amber-200 text-black'
                  : 'bg-[#1C264E] border-white/10 text-amber-200'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>{t.lullabyLabel}</span>
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pe-1">
          {/* Daily Missions */}
          <div className="p-3 rounded-2xl bg-gradient-to-br from-[#1B254D] to-[#151D3D] border border-amber-400/30 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5" /> {t.dailyMissionsTitle}
              </h3>
              {dailyMissions.chestClaimed ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t.chestOpenedToday}
                </span>
              ) : chestReady ? (
                <button
                  type="button"
                  onClick={handleClaimChest}
                  className="h-9 px-3 rounded-xl bg-amber-400 text-black text-xs font-black cursor-pointer animate-pulse"
                >
                  {t.openChestReward}
                </button>
              ) : (
                <span className="text-[11px] text-sky-200">{t.completeAllThree}</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: t.missionWatch, done: dailyMissions.watch >= 1 },
                { label: t.missionPlay, done: dailyMissions.play >= 1 },
                { label: t.missionLearn, done: dailyMissions.learn >= 1 },
              ].map((m) => (
                <div
                  key={m.label}
                  className={`p-2 rounded-xl border text-[11px] font-bold ${
                    m.done
                      ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100'
                      : 'bg-[#101630] border-white/10 text-zinc-300'
                  }`}
                >
                  <div>{m.label}</div>
                  <div className="text-[10px] mt-0.5">{m.done ? t.missionDone : '0/1'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Profiles on this Device */}
          <div className="space-y-2">
            <h3 className="text-xs font-extrabold text-sky-200 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> {t.siblingsTitle} ({profilesStore.profiles.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {profilesStore.profiles.map((prof) => {
                const isCurrent = prof.id === progress.id;
                return (
                  <div
                    key={prof.id}
                    className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 ${
                      isCurrent
                        ? 'bg-sky-400/25 border-sky-300 text-white'
                        : 'bg-[#1B2447] border-white/10 text-zinc-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSwitchSibling(prof.id!)}
                      className="flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                    >
                      <KidsUniqueNameAvatarSvg
                        name={prof.name || 'Peque'}
                        fallbackAvatarId={prof.avatarEmoji || 'fennec'}
                        size={24}
                      />
                      <span>{prof.name}</span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300 tabular-nums">
                        {prof.stars}
                        <Star className="w-2.5 h-2.5 fill-amber-300" />
                      </span>
                    </button>
                    {profilesStore.profiles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSibling(prof.id!)}
                        aria-label={`Delete ${prof.name}`}
                        className="ms-1 text-zinc-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleCreateSibling} className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1">
                {KIDS_AVATAR_CHOICES.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setNewSiblingAvatar(av)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer border ${
                      newSiblingAvatar === av
                        ? 'bg-amber-400/30 border-amber-300'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <KidsAvatarArtworkSvg avatarId={av} size={22} />
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={newSiblingName}
                onChange={(e) => setNewSiblingName(e.target.value)}
                placeholder={t.siblingPlaceholder}
                className="flex-1 min-w-[130px] h-9 px-2.5 rounded-lg bg-[#0B1024] border border-white/15 text-xs text-white outline-none"
              />
              <select
                value={newSiblingAge}
                onChange={(e) => setNewSiblingAge(e.target.value as KidsAgeGroup)}
                aria-label={t.lockAgeLabel}
                className="h-9 px-2 rounded-lg bg-[#0B1024] border border-white/15 text-xs text-white outline-none"
              >
                <option value="3-5">3–5</option>
                <option value="6-8">6–8</option>
                <option value="9-12">9–12</option>
              </select>
              <button
                type="submit"
                className="h-9 px-3 rounded-lg bg-emerald-400 text-black text-xs font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.createBtn}</span>
              </button>
            </form>
          </div>

          {/* Mascots Picker */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-extrabold text-sky-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" /> {t.chooseMascotTitle}
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {KIDS_MASCOTS.map((m) => {
                const owned =
                  m.costStars === 0 || (progress.unlockedRewards || []).includes(`mascot_${m.id}`);
                const selected = progress.mascotId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePickMascot(m)}
                    className={`p-2 rounded-2xl border-2 border-b-4 text-center flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      selected
                        ? 'bg-amber-400/25 border-amber-400 text-white'
                        : 'bg-[#1B2447] hover:bg-[#232F5C] border-[#29376B] text-zinc-200'
                    }`}
                  >
                    <KidsAnimatedMascotSvg id={m.id} size={36} />
                    <span className="text-[11px] font-bold">{m.name}</span>
                    <span className="text-[10px] font-extrabold text-amber-300 tabular-nums">
                      {selected ? t.mascotActive : owned ? t.mascotUse : `${m.costStars}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reward Shop */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-extrabold text-pink-200 flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5" /> {t.rewardShopTitle}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {KIDS_SHOP_ITEMS.map((item) => {
                const owned = (progress.unlockedRewards || []).includes(item.id);
                const canAfford = progress.stars >= item.cost;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={owned}
                    onClick={() => handleUnlockShopItem(item.id, item.cost)}
                    className={`p-2.5 rounded-2xl border-2 text-start flex items-center justify-between gap-2 transition-all ${
                      owned
                        ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100'
                        : canAfford
                        ? 'bg-[#1B2447] hover:bg-[#253161] border-amber-400/45 text-white cursor-pointer'
                        : 'bg-[#121833] border-white/10 text-zinc-400 opacity-75 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-amber-300">
                        <KidsBadgeIcon iconId={item.iconId} className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold truncate">{item.title}</div>
                        <div className="text-[10px] text-sky-200/75 truncate">{item.desc}</div>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-black text-amber-300">
                      {owned ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <Check className="w-3.5 h-3.5" /> {t.shopOwned}
                        </span>
                      ) : (
                        `${item.cost}`
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Badges */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" /> {t.badgesTitle} ({progress.badges.length}/{KIDS_BADGES.length})
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {KIDS_BADGES.map((b) => {
                const earned = progress.badges.includes(b.id);
                return (
                  <div
                    key={b.id}
                    className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1 ${
                      earned
                        ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                        : 'bg-black/25 border-white/5 text-zinc-500 opacity-45 grayscale'
                    }`}
                  >
                    <KidsBadgeIcon iconId={b.iconId} className="w-5 h-5" />
                    <span className="text-[10px] font-bold leading-tight truncate w-full text-white">
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
