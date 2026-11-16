import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';

export type WorldPortalKind = 'cine' | 'futbol' | 'tv' | 'juegos';

interface WorldPortalTransitionProps {
  portal: WorldPortalKind | null;
  lang: AppLanguage;
}

const CineStudioAperture: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  const blades = [0, 60, 120, 180, 240, 300];
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#050508]">
      {/* Subtle Studio Vault Radial Field */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 48% at 50% 50%, rgba(145, 70, 255, 0.16) 0%, rgba(56, 189, 248, 0.05) 42%, rgba(5, 5, 8, 1) 76%)',
        }}
      />

      {/* Precision Top & Bottom 2.39:1 Cinema Matte Curtains */}
      <motion.div
        initial={{ scaleY: 1.35, opacity: 0.95 }}
        animate={{ scaleY: 0.72, opacity: 1 }}
        transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}
        style={{ originY: 0 }}
        className="pointer-events-none absolute top-0 inset-x-0 h-[12dvh] bg-black border-b border-white/[0.08]"
      />
      <motion.div
        initial={{ scaleY: 1.35, opacity: 0.95 }}
        animate={{ scaleY: 0.72, opacity: 1 }}
        transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}
        style={{ originY: 1 }}
        className="pointer-events-none absolute bottom-0 inset-x-0 h-[12dvh] bg-black border-t border-white/[0.08]"
      />

      {/* Razor-Sharp Anamorphic Horizontal Optical Streak */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 1.05, 0.92], opacity: [0, 0.95, 0.45] }}
        transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-gradient-to-r from-transparent via-[#A78BFA] to-transparent shadow-[0_0_24px_rgba(145,70,255,0.85)]"
      />
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 0.68, 0.52], opacity: [0, 0.9, 0.35] }}
        transition={{ duration: 0.58, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute left-[12%] right-[12%] top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent"
      />

      {/* Optical 6-Blade Iris + Typographic Lockup */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-6 text-center">
        <motion.div
          initial={{ scale: 0.72, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center"
        >
          {/* Outer Specular Precision Ring */}
          <motion.svg
            viewBox="0 0 120 120"
            className="w-full h-full overflow-visible"
            initial={{ rotate: -48 }}
            animate={{ rotate: 0 }}
            transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
          >
            <defs>
              <linearGradient id="cine-iris-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="50%" stopColor="#C4B5FD" />
                <stop offset="100%" stopColor="#9146FF" />
              </linearGradient>
            </defs>
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="rgba(14, 15, 22, 0.9)"
              stroke="url(#cine-iris-grad)"
              strokeWidth="1.5"
              strokeOpacity="0.65"
            />
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
            {blades.map((deg) => (
              <g key={deg} transform={`rotate(${deg} 60 60)`}>
                <path
                  d="M 60 15 L 86 35 L 70 43 Z"
                  fill="rgba(145, 70, 255, 0.22)"
                  stroke="rgba(216, 180, 254, 0.55)"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                />
              </g>
            ))}
            {/* Precision Negative Play Prism in Lens Center */}
            <polygon
              points="53,48 53,72 74,60"
              fill="#FFFFFF"
              opacity="0.96"
            />
          </motion.svg>
        </motion.div>

        <div className="space-y-1.5">
          <motion.h2
            initial={{ opacity: 0, y: 12, letterSpacing: '0.32em' }}
            animate={{ opacity: 1, y: 0, letterSpacing: '0.2em' }}
            transition={{ delay: 0.08, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-black text-2xl sm:text-3xl text-white uppercase pl-[0.2em]"
          >
            {pickLang(lang, { es: 'CINE', ca: 'CINEMA', en: 'CINEMA' })}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.78, y: 0 }}
            transition={{ delay: 0.16, duration: 0.34, ease: 'easeOut' }}
            className="text-xs sm:text-sm font-medium text-zinc-300 tracking-wide"
          >
            {pickLang(lang, {
              es: 'Cartelera y estrenos en gran pantalla',
              ca: 'Cartellera i estrenes en gran pantalla',
              en: 'Big-screen movies & series',
            })}
          </motion.p>
        </div>
      </div>
    </div>
  );
};

const FutbolBroadcastTunnel: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#040907]">
      {/* Architectural Floodlight Beams Descending from Upper Stadium Corners */}
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, rotate: -26, scaleY: 0.75 }}
        animate={{ opacity: [0, 0.75, 0.55], rotate: -18, scaleY: 1 }}
        transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
        style={{ originY: 0, originX: 0 }}
        className="pointer-events-none absolute -top-12 -left-16 w-[52vw] h-[110dvh] bg-gradient-to-b from-emerald-300/22 via-[#00F593]/8 to-transparent blur-xl"
      />
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, rotate: 26, scaleY: 0.75 }}
        animate={{ opacity: [0, 0.75, 0.55], rotate: 18, scaleY: 1 }}
        transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
        style={{ originY: 0, originX: 1 }}
        className="pointer-events-none absolute -top-12 -right-16 w-[52vw] h-[110dvh] bg-gradient-to-b from-sky-200/18 via-emerald-400/8 to-transparent blur-xl"
      />

      {/* Precision Animated SVG Tactical Pitch Lines Drawing Live */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-50">
        <svg viewBox="0 0 600 340" className="w-[min(92vw,720px)] h-auto">
          {/* Touchlines */}
          <motion.rect
            x="24"
            y="24"
            width="552"
            height="292"
            rx="8"
            fill="none"
            stroke="rgba(0, 245, 147, 0.28)"
            strokeWidth="1.5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* Halfway Line */}
          <motion.line
            x1="300"
            y1="24"
            x2="300"
            y2="316"
            stroke="rgba(255, 255, 255, 0.32)"
            strokeWidth="1.5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.06, ease: 'easeOut' }}
          />
          {/* Center Circle */}
          <motion.circle
            cx="300"
            cy="170"
            r="56"
            fill="none"
            stroke="rgba(0, 245, 147, 0.52)"
            strokeWidth="1.8"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.52, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* Penalty Areas */}
          <motion.path
            d="M 24 94 H 96 V 246 H 24 M 576 94 H 504 V 246 H 576"
            fill="none"
            stroke="rgba(255, 255, 255, 0.24)"
            strokeWidth="1.4"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          />
        </svg>
      </div>

      {/* Center Championship Crest + Broadcast Wordmark */}
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
        <motion.div
          initial={{ scale: 0.65, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center"
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <linearGradient id="futbol-crest-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="55%" stopColor="#00F593" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="rgba(6, 18, 13, 0.9)"
              stroke="url(#futbol-crest-ring)"
              strokeWidth="2.2"
            />
            {/* Minimalist Pentagon Football Geometry */}
            <polygon
              points="50,27 68,40 61,62 39,62 32,40"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <polygon
              points="50,36 59,43 56,54 44,54 41,43"
              fill="#00F593"
            />
            <line x1="50" y1="27" x2="50" y2="12" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
            <line x1="68" y1="40" x2="83" y2="33" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
            <line x1="32" y1="40" x2="17" y2="33" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
            <line x1="61" y1="62" x2="72" y2="78" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
            <line x1="39" y1="62" x2="28" y2="78" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
          </svg>
        </motion.div>

        <div className="space-y-1.5">
          <motion.h2
            initial={{ opacity: 0, y: 10, letterSpacing: '0.28em' }}
            animate={{ opacity: 1, y: 0, letterSpacing: '0.16em' }}
            transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-black text-2xl sm:text-3xl text-white uppercase pl-[0.16em]"
          >
            {pickLang(lang, { es: 'FÚTBOL', ca: 'FUTBOL', en: 'FOOTBALL' })}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.8, y: 0 }}
            transition={{ delay: 0.16, duration: 0.32, ease: 'easeOut' }}
            className="text-xs sm:text-sm font-medium text-emerald-200/85 tracking-wide"
          >
            {pickLang(lang, {
              es: 'Partidos de hoy y señales en directo',
              ca: "Partits d'avui i senyals en directe",
              en: 'Live matches & sports broadcast',
            })}
          </motion.p>
        </div>
      </div>
    </div>
  );
};

