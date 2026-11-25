import React, { useRef, useState } from 'react';
import { ArrowLeft, Loader2, Maximize2, RotateCcw } from 'lucide-react';
import type { AppLanguage } from '../../../types';
import { pickLang } from '../../../utils/i18n';
import { triggerHaptic } from '../../../utils/haptics';

export interface OpenRepoGameItem {
  slug: string;
  name: string;
  category: string;
  tech: string;
  tags: string[];
  description: string;
  launchUrl: string;
  repo: string;
  license: string;
}

interface OpenGamesRepoStageProps {
  game: OpenRepoGameItem;
  lang: AppLanguage;
  onClose: () => void;
}

export const OpenGamesRepoStage: React.FC<OpenGamesRepoStageProps> = ({ game, lang, onClose }) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const toggleFullscreen = () => {
    triggerHaptic('light');
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => null);
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => null);
    }
  };

  return (
    <div
      ref={stageRef}
      className="w-full max-w-6xl mx-auto px-3 sm:px-6 pt-2 pb-24 sm:pb-8 flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-[#0D0D12] border border-white/[0.08] px-3.5 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>{pickLang(lang, { es: 'Salón', ca: 'Saló', en: 'Lounge' })}</span>
          </button>
          <div className="min-w-0">
            <h2 className="font-display font-extrabold text-sm sm:text-base text-white truncate">
              {game.name}
            </h2>
            <p className="text-[11px] text-zinc-400 truncate">
              {game.category.toUpperCase()} · {game.tech.toUpperCase()} · {game.repo} ({game.license})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setIframeLoaded(false);
              setReloadKey((k) => k + 1);
            }}
            className="min-h-[44px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">
              {pickLang(lang, { es: 'Reiniciar', ca: 'Reiniciar', en: 'Restart' })}
            </span>
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Maximize2 className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">
              {pickLang(lang, { es: 'Pantalla completa', ca: 'Pantalla completa', en: 'Fullscreen' })}
            </span>
          </button>
        </div>
      </div>

      <div className="relative w-full h-[70vh] min-h-[440px] max-h-[820px] rounded-3xl overflow-hidden bg-black border border-white/[0.1] shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
        {!iframeLoaded && (
          <div className="absolute inset-0 z-10 bg-[#070910] flex flex-col items-center justify-center gap-2 text-xs font-semibold text-zinc-300 pointer-events-none">
            <Loader2 className="w-6 h-6 text-[#A78BFA] animate-spin" />
            <span>
              {pickLang(lang, {
                es: `Cargando ${game.name}...`,
                ca: `Carregant ${game.name}...`,
                en: `Loading ${game.name}...`,
              })}
            </span>
          </div>
        )}
        <iframe
          key={`${game.slug}-${reloadKey}`}
          src={game.launchUrl}
          title={game.name}
          onLoad={() => setIframeLoaded(true)}
          allow="autoplay; fullscreen; gamepad; accelerometer; gyroscope"
          className="w-full h-full border-0 bg-black"
        />
      </div>
    </div>
  );
};
