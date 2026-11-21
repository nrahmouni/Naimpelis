import React, { useRef, useState } from 'react';
import { domToPng } from 'modern-screenshot';
import { ArrowLeft, Check, Download, Loader2 } from 'lucide-react';
import { getDisplayAppHost, resolvePublicLinkOrigin } from '../utils/shortLink';
import { triggerHaptic } from '../utils/haptics';
import { StoryAdFlyer, VerticalPosterAd } from './ads/AdPosterAndStory';
import { FullSalesSheetAd, LandscapeBillboardAd } from './ads/AdFullAndLandscapeSheets';

export type AdsExportFormat = 'poster' | 'story' | 'full' | 'landscape';

interface NaimCineAdsPageProps {
  onBack: () => void;
}

const FORMAT_TABS = [
  { id: 'poster', label: 'Cartel Vertical Pro' },
  { id: 'story', label: 'Story 9:16' },
  { id: 'full', label: 'Página Completa' },
  { id: 'landscape', label: '16:9 Horizontal' },
] as const;

export const NaimCineAdsPage: React.FC<NaimCineAdsPageProps> = ({ onBack }) => {
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [format, setFormat] = useState<AdsExportFormat>('poster');
  const [exporting, setExporting] = useState(false);
  const [exportedDone, setExportedDone] = useState(false);

  const displayHost = getDisplayAppHost();
  const publicUrl = `${resolvePublicLinkOrigin()}/`;

  const handleExportPng = async () => {
    if (!captureRef.current || exporting) return;
    triggerHaptic('medium');
    setExporting(true);
    setExportedDone(false);

    try {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)));
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const scaleFactor = format === 'poster' || format === 'story' ? 2.5 : 2;
      const dataUrl = await domToPng(captureRef.current, {
        scale: scaleFactor,
        backgroundColor: '#0E0E10',
        quality: 1,
      });

      const link = document.createElement('a');
      const suffix =
        format === 'poster'
          ? 'cartel-vertical-pro'
          : format === 'story'
          ? '9x16-story-pro'
          : format === 'landscape'
          ? '16x9-keynote'
          : 'full-sheet';
      link.download = `riffantv-ads-${suffix}-uhd.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      triggerHaptic('success');
      setExportedDone(true);
      setTimeout(() => setExportedDone(false), 3200);
    } catch (err) {
      console.error('PNG export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0E0E10] text-[#EFEFF1] overflow-y-auto selection:bg-[#9146FF] selection:text-white">
      <header className="sticky top-0 z-50 glass-bar border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onBack();
              }}
              className="min-h-[40px] px-3.5 rounded-full liquid-glass-pill hover:bg-white/[0.14] text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver</span>
            </button>

            <div className="hidden lg:flex items-center gap-2 text-xs text-zinc-400 truncate">
              <span className="font-display font-bold text-white tracking-tight">RiffanTV Studio</span>
              <span className="text-zinc-600">·</span>
              <span>Carteles Oficiales & Exportación PNG Ultra-HD</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center p-1 rounded-full liquid-glass-pill">
              {FORMAT_TABS.map((tab) => {
                const active = format === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setFormat(tab.id);
                    }}
                    className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      active ? 'bg-[#9146FF] text-white shadow-sm' : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={exporting}
              onClick={handleExportPng}
              className="min-h-[42px] px-4 sm:px-5 rounded-full bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-[0_8px_30px_rgba(145,70,255,0.35)] transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generando PNG...</span>
                </>
              ) : exportedDone ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>PNG Descargado</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Descargar PNG HD</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="sm:hidden px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {FORMAT_TABS.map((tab) => {
            const active = format === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setFormat(tab.id);
                }}
                className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#9146FF] text-white'
                    : 'bg-white/[0.06] text-zinc-300 border border-white/[0.08]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="py-6 sm:py-10 px-3 sm:px-6 flex justify-center">
        {format === 'poster' && (
          <VerticalPosterAd captureRef={captureRef} publicUrl={publicUrl} displayHost={displayHost} />
        )}
        {format === 'story' && (
          <StoryAdFlyer captureRef={captureRef} publicUrl={publicUrl} displayHost={displayHost} />
        )}
        {format === 'full' && (
          <FullSalesSheetAd captureRef={captureRef} publicUrl={publicUrl} displayHost={displayHost} />
        )}
        {format === 'landscape' && (
          <LandscapeBillboardAd captureRef={captureRef} publicUrl={publicUrl} displayHost={displayHost} />
        )}
      </main>
    </div>
  );
};