const TvBroadcastStage: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#040812]">
      {/* Studio Broadcast Telemetry Radial Field */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 72% 50% at 50% 48%, rgba(56, 189, 248, 0.22) 0%, rgba(14, 165, 233, 0.07) 44%, rgba(4, 8, 18, 1) 76%)',
        }}
      />

      {/* Precision Horizontal Broadcast Carrier Sweep */}
      <motion.div
        aria-hidden="true"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 1.04, 0.9], opacity: [0, 0.92, 0.4] }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_24px_rgba(56,189,248,0.85)]"
      />
      <motion.div
        aria-hidden="true"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 0.72, 0.56], opacity: [0, 0.85, 0.3] }}
        transition={{ duration: 0.56, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute left-[14%] right-[14%] top-[44%] h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent"
      />

      {/* Radiating RF Signal Arcs + Oscilloscope Carrier SVG */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-50">
        <svg viewBox="0 0 600 320" className="w-[min(94vw,760px)] h-auto">
          {/* Concentric Broadcast Transmission Rings */}
          {[88, 134, 180].map((r, i) => (
            <motion.circle
              key={r}
              cx="300"
              cy="160"
              r={r}
              fill="none"
              stroke="rgba(56, 189, 248, 0.32)"
              strokeWidth={1.3}
              strokeDasharray="6 8"
              initial={{ scale: 0.76, opacity: 0 }}
              animate={{ scale: 1.04, opacity: [0, 0.65, 0.22] }}
              transition={{ duration: 0.62, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: '300px 160px' }}
            />
          ))}

          {/* Precision Oscilloscope Frequency Wave */}
          <motion.path
            d="M 28 160 H 165 L 188 134 L 210 186 L 234 118 L 258 198 L 280 142 L 300 160 L 320 176 L 344 122 L 368 196 L 390 136 L 412 180 L 435 160 H 572"
            fill="none"
            stroke="rgba(125, 211, 252, 0.55)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.54, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </div>

      {/* Central Broadcast Studio Monitor Crest + Wordmark */}
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
        <motion.div
          initial={{ scale: 0.68, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 330, damping: 22 }}
          className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center"
        >
          <svg viewBox="0 0 120 120" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="tv-crest-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="50%" stopColor="#7DD3FC" />
                <stop offset="100%" stopColor="#0284C7" />
              </linearGradient>
            </defs>

            {/* Outer Circular Telemetry Ring */}
            <circle
              cx="60"
              cy="62"
              r="50"
              fill="rgba(7, 16, 30, 0.92)"
              stroke="url(#tv-crest-grad)"
              strokeWidth="1.6"
              strokeOpacity="0.7"
            />

            {/* Broadcast V-Antenna */}
            <motion.path
              d="M 44 26 L 60 39 L 76 26"
              fill="none"
              stroke="#7DD3FC"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* 16:9 Studio Broadcast Frame */}
            <motion.rect
              x="26"
              y="40"
              width="68"
              height="44"
              rx="8"
              fill="rgba(14, 28, 48, 0.9)"
              stroke="url(#tv-crest-grad)"
              strokeWidth="2.4"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Equalizer Signal Bars inside Monitor */}
            {[
              { x: 43, yTop: 55, yBot: 72, delay: 0.08 },
              { x: 52, yTop: 49, yBot: 72, delay: 0.12 },
              { x: 61, yTop: 53, yBot: 72, delay: 0.16 },
              { x: 70, yTop: 47, yBot: 72, delay: 0.2 },
            ].map((bar) => (
              <motion.line
                key={bar.x}
                x1={bar.x}
                y1={bar.yBot}
                x2={bar.x}
                y2={bar.yTop}
                stroke="#38BDF8"
                strokeWidth="3.2"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: bar.delay, duration: 0.28, ease: 'easeOut' }}
              />
            ))}

            {/* Crisp Broadcast LIVE Tally Indicator */}
            <motion.circle
              cx="84"
              cy="49"
              r="3.2"
              fill="#EB0400"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.25, 1], opacity: 1 }}
              transition={{ delay: 0.18, duration: 0.32 }}
            />
          </svg>
        </motion.div>

        <div className="space-y-1.5">
          <motion.h2
            initial={{ opacity: 0, y: 10, letterSpacing: '0.26em' }}
            animate={{ opacity: 1, y: 0, letterSpacing: '0.15em' }}
            transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-black text-2xl sm:text-3xl text-white uppercase pl-[0.15em]"
          >
            {pickLang(lang, { es: 'TV EN DIRECTO', ca: 'TV EN DIRECTE', en: 'LIVE TV' })}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.82, y: 0 }}
            transition={{ delay: 0.16, duration: 0.32, ease: 'easeOut' }}
            className="text-xs sm:text-sm font-medium text-sky-200/85 tracking-wide"
          >
            {pickLang(lang, {
              es: 'TDT, programación y señales 24/7',
              ca: 'TDT, programació i senyals 24/7',
              en: 'Live TV, guide & 24/7 channels',
            })}
          </motion.p>
        </div>
      </div>
    </div>
  );
};

