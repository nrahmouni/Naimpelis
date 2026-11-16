import React, { useRef, useState } from 'react';
import { domToPng } from 'modern-screenshot';
import {
  ArrowLeft,
  Check,
  Download,
  Film,
  Gamepad2,
  Globe,
  Layers,
  Loader2,
  Mic,
  Palette,
  Play,
  QrCode,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Tv,
  Users,
  Zap,
} from 'lucide-react';
import { useThemeStore } from '../store/useThemeStore';
import type { AppTheme } from '../types';
import { RiffanBrandLogo } from './NaimBrandLogo';
import {
  IconButton,
  PrimaryButton,
  SecondaryButton,
} from './ui/DesignSystem';
import { triggerHaptic } from '../utils/haptics';
import { FlagBadgeSvg, type FlagCode } from './ui/LanguageBadge';

interface DesignSystemShowcaseProps {
  onClose?: () => void;
}

type PosterLanguage = 'es' | 'en' | 'zh';
type PosterFormat = 'vertical' | 'story' | 'landscape';

const POSTER_I18N = {
  es: {
    tag: 'PLATAFORMA DEFINITIVA DE STREAMING',
    heroTitle: 'RIFFANTV',
    heroSubtitle: 'Cine 1080p · Fútbol Mundial · Google TV · Salas con Amigos',
    zeroAdsBadge: 'SIN PUBLICIDAD INVASIVA · ULTRA HD',
    f1Title: 'Cine & Estrenos 1080p',
    f1Desc: 'Películas, series y anime en alta definición sin cortes ni popups.',
    f2Title: 'Fútbol en Directo',
    f2Desc: 'Champions League, LaLiga EA Sports y Premier League con canales españoles, beIN árabe y CCTV/Migu chino.',
    f3Title: 'APK Google TV con Mando',
    f3Desc: 'Experiencia 10-foot para televisor, navegación fluida con mando a distancia físico.',
    f4Title: 'Salas con Voz y Minijuegos',
    f4Desc: 'Salas sincronizadas con chat de voz y juegos: billar 8-ball, ajedrez, pinturillo y chapas.',
    f5Title: 'Asistente por Voz con IA',
    f5Desc: '«Hola, ¿qué quieres ver hoy?» Pide canales, capítulos o partidos con tu voz.',
    cta: 'Descarga gratis el APK o disfruta online en cualquier navegador',
    footerUrl: 'riffantv.app · Cine, Fútbol y Salas Multijugador',
  },
  en: {
    tag: 'THE ULTIMATE STREAMING PLATFORM',
    heroTitle: 'RIFFANTV',
    heroSubtitle: '1080p Cinema · Global Football · Google TV · Social Watch Party',
    zeroAdsBadge: 'ZERO POPUP ADS · ULTRA HD STREAMING',
    f1Title: '1080p Cinema & Releases',
    f1Desc: 'Blockbusters, trending shows and anime in crystal-clear HD with zero ad interruptions.',
    f2Title: 'Live World Football',
    f2Desc: 'Champions League, LaLiga & Premier League via official Spanish, Arabic beIN and Chinese CCTV/Migu feeds.',
    f3Title: 'Google TV APK with Physical Remote',
    f3Desc: '10-foot leanback smart TV experience with seamless physical D-pad remote control.',
    f4Title: 'Watch Party & Minigames',
    f4Desc: 'Synchronized rooms with live voice chat plus 8-ball pool, chess, scribbl and checkers.',
    f5Title: 'AI Voice Assistant',
    f5Desc: '“Hi, what do you want to watch today?” Instant voice tuning for channels, episodes, and matches.',
    cta: 'Download free Android & TV APK or watch instantly in any browser',
    footerUrl: 'riffantv.app · Cinema, World Football & Live Watch Parties',
  },
  zh: {
    tag: '全能高清流媒体与体育互动平台',
    heroTitle: 'RIFFANTV',
    heroSubtitle: '1080P院线 · 欧冠西甲英超直播 · Google TV专属 · 实时多人影院',
    zeroAdsBadge: '零弹窗广告 · 全高清极速秒开',
    f1Title: '1080P院线大片与热播剧集',
    f1Desc: '海量热门电影、同步连载美剧日漫，无弹窗纯净观看。',
    f2Title: '现场足球全球直播',
    f2Desc: '欧冠、西甲、英超现场直击，涵盖西班牙官方频道、阿拉伯beIN体育与CCTV-5/咪咕体育原生中文解说。',
    f3Title: 'Google TV / 电视端APK',
    f3Desc: '专为大屏打造的10英尺沙发体验，支持物理遥控器方向键无缝操控。',
    f4Title: '实时语音观影室与小游戏',
    f4Desc: '多好友画面毫秒级同步，支持低延迟语音连麦与内置台球、国际象棋、你画我猜小游戏。',
    f5Title: 'AI智能声控助手',
    f5Desc: '“你好！今天想看什么？” 一句话声控点播剧集、换台或查询焦点赛事。',
    cta: '立即免费下载电视端APK或在浏览器直接观看',
    footerUrl: 'riffantv.app · 高清电影 · 顶级足球直播 · 多人连麦影院',
  },
};

