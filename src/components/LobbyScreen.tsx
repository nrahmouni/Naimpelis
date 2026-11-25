import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { motion } from 'motion/react';
import {
  Check,
  ChevronDown,
  Download,
  Settings,
  Shuffle,
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
import { usePWAInstall } from '../utils/usePWAInstall';
import { NaimBrandLogo } from './NaimBrandLogo';
import { FlagBadgeSvg, type FlagCode } from './ui/LanguageBadge';
import { EffectiveViewMode, getMonogramInitials } from './MobileViewportGuard';
import { useAppStore } from '../store/useAppStore';
import { useMusicStore } from '../store/useMusicStore';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { useBackInterceptor } from '../lib/backInterceptor';

const SettingsBottomSheet = lazyWithRetry(() =>
  import('./SettingsBottomSheet').then((m) => ({ default: m.SettingsBottomSheet }))
);
const PWAInstallOptionsSheet = lazyWithRetry(() =>
  import('./PWAInstallPrompt').then((m) => ({ default: m.PWAInstallOptionsSheet }))
);
const CinematicNebulaCanvas = lazyWithRetry(() =>
  import('./lobby/CinematicNebulaCanvas').then((m) => ({ default: m.CinematicNebulaCanvas }))
);
const SpotifyYtmImportModal = lazyWithRetry(() =>
  import('./music/SpotifyYtmImportModal').then((m) => ({ default: m.SpotifyYtmImportModal }))
);

function useStickyMount(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  return mounted || open;
}

interface LobbyScreenProps {
  initialProfile: StoredProfile;
  recentRooms?: RecentRoomEntry[];
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

const LANG_OPTIONS: Array<{
  code: AppLanguage;
  flag: FlagCode;
  short: string;
  label: string;
}> = [
  { code: 'es', flag: 'es', short: 'ES', label: 'Español' },
  { code: 'ca', flag: 'ca', short: 'CA', label: 'Català' },
  { code: 'en', flag: 'en', short: 'EN', label: 'English' },
  { code: 'rif', flag: 'rif', short: 'RIF', label: 'Tarifit' },
  { code: 'zh', flag: 'zh', short: 'ZH', label: '中文' },
];

const TV_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:shadow-[0_0_24px_rgba(124,58,237,0.85)]';

const AVATAR_GRADIENTS = [
  'from-[#7C3AED] to-[#4F46E5]',
  'from-[#8B5CF6] to-[#EC4899]',
  'from-[#6366F1] to-[#06B6D4]',
  'from-[#7C3AED] to-[#10B981]',
  'from-[#9333EA] to-[#2563EB]',
  'from-[#A855F7] to-[#E11D48]',
];

function getDynamicAvatarGradient(seedName: string): string {
  const s = (seedName || 'TV').trim();
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  initialProfile,
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
  const [name, setName] = useState(
    authUser?.displayName?.trim() ||
      (initialProfile.isCustomized ? initialProfile.name : '')
  );
  const [roomCode, setRoomCode] = useState('');
  const [accessTab, setAccessTab] = useState<'enter' | 'join'>('enter');
  const [shuffleSpins, setShuffleSpins] = useState(0);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showInstallSheet, setShowInstallSheet] = useState(false);

  const authNotice = useAppStore((s) => s.authNotice);
  const showMusicImportModal = useMusicStore((s) => s.showImportModal);
  const settingsLatch = useStickyMount(showSettingsSheet);
  const installLatch = useStickyMount(showInstallSheet);
  const musicImportLatch = useStickyMount(showMusicImportModal);
  const { isIOS, isAndroid } = usePWAInstall();
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const joinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(
      authUser?.displayName?.trim() ||
        (initialProfile.isCustomized ? initialProfile.name : '')
    );
  }, [authUser?.displayName, initialProfile.id, initialProfile.isCustomized, initialProfile.name]);

  useEffect(() => {
    if (!langMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLangMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [langMenuOpen]);

  useEffect(() => {
    if (accessTab !== 'join') return;
    const timer = window.setTimeout(() => {
      joinInputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [accessTab]);

  useBackInterceptor(langMenuOpen, 'lobby-lang-menu', () => setLangMenuOpen(false), {
    priority: 20,
  });

  useBackInterceptor(accessTab === 'join', 'lobby-join-tab', () => setAccessTab('enter'), {
    priority: 8,
  });

  const buildProfile = (): StoredProfile => {
    const trimmed = name.trim();
    if (!trimmed) {
      const randomCatalanName = generateRandomGuestName(initialProfile.name);
      return {
        id: initialProfile.id,
        name: randomCatalanName.slice(0, 24),
        avatar: initialProfile.avatar || '🎬',
        color: initialProfile.color || '#7C3AED',
        isCustomized: false,
      };
    }
    return {
      id: initialProfile.id,
      name: trimmed.slice(0, 24),
      avatar: initialProfile.avatar || '🎬',
      color: initialProfile.color || '#7C3AED',
      isCustomized: true,
    };
  };

  const handleCreateRoom = () => {
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
    const cleanCode = extractRoomCodeFromInput(roomCode);
    if (!cleanCode) return;
    const profile = buildProfile();
    triggerHaptic('success');
    setRoomCode('');
    onEnterRoom(cleanCode, profile);
  };

  const handleRandomName = () => {
    triggerHaptic('light');
    setShuffleSpins((n) => n + 1);
    setName(generateRandomGuestName(name));
  };

  const currentLangMeta =
    LANG_OPTIONS.find((item) => item.code === lang) || LANG_OPTIONS[0];
  const dynamicInitials = getMonogramInitials(name || initialProfile.name || 'TV');
  const dynamicAvatarGradient = getDynamicAvatarGradient(name || initialProfile.name || 'TV');

  return (
    <div className="h-dvh w-full bg-black text-white overflow-hidden relative flex flex-col select-none">
      {/* Custom 60fps Volumetric OLED Aurora & Prism Starlight Canvas */}
      <React.Suspense fallback={null}>
        <CinematicNebulaCanvas />
      </React.Suspense>

      <div
        className={`relative z-10 h-full w-full flex flex-col pt-safe pb-safe ${
          isFramedMobileOnPc
            ? 'max-w-[27rem] mx-auto border-x border-white/10 shadow-[0_0_120px_rgba(0,0,0,0.96)]'
            : ''
        }`}
      >
        {/* 1. Staggered Floating Header: Logo left, controls right */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 shrink-0"
        >
          <button
            type="button"
            data-tv-focusable="true"
            onClick={() => {
              triggerHaptic('light');
              onReplayIntro();
            }}
            className={`flex items-center min-h-[44px] py-1 px-1.5 -ml-1.5 rounded-2xl cursor-pointer text-left group whitespace-nowrap shrink-0 active:scale-95 transition-transform ${TV_FOCUS_CLASS}`}
            aria-label="Riffan TV"
          >
            <NaimBrandLogo variant="full" size={30} animated />
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {/* Control 1: Install PWA */}
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('light');
                setShowInstallSheet(true);
              }}
              aria-label={pickLang(lang, {
                es: 'Instalar aplicación',
                ca: 'Instal·lar aplicació',
                en: 'Install app',
                zh: '安装应用',
                rif: 'Sbedd app',
              })}
              title={pickLang(lang, {
                es: 'Instalar PWA / Smart TV',
                ca: 'Instal·lar PWA / Smart TV',
                en: 'Install PWA / Smart TV',
                zh: '安装 PWA / 智能电视',
                rif: 'Sbedd PWA / Smart TV',
              })}
              className={`min-h-[44px] min-w-[44px] rounded-2xl bg-[#0D0D12]/80 hover:bg-[#14141C] backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer active:scale-95 transition-all ${TV_FOCUS_CLASS}`}
            >
              <Download className="w-4 h-4 shrink-0" />
            </button>

            {/* Control 2: Compact Language Dropdown */}
            <div ref={langMenuRef} className="relative">
              <button
                type="button"
                data-tv-focusable="true"
                onClick={() => {
                  triggerHaptic('light');
                  setLangMenuOpen((v) => !v);
                }}
                aria-haspopup="listbox"
                aria-expanded={langMenuOpen}
                aria-label={pickLang(lang, {
                  es: 'Cambiar idioma',
                  ca: 'Canviar idioma',
                  en: 'Change language',
                  zh: '切换语言',
                  rif: 'Beddel tutlayt',
                })}
                className={`min-h-[44px] px-2.5 sm:px-3 rounded-2xl bg-[#0D0D12]/80 hover:bg-[#14141C] backdrop-blur-xl border border-white/[0.08] flex items-center gap-1.5 text-xs font-display font-bold text-white whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${TV_FOCUS_CLASS}`}
              >
                <FlagBadgeSvg code={currentLangMeta.flag} className="w-4 h-3 shrink-0" />
                <span>{currentLangMeta.short}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 ${
                    langMenuOpen ? 'rotate-180 text-white' : ''
                  }`}
                />
              </button>

              {langMenuOpen && (
                <div
                  role="listbox"
                  aria-label={pickLang(lang, {
                    es: 'Idiomas',
                    ca: 'Idiomes',
                    en: 'Languages',
                    zh: '语言',
                    rif: 'Tutlayin',
                  })}
                  className="absolute right-0 top-full mt-2 w-44 p-1.5 rounded-2xl bg-[#0D0D12]/96 backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.92)] z-50 space-y-0.5"
                >
                  {LANG_OPTIONS.map((opt) => {
                    const active = opt.code === lang;
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-tv-focusable="true"
                        onClick={() => {
                          triggerHaptic('light');
                          onChangeLang(opt.code);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full min-h-[40px] px-2.5 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold cursor-pointer active:scale-95 transition-all ${TV_FOCUS_CLASS} ${
                          active
                            ? 'bg-[#7C3AED] text-white'
                            : 'text-zinc-200 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <FlagBadgeSvg code={opt.flag} className="w-4 h-3 shrink-0" />
                          <span>{opt.label}</span>
                        </span>
                        <span className="text-[10px] font-mono opacity-75 shrink-0">
                          {opt.short}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Control 3: Settings */}
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                triggerHaptic('light');
                setShowSettingsSheet(true);
              }}
              aria-label={pickLang(lang, {
                es: 'Ajustes',
                ca: 'Ajustos',
                en: 'Settings',
                zh: '设置',
                rif: 'Iseɣzanen',
              })}
              className={`min-h-[44px] min-w-[44px] rounded-2xl bg-[#0D0D12]/80 hover:bg-[#14141C] backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer active:scale-95 transition-all ${TV_FOCUS_CLASS}`}
            >
              <Settings className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </motion.header>

        {/* Centered Single-Viewport Stage */}
        <main className="flex-1 min-h-0 w-full max-w-[412px] sm:max-w-[440px] mx-auto px-4 flex flex-col justify-center gap-5 sm:gap-6">
          {/* 2. Staggered Editorial Headline */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <h1 className="font-display font-bold text-[2.35rem] sm:text-[2.85rem] leading-[1.03] tracking-[-0.035em] text-balance bg-gradient-to-b from-white via-[#FAF8FF] to-white/78 bg-clip-text text-transparent drop-shadow-[0_10px_32px_rgba(0,0,0,0.9)]">
              {pickLang(lang, {
                es: 'Cine y TV juntos.',
                ca: 'Cinema i TV junts.',
                en: 'Movies & TV together.',
                zh: '影视电视同步畅享。',
                rif: 'Ssinima d talfaza aked.',
              })}
            </h1>
          </motion.div>

          {/* 3. Unified OLED Obsidian Card (#0D0D12) */}
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-[26px] bg-[#0D0D12]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_28px_80px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.1)] p-4 sm:p-5 space-y-3"
          >
            {/* Top specular prism rim light */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#8B5CF6]/60 to-transparent"
            />

            {/* Sliding Mode Tabs: Entrar / Crear sala vs Unirse con código */}
            <div
              role="tablist"
              aria-label={pickLang(lang, {
                es: 'Modo de acceso',
                ca: "Mode d'accés",
                en: 'Access mode',
                zh: '进入模式',
                rif: 'Abriḍ n udef',
              })}
              className="grid grid-cols-2 p-1 rounded-2xl bg-black/70 border border-white/[0.08] gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={accessTab === 'enter'}
                data-tv-focusable="true"
                onClick={() => {
                  triggerHaptic('light');
                  setAccessTab('enter');
                }}
                className={`relative min-h-[40px] px-3 rounded-xl text-xs font-display font-bold transition-colors cursor-pointer active:scale-95 ${TV_FOCUS_CLASS} ${
                  accessTab === 'enter' ? 'text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {accessTab === 'enter' && (
                  <motion.span
                    layoutId="lobby-mode-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-[#7C3AED] shadow-[0_4px_14px_rgba(124,58,237,0.4)]"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">
                  {pickLang(lang, {
                    es: 'Entrar / Sala',
                    ca: 'Entrar / Sala',
                    en: 'Enter / Room',
                    zh: '进入 / 建房',
                    rif: 'Adef / Taxxamt',
                  })}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={accessTab === 'join'}
                data-tv-focusable="true"
                onClick={() => {
                  triggerHaptic('light');
                  setAccessTab('join');
                }}
                className={`relative min-h-[40px] px-3 rounded-xl text-xs font-display font-bold transition-colors cursor-pointer active:scale-95 ${TV_FOCUS_CLASS} ${
                  accessTab === 'join' ? 'text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {accessTab === 'join' && (
                  <motion.span
                    layoutId="lobby-mode-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-[#7C3AED] shadow-[0_4px_14px_rgba(124,58,237,0.4)]"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">
                  {pickLang(lang, {
                    es: 'Tengo código',
                    ca: 'Tinc codi',
                    en: 'Join code',
                    zh: '输入房间码',
                    rif: 'Udef s lkod',
                  })}
                </span>
              </button>
            </div>

            {/* Unified Profile Input Bar with Live Gradient Initials Badge & Elastic 360° Shuffle */}
            <div className="flex items-center gap-2.5 p-1.5 rounded-2xl bg-black/60 border border-white/[0.08] focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-[#7C3AED]/35 transition-all">
              <div
                aria-hidden="true"
                className={`w-10 h-10 rounded-full bg-gradient-to-br ${dynamicAvatarGradient} border border-white/20 shadow-[0_4px_14px_rgba(124,58,237,0.35)] flex items-center justify-center font-display font-bold text-xs text-white shrink-0 tracking-tight transition-all duration-200`}
              >
                {dynamicInitials}
              </div>

              <input
                id="access-nickname"
                type="text"
                data-tv-focusable="true"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && accessTab === 'enter') {
                    e.preventDefault();
                    handleEnterSoloApp();
                  }
                }}
                aria-label={pickLang(lang, {
                  es: 'Tu apodo',
                  ca: 'El teu sobrenom',
                  en: 'Your nickname',
                  zh: '你的昵称',
                  rif: 'Isem-nnek',
                })}
                placeholder={pickLang(lang, {
                  es: 'Tu apodo',
                  ca: 'El teu sobrenom',
                  en: 'Your nickname',
                  zh: '你的昵称',
                  rif: 'Isem-nnek',
                })}
                maxLength={24}
                className="flex-1 min-w-0 h-10 px-1 bg-transparent text-[15px] font-medium text-white placeholder:text-zinc-500 outline-none"
              />

              <button
                type="button"
                data-tv-focusable="true"
                onClick={handleRandomName}
                aria-label={pickLang(lang, {
                  es: 'Nombre aleatorio',
                  ca: 'Nom aleatori',
                  en: 'Random name',
                  zh: '随机昵称',
                  rif: 'Isem amaynut',
                })}
                className={`w-10 h-10 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer active:scale-95 transition-all shrink-0 ${TV_FOCUS_CLASS}`}
              >
                <motion.span
                  animate={{ rotate: shuffleSpins * 360 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                  className="inline-flex items-center justify-center"
                >
                  <Shuffle className="w-4 h-4" />
                </motion.span>
              </button>
            </div>

            {accessTab === 'enter' ? (
              <div className="space-y-2.5 pt-0.5">
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={handleEnterSoloApp}
                  className={`nc-btn-shine w-full min-h-[48px] px-4 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-sm font-display font-bold text-white flex items-center justify-center cursor-pointer active:scale-95 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_12px_32px_-4px_rgba(124,58,237,0.55)] whitespace-nowrap ${TV_FOCUS_CLASS}`}
                >
                  {pickLang(lang, {
                    es: 'Entrar',
                    ca: 'Entrar',
                    en: 'Enter',
                    zh: '进入',
                    rif: 'Adef',
                  })}
                </button>

                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={handleCreateRoom}
                  className={`w-full min-h-[44px] px-4 rounded-2xl bg-white/[0.055] hover:bg-white/[0.11] border border-white/[0.08] text-sm font-display font-semibold text-zinc-100 flex items-center justify-center cursor-pointer active:scale-95 transition-all whitespace-nowrap ${TV_FOCUS_CLASS}`}
                >
                  {pickLang(lang, {
                    es: 'Crear sala',
                    ca: 'Crear sala',
                    en: 'Create room',
                    zh: '创建房间',
                    rif: 'Egg taxxamt',
                  })}
                </button>
              </div>
            ) : (
              <form onSubmit={handleJoinByCode} className="space-y-2.5 pt-0.5">
                <input
                  ref={joinInputRef}
                  type="text"
                  data-tv-focusable="true"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder={pickLang(lang, {
                    es: 'Código de sala (ej. ABCD)...',
                    ca: 'Codi de sala (ex. ABCD)...',
                    en: 'Room code (e.g. ABCD)...',
                    zh: '房间码...',
                    rif: 'Lkod n texxamt...',
                  })}
                  aria-label={pickLang(lang, {
                    es: 'Código de sala',
                    ca: 'Codi de sala',
                    en: 'Room code',
                    zh: '房间码',
                    rif: 'Lkod n texxamt',
                  })}
                  className={`w-full min-h-[46px] px-4 rounded-2xl bg-black/60 border border-white/[0.08] focus:border-[#7C3AED] text-sm font-mono uppercase tracking-wider text-white placeholder:text-zinc-500 placeholder:normal-case placeholder:tracking-normal outline-none ${TV_FOCUS_CLASS}`}
                />
                <button
                  type="submit"
                  data-tv-focusable="true"
                  disabled={!roomCode.trim()}
                  className={`nc-btn-shine w-full min-h-[48px] px-4 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] disabled:opacity-40 text-sm font-display font-bold text-white flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all shadow-[0_12px_32px_-4px_rgba(124,58,237,0.5)] ${TV_FOCUS_CLASS}`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {pickLang(lang, {
                      es: 'Unirme a la sala',
                      ca: 'Unir-me a la sala',
                      en: 'Join room',
                      zh: '加入房间',
                      rif: 'Udef ɣer texxamt',
                    })}
                  </span>
                </button>
              </form>
            )}

            {/* Clean Visual Separator before Google Account */}
            <div className="pt-2 border-t border-white/[0.08]">
              {!authUser || authUser.isAnonymous ? (
                <button
                  type="button"
                  data-tv-focusable="true"
                  disabled={authLoading}
                  onClick={() => {
                    triggerHaptic('medium');
                    void onSignIn();
                  }}
                  className={`w-full min-h-[44px] px-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-semibold text-zinc-200 hover:text-white flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 transition-all whitespace-nowrap ${TV_FOCUS_CLASS}`}
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                  <span>
                    {pickLang(lang, {
                      es: 'Continuar con Google',
                      ca: 'Continuar amb Google',
                      en: 'Continue with Google',
                      zh: '使用 Google 登录',
                      rif: 'Kemmel s Google',
                    })}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenLinkDevice?.();
                  }}
                  className={`w-full min-h-[44px] px-4 rounded-2xl bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-400/35 text-xs font-semibold text-emerald-200 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all ${TV_FOCUS_CLASS}`}
                >
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{authUser.displayName || 'Google'}</span>
                </button>
              )}
            </div>

            {!authUser && authNotice && (
              <p className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 text-[11px] text-zinc-300 text-center">
                {authNotice}
              </p>
            )}
          </motion.section>
        </main>

        <React.Suspense fallback={null}>
          {settingsLatch && (
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
          )}

          {installLatch && (
            <PWAInstallOptionsSheet
              isOpen={showInstallSheet}
              onClose={() => setShowInstallSheet(false)}
              lang={lang}
              isIOS={isIOS}
              isAndroid={isAndroid}
            />
          )}

          {musicImportLatch && <SpotifyYtmImportModal />}
        </React.Suspense>
      </div>
    </div>
  );
};