const JuegosArenaStage: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#06040D]">
      {/* Subtle Radial Stage Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 72% 52% at 50% 45%, rgba(145, 70, 255, 0.24) 0%, rgba(232, 121, 249, 0.08) 42%, rgba(6, 4, 13, 1) 76%)',
        }}
      />

      {/* GPU-Accelerated Perspective Arena Horizon Grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[48dvh] overflow-hidden opacity-45"
        style={{ perspective: '540px' }}
      >
        <motion.div
          initial={{ opacity: 0, transform: 'rotateX(68deg) translateY(36px)' }}
          animate={{ opacity: 1, transform: 'rotateX(68deg) translateY(0px)' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-[140%] -ml-[20%] h-[200%]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(167, 139, 250, 0.24) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.2) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,1) 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,1) 100%)',
          }}
        />
      </div>

      {/* Snappy Diagonal Horizon Light Accent */}
      <motion.div
        aria-hidden="true"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 0.7 }}
        transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute left-[10%] right-[10%] top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-fuchsia-400 to-transparent"
      />

      {/* Octagonal Arcade Triad Emblem + Wordmark */}
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
        <motion.div
          initial={{ scale: 0.68, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 340, damping: 22 }}
          className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center"
        >
          <svg viewBox="0 0 120 120" className="w-full h-full">
            <defs>
              <linearGradient id="arena-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E879F9" />
                <stop offset="50%" stopColor="#9146FF" />
                <stop offset="100%" stopColor="#38BDF8" />
              </linearGradient>
            </defs>
            {/* Octagonal Precision Frame */}
            <motion.polygon
              points="38,10 82,10 110,38 110,82 82,110 38,110 10,82 10,38"
              fill="rgba(14, 10, 26, 0.92)"
              stroke="url(#arena-ring-grad)"
              strokeWidth="2.2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
            />
            {/* Top Diamond (Parchís) */}
            <motion.polygon
              points="60,24 71,35 60,46 49,35"
              fill="#38BDF8"
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 320, damping: 20 }}
            />
            {/* Left D-Pad Cross (Arcade) */}
            <motion.path
              d="M 32 58 H 46 V 72 H 32 Z M 36 54 H 42 V 76 H 36 Z M 28 62 H 50 V 68 H 28 Z"
              fill="#FFFFFF"
              initial={{ x: -8, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.12, type: 'spring', stiffness: 320, damping: 20 }}
            />
            {/* Right 8-Ball Sphere */}
            <motion.g
              initial={{ x: 8, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.16, type: 'spring', stiffness: 320, damping: 20 }}
            >
              <circle cx="80" cy="65" r="12" fill="#18181B" stroke="#E879F9" strokeWidth="2" />
              <circle cx="80" cy="65" r="5" fill="#FFFFFF" />
            </motion.g>
          </svg>
        </motion.div>

        <div className="space-y-1.5">
          <motion.h2
            initial={{ opacity: 0, y: 10, letterSpacing: '0.28em' }}
            animate={{ opacity: 1, y: 0, letterSpacing: '0.18em' }}
            transition={{ delay: 0.08, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-black text-2xl sm:text-3xl text-white uppercase pl-[0.18em]"
          >
            {pickLang(lang, { es: 'JUEGOS', ca: 'JOCS', en: 'GAMES' })}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.8, y: 0 }}
            transition={{ delay: 0.16, duration: 0.32, ease: 'easeOut' }}
            className="text-xs sm:text-sm font-medium text-fuchsia-200/85 tracking-wide"
          >
            {pickLang(lang, {
              es: 'Billar, Parchís, UNO y duelos en vivo',
              ca: 'Billar, Parxís, UNO i duels en directe',
              en: 'Pool, Parchís, UNO & live matches',
            })}
          </motion.p>
        </div>
      </div>
    </div>
  );
};

export const WorldPortalTransition: React.FC<WorldPortalTransitionProps> = () => {
  return null;
};
