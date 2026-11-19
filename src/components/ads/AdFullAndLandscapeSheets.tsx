import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Columns2, Film, Lock, Monitor, Radio, Smartphone, Tv } from 'lucide-react';
import { NaimBrandLogo } from '../NaimBrandLogo';
import { FullSheetBrandGrid } from './AdBrandTiles';
import stadiumBackdrop from '../../assets/images/esports_arena_live_1794673806740.webp';
import f1Backdrop from '../../assets/images/motorsport_f1_backdrop_1794353709150.webp';

interface AdFlyerProps {
  captureRef: React.RefObject<HTMLDivElement | null>;
  publicUrl: string;
  displayHost: string;
}

export const FullSalesSheetAd: React.FC<AdFlyerProps> = ({ captureRef, publicUrl, displayHost }) => (
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
              Riffan<span className="text-[#A78BFA]">TV</span>
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
          { value: '+12', label: 'Plataformas Integradas', detail: 'Cine, Series, Deporte y Anime' },
          { value: '+50', label: 'Canales TV en Directo', detail: 'Movistar+, DAZN y TDT España' },
          { value: '0 ms', label: 'Desfase en Sala Común', detail: 'Play, pausa y chat sincronizados' },
          { value: '100%', label: 'Limpio Sin Publicidad', detail: 'Señal nativa HLS / MP4 1080p' },
        ].map((stat) => (
          <div key={stat.label} className="p-4 sm:p-5 rounded-2xl bg-white/[0.035] border border-white/[0.08]">
            <div className="font-display font-extrabold text-2xl sm:text-3xl text-white tabular-nums tracking-tight">
              {stat.value}
            </div>
            <div className="text-xs sm:text-sm font-bold text-zinc-100 mt-1">{stat.label}</div>
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

      <FullSheetBrandGrid />
    </section>

    <section className="px-7 sm:px-14 py-12 border-b border-white/[0.07] space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-7 relative rounded-3xl overflow-hidden border border-white/[0.1] bg-[#18181B] min-h-[250px] p-6 sm:p-7 flex flex-col justify-between">
          <img src={stadiumBackdrop} alt="Deportes en vivo" className="absolute inset-0 w-full h-full object-cover opacity-35" />
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
          <img src={f1Backdrop} alt="Smart TV" className="absolute inset-0 w-full h-full object-cover opacity-25" />
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
            Riffan<span className="text-[#A78BFA]">TV</span>
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
);

export const LandscapeBillboardAd: React.FC<AdFlyerProps> = ({ captureRef, publicUrl, displayHost }) => (
  <div className="w-full overflow-x-auto pb-4 flex justify-center">
    <div
      ref={captureRef}
      className="w-[1120px] min-w-[1120px] aspect-[16/9] rounded-[32px] bg-[#0E0E10] border border-white/[0.12] p-11 flex flex-col justify-between relative overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.92)]"
    >
      <img src={stadiumBackdrop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0E0E10] via-[#0E0E10]/90 to-[#0E0E10]/70" />

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <NaimBrandLogo size={46} />
          <div>
            <div className="font-display font-extrabold text-xl text-white tracking-tight">
              Riffan<span className="text-[#A78BFA]">TV</span>
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
              <span className="font-display font-black text-sm tracking-tight leading-none" style={{ color: b.color }}>
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
            <div className="text-xs text-emerald-400 font-semibold">Escanea y entra gratis</div>
          </div>
          <div className="p-2 rounded-xl bg-white shadow-lg">
            <QRCodeSVG value={publicUrl} size={76} level="H" />
          </div>
        </div>
      </div>
    </div>
  </div>
);
