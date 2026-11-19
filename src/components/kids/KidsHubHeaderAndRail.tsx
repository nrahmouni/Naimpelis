import React from 'react';
import {
  Clock,
  Download,
  Film,
  Gamepad2,
  Globe,
  Home,
  Lock,
  Plus,
  Star,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import type { KidsUxSettings } from '../../store/useKidsStore';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_LANGUAGES,
  type KidsMascotMeta,
  type KidsProfilesStore,
  type KidsProgressState,
} from './kidsData';
import type { KidsUiCopy } from './kidsI18n';
import { KidsSquishButton } from './KidsPrimitives';
import {
  KidsAnimatedCategoryIcon,
  KidsAnimatedMascotSvg,
  KidsUniqueNameAvatarSvg,
} from './KidsSvgArt';

export type KidsHubTab = 'portal' | 'cinema' | 'fun' | 'learn';

interface KidsHubHeaderProps {
  activeTab: KidsHubTab;
  setActiveTab: (tab: KidsHubTab) => void;
  progress: KidsProgressState;
  profilesStore: KidsProfilesStore;
  ux: KidsUxSettings;
  chestReady: boolean;
  isTvActive: boolean;
  remainingMins: number | null;
  t: KidsUiCopy;
  onOpenAlbum: () => void;
  onOpenFamilyOnboarding: () => void;
  onSwitchSibling: (profileId: string) => void;
  onOpenPinModal: (intent: 'exit' | 'parent_settings' | 'cast_tv') => void;
  onOpenApkModal: () => void;
  onOpenLangModal: () => void;
  onToggleSound: () => void;
  onOpenSmartTv?: () => void;
  kidsLang: KidsLanguageCode;
}

