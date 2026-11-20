import React from 'react';
import { Check, Palette, Play, Share2, Trophy, Tv, Zap } from 'lucide-react';
import { useThemeStore } from '../../store/useThemeStore';
import type { AppTheme } from '../../types';
import { PrimaryButton, SecondaryButton } from '../ui/DesignSystem';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg, type FlagCode } from '../ui/LanguageBadge';
import * as RiffanIcons from '../ui/RiffanIcons';
import { WORLD_SPECS, WorldEmblemTile, type WorldPortalKind } from '../home/WorldPortalTransition';

const THEME_OPTIONS: Array<{ id: AppTheme; label: string; desc: string }> = [
  { id: 'oled', label: 'OLED Negro Puro', desc: '#08090d · Contraste máximo' },
  { id: 'soft-dark', label: 'Soft Dark', desc: '#10131c · Pizarra cinematográfica' },
  { id: 'high-contrast', label: 'Alto Contraste', desc: '#000000 · Texto ≥7:1 AAA' },
];

export const DesignTokensTab: React.FC = () => {
  const theme = useThemeStore((s) => s.theme);
  const density = useThemeStore((s) => s.density);
  const liteMode = useThemeStore((s) => s.liteMode);
  const reducedMotion = useThemeStore((s) => s.reducedMotion);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setDensity = useThemeStore((s) => s.setDensity);
  const setLiteMode = useThemeStore((s) => s.setLiteMode);
  const setReducedMotion = useThemeStore((s) => s.setReducedMotion);

  return (
    <section className="space-y-6 animate-fade-in">
      <div className="p-5 rounded-3xl bg-[#0F111D] border border-white/10 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Palette className="w-4 h-4 text-[#BF94FF]" />
          <span>Temas Semánticos & Rendimiento</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => (
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
  );
};

interface DesignComponentsTabProps {
  emblemAnimMode: 'always' | 'hover';
  onChangeEmblemAnimMode: (mode: 'always' | 'hover') => void;
  iconAnimMode: 'always' | 'hover';
  onChangeIconAnimMode: (mode: 'always' | 'hover') => void;
  onTriggerPortalPreview: (kind: WorldPortalKind, e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const DesignComponentsTab: React.FC<DesignComponentsTabProps> = ({
  emblemAnimMode,
  onChangeEmblemAnimMode,
  iconAnimMode,
  onChangeIconAnimMode,
  onTriggerPortalPreview,
}) => {
  return (
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

      <div className="p-5 sm:p-6 rounded-3xl bg-[#0F111D] border border-white/10 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm sm:text-base font-display font-bold text-white">
              Emblemas SVG de Secciones &amp; Transiciones de Entrada
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Monolitos vectoriales con bisel vítreo, halo OLED y barrido óptico. Pulsa cualquier tarjeta para probar su transición real.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeEmblemAnimMode('always');
              }}
              className={`min-h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                emblemAnimMode === 'always'
                  ? 'bg-[#9146FF] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Siempre vivos
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeEmblemAnimMode('hover');
              }}
              className={`min-h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                emblemAnimMode === 'hover'
                  ? 'bg-[#9146FF] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Al pasar cursor
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {(['cine', 'sala', 'juegos', 'futbol', 'tv'] as WorldPortalKind[]).map((kind) => {
            const spec = WORLD_SPECS[kind];
            return (
              <div
                key={kind}
                className="group relative rounded-2xl bg-[#0A0C14] border border-white/[0.09] hover:border-white/25 overflow-hidden flex flex-col justify-between transition-all duration-200"
              >
                <div className="relative pt-7 pb-5 px-4 flex flex-col items-center justify-center overflow-hidden">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-75 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at 50% 54%, rgba(${spec.glowRgb},0.22) 0%, rgba(10,12,20,0) 72%)`,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px pointer-events-none opacity-45 group-hover:opacity-90 transition-opacity"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${spec.accent}70, transparent)`,
                    }}
                  />

                  <WorldEmblemTile
                    kind={kind}
                    animate={emblemAnimMode}
                    className="relative z-10 w-24 h-24 transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                </div>

                <div className="px-4 pb-4 space-y-3">
                  <div className="text-center space-y-1">
                    <p className="font-display text-sm font-bold text-white tracking-tight">
                      {spec.title.es}
                    </p>
                    <p className="text-[11px] text-zinc-400 leading-snug min-h-[2rem] flex items-center justify-center">
                      {spec.subtitle.es}
                    </p>
                    <div className="pt-1 flex items-center justify-center gap-2 text-[10px] font-mono text-zinc-400 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: spec.accent }} />
                        {spec.accent}
                      </span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: spec.secondary }} />
                        {spec.secondary}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => onTriggerPortalPreview(kind, e)}
                    className="w-full min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-[#9146FF] border border-white/[0.08] hover:border-transparent text-[11px] font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Probar transición</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-5 rounded-3xl bg-[#0F111D] border border-white/10 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white">Banderas SVG de Idiomas y Regiones</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Vectores nítidos con proporciones oficiales para selector de idioma, ligas y audios.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(
            [
              { code: 'es', label: 'España (ES)' },
              { code: 'rif', label: 'Rif (TMZ)' },
              { code: 'ca', label: 'Catalunya (CAT)' },
              { code: 'en', label: 'English (EN)' },
              { code: 'zh', label: 'China (中文)' },
            ] as Array<{ code: FlagCode; label: string }>
          ).map(({ code, label }) => (
            <div key={code} className="p-3.5 rounded-2xl bg-[#111320] border border-white/10 flex items-center gap-3">
              <FlagBadgeSvg code={code} className="w-9 h-6 shrink-0 shadow-sm" />
              <span className="text-xs font-bold text-zinc-200 truncate">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 rounded-3xl bg-[#0F111D] border border-white/10 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white">Kit Completo de Iconos y Animaciones SVG RiffanTV</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Cambia entre modo bucle continuo o reproducción al pasar el cursor para probar cada micro-animación.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeIconAnimMode('always');
              }}
              className={`min-h-9 px-3 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                iconAnimMode === 'always'
                  ? 'bg-[#9146FF] text-white'
                  : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
              }`}
            >
              Siempre animando
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeIconAnimMode('hover');
              }}
              className={`min-h-9 px-3 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                iconAnimMode === 'hover'
                  ? 'bg-[#9146FF] text-white'
                  : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
              }`}
            >
              En hover
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2.5">
          {[
            { label: 'Loader R', el: <RiffanIcons.RiffanLoaderR size={26} animate="always" /> },
            { label: 'Spinner', el: <RiffanIcons.RiffanSpinner size={24} animate={iconAnimMode} /> },
            { label: 'Dots', el: <RiffanIcons.RiffanDotsLoader size={26} animate={iconAnimMode} /> },
            { label: 'Progress', el: <RiffanIcons.RiffanProgressBar width={42} height={14} animate="always" /> },
            { label: 'Buffering', el: <RiffanIcons.RiffanVideoLoading size={24} animate={iconAnimMode} /> },
            { label: 'Play', el: <RiffanIcons.RiffanPlayIcon size={22} animate={iconAnimMode} /> },
            { label: 'Pause', el: <RiffanIcons.RiffanPauseIcon size={22} animate={iconAnimMode} /> },
            { label: 'Next Ep', el: <RiffanIcons.RiffanNextEpisodeIcon size={22} animate={iconAnimMode} /> },
            { label: 'Fullscreen', el: <RiffanIcons.RiffanFullscreenIcon size={22} animate={iconAnimMode} /> },
            { label: 'Exit FS', el: <RiffanIcons.RiffanExitFullscreenIcon size={22} animate={iconAnimMode} /> },
            { label: 'Volume', el: <RiffanIcons.RiffanVolumeIcon size={22} animate={iconAnimMode} /> },
            { label: 'Subtitles', el: <RiffanIcons.RiffanSubtitlesIcon size={22} animate={iconAnimMode} /> },
            { label: 'Ext Link', el: <RiffanIcons.RiffanExternalLinkIcon size={22} animate={iconAnimMode} /> },
            { label: 'Retry', el: <RiffanIcons.RiffanRetryIcon size={22} animate={iconAnimMode} /> },
            { label: 'Cast TV', el: <RiffanIcons.RiffanCastIcon size={22} animate={iconAnimMode} /> },
            { label: 'Voice', el: <RiffanIcons.RiffanVoiceCallIcon size={22} animate={iconAnimMode} /> },
            { label: 'Chat', el: <RiffanIcons.RiffanChatIcon size={22} animate={iconAnimMode} /> },
            { label: 'Sliders', el: <RiffanIcons.RiffanSlidersIcon size={22} animate={iconAnimMode} /> },
            { label: 'Ch Down', el: <RiffanIcons.RiffanChevronDownIcon size={22} animate={iconAnimMode} /> },
            { label: 'Ch Up', el: <RiffanIcons.RiffanChevronUpIcon size={22} animate={iconAnimMode} /> },
            { label: 'Ch Left', el: <RiffanIcons.RiffanChevronLeftIcon size={22} animate={iconAnimMode} /> },
            { label: 'Ch Right', el: <RiffanIcons.RiffanChevronRightIcon size={22} animate={iconAnimMode} /> },
            { label: 'Back', el: <RiffanIcons.RiffanBackIcon size={22} animate={iconAnimMode} /> },
            { label: 'Movies', el: <RiffanIcons.RiffanMoviesIcon size={22} animate={iconAnimMode} /> },
            { label: 'Series', el: <RiffanIcons.RiffanSeriesIcon size={22} animate={iconAnimMode} /> },
            { label: 'Surprise', el: <RiffanIcons.RiffanSurpriseIcon size={22} animate={iconAnimMode} /> },
            { label: 'Star', el: <RiffanIcons.RiffanStarIcon size={22} animate={iconAnimMode} /> },
            { label: 'Add', el: <RiffanIcons.RiffanAddIcon size={22} animate={iconAnimMode} /> },
            { label: 'Schedule', el: <RiffanIcons.RiffanScheduleIcon size={22} animate={iconAnimMode} /> },
            { label: 'Channels', el: <RiffanIcons.RiffanChannelsIcon size={22} animate={iconAnimMode} /> },
            { label: 'Clock', el: <RiffanIcons.RiffanClockIcon size={22} animate={iconAnimMode} /> },
            { label: 'Live', el: <RiffanIcons.RiffanLiveIcon size={22} animate={iconAnimMode} /> },
            { label: 'Users', el: <RiffanIcons.RiffanUsersIcon size={22} animate={iconAnimMode} /> },
            { label: 'Lang', el: <RiffanIcons.RiffanLanguageIcon size={22} animate={iconAnimMode} /> },
            { label: 'Mobile', el: <RiffanIcons.RiffanMobileIcon size={22} animate={iconAnimMode} /> },
            { label: 'Monitor', el: <RiffanIcons.RiffanMonitorIcon size={22} animate={iconAnimMode} /> },
            { label: 'TV Remote', el: <RiffanIcons.RiffanTvRemoteIcon size={22} animate={iconAnimMode} /> },
            { label: 'Room Key', el: <RiffanIcons.RiffanRoomKeyIcon size={22} animate={iconAnimMode} /> },
            { label: 'Shuffle', el: <RiffanIcons.RiffanShuffleIcon size={22} animate={iconAnimMode} /> },
            { label: 'Share', el: <RiffanIcons.RiffanShareIcon size={22} animate={iconAnimMode} /> },
            { label: 'Logout', el: <RiffanIcons.RiffanLogoutIcon size={22} animate={iconAnimMode} /> },
            { label: 'Sync', el: <RiffanIcons.RiffanSyncIcon size={22} animate={iconAnimMode} /> },
            { label: 'Warning', el: <RiffanIcons.RiffanWarningIcon size={22} animate={iconAnimMode} /> },
            { label: 'Info', el: <RiffanIcons.RiffanInfoIcon size={22} animate={iconAnimMode} /> },
            { label: 'Error', el: <RiffanIcons.RiffanErrorIcon size={22} animate={iconAnimMode} /> },
            { label: 'Unavail', el: <RiffanIcons.RiffanUnavailableIcon size={22} animate={iconAnimMode} /> },
            { label: 'Wi-Fi', el: <RiffanIcons.RiffanWifiIcon size={22} animate={iconAnimMode} /> },
            { label: 'Search', el: <RiffanIcons.RiffanSearchIcon size={22} animate={iconAnimMode} /> },
            { label: 'Menu', el: <RiffanIcons.RiffanMenuIcon size={22} animate={iconAnimMode} /> },
            { label: 'Close', el: <RiffanIcons.RiffanCloseIcon size={22} animate={iconAnimMode} /> },
            { label: 'Home', el: <RiffanIcons.RiffanHomeIcon size={22} animate={iconAnimMode} /> },
            { label: 'User', el: <RiffanIcons.RiffanUserIcon size={22} animate={iconAnimMode} /> },
            { label: 'Mail', el: <RiffanIcons.RiffanMailIcon size={22} animate={iconAnimMode} /> },
            { label: 'Cart', el: <RiffanIcons.RiffanCartIcon size={22} animate={iconAnimMode} /> },
            { label: 'Lock', el: <RiffanIcons.RiffanLockIcon size={22} animate={iconAnimMode} /> },
            { label: 'Check', el: <RiffanIcons.RiffanCheckCircleIcon size={22} animate={iconAnimMode} /> },
            { label: 'Heart', el: <RiffanIcons.RiffanHeartIcon size={22} active animate={iconAnimMode} /> },
            { label: 'Bell', el: <RiffanIcons.RiffanBellIcon size={22} animate={iconAnimMode} /> },
            { label: 'Settings', el: <RiffanIcons.RiffanSettingsGearIcon size={22} animate={iconAnimMode} /> },
            { label: 'Arrow', el: <RiffanIcons.RiffanArrowRightIcon size={22} animate={iconAnimMode} /> },
            { label: 'Download', el: <RiffanIcons.RiffanDownloadIcon size={22} animate={iconAnimMode} /> },
            { label: 'Football', el: <RiffanIcons.RiffanFootballIcon size={22} animate={iconAnimMode} /> },
            { label: 'Trophy', el: <RiffanIcons.RiffanTrophyIcon size={22} animate={iconAnimMode} /> },
            { label: 'Games', el: <RiffanIcons.RiffanGamesIcon size={22} animate={iconAnimMode} /> },
            { label: 'Billiards', el: <RiffanIcons.RiffanBilliardsIcon size={22} animate={iconAnimMode} /> },
            { label: 'Dice', el: <RiffanIcons.RiffanDiceIcon size={22} animate={iconAnimMode} /> },
            { label: 'Cards', el: <RiffanIcons.RiffanCardsIcon size={22} animate={iconAnimMode} /> },
            { label: 'Continue', el: <RiffanIcons.RiffanContinueWatchingIcon size={22} animate={iconAnimMode} /> },
            { label: 'Bookmark', el: <RiffanIcons.RiffanBookmarkIcon size={22} animate={iconAnimMode} /> },
            { label: 'YouTube', el: <RiffanIcons.RiffanYouTubeIcon size={22} animate={iconAnimMode} /> },
            { label: 'Devices', el: <RiffanIcons.RiffanDevicesIcon size={22} animate={iconAnimMode} /> },
            { label: 'Voice Mic', el: <RiffanIcons.RiffanVoiceMicIcon size={22} animate={iconAnimMode} /> },
          ].map((item) => (
            <div
              key={item.label}
              className="group p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
            >
              <div className="h-7 flex items-center justify-center">{item.el}</div>
              <span className="text-[10px] font-medium text-zinc-300 truncate w-full">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
