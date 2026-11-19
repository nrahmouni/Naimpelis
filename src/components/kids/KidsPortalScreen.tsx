import React from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Gift,
  Moon,
  Sparkles,
  X,
} from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import type { KidsUxSettings } from '../../store/useKidsStore';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import kidsWorldCinemaImg from '../../assets/images/kids_world_cinema_1794940117384.jpg';
import kidsWorldLanguagesImg from '../../assets/images/kids_world_languages_1794940117132.jpg';
import kidsWorldGamesImg from '../../assets/images/kids_world_games_1794940117589.jpg';
import kidsMascotFennecImg from '../../assets/images/kids_mascot_fennec_1794940117205.jpg';
import {
  KIDS_LANGUAGES,
  type KidsMascotMeta,
  type KidsProgressState,
} from './kidsData';
import { playKidsSound } from './kidsAudioEngine';
import type { KidsUiCopy } from './kidsI18n';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsAnimatedMascotSvg } from './KidsSvgArt';
import { speakKidsText } from './kidsTtsHelper';
import type { PinActionIntent } from './KidsPinGateModal';

interface KidsPortalScreenProps {
  t: KidsUiCopy;
  progress: KidsProgressState;
  ux: KidsUxSettings;
  activeMascot: KidsMascotMeta;
  levelInfo: { level: number };
  chestReady: boolean;
  onOpenStoryStudio: () => void;
  onOpenPetWorld: () => void;
  onOpenAlbum: () => void;
  onClaimChest: () => boolean;
  onSelectTab: (tab: 'cinema' | 'fun' | 'learn') => void;
}

