import React, { useState } from 'react';
import { Download, Sparkles } from 'lucide-react';
import { RiffanBrandLogo } from '../NaimBrandLogo';
import { RiffanIntroLogoSvg } from '../NaimcineIntro';
import * as RiffanIcons from '../ui/RiffanIcons';
import { triggerHaptic } from '../../utils/haptics';

interface DesignLogosTabProps {
  onDownloadLogoSvg: (name: string, svgContent: string) => void;
  onDownloadLogoPng: (elementId: string, filename: string) => void;
}

export const DesignLogosTab: React.FC<DesignLogosTabProps> = ({
  onDownloadLogoSvg,
  onDownloadLogoPng,
}) => {
  const [introReplayKey, setIntroReplayKey] = useState(0);
  const [wordmarkReplayKey, setWordmarkReplayKey] = useState(0);
  const [loaderReplayKey, setLoaderReplayKey] = useState(0);

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="p-5 rounded-3xl bg-[#0F111D] border border-white/10 space-y-1">
        <h2 className="text-base sm:text-lg font-display font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#9146FF]" />
          <span>Identidad Animada & Kit de Logos Oficiales</span>
        </h2>
        <p className="text-xs text-zinc-400">
          Logo R animado de bienvenida, Wordmark cinematográfico, Loader perpetuo en bucle y variantes SVG/PNG descargables.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#C084FC]">
                Intro Principal SVG
              </span>
              <h3 className="text-base font-bold text-white mt-0.5">Logo R Animado (Splash)</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIntroReplayKey((k) => k + 1);
              }}
              className="min-h-9 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RiffanIcons.RiffanRetryIcon size={14} animate="hover" />
              <span>Repetir</span>
            </button>
          </div>

          <div className="py-5 flex items-center justify-center bg-black/60 rounded-2xl border border-white/10 min-h-[190px]">
            <div key={introReplayKey} className="w-36 h-36">
              <RiffanIntroLogoSvg />
            </div>
          </div>

          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Placa oscura con bisel metálico animado, trazado secuencial en 3 tiempos, estela cometa en el arco, destello soft-light y brillo diagonal.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#38BDF8]">
                Cabecera & Marca
              </span>
              <h3 className="text-base font-bold text-white mt-0.5">RiffanTV Animated Lockup</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setWordmarkReplayKey((k) => k + 1);
              }}
              className="min-h-9 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RiffanIcons.RiffanRetryIcon size={14} animate="hover" />
              <span>Repetir</span>
            </button>
          </div>

          <div className="py-5 px-4 flex items-center justify-center bg-black/60 rounded-2xl border border-white/10 min-h-[190px]">
            <RiffanIcons.RiffanAnimatedLogo key={wordmarkReplayKey} width={260} height={74} animate="always" />
          </div>

          <p className="text-[11px] text-zinc-400 leading-relaxed">
            SVG compuesto (420×120) con isotipo trazado al vuelo y entrada tipográfica escalonada de RiffanTV · Ultra HD Streaming.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#00F593]">
                Carga en Bucle · 6,8s
              </span>
              <h3 className="text-base font-bold text-white mt-0.5">Loader R Perpetuo</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setLoaderReplayKey((k) => k + 1);
              }}
              className="min-h-9 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RiffanIcons.RiffanRetryIcon size={14} animate="hover" />
              <span>Reiniciar</span>
            </button>
          </div>

          <div
            key={loaderReplayKey}
            className="py-5 px-4 flex items-center justify-center gap-6 bg-black/60 rounded-2xl border border-white/10 min-h-[190px]"
          >
            <div className="flex flex-col items-center gap-2">
              <RiffanIcons.RiffanLoaderR size={78} animate="always" />
              <span className="text-[10px] font-mono text-zinc-400">78px · Hero</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <RiffanIcons.RiffanLoaderR size={52} animate="always" />
              <span className="text-[10px] font-mono text-zinc-400">52px · Player</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <RiffanIcons.RiffanLoaderR size={32} animate="always" />
              <span className="text-[10px] font-mono text-zinc-400">32px · Mini</span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Traza tallo → arco con cometa → pierna, se vacía por el extremo opuesto y vuelve a llenarse en sentido inverso de forma infinita.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div id="logo-box-full" className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF]">Variante Principal</span>
            <h3 className="text-base font-bold text-white mt-1">Logo Completo Horizontal (R + Wordmark)</h3>
          </div>
          <div className="py-6 flex items-center justify-center bg-black/50 rounded-2xl border border-white/10">
            <div className="flex items-center gap-3">
              <RiffanBrandLogo size={52} withFrame frameStyle="glass" />
              <div>
                <span className="font-display font-black text-2xl tracking-tight text-white block">
                  Riffan<span className="text-[#9146FF]">TV</span>
                </span>
                <span className="text-[10px] tracking-widest uppercase font-bold text-zinc-400">ULTRA HD STREAMING</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onDownloadLogoSvg(
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
              onClick={() => onDownloadLogoPng('logo-box-full', 'riffantv-logo-full')}
              className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar PNG</span>
            </button>
          </div>
        </div>

        <div id="logo-box-mark" className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#00F0FF]">Icono de Aplicación</span>
            <h3 className="text-base font-bold text-white mt-1">Isotipo Oficial (Cresta de Cinta 3D)</h3>
          </div>
          <div className="py-6 flex items-center justify-center bg-black/50 rounded-2xl border border-white/10">
            <RiffanBrandLogo size={68} withFrame frameStyle="glass" />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onDownloadLogoSvg(
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
              onClick={() => onDownloadLogoPng('logo-box-mark', 'riffantv-mark')}
              className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar PNG</span>
            </button>
          </div>
        </div>

        <div id="logo-box-tv" className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Google TV Edition</span>
            <h3 className="text-base font-bold text-white mt-1">Emblema Google TV & Smart TV 10-Foot</h3>
          </div>
          <div className="py-6 flex items-center justify-center bg-black/50 rounded-2xl border border-white/10">
            <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-[#181A2A] border border-amber-400/30 shadow-[0_0_24px_rgba(251,191,36,0.15)]">
              <RiffanBrandLogo size={42} withFrame frameStyle="glass" />
              <div>
                <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <span>RIFFANTV</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[9px] font-mono">TV</span>
                </div>
                <p className="text-[10px] text-zinc-400">Leanback Physical Remote</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onDownloadLogoSvg(
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
              onClick={() => onDownloadLogoPng('logo-box-tv', 'riffantv-smart-tv-badge')}
              className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar PNG</span>
            </button>
          </div>
        </div>

        <div id="logo-box-mono" className="p-6 rounded-3xl bg-[#111320] border border-white/10 flex flex-col justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Monocromo Puro</span>
            <h3 className="text-base font-bold text-white mt-1">Versión Blanco / Negro Alto Contraste</h3>
          </div>
          <div className="py-6 flex items-center justify-center bg-black/50 rounded-2xl border border-white/10">
            <div className="flex items-center gap-3">
              <RiffanBrandLogo size={48} variant="monochrome" withFrame={false} />
              <span className="font-display font-black text-2xl tracking-tight text-white">RIFFANTV</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onDownloadLogoSvg(
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
              onClick={() => onDownloadLogoPng('logo-box-mono', 'riffantv-logo-monochrome')}
              className="flex-1 min-h-10 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar PNG</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
