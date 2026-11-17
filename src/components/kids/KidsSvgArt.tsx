import React, { useId } from 'react';
import type { KidsLanguageCode } from '../../types';
import type { KidsMascotId } from './kidsData';

export type KidsArtTheme =
  | 'space'
  | 'ocean'
  | 'dino'
  | 'magic'
  | 'animals'
  | 'adventure'
  | 'cartoons'
  | 'live_tv'
  | 'music';

export function detectKidsArtTheme(
  title: string,
  category = '',
  genres: string[] = []
): KidsArtTheme {
  const t = `${title} ${category} ${genres.join(' ')}`.toLowerCase();
  if (/space|espacio|cohete|rocket|star|astro|planeta|wall-e|lightyear|elio/.test(t)) {
    return 'space';
  }
  if (/ocean|sea|mar|nemo|moana|delfin|tiburon|ballena|water|peix|aslem/.test(t)) {
    return 'ocean';
  }
  if (/dino|jurassic|t-rex|fosil|prehistoric/.test(t)) {
    return 'dino';
  }
  if (/magic|magia|magica|frozen|encanto|totoro|dragon|hada|witch|fantasia/.test(t)) {
    return 'magic';
  }
  if (/animal|lion|rey leon|perro|gato|oso|bear|paddington|zootopia|madagascar|safari/.test(t)) {
    return 'animals';
  }
  if (/live|canal|tdt|clan|boing|sx3|spacetoon|gulli|cbeebies|cctv|tv/.test(t)) {
    return 'live_tv';
  }
  if (/music|canta|coco|sing|cancion|piano|sonido/.test(t)) {
    return 'music';
  }
  if (/adventure|aventura|tadeo|heroe|super|spider|viaje/.test(t)) {
    return 'adventure';
  }
  return 'cartoons';
}

/* ============================================================================
 * 1. ANIMATED SVG POSTERS & COVERS (100% SELF-CONTAINED VECTOR ART)
 * ============================================================================ */
interface KidsAnimatedPosterProps {
  title: string;
  year?: string;
  rating?: string;
  langCode?: KidsLanguageCode;
  mediaType?: 'movie' | 'tv';
  category?: string;
  genres?: string[];
  className?: string;
}

