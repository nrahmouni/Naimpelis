import React from 'react';
import { RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
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

    return (
      <div className="min-h-full w-full bg-[#0E0E10] text-[#EFEFF1] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl bg-[#18181B] border border-white/12 p-6 text-center space-y-4">
          <h2 className="font-display font-bold text-lg text-white">
            {isQuota
              ? 'Límite diario de sincronización en la nube alcanzado'
              : 'Se produjo una interrupción temporal'}
          </h2>
          <p className="text-xs sm:text-sm text-[#ADADB8] leading-relaxed">
            {isQuota
              ? 'La cuota gratuita diaria de lectura/escritura en la nube se restablecerá mañana. Tus salas en vivo y reproducción siguen operativas.'
              : 'Recarga la sala para continuar viendo contenido con normalidad.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-5 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] text-xs sm:text-sm font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Recargar NAIM CINE</span>
          </button>
        </div>
      </div>
    );
  }
}
