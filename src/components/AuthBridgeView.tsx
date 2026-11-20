import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  KeyRound,
  Loader2,
  LogIn,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { isAndroidApkWebView, saveStoredCloudSession } from '../utils/cloudSession';
import { triggerApkDownload } from '../utils/apkDownload';
import { NaimBrandLogo } from './NaimBrandLogo';
import { PrimaryButton, SecondaryButton } from './ui/DesignSystem';
import {
  checkGoogleRedirectSignInResult,
  signInWithGoogleAccountDetailed,
  subscribeAuthState,
} from '../services/userCloudSync';
import { auth } from '../firebase';

interface AuthBridgeViewProps {
  sessionId: string;
  lang: AppLanguage;
  onExitBridge: () => void;
}

export const AuthBridgeView: React.FC<AuthBridgeViewProps> = ({
  sessionId,
  lang,
  onExitBridge,
}) => {
  const isApkWebView = isAndroidApkWebView();
  const [fbUser, setFbUser] = useState<User | null>(() =>
    auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null
  );
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'completing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [webviewBlocked, setWebviewBlocked] = useState<boolean>(isApkWebView);
  const [copiedLink, setCopiedLink] = useState(false);
  const onExitBridgeRef = useRef(onExitBridge);
  onExitBridgeRef.current = onExitBridge;

  const chromeBridgeUrl =
    typeof window !== 'undefined' && sessionId
      ? `${window.location.origin}/auth-bridge?session=${encodeURIComponent(sessionId)}`
      : '';

  const completeBridgeWithUser = async (user: User) => {
    if (!sessionId) {
      setStatus('error');
      setErrorMsg(
        pickLang(lang, {
          es: 'Falta el identificador de sesión. Vuelve a pulsar «Entrar con Google» desde la app.',
          ca: 'Falta l’identificador de sessió. Torna a prémer «Entrar amb Google» des de l’app.',
          en: 'Missing session ID. Tap Sign in with Google from the app again.',
        })
      );
      return;
    }

    setStatus('completing');
    setErrorMsg(null);
    try {
      const idToken = await user.getIdToken(true);
      const res = await fetch('/api/account/bridge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, idToken }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'Bridge failed');
      }
      triggerHaptic('success');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMsg(
        err instanceof Error
          ? err.message
          : pickLang(lang, {
              es: 'No se pudo completar la vinculación con la app.',
              ca: 'No s’ha pogut completar la vinculació amb l’app.',
              en: 'Could not complete linking with the app.',
            })
      );
    }
  };

  useEffect(() => {
    let active = true;
    const unsub = subscribeAuthState((u) => {
      if (!active) return;
      const verified = u && !u.isAnonymous ? u : null;
      setFbUser(verified);
    });

    if (!isApkWebView) {
      void checkGoogleRedirectSignInResult().then((res) => {
        if (!active) return;
        if (res.user && !res.user.isAnonymous) {
          setFbUser(res.user);
          void completeBridgeWithUser(res.user);
        } else if (res.errorCode) {
          if (
            res.errorCode === 'auth/webview-disallowed' ||
            res.errorCode.includes('disallowed_useragent')
          ) {
            setWebviewBlocked(true);
          }
          setStatus('error');
          setErrorMsg(`${res.errorCode}${res.hostname ? ` (${res.hostname})` : ''}`);
        }
      });
    }

    return () => {
      active = false;
      unsub();
    };
  }, [sessionId, isApkWebView]); // eslint-disable-line react-hooks/exhaustive-deps

  // If opened inside the Android APK WebView (e.g. older APK before <queries> fix),
  // keep polling session status so completing sign-in in external Chrome logs this APK in automatically!
  useEffect(() => {
    if (!webviewBlocked || !sessionId || status === 'done') return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/account/bridge/status/${encodeURIComponent(sessionId)}`);
        const data = (await res.json()) as {
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
          triggerHaptic('success');
          setStatus('done');
          window.setTimeout(() => {
            onExitBridgeRef.current();
          }, 700);
        }
      } catch {
        // retry on next tick
      }
    };
    const timer = window.setInterval(poll, 1800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [webviewBlocked, sessionId, status]);

  const handleGoogleLogin = async () => {
    triggerHaptic('medium');
    setStatus('authenticating');
    setErrorMsg(null);
    const res = await signInWithGoogleAccountDetailed({ allowRedirectFallback: true });
    if (res.redirecting) return;
    if (res.user && !res.user.isAnonymous) {
      await completeBridgeWithUser(res.user);
      return;
    }
    setStatus('error');
    if (
      res.errorCode === 'auth/webview-disallowed' ||
      res.errorCode?.includes('disallowed_useragent')
    ) {
      setWebviewBlocked(true);
      setErrorMsg(null);
      return;
    }
    if (res.errorCode === 'auth/unauthorized-domain') {
      setErrorMsg(
        pickLang(lang, {
          es: `El dominio «${res.hostname}» no está autorizado en Firebase Auth.`,
          ca: `El domini «${res.hostname}» no està autoritzat a Firebase Auth.`,
          en: `Domain «${res.hostname}» is not authorized in Firebase Auth.`,
        })
      );
    } else if (res.errorCode) {
      setErrorMsg(
        pickLang(lang, {
          es: `No se pudo iniciar sesión (${res.errorCode}).`,
          ca: `No s’ha pogut iniciar sessió (${res.errorCode}).`,
          en: `Could not sign in (${res.errorCode}).`,
        })
      );
    } else {
      setStatus('idle');
    }
  };

  const handleCopyBridgeLink = async () => {
    if (!chromeBridgeUrl) return;
    try {
      await navigator.clipboard.writeText(chromeBridgeUrl);
      triggerHaptic('light');
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-dvh w-full bg-[#07080C] text-[#F4F5F8] flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-md rounded-3xl bg-[#10121B] border border-white/[0.08] shadow-[0_30px_90px_rgba(0,0,0,0.85)] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <NaimBrandLogo variant="full" size={32} />
          <span className="text-[11px] font-mono text-zinc-400 tracking-wider uppercase">
            Chrome Bridge
          </span>
        </div>

        {status === 'done' ? (
          <div className="space-y-4 text-center py-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h1 className="font-display text-xl font-bold text-white">
                {pickLang(lang, {
                  es: '¡Cuenta vinculada con éxito!',
                  ca: 'Compte vinculat amb èxit!',
                  en: 'Account linked successfully!',
                })}
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {pickLang(lang, {
                  es: 'Ya puedes cerrar esta pestaña y volver a la app de RiffanTV; tu sesión, listas e historial se activarán al instante.',
                  ca: 'Ja pots tancar aquesta pestanya i tornar a l’app de RiffanTV; la teva sessió, llistes i historial s’activaran a l’instant.',
                  en: 'You can return to the RiffanTV Android app now; your account and watchlist are syncing automatically.',
                })}
              </p>
            </div>
            <SecondaryButton onClick={onExitBridge} fullWidth>
              <span>
                {pickLang(lang, {
                  es: 'Abrir RiffanTV ahora',
                  ca: 'Obrir RiffanTV ara',
                  en: 'Open RiffanTV now',
                })}
              </span>
            </SecondaryButton>
          </div>
        ) : webviewBlocked ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-[#BF94FF]">
                <Smartphone className="w-4 h-4" />
                <span>
                  {pickLang(lang, {
                    es: 'Puente Chrome desde WebView Android',
                    ca: 'Pont Chrome des de WebView Android',
                    en: 'Android WebView Chrome Bridge',
                  })}
                </span>
              </div>
              <h1 className="font-display text-xl font-bold text-white leading-tight">
                {pickLang(lang, {
                  es: 'Abre este enlace en Chrome para iniciar sesión',
                  ca: 'Obre aquest enllaç a Chrome per iniciar sessió',
                  en: 'Open this link in Chrome to sign in',
                })}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {pickLang(lang, {
                  es: 'Google bloquea el login dentro de WebViews. Copia este enlace, ábrelo en Google Chrome oficial y vuelve aquí: tu sesión se activará automáticamente.',
                  ca: 'Google bloqueja l’accés dins WebViews. Copia aquest enllaç, obre’l a Google Chrome oficial i torna aquí: la teva sessió s’activarà automàticament.',
                  en: 'Google blocks sign-in inside embedded WebViews. Copy this link, open it in official Chrome, and return here — your session will activate automatically.',
                })}
              </p>
            </div>

            {sessionId && (
              <div className="rounded-2xl bg-[#9146FF]/12 border border-[#9146FF]/35 p-3.5 flex items-center gap-3 text-xs text-zinc-100">
                <Loader2 className="w-4 h-4 animate-spin text-[#BF94FF] shrink-0" />
                <span>
                  {pickLang(lang, {
                    es: 'Esperando confirmación desde Chrome en tiempo real…',
                    ca: 'Esperant confirmació des de Chrome en temps real…',
                    en: 'Listening for Chrome sign-in confirmation…',
                  })}
                </span>
              </div>
            )}

            {chromeBridgeUrl && (
              <PrimaryButton onClick={() => void handleCopyBridgeLink()} fullWidth>
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>
                  {copiedLink
                    ? pickLang(lang, {
                        es: '¡Enlace copiado! Pégalo en Chrome',
                        ca: 'Enllaç copiat! Enganxa’l a Chrome',
                        en: 'Link copied! Paste in Chrome',
                      })
                    : pickLang(lang, {
                        es: 'Copiar enlace para Chrome',
                        ca: 'Copiar enllaç per a Chrome',
                        en: 'Copy link for Chrome',
                      })}
                </span>
              </PrimaryButton>
            )}

            <div className="grid grid-cols-1 gap-2">
              <SecondaryButton
                onClick={() => void triggerApkDownload('/api/download/apk', 'RIFFAN-TV.apk')}
                fullWidth
              >
                <Download className="w-4 h-4" />
                <span>
                  {pickLang(lang, {
                    es: 'Actualizar APK (abre Chrome directo)',
                    ca: 'Actualitzar APK (obre Chrome directe)',
                    en: 'Update APK (auto-launches Chrome)',
                  })}
                </span>
              </SecondaryButton>

              <SecondaryButton onClick={onExitBridge} fullWidth>
                <KeyRound className="w-4 h-4" />
                <span>
                  {pickLang(lang, {
                    es: 'Volver a la app / usar código 6 dígitos',
                    ca: 'Tornar a l’app / fer servir codi 6 dígits',
                    en: 'Back to app / use 6-char code',
                  })}
                </span>
              </SecondaryButton>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-[#BF94FF]">
                <Smartphone className="w-4 h-4" />
                <span>
                  {pickLang(lang, {
                    es: 'Vinculación segura con tu app Android',
                    ca: 'Vinculació segura amb la teva app Android',
                    en: 'Secure Android app sign-in bridge',
                  })}
                </span>
              </div>
              <h1 className="font-display text-xl font-bold text-white leading-tight">
                {pickLang(lang, {
                  es: 'Inicia sesión con Google en Chrome',
                  ca: 'Inicia sessió amb Google a Chrome',
                  en: 'Sign in with Google in Chrome',
                })}
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {pickLang(lang, {
                  es: 'Google protege el acceso desde Chrome oficial y envía una llave cifrada temporal a tu aplicación APK sin guardar contraseñas.',
                  ca: 'Google protegeix l’accés des de Chrome oficial i envia una clau xifrada temporal a la teva app APK sense desar contrasenyes.',
                  en: 'Google authenticates safely in official Chrome and sends an encrypted session key back to your APK.',
                })}
              </p>
            </div>

            {errorMsg && (
              <div className="rounded-2xl bg-rose-500/12 border border-rose-500/30 p-3.5 flex items-start gap-2.5 text-xs text-rose-200 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {fbUser ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center gap-3">
                  {fbUser.photoURL ? (
                    <img
                      src={fbUser.photoURL}
                      alt={fbUser.displayName || 'Google'}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#9146FF]/25 flex items-center justify-center text-white font-bold">
                      {(fbUser.displayName || fbUser.email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">
                      {fbUser.displayName || 'Google User'}
                    </div>
                    <div className="text-xs text-zinc-400 truncate">{fbUser.email}</div>
                  </div>
                  <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>

                <PrimaryButton
                  onClick={() => void completeBridgeWithUser(fbUser)}
                  loading={status === 'completing'}
                  fullWidth
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {pickLang(lang, {
                      es: 'Autorizar y volver al APK',
                      ca: 'Autoritzar i tornar a l’APK',
                      en: 'Authorize & return to APK',
                    })}
                  </span>
                </PrimaryButton>

                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  className="w-full py-2 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {pickLang(lang, {
                    es: 'Usar otra cuenta de Google',
                    ca: 'Fer servir un altre compte de Google',
                    en: 'Use another Google account',
                  })}
                </button>
              </div>
            ) : (
              <PrimaryButton
                onClick={() => void handleGoogleLogin()}
                loading={status === 'authenticating' || status === 'completing'}
                fullWidth
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {pickLang(lang, {
                    es: 'Continuar con Google',
                    ca: 'Continuar amb Google',
                    en: 'Continue with Google',
                  })}
                </span>
              </PrimaryButton>
            )}

            {(status === 'authenticating' || status === 'completing') && (
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#BF94FF]" />
                <span>
                  {pickLang(lang, {
                    es: 'Validando credenciales…',
                    ca: 'Validant credencials…',
                    en: 'Validating credentials…',
                  })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
