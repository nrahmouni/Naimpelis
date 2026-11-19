import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Download, Film, Loader2, Mic, Trophy, Tv, Users } from 'lucide-react';
import { RiffanBrandLogo } from '../NaimBrandLogo';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg, type FlagCode } from '../ui/LanguageBadge';

export type PosterLanguage = 'es' | 'en' | 'zh';
export type PosterFormat = 'vertical' | 'story' | 'landscape';

export const POSTER_I18N = {
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
    footerUrl: 'riffantv.ai.studio · Cine, Fútbol y Salas Multijugador',
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
    footerUrl: 'riffantv.ai.studio · Cinema, World Football & Live Watch Parties',
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
    footerUrl: 'riffantv.ai.studio · 高清电影 · 顶级足球直播 · 多人连麦影院',
  },
};

interface DesignPostersTabProps {
  posterLang: PosterLanguage;
  onChangePosterLang: (l: PosterLanguage) => void;
  posterFormat: PosterFormat;
  onChangePosterFormat: (f: PosterFormat) => void;
  isExporting: boolean;
  exportNotice: string | null;
  posterPreviewRef: React.RefObject<HTMLDivElement | null>;
  onDownloadPoster: () => void;
}

export const DesignPostersTab: React.FC<DesignPostersTabProps> = ({
  posterLang,
  onChangePosterLang,
  posterFormat,
  onChangePosterFormat,
  isExporting,
  exportNotice,
  posterPreviewRef,
  onDownloadPoster,
}) => {
  const curCopy = POSTER_I18N[posterLang];

  return (
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
                onChangePosterLang(l.id);
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
                onChangePosterFormat(f.id as PosterFormat);
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

        <button
          type="button"
          onClick={onDownloadPoster}
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
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#9146FF]/25 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[#00F0FF]/18 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.04] via-transparent to-black/60" />

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

          <div className="relative z-10 my-4 space-y-2">
            <span className="inline-block px-3 py-1 rounded-full bg-[#9146FF]/30 border border-[#9146FF]/40 text-[#D8B4FE] text-[11px] font-bold uppercase tracking-wider">
              {curCopy.zeroAdsBadge}
            </span>
            <h3 className="font-display font-black text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-tight bg-gradient-to-r from-white via-zinc-100 to-[#D8B4FE] bg-clip-text text-transparent">
              {curCopy.heroSubtitle}
            </h3>
          </div>

          <div
            className={`relative z-10 grid gap-2.5 my-3 ${
              posterFormat === 'landscape' ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-[#BF94FF] flex items-center justify-center shrink-0">
                <Film className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white">{curCopy.f1Title}</h4>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{curCopy.f1Desc}</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white">{curCopy.f2Title}</h4>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{curCopy.f2Desc}</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                <Tv className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white">{curCopy.f3Title}</h4>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{curCopy.f3Desc}</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-fuchsia-500/20 text-fuchsia-300 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white">{curCopy.f4Title}</h4>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{curCopy.f4Desc}</p>
              </div>
            </div>

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

          <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold text-zinc-200">{curCopy.cta}</p>
              <p className="text-[10px] text-[#BF94FF] font-mono mt-0.5">{curCopy.footerUrl}</p>
            </div>

            <div className="w-12 h-12 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow-lg">
              <QRCodeSVG value="https://riffantv.ai.studio" size={40} level="M" includeMargin={false} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