export const KidsPortalScreen: React.FC<KidsPortalScreenProps> = ({
  t,
  progress,
  ux,
  activeMascot,
  levelInfo,
  chestReady,
  onOpenStoryStudio,
  onOpenPetWorld,
  onOpenAlbum,
  onClaimChest,
  onSelectTab,
}) => {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 sm:gap-3 overflow-hidden px-0.5 py-1 justify-between">
      <div className="shrink-0 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl overflow-hidden border border-amber-300/45 bg-[#141B3B] shrink-0 shadow-md">
            {activeMascot.id === 'fox' ? (
              <img
                src={kidsMascotFennecImg}
                alt={activeMascot.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <KidsAnimatedMascotSvg id={activeMascot.id} size={44} />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-black text-lg sm:text-3xl text-white leading-tight truncate">
              {t.portalWelcome.replace('{name}', progress.name || 'Peque')}
            </h1>
            <p className="text-xs sm:text-sm text-sky-200/80 font-semibold truncate">
              {progress.ageGroup} {t.yearsLabel} · {t.levelLabel} {levelInfo.level} · {activeMascot.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
          <KidsSquishButton
            onClick={() => {
              playKidsSound('tap', ux.soundEnabled, true);
              onOpenStoryStudio();
            }}
            className="!min-h-[40px] h-10 px-2.5 sm:px-3.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-400/40 text-indigo-100 font-black text-xs sm:text-sm flex items-center gap-1.5"
          >
            <BookOpen className="w-4 h-4 text-indigo-300 shrink-0" />
            <span className="whitespace-nowrap">Cuentos IA</span>
          </KidsSquishButton>

          <KidsSquishButton
            onClick={() => {
              playKidsSound('tap', ux.soundEnabled, true);
              onOpenPetWorld();
            }}
            className="!min-h-[40px] h-10 px-2.5 sm:px-3.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/30 border border-amber-300/40 text-amber-100 font-black text-xs sm:text-sm flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="whitespace-nowrap">Mi Mundo</span>
          </KidsSquishButton>

          {chestReady ? (
            <KidsSquishButton
              onClick={onClaimChest}
              className="!min-h-[40px] h-10 px-3 sm:px-4 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg flex items-center gap-1.5"
            >
              <Gift className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">{t.openChestReward}</span>
            </KidsSquishButton>
          ) : (
            <KidsSquishButton
              onClick={onOpenAlbum}
              className="!min-h-[40px] h-10 px-2.5 sm:px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5"
            >
              <Award className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="hidden sm:inline whitespace-nowrap">{t.portalRewardsBtn}</span>
            </KidsSquishButton>
          )}
        </div>
      </div>

      {/* The 3 Core Illustrated Worlds */}
      <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-3 md:grid-cols-3 md:grid-rows-1 landscape:grid-cols-3 landscape:grid-rows-1 gap-2 sm:gap-3">
        {/* 1. CINE KIDS */}
        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => {
            triggerHaptic('medium');
            playKidsSound('tap', ux.soundEnabled, true);
            onSelectTab('cinema');
          }}
          className="group relative rounded-2xl sm:rounded-3xl overflow-hidden border border-amber-300/40 hover:border-amber-300 bg-gradient-to-br from-amber-950/60 to-[#0B1028] shadow-xl flex flex-col justify-end text-start cursor-pointer transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98] focus-visible:scale-[1.02] focus-visible:ring-4 focus-visible:ring-amber-300 min-h-0 h-full outline-none"
        >
          <img
            src={kidsWorldCinemaImg}
            alt={t.navCinema}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060919]/95 via-[#060919]/55 to-transparent" />

          <div className="relative z-10 p-3 sm:p-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-amber-300">
                YouTube Kids · {progress.preferredLang.toUpperCase()}
              </div>
              <h2 className="font-display font-black text-lg sm:text-2xl text-white leading-tight mt-0.5">
                {t.navCinema}
              </h2>
              <p className="text-xs font-medium text-sky-100/85 line-clamp-1 mt-0.5">
                {t.portalCinemaDesc}
              </p>
            </div>
            <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform">
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </span>
          </div>
        </button>

        {/* 2. 4 JUEGOS */}
        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => {
            triggerHaptic('medium');
            playKidsSound('tap', ux.soundEnabled, true);
            onSelectTab('fun');
          }}
          className="group relative rounded-2xl sm:rounded-3xl overflow-hidden border border-pink-300/40 hover:border-pink-300 bg-gradient-to-br from-pink-950/60 to-[#0B1028] shadow-xl flex flex-col justify-end text-start cursor-pointer transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98] focus-visible:scale-[1.02] focus-visible:ring-4 focus-visible:ring-pink-300 min-h-0 h-full outline-none"
        >
          <img
            src={kidsWorldGamesImg}
            alt={t.navFun}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060919]/95 via-[#060919]/55 to-transparent" />

          <div className="relative z-10 p-3 sm:p-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-pink-300">
                Arcade · Mates · Memoria · Música
              </div>
              <h2 className="font-display font-black text-lg sm:text-2xl text-white leading-tight mt-0.5">
                {t.navFun}
              </h2>
              <p className="text-xs font-medium text-pink-100/85 line-clamp-1 mt-0.5">
                {t.portalFunDesc}
              </p>
            </div>
            <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-pink-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform">
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </span>
          </div>
        </button>

        {/* 3. IDIOMAS CON TARIFIT */}
        <button
          type="button"
          data-tv-focusable="true"
          onClick={() => {
            triggerHaptic('medium');
            playKidsSound('tap', ux.soundEnabled, true);
            onSelectTab('learn');
          }}
          className="group relative rounded-2xl sm:rounded-3xl overflow-hidden border border-sky-300/40 hover:border-sky-300 bg-gradient-to-br from-sky-950/60 to-[#0B1028] shadow-xl flex flex-col justify-end text-start cursor-pointer transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98] focus-visible:scale-[1.02] focus-visible:ring-4 focus-visible:ring-sky-300 min-h-0 h-full outline-none"
        >
          <img
            src={kidsWorldLanguagesImg}
            alt={t.navLearn}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060919]/95 via-[#060919]/55 to-transparent" />

          <div className="relative z-10 p-3 sm:p-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-sky-300">
                ES · EN · FR · AR · RIF +3
              </div>
              <h2 className="font-display font-black text-lg sm:text-2xl text-white leading-tight mt-0.5">
                {t.navLearn}
              </h2>
              <p className="text-xs font-medium text-sky-100/85 line-clamp-1 mt-0.5">
                {t.portalLearnDesc}
              </p>
            </div>
            <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform">
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};

interface KidsLangAndRestOverlaysProps {
  langModalOpen: boolean;
  onCloseLangModal: () => void;
  isTimeUp: boolean;
  pinModalOpen: boolean;
  parentModalOpen: boolean;
  dir: 'ltr' | 'rtl';
  t: KidsUiCopy;
  progress: KidsProgressState;
  onSelectLang: (lang: KidsLanguageCode) => void;
  openPinModal: (intent: PinActionIntent) => void;
}

export const KidsLangAndRestOverlays: React.FC<KidsLangAndRestOverlaysProps> = ({
  langModalOpen,
  onCloseLangModal,
  isTimeUp,
  pinModalOpen,
  parentModalOpen,
  dir,
  t,
  progress,
  onSelectLang,
  openPinModal,
}) => (
  <>
    {langModalOpen && (
      <div
        role="dialog"
        aria-modal="true"
        dir={dir}
        onClick={onCloseLangModal}
        className="fixed inset-0 z-[257] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-3xl bg-[#141B38] border-2 border-amber-400/45 p-5 shadow-2xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display font-black text-xl text-white">
              {t.chooseLanguageTitle}
            </h2>
            <button
              type="button"
              onClick={onCloseLangModal}
              aria-label="Close"
              className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {KIDS_LANGUAGES.map((item) => {
              const selected = item.code === progress.preferredLang;
              return (
                <button
                  key={item.code}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    onSelectLang(item.code);
                    void speakKidsText(item.greeting, item.code, {
                      ageGroup: progress.ageGroup,
                    });
                    onCloseLangModal();
                  }}
                  className={`min-h-[54px] px-3.5 py-2.5 rounded-2xl border-2 border-b-4 flex items-center gap-3 cursor-pointer transition-transform active:scale-95 ${
                    selected
                      ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-amber-700'
                      : 'bg-[#1B254D] hover:bg-[#243269] text-white border-[#0E142E]'
                  }`}
                >
                  <FlagBadgeSvg code={item.flagCode} className="w-7 h-5 shadow-sm shrink-0" />
                  <span className="font-display font-black text-sm sm:text-base truncate">
                    {item.nativeLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    )}

    {isTimeUp && !pinModalOpen && !parentModalOpen && (
      <div
        role="dialog"
        aria-modal="true"
        dir={dir}
        className="fixed inset-0 z-[255] bg-[#0B0F22]/95 backdrop-blur-lg flex items-center justify-center p-5 text-center"
      >
        <div className="w-full max-w-sm rounded-3xl bg-[#161F42] border-2 border-amber-400/40 p-6 space-y-4 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/20 border border-indigo-300/35 flex items-center justify-center">
            <Moon className="w-9 h-9 text-amber-300" />
          </div>
          <h2 className="font-display font-extrabold text-2xl text-white">
            {t.timeUpTitle}
          </h2>
          <p className="text-sm text-sky-100/80">
            {t.timeUpBody} ({progress.stars} {t.starsAvailableSuffix})
          </p>
          <KidsSquishButton
            onClick={() => openPinModal('parent_settings')}
            className="w-full rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-black font-display font-black text-base"
          >
            {t.parentGateBtn}
          </KidsSquishButton>
        </div>
      </div>
    )}
  </>
);
