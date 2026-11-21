import React, { useRef, useState } from 'react';
import { domToPng } from 'modern-screenshot';
import { ArrowLeft, Copy, Film, Globe, Layers, Palette, Sparkles } from 'lucide-react';
import { RiffanBrandLogo } from './NaimBrandLogo';
import { SecondaryButton } from './ui/DesignSystem';
import { triggerHaptic } from '../utils/haptics';
import {
  WorldPortalTransition,
  type PortalOriginRect,
  type WorldPortalKind,
} from './home/WorldPortalTransition';
import {
  DesignPostersTab,
  type PosterFormat,
  type PosterLanguage,
} from './design/DesignPostersTab';
import { DesignLogosTab } from './design/DesignLogosTab';
import { DesignComponentsTab, DesignTokensTab } from './design/DesignTokensAndUiTabs';

interface DesignSystemShowcaseProps {
  onClose?: () => void;
}

export const DesignSystemShowcase: React.FC<DesignSystemShowcaseProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'posters' | 'logos' | 'tokens' | 'components'>('logos');
  const [posterLang, setPosterLang] = useState<PosterLanguage>('es');
  const [posterFormat, setPosterFormat] = useState<PosterFormat>('vertical');
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [iconAnimMode, setIconAnimMode] = useState<'always' | 'hover'>('always');
  const [emblemAnimMode, setEmblemAnimMode] = useState<'always' | 'hover'>('always');
  const [previewPortal, setPreviewPortal] = useState<{
    kind: WorldPortalKind;
    originRect: PortalOriginRect | null;
  } | null>(null);

  const posterPreviewRef = useRef<HTMLDivElement>(null);
  const portalTimerRef = useRef<number | null>(null);

  const triggerPortalPreview = (kind: WorldPortalKind, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('medium');
    if (portalTimerRef.current) {
      window.clearTimeout(portalTimerRef.current);
    }
    const r = e.currentTarget.getBoundingClientRect();
    setPreviewPortal({
      kind,
      originRect: { left: r.left, top: r.top, width: r.width, height: r.height },
    });
    portalTimerRef.current = window.setTimeout(() => {
      setPreviewPortal(null);
      portalTimerRef.current = null;
    }, 1020);
  };

  const handleDownloadPoster = async () => {
    if (!posterPreviewRef.current || isExporting) return;
    try {
      setIsExporting(true);
      triggerHaptic('medium');
      const dataUrl = await domToPng(posterPreviewRef.current, {
        scale: 2,
        quality: 0.95,
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `riffantv-poster-${posterLang}-${posterFormat}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setExportNotice('¡Cartel descargado en alta resolución PNG!');
      setTimeout(() => setExportNotice(null), 3000);
      triggerHaptic('success');
    } catch {
      setExportNotice('Error al generar la imagen. Inténtalo de nuevo.');
      setTimeout(() => setExportNotice(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadLogoSvg = (name: string, svgContent: string) => {
    triggerHaptic('light');
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadLogoPng = async (elementId: string, filename: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    try {
      triggerHaptic('medium');
      const dataUrl = await domToPng(el, { scale: 3 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-dvh bg-[#07080D] text-zinc-100 p-4 sm:p-8 pb-24 font-sans select-none">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <RiffanBrandLogo size={42} withFrame frameStyle="glass" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-white">
                  RiffanTV (RTV) · Design System & Media Kit
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-[#9146FF]/30 text-[#D8B4FE] text-[10px] font-bold uppercase tracking-wider">
                  v3.5 PRO
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Tokens @theme · Carteles Publicitarios (ES · EN · 中文) · Logos Descargables SVG/PNG · Google TV
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href="https://riffan.ai.studio/"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-10 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-mono font-bold text-[#D8B4FE] inline-flex items-center gap-1.5 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-[#00F0FF]" />
              <span>riffan.ai.studio</span>
            </a>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                void navigator.clipboard?.writeText('https://riffan.ai.studio/').then(() => {
                  setExportNotice('Enlace copiado: https://riffan.ai.studio/');
                  setTimeout(() => setExportNotice(null), 2500);
                });
              }}
              className="min-h-10 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Copiar enlace oficial"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar link</span>
            </button>
            {onClose && (
              <SecondaryButton onClick={onClose}>
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a la app</span>
              </SecondaryButton>
            )}
          </div>
        </header>

        <nav className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/[0.04] border border-white/10 overflow-x-auto no-scrollbar">
          {[
            { id: 'posters', label: 'Carteles de Publicidad', icon: Film },
            { id: 'logos', label: 'Logos Oficiales (SVG / PNG)', icon: Sparkles },
            { id: 'tokens', label: 'Paleta Obsidian & Tokens', icon: Palette },
            { id: 'components', label: 'Componentes & UI Kit', icon: Layers },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveTab(id as 'posters' | 'logos' | 'tokens' | 'components');
              }}
              className={`min-h-10 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all ${
                activeTab === id
                  ? 'bg-[#9146FF] text-white shadow-[0_4px_16px_rgba(145,70,255,0.4)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {activeTab === 'posters' && (
          <DesignPostersTab
            posterLang={posterLang}
            onChangePosterLang={setPosterLang}
            posterFormat={posterFormat}
            onChangePosterFormat={setPosterFormat}
            isExporting={isExporting}
            exportNotice={exportNotice}
            posterPreviewRef={posterPreviewRef}
            onDownloadPoster={handleDownloadPoster}
          />
        )}

        {activeTab === 'logos' && (
          <DesignLogosTab
            onDownloadLogoSvg={handleDownloadLogoSvg}
            onDownloadLogoPng={handleDownloadLogoPng}
          />
        )}

        {activeTab === 'tokens' && <DesignTokensTab />}

        {activeTab === 'components' && (
          <DesignComponentsTab
            emblemAnimMode={emblemAnimMode}
            onChangeEmblemAnimMode={setEmblemAnimMode}
            iconAnimMode={iconAnimMode}
            onChangeIconAnimMode={setIconAnimMode}
            onTriggerPortalPreview={triggerPortalPreview}
          />
        )}
      </div>

      <WorldPortalTransition
        portal={previewPortal?.kind ?? null}
        originRect={previewPortal?.originRect ?? null}
        lang="es"
      />
    </div>
  );
};
