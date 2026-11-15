import React from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import type { AppLanguage, CloudBrowserState, VideoState } from '../../types';
import { socketService } from '../../services/socket';
import { UI_COPY, pickLang } from '../../utils/i18n';

interface CloudBrowserOverlayProps {
  lang: AppLanguage;
  videoState: VideoState;
  cloudFrame: string | null;
  cloudState: CloudBrowserState | null;
  cloudUrlInput: string;
  setCloudUrlInput: (val: string) => void;
  isTvMode: boolean;
  isCinemaMode: boolean;
  onToggleCinemaMode?: () => void;
  onClosePlayer?: () => void;
  onPromoteCloudStreamToNative: (proxiedStreamUrl: string) => void;
  onCloudWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onCloudNavigate: (e: React.FormEvent) => void;
  onCloudCanvasClick: (e: React.MouseEvent<HTMLImageElement>) => void;
}

export const CloudBrowserOverlay: React.FC<CloudBrowserOverlayProps> = ({
  lang,
  videoState,
  cloudFrame,
  cloudState,
  cloudUrlInput,
  setCloudUrlInput,
  isTvMode,
  isCinemaMode,
  onToggleCinemaMode,
  onClosePlayer,
  onPromoteCloudStreamToNative,
  onCloudWheel,
  onCloudNavigate,
  onCloudCanvasClick,
}) => {
  const t = UI_COPY[lang];

  return (
    <div
      onWheel={onCloudWheel}
      className="absolute inset-0 flex flex-col bg-[#0E0E10] z-30"
    >
      <div className="px-2.5 py-2 bg-[#18181B] border-b border-white/[0.08] flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => socketService.sendCloudBrowserInput({ type: 'back' })}
          className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
          aria-label={pickLang(lang, { es: 'Atrás', ca: 'Enrere', en: 'Back' })}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => socketService.sendCloudBrowserInput({ type: 'reload' })}
          className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer"
          aria-label={pickLang(lang, { es: 'Recargar', ca: 'Recarregar', en: 'Reload' })}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <form
          onSubmit={onCloudNavigate}
          className="flex-1 min-w-0 flex items-center"
        >
          <input
            type="text"
            value={cloudUrlInput}
            onChange={(e) => setCloudUrlInput(e.target.value)}
            className="w-full h-9 px-3 rounded-xl bg-[#0E0E10] border border-white/10 focus:border-[#9146FF] text-base sm:text-xs font-mono text-zinc-200 outline-none"
          />
        </form>
        {cloudState?.detectedStreamUrl && (
          <button
            type="button"
            onClick={() => onPromoteCloudStreamToNative(cloudState.detectedStreamUrl!)}
            className="min-h-[36px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.switchNativeHd}</span>
            <span className="sm:hidden">HD</span>
          </button>
        )}
        {!isTvMode && onToggleCinemaMode && (
          <button
            type="button"
            role="switch"
            aria-checked={isCinemaMode}
            onClick={onToggleCinemaMode}
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer border transition-colors ${
              isCinemaMode
                ? 'bg-amber-400/25 border-amber-400/55 text-amber-200'
                : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/10 text-zinc-200'
            }`}
            aria-label={pickLang(lang, {
              es: 'Modo Cine',
              ca: 'Mode Cinema',
              en: 'Cinema Mode',
            })}
          >
            {isCinemaMode ? (
              <Sun className="w-4 h-4 text-amber-300" />
            ) : (
              <Moon className="w-4 h-4 text-amber-300" />
            )}
          </button>
        )}
        {onClosePlayer && (
          <button
            type="button"
            onClick={onClosePlayer}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-rose-600 flex items-center justify-center text-zinc-200 shrink-0 cursor-pointer"
            aria-label={pickLang(lang, {
              es: 'Cerrar navegador',
              ca: 'Tancar navegador',
              en: 'Close browser',
            })}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {cloudFrame ? (
          <img
            src={cloudFrame}
            alt="Isolated Cloud Session"
            onClick={onCloudCanvasClick}
            className="w-full h-full object-contain cursor-pointer"
          />
        ) : cloudState && !cloudState.isLoading ? (
          <div className="relative w-full h-full bg-black">
            <iframe
              key={cloudState.url || videoState.url}
              src={cloudState.url || videoState.url}
              title={cloudState.title || 'Reproductor Web HD'}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write; web-share"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full border-0 bg-black"
            />
            <div className="absolute bottom-2.5 right-2.5 z-20 flex items-center gap-1.5">
              {cloudState.detectedStreamUrl && (
                <button
                  type="button"
                  onClick={() => onPromoteCloudStreamToNative(cloudState.detectedStreamUrl!)}
                  className="min-h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white inline-flex items-center gap-1.5 shadow-xl cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t.switchNativeHd}</span>
                </button>
              )}
              <a
                href={cloudState.url || videoState.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-8 px-3 rounded-xl bg-[#111116]/90 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 shadow-xl"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>
                  {pickLang(lang, {
                    es: 'Sin sandbox',
                    ca: 'Sense sandbox',
                    en: 'Open directly',
                  })}
                </span>
              </a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-400 p-4 text-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#9146FF]" />
            <span className="text-xs">
              {pickLang(lang, {
                es: 'Iniciando navegador aislado sin ventanas emergentes...',
                ca: 'Iniciant navegador aïllat sense finestres emergents...',
                en: 'Starting isolated popup-free browser...',
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
