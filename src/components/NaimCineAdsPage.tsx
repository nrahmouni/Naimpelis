import React, { useRef, useState } from 'react';
import { domToPng } from 'modern-screenshot';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  Check,
  Columns2,
  Download,
  Film,
  Globe,
  Loader2,
  Lock,
  Monitor,
  Play,
  Radio,
  Smartphone,
  Sparkles,
  Tv,
  Users,
  Zap,
} from 'lucide-react';
import { NaimBrandLogo } from './NaimBrandLogo';
import { getDisplayAppHost } from '../utils/shortLink';
import { triggerHaptic } from '../utils/haptics';
import stadiumBackdrop from '../assets/images/esports_arena_live_1794673806740.jpg';
import f1Backdrop from '../assets/images/motorsport_f1_backdrop_1794353709150.jpg';
import cinemaHeroBackdrop from '../assets/images/cinema_hero_lobby_1794353709142.jpg';

export type AdsExportFormat = 'poster' | 'story' | 'full' | 'landscape';

interface NaimCineAdsPageProps {
  onBack: () => void;
}

const BrandTile: React.FC<{
  name: string;
  sub: string;
  accent: string;
  children: React.ReactNode;
}> = ({ name, sub, accent, children }) => (
  <div
    className="relative rounded-2xl p-4 bg-[#18181B] border border-white/[0.09] flex flex-col justify-between gap-3 overflow-hidden"
    style={{
      background: `linear-gradient(155deg, ${accent}1A 0%, #1F1F23 58%, #0E0E10 100%)`,
    }}
  >
    <div className="h-10 flex items-center">{children}</div>
    <div>
      <div className="font-display font-bold text-sm text-white tracking-tight leading-tight">
        {name}
      </div>
      <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{sub}</div>
    </div>
  </div>
);

/** Compact crisp vector brand badge used inside the Vertical Pro Ad Flyer & Story */
const ProAdLogoPill: React.FC<{
  bg: string;
  textColor?: string;
  badge: string;
  name: string;
  detail: string;
}> = ({ bg, textColor = '#FFFFFF', badge, name, detail }) => (
  <div className="p-2.5 rounded-2xl bg-[#1F1F23]/95 border border-white/[0.11] flex items-center gap-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
    <div
      className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center font-display font-black text-[11px] tracking-tight shadow-inner"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {badge}
    </div>
    <div className="min-w-0">
      <div className="font-display font-bold text-xs text-white leading-tight truncate">
        {name}
      </div>
      <div className="text-[10px] text-zinc-400 leading-tight truncate mt-0.5">{detail}</div>
    </div>
  </div>
);