export const DesignSystemShowcase: React.FC<DesignSystemShowcaseProps> = ({ onClose }) => {
  const { theme, density, liteMode, reducedMotion, setTheme, setDensity, setLiteMode, setReducedMotion } =
    useThemeStore();

  const [activeTab, setActiveTab] = useState<'posters' | 'logos' | 'tokens' | 'components'>('posters');
  const [posterLang, setPosterLang] = useState<PosterLanguage>('es');
  const [posterFormat, setPosterFormat] = useState<PosterFormat>('vertical');
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const posterPreviewRef = useRef<HTMLDivElement>(null);

  const themeOptions: Array<{ id: AppTheme; label: string; desc: string }> = [
    { id: 'oled', label: 'OLED Negro Puro', desc: '#08090d · Contraste máximo' },
    { id: 'soft-dark', label: 'Soft Dark', desc: '#10131c · Pizarra cinematográfica' },
    { id: 'high-contrast', label: 'Alto Contraste', desc: '#000000 · Texto ≥7:1 AAA' },
  ];

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

  const curCopy = POSTER_I18N[posterLang];

  return (
    <div className="min-h-dvh bg-[#07080D] text-zinc-100 p-4 sm:p-8 pb-24 font-sans select-none">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
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

          <div className="flex items-center gap-2">
            {onClose && (
              <SecondaryButton onClick={onClose}>
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a la app</span>
              </SecondaryButton>
            )}
          </div>
        </header>

        {/* Tab Switcher */}
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
                setActiveTab(id as any);
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

        {/* =================================================================== */}
        {/* TAB 1: CARTELES DE PUBLICIDAD (ADVERTISING POSTERS IN 3 LANGUAGES) */}
        {/* =================================================================== */}
        {activeTab === 'posters' && (
          <section className="space-y-6 animate-fade-in">
            <div className="p-5 rounded-3xl bg-[#0F111D] border border-white/10 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-display font-bold text-white flex items-center gap-2">
                  <Film className="w-5 h-5 text-[#9146FF]" />
                  <span>Carteles Publicitarios Oficiales de RiffanTV</span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Posters de alta gama listos para marketing en redes, Smart TV o prensa. Descárgalos con 1 clic en PNG Ultra-HD.
                </p>
              </div>

              {/* Language Selector: ES | EN | ZH */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-black/60 border border-white/10">
                {(
                  [
                    { id: 'es', flagCode: 'es', label: 'Castellano' },
                    { id: 'en', flagCode: 'uk', label: 'English' },
                    { id: 'zh', flagCode: 'cn', label: '中文 (简体)' },
                  ] as const satisfies readonly { id: PosterLanguage; flagCode: FlagCode; label: string }[]
                ).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPosterLang(l.id as PosterLanguage);
                    }}
                    className={`min-h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                      posterLang === l.id
                        ? 'bg-[#9146FF] text-white'
                        : 'text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <FlagBadgeSvg code={l.flagCode} className="w-4 h-2.5 shrink-0" />
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>

              {/* Format Selector: Vertical | Story | Landscape */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-black/60 border border-white/10">
                {[
                  { id: 'vertical', label: 'Póster (4:5)' },
                  { id: 'story', label: 'Historia (9:16)' },
                  { id: 'landscape', label: 'Billboard (16:9)' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPosterFormat(f.id as PosterFormat);
                    }}
                    className={`min-h-8 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      posterFormat === f.id
                        ? 'bg-white/20 text-white'
                        : 'text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Download Action */}
              <button
                type="button"
                onClick={handleDownloadPoster}
                disabled={isExporting}
                className="min-h-11 px-5 rounded-xl bg-gradient-to-r from-[#9146FF] to-[#00F0FF] hover:opacity-95 active:scale-95 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-[0_8px_24px_rgba(145,70,255,0.45)] cursor-pointer transition-all"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <Download className="w-4 h-4 text-slate-950" />
                )}
                <span>Descargar Cartel PNG (Ultra-HD)</span>
              </button>
            </div>

            {exportNotice && (
              <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-semibold text-emerald-200 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{exportNotice}</span>
              </div>
            )}

            {/* Poster Canvas Preview */}
            <div className="flex justify-center p-4 sm:p-8 bg-black/70 rounded-3xl border border-white/10 overflow-x-auto">
              <div
                ref={posterPreviewRef}
                className={`relative overflow-hidden bg-gradient-to-br from-[#0A0B12] via-[#0E101B] to-[#06070B] border border-white/[0.14] shadow-[0_30px_100px_rgba(0,0,0,0.9),0_0_60px_rgba(145,70,255,0.2)] text-white flex flex-col justify-between ${
                  posterFormat === 'vertical'
                    ? 'w-[520px] min-h-[650px] p-8 rounded-3xl'
                    : posterFormat === 'story'
                    ? 'w-[420px] min-h-[746px] p-7 rounded-3xl'
                    : 'w-[840px] min-h-[472px] p-9 rounded-3xl'
                }`}
              >
                {/* Background Ambient FX */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#9146FF]/25 blur-3xl"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[#00F0FF]/18 blur-3xl"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.04] via-transparent to-black/60"
                />

                {/* Top Bar: Brand Logo & Quality Badges */}
                <div className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <RiffanBrandLogo size={44} withFrame frameStyle="glass" />
                    <div>
                      <span className="font-display font-extrabold text-xl tracking-tight text-white block">
                        RIFFANTV
                      </span>
                      <span className="text-[10px] tracking-widest uppercase font-bold text-[#BF94FF]">
                        {curCopy.tag}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-[#00F0FF]/15 border border-[#00F0FF]/30 text-[#00F0FF] text-[10px] font-bold tracking-wider">
                      4K HDR
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold tracking-wider">
                      1080P PRO
                    </span>
                  </div>
                </div>

                {/* Main Hero Message */}
                <div className="relative z-10 my-4 space-y-2">
                  <span className="inline-block px-3 py-1 rounded-full bg-[#9146FF]/30 border border-[#9146FF]/40 text-[#D8B4FE] text-[11px] font-bold uppercase tracking-wider">
                    {curCopy.zeroAdsBadge}
                  </span>
                  <h3 className="font-display font-black text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-tight bg-gradient-to-r from-white via-zinc-100 to-[#D8B4FE] bg-clip-text text-transparent">
                    {curCopy.heroSubtitle}
                  </h3>
                </div>

                {/* 5 Core Feature Blocks */}
                <div
                  className={`relative z-10 grid gap-2.5 my-3 ${
                    posterFormat === 'landscape' ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
                  }`}
                >
                  {/* Feature 1 */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-[#BF94FF] flex items-center justify-center shrink-0">
                      <Film className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white">{curCopy.f1Title}</h4>
                      <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{curCopy.f1Desc}</p>
                    </div>
                  </div>

                  {/* Feature 2 */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white">{curCopy.f2Title}</h4>
                      <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{curCopy.f2Desc}</p>
                    </div>
                  </div>

                  {/* Feature 3 */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                      <Tv className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white">{curCopy.f3Title}</h4>
                      <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{curCopy.f3Desc}</p>
                    </div>
                  </div>

                  {/* Feature 4 */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-fuchsia-500/20 text-fuchsia-300 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white">{curCopy.f4Title}</h4>
                      <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{curCopy.f4Desc}</p>
                    </div>
                  </div>

                  {/* Feature 5 */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5 col-span-1 sm:col-span-2">
                    <div className="w-8 h-8 rounded-xl bg-[#00F0FF]/20 text-[#00F0FF] flex items-center justify-center shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white">{curCopy.f5Title}</h4>
                      <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{curCopy.f5Desc}</p>
                    </div>
                  </div>
                </div>

                {/* Bottom Callout & Footer Bar */}
                <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-200">{curCopy.cta}</p>
                    <p className="text-[10px] text-[#BF94FF] font-mono mt-0.5">{curCopy.footerUrl}</p>
                  </div>

                  <div className="w-12 h-12 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow-lg">
                    <QrCode className="w-10 h-10 text-black" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* TAB 2: LOGOS OFICIALES Y MARCA (SVG & PNG DOWNLOADS) */}
        {/* =================================================================== */}
        {activeTab === 'logos' && (
          <section className="space-y-6 animate-fade-in">
            <div className="p-5 rounded-3xl bg-[#0F111D] border border-white/10 space-y-1">
              <h2 className="text-base sm:text-lg font-display font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#9146FF]" />
                <span>Kit de Logos Oficiales de RiffanTV</span>
              </h2>
              <p className="text-xs text-zinc-400">
                Variantes vectoriales y de imagen con transparencia para desarrollo, aplicaciones, overlays de OBS y cartelería.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Logo 1: Full Horizontal Lockup */}
              <div
                id="logo-box-full"
                className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF]">
                    Variante Principal
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">Logo Completo Horizontal (R + Wordmark)</h3>
                </div>

                <div className="py-6 flex items-center justify-center bg-black/50 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-3">
                    <RiffanBrandLogo size={52} withFrame frameStyle="glass" />
                    <div>
                      <span className="font-display font-black text-2xl tracking-tight text-white block">
                        Riffan<span className="text-[#9146FF]">TV</span>
                      </span>
                      <span className="text-[10px] tracking-widest uppercase font-bold text-zinc-400">
                        ULTRA HD STREAMING
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadLogoSvg(
                        'riffantv-logo-full',
                        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" fill="none"><rect width="100%" height="100%" fill="#0B0C12"/><text x="110" y="62" font-family="sans-serif" font-weight="900" font-size="44" fill="#ffffff">Riffan<tspan fill="#9146FF">TV</tspan></text></svg>`
                      )
                    }
                    className="flex-1 min-h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar SVG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadLogoPng('logo-box-full', 'riffantv-logo-full')}
                    className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar PNG</span>
                  </button>
                </div>
              </div>

              {/* Logo 2: Square App Icon Mark */}
              <div
                id="logo-box-mark"
                className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#00F0FF]">
                    Icono de Aplicación
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">Isotipo Oficial (Cresta de Cinta 3D)</h3>
                </div>

                <div className="py-6 flex items-center justify-center bg-black/50 rounded-2xl border border-white/10">
                  <RiffanBrandLogo size={68} withFrame frameStyle="glass" />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadLogoSvg(
                        'riffantv-mark',
                        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><rect width="100%" height="100%" rx="30" fill="#10121C"/><text x="35" y="75" font-family="sans-serif" font-weight="900" font-size="54" fill="#9146FF">R</text></svg>`
                      )
                    }
                    className="flex-1 min-h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar SVG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadLogoPng('logo-box-mark', 'riffantv-mark')}
                    className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar PNG</span>
                  </button>
                </div>
              </div>

              {/* Logo 3: Smart TV 10-Foot Crest */}
              <div
                id="logo-box-tv"
                className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Google TV Edition
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">Emblema Google TV & Smart TV 10-Foot</h3>
                </div>

                <div className="py-6 flex items-center justify-center bg-black/50 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-[#181A2A] border border-amber-400/30 shadow-[0_0_24px_rgba(251,191,36,0.15)]">
                    <RiffanBrandLogo size={42} withFrame frameStyle="glass" />
                    <div>
                      <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                        <span>RIFFANTV</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[9px] font-mono">
                          TV
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400">Leanback Physical Remote</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadLogoSvg(
                        'riffantv-smart-tv-badge',
                        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80" fill="none"><rect width="100%" height="100%" rx="16" fill="#181A2A" stroke="#FBBF24"/><text x="40" y="50" font-family="sans-serif" font-weight="900" font-size="28" fill="#ffffff">RIFFANTV TV</text></svg>`
                      )
                    }
                    className="flex-1 min-h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar SVG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadLogoPng('logo-box-tv', 'riffantv-smart-tv-badge')}
                    className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar PNG</span>
                  </button>
                </div>
              </div>

              {/* Logo 4: Monochrome Clean */}
              <div
                id="logo-box-mono"
                className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Monocromo Puro
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">Versión Blanco / Negro Alto Contraste</h3>
                </div>

                <div className="py-6 flex items-center justify-center bg-black/50 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-3">
                    <RiffanBrandLogo size={48} variant="monochrome" withFrame={false} />
                    <span className="font-display font-black text-2xl tracking-tight text-white">
                      RIFFANTV
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadLogoSvg(
                        'riffantv-logo-monochrome',
                        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none"><text x="20" y="42" font-family="sans-serif" font-weight="900" font-size="32" fill="#ffffff">RIFFANTV</text></svg>`
                      )
                    }
                    className="flex-1 min-h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar SVG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadLogoPng('logo-box-mono', 'riffantv-logo-monochrome')}
                    className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar PNG</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* TAB 3: PALETA OBSIDIAN & TOKENS SEMÁNTICOS */}
        {/* =================================================================== */}
        {activeTab === 'tokens' && (
          <section className="space-y-6 animate-fade-in">
            {/* Theme switcher */}
            <div className="p-5 rounded-3xl bg-[#0F111D] border border-white/10 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Palette className="w-4 h-4 text-[#BF94FF]" />
                <span>Temas Semánticos & Rendimiento</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTheme(opt.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      theme === opt.id
                        ? 'border-[#9146FF] bg-[#9146FF]/15'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span>{opt.label}</span>
                      {theme === opt.id && <Check className="w-4 h-4 text-[#BF94FF]" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SecondaryButton
                  onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
                  active={density === 'compact'}
                >
                  <span>Densidad: {density === 'compact' ? 'Compacta' : 'Cómoda'}</span>
                </SecondaryButton>
                <SecondaryButton onClick={() => setLiteMode(!liteMode, true)} active={liteMode}>
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Modo Lite GPU: {liteMode ? 'ON' : 'OFF'}</span>
                </SecondaryButton>
                <SecondaryButton onClick={() => setReducedMotion(!reducedMotion)} active={reducedMotion}>
                  <span>Movimiento reducido: {reducedMotion ? 'ON' : 'OFF'}</span>
                </SecondaryButton>
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Paleta Cromática Obsidian (60-30-10)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { name: 'Canvas Obsidian', hex: '#0B0C12', role: '60% Fondo general' },
                  { name: 'Elevated Surface', hex: '#10121C', role: '30% Tarjetas' },
                  { name: 'Electric Violet', hex: '#9146FF', role: '10% Acción primaria' },
                  { name: 'Cyber Cyan', hex: '#00F0FF', role: 'Acentos 4K / Estreno' },
                  { name: 'Live Emerald', hex: '#00F593', role: 'Emisión en directo' },
                ].map(({ name, hex, role }) => (
                  <div key={name} className="p-3 rounded-2xl bg-[#10121C] border border-white/10 space-y-2">
                    <div className="h-14 rounded-xl border border-white/15" style={{ backgroundColor: hex }} />
                    <div>
                      <p className="text-xs font-bold text-white">{name}</p>
                      <p className="font-mono text-[11px] text-[#BF94FF]">{hex}</p>
                      <p className="text-[10px] text-zinc-400">{role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* TAB 4: COMPONENTES & UI KIT */}
        {/* =================================================================== */}
        {activeTab === 'components' && (
          <section className="space-y-6 animate-fade-in">
            <div className="p-5 rounded-3xl bg-[#0F111D] border border-white/10 space-y-4">
              <h3 className="text-sm font-bold text-white">Botones y Acciones de la Plataforma</h3>
              <div className="flex flex-wrap items-center gap-3">
                <PrimaryButton size="md">
                  <Play className="w-4 h-4 fill-current" />
                  <span>Reproducir en HD</span>
                </PrimaryButton>
                <SecondaryButton>
                  <Share2 className="w-4 h-4" />
                  <span>Compartir Sala</span>
                </SecondaryButton>
                <button
                  type="button"
                  className="min-h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Partido en Directo</span>
                </button>
                <button
                  type="button"
                  className="min-h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Google TV Mando</span>
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
