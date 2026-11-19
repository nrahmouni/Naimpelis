import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Columns2, Play, Tv, Users, Zap } from 'lucide-react';
import { NaimBrandLogo } from '../NaimBrandLogo';
import { ProAdLogoPill } from './AdBrandTiles';
import stadiumBackdrop from '../../assets/images/esports_arena_live_1794673806740.webp';
import cinemaHeroBackdrop from '../../assets/images/cinema_hero_lobby_1794353709142.webp';

interface AdFlyerProps {
  captureRef: React.RefObject<HTMLDivElement | null>;
  publicUrl: string;
  displayHost: string;
}

export const VerticalPosterAd: React.FC<AdFlyerProps> = ({ captureRef, publicUrl, displayHost }) => (
  <div className="w-full flex justify-center">
    <div
      ref={captureRef}
      className="w-[540px] max-w-full rounded-[28px] bg-[#0E0E10] border border-white/[0.15] p-7 sm:p-8 flex flex-col justify-between gap-6 relative overflow-hidden shadow-[0_40px_130px_rgba(0,0,0,0.96)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] overflow-hidden">
        <img src={cinemaHeroBackdrop} alt="" className="w-full h-full object-cover opacity-30 scale-105" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0E0E10]/40 via-[#0E0E10]/85 to-[#0E0E10]" />
      </div>

      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-[300px] rounded-full opacity-50 blur-[95px]"
        style={{
          background:
            'radial-gradient(circle, rgba(145,70,255,0.68) 0%, rgba(1,157,244,0.28) 52%, transparent 78%)',
        }}
      />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <NaimBrandLogo size={46} />
          <div>
            <div className="font-display font-black text-xl text-white tracking-tight leading-none">
              Riffan<span className="text-[#A78BFA]">TV</span>
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

      <div className="relative z-10 space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <span>Catálogo y Canales Incluidos</span>
          <span className="text-emerald-400 font-mono tabular-nums">+50 Canales en Vivo</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ProAdLogoPill bg="#E50914" badge="N" name="Netflix" detail="Cine & Series" />
          <ProAdLogoPill bg="#5B21B6" badge="MAX" name="HBO Max" detail="Series Top" />
          <ProAdLogoPill bg="#0063E5" badge="D+" name="Disney+" detail="Marvel & Star" />
          <ProAdLogoPill bg="#00A8E1" textColor="#04121A" badge="PRIME" name="Prime Video" detail="Originals HD" />
          <ProAdLogoPill bg="#F4F4F5" textColor="#0E0E10" badge="tv+" name="Apple TV+" detail="Exclusivas" />
          <ProAdLogoPill bg="#019DF4" badge="M+" name="Movistar+" detail="Fútbol & Cine" />
          <ProAdLogoPill bg="#FFFFFF" textColor="#0E0E10" badge="DAZN" name="DAZN Vivo" detail="LaLiga & F1" />
          <ProAdLogoPill bg="#10B981" textColor="#03140E" badge="TDT" name="TDT + EPG" detail="Guía en Vivo" />
          <ProAdLogoPill bg="#F47521" badge="ANI" name="Anime Hub" detail="Crunchy & Más" />
          <ProAdLogoPill bg="#F59E0B" textColor="#170E02" badge="ES" name="Castellano" detail="España 1080p" />
          <ProAdLogoPill bg="#9146FF" badge="SX3" name="En Català" detail="3Cat & Anime" />
          <ProAdLogoPill bg="#FF0033" badge="YT" name="YouTube" detail="Watch Party" />
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.09] flex items-start gap-2.5">
          <Users className="w-4 h-4 text-[#BF94FF] shrink-0 mt-0.5" />
          <div>
            <div className="font-display font-bold text-xs text-white">Salas con Amigos</div>
            <div className="text-[10px] text-zinc-400 leading-snug mt-0.5">
              Vídeo sincronizado, chat en vivo, votaciones y PIN privado.
            </div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.09] flex items-start gap-2.5">
          <Tv className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-display font-bold text-xs text-white">Smart TV en 4 Dígitos</div>
            <div className="text-[10px] text-zinc-400 leading-snug mt-0.5">
              Conecta Samsung, LG o Android TV desde tu móvil al instante.
            </div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.09] flex items-start gap-2.5">
          <Columns2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-display font-bold text-xs text-white">Multiview + Guía EPG</div>
            <div className="text-[10px] text-zinc-400 leading-snug mt-0.5">
              2 partidos a la vez y programación española en tiempo real.
            </div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.09] flex items-start gap-2.5">
          <Zap className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <div>
            <div className="font-display font-bold text-xs text-white">Guarda tu Minuto</div>
            <div className="text-[10px] text-zinc-400 leading-snug mt-0.5">
              Sigue viendo donde lo dejaste en Móvil, PC y Tablet.
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative z-10 rounded-3xl p-5 border border-white/[0.18] flex items-center justify-between gap-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
        style={{
          background:
            'linear-gradient(135deg, rgba(145,70,255,0.22) 0%, rgba(24,24,27,0.96) 55%, rgba(145,70,255,0.14) 100%)',
        }}
      >
        <div className="p-3 rounded-2xl bg-white shadow-[0_10px_30px_rgba(255,255,255,0.2)] shrink-0">
          <QRCodeSVG value={publicUrl} size={138} level="H" bgColor="#FFFFFF" fgColor="#0E0E10" />
        </div>

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
);

export const StoryAdFlyer: React.FC<AdFlyerProps> = ({ captureRef, publicUrl, displayHost }) => (
  <div className="w-full flex justify-center">
    <div
      ref={captureRef}
      className="w-[450px] max-w-full aspect-[9/16] rounded-[32px] bg-[#0E0E10] border border-white/[0.15] p-6 sm:p-7 flex flex-col justify-between relative overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.95)]"
    >
      <img src={stadiumBackdrop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0E0E10]/80 via-[#0E0E10]/90 to-[#0E0E10]" />
      <div
        className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[380px] h-[300px] rounded-full opacity-45 blur-[90px]"
        style={{
          background:
            'radial-gradient(circle, rgba(145,70,255,0.68) 0%, rgba(1,157,244,0.28) 55%, transparent 80%)',
        }}
      />

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <NaimBrandLogo size={40} />
          <div>
            <div className="font-display font-black text-base text-white leading-none">
              Riffan<span className="text-[#A78BFA]">TV</span>
            </div>
            <div className="text-[10px] text-zinc-300 mt-0.5">Cine · Series · Deportes Live</div>
          </div>
        </div>
        <span className="text-[10px] font-display font-black text-white px-2.5 py-1 rounded-lg bg-[#9146FF]">
          GRATIS · 1080p
        </span>
      </div>

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
              <span className="font-display font-black text-[11px] leading-none" style={{ color: b.color }}>
                {b.mark}
              </span>
              <span className="text-[9px] text-zinc-400 mt-1 truncate max-w-full">{b.sub}</span>
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
          <div className="text-[11px] font-mono text-zinc-200 truncate pt-0.5">{displayHost}</div>
        </div>
      </div>
    </div>
  </div>
);
