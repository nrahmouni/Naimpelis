import React from 'react';
import { RefreshCw } from 'lucide-react';
import { pickLang } from '../utils/i18n';
import type { AppLanguage } from '../types';

interface State {
  hasError: boolean;
  message: string;
}

function getBoundaryLang(): AppLanguage {
  try {
    const saved = localStorage.getItem('naim_lang');
    if (saved === 'ca' || saved === 'en' || saved === 'es') return saved;
  } catch {
    // ignore
  }
  return 'es';
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const raw = error instanceof Error ? error.message : String(error);
    return { hasError: true, message: raw };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isQuota = this.state.message.toLowerCase().includes('quota exceeded');
    const lang = getBoundaryLang();

    return (
      <div className="min-h-full w-full bg-[#0E0E10] text-[#EFEFF1] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl bg-[#18181B] border border-white/12 p-6 text-center space-y-4">
          <h2 className="font-display font-bold text-lg text-white">
            {isQuota
              ? pickLang(lang, {
                  es: 'Límite diario de sincronización en la nube alcanzado',
                  ca: 'Límit diari de sincronització al núvol assolit',
                  en: 'Daily cloud sync quota reached',
                })
              : pickLang(lang, {
                  es: 'Se produjo una interrupción temporal',
                  ca: "S'ha produït una interrupció temporal",
                  en: 'A temporary interruption occurred',
                })}
          </h2>
          <p className="text-xs sm:text-sm text-[#ADADB8] leading-relaxed">
            {isQuota
              ? pickLang(lang, {
                  es: 'La cuota gratuita diaria de lectura/escritura en la nube se restablecerá mañana. Tus salas en vivo y reproducción siguen operativas.',
                  ca: 'La quota gratuïta diària de lectura/escriptura al núvol es restablirà demà. Les teves sales en directe i reproducció continuen operatives.',
                  en: 'The free daily cloud quota will reset tomorrow. Live rooms and playback continue working normally.',
                })
              : pickLang(lang, {
                  es: 'Recarga la sala para continuar viendo contenido con normalidad.',
                  ca: 'Recarrega la sala per continuar veient contingut amb normalitat.',
                  en: 'Reload the room to continue watching normally.',
                })}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-5 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] text-xs sm:text-sm font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>
              {pickLang(lang, {
                es: 'Recargar NAIM CINE',
                ca: 'Recarregar NAIM CINE',
                en: 'Reload NAIM CINE',
              })}
            </span>
          </button>
        </div>
      </div>
    );
  }
}