export const NaimCineAdsPage: React.FC<NaimCineAdsPageProps> = ({ onBack }) => {
  const captureRef = useRef<HTMLDivElement | null>(null);
  // Default directly to the Vertical Commercial Ad Poster requested by the user
  const [format, setFormat] = useState<AdsExportFormat>('poster');
  const [exporting, setExporting] = useState(false);
  const [exportedDone, setExportedDone] = useState(false);

  const displayHost = getDisplayAppHost();
  const publicUrl =
    typeof window !== 'undefined' && !/^ais-dev-/i.test(window.location.hostname || '')
      ? window.location.origin
      : `https://${displayHost}`;

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
      link.download = `naimcine-ads-${suffix}-uhd.png`;
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
      {/* ==================================================================== */}
      {/* FLOATING STUDIO TOOLBAR (NOT INCLUDED IN EXPORTED PNG)               */}
      {/* ==================================================================== */}
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
              <span className="font-display font-bold text-white tracking-tight">
                naimcine ads
              </span>
              <span className="text-zinc-600">·</span>
              <span>Carteles Oficiales & Exportación PNG Ultra-HD</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center p-1 rounded-full liquid-glass-pill">
              {(
                [
                  { id: 'poster', label: 'Cartel Vertical Pro' },
                  { id: 'story', label: 'Story 9:16' },
                  { id: 'full', label: 'Página Completa' },
                  { id: 'landscape', label: '16:9 Horizontal' },
                ] as const
              ).map((tab) => {
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

        {/* Mobile Format Bar */}
        <div className="sm:hidden px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'poster', label: 'Cartel Vertical Pro' },
              { id: 'story', label: 'Story 9:16' },
              { id: 'full', label: 'Página Completa' },
              { id: 'landscape', label: '16:9 Horizontal' },
            ] as const
          ).map((tab) => {
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

      {/* ==================================================================== */}
      {/* EXPORTABLE CANVAS STAGE                                              */}
      {/* ==================================================================== */}
      <main className="py-6 sm:py-10 px-3 sm:px-6 flex justify-center">
        {/* ================================================================== */}
        {/* FORMAT 1 (DEFAULT): SUPER-PRO VERTICAL RECTANGLE AD FLYER + BIG QR */}
        {/* ================================================================== */}
        {format === 'poster' && (
          <div className="w-full flex justify-center">
            <div
              ref={captureRef}
              className="w-[540px] max-w-full rounded-[28px] bg-[#0E0E10] border border-white/[0.15] p-7 sm:p-8 flex flex-col justify-between gap-6 relative overflow-hidden shadow-[0_40px_130px_rgba(0,0,0,0.96)]"
            >
              {/* Layered Atmospheric Cinema + Stadium Backdrops */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] overflow-hidden">
                <img
                  src={cinemaHeroBackdrop}
                  alt=""
                  className="w-full h-full object-cover opacity-30 scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#0E0E10]/40 via-[#0E0E10]/85 to-[#0E0E10]" />
              </div>

              <div
                className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-[300px] rounded-full opacity-50 blur-[95px]"
                style={{
                  background:
                    'radial-gradient(circle, rgba(145,70,255,0.68) 0%, rgba(1,157,244,0.28) 52%, transparent 78%)',
                }}
              />

              {/* 1. TOP COMMERCIAL BRAND HEADER */}
              <div className="relative z-10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <NaimBrandLogo size={46} />
                  <div>
                    <div className="font-display font-black text-xl text-white tracking-tight leading-none">
                      NAIM CINE
                    </div>
                    <div className="text-[11px] font-medium text-zinc-300 mt-1">
                      Cine · Series · Deportes · TV en Vivo
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#9146FF] text-white font-display font-black text-[11px] tracking-tight shadow-lg">
                    <span>100% GRATIS · SIN ANUNCIOS</span>
                  </div>
                </div>
              </div>

              {/* 2. HIGH-IMPACT COMMERCIAL HEADLINE */}
              <div className="relative z-10 space-y-3 pt-1">
                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#BF94FF] font-bold">
                  Toda la Televisión y el Streaming Mundial
                </div>
                <h1 className="font-display font-extrabold text-[34px] sm:text-[38px] text-white leading-[1.03] tracking-[-0.03em]">
                  Todo lo que quieres ver.{' '}
                  <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                    En un solo lugar y en 1080p.
                  </span>
                </h1>
                <p className="text-xs sm:text-[13px] text-zinc-300 leading-relaxed">
                  Olvídate de pagar 8 suscripciones o sufrir anuncios. Disfruta de estrenos, series
                  completas, LaLiga, Champions, F1 y TDT en directo solo o en sala sincronizada con
                  tus amigos.
                </p>
              </div>

              {/* 3. ALL 12 PLATFORM & LIVE CHANNEL LOGOS IN HIGH CONTRAST */}
              <div className="relative z-10 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  <span>Catálogo y Canales Incluidos</span>
                  <span className="text-emerald-400 font-mono tabular-nums">+50 Canales en Vivo</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <ProAdLogoPill
                    bg="#E50914"
                    badge="N"
                    name="Netflix"
                    detail="Cine & Series"
                  />
                  <ProAdLogoPill
                    bg="#5B21B6"
                    badge="MAX"
                    name="HBO Max"
                    detail="Series Top"
                  />
                  <ProAdLogoPill
                    bg="#0063E5"
                    badge="D+"
                    name="Disney+"
                    detail="Marvel & Star"
                  />
                  <ProAdLogoPill
                    bg="#00A8E1"
                    textColor="#04121A"
                    badge="PRIME"
                    name="Prime Video"
                    detail="Originals HD"
                  />
                  <ProAdLogoPill
                    bg="#F4F4F5"
                    textColor="#0E0E10"
                    badge="tv+"
                    name="Apple TV+"
                    detail="Exclusivas"
                  />
                  <ProAdLogoPill
                    bg="#019DF4"
                    badge="M+"
                    name="Movistar+"
                    detail="Fútbol & Cine"
                  />
                  <ProAdLogoPill
                    bg="#FFFFFF"
                    textColor="#0E0E10"
                    badge="DAZN"
                    name="DAZN Vivo"
                    detail="LaLiga & F1"
                  />
                  <ProAdLogoPill
                    bg="#10B981"
                    textColor="#03140E"
                    badge="TDT"
                    name="TDT + EPG"
                    detail="Guía en Vivo"
                  />
                  <ProAdLogoPill
                    bg="#F47521"
                    badge="ANI"
                    name="Anime Hub"
                    detail="Crunchy & Más"
                  />
                  <ProAdLogoPill
                    bg="#F59E0B"
                    textColor="#170E02"
                    badge="ES"
                    name="Castellano"
                    detail="España 1080p"
                  />
                  <ProAdLogoPill
                    bg="#9146FF"
                    badge="SX3"
                    name="En Català"
                    detail="3Cat & Anime"
                  />
                  <ProAdLogoPill
                    bg="#FF0033"
                    badge="YT"
                    name="YouTube"
                    detail="Watch Party"
                  />
                </div>
              </div>

              {/* 4. 4 PRO PILLARS STRIP */}
              <div className="relative z-10 grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.09] flex items-start gap-2.5">
                  <Users className="w-4 h-4 text-[#BF94FF] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-display font-bold text-xs text-white">
                      Salas con Amigos
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-snug mt-0.5">
                      Vídeo sincronizado, chat en vivo, votaciones y PIN privado.
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.09] flex items-start gap-2.5">
                  <Tv className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-display font-bold text-xs text-white">
                      Smart TV en 4 Dígitos
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-snug mt-0.5">
                      Conecta Samsung, LG o Android TV desde tu móvil al instante.
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.09] flex items-start gap-2.5">
                  <Columns2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-display font-bold text-xs text-white">
                      Multiview + Guía EPG
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-snug mt-0.5">
                      2 partidos a la vez y programación española en tiempo real.
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.09] flex items-start gap-2.5">
                  <Zap className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-display font-bold text-xs text-white">
                      Guarda tu Minuto
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-snug mt-0.5">
                      Sigue viendo donde lo dejaste en Móvil, PC y Tablet.
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. MASSIVE CENTERPIECE QR VIP PASS CALL-TO-ACTION */}
              <div
                className="relative z-10 rounded-3xl p-5 border border-white/[0.18] flex items-center justify-between gap-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(145,70,255,0.22) 0%, rgba(24,24,27,0.96) 55%, rgba(145,70,255,0.14) 100%)',
                }}
              >
                {/* Huge High-Contrast Scannable QR */}
                <div className="p-3 rounded-2xl bg-white shadow-[0_10px_30px_rgba(255,255,255,0.2)] shrink-0">
                  <QRCodeSVG
                    value={publicUrl}
                    size={138}
                    level="H"
                    bgColor="#FFFFFF"
                    fgColor="#0E0E10"
                  />
                </div>

                {/* Direct Action Copy */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Acceso Directo Inmediato</span>
                  </div>

                  <div className="font-display font-extrabold text-xl sm:text-2xl text-white leading-tight tracking-tight">
                    Escanea el QR con tu cámara y entra ahora
                  </div>

                  <p className="text-[11px] text-zinc-300 leading-snug">
                    Sin registro obligatorio · Compatible con iPhone, Android, PC, Mac y Smart TV.
                  </p>

                  <div className="pt-1">
                    <div className="inline-block px-3 py-1.5 rounded-xl bg-black/60 border border-white/[0.14] font-mono font-bold text-xs text-white tracking-tight">
                      {displayHost}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* FORMAT 2: 9:16 VERTICAL STORY / INSTAGRAM / TIKTOK WITH BIG QR     */}
        {/* ================================================================== */}
        {format === 'story' && (
          <div className="w-full flex justify-center">
            <div
              ref={captureRef}
              className="w-[450px] max-w-full aspect-[9/16] rounded-[32px] bg-[#0E0E10] border border-white/[0.15] p-6 sm:p-7 flex flex-col justify-between relative overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.95)]"
            >
              <img
                src={stadiumBackdrop}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-25"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-[#0E0E10]/80 via-[#0E0E10]/90 to-[#0E0E10]" />
              <div
                className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[380px] h-[300px] rounded-full opacity-45 blur-[90px]"
                style={{
                  background:
                    'radial-gradient(circle, rgba(145,70,255,0.68) 0%, rgba(1,157,244,0.28) 55%, transparent 80%)',
                }}
              />

              {/* Story Header */}
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <NaimBrandLogo size={40} />
                  <div>
                    <div className="font-display font-black text-base text-white leading-none">
                      NAIM CINE
                    </div>
                    <div className="text-[10px] text-zinc-300 mt-0.5">
                      Cine · Series · Deportes Live
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-display font-black text-white px-2.5 py-1 rounded-lg bg-[#9146FF]">
                  GRATIS · 1080p
                </span>
              </div>

              {/* Story Headline & Logos */}
              <div className="relative z-10 space-y-3 my-auto py-2">
                <h1 className="font-display font-extrabold text-[28px] text-white leading-[1.05] tracking-tight">
                  Todo el Cine, Series, Fútbol y F1 en una sola web.
                </h1>

                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { mark: 'NETFLIX', sub: 'Cine & Series', color: '#E50914' },
                    { mark: 'HBO MAX', sub: 'Series Top', color: '#A78BFA' },
                    { mark: 'Disney+', sub: 'Marvel & Star', color: '#60A5FA' },
                    { mark: 'PRIME', sub: 'Originals', color: '#38BDF8' },
                    { mark: 'tv+', sub: 'Apple TV+', color: '#FFFFFF' },
                    { mark: 'M+', sub: 'Movistar+ Vivo', color: '#019DF4' },
                    { mark: 'DAZN', sub: 'LaLiga & F1', color: '#FFFFFF' },
                    { mark: 'TDT', sub: 'Guía EPG Real', color: '#34D399' },
                    { mark: 'ANIME', sub: 'Crunchy & Más', color: '#FB923C' },
                    { mark: 'ES · HD', sub: 'Castellano', color: '#FBBF24' },
                    { mark: 'CAT · SX3', sub: 'Anime Català', color: '#BF94FF' },
                    { mark: 'YOUTUBE', sub: 'Watch Party', color: '#F87171' },
                  ].map((b) => (
                    <div
                      key={b.mark}
                      className="py-2 px-1.5 rounded-xl bg-[#18181B]/95 border border-white/[0.1] flex flex-col items-center justify-center text-center"
                    >
                      <span
                        className="font-display font-black text-[11px] leading-none"
                        style={{ color: b.color }}
                      >
                        {b.mark}
                      </span>
                      <span className="text-[9px] text-zinc-400 mt-1 truncate max-w-full">
                        {b.sub}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-[11px] text-zinc-200 pt-1">
                  <div className="flex items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-white fill-current shrink-0" />
                    <span>Sin anuncios · Salas sincronizadas con amigos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tv className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Smart TV (/tv), Multiview doble y Guía EPG</span>
                  </div>
                </div>
              </div>

              {/* Large Story QR Block */}
              <div className="relative z-10 p-4 rounded-3xl bg-white/[0.07] border border-white/[0.16] flex items-center gap-4">
                <div className="p-2.5 rounded-2xl bg-white shrink-0 shadow-lg">
                  <QRCodeSVG value={publicUrl} size={116} level="H" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                    Escanea y Entra
                  </div>
                  <div className="font-display font-extrabold text-base text-white leading-tight">
                    Apunta con tu cámara para entrar gratis
                  </div>
                  <div className="text-[11px] font-mono text-zinc-200 truncate pt-0.5">
                    {displayHost}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* FORMAT 3: FULL APPLE-KEYNOTE LUXURY SALES SHEET                    */}
        {/* ================================================================== */}
        {format === 'full' && (
          <div
            ref={captureRef}
            className="w-full max-w-[1160px] rounded-[36px] bg-[#0E0E10] border border-white/[0.1] overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.92)] relative"
          >
            <div
              className="pointer-events-none absolute -top-36 left-1/2 -translate-x-1/2 w-[880px] h-[420px] rounded-full opacity-35 blur-[120px]"
              style={{
                background:
                  'radial-gradient(circle, rgba(145,70,255,0.55) 0%, rgba(56,189,248,0.22) 48%, rgba(14,14,16,0) 75%)',
              }}
            />

            <section className="relative px-7 sm:px-14 pt-12 sm:pt-16 pb-12 border-b border-white/[0.07]">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
                <div className="flex items-center gap-3.5">
                  <NaimBrandLogo size={48} />
                  <div>
                    <div className="font-display font-extrabold text-xl tracking-tight text-white leading-none">
                      NAIM CINE
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Private Cinema · Live Sports · Social Watch Party
                    </div>
                  </div>
                </div>

                <div className="text-xs font-mono tabular-nums text-zinc-300 px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.1]">
                  1080p Full HD · Cero Anuncios · Multidispositivo
                </div>
              </div>

              <div className="max-w-4xl space-y-5">
                <div className="text-xs sm:text-sm font-semibold tracking-wide uppercase text-zinc-400">
                  Todo el Entretenimiento Mundial en Una Sola Sala
                </div>

                <h1 className="font-display font-extrabold text-4xl sm:text-6xl lg:text-[64px] text-white tracking-[-0.035em] leading-[1.03] text-balance">
                  Tu sala de cine privada.{' '}
                  <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                    Todo el catálogo y la TV en directo, juntos y sin límites.
                  </span>
                </h1>

                <p className="text-sm sm:text-lg text-zinc-300/95 max-w-3xl leading-relaxed">
                  Películas de estreno, series completas por temporadas, todo el fútbol y motor en
                  vivo con guía EPG en tiempo real, Anime, hub exclusivo en Castellano y Català,
                  sincronizados al milisegundo con tus amigos en Web, Móvil y Smart TV.
                </p>
              </div>

              <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {[
                  {
                    value: '+12',
                    label: 'Plataformas Integradas',
                    detail: 'Cine, Series, Deporte y Anime',
                  },
                  {
                    value: '+50',
                    label: 'Canales TV en Directo',
                    detail: 'Movistar+, DAZN y TDT España',
                  },
                  {
                    value: '0 ms',
                    label: 'Desfase en Sala Común',
                    detail: 'Play, pausa y chat sincronizados',
                  },
                  {
                    value: '100%',
                    label: 'Limpio Sin Publicidad',
                    detail: 'Señal nativa HLS / MP4 1080p',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="p-4 sm:p-5 rounded-2xl bg-white/[0.035] border border-white/[0.08]"
                  >
                    <div className="font-display font-extrabold text-2xl sm:text-3xl text-white tabular-nums tracking-tight">
                      {stat.value}
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-zinc-100 mt-1">
                      {stat.label}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{stat.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="px-7 sm:px-14 py-12 border-b border-white/[0.07] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Catálogo Unificado & Emisión en Vivo
                  </div>
                  <h2 className="font-display font-bold text-2xl sm:text-3xl text-white tracking-tight mt-1">
                    Todas las plataformas y canales que ofrecemos
                  </h2>
                </div>
                <div className="text-xs text-zinc-400">
                  Acceso instantáneo en 1 clic · Sin cambiar de app
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                <BrandTile
                  name="Netflix"
                  sub="Estrenos, Películas y Series Originales HD"
                  accent="#E50914"
                >
                  <svg viewBox="0 0 120 32" className="h-7 w-auto">
                    <rect width="32" height="32" rx="8" fill="#E50914" />
                    <path
                      d="M9.5 6.5H14L19.5 20V6.5H23.5V25.5H19.2L13.5 11.8V25.5H9.5V6.5Z"
                      fill="#FFFFFF"
                    />
                    <text
                      x="40"
                      y="22"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="16"
                      letterSpacing="0.5"
                    >
                      NETFLIX
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="HBO Max"
                  sub="From, La Casa del Dragón, The Last of Us y Cine"
                  accent="#7C3AED"
                >
                  <svg viewBox="0 0 130 32" className="h-7 w-auto">
                    <rect width="46" height="32" rx="8" fill="#5B21B6" />
                    <text
                      x="23"
                      y="21"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="900"
                      fontSize="13"
                      letterSpacing="1"
                    >
                      MAX
                    </text>
                    <text
                      x="55"
                      y="22"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      HBO Max
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="Disney+"
                  sub="Disney, Pixar, Marvel, Star Wars y Star"
                  accent="#2563EB"
                >
                  <svg viewBox="0 0 130 32" className="h-7 w-auto">
                    <rect width="40" height="32" rx="8" fill="#0063E5" />
                    <text
                      x="20"
                      y="21.5"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="900"
                      fontSize="14"
                    >
                      D+
                    </text>
                    <text
                      x="49"
                      y="22"
                      fill="#93C5FD"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="16"
                    >
                      Disney+
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="Prime Video"
                  sub="Reina Roja, The Boys, Fallout y Superproducciones"
                  accent="#00A8E1"
                >
                  <svg viewBox="0 0 140 32" className="h-7 w-auto">
                    <rect width="50" height="32" rx="8" fill="#00A8E1" />
                    <text
                      x="25"
                      y="20.5"
                      textAnchor="middle"
                      fill="#04121A"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="900"
                      fontSize="11"
                    >
                      PRIME
                    </text>
                    <text
                      x="59"
                      y="22"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      prime video
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="Apple TV+"
                  sub="Severance, Silo, Ted Lasso y Apple Originals"
                  accent="#E4E4E7"
                >
                  <svg viewBox="0 0 130 32" className="h-7 w-auto">
                    <rect width="42" height="32" rx="8" fill="#F4F4F5" />
                    <text
                      x="21"
                      y="21.5"
                      textAnchor="middle"
                      fill="#0E0E10"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="900"
                      fontSize="14"
                    >
                      tv+
                    </text>
                    <text
                      x="51"
                      y="22"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      Apple TV+
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="Movistar+ en Vivo"
                  sub="M+ LaLiga, Liga de Campeones, Vamos, Estrenos y Acción"
                  accent="#019DF4"
                >
                  <svg viewBox="0 0 145 32" className="h-7 w-auto">
                    <rect width="42" height="32" rx="8" fill="#019DF4" />
                    <text
                      x="21"
                      y="21.5"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="900"
                      fontSize="15"
                    >
                      M+
                    </text>
                    <text
                      x="51"
                      y="22"
                      fill="#38BDF8"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      Movistar+
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="DAZN en Directo"
                  sub="DAZN LaLiga, DAZN F1 24/7, MotoGP y DAZN 1–4 HD"
                  accent="#FFFFFF"
                >
                  <svg viewBox="0 0 135 32" className="h-7 w-auto">
                    <rect x="1" y="1" width="48" height="30" rx="7" fill="#FFFFFF" />
                    <text
                      x="25"
                      y="20.5"
                      textAnchor="middle"
                      fill="#0E0E10"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="900"
                      fontSize="12"
                      letterSpacing="-0.3"
                    >
                      DAZN
                    </text>
                    <text
                      x="58"
                      y="22"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      DAZN Live
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="TDT España + Guía EPG"
                  sub="La 1, Antena 3, Cuatro, Telecinco, laSexta, 24h y Autonómicas"
                  accent="#10B981"
                >
                  <svg viewBox="0 0 145 32" className="h-7 w-auto">
                    <rect width="44" height="32" rx="8" fill="#10B981" />
                    <text
                      x="22"
                      y="21"
                      textAnchor="middle"
                      fill="#03140E"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="900"
                      fontSize="12"
                    >
                      TDT
                    </text>
                    <text
                      x="53"
                      y="22"
                      fill="#6EE7B7"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      TDT España
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="Anime Hub Completo"
                  sub="Crunchyroll · AnimeBox · JKAnime · AnimeFLV en 1080p"
                  accent="#F97316"
                >
                  <svg viewBox="0 0 150 32" className="h-7 w-auto">
                    <rect width="42" height="32" rx="8" fill="#F47521" />
                    <circle cx="21" cy="16" r="7.5" fill="#FFFFFF" />
                    <circle cx="23" cy="16" r="5" fill="#F47521" />
                    <text
                      x="51"
                      y="22"
                      fill="#FDBA74"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      Crunchy · Anime
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="Todo en Castellano"
                  sub="Hub dedicado 100% Doblaje Español de España + VO"
                  accent="#F59E0B"
                >
                  <svg viewBox="0 0 145 32" className="h-7 w-auto">
                    <rect width="44" height="32" rx="8" fill="#F59E0B" />
                    <text
                      x="22"
                      y="21.5"
                      textAnchor="middle"
                      fill="#170E02"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="900"
                      fontSize="13"
                    >
                      ES
                    </text>
                    <text
                      x="53"
                      y="22"
                      fill="#FDE68A"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      Castellano HD
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="Anime en Català"
                  sub="SX3 · 3Cat · TV3 · Bola de Drac, Conan, Sakura i clàssics"
                  accent="#9146FF"
                >
                  <svg viewBox="0 0 148 32" className="h-7 w-auto">
                    <rect width="48" height="32" rx="8" fill="#9146FF" />
                    <text
                      x="24"
                      y="21"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="900"
                      fontSize="12"
                    >
                      SX3
                    </text>
                    <text
                      x="57"
                      y="22"
                      fill="#E9D5FF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      Català · 3Cat
                    </text>
                  </svg>
                </BrandTile>

                <BrandTile
                  name="YouTube & Cloud URL"
                  sub="Watch Party de YouTube, enlaces M3U8/MP4 y Cloud Browser"
                  accent="#EF4444"
                >
                  <svg viewBox="0 0 145 32" className="h-7 w-auto">
                    <rect width="44" height="32" rx="8" fill="#FF0033" />
                    <path d="M18 10.5L28.5 16L18 21.5V10.5Z" fill="#FFFFFF" />
                    <text
                      x="53"
                      y="22"
                      fill="#FFFFFF"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="800"
                      fontSize="15"
                    >
                      YouTube Sala
                    </text>
                  </svg>
                </BrandTile>
              </div>
            </section>

            <section className="px-7 sm:px-14 py-12 border-b border-white/[0.07] space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-7 relative rounded-3xl overflow-hidden border border-white/[0.1] bg-[#18181B] min-h-[250px] p-6 sm:p-7 flex flex-col justify-between">
                  <img
                    src={stadiumBackdrop}
                    alt="Deportes en vivo"
                    className="absolute inset-0 w-full h-full object-cover opacity-35"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0E0E10] via-[#0E0E10]/75 to-[#0E0E10]/30" />
                  <div className="relative z-10 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400">
                      <Radio className="w-4 h-4" />
                      <span>Emisión Verificada + Guía EPG Real</span>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-zinc-300">
                      Multiview 2 Pantallas
                    </span>
                  </div>
                  <div className="relative z-10 space-y-2 mt-12">
                    <h3 className="font-display font-bold text-xl sm:text-2xl text-white">
                      Fútbol, Fórmula 1, MotoGP y TV Nacional con Guía EPG en Vivo
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-xl">
                      Consulta qué están emitiendo ahora mismo y qué viene después con barra de
                      progreso en tiempo real y doble pantalla simultánea.
                    </p>
                  </div>
                </div>

                <div className="md:col-span-5 relative rounded-3xl overflow-hidden border border-white/[0.1] bg-[#18181B] min-h-[250px] p-6 sm:p-7 flex flex-col justify-between">
                  <img
                    src={f1Backdrop}
                    alt="Smart TV"
                    className="absolute inset-0 w-full h-full object-cover opacity-25"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0E0E10] via-[#0E0E10]/85 to-[#0E0E10]/40" />
                  <div className="relative z-10 flex items-center gap-2 text-xs font-semibold text-sky-300">
                    <Tv className="w-4 h-4" />
                    <span>Modo Receptor Smart TV (/tv)</span>
                  </div>
                  <div className="relative z-10 space-y-2 mt-10">
                    <h3 className="font-display font-bold text-xl sm:text-2xl text-white">
                      Del Móvil a tu Televisión en 4 Dígitos
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                      Abre <span className="font-mono text-white">{displayHost}/tv</span> en tu
                      Samsung, LG o Android TV y usa tu móvil como mando a distancia.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <footer className="px-7 sm:px-14 py-10 bg-[#18181B] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="flex items-center gap-3">
                  <NaimBrandLogo size={42} />
                  <span className="font-display font-extrabold text-2xl text-white tracking-tight">
                    NAIM CINE
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-400">
                  Entra gratis desde navegador, móvil, tablet o Smart TV. Crea tu sala en un toque
                  y comparte cine, series y deporte en directo en máxima calidad.
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-3 text-xs font-mono text-zinc-300">
                  <span className="text-white font-bold">{displayHost}</span>
                  <span className="text-zinc-600">·</span>
                  <span>Web · iOS · Android · Smart TV</span>
                </div>
              </div>

              <div className="flex items-center gap-5 p-4 rounded-3xl bg-white/[0.05] border border-white/[0.14] shrink-0">
                <div className="p-2.5 rounded-2xl bg-white shadow-lg">
                  <QRCodeSVG value={publicUrl} size={120} level="H" />
                </div>
                <div className="pr-2">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">
                    Acceso Directo
                  </div>
                  <div className="font-display font-extrabold text-lg text-white mt-0.5">
                    Escanea y entra gratis
                  </div>
                  <div className="text-xs font-mono text-zinc-300 mt-1">{displayHost}</div>
                </div>
              </div>
            </footer>
          </div>
        )}

        {/* ================================================================== */}
        {/* FORMAT 4: 16:9 KEYNOTE / SOCIAL WIDE BILLBOARD                     */}
        {/* ================================================================== */}
        {format === 'landscape' && (
          <div className="w-full overflow-x-auto pb-4 flex justify-center">
            <div
              ref={captureRef}
              className="w-[1120px] min-w-[1120px] aspect-[16/9] rounded-[32px] bg-[#0E0E10] border border-white/[0.12] p-11 flex flex-col justify-between relative overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.92)]"
            >
              <img
                src={stadiumBackdrop}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-20"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0E0E10] via-[#0E0E10]/90 to-[#0E0E10]/70" />

              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <NaimBrandLogo size={46} />
                  <div>
                    <div className="font-display font-extrabold text-xl text-white tracking-tight">
                      NAIM CINE
                    </div>
                    <div className="text-xs text-zinc-400">
                      El Cine, las Series y el Deporte en Vivo · Todo en Uno
                    </div>
                  </div>
                </div>
                <div className="text-xs font-mono text-zinc-200 px-4 py-2 rounded-full bg-white/[0.06] border border-white/[0.12]">
                  1080p HD · Sin Anuncios · Watch Party + Smart TV
                </div>
              </div>

              <div className="relative z-10 grid grid-cols-12 gap-8 items-center">
                <div className="col-span-7 space-y-4">
                  <h1 className="font-display font-extrabold text-[44px] text-white leading-[1.04] tracking-[-0.03em]">
                    Todas las plataformas y la TV en directo en una sola sala.
                  </h1>
                  <p className="text-base text-zinc-300 leading-relaxed max-w-xl">
                    Estrenos de cine, series completas, LaLiga, Champions, F1, TDT con Guía EPG
                    real, Anime, Castellano y Català. Sincronizado en vivo con amigos y Smart TV.
                  </p>
                  <div className="pt-2 flex items-center gap-5 text-xs font-semibold text-zinc-200">
                    <span className="flex items-center gap-1.5">
                      <Film className="w-4 h-4 text-white" /> Cine & Series 1080p
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-emerald-400" /> +50 Canales EPG Vivo
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Columns2 className="w-4 h-4 text-sky-400" /> Multiview & Smart TV
                    </span>
                  </div>
                </div>

                <div className="col-span-5 grid grid-cols-3 gap-2.5">
                  {[
                    { mark: 'NETFLIX', sub: 'Cine & Series', color: '#E50914' },
                    { mark: 'HBO MAX', sub: 'Originals HD', color: '#8B5CF6' },
                    { mark: 'Disney+', sub: 'Marvel & Star', color: '#3B82F6' },
                    { mark: 'PRIME', sub: 'Amazon Video', color: '#38BDF8' },
                    { mark: 'tv+', sub: 'Apple TV+', color: '#FFFFFF' },
                    { mark: 'M+', sub: 'Movistar+ Vivo', color: '#019DF4' },
                    { mark: 'DAZN', sub: 'LaLiga & F1', color: '#F4F4F5' },
                    { mark: 'TDT', sub: 'TV + Guía EPG', color: '#34D399' },
                    { mark: 'ANIME', sub: 'Crunchy & Más', color: '#FB923C' },
                    { mark: 'ES · HD', sub: 'Todo Castellano', color: '#FBBF24' },
                    { mark: 'CAT · SX3', sub: 'Anime Català', color: '#BF94FF' },
                    { mark: 'YOUTUBE', sub: 'Sala Común', color: '#EF4444' },
                  ].map((b) => (
                    <div
                      key={b.mark}
                      className="p-3 rounded-2xl bg-[#18181B]/95 border border-white/[0.1] flex flex-col items-center justify-center text-center"
                    >
                      <span
                        className="font-display font-black text-sm tracking-tight leading-none"
                        style={{ color: b.color }}
                      >
                        {b.mark}
                      </span>
                      <span className="text-[10px] text-zinc-400 mt-1">{b.sub}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative z-10 pt-4 border-t border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-6 text-xs text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-zinc-400" /> Web & PC
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-zinc-400" /> App iOS & Android
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Tv className="w-4 h-4 text-zinc-400" /> Samsung · LG · Android TV
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-zinc-400" /> Salas Privadas con PIN
                  </span>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">{displayHost}</div>
                    <div className="text-xs text-emerald-400 font-semibold">
                      Escanea y entra gratis
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-white shadow-lg">
                    <QRCodeSVG value={publicUrl} size={76} level="H" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