export const KidsHubHeader: React.FC<KidsHubHeaderProps> = ({
  activeTab,
  setActiveTab,
  progress,
  profilesStore,
  ux,
  chestReady,
  isTvActive,
  remainingMins,
  t,
  onOpenAlbum,
  onOpenFamilyOnboarding,
  onSwitchSibling,
  onOpenPinModal,
  onOpenApkModal,
  onOpenLangModal,
  onToggleSound,
  onOpenSmartTv,
}) => {
  return (
    <header className="shrink-0 relative z-[225] flex items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 landscape:py-0.5 pt-safe border-b border-white/10">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        {activeTab === 'portal' ? (
          <KidsSquishButton
            onClick={onOpenAlbum}
            ariaLabel={`${t.albumTitlePrefix} ${progress.name || 'Peque'}`}
            title={`${t.albumTitlePrefix} ${progress.name || 'Peque'}`}
            className="!min-w-0 !min-h-[42px] h-10 sm:h-11 flex items-center gap-2 px-2 sm:px-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] border border-white/10 shrink-0"
          >
            <div className="relative w-7 h-7 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center">
              <KidsUniqueNameAvatarSvg
                name={progress.name || 'Peque'}
                fallbackAvatarId={progress.avatarEmoji || 'fennec'}
                size={30}
              />
              {chestReady && (
                <span className="absolute -top-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[#0D132B]" />
              )}
            </div>
            <div className="text-start flex items-center gap-1.5">
              <span className="hidden sm:inline text-xs sm:text-sm font-bold text-white max-w-[90px] truncate">
                {progress.name || 'Peque'}
              </span>
              <span className="flex items-center gap-1 text-xs font-black text-amber-300 tabular-nums">
                <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300 shrink-0" />
                <span>{progress.stars}</span>
              </span>
            </div>
          </KidsSquishButton>
        ) : (
          <KidsSquishButton
            onClick={() => setActiveTab('portal')}
            className="!min-w-0 !min-h-[42px] h-10 sm:h-11 flex items-center gap-1.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm shadow-md shrink-0"
          >
            <Home className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">{t.backToHome}</span>
          </KidsSquishButton>
        )}

        {/* Sibling Quick-Switcher */}
        {activeTab === 'portal' && profilesStore.profiles.length > 1 && (
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 shrink-0">
            {profilesStore.profiles.map((p) => {
              const isCurrent = p.id === progress.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    if (p.id) onSwitchSibling(p.id);
                  }}
                  className={`h-9 px-2 sm:px-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-amber-400 text-slate-950 font-black shadow-md ring-2 ring-amber-300'
                      : 'bg-white/5 hover:bg-white/15 text-zinc-200'
                  }`}
                  title={`Cambiar a ${p.name || 'Hermano'}`}
                >
                  <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center">
                    <KidsUniqueNameAvatarSvg
                      name={p.name || 'Peque'}
                      fallbackAvatarId={p.avatarEmoji || 'fennec'}
                      size={20}
                    />
                  </div>
                  <span className="text-[11px] font-black max-w-[55px] sm:max-w-[70px] truncate">
                    {p.name || 'Peque'}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              data-tv-focusable="true"
              onClick={onOpenFamilyOnboarding}
              title="Configurar peques de la familia"
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-amber-300 flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'portal' && profilesStore.profiles.length === 1 && (
          <button
            type="button"
            data-tv-focusable="true"
            onClick={onOpenFamilyOnboarding}
            title="Añadir hermanos (+ Hermanos)"
            className="hidden sm:flex h-9 px-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-amber-300 text-xs font-bold items-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[11px]">+ Hermanos</span>
          </button>
        )}

        {/* Brand / Active Section Title */}
        {activeTab === 'portal' ? (
          <div className={`items-center gap-1.5 min-w-0 ${profilesStore.profiles.length > 1 ? 'hidden md:flex' : 'flex'}`}>
            <span className="font-display font-black text-sm sm:text-xl tracking-tight bg-gradient-to-r from-amber-300 via-pink-300 to-sky-300 bg-clip-text text-transparent truncate whitespace-nowrap">
              Riffan Kids
            </span>
            {isTvActive && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-600 font-bold text-white shrink-0">
                TV
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0 text-white font-display font-black text-sm sm:text-base">
            <KidsAnimatedCategoryIcon
              name={activeTab === 'cinema' ? 'cinema' : activeTab === 'fun' ? 'fun' : 'learn'}
              size={18}
            />
            <span className="truncate">
              {activeTab === 'cinema' ? t.navCinema : activeTab === 'fun' ? t.navFun : t.navLearn}
            </span>
          </div>
        )}
      </div>

      {/* Right Quick Controls */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {remainingMins !== null && (
          <div className="hidden lg:flex h-10 px-2.5 rounded-xl bg-indigo-500/20 border border-indigo-300/30 items-center gap-1 text-xs font-black text-indigo-100 tabular-nums">
            <Clock className="w-3.5 h-3.5" />
            <span>{remainingMins}m</span>
          </div>
        )}

        {onOpenSmartTv && (
          <KidsSquishButton
            onClick={() => onOpenPinModal('cast_tv')}
            ariaLabel={t.connectSmartTv}
            title={t.connectSmartTv}
            className={`hidden sm:flex !min-w-[42px] !min-h-[42px] h-10 sm:h-11 px-2.5 rounded-xl border items-center justify-center gap-1.5 ${
              isTvActive
                ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                : 'bg-white/[0.07] hover:bg-white/[0.13] text-zinc-200 border-white/10'
            }`}
          >
            <Tv className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="hidden xl:inline text-xs font-black">TV</span>
          </KidsSquishButton>
        )}

        <KidsSquishButton
          onClick={onOpenApkModal}
          ariaLabel="Descargar APK para Google TV y Móvil"
          title="Descargar APK para Google TV y Móvil"
          className="!min-w-[44px] !min-h-[44px] h-11 px-2 sm:px-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-sky-200 flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
        >
          <Download className="w-4 h-4 text-sky-300 shrink-0" />
          <span className="hidden xl:inline text-xs font-black">APK</span>
        </KidsSquishButton>

        <KidsSquishButton
          onClick={() => {
            if (progress.parentPrefs?.lockedLang) return;
            onOpenLangModal();
          }}
          ariaLabel={t.chooseLanguageTitle}
          title={t.chooseLanguageTitle}
          className={`!min-w-[44px] !min-h-[44px] h-11 px-2 sm:px-2.5 rounded-xl border flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
            progress.parentPrefs?.lockedLang
              ? 'bg-white/[0.04] text-zinc-400 border-white/10 cursor-not-allowed'
              : 'bg-white/[0.07] hover:bg-white/[0.13] text-white border-white/10'
          }`}
        >
          <FlagBadgeSvg
            code={(KIDS_LANGUAGES.find((l) => l.code === progress.preferredLang) || KIDS_LANGUAGES[0]).flagCode}
            className="w-5 h-3.5 shadow-sm shrink-0"
          />
          <span className="hidden md:inline text-xs font-black uppercase">
            {progress.preferredLang}
          </span>
        </KidsSquishButton>

        <KidsSquishButton
          onClick={onToggleSound}
          ariaLabel={ux.soundEnabled ? t.soundOn : t.soundOff}
          title={ux.soundEnabled ? t.soundOn : t.soundOff}
          className={`!min-w-[44px] !min-h-[44px] h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 ${
            ux.soundEnabled
              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
              : 'bg-white/[0.07] text-zinc-400 border-white/10'
          }`}
        >
          {ux.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </KidsSquishButton>

        <KidsSquishButton
          onClick={() => onOpenPinModal('parent_settings')}
          ariaLabel={t.parentsBtn}
          title={t.parentsBtn}
          className="!min-w-[44px] !min-h-[44px] h-11 w-11 sm:w-auto sm:px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-xs sm:text-sm font-black text-zinc-100 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Lock className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="hidden sm:inline whitespace-nowrap">{t.parentsBtn}</span>
        </KidsSquishButton>
      </div>
    </header>
  );
};

interface KidsLandscapeNavRailProps {
  activeTab: KidsHubTab;
  setActiveTab: (tab: KidsHubTab) => void;
  activeMascot: KidsMascotMeta;
  t: KidsUiCopy;
}

export const KidsLandscapeNavRail: React.FC<KidsLandscapeNavRailProps> = ({
  activeTab,
  setActiveTab,
  activeMascot,
  t,
}) => {
  if (activeTab === 'portal') return null;

  return (
    <nav
      aria-label="Riffan Kids Rail"
      className="hidden landscape:flex md:landscape:hidden shrink-0 w-14 flex-col items-center justify-between py-2 px-1 rounded-2xl bg-[#121835]/95 border border-white/10"
    >
      <button
        type="button"
        onClick={() => setActiveTab('portal')}
        aria-label={t.backToHome}
        className="w-11 h-11 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 flex items-center justify-center cursor-pointer"
      >
        <Home className="w-5 h-5" />
      </button>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('cinema')}
          aria-label={t.navCinema}
          className={`w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer ${
            activeTab === 'cinema' ? 'bg-amber-400 text-slate-950' : 'text-zinc-300 bg-white/5'
          }`}
        >
          <Film className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('fun')}
          aria-label={t.navFun}
          className={`w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer ${
            activeTab === 'fun' ? 'bg-pink-500 text-white' : 'text-zinc-300 bg-white/5'
          }`}
        >
          <Gamepad2 className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('learn')}
          aria-label={t.navLearn}
          className={`w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer ${
            activeTab === 'learn' ? 'bg-sky-400 text-slate-950' : 'text-zinc-300 bg-white/5'
          }`}
        >
          <Globe className="w-5 h-5" />
        </button>
      </div>
      <div className="w-9 h-9 flex items-center justify-center">
        <KidsAnimatedMascotSvg id={activeMascot.id} size={30} />
      </div>
    </nav>
  );
};
