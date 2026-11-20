import React from 'react';
import { RefreshCw } from 'lucide-react';
import { pickLang } from '../utils/i18n';
import { isChunkOrModuleLoadError } from '../utils/lazyWithRetry';
import { clearStaleCachesAndReload } from '../utils/versionSync';
import type { AppLanguage } from '../types';

interface State {
  hasError: boolean;
  message: string;
}

const CHUNK_RELOAD_GUARD_KEY = 'naim_chunk_reload_at';

function getBoundaryLang(): AppLanguage {
  try {
    const saved = localStorage.getItem('naim_lang');
    if (saved === 'ca' || saved === 'en' || saved === 'es' || saved === 'rif' || saved === 'zh') {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'es';
}

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: string;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  State
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const raw = error instanceof Error ? error.message : String(error);
    return { hasError: true, message: raw };
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: '' });
    }
  }

  componentDidCatch(error: unknown) {
    if (!isChunkOrModuleLoadError(error)) return;
    try {
      const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) || '0');
      const now = Date.now();
      if (!Number.isFinite(lastReloadAt) || now - lastReloadAt > 15_000) {
        sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(now));
        void clearStaleCachesAndReload();
      }
    } catch {
      // ignore sessionStorage blocks in restricted WebViews
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isQuota = this.state.message.toLowerCase().includes('quota exceeded');
    const isChunk = isChunkOrModuleLoadError(this.state.message);
    const lang = getBoundaryLang();

    return (
      <div className="min-h-full w-full bg-[#07080C] text-[#F4F5F8] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl bg-[#11131B] border border-white/12 p-6 text-center space-y-4">
          <h2 className="font-display font-bold text-lg text-white">
            {isQuota
              ? pickLang(lang, {
                  es: 'Límite diario de sincronización en la nube alcanzado',
                  ca: 'Límit diari de sincronització al núvol assolit',
                  en: 'Daily cloud sync quota reached',
                  rif: 'Yewweḍ lḥedd n wass n usinkronizi di lklud',
                })
              : isChunk
                ? pickLang(lang, {
                    es: 'Actualizando módulos de RiffanTV',
                    ca: 'Actualitzant mòduls de RiffanTV',
                    en: 'Updating RiffanTV modules',
                    rif: 'La yettbeddal RiffanTV',
                  })
                : pickLang(lang, {
                    es: 'Se produjo una interrupción temporal',
                    ca: "S'ha produït una interrupció temporal",
                    en: 'A temporary interruption occurred',
                    rif: 'Yella yiwen lmuṣkil d amecṭuḥ',
                  })}
          </h2>
          <p className="text-xs sm:text-sm text-[#A9AEBE] leading-relaxed">
            {isQuota
              ? pickLang(lang, {
                  es: 'La cuota gratuita diaria de lectura/escritura en la nube se restablecerá mañana. Tus salas en vivo y reproducción siguen operativas.',
                  ca: 'La quota gratuïta diària de lectura/escriptura al núvol es restablirà demà. Les teves sales en directe i reproducció continuen operatives.',
                  en: 'The free daily cloud quota will reset tomorrow. Live rooms and playback continue working normally.',
                  rif: 'Lḥedd n wass ad yekkes tiwecca. Tixxamin n direkt d lvidyu xeddmen mliḥ.',
                })
              : pickLang(lang, {
                  es: 'Recarga la sala para continuar viendo contenido con normalidad.',
                  ca: 'Recarrega la sala per continuar veient contingut amb normalitat.',
                  en: 'Reload the room to continue watching normally.',
                  rif: 'Ɛawed cɛel taxxamt bac ad tkemmleḍ ad texzreḍ.',
                })}
          </p>
          {this.state.message && (
            <p className="text-[11px] font-mono text-zinc-400 bg-black/30 border border-white/8 rounded-xl px-3 py-2 break-words">
              {this.state.message.slice(0, 180)}
            </p>
          )}
          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="min-h-[44px] px-4 rounded-2xl bg-white/8 hover:bg-white/14 border border-white/12 text-xs sm:text-sm font-semibold text-zinc-200 inline-flex items-center gap-2 cursor-pointer"
            >
              <span>
                {pickLang(lang, {
                  es: 'Reintentar',
                  ca: 'Reintentar',
                  en: 'Retry',
                  rif: 'Ɛawed jerrab',
                })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void clearStaleCachesAndReload({ force: true })}
              className="min-h-[44px] px-5 rounded-2xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs sm:text-sm font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>
                {pickLang(lang, {
                  es: 'Recargar RiffanTV',
                  ca: 'Recarregar RiffanTV',
                  en: 'Reload RiffanTV',
                  rif: 'Ɛawed cɛel RiffanTV',
                })}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
