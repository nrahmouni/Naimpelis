import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import {
  isAndroidApkWebView,
  isEmbeddedIframe,
  saveStoredCloudSession,
} from '../utils/cloudSession';
import { studioFetch } from '../utils/studioApi';
import { triggerApkDownload } from '../utils/apkDownload';
import { signInWithGoogleAccountDetailed } from '../services/userCloudSync';
import {
  BottomSheet,
  PrimaryButton,
  SecondaryButton,
  StandardInput,
} from './ui/DesignSystem';

export interface GoogleAuthModalContext {
  isOpen: boolean;
  errorCode?: string | null;
  hostname?: string | null;
  initialTab?: 'google' | 'code';
}

interface GoogleAuthModalProps {
  context: GoogleAuthModalContext;
  onClose: () => void;
  lang: AppLanguage;
  authUser: User | null;
}

export const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({
  context,
  onClose,
  lang,
  authUser,
}) => {
  const { isOpen, errorCode, hostname, initialTab } = context;
  const isApk = isAndroidApkWebView();
  const inIframe = isEmbeddedIframe();
  const activeHostname =
    hostname || (typeof window !== 'undefined' ? window.location.hostname : '');

  const [tab, setTab] = useState<'google' | 'code'>(initialTab || 'google');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);

  // Chrome OAuth Bridge state
  const [bridgeSessionId, setBridgeSessionId] = useState<string | null>(null);
  const [bridgePolling, setBridgePolling] = useState(false);
  const [copiedBridgeUrl, setCopiedBridgeUrl] = useState(false);

  // 6-Char Cloud Link Code state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [claimCodeInput, setClaimCodeInput] = useState('');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      setBridgeSessionId(null);
      setBridgePolling(false);
      setFeedback(null);
      setGeneratedCode(null);
      return;
    }
    setTab(initialTab || (authUser ? 'code' : 'google'));
    setFeedback(null);
  }, [isOpen, initialTab, authUser]);

  // Poll /api/account/bridge/status/:sessionId while APK awaits Chrome sign-in
  useEffect(() => {
    if (!isOpen || !bridgeSessionId || !bridgePolling) return;
    let active = true;

    const checkBridge = async () => {
      try {
        const res = await fetch(
          `/api/account/bridge/status/${encodeURIComponent(bridgeSessionId)}`
        );
        const data = (await res.json()) as {
          ok?: boolean;
          status?: 'pending' | 'completed' | 'expired';
          cloudToken?: string;
          user?: { uid: string; email: string; name?: string; picture?: string };
        };
        if (!active) return;

        if (data.status === 'completed' && data.cloudToken && data.user) {
          saveStoredCloudSession({
            uid: data.user.uid,
            email: data.user.email,
            displayName: data.user.name || 'Cineasta',
            photoURL: data.user.picture,
            cloudToken: data.cloudToken,
            linkedAt: Date.now(),
            method: 'bridge',
          });
          setBridgePolling(false);
          triggerHaptic('success');
          onCloseRef.current();
        } else if (data.status === 'expired') {
          setBridgePolling(false);
          setFeedback(
            pickLang(lang, {
              es: 'La sesión expiró. Pulsa de nuevo para abrir Chrome.',
              ca: 'La sessió ha caducat. Prem de nou per obrir Chrome.',
              en: 'Session expired. Tap again to open Chrome.',
            })
          );
        }
      } catch {
        // retry on next tick
      }
    };

    const timer = window.setInterval(checkBridge, 1800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isOpen, bridgeSessionId, bridgePolling, lang]);

  const handleStartChromeBridge = async () => {
    triggerHaptic('medium');
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/account/bridge/start', { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; sessionId?: string };
      if (!data?.sessionId) throw new Error('bridge_start_failed');
      setBridgeSessionId(data.sessionId);
      setBridgePolling(true);

      const bridgeUrl = `${window.location.origin}/auth-bridge?session=${encodeURIComponent(
        data.sessionId
      )}&open_in_chrome=1`;

      // Inside APK WebView, NaimWebViewClient intercepts `open_in_chrome=1` to launch Chrome externally
      window.location.href = bridgeUrl;
    } catch {
      setFeedback(
        pickLang(lang, {
          es: 'No se pudo iniciar el puente con Chrome. Usa un código de 6 dígitos.',
          ca: 'No s’ha pogut iniciar el pont amb Chrome. Fes servir un codi de 6 dígits.',
          en: 'Could not start Chrome bridge. Try a 6-character link code instead.',
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTryRedirectSignIn = async () => {
    triggerHaptic('medium');
    setBusy(true);
    setFeedback(null);
    const res = await signInWithGoogleAccountDetailed({ preferRedirect: true });
    setBusy(false);
    if (res.redirecting) return;
    if (res.user) {
      onClose();
      return;
    }
    if (res.errorCode) {
      setFeedback(
        pickLang(lang, {
          es: `No se pudo iniciar por redirección (${res.errorCode}). Usa el código de 6 caracteres si estás en vista embebida.`,
          ca: `No s’ha pogut iniciar per redirecció (${res.errorCode}). Fes servir el codi de 6 caràcters.`,
          en: `Redirect sign-in failed (${res.errorCode}). Use the 6-character link code below.`,
        })
      );
    }
  };

  const handleGenerateLinkCode = async () => {
    triggerHaptic('medium');
    setBusy(true);
    setFeedback(null);
    try {
      const res = await studioFetch<{ ok: boolean; code: string }>('/api/account/link-code', {
        method: 'POST',
      });
      setGeneratedCode(res.code);
      triggerHaptic('success');
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : pickLang(lang, {
              es: 'No se pudo generar el código.',
              ca: 'No s’ha pogut generar el codi.',
              en: 'Could not generate link code.',
            })
      );
    } finally {
      setBusy(false);
    }
  };

  const handleClaimLinkCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = claimCodeInput
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (clean.length < 4) return;
    triggerHaptic('medium');
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/account/link-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        cloudToken?: string;
        user?: { uid: string; email: string; name?: string; picture?: string };
      };
      if (!res.ok || !data.cloudToken || !data.user) {
        throw new Error(data.error || 'Código inválido o caducado');
      }
      saveStoredCloudSession({
        uid: data.user.uid,
        email: data.user.email,
        displayName: data.user.name || 'Cineasta',
        photoURL: data.user.picture,
        cloudToken: data.cloudToken,
        linkedAt: Date.now(),
        method: 'code',
      });
      triggerHaptic('success');
      setClaimCodeInput('');
      onClose();
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : pickLang(lang, {
              es: 'Código inválido o caducado.',
              ca: 'Codi invàlid o caducat.',
              en: 'Invalid or expired code.',
            })
      );
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, which: 'host' | 'code' | 'bridge') => {
    try {
      await navigator.clipboard.writeText(text);
      triggerHaptic('light');
      if (which === 'host') {
        setCopiedHost(true);
        window.setTimeout(() => setCopiedHost(false), 1800);
      } else if (which === 'bridge') {
        setCopiedBridgeUrl(true);
        window.setTimeout(() => setCopiedBridgeUrl(false), 2000);
      } else {
        setCopiedCode(true);
        window.setTimeout(() => setCopiedCode(false), 1800);
      }
    } catch {
      // ignore
    }
  };

  const isUnauthorizedDomain = errorCode === 'auth/unauthorized-domain';
  const isPopupBlocked =
    errorCode === 'auth/popup-blocked' ||
    errorCode === 'auth/operation-not-supported-in-this-environment';

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-md"
      icon={<ShieldCheck className="w-5 h-5" />}
      title={
        authUser
          ? pickLang(lang, {
              es: 'Vincular otro dispositivo',
              ca: 'Vincular un altre dispositiu',
              en: 'Link another device',
            })
          : pickLang(lang, {
              es: 'Acceso Google & Cloud',
              ca: 'Accés Google i Cloud',
              en: 'Google & Cloud Access',
            })
      }
      subtitle={pickLang(lang, {
        es: 'Sincroniza historial, Mi Lista, amigos y salas entre móvil, PWA y APK',
        ca: 'Sincronitza historial, La Meva Llista, amics i sales entre mòbil, PWA i APK',
        en: 'Sync history, Watchlist, friends & rooms across phone, PWA and APK',
      })}
    >
      <div className="space-y-4">
        {!authUser && (
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setTab('google')}
              className={`min-h-10 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === 'google'
                  ? 'bg-[#9146FF] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {isApk
                ? pickLang(lang, { es: 'Puente Chrome', ca: 'Pont Chrome', en: 'Chrome Bridge' })
                : pickLang(lang, { es: 'Acceso Google', ca: 'Accés Google', en: 'Google Sign-In' })}
            </button>
            <button
              type="button"
              onClick={() => setTab('code')}
              className={`min-h-10 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === 'code'
                  ? 'bg-[#9146FF] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {pickLang(lang, { es: 'Código 6 dígitos', ca: 'Codi 6 dígits', en: '6-Char Code' })}
            </button>
          </div>
        )}

        {tab === 'google' && !authUser && (
          <div className="space-y-3.5">
            {isApk ? (
              <>
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3.5 space-y-2 text-xs text-zinc-300 leading-relaxed">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Smartphone className="w-4 h-4 text-[#BF94FF]" />
                    <span>
                      {pickLang(lang, {
                        es: 'Inicio de sesión mediante Chrome',
                        ca: 'Inici de sessió mitjançant Chrome',
                        en: 'Sign in via Chrome browser',
                      })}
                    </span>
                  </div>
                  <p>
                    {pickLang(lang, {
                      es: 'Google bloquea el login dentro de WebViews. Pulsa abajo para autenticar en Chrome y volver automáticamente conectado.',
                      ca: 'Google bloqueja el login dins WebViews. Prem avall per autenticar a Chrome i tornar connectat automàticament.',
                      en: 'Google blocks embedded WebView logins. Tap below to authenticate in Chrome and return signed in automatically.',
                    })}
                  </p>
                </div>

                {bridgePolling && bridgeSessionId && (
                  <div className="rounded-2xl bg-[#9146FF]/12 border border-[#9146FF]/35 p-3.5 space-y-2.5 text-xs text-zinc-100">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-4 h-4 animate-spin text-[#BF94FF] shrink-0" />
                      <span>
                        {pickLang(lang, {
                          es: 'Esperando confirmación desde Chrome… Completa allí tu acceso Google.',
                          ca: 'Esperant confirmació des de Chrome… Completa allà el teu accés Google.',
                          en: 'Waiting for Chrome confirmation… Finish signing in there.',
                        })}
                      </span>
                    </div>
                    {typeof window !== 'undefined' && (
                      <button
                        type="button"
                        onClick={() =>
                          void copyText(
                            `${window.location.origin}/auth-bridge?session=${encodeURIComponent(
                              bridgeSessionId
                            )}`,
                            'bridge'
                          )
                        }
                        className="w-full min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] flex items-center justify-center gap-2 text-[11px] font-medium text-zinc-200 cursor-pointer"
                      >
                        {copiedBridgeUrl ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {copiedBridgeUrl
                            ? pickLang(lang, {
                                es: '¡Enlace copiado! Pégalo en Chrome',
                                ca: 'Enllaç copiat! Enganxa’l a Chrome',
                                en: 'Link copied! Paste in Chrome',
                              })
                            : pickLang(lang, {
                                es: 'Copiar enlace por si no abrió Chrome',
                                ca: 'Copiar enllaç si no s’ha obert Chrome',
                                en: 'Copy Chrome link if it didn’t open',
                              })}
                        </span>
                      </button>
                    )}
                  </div>
                )}

                <PrimaryButton onClick={() => void handleStartChromeBridge()} loading={busy} fullWidth>
                  <ExternalLink className="w-4 h-4" />
                  <span>
                    {bridgePolling
                      ? pickLang(lang, {
                          es: 'Reabrir Chrome',
                          ca: 'Tornar a obrir Chrome',
                          en: 'Reopen Chrome',
                        })
                      : pickLang(lang, {
                          es: 'Entrar con Google en Chrome',
                          ca: 'Entrar amb Google a Chrome',
                          en: 'Sign in via Chrome',
                        })}
                  </span>
                </PrimaryButton>

                <button
                  type="button"
                  onClick={() => void triggerApkDownload('/api/download/apk', 'RIFFAN-TV.apk')}
                  className="w-full py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {pickLang(lang, {
                    es: '¿No salta a Chrome automáticamente? Descargar APK v3.1.1 actualizado',
                    ca: 'No salta a Chrome automàticament? Descarrega APK v3.1.1 actualitzat',
                    en: 'Chrome doesn’t open automatically? Download updated APK v3.1.1',
                  })}
                </button>
              </>
            ) : (
              <>
                {isUnauthorizedDomain && (
                  <div className="rounded-2xl bg-amber-500/10 border border-amber-400/25 p-3.5 space-y-2.5 text-xs text-amber-100 leading-relaxed">
                    <div className="flex items-center gap-2 font-semibold text-amber-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>
                        {pickLang(lang, {
                          es: 'Dominio pendiente de autorizar en Firebase',
                          ca: 'Domini pendent d’autoritzar a Firebase',
                          en: 'Domain not authorized in Firebase Auth',
                        })}
                      </span>
                    </div>
                    <p className="text-zinc-300">
                      {pickLang(lang, {
                        es: 'Añade este dominio en Firebase Console → Authentication → Settings → Authorized domains, o entra ahora con un código de 6 dígitos desde tu móvil.',
                        ca: 'Afegeix aquest domini a Firebase Console → Authentication → Settings → Authorized domains, o entra ara amb un codi de 6 dígits.',
                        en: 'Add this hostname under Firebase Console → Authentication → Authorized domains, or sign in right now using a 6-character code.',
                      })}
                    </p>
                    {activeHostname && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/40 border border-white/[0.08]">
                        <code className="font-mono text-[11px] text-white truncate">
                          {activeHostname}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyText(activeHostname, 'host')}
                          className="text-[11px] font-semibold text-[#BF94FF] hover:text-white flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          {copiedHost ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedHost ? 'OK' : 'Copiar'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isPopupBlocked && (
                  <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3.5 text-xs text-zinc-300 leading-relaxed">
                    {pickLang(lang, {
                      es: 'El navegador bloqueó la ventana emergente de Google. Usa el acceso por redirección directa o abre la app en pestaña independiente.',
                      ca: 'El navegador ha bloquejat la finestra emergent de Google. Fes servir l’accés per redirecció directa.',
                      en: 'Popup was blocked by your browser. Use direct redirect sign-in or link via a 6-character code.',
                    })}
                  </div>
                )}

                {!inIframe && (
                  <PrimaryButton onClick={() => void handleTryRedirectSignIn()} loading={busy} fullWidth>
                    <LogIn className="w-4 h-4" />
                    <span>
                      {pickLang(lang, {
                        es: 'Continuar con redirección Google',
                        ca: 'Continuar amb redirecció Google',
                        en: 'Continue with Google Redirect',
                      })}
                    </span>
                  </PrimaryButton>
                )}

                {inIframe && (
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '/'}
                    target="_top"
                    className="w-full min-h-12 px-5 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>
                      {pickLang(lang, {
                        es: 'Abrir en pestaña completa para Google',
                        ca: 'Obrir en pestanya completa per a Google',
                        en: 'Open full tab for Google Sign-In',
                      })}
                    </span>
                  </a>
                )}

                <SecondaryButton onClick={() => setTab('code')} fullWidth>
                  <KeyRound className="w-4 h-4 text-[#BF94FF]" />
                  <span>
                    {pickLang(lang, {
                      es: 'Vincular con código de 6 dígitos',
                      ca: 'Vincular amb codi de 6 dígits',
                      en: 'Link with 6-character code',
                    })}
                  </span>
                </SecondaryButton>
              </>
            )}
          </div>
        )}

        {(tab === 'code' || Boolean(authUser)) && (
          <div className="space-y-4">
            {authUser ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {pickLang(lang, {
                    es: 'Genera un código temporal de un solo uso para iniciar tu misma cuenta en el APK Android, Smart TV u otro navegador al instante.',
                    ca: 'Genera un codi temporal d’un sol ús per iniciar el teu compte a l’APK Android, Smart TV o un altre navegador.',
                    en: 'Generate a one-time 6-character code to link your signed-in account on Android APK, Smart TV, or another browser.',
                  })}
                </p>

                {generatedCode ? (
                  <div className="p-4 rounded-2xl bg-white/[0.04] border border-[#9146FF]/40 text-center space-y-2.5">
                    <div className="text-[11px] text-zinc-400 uppercase tracking-wider">
                      {pickLang(lang, {
                        es: 'Código válido durante 10 minutos',
                        ca: 'Codi vàlid durant 10 minuts',
                        en: 'Valid for 10 minutes',
                      })}
                    </div>
                    <div className="font-mono text-3xl font-bold tracking-[0.35em] text-white select-all">
                      {generatedCode}
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <SecondaryButton
                        onClick={() => void copyText(generatedCode, 'code')}
                        className="!min-h-10 !px-4"
                      >
                        {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        <span>
                          {copiedCode
                            ? pickLang(lang, { es: 'Copiado', ca: 'Copiat', en: 'Copied' })
                            : pickLang(lang, { es: 'Copiar código', ca: 'Copiar codi', en: 'Copy code' })}
                        </span>
                      </SecondaryButton>
                      <button
                        type="button"
                        onClick={() => void handleGenerateLinkCode()}
                        className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <PrimaryButton onClick={() => void handleGenerateLinkCode()} loading={busy} fullWidth>
                    <KeyRound className="w-4 h-4" />
                    <span>
                      {pickLang(lang, {
                        es: 'Generar código de vinculación',
                        ca: 'Generar codi de vinculació',
                        en: 'Generate link code',
                      })}
                    </span>
                  </PrimaryButton>
                )}
              </div>
            ) : (
              <form onSubmit={(e) => void handleClaimLinkCode(e)} className="space-y-3">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {pickLang(lang, {
                    es: 'Abre RiffanTV en un dispositivo donde ya hayas entrado con Google → Perfil / Ajustes → «Vincular dispositivo» e introduce el código aquí.',
                    ca: 'Obre RiffanTV en un dispositiu on ja hagis entrat amb Google → Perfil → «Vincular dispositiu» i introdueix el codi aquí.',
                    en: 'Open RiffanTV where you are signed in with Google → Profile → Link Device and enter the 6-character code here.',
                  })}
                </p>
                <StandardInput
                  value={claimCodeInput}
                  onChange={(e) => setClaimCodeInput(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="K8P4M2"
                  maxLength={6}
                  className="font-mono text-center text-lg tracking-[0.3em] uppercase"
                />
                <PrimaryButton
                  type="submit"
                  loading={busy}
                  disabled={claimCodeInput.trim().length < 4}
                  fullWidth
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {pickLang(lang, {
                      es: 'Vincular cuenta ahora',
                      ca: 'Vincular compte ara',
                      en: 'Link account now',
                    })}
                  </span>
                </PrimaryButton>
              </form>
            )}
          </div>
        )}

        {feedback && (
          <div className="rounded-2xl bg-rose-500/12 border border-rose-500/30 px-3.5 py-2.5 text-xs text-rose-200 leading-relaxed">
            {feedback}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