export const KidsAnimatedPosterSvg: React.FC<KidsAnimatedPosterProps> = ({
  title,
  year = '2024',
  rating = '8.5',
  langCode = 'es',
  mediaType = 'movie',
  category = 'cartoons',
  genres = [],
  className = 'w-full h-full',
}) => {
  const uid = useId().replace(/:/g, '');
  const theme = detectKidsArtTheme(title, category, genres);

  return (
    <svg
      viewBox="0 0 320 440"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-label={title}
    >
      <defs>
        <style>{`
          @keyframes rtvPulseGlow {
            0%, 100% { opacity: 0.85; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.05); }
          }
          @keyframes rtvFloat {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-7px) rotate(1.5deg); }
          }
          @keyframes rtvStarTwinkle {
            0%, 100% { opacity: 0.35; transform: scale(0.85); }
            50% { opacity: 1; transform: scale(1.25); }
          }
          @keyframes rtvWaveDrift {
            0%, 100% { transform: translateX(0px); }
            50% { transform: translateX(8px); }
          }
          @keyframes rtvOrbitRing {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes rtvAntennaBeam {
            0%, 100% { stroke-opacity: 0.3; }
            50% { stroke-opacity: 0.95; }
          }
          .anim-pulse-${uid} { animation: rtvPulseGlow 3s ease-in-out infinite; transform-origin: center; }
          .anim-float-${uid} { animation: rtvFloat 4s ease-in-out infinite; transform-origin: center; }
          .anim-star1-${uid} { animation: rtvStarTwinkle 2.2s ease-in-out infinite; transform-origin: center; }
          .anim-star2-${uid} { animation: rtvStarTwinkle 3.1s ease-in-out infinite 0.7s; transform-origin: center; }
          .anim-star3-${uid} { animation: rtvStarTwinkle 2.6s ease-in-out infinite 1.3s; transform-origin: center; }
          .anim-wave-${uid} { animation: rtvWaveDrift 3.5s ease-in-out infinite; }
          .anim-beam-${uid} { animation: rtvAntennaBeam 1.8s ease-in-out infinite; }
        `}</style>

        {/* Dynamic Theme Gradients */}
        <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          {theme === 'space' ? (
            <>
              <stop offset="0%" stopColor="#0B0F2A" />
              <stop offset="60%" stopColor="#1E1B4B" />
              <stop offset="100%" stopColor="#311042" />
            </>
          ) : theme === 'ocean' ? (
            <>
              <stop offset="0%" stopColor="#0284C7" />
              <stop offset="50%" stopColor="#0369A1" />
              <stop offset="100%" stopColor="#082F49" />
            </>
          ) : theme === 'dino' ? (
            <>
              <stop offset="0%" stopColor="#065F46" />
              <stop offset="60%" stopColor="#047857" />
              <stop offset="100%" stopColor="#064E3B" />
            </>
          ) : theme === 'magic' ? (
            <>
              <stop offset="0%" stopColor="#4C1D95" />
              <stop offset="60%" stopColor="#6D28D9" />
              <stop offset="100%" stopColor="#2E1065" />
            </>
          ) : theme === 'animals' ? (
            <>
              <stop offset="0%" stopColor="#C2410C" />
              <stop offset="60%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#78350F" />
            </>
          ) : theme === 'live_tv' ? (
            <>
              <stop offset="0%" stopColor="#1E1B4B" />
              <stop offset="60%" stopColor="#3730A3" />
              <stop offset="100%" stopColor="#0F172A" />
            </>
          ) : theme === 'music' ? (
            <>
              <stop offset="0%" stopColor="#BE185D" />
              <stop offset="60%" stopColor="#E11D48" />
              <stop offset="100%" stopColor="#831843" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#1D4ED8" />
              <stop offset="60%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#0F172A" />
            </>
          )}
        </linearGradient>

        <radialGradient id={`glow-${uid}`} cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={`gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>

      {/* Backdrop */}
      <rect width="320" height="440" fill={`url(#bg-${uid})`} />
      <rect width="320" height="440" fill={`url(#glow-${uid})`} />

      {/* THEME GRAPHICS */}
      {theme === 'space' && (
        <g>
          {/* Animated stars */}
          <circle cx="48" cy="62" r="3" fill="#FDE047" className={`anim-star1-${uid}`} />
          <circle cx="270" cy="80" r="4" fill="#FFFFFF" className={`anim-star2-${uid}`} />
          <circle cx="70" cy="220" r="2.5" fill="#38BDF8" className={`anim-star3-${uid}`} />
          <circle cx="260" cy="240" r="3" fill="#FDE047" className={`anim-star1-${uid}`} />
          <circle cx="160" cy="30" r="2" fill="#FFFFFF" className={`anim-star2-${uid}`} />

          {/* Saturn Ring Planet */}
          <g transform="translate(240, 90)">
            <ellipse cx="0" cy="0" rx="36" ry="9" fill="none" stroke="#F59E0B" strokeWidth="6" opacity="0.8" transform="rotate(-20)" />
            <circle cx="0" cy="0" r="22" fill="#A855F7" />
          </g>

          {/* Bobbing Hero Rocket */}
          <g className={`anim-float-${uid}`} transform="translate(160, 160)">
            {/* Rocket thrust fire */}
            <polygon points="-8,45 0,72 8,45" fill="#F59E0B" className={`anim-pulse-${uid}`} />
            <polygon points="-4,45 0,60 4,45" fill="#FDE047" />
            {/* Rocket body */}
            <path d="M0 -55 C22 -20 28 25 18 45 L-18 45 C-28 25 -22 -20 0 -55 Z" fill="#F8FAFC" stroke="#0F172A" strokeWidth="4" />
            <path d="M0 -55 C12 -35 18 -15 19 0 L-19 0 C-18 -15 -12 -35 0 -55 Z" fill="#F43F5E" />
            {/* Fins */}
            <polygon points="-18,20 -42,48 -18,40" fill="#F43F5E" stroke="#0F172A" strokeWidth="3" />
            <polygon points="18,20 42,48 18,40" fill="#F43F5E" stroke="#0F172A" strokeWidth="3" />
            {/* Window */}
            <circle cx="0" cy="12" r="14" fill="#38BDF8" stroke="#0F172A" strokeWidth="3.5" />
            <circle cx="-3" cy="9" r="4" fill="#FFFFFF" />
          </g>
        </g>
      )}

      {theme === 'ocean' && (
        <g>
          {/* Waves */}
          <path
            d="M0 120 Q80 100 160 120 T320 120 L320 440 L0 440 Z"
            fill="#0369A1"
            opacity="0.5"
            className={`anim-wave-${uid}`}
          />
          <path
            d="M0 180 Q80 160 160 180 T320 180 L320 440 L0 440 Z"
            fill="#082F49"
            opacity="0.65"
          />

          {/* Bubbles */}
          <circle cx="64" cy="180" r="6" fill="#BAE6FD" opacity="0.6" className={`anim-star1-${uid}`} />
          <circle cx="250" cy="160" r="9" fill="#BAE6FD" opacity="0.6" className={`anim-star2-${uid}`} />
          <circle cx="230" cy="220" r="5" fill="#BAE6FD" opacity="0.5" className={`anim-star3-${uid}`} />

          {/* Floating Whale / Submarine */}
          <g className={`anim-float-${uid}`} transform="translate(160, 165)">
            {/* Water spout */}
            <path d="M-10 -40 Q-25 -65 -45 -60 M-8 -40 Q0 -70 0 -75 M-6 -40 Q15 -65 35 -60" fill="none" stroke="#E0F2FE" strokeWidth="5" strokeLinecap="round" className={`anim-pulse-${uid}`} />
            {/* Whale body */}
            <ellipse cx="0" cy="0" rx="70" ry="46" fill="#38BDF8" stroke="#0F172A" strokeWidth="4" />
            <path d="M65 0 L105 -25 L98 0 L105 25 Z" fill="#0EA5E9" stroke="#0F172A" strokeWidth="4" />
            {/* Underbelly */}
            <path d="M-40 18 Q0 46 45 18" fill="none" stroke="#E0F2FE" strokeWidth="8" strokeLinecap="round" />
            {/* Eye */}
            <circle cx="-38" cy="-10" r="7" fill="#0F172A" />
            <circle cx="-40" cy="-12" r="2.5" fill="#FFFFFF" />
            {/* Fin */}
            <ellipse cx="5" cy="12" rx="20" ry="10" fill="#0284C7" transform="rotate(25 5 12)" />
          </g>
        </g>
      )}

      {theme === 'dino' && (
        <g>
          {/* Volcano background */}
          <polygon points="210,180 250,90 290,180" fill="#78350F" opacity="0.75" />
          <circle cx="250" cy="84" r="8" fill="#F97316" className={`anim-star1-${uid}`} />
          <circle cx="254" cy="74" r="5" fill="#FDE047" className={`anim-star2-${uid}`} />

          {/* Gentle prehistoric hills */}
          <ellipse cx="80" cy="310" rx="140" ry="80" fill="#047857" />
          <ellipse cx="240" cy="320" rx="140" ry="80" fill="#064E3B" />

          {/* Cute Friendly Dino */}
          <g className={`anim-float-${uid}`} transform="translate(150, 175)">
            {/* Tail */}
            <path d="M-40 20 Q-85 10 -95 -20" fill="none" stroke="#10B981" strokeWidth="18" strokeLinecap="round" />
            {/* Body */}
            <ellipse cx="0" cy="15" rx="52" ry="38" fill="#10B981" stroke="#0F172A" strokeWidth="4" />
            {/* Back spikes */}
            <polygon points="-20,-16 -12,-32 -4,-16" fill="#F59E0B" />
            <polygon points="-2,-18 6,-34 14,-18" fill="#F59E0B" />
            <polygon points="16,-16 24,-30 32,-16" fill="#F59E0B" />
            {/* Neck & Head */}
            <path d="M28 10 Q42 -30 25 -52 Q5 -65 5 -40" fill="#10B981" />
            <ellipse cx="28" cy="-52" rx="28" ry="22" fill="#10B981" stroke="#0F172A" strokeWidth="4" />
            {/* Eye */}
            <circle cx="20" cy="-56" r="6" fill="#0F172A" />
            <circle cx="18" cy="-58" r="2.5" fill="#FFFFFF" />
            {/* Smile */}
            <path d="M28 -44 Q38 -40 44 -46" fill="none" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
            {/* Legs */}
            <rect x="-24" y="38" width="16" height="26" rx="8" fill="#059669" stroke="#0F172A" strokeWidth="3.5" />
            <rect x="8" y="38" width="16" height="26" rx="8" fill="#059669" stroke="#0F172A" strokeWidth="3.5" />
          </g>
        </g>
      )}

      {theme === 'magic' && (
        <g>
          {/* Magic aura rings */}
          <circle cx="160" cy="165" r="95" fill="none" stroke="#E879F9" strokeWidth="2" strokeDasharray="6 6" opacity="0.6" className={`anim-pulse-${uid}`} />
          <circle cx="160" cy="165" r="75" fill="none" stroke="#C084FC" strokeWidth="1.5" opacity="0.75" />

          {/* Sparkles */}
          <path d="M70 120 L74 105 L78 120 L93 124 L78 128 L74 143 L70 128 L55 124 Z" fill="#FDE047" className={`anim-star1-${uid}`} />
          <path d="M245 100 L248 88 L251 100 L263 103 L251 106 L248 118 L245 106 L233 103 Z" fill="#FDE047" className={`anim-star2-${uid}`} />
          <path d="M230 220 L233 210 L236 220 L246 223 L236 226 L233 236 L230 226 L220 223 Z" fill="#FFFFFF" className={`anim-star3-${uid}`} />

          {/* Floating Magic Wand & Star Crystal */}
          <g className={`anim-float-${uid}`} transform="translate(160, 160)">
            <line x1="-35" y1="45" x2="25" y2="-25" stroke="#FDE68A" strokeWidth="7" strokeLinecap="round" />
            <circle cx="28" cy="-28" r="24" fill="#F43F5E" stroke="#FDE68A" strokeWidth="4" />
            <path d="M28 -42 L32 -33 L42 -33 L34 -27 L37 -18 L28 -23 L19 -18 L22 -27 L14 -33 L24 -33 Z" fill="#FFFFFF" />
            <circle cx="28" cy="-28" r="34" fill="none" stroke="#F472B6" strokeWidth="3" opacity="0.5" className={`anim-pulse-${uid}`} />
          </g>
        </g>
      )}

      {theme === 'animals' && (
        <g>
          {/* Savannah Sunset Sun */}
          <circle cx="160" cy="150" r="88" fill="#FDE68A" opacity="0.3" className={`anim-pulse-${uid}`} />
          <circle cx="160" cy="150" r="70" fill="#F59E0B" opacity="0.5" />

          {/* Lion Hero */}
          <g className={`anim-float-${uid}`} transform="translate(160, 168)">
            {/* Mane */}
            <circle cx="0" cy="0" r="62" fill="#9A3412" stroke="#451A03" strokeWidth="4" />
            {/* Ears */}
            <circle cx="-32" cy="-42" r="16" fill="#EA580C" stroke="#451A03" strokeWidth="3.5" />
            <circle cx="32" cy="-42" r="16" fill="#EA580C" stroke="#451A03" strokeWidth="3.5" />
            {/* Face */}
            <circle cx="0" cy="0" r="44" fill="#FBBF24" stroke="#451A03" strokeWidth="3.5" />
            {/* Eyes */}
            <circle cx="-16" cy="-8" r="6" fill="#0F172A" />
            <circle cx="-18" cy="-10" r="2" fill="#FFFFFF" />
            <circle cx="16" cy="-8" r="6" fill="#0F172A" />
            <circle cx="14" cy="-10" r="2" fill="#FFFFFF" />
            {/* Nose & Mouth */}
            <polygon points="0,4 -8,-3 8,-3" fill="#9A3412" />
            <path d="M-8 12 Q0 20 8 12" fill="none" stroke="#0F172A" strokeWidth="3.5" strokeLinecap="round" />
            {/* Cheeks */}
            <circle cx="-25" cy="8" r="6" fill="#F87171" opacity="0.6" />
            <circle cx="25" cy="8" r="6" fill="#F87171" opacity="0.6" />
          </g>
        </g>
      )}

      {theme === 'live_tv' && (
        <g>
          {/* Broadcast Beams */}
          <path d="M160 55 Q110 30 60 50" fill="none" stroke="#38BDF8" strokeWidth="4" strokeLinecap="round" className={`anim-beam-${uid}`} />
          <path d="M160 55 Q210 30 260 50" fill="none" stroke="#38BDF8" strokeWidth="4" strokeLinecap="round" className={`anim-beam-${uid}`} />

          {/* Retro Animated Kids TV Screen */}
          <g className={`anim-float-${uid}`} transform="translate(160, 160)">
            {/* Antenna */}
            <line x1="-28" y1="-70" x2="-6" y2="-45" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
            <line x1="28" y1="-70" x2="6" y2="-45" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
            <circle cx="-28" cy="-70" r="5" fill="#EF4444" />
            <circle cx="28" cy="-70" r="5" fill="#EF4444" />

            {/* TV Outer Cabinet */}
            <rect x="-82" y="-45" width="164" height="120" rx="24" fill="#0284C7" stroke="#0C4A6E" strokeWidth="5" />
            {/* TV Screen */}
            <rect x="-68" y="-33" width="112" height="96" rx="14" fill="#0F172A" stroke="#0369A1" strokeWidth="3" />
            {/* Cartoon Smiley on TV */}
            <circle cx="-12" cy="15" r="28" fill="#FACC15" />
            <circle cx="-20" cy="10" r="4.5" fill="#000000" />
            <circle cx="-4" cy="10" r="4.5" fill="#000000" />
            <path d="M-22 22 Q-12 32 -2 22" fill="none" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" />

            {/* Knobs */}
            <circle cx="62" cy="-10" r="10" fill="#F59E0B" stroke="#78350F" strokeWidth="2.5" />
            <circle cx="62" cy="22" r="10" fill="#F59E0B" stroke="#78350F" strokeWidth="2.5" />
            {/* Speaker Grille */}
            <line x1="52" y1="46" x2="72" y2="46" stroke="#0369A1" strokeWidth="3" strokeLinecap="round" />
            <line x1="52" y1="52" x2="72" y2="52" stroke="#0369A1" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
      )}

      {(theme === 'cartoons' || theme === 'adventure' || theme === 'music') && (
        <g>
          {/* Bouncing Rainbow Ribbon */}
          <path d="M-20 200 C80 120 240 120 340 200" fill="none" stroke="#F43F5E" strokeWidth="8" opacity="0.75" />
          <path d="M-20 208 C80 128 240 128 340 208" fill="none" stroke="#FBBF24" strokeWidth="8" opacity="0.75" />
          <path d="M-20 216 C80 136 240 136 340 216" fill="none" stroke="#38BDF8" strokeWidth="8" opacity="0.75" />

          {/* Floating Character Star */}
          <g className={`anim-float-${uid}`} transform="translate(160, 160)">
            <path
              d="M0 -58 L16 -18 L58 -18 L24 8 L38 50 L0 24 L-38 50 L-24 8 L-58 -18 L-16 -18 Z"
              fill={`url(#gold-${uid})`}
              stroke="#B45309"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            {/* Star Face */}
            <circle cx="-12" cy="0" r="5" fill="#000000" />
            <circle cx="12" cy="0" r="5" fill="#000000" />
            <path d="M-10 12 Q0 22 10 12" fill="none" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="-18" cy="8" r="4" fill="#F43F5E" opacity="0.6" />
            <circle cx="18" cy="8" r="4" fill="#F43F5E" opacity="0.6" />
          </g>
        </g>
      )}

      {/* LOWER TITLE SCRIM (MEASURED CONTRAST FOR METADATA) */}
      <rect y="290" width="320" height="150" fill="black" opacity="0.75" />
      <rect y="270" width="320" height="30" fill="url(#bg-fade)" opacity="0.4" />

      {/* TOP BADGES */}
      <g transform="translate(14, 16)">
        {/* Rating Star Badge */}
        <rect width="52" height="24" rx="12" fill="#000000" opacity="0.65" />
        <text x="12" y="16" fontFamily="sans-serif" fontSize="12" fill="#FBBF24">★</text>
        <text x="24" y="16" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#FFFFFF">{rating}</text>
      </g>

      <g transform="translate(254, 16)">
        {/* Format Pill (TV or HD) */}
        <rect width="52" height="24" rx="12" fill="#F59E0B" />
        <text x="26" y="16" fontFamily="sans-serif" fontSize="10" fontWeight="900" fill="#000000" textAnchor="middle">
          {mediaType === 'tv' ? 'SERIE' : 'PELI'}
        </text>
      </g>

      {/* TITLE & FOOTER */}
      <g transform="translate(16, 345)">
        {/* Decorative micro bar */}
        <rect width="28" height="4" rx="2" fill="#F59E0B" />
        <text
          x="0"
          y="28"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="18"
          fontWeight="900"
          fill="#FFFFFF"
          letterSpacing="0.2"
        >
          {title.length > 22 ? `${title.slice(0, 20)}…` : title}
        </text>
        <text
          x="0"
          y="50"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="11"
          fontWeight="600"
          fill="#93C5FD"
        >
          {year} · {langCode.toUpperCase()} · HD Kids
        </text>
      </g>
    </svg>
  );
};

/* ============================================================================
 * 2. ANIMATED SVG MASCOTS (ZORRI, DINO, ROBI, MICHI)
 * ============================================================================ */
interface KidsAnimatedMascotProps {
  id: KidsMascotId;
  size?: number;
  className?: string;
}

export const KidsAnimatedMascotSvg: React.FC<KidsAnimatedMascotProps> = ({
  id,
  size = 56,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={id}
    >
      <defs>
        <style>{`
          @keyframes mBlink {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.1); }
          }
          @keyframes mEars {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(4deg); }
          }
          @keyframes mTail {
            0%, 100% { transform: rotate(-5deg); }
            50% { transform: rotate(8deg); }
          }
          @keyframes mBob {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-3px); }
          }
          .m-blink-${uid} { animation: mBlink 3.8s infinite; transform-origin: center; }
          .m-bob-${uid} { animation: mBob 2.8s ease-in-out infinite; transform-origin: center; }
          .m-tail-${uid} { animation: mTail 2.4s ease-in-out infinite; transform-origin: 20px 75px; }
          .m-ears-${uid} { animation: mEars 3.2s ease-in-out infinite; transform-origin: 50px 30px; }
        `}</style>
      </defs>

      {id === 'fox' && (
        <g className={`m-bob-${uid}`}>
          {/* Tail */}
          <path d="M22 68 C10 60 4 45 14 36 C22 28 30 38 28 55 Z" fill="#EA580C" className={`m-tail-${uid}`} />
          <path d="M14 36 C18 32 24 35 23 42 C18 42 16 38 14 36 Z" fill="#FFFFFF" />

          {/* Ears */}
          <polygon points="26,38 20,12 40,24" fill="#EA580C" stroke="#7C2D12" strokeWidth="2" className={`m-ears-${uid}`} />
          <polygon points="26,34 24,18 36,25" fill="#FFFFFF" />
          <polygon points="74,38 80,12 60,24" fill="#EA580C" stroke="#7C2D12" strokeWidth="2" className={`m-ears-${uid}`} />
          <polygon points="74,34 76,18 64,25" fill="#FFFFFF" />

          {/* Head */}
          <circle cx="50" cy="52" r="30" fill="#EA580C" stroke="#7C2D12" strokeWidth="2.5" />
          {/* White cheek patches */}
          <path d="M22 55 Q35 72 50 68 Q65 72 78 55 Q68 45 50 48 Q32 45 22 55 Z" fill="#FFFFFF" />

          {/* Eyes with blink */}
          <g className={`m-blink-${uid}`}>
            <ellipse cx="38" cy="48" rx="4" ry="5" fill="#0F172A" />
            <circle cx="36.5" cy="46" r="1.5" fill="#FFFFFF" />
            <ellipse cx="62" cy="48" rx="4" ry="5" fill="#0F172A" />
            <circle cx="60.5" cy="46" r="1.5" fill="#FFFFFF" />
          </g>

          {/* Nose & Smile */}
          <polygon points="50,62 45,56 55,56" fill="#18181B" />
          <path d="M46 64 Q50 68 54 64" fill="none" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {id === 'dino' && (
        <g className={`m-bob-${uid}`}>
          {/* Spikes */}
          <polygon points="46,14 50,6 54,14" fill="#F59E0B" />
          <polygon points="34,20 37,12 42,20" fill="#F59E0B" />
          <polygon points="24,30 26,22 32,30" fill="#F59E0B" />

          {/* Head & Neck */}
          <path d="M30 76 Q34 46 42 34 Q54 22 72 26 Q86 32 84 50 Q78 62 62 62 L60 76 Z" fill="#10B981" stroke="#065F46" strokeWidth="2.5" />
          {/* Cheek spot */}
          <circle cx="68" cy="46" r="4.5" fill="#34D399" />
          <circle cx="58" cy="52" r="3" fill="#34D399" />

          {/* Eye with blink */}
          <g className={`m-blink-${uid}`}>
            <circle cx="62" cy="36" r="5" fill="#0F172A" />
            <circle cx="60.5" cy="34" r="1.8" fill="#FFFFFF" />
          </g>

          {/* Snout & Smile */}
          <circle cx="80" cy="42" r="2" fill="#065F46" />
          <path d="M68 54 Q76 56 82 48" fill="none" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {id === 'bot' && (
        <g className={`m-bob-${uid}`}>
          {/* Antenna */}
          <line x1="50" y1="22" x2="50" y2="8" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="7" r="5" fill="#F43F5E" />

          {/* Head Box */}
          <rect x="22" y="22" width="56" height="48" rx="14" fill="#0284C7" stroke="#075985" strokeWidth="3" />
          {/* Ears / Screws */}
          <rect x="14" y="38" width="8" height="16" rx="3" fill="#38BDF8" />
          <rect x="78" y="38" width="8" height="16" rx="3" fill="#38BDF8" />

          {/* Face Display Screen */}
          <rect x="30" y="32" width="40" height="28" rx="8" fill="#0F172A" />

          {/* LED Eyes with blink */}
          <g className={`m-blink-${uid}`}>
            <rect x="37" y="38" width="8" height="8" rx="2" fill="#38BDF8" />
            <rect x="55" y="38" width="8" height="8" rx="2" fill="#38BDF8" />
          </g>

          {/* Digital Smile */}
          <path d="M42 53 Q50 58 58 53" fill="none" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {id === 'cat' && (
        <g className={`m-bob-${uid}`}>
          {/* Ears */}
          <polygon points="26,38 22,14 42,26" fill="#F59E0B" stroke="#B45309" strokeWidth="2" className={`m-ears-${uid}`} />
          <polygon points="28,34 26,20 38,28" fill="#FDE68A" />
          <polygon points="74,38 78,14 58,26" fill="#F59E0B" stroke="#B45309" strokeWidth="2" className={`m-ears-${uid}`} />
          <polygon points="72,34 74,20 62,28" fill="#FDE68A" />

          {/* Head */}
          <circle cx="50" cy="52" r="28" fill="#F59E0B" stroke="#B45309" strokeWidth="2.5" />

          {/* Whiskers */}
          <line x1="22" y1="52" x2="6" y2="48" stroke="#78350F" strokeWidth="2" strokeLinecap="round" />
          <line x1="22" y1="56" x2="8" y2="60" stroke="#78350F" strokeWidth="2" strokeLinecap="round" />
          <line x1="78" y1="52" x2="94" y2="48" stroke="#78350F" strokeWidth="2" strokeLinecap="round" />
          <line x1="78" y1="56" x2="92" y2="60" stroke="#78350F" strokeWidth="2" strokeLinecap="round" />

          {/* Eyes with blink */}
          <g className={`m-blink-${uid}`}>
            <ellipse cx="38" cy="48" rx="4.5" ry="5.5" fill="#10B981" />
            <ellipse cx="38" cy="48" rx="1.5" ry="4" fill="#000000" />
            <ellipse cx="62" cy="48" rx="4.5" ry="5.5" fill="#10B981" />
            <ellipse cx="62" cy="48" rx="1.5" ry="4" fill="#000000" />
          </g>

          {/* Nose & Mouth */}
          <polygon points="50,57 46,53 54,53" fill="#F43F5E" />
          <path d="M46 59 Q50 63 54 59" fill="none" stroke="#78350F" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
};

/* ============================================================================
 * 3. ANIMATED SVG CATEGORY & NAVIGATION ICONS
 * ============================================================================ */
export type KidsAnimatedIconId =
  | 'cinema'
  | 'fun'
  | 'learn'
  | 'live_tv'
  | 'recent'
  | 'animation'
  | 'animals'
  | 'dinosaurs'
  | 'space'
  | 'magic'
  | 'series'
  | 'educational'
  | 'puzzle'
  | 'simon'
  | 'draw'
  | 'piano'
  | 'languages'
  | 'math'
  | 'memory'
  | 'story'
  | 'science'
  | 'trivia'
  | 'bedtime'
  | 'chest'
  | 'smarttv';

export const KidsAnimatedCategoryIcon: React.FC<{
  name: KidsAnimatedIconId;
  size?: number;
  className?: string;
}> = ({ name, size = 20, className = 'shrink-0' }) => {
  const uid = useId().replace(/:/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <style>{`
          @keyframes iconSpinSlow { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          @keyframes iconHop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
          @keyframes iconPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
          .icon-spin-${uid} { animation: iconSpinSlow 8s linear infinite; transform-origin: center; }
          .icon-hop-${uid} { animation: iconHop 2.2s ease-in-out infinite; transform-origin: center; }
          .icon-pulse-${uid} { animation: iconPulse 2s ease-in-out infinite; transform-origin: center; }
        `}</style>
      </defs>

      {name === 'cinema' && (
        <g className={`icon-hop-${uid}`}>
          <rect x="4" y="8" width="24" height="18" rx="4" fill="#F59E0B" stroke="#78350F" strokeWidth="1.5" />
          <path d="M4 14 H28" stroke="#78350F" strokeWidth="1.5" />
          <polygon points="13,17 13,23 20,20" fill="#000000" />
          <polygon points="6,9 10,14 13,14 9,9" fill="#000000" />
          <polygon points="15,9 19,14 22,14 18,9" fill="#000000" />
        </g>
      )}

      {name === 'fun' && (
        <g className={`icon-pulse-${uid}`}>
          <rect x="3" y="10" width="26" height="15" rx="7" fill="#EC4899" stroke="#831843" strokeWidth="1.5" />
          <path d="M8 17 H14 M11 14 V20" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <circle cx="21" cy="15" r="2" fill="#FDE047" />
          <circle cx="24" cy="19" r="2" fill="#38BDF8" />
        </g>
      )}

      {name === 'learn' && (
        <g className={`icon-hop-${uid}`}>
          <path d="M16 4 L28 10 L16 16 L4 10 Z" fill="#38BDF8" stroke="#0369A1" strokeWidth="1.5" />
          <path d="M8 12.5 V21 C8 24 24 24 24 21 V12.5" fill="none" stroke="#0284C7" strokeWidth="2" />
          <line x1="26" y1="11" x2="26" y2="22" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
          <circle cx="26" cy="23" r="1.5" fill="#F59E0B" />
        </g>
      )}

      {name === 'live_tv' && (
        <g className={`icon-pulse-${uid}`}>
          <line x1="11" y1="4" x2="15" y2="9" stroke="#E2E8F0" strokeWidth="1.5" />
          <line x1="21" y1="4" x2="17" y2="9" stroke="#E2E8F0" strokeWidth="1.5" />
          <rect x="3" y="9" width="26" height="18" rx="5" fill="#EF4444" stroke="#7F1D1D" strokeWidth="1.5" />
          <rect x="6" y="12" width="16" height="12" rx="3" fill="#0F172A" />
          <circle cx="25" cy="15" r="2" fill="#FDE047" />
          <circle cx="25" cy="21" r="2" fill="#FDE047" />
        </g>
      )}

      {name === 'recent' && (
        <g className={`icon-hop-${uid}`}>
          <circle cx="16" cy="16" r="12" fill="#6366F1" stroke="#312E81" strokeWidth="1.5" />
          <polyline points="16,9 16,16 21,19" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {name === 'animation' && (
        <g className={`icon-hop-${uid}`}>
          <polygon points="16,3 20,12 30,13 22,20 25,30 16,24 7,30 10,20 2,13 12,12" fill="#FBBF24" stroke="#B45309" strokeWidth="1.5" />
        </g>
      )}

      {name === 'animals' && (
        <g className={`icon-hop-${uid}`}>
          <circle cx="16" cy="16" r="11" fill="#EA580C" />
          <circle cx="16" cy="16" r="8" fill="#FBBF24" />
          <circle cx="13" cy="15" r="1.5" fill="#000000" />
          <circle cx="19" cy="15" r="1.5" fill="#000000" />
          <polygon points="16,18 14,16 18,16" fill="#000000" />
        </g>
      )}

      {name === 'dinosaurs' && (
        <g className={`icon-hop-${uid}`}>
          <path d="M8 24 C7 14 14 10 22 12 Q26 6 22 4 C16 4 14 8 8 12" fill="#10B981" stroke="#065F46" strokeWidth="1.5" />
          <ellipse cx="16" cy="19" rx="8" ry="6" fill="#10B981" />
        </g>
      )}

      {name === 'space' && (
        <g className={`icon-pulse-${uid}`}>
          <path d="M16 3 C20 9 22 18 19 23 L13 23 C10 18 12 9 16 3 Z" fill="#F8FAFC" stroke="#0F172A" strokeWidth="1.5" />
          <polygon points="13,16 7,24 13,22" fill="#EF4444" />
          <polygon points="19,16 25,24 19,22" fill="#EF4444" />
          <circle cx="16" cy="12" r="3" fill="#38BDF8" />
          <polygon points="14,24 16,29 18,24" fill="#F59E0B" />
        </g>
      )}

      {name === 'magic' && (
        <g className={`icon-pulse-${uid}`}>
          <line x1="6" y1="26" x2="22" y2="10" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M22 6 L24 2 L26 6 L30 8 L26 10 L24 14 L22 10 L18 8 Z" fill="#F43F5E" />
        </g>
      )}

      {name === 'series' && (
        <g className={`icon-hop-${uid}`}>
          <rect x="7" y="4" width="18" height="12" rx="3" fill="#60A5FA" stroke="#1D4ED8" strokeWidth="1.2" />
          <rect x="5" y="11" width="22" height="15" rx="3" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="1.5" />
        </g>
      )}

      {name === 'educational' && (
        <g className={`icon-hop-${uid}`}>
          <circle cx="16" cy="17" r="10" fill="#8B5CF6" />
          <circle cx="12" cy="15" r="3" fill="#FFFFFF" />
          <circle cx="12" cy="15" r="1.5" fill="#000000" />
          <circle cx="20" cy="15" r="3" fill="#FFFFFF" />
          <circle cx="20" cy="15" r="1.5" fill="#000000" />
          <polygon points="16,19 14,17 18,17" fill="#F59E0B" />
        </g>
      )}

      {name === 'puzzle' && (
        <g className={`icon-pulse-${uid}`}>
          <rect x="6" y="6" width="20" height="20" rx="3" fill="#10B981" stroke="#065F46" strokeWidth="1.5" />
          <circle cx="16" cy="6" r="3" fill="#34D399" />
          <circle cx="26" cy="16" r="3" fill="#34D399" />
        </g>
      )}

      {name === 'simon' && (
        <g className={`icon-pulse-${uid}`}>
          <circle cx="16" cy="16" r="12" fill="#0F172A" stroke="#475569" strokeWidth="1.5" />
          <path d="M16 4 A12 12 0 0 1 28 16 H16 Z" fill="#EF4444" />
          <path d="M28 16 A12 12 0 0 1 16 28 V16 Z" fill="#3B82F6" />
          <path d="M16 28 A12 12 0 0 1 4 16 H16 Z" fill="#F59E0B" />
          <path d="M4 16 A12 12 0 0 1 16 4 V16 Z" fill="#10B981" />
          <circle cx="16" cy="16" r="4" fill="#0F172A" />
        </g>
      )}

      {name === 'draw' && (
        <g className={`icon-hop-${uid}`}>
          <ellipse cx="16" cy="16" rx="12" ry="10" fill="#FEF3C7" stroke="#B45309" strokeWidth="1.5" />
          <circle cx="10" cy="14" r="2" fill="#EF4444" />
          <circle cx="16" cy="11" r="2" fill="#3B82F6" />
          <circle cx="22" cy="14" r="2" fill="#10B981" />
          <circle cx="21" cy="20" r="2.5" fill="#78350F" />
        </g>
      )}

      {name === 'piano' && (
        <g className={`icon-hop-${uid}`}>
          <rect x="4" y="8" width="24" height="16" rx="3" fill="#FFFFFF" stroke="#000000" strokeWidth="1.5" />
          <line x1="10" y1="8" x2="10" y2="24" stroke="#000000" strokeWidth="1" />
          <line x1="16" y1="8" x2="16" y2="24" stroke="#000000" strokeWidth="1" />
          <line x1="22" y1="8" x2="22" y2="24" stroke="#000000" strokeWidth="1" />
          <rect x="8" y="8" width="4" height="9" fill="#000000" />
          <rect x="14" y="8" width="4" height="9" fill="#000000" />
          <rect x="20" y="8" width="4" height="9" fill="#000000" />
        </g>
      )}

      {name === 'languages' && (
        <g className={`icon-spin-${uid}`}>
          <circle cx="16" cy="16" r="11" fill="#38BDF8" stroke="#0284C7" strokeWidth="1.5" />
          <ellipse cx="16" cy="16" rx="5" ry="11" fill="none" stroke="#0284C7" strokeWidth="1.2" />
          <line x1="5" y1="16" x2="27" y2="16" stroke="#0284C7" strokeWidth="1.2" />
        </g>
      )}

      {name === 'math' && (
        <g className={`icon-hop-${uid}`}>
          <rect x="6" y="5" width="20" height="22" rx="4" fill="#6366F1" stroke="#3730A3" strokeWidth="1.5" />
          <rect x="9" y="8" width="14" height="5" rx="1.5" fill="#A5B4FC" />
          <text x="11" y="21" fontFamily="sans-serif" fontSize="8" fontWeight="bold" fill="#FFFFFF">+</text>
          <text x="18" y="21" fontFamily="sans-serif" fontSize="8" fontWeight="bold" fill="#FFFFFF">÷</text>
        </g>
      )}

      {name === 'memory' && (
        <g className={`icon-pulse-${uid}`}>
          <path d="M12 18 C8 16 8 9 13 8 C14 5 19 5 20 8 C25 9 25 16 21 18 Z" fill="#F472B6" stroke="#9D174D" strokeWidth="1.5" />
          <line x1="16" y1="8" x2="16" y2="18" stroke="#9D174D" strokeWidth="1.2" />
          <circle cx="16" cy="22" r="2" fill="#FDE047" />
        </g>
      )}

      {name === 'story' && (
        <g className={`icon-hop-${uid}`}>
          <path d="M6 8 Q16 10 26 8 V23 Q16 25 6 23 Z" fill="#FBBF24" stroke="#78350F" strokeWidth="1.5" />
          <line x1="16" y1="10" x2="16" y2="24" stroke="#78350F" strokeWidth="1.5" />
        </g>
      )}

      {name === 'science' && (
        <g className={`icon-spin-${uid}`}>
          <ellipse cx="16" cy="16" rx="12" ry="5" fill="none" stroke="#A855F7" strokeWidth="1.5" transform="rotate(30 16 16)" />
          <ellipse cx="16" cy="16" rx="12" ry="5" fill="none" stroke="#A855F7" strokeWidth="1.5" transform="rotate(-30 16 16)" />
          <circle cx="16" cy="16" r="3.5" fill="#F59E0B" />
        </g>
      )}

      {name === 'trivia' && (
        <g className={`icon-hop-${uid}`}>
          <path d="M8 8 H24 V16 C24 20 20 22 16 22 C12 22 8 20 8 16 Z" fill="#FBBF24" stroke="#92400E" strokeWidth="1.5" />
          <path d="M14 22 H18 V26 H14 Z" fill="#92400E" />
          <rect x="11" y="26" width="10" height="3" rx="1" fill="#78350F" />
        </g>
      )}

      {name === 'bedtime' && (
        <g className={`icon-pulse-${uid}`}>
          <path d="M22 6 A11 11 0 1 1 11 25 A12 12 0 0 0 22 6 Z" fill="#FDE047" stroke="#CA8A04" strokeWidth="1.5" />
          <circle cx="23" cy="8" r="1.5" fill="#FFFFFF" />
          <circle cx="25" cy="16" r="1" fill="#FFFFFF" />
        </g>
      )}

      {name === 'chest' && (
        <g className={`icon-hop-${uid}`}>
          <rect x="4" y="14" width="24" height="14" rx="2" fill="#B45309" stroke="#451A03" strokeWidth="1.5" />
          <path d="M4 14 Q16 8 28 14 Z" fill="#D97706" stroke="#451A03" strokeWidth="1.5" />
          <rect x="13" y="13" width="6" height="5" rx="1" fill="#FDE047" stroke="#451A03" strokeWidth="1" />
        </g>
      )}

      {name === 'smarttv' && (
        <g className={`icon-pulse-${uid}`}>
          <rect x="4" y="7" width="24" height="16" rx="3" fill="#1E293B" stroke="#64748B" strokeWidth="1.5" />
          <path d="M7 21 A8 8 0 0 1 15 21" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 17 A4 4 0 0 1 11 21" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
};
