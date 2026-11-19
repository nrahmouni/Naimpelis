import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Shuffle,
  Play,
  Clock,
  Settings,
  KeyRound,
  Check,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { AppLanguage } from '../types';
import { pickLang, formatRoomTitle } from '../utils/i18n';
import {
  generateRandomGuestName,
  RecentRoomEntry,
  StoredProfile,
} from '../utils/storage';
import { triggerHaptic } from '../utils/haptics';
import {
  extractRoomCodeFromInput,
  generateShortRoomCode,
} from '../utils/shortLink';
import { NaimBrandLogo } from './NaimBrandLogo';
import { FlagBadgeSvg } from './ui/LanguageBadge';
import { EffectiveViewMode, getMonogramInitials } from './MobileViewportGuard';
import { SettingsBottomSheet } from './SettingsBottomSheet';
import {
  PrimaryButton,
  IconButton,
  BottomSheet,
  SecondaryButton,
  StandardInput,
} from './ui/DesignSystem';
import { useAppStore } from '../store/useAppStore';
import { PWAInstallLandingCard } from './PWAInstallPrompt';

interface LobbyScreenProps {
  initialProfile: StoredProfile;
  recentRooms: RecentRoomEntry[];
  lang: AppLanguage;
  effectiveView: EffectiveViewMode;
  isFramedMobileOnPc: boolean;
  onToggleViewMode: () => void;
  authUser: User | null;
  authLoading: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onChangeLang: (lang: AppLanguage) => void;
  onReplayIntro: () => void;
  onEnterSolo: (profile: StoredProfile) => void;
  onEnterRoom: (roomId: string, profile: StoredProfile, roomName?: string) => void;
  onOpenTvPairLobby?: () => void;
  onOpenAdsPage?: () => void;
  onOpenLinkDevice?: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  initialProfile,
  recentRooms,
  lang,
  effectiveView,
  isFramedMobileOnPc,
  onToggleViewMode,
  authUser,
  authLoading,
  onSignIn,
  onSignOut,
  onChangeLang,
  onReplayIntro,
  onEnterSolo,
  onEnterRoom,
  onOpenTvPairLobby,
  onOpenLinkDevice,
}) => {
  const isDesktop = effectiveView === 'desktop';
  const [name, setName] = useState(
    authUser?.displayName?.trim() ||
      (initialProfile.isCustomized ? initialProfile.name : '')
  );
  const [roomCode, setRoomCode] = useState('');
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showJoinSheet, setShowJoinSheet] = useState(false);
  const authNotice = useAppStore((s) => s.authNotice);

  useEffect(() => {
    setName(
      authUser?.displayName?.trim() ||
        (initialProfile.isCustomized ? initialProfile.name : '')
    );
  }, [authUser?.displayName, initialProfile.id, initialProfile.isCustomized, initialProfile.name]);

  const buildProfile = (): StoredProfile => {
    const trimmed = name.trim();
    if (!trimmed) {
      const randomCatalanName = generateRandomGuestName(initialProfile.name);
      return {
        id: initialProfile.id,
        name: randomCatalanName.slice(0, 24),
        avatar: initialProfile.avatar || '🎬',
        color: initialProfile.color || '#9146FF',
        isCustomized: false,
      };
    }
    return {
      id: initialProfile.id,
      name: trimmed.slice(0, 24),
      avatar: initialProfile.avatar || '🎬',
      color: initialProfile.color || '#9146FF',
      isCustomized: true,
    };
  };

  const handleEnterApp = () => {
    const profile = buildProfile();
    triggerHaptic('success');
    const code = generateShortRoomCode(4);
    const defaultRoomTitle = formatRoomTitle(lang, profile.name);
    onEnterRoom(code, profile, defaultRoomTitle);
  };

  const handleEnterSoloApp = () => {
    const profile = buildProfile();
    triggerHaptic('medium');
    onEnterSolo(profile);
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const profile = buildProfile();
    const cleanCode = extractRoomCodeFromInput(roomCode);
    if (!cleanCode) return;
    triggerHaptic('success');
    setShowJoinSheet(false);
    onEnterRoom(cleanCode, profile);
  };

  const handleRandomName = () => {
    triggerHaptic('light');
    setName(generateRandomGuestName(name));
  };

  const formatRoomChipName = (roomName: string) => {
    const cleaned = roomName.trim();
    return cleaned.length > 20 ? `${cleaned.slice(0, 18)}…` : cleaned;
  };

  return (
    <div className="min-h-dvh w-full bg-[#07080C] text-[#F4F5F8] overflow-x-clip relative flex flex-col">
      {/* Subtle dark purple ambient gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 nc-aurora-ambient"
      />

      <div
        className={`@container min-h-dvh w-full flex flex-col pt-safe pb-safe relative z-10 ${
          isFramedMobileOnPc
            ? 'max-w-[27rem] mx-auto border-x border-white/[0.08] bg-[#07080C] shadow-[0_0_120px_rgba(0,0,0,0.96)]'
            : ''
        }`}
      >
        {/* Minimal Access Header: Logo + RiffanTV left, Settings Gear right */}
        <header
          className={`w-full max-w-5xl mx-auto ${
            isDesktop ? 'px-6 h-20' : 'px-4 h-16'
          } flex items-center justify-between gap-4 shrink-0`}
        >
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onReplayIntro();
            }}
            className="flex items-center min-w-0 cursor-pointer text-left group py-1 whitespace-nowrap shrink-0 active:scale-[0.98] transition-transform"
            aria-label="RiffanTV"
          >
            <NaimBrandLogo variant="full" size={34} animated />
          </button>

          <IconButton
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowSettingsSheet(true);
            }}
            aria-label={pickLang(lang, {
              es: 'Ajustes',
              ca: 'Ajustos',
              en: 'Settings',
            })}
          >
            <Settings className="w-5 h-5" />
          </IconButton>
        </header>

        {/* Centered Mobile-First Access Stage */}
        <main className="flex-1 w-full max-w-md mx-auto px-4 py-6 flex flex-col justify-center gap-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="text-center space-y-2.5"
          >
            <h1 className="font-display font-bold text-fluid-hero text-white text-balance">
              {pickLang(lang, {
                es: 'Tu sala privada para ver cine, series, TV y deporte juntos.',
                ca: 'La teva sala privada per veure cinema, sèries, TV i esport junts.',
                en: 'Your private theater for movies, series, TV and sports together.',
                zh: '专属于你与好友的私人影院，电影、剧集、直播与体育同步畅享。',
                rif: 'Ssinima-nnek i lafilmat, siriyat, talfaza d sspor aked imddukkal.',
              })}
            </h1>
            <p className="text-sm text-zinc-400">
              {pickLang(lang, {
                es: 'Entra a tu aire en solitario o crea una sala sincronizada.',
                ca: 'Entra al teu aire en solitari o crea una sala sincronitzada.',
                en: 'Watch solo at your own pace or create a synced watch party.',
                zh: '自由独享观看，或随时创建同步房间与好友一起看。',
                rif: 'Xzar wehdek neɣ egg taxxamt aked imddukkal.',
              })}
            </p>
          </motion.div>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-3xl bg-[#10121C]/95 border border-white/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.08)] p-5 sm:p-6 space-y-5"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 -right-16 w-48 h-48 rounded-full bg-[#9146FF]/15 blur-3xl"
            />
            {/* Continuar en tus salas (only if present) */}
            {recentRooms.length > 0 && (
              <div className="space-y-2 pb-4 border-b border-white/[0.07]">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                  <Clock className="w-3.5 h-3.5 text-[#BF94FF]" />
                  <span>
                    {pickLang(lang, {
                      es: 'Continuar en tus salas',
                      ca: 'Continuar a les teves sales',
                      en: 'Continue in your rooms',
                      zh: '继续你的房间',
                      rif: 'Kemmel di texxamin-nnek',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-snap-x">
                  {recentRooms.slice(0, 5).map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        const profile = buildProfile();
                        if (profile) {
                          onEnterRoom(room.id, profile, room.name);
                        }
                      }}
                      className="scroll-snap-item min-h-12 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.09] text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.97] transition-all"
                    >
                      <Play className="w-3.5 h-3.5 text-[#BF94FF] fill-current shrink-0" />
                      <span>{formatRoomChipName(room.name)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Single Primary Flow: Tu nombre + ONE Primary Button "Entrar" */}
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="access-nickname"
                  className="block text-xs font-semibold text-zinc-300 pl-1"
                >
                  {pickLang(lang, {
                    es: 'Tu nombre',
                    ca: 'El teu nom',
                    en: 'Your name',
                  })}
                </label>
                <div className="flex items-center gap-2">
                  <div
                    aria-hidden="true"
                    className="w-12 h-12 rounded-2xl bg-[#9146FF]/20 border border-[#9146FF]/35 flex items-center justify-center font-display font-bold text-sm text-white shrink-0"
                  >
                    {getMonogramInitials(name || initialProfile.name)}
                  </div>
                  <input
                    id="access-nickname"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleEnterSoloApp();
                      }
                    }}
                    placeholder={pickLang(lang, {
                      es: 'Tu nombre (vacío = mote catalán)',
                      ca: 'El teu nom (buit = malnom català)',
                      en: 'Your name (blank = random Catalan nick)',
                    })}
                    maxLength={24}
                    className="flex-1 min-w-0 min-h-12 px-4 rounded-2xl bg-white/[0.05] border border-white/[0.1] focus:border-[#9146FF] text-sm font-medium text-white placeholder:text-zinc-500 outline-none transition-colors"
                  />
                  <IconButton
                    type="button"
                    onClick={handleRandomName}
                    aria-label={pickLang(lang, {
                      es: 'Nombre aleatorio',
                      ca: 'Nom aleatori',
                      en: 'Random name',
                    })}
                  >
                    <Shuffle className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>

              <div className="space-y-2.5">
                <PrimaryButton
                  type="button"
                  onClick={handleEnterSoloApp}
                  fullWidth
                  size="lg"
                >
                  <UserIcon className="w-4 h-4 shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'Entrar en solitario',
                      ca: 'Entrar en solitari',
                      en: 'Enter Solo',
                      zh: '独自进入',
                      rif: 'Adef wehdek',
                    })}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </PrimaryButton>

                <button
                  type="button"
                  onClick={handleEnterApp}
                  className="w-full min-h-12 px-4 rounded-2xl bg-gradient-to-r from-[#9146FF]/18 via-[#1B182D] to-[#9146FF]/14 hover:from-[#9146FF]/28 hover:to-[#9146FF]/24 border border-[#9146FF]/45 hover:border-[#BF94FF]/70 text-sm font-display font-bold text-white flex items-center justify-center gap-2 cursor-pointer active:scale-[0.985] transition-all shadow-[0_8px_24px_rgba(145,70,255,0.16)]"
                >
                  <Users className="w-4 h-4 text-[#D8B4FE] shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'Crear sala con amigos',
                      ca: 'Crear sala amb amics',
                      en: 'Create Watch Party',
                      zh: '创建好友房间',
                      rif: 'Egg taxxamt aked imddukkal',
                    })}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#BF94FF] shrink-0" />
                </button>
              </div>
            </div>

            {/* Actions: Google & Join on same level, App Install below */}
            <div className="pt-3 border-t border-white/[0.07] space-y-3">
              <div className="grid grid-cols-2 gap-2 w-full">
                {!authUser || authUser.isAnonymous ? (
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => {
                      triggerHaptic('medium');
                      void onSignIn();
                    }}
                    className="min-h-11 px-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center justify-center gap-2 cursor-pointer transition-colors truncate"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                      />
                    </svg>
                    <span className="truncate">
                      {authLoading
                        ? pickLang(lang, { es: '...', ca: '...', en: '...' })
                        : authUser?.isAnonymous
                        ? pickLang(lang, { es: 'Vincular Google', ca: 'Vincular Google', en: 'Link Google' })
                        : pickLang(lang, { es: 'Google', ca: 'Google', en: 'Google' })}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onOpenLinkDevice?.();
                    }}
                    className="min-h-11 px-3 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/18 border border-emerald-500/30 text-[11px] font-semibold text-emerald-200 flex items-center justify-center gap-1.5 truncate cursor-pointer transition-colors"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">{authUser.displayName || 'Google'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShowJoinSheet(true);
                  }}
                  className="min-h-11 px-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-semibold text-[#BF94FF] hover:text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors truncate"
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {pickLang(lang, {
                      es: 'Unirme',
                      ca: 'Unir-me',
                      en: 'Join code',
                      zh: '通过代码加入',
                      rif: 'Udef s lkod',
                    })}
                  </span>
                </button>
              </div>

              {!authUser && authNotice && (
                <p className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.1] px-3 py-2 text-[11px] leading-relaxed text-zinc-300 text-center">
                  {authNotice}
                </p>
              )}

              {/* App download / install buttons below */}
              <div className="w-full">
                <PWAInstallLandingCard lang={lang} />
              </div>
            </div>
          </motion.section>

          {/* Compact single-row unified language selector exclusively on access screen */}
          <div className="rounded-2xl bg-[#10121C]/85 border border-white/[0.08] p-1.5 grid grid-cols-5 gap-1.5">
            {[
              { code: 'en' as AppLanguage, flag: 'en' as const, label: 'EN', title: 'English' },
              { code: 'es' as AppLanguage, flag: 'es' as const, label: 'ES', title: 'Español' },
              { code: 'ca' as AppLanguage, flag: 'ca' as const, label: 'CA', title: 'Català' },
              { code: 'rif' as AppLanguage, flag: 'rif' as const, label: 'RIF', title: 'Tarifit (Riffian)' },
              { code: 'zh' as AppLanguage, flag: 'zh' as const, label: 'ZH', title: '中文' },
            ].map((item) => {
              const isSelected = lang === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeLang(item.code);
                  }}
                  title={item.title}
                  aria-label={item.title}
                  className={`min-h-10 px-2 rounded-xl text-xs font-display font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.97] whitespace-nowrap border ${
                    isSelected
                      ? 'bg-[#9146FF] text-white border-[#A970FF]/70 shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                      : 'bg-transparent hover:bg-white/[0.06] text-zinc-400 hover:text-white border-transparent'
                  }`}
                >
                  <FlagBadgeSvg code={item.flag} className="w-4 h-3" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </main>

        {/* Unirme con código sheet */}
        <BottomSheet
          isOpen={showJoinSheet}
          onClose={() => setShowJoinSheet(false)}
          lang={lang}
          maxWidth="sm:max-w-sm"
          icon={<KeyRound className="w-5 h-5" />}
          title={pickLang(lang, {
            es: 'Unirme con código',
            ca: 'Unir-me amb codi',
            en: 'Join with code',
          })}
          subtitle={pickLang(lang, {
            es: 'Introduce el código o enlace de una sala',
            ca: 'Introdueix el codi o enllaç d’una sala',
            en: 'Enter a room code or invite link',
          })}
        >
          <form onSubmit={handleJoinByCode} className="space-y-3">
            <StandardInput
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder={pickLang(lang, {
                es: 'Código de sala (ej. 4F8K)',
                ca: 'Codi de sala (ex. 4F8K)',
                en: 'Room code (e.g. 4F8K)',
              })}
              autoFocus
              className="font-mono uppercase tracking-wider"
            />
            <SecondaryButton
              type="submit"
              fullWidth
              size="lg"
              disabled={!roomCode.trim()}
            >
              <span>
                {pickLang(lang, { es: 'Unirme', ca: 'Unir-me', en: 'Join' })}
              </span>
              <ArrowRight className="w-4 h-4" />
            </SecondaryButton>
          </form>
        </BottomSheet>

        {/* Shared Settings Bottom Sheet */}
        <SettingsBottomSheet
          isOpen={showSettingsSheet}
          onClose={() => setShowSettingsSheet(false)}
          lang={lang}
          onChangeLang={onChangeLang}
          effectiveView={effectiveView}
          onToggleViewMode={onToggleViewMode}
          authUser={authUser}
          authLoading={authLoading}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onOpenTvPairLobby={onOpenTvPairLobby}
          onOpenLinkDevice={onOpenLinkDevice}
        />
      </div>
    </div>
  );
};
