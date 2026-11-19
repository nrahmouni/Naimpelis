import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Cloud,
  LogIn,
  LogOut,
  Monitor,
  Palette,
  Scale,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import type { AppLanguage, AppTheme } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { EffectiveViewMode } from '../MobileViewportGuard';
import { PWAInstallButton } from '../PWAInstallPrompt';
import { useThemeStore } from '../../store/useThemeStore';
import { FlagBadgeSvg, type FlagCode } from '../ui/LanguageBadge';
import { pickLang } from '../../utils/i18n';

interface ProfileAccountSettingsCardProps {
  lang: AppLanguage;
  onChangeLang?: (lang: AppLanguage) => void;
  onOpenLegalModal?: () => void;
  onOpenDesignSystem?: () => void;
  authUser: User | null;
  authLoading: boolean;
  displayName: string;
  watchHistoryCount: number;
  watchlistCount: number;
  favoriteChannelsCount: number;
  effectiveView: EffectiveViewMode;
  onToggleViewMode: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onUpdateDisplayName: (newName: string) => void;
  onClose: () => void;
}

export const ProfileAccountSettingsCard: React.FC<ProfileAccountSettingsCardProps> = ({
  lang,
  onChangeLang,
  onOpenLegalModal,
  onOpenDesignSystem,
  authUser,
  authLoading,
  displayName,
  watchHistoryCount,
  watchlistCount,
  favoriteChannelsCount,
  effectiveView,
  onToggleViewMode,
  onSignIn,
  onSignOut,
  onUpdateDisplayName,
  onClose,
}) => {
  const { theme, setTheme, density, setDensity, liteMode, setLiteMode } = useThemeStore();
  const [draftName, setDraftName] = useState(displayName);
  const [savedNameFeedback, setSavedNameFeedback] = useState(false);

  useEffect(() => {
    setDraftName(displayName);
  }, [displayName]);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    triggerHaptic('success');
    onUpdateDisplayName(trimmed.slice(0, 24));
    setSavedNameFeedback(true);
    setTimeout(() => setSavedNameFeedback(false), 1800);
  };

  return (
    <div className="rounded-2xl bg-white/[0.04] nc-specular-surface border border-white/[0.08] p-4 space-y-4">
      <form onSubmit={handleSaveName} className="space-y-2">
        <label className="block text-xs font-medium text-zinc-400">
          {pickLang(lang, {
            es: 'Tu nombre visible en sala',
            ca: 'El teu nom visible a la sala',
            en: 'Display name',
          })}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={24}
            className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-[#26262C] border border-white/12 focus:border-[#9146FF] text-base sm:text-xs text-white outline-none"
          />
          <button
            type="submit"
            className="h-11 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-xs font-semibold text-white shrink-0 cursor-pointer"
          >
            {savedNameFeedback
              ? pickLang(lang, { es: 'Guardado', ca: 'Desat', en: 'Saved' })
              : pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
          </button>
        </div>
      </form>

      {/* View Mode Toggle + PWA Install */}
      <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-white">
              {pickLang(lang, {
                es: 'Vista de la aplicación',
                ca: "Vista de l'aplicació",
                en: 'Application view',
              })}
            </div>
            <div className="text-[11px] text-zinc-400">
              {effectiveView === 'desktop'
                ? pickLang(lang, {
                    es: 'Actualmente en modo Escritorio',
                    ca: "Actualment en mode d'Escriptori",
                    en: 'Currently in Desktop mode',
                  })
                : pickLang(lang, {
                    es: 'Actualmente en modo Móvil',
                    ca: 'Actualment en mode Mòbil',
                    en: 'Currently in Mobile mode',
                  })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleViewMode();
            }}
            className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {effectiveView === 'desktop' ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-zinc-300" />
                <span>
                  {pickLang(lang, {
                    es: 'Ver como móvil',
                    ca: 'Veure com a mòbil',
                    en: 'Mobile view',
                  })}
                </span>
              </>
            ) : (
              <>
                <Monitor className="w-3.5 h-3.5 text-zinc-300" />
                <span>
                  {pickLang(lang, {
                    es: 'Ver como PC',
                    ca: 'Veure com a PC',
                    en: 'Desktop view',
                  })}
                </span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center justify-end">
          <PWAInstallButton lang={lang} />
        </div>
      </div>

      {/* Theme, Density, Lite Mode & Language Preferences */}
      <div className="pt-3 border-t border-white/[0.06] space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-white">
          <Palette className="w-4 h-4 text-[#BF94FF]" />
          <span>
            {pickLang(lang, {
              es: 'Apariencia, Rendimiento e Idioma',
              ca: 'Aparença, Rendiment i Idioma',
              en: 'Appearance, Performance & Language',
            })}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {(
            [
              {
                id: 'light',
                label: pickLang(lang, { es: 'Tema Claro', ca: 'Tema Clar', en: 'Light Theme', rif: 'Mod Acemlal', zh: '浅色主题' }),
              },
              {
                id: 'dark',
                label: pickLang(lang, { es: 'Tema Oscuro', ca: 'Tema Fosc', en: 'Dark Theme', rif: 'Mod Aberkan', zh: '深色主题' }),
              },
              {
                id: 'oled',
                label: pickLang(lang, { es: 'OLED Negro', ca: 'OLED Negre', en: 'OLED Black', rif: 'Aberkan OLED', zh: 'OLED 纯黑' }),
              },
              {
                id: 'soft-dark',
                label: pickLang(lang, { es: 'Noche Suave', ca: 'Nit Suau', en: 'Soft Night', rif: 'Iḍ Aḥlawan', zh: '柔和夜间' }),
              },
              {
                id: 'high-contrast',
                label: pickLang(lang, { es: 'Alto Contraste', ca: 'Alt Contrast', en: 'High Contrast', rif: 'Kontrast Ameqqran', zh: '高对比度' }),
              },
            ] as { id: AppTheme; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setTheme(opt.id);
              }}
              className={`min-h-9 px-2.5 rounded-xl text-[11px] font-semibold border cursor-pointer transition-colors ${
                theme === opt.id
                  ? 'bg-[#9146FF] text-white border-[#9146FF]'
                  : 'bg-[#26262C] hover:bg-white/[0.1] border-white/[0.08] text-zinc-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {(['comfortable', 'compact'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                className={`min-h-8 px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                  density === d
                    ? 'bg-[#9146FF] text-white border-[#9146FF]'
                    : 'bg-[#26262C] border-white/[0.08] text-zinc-300'
                }`}
              >
                {d === 'comfortable'
                  ? pickLang(lang, { es: 'Cómoda', ca: 'Còmoda', en: 'Comfortable', rif: 'Yewseɛ', zh: '宽松' })
                  : pickLang(lang, { es: 'Compacta', ca: 'Compacta', en: 'Compact', rif: 'Ameẓyan', zh: '紧凑' })}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setLiteMode(!liteMode)}
              className={`min-h-8 px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                liteMode
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                  : 'bg-[#26262C] border-white/[0.08] text-zinc-300'
              }`}
            >
              {pickLang(lang, {
                es: liteMode ? 'Lite: ON' : 'Lite: OFF',
                ca: liteMode ? 'Lite: ON' : 'Lite: OFF',
                en: liteMode ? 'Lite: ON' : 'Lite: OFF',
                rif: liteMode ? 'Afessas: Yexdem' : 'Afessas: Yensa',
                zh: liteMode ? '极速: 开启' : '极速: 关闭',
              })}
            </button>
          </div>
        </div>

        {/* 5-Language Switcher */}
        {onChangeLang && (
          <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
            <span className="block text-[11px] font-medium text-zinc-400">
              {pickLang(lang, {
                es: 'Idioma de la interfaz',
                ca: 'Idioma de la interfície',
                en: 'Interface language',
                rif: "Tutlayt n l'interface",
                zh: '界面语言',
              })}
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { id: 'es', flag: 'es' as FlagCode, label: 'ES', title: 'Español' },
                { id: 'ca', flag: 'ca' as FlagCode, label: 'CA', title: 'Català' },
                { id: 'en', flag: 'en' as FlagCode, label: 'EN', title: 'English' },
                { id: 'rif', flag: 'rif' as FlagCode, label: 'RIF', title: 'Tarifit' },
                { id: 'zh', flag: 'zh' as FlagCode, label: '中文', title: '中文' },
              ].map((l) => (
                <button
                  key={l.id}
                  type="button"
                  title={l.title}
                  aria-label={l.title}
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeLang(l.id as AppLanguage);
                  }}
                  className={`min-h-10 px-1.5 rounded-xl text-[11px] font-semibold border cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                    lang === l.id
                      ? 'bg-[#9146FF] text-white border-[#A970FF]/70 shadow-[0_4px_12px_rgba(145,70,255,0.35)]'
                      : 'bg-[#26262C] hover:bg-white/[0.1] border-white/[0.08] text-zinc-300'
                  }`}
                >
                  <FlagBadgeSvg code={l.flag} className="w-4 h-3 shrink-0" />
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats Snapshot + Design System / GDPR links */}
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between gap-2 text-[11px] text-zinc-300">
          <span>
            {pickLang(lang, {
              es: `🎬 ${watchHistoryCount} vistos · ♥ ${watchlistCount} guardados · ⭐ ${favoriteChannelsCount} canales`,
              ca: `🎬 ${watchHistoryCount} vistos · ♥ ${watchlistCount} desats · ⭐ ${favoriteChannelsCount} canals`,
              en: `🎬 ${watchHistoryCount} watched · ♥ ${watchlistCount} saved · ⭐ ${favoriteChannelsCount} channels`,
              rif: `🎬 ${watchHistoryCount} txzared · ♥ ${watchlistCount} iḥefḍen · ⭐ ${favoriteChannelsCount} lkanalat`,
              zh: `🎬 已看 ${watchHistoryCount} · ♥ 收藏 ${watchlistCount} · ⭐ 频道 ${favoriteChannelsCount}`,
            })}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenDesignSystem && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDesignSystem();
                }}
                className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 cursor-pointer"
                title={pickLang(lang, {
                  es: 'Sistema de diseño y tokens',
                  ca: 'Sistema de disseny i tokens',
                  en: 'Design System & Tokens',
                })}
                aria-label={pickLang(lang, {
                  es: 'Sistema de diseño y tokens',
                  ca: 'Sistema de disseny i tokens',
                  en: 'Design System & Tokens',
                })}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            )}
            {onOpenLegalModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLegalModal();
                }}
                className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 cursor-pointer"
                title={pickLang(lang, {
                  es: 'Privacidad y RGPD',
                  ca: 'Privacitat i RGPD',
                  en: 'Privacy & GDPR',
                })}
                aria-label={pickLang(lang, {
                  es: 'Privacidad y RGPD',
                  ca: 'Privacitat i RGPD',
                  en: 'Privacy & GDPR',
                })}
              >
                <Scale className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Google Cloud Account */}
      <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-medium text-white">
          <Cloud className={`w-4 h-4 ${authUser ? 'text-[#00F593]' : 'text-zinc-400'}`} />
          <span>
            {authUser
              ? pickLang(lang, {
                  es: 'Cuenta de Google vinculada',
                  ca: 'Compte de Google vinculat',
                  en: 'Google account linked',
                })
              : pickLang(lang, {
                  es: 'Sincronización con Google',
                  ca: 'Sincronització amb Google',
                  en: 'Google Cloud Sync',
                })}
          </span>
        </div>
        {!authLoading &&
          (authUser ? (
            <button
              type="button"
              onClick={async () => {
                triggerHaptic('light');
                await onSignOut();
                onClose();
              }}
              className="w-full min-h-[42px] px-4 rounded-xl bg-white/[0.05] hover:bg-rose-500/20 border border-white/10 text-xs font-semibold text-zinc-200 hover:text-rose-200 flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>
                {pickLang(lang, {
                  es: 'Cerrar sesión',
                  ca: 'Tancar sessió',
                  en: 'Sign out',
                })}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                triggerHaptic('medium');
                await onSignIn();
              }}
              className="w-full min-h-[42px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>
                {pickLang(lang, {
                  es: 'Iniciar sesión con Google',
                  ca: 'Iniciar sessió amb Google',
                  en: 'Sign in with Google',
                })}
              </span>
            </button>
          ))}
      </div>
    </div>
  );
};
