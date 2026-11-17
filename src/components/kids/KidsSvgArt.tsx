import React, { useId } from 'react';
import {
  Bell,
  Brain,
  Calculator,
  Compass,
  Crown,
  Film,
  Globe,
  Orbit,
  Rocket,
  Sparkles,
  Star,
  Trophy,
} from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import type { KidsAvatarId, KidsMascotId } from './kidsData';
import { getKidsUiCopy } from './kidsI18n';

export type KidsArtTheme =
  | 'space'
  | 'ocean'
  | 'dino'
  | 'magic'
  | 'animals'
  | 'adventure'
  | 'cartoons'
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
  if (/ocean|sea|mar|nemo|moana|delfin|tiburon|ballena|water|peix|aslem|aman/.test(t)) {
    return 'ocean';
  }
  if (/dino|jurassic|t-rex|fosil|prehistoric/.test(t)) {
    return 'dino';
  }
  if (/magic|magia|magica|frozen|encanto|totoro|dragon|hada|witch|fantasia|cuento/.test(t)) {
    return 'magic';
  }
  if (/animal|lion|rey leon|perro|gato|oso|bear|paddington|zootopia|madagascar|safari|amucc|aqzin|ayrad/.test(t)) {
    return 'animals';
  }
  if (/music|canta|coco|sing|cancion|piano|sonido|song/.test(t)) {
    return 'music';
  }
  if (/adventure|aventura|tadeo|heroe|super|spider|viaje/.test(t)) {
    return 'adventure';
  }
  return 'cartoons';
}

/* ============================================================================
 * 1. ANIMATED SVG POSTERS (ZERO EMOJIS)
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
  year = 'YouTube Kids',
  rating = 'KIDS',
  langCode = 'es',
  mediaType = 'movie',
  category = 'cartoons',
  genres = [],
  className = 'w-full h-full',
}) => {
  const uid = useId().replace(/:/g, '');
  const theme = detectKidsArtTheme(title, category, genres);
  const t = getKidsUiCopy(langCode);

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
          .anim-pulse-${uid} { animation: rtvPulseGlow 3s ease-in-out infinite; transform-origin: center; }
          .anim-float-${uid} { animation: rtvFloat 4s ease-in-out infinite; transform-origin: center; }
          .anim-star1-${uid} { animation: rtvStarTwinkle 2.2s ease-in-out infinite; transform-origin: center; }
          .anim-star2-${uid} { animation: rtvStarTwinkle 3.1s ease-in-out infinite 0.7s; transform-origin: center; }
          .anim-star3-${uid} { animation: rtvStarTwinkle 2.6s ease-in-out infinite 1.3s; transform-origin: center; }
          .anim-wave-${uid} { animation: rtvWaveDrift 3.5s ease-in-out infinite; }
        `}</style>

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

      <rect width="320" height="440" fill={`url(#bg-${uid})`} />
      <rect width="320" height="440" fill={`url(#glow-${uid})`} />

      {theme === 'space' && (
        <g>
          <circle cx="48" cy="62" r="3" fill="#FDE047" className={`anim-star1-${uid}`} />
          <circle cx="270" cy="80" r="4" fill="#FFFFFF" className={`anim-star2-${uid}`} />
          <circle cx="70" cy="220" r="2.5" fill="#38BDF8" className={`anim-star3-${uid}`} />
          <circle cx="260" cy="240" r="3" fill="#FDE047" className={`anim-star1-${uid}`} />
          <g transform="translate(240, 90)">
            <ellipse cx="0" cy="0" rx="36" ry="9" fill="none" stroke="#F59E0B" strokeWidth="6" opacity="0.8" transform="rotate(-20)" />
            <circle cx="0" cy="0" r="22" fill="#A855F7" />
          </g>
          <g className={`anim-float-${uid}`} transform="translate(160, 160)">
            <polygon points="-8,45 0,72 8,45" fill="#F59E0B" className={`anim-pulse-${uid}`} />
            <polygon points="-4,45 0,60 4,45" fill="#FDE047" />
            <path d="M0 -55 C22 -20 28 25 18 45 L-18 45 C-28 25 -22 -20 0 -55 Z" fill="#F8FAFC" stroke="#0F172A" strokeWidth="4" />
            <path d="M0 -55 C12 -35 18 -15 19 0 L-19 0 C-18 -15 -12 -35 0 -55 Z" fill="#F43F5E" />
            <polygon points="-18,20 -42,48 -18,40" fill="#F43F5E" stroke="#0F172A" strokeWidth="3" />
            <polygon points="18,20 42,48 18,40" fill="#F43F5E" stroke="#0F172A" strokeWidth="3" />
            <circle cx="0" cy="12" r="14" fill="#38BDF8" stroke="#0F172A" strokeWidth="3.5" />
            <circle cx="-3" cy="9" r="4" fill="#FFFFFF" />
          </g>
        </g>
      )}

      {theme === 'ocean' && (
        <g>
          <path d="M0 120 Q80 100 160 120 T320 120 L320 440 L0 440 Z" fill="#0369A1" opacity="0.5" className={`anim-wave-${uid}`} />
          <path d="M0 180 Q80 160 160 180 T320 180 L320 440 L0 440 Z" fill="#082F49" opacity="0.65" />
          <circle cx="64" cy="180" r="6" fill="#BAE6FD" opacity="0.6" className={`anim-star1-${uid}`} />
          <circle cx="250" cy="160" r="9" fill="#BAE6FD" opacity="0.6" className={`anim-star2-${uid}`} />
          <g className={`anim-float-${uid}`} transform="translate(160, 165)">
            <ellipse cx="0" cy="0" rx="70" ry="46" fill="#38BDF8" stroke="#0F172A" strokeWidth="4" />
            <path d="M65 0 L105 -25 L98 0 L105 25 Z" fill="#0EA5E9" stroke="#0F172A" strokeWidth="4" />
            <path d="M-40 18 Q0 46 45 18" fill="none" stroke="#E0F2FE" strokeWidth="8" strokeLinecap="round" />
            <circle cx="-38" cy="-10" r="7" fill="#0F172A" />
            <circle cx="-40" cy="-12" r="2.5" fill="#FFFFFF" />
          </g>
        </g>
      )}

      {theme === 'dino' && (
        <g>
          <ellipse cx="80" cy="310" rx="140" ry="80" fill="#047857" />
          <ellipse cx="240" cy="320" rx="140" ry="80" fill="#064E3B" />
          <g className={`anim-float-${uid}`} transform="translate(150, 175)">
            <path d="M-40 20 Q-85 10 -95 -20" fill="none" stroke="#10B981" strokeWidth="18" strokeLinecap="round" />
            <ellipse cx="0" cy="15" rx="52" ry="38" fill="#10B981" stroke="#0F172A" strokeWidth="4" />
            <polygon points="-20,-16 -12,-32 -4,-16" fill="#F59E0B" />
            <polygon points="-2,-18 6,-34 14,-18" fill="#F59E0B" />
            <polygon points="16,-16 24,-30 32,-16" fill="#F59E0B" />
            <ellipse cx="28" cy="-52" rx="28" ry="22" fill="#10B981" stroke="#0F172A" strokeWidth="4" />
            <circle cx="20" cy="-56" r="6" fill="#0F172A" />
            <circle cx="18" cy="-58" r="2.5" fill="#FFFFFF" />
          </g>
        </g>
      )}

      {theme === 'magic' && (
        <g>
          <circle cx="160" cy="165" r="95" fill="none" stroke="#E879F9" strokeWidth="2" strokeDasharray="6 6" opacity="0.6" className={`anim-pulse-${uid}`} />
          <path d="M70 120 L74 105 L78 120 L93 124 L78 128 L74 143 L70 128 L55 124 Z" fill="#FDE047" className={`anim-star1-${uid}`} />
          <g className={`anim-float-${uid}`} transform="translate(160, 160)">
            <line x1="-35" y1="45" x2="25" y2="-25" stroke="#FDE68A" strokeWidth="7" strokeLinecap="round" />
            <circle cx="28" cy="-28" r="24" fill="#F43F5E" stroke="#FDE68A" strokeWidth="4" />
            <path d="M28 -42 L32 -33 L42 -33 L34 -27 L37 -18 L28 -23 L19 -18 L22 -27 L14 -33 L24 -33 Z" fill="#FFFFFF" />
          </g>
        </g>
      )}

      {theme === 'animals' && (
        <g>
          <circle cx="160" cy="150" r="88" fill="#FDE68A" opacity="0.3" className={`anim-pulse-${uid}`} />
          <g className={`anim-float-${uid}`} transform="translate(160, 168)">
            <circle cx="0" cy="0" r="62" fill="#9A3412" stroke="#451A03" strokeWidth="4" />
            <circle cx="-32" cy="-42" r="16" fill="#EA580C" stroke="#451A03" strokeWidth="3.5" />
            <circle cx="32" cy="-42" r="16" fill="#EA580C" stroke="#451A03" strokeWidth="3.5" />
            <circle cx="0" cy="0" r="44" fill="#FBBF24" stroke="#451A03" strokeWidth="3.5" />
            <circle cx="-16" cy="-8" r="6" fill="#0F172A" />
            <circle cx="16" cy="-8" r="6" fill="#0F172A" />
            <polygon points="0,4 -8,-3 8,-3" fill="#9A3412" />
            <path d="M-8 12 Q0 20 8 12" fill="none" stroke="#0F172A" strokeWidth="3.5" strokeLinecap="round" />
          </g>
        </g>
      )}

      {(theme === 'cartoons' || theme === 'adventure' || theme === 'music') && (
        <g>
          <path d="M-20 200 C80 120 240 120 340 200" fill="none" stroke="#F43F5E" strokeWidth="8" opacity="0.75" />
          <path d="M-20 208 C80 128 240 128 340 208" fill="none" stroke="#FBBF24" strokeWidth="8" opacity="0.75" />
          <path d="M-20 216 C80 136 240 136 340 216" fill="none" stroke="#38BDF8" strokeWidth="8" opacity="0.75" />
          <g className={`anim-float-${uid}`} transform="translate(160, 160)">
            <path
              d="M0 -58 L16 -18 L58 -18 L24 8 L38 50 L0 24 L-38 50 L-24 8 L-58 -18 L-16 -18 Z"
              fill={`url(#gold-${uid})`}
              stroke="#B45309"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <circle cx="-12" cy="0" r="5" fill="#000000" />
            <circle cx="12" cy="0" r="5" fill="#000000" />
            <path d="M-10 12 Q0 22 10 12" fill="none" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" />
          </g>
        </g>
      )}

      <rect y="290" width="320" height="150" fill="black" opacity="0.75" />

      <g transform="translate(14, 16)">
        <rect width="62" height="24" rx="12" fill="#000000" opacity="0.65" />
        <polygon points="15,6 17,10 21,10.5 18,13.5 19,18 15,15.5 11,18 12,13.5 9,10.5 13,10" fill="#FBBF24" />
        <text x="27" y="16" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#FFFFFF">
          {rating}
        </text>
      </g>

      <g transform="translate(248, 16)">
        <rect width="58" height="24" rx="12" fill="#F59E0B" />
        <text x="29" y="16" fontFamily="sans-serif" fontSize="9.5" fontWeight="900" fill="#000000" textAnchor="middle">
          {mediaType === 'tv' ? t.formatSeries : t.formatMovie}
        </text>
      </g>

      <g transform="translate(16, 345)">
        <rect width="28" height="4" rx="2" fill="#F59E0B" />
        <text x="0" y="28" fontFamily="system-ui, -apple-system, sans-serif" fontSize="18" fontWeight="900" fill="#FFFFFF">
          {title.length > 22 ? `${title.slice(0, 20)}...` : title}
        </text>
        <text x="0" y="50" fontFamily="system-ui, -apple-system, sans-serif" fontSize="11" fontWeight="600" fill="#93C5FD">
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
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg" aria-label={id}>
      <defs>
        <style>{`
          @keyframes mBlink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
          @keyframes mEars { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(4deg); } }
          @keyframes mTail { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(8deg); } }
          @keyframes mBob { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
          .m-blink-${uid} { animation: mBlink 3.8s infinite; transform-origin: center; }
          .m-bob-${uid} { animation: mBob 2.8s ease-in-out infinite; transform-origin: center; }
          .m-tail-${uid} { animation: mTail 2.4s ease-in-out infinite; transform-origin: 20px 75px; }
          .m-ears-${uid} { animation: mEars 3.2s ease-in-out infinite; transform-origin: 50px 30px; }
        `}</style>
      </defs>

      {id === 'fox' && (
        <g className={`m-bob-${uid}`}>
          <path d="M22 68 C10 60 4 45 14 36 C22 28 30 38 28 55 Z" fill="#EA580C" className={`m-tail-${uid}`} />
          <path d="M14 36 C18 32 24 35 23 42 C18 42 16 38 14 36 Z" fill="#FFFFFF" />
          <polygon points="26,38 18,8 41,24" fill="#EA580C" stroke="#7C2D12" strokeWidth="2" className={`m-ears-${uid}`} />
          <polygon points="26,34 22,15 36,25" fill="#FDE68A" />
          <polygon points="74,38 82,8 59,24" fill="#EA580C" stroke="#7C2D12" strokeWidth="2" className={`m-ears-${uid}`} />
          <polygon points="74,34 78,15 64,25" fill="#FDE68A" />
          <circle cx="50" cy="54" r="29" fill="#EA580C" stroke="#7C2D12" strokeWidth="2.5" />
          <path d="M23 56 Q35 74 50 69 Q65 74 77 56 Q68 46 50 49 Q32 46 23 56 Z" fill="#FFFFFF" />
          <g className={`m-blink-${uid}`}>
            <ellipse cx="38" cy="49" rx="4" ry="5" fill="#0F172A" />
            <circle cx="36.5" cy="47" r="1.5" fill="#FFFFFF" />
            <ellipse cx="62" cy="49" rx="4" ry="5" fill="#0F172A" />
            <circle cx="60.5" cy="47" r="1.5" fill="#FFFFFF" />
          </g>
          <polygon points="50,63 45,57 55,57" fill="#18181B" />
          <path d="M46 65 Q50 69 54 65" fill="none" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {id === 'dino' && (
        <g className={`m-bob-${uid}`}>
          <polygon points="46,14 50,6 54,14" fill="#F59E0B" />
          <polygon points="34,20 37,12 42,20" fill="#F59E0B" />
          <polygon points="24,30 26,22 32,30" fill="#F59E0B" />
          <path d="M30 76 Q34 46 42 34 Q54 22 72 26 Q86 32 84 50 Q78 62 62 62 L60 76 Z" fill="#10B981" stroke="#065F46" strokeWidth="2.5" />
          <circle cx="68" cy="46" r="4.5" fill="#34D399" />
          <g className={`m-blink-${uid}`}>
            <circle cx="62" cy="36" r="5" fill="#0F172A" />
            <circle cx="60.5" cy="34" r="1.8" fill="#FFFFFF" />
          </g>
          <path d="M68 54 Q76 56 82 48" fill="none" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {id === 'bot' && (
        <g className={`m-bob-${uid}`}>
          <line x1="50" y1="22" x2="50" y2="8" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="7" r="5" fill="#F43F5E" />
          <rect x="22" y="22" width="56" height="48" rx="14" fill="#0284C7" stroke="#075985" strokeWidth="3" />
          <rect x="14" y="38" width="8" height="16" rx="3" fill="#38BDF8" />
          <rect x="78" y="38" width="8" height="16" rx="3" fill="#38BDF8" />
          <rect x="30" y="32" width="40" height="28" rx="8" fill="#0F172A" />
          <g className={`m-blink-${uid}`}>
            <rect x="37" y="38" width="8" height="8" rx="2" fill="#38BDF8" />
            <rect x="55" y="38" width="8" height="8" rx="2" fill="#38BDF8" />
          </g>
          <path d="M42 53 Q50 58 58 53" fill="none" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {id === 'cat' && (
        <g className={`m-bob-${uid}`}>
          <polygon points="26,38 22,14 42,26" fill="#F59E0B" stroke="#B45309" strokeWidth="2" className={`m-ears-${uid}`} />
          <polygon points="28,34 26,20 38,28" fill="#FDE68A" />
          <polygon points="74,38 78,14 58,26" fill="#F59E0B" stroke="#B45309" strokeWidth="2" className={`m-ears-${uid}`} />
          <polygon points="72,34 74,20 62,28" fill="#FDE68A" />
          <circle cx="50" cy="52" r="28" fill="#F59E0B" stroke="#B45309" strokeWidth="2.5" />
          <g className={`m-blink-${uid}`}>
            <ellipse cx="38" cy="48" rx="4.5" ry="5.5" fill="#10B981" />
            <ellipse cx="38" cy="48" rx="1.5" ry="4" fill="#000000" />
            <ellipse cx="62" cy="48" rx="4.5" ry="5.5" fill="#10B981" />
            <ellipse cx="62" cy="48" rx="1.5" ry="4" fill="#000000" />
          </g>
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
  | 'recent'
  | 'animation'
  | 'animals'
  | 'dinosaurs'
  | 'space'
  | 'magic'
  | 'songs'
  | 'educational'
  | 'simon'
  | 'languages'
  | 'math'
  | 'memory'
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
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <style>{`
          @keyframes iconSpinSlow { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          @keyframes iconHop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
          @keyframes iconPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
          .icon-spin-${uid} { animation: iconSpinSlow 10s linear infinite; transform-origin: center; }
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

      {name === 'songs' && (
        <g className={`icon-hop-${uid}`}>
          <path d="M12 22 V8 L25 6 V20" fill="none" stroke="#F472B6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9.5" cy="23" r="3.5" fill="#F472B6" />
          <circle cx="22.5" cy="21" r="3.5" fill="#38BDF8" />
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
          <text x="10.5" y="21" fontFamily="sans-serif" fontSize="8" fontWeight="bold" fill="#FFFFFF">+</text>
          <text x="17.5" y="21" fontFamily="sans-serif" fontSize="8" fontWeight="bold" fill="#FFFFFF">=</text>
        </g>
      )}

      {name === 'memory' && (
        <g className={`icon-pulse-${uid}`}>
          <rect x="5" y="6" width="13" height="17" rx="3" fill="#38BDF8" stroke="#0369A1" strokeWidth="1.4" />
          <rect x="14" y="9" width="13" height="17" rx="3" fill="#F472B6" stroke="#9D174D" strokeWidth="1.4" />
          <circle cx="20.5" cy="17.5" r="3" fill="#FDE047" />
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

/* ============================================================================
 * 4. CRISP VECTOR VOCABULARY ILLUSTRATIONS (ZERO EMOJIS)
 * ============================================================================ */
export const KidsVocabSvg: React.FC<{
  iconId: string;
  size?: number;
  className?: string;
}> = ({ iconId, size = 56, className = '' }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {iconId === 'cat' && (
        <g>
          <polygon points="18,32 14,12 32,22" fill="#FB923C" stroke="#7C2D12" strokeWidth="2.5" />
          <polygon points="62,32 66,12 48,22" fill="#FB923C" stroke="#7C2D12" strokeWidth="2.5" />
          <circle cx="40" cy="44" r="24" fill="#FDBA74" stroke="#7C2D12" strokeWidth="2.5" />
          <circle cx="31" cy="41" r="3.5" fill="#0F172A" />
          <circle cx="49" cy="41" r="3.5" fill="#0F172A" />
          <polygon points="40,51 36,46 44,46" fill="#F43F5E" />
          <line x1="18" y1="45" x2="8" y2="42" stroke="#7C2D12" strokeWidth="2" strokeLinecap="round" />
          <line x1="18" y1="50" x2="8" y2="52" stroke="#7C2D12" strokeWidth="2" strokeLinecap="round" />
          <line x1="62" y1="45" x2="72" y2="42" stroke="#7C2D12" strokeWidth="2" strokeLinecap="round" />
          <line x1="62" y1="50" x2="72" y2="52" stroke="#7C2D12" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'dog' && (
        <g>
          <ellipse cx="17" cy="42" rx="8" ry="16" fill="#92400E" stroke="#451A03" strokeWidth="2.5" transform="rotate(15 17 42)" />
          <ellipse cx="63" cy="42" rx="8" ry="16" fill="#92400E" stroke="#451A03" strokeWidth="2.5" transform="rotate(-15 63 42)" />
          <circle cx="40" cy="42" r="23" fill="#D97706" stroke="#451A03" strokeWidth="2.5" />
          <ellipse cx="40" cy="51" rx="13" ry="10" fill="#FEF3C7" />
          <circle cx="31" cy="36" r="3.5" fill="#0F172A" />
          <circle cx="49" cy="36" r="3.5" fill="#0F172A" />
          <ellipse cx="40" cy="47" rx="5" ry="3.5" fill="#0F172A" />
          <path d="M36 55 Q40 59 44 55" fill="none" stroke="#451A03" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'bird' && (
        <g>
          <ellipse cx="40" cy="44" rx="22" ry="18" fill="#38BDF8" stroke="#075985" strokeWidth="2.5" />
          <ellipse cx="32" cy="45" rx="11" ry="7" fill="#BAE6FD" />
          <circle cx="52" cy="35" r="3.5" fill="#0F172A" />
          <polygon points="61,38 73,41 61,45" fill="#F59E0B" stroke="#92400E" strokeWidth="1.5" />
          <line x1="35" y1="62" x2="35" y2="70" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
          <line x1="45" y1="62" x2="45" y2="70" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'fish' && (
        <g>
          <polygon points="18,40 6,27 10,40 6,53" fill="#0284C7" stroke="#0C4A6E" strokeWidth="2.5" />
          <ellipse cx="44" cy="40" rx="24" ry="16" fill="#22D3EE" stroke="#0C4A6E" strokeWidth="2.5" />
          <circle cx="57" cy="36" r="3.5" fill="#0F172A" />
          <path d="M36 30 Q43 40 36 50" fill="none" stroke="#0E7490" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'lion' && (
        <g>
          <circle cx="40" cy="41" r="28" fill="#B45309" stroke="#451A03" strokeWidth="2.5" />
          <circle cx="40" cy="41" r="20" fill="#FBBF24" stroke="#451A03" strokeWidth="2" />
          <circle cx="33" cy="37" r="3" fill="#0F172A" />
          <circle cx="47" cy="37" r="3" fill="#0F172A" />
          <polygon points="40,44 36,40 44,40" fill="#78350F" />
          <path d="M35 49 Q40 53 45 49" fill="none" stroke="#451A03" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'sun' && (
        <g>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1="40"
              y1="10"
              x2="40"
              y2="18"
              stroke="#F59E0B"
              strokeWidth="4"
              strokeLinecap="round"
              transform={`rotate(${deg} 40 40)`}
            />
          ))}
          <circle cx="40" cy="40" r="18" fill="#FDE047" stroke="#D97706" strokeWidth="2.5" />
        </g>
      )}

      {iconId === 'moon' && (
        <g>
          <path d="M48 16 A24 24 0 1 0 64 56 A20 20 0 1 1 48 16 Z" fill="#FDE047" stroke="#CA8A04" strokeWidth="2.5" />
          <circle cx="54" cy="28" r="3" fill="#FFFFFF" />
          <circle cx="62" cy="40" r="2" fill="#FFFFFF" />
        </g>
      )}

      {iconId === 'water' && (
        <g>
          <path d="M40 12 C40 12 60 36 60 49 A20 20 0 1 1 20 49 C20 36 40 12 40 12 Z" fill="#38BDF8" stroke="#0369A1" strokeWidth="2.5" />
          <path d="M31 50 Q31 58 38 61" fill="none" stroke="#E0F2FE" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'star' && (
        <polygon
          points="40,10 49,29 70,32 54,46 58,67 40,57 22,67 26,46 10,32 31,29"
          fill="#FBBF24"
          stroke="#B45309"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}

      {iconId === 'mountain' && (
        <g>
          <polygon points="8,64 34,20 56,64" fill="#64748B" stroke="#1E293B" strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="32,64 52,28 72,64" fill="#475569" stroke="#1E293B" strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="27,32 34,20 40,32 34,29" fill="#F8FAFC" />
          <polygon points="46,39 52,28 58,39 52,36" fill="#F8FAFC" />
        </g>
      )}

      {iconId === 'tree' && (
        <g>
          <rect x="34" y="46" width="12" height="22" rx="3" fill="#92400E" stroke="#451A03" strokeWidth="2" />
          <circle cx="40" cy="30" r="18" fill="#10B981" stroke="#065F46" strokeWidth="2.5" />
          <circle cx="28" cy="39" r="13" fill="#34D399" stroke="#065F46" strokeWidth="2" />
          <circle cx="52" cy="39" r="13" fill="#059669" stroke="#065F46" strokeWidth="2" />
        </g>
      )}

      {iconId === 'one' && (
        <g>
          <rect x="16" y="14" width="48" height="52" rx="14" fill="#38BDF8" stroke="#0369A1" strokeWidth="2.5" />
          <text x="40" y="51" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize="34" fontWeight="900" fill="#0F172A">1</text>
        </g>
      )}

      {iconId === 'two' && (
        <g>
          <rect x="16" y="14" width="48" height="52" rx="14" fill="#F472B6" stroke="#9D174D" strokeWidth="2.5" />
          <text x="40" y="51" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize="34" fontWeight="900" fill="#0F172A">2</text>
        </g>
      )}

      {iconId === 'three' && (
        <g>
          <rect x="16" y="14" width="48" height="52" rx="14" fill="#A78BFA" stroke="#5B21B6" strokeWidth="2.5" />
          <text x="40" y="51" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize="34" fontWeight="900" fill="#0F172A">3</text>
        </g>
      )}

      {iconId === 'book' && (
        <g>
          <rect x="16" y="16" width="46" height="50" rx="6" fill="#6366F1" stroke="#312E81" strokeWidth="2.5" />
          <rect x="24" y="16" width="38" height="50" rx="4" fill="#818CF8" stroke="#312E81" strokeWidth="2" />
          <rect x="31" y="27" width="24" height="8" rx="2" fill="#FDE047" />
          <line x1="31" y1="43" x2="53" y2="43" stroke="#E0E7FF" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'friend' && (
        <g>
          <circle cx="29" cy="30" r="10" fill="#FBBF24" stroke="#78350F" strokeWidth="2" />
          <path d="M16 60 C16 48 42 48 42 60" fill="#38BDF8" stroke="#0369A1" strokeWidth="2.5" />
          <circle cx="51" cy="30" r="10" fill="#FDBA74" stroke="#78350F" strokeWidth="2" />
          <path d="M38 60 C38 48 64 48 64 60" fill="#F472B6" stroke="#9D174D" strokeWidth="2.5" />
        </g>
      )}

      {iconId === 'home' && (
        <g>
          <polygon points="40,14 12,38 68,38" fill="#EF4444" stroke="#7F1D1D" strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="20" y="38" width="40" height="28" rx="3" fill="#FEF3C7" stroke="#78350F" strokeWidth="2.5" />
          <rect x="34" y="47" width="12" height="19" rx="2" fill="#D97706" stroke="#78350F" strokeWidth="2" />
        </g>
      )}

      {iconId === 'bread' && (
        <g>
          <ellipse cx="40" cy="44" rx="26" ry="18" fill="#F59E0B" stroke="#78350F" strokeWidth="2.5" />
          <ellipse cx="40" cy="40" rx="22" ry="12" fill="#FCD34D" />
          <line x1="27" y1="36" x2="34" y2="44" stroke="#92400E" strokeWidth="3" strokeLinecap="round" />
          <line x1="38" y1="34" x2="45" y2="43" stroke="#92400E" strokeWidth="3" strokeLinecap="round" />
          <line x1="49" y1="36" x2="55" y2="44" stroke="#92400E" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'apple' && (
        <g>
          <path d="M40 24 C28 16 14 26 16 44 C18 60 30 68 40 65 C50 68 62 60 64 44 C66 26 52 16 40 24 Z" fill="#EF4444" stroke="#7F1D1D" strokeWidth="2.5" />
          <path d="M40 22 Q41 12 48 10" fill="none" stroke="#78350F" strokeWidth="3.5" strokeLinecap="round" />
          <ellipse cx="48" cy="18" rx="8" ry="4" fill="#22C55E" stroke="#14532D" strokeWidth="1.5" transform="rotate(-20 48 18)" />
          <ellipse cx="29" cy="36" rx="4" ry="8" fill="#FCA5A5" opacity="0.65" />
        </g>
      )}

      {iconId === 'milk' && (
        <g>
          <rect x="24" y="24" width="32" height="44" rx="5" fill="#F8FAFC" stroke="#0369A1" strokeWidth="2.5" />
          <polygon points="24,24 32,12 48,12 56,24" fill="#E0F2FE" stroke="#0369A1" strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="24" y="42" width="32" height="14" fill="#38BDF8" opacity="0.7" />
          <circle cx="40" cy="49" r="4" fill="#FFFFFF" />
        </g>
      )}

      {iconId === 'honey' && (
        <g>
          <rect x="22" y="26" width="36" height="40" rx="12" fill="#F59E0B" stroke="#78350F" strokeWidth="2.5" />
          <rect x="26" y="16" width="28" height="10" rx="4" fill="#B45309" stroke="#451A03" strokeWidth="2" />
          <polygon points="40,36 47,41 47,49 40,54 33,49 33,41" fill="#FDE047" stroke="#92400E" strokeWidth="1.8" />
        </g>
      )}

      {iconId === 'tea' && (
        <g>
          <path d="M20 34 H52 V50 C52 60 20 60 20 50 Z" fill="#10B981" stroke="#064E3B" strokeWidth="2.5" />
          <path d="M52 38 C62 38 62 50 52 50" fill="none" stroke="#064E3B" strokeWidth="3.5" strokeLinecap="round" />
          <ellipse cx="36" cy="34" rx="16" ry="4" fill="#A7F3D0" stroke="#064E3B" strokeWidth="2" />
          <path d="M30 22 Q33 16 30 12" fill="none" stroke="#BAE6FD" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M40 20 Q43 14 40 10" fill="none" stroke="#BAE6FD" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'orange_fruit' && (
        <g>
          <circle cx="40" cy="44" r="22" fill="#FB923C" stroke="#9A3412" strokeWidth="2.5" />
          <ellipse cx="47" cy="20" rx="8" ry="4" fill="#22C55E" stroke="#14532D" strokeWidth="1.5" transform="rotate(-25 47 20)" />
          <circle cx="32" cy="37" r="3" fill="#FED7AA" />
        </g>
      )}

      {iconId === 'color_red' && <circle cx="40" cy="40" r="25" fill="#EF4444" stroke="#7F1D1D" strokeWidth="3" />}
      {iconId === 'color_blue' && <circle cx="40" cy="40" r="25" fill="#38BDF8" stroke="#0369A1" strokeWidth="3" />}
      {iconId === 'color_yellow' && <circle cx="40" cy="40" r="25" fill="#FACC15" stroke="#A16207" strokeWidth="3" />}
      {iconId === 'color_green' && <circle cx="40" cy="40" r="25" fill="#22C55E" stroke="#14532D" strokeWidth="3" />}
      {iconId === 'color_white' && <circle cx="40" cy="40" r="25" fill="#F8FAFC" stroke="#475569" strokeWidth="3" />}

      {iconId === 'mother' && (
        <g>
          <circle cx="40" cy="32" r="14" fill="#FDBA74" stroke="#7C2D12" strokeWidth="2.2" />
          <path d="M24 30 C24 14 56 14 56 30" fill="#7C3AED" stroke="#4C1D95" strokeWidth="2" />
          <path d="M18 66 C18 50 62 50 62 66 Z" fill="#EC4899" stroke="#831843" strokeWidth="2.5" />
          <circle cx="35" cy="31" r="2.2" fill="#0F172A" />
          <circle cx="45" cy="31" r="2.2" fill="#0F172A" />
        </g>
      )}

      {iconId === 'father' && (
        <g>
          <circle cx="40" cy="32" r="14" fill="#FDBA74" stroke="#7C2D12" strokeWidth="2.2" />
          <path d="M26 26 C26 16 54 16 54 26 Z" fill="#1E293B" />
          <path d="M18 66 C18 50 62 50 62 66 Z" fill="#0284C7" stroke="#0C4A6E" strokeWidth="2.5" />
          <circle cx="35" cy="31" r="2.2" fill="#0F172A" />
          <circle cx="45" cy="31" r="2.2" fill="#0F172A" />
        </g>
      )}

      {iconId === 'hand' && (
        <g>
          <rect x="25" y="34" width="30" height="30" rx="10" fill="#FDBA74" stroke="#9A3412" strokeWidth="2.5" />
          {[28, 36, 44, 51].map((x, idx) => (
            <rect key={x} x={x - 3} y={idx === 0 || idx === 3 ? 20 : 14} width="6" height="22" rx="3" fill="#FDBA74" stroke="#9A3412" strokeWidth="2" />
          ))}
        </g>
      )}

      {iconId === 'eye' && (
        <g>
          <path d="M10 40 Q40 16 70 40 Q40 64 10 40 Z" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.8" />
          <circle cx="40" cy="40" r="12" fill="#38BDF8" stroke="#0369A1" strokeWidth="2" />
          <circle cx="40" cy="40" r="5" fill="#0F172A" />
          <circle cx="44" cy="36" r="2.5" fill="#FFFFFF" />
        </g>
      )}

      {iconId === 'heart_shape' && (
        <path
          d="M40 66 C20 52 12 38 14 26 C16 14 32 14 40 25 C48 14 64 14 66 26 C68 38 60 52 40 66 Z"
          fill="#F43F5E"
          stroke="#881337"
          strokeWidth="2.5"
        />
      )}

      {iconId === 'four' && (
        <g>
          <rect x="16" y="14" width="48" height="52" rx="14" fill="#34D399" stroke="#065F46" strokeWidth="2.5" />
          <text x="40" y="51" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize="34" fontWeight="900" fill="#0F172A">4</text>
        </g>
      )}

      {iconId === 'five' && (
        <g>
          <rect x="16" y="14" width="48" height="52" rx="14" fill="#FBBF24" stroke="#92400E" strokeWidth="2.5" />
          <text x="40" y="51" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize="34" fontWeight="900" fill="#0F172A">5</text>
        </g>
      )}

      {iconId === 'flower' && (
        <g>
          <line x1="40" y1="42" x2="40" y2="70" stroke="#16A34A" strokeWidth="4.5" strokeLinecap="round" />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <circle key={deg} cx="40" cy="22" r="9" fill="#F472B6" stroke="#9D174D" strokeWidth="1.5" transform={`rotate(${deg} 40 34)`} />
          ))}
          <circle cx="40" cy="34" r="9" fill="#FDE047" stroke="#A16207" strokeWidth="2" />
        </g>
      )}

      {iconId === 'sea' && (
        <g>
          <rect x="10" y="24" width="60" height="40" rx="10" fill="#0284C7" stroke="#0C4A6E" strokeWidth="2.5" />
          <path d="M12 40 Q24 30 36 40 T60 40 L68 40" fill="none" stroke="#BAE6FD" strokeWidth="4" strokeLinecap="round" />
          <path d="M12 52 Q24 44 36 52 T60 52 L68 52" fill="none" stroke="#E0F2FE" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'action_run' && (
        <g>
          <circle cx="46" cy="20" r="8" fill="#FBBF24" stroke="#78350F" strokeWidth="2" />
          <path d="M40 30 L32 46 L20 42 M32 46 L46 54 L56 68 M32 46 L22 64 L14 66" fill="none" stroke="#38BDF8" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {iconId === 'action_eat' && (
        <g>
          <circle cx="40" cy="44" r="22" fill="#F8FAFC" stroke="#64748B" strokeWidth="2.5" />
          <circle cx="40" cy="44" r="14" fill="#FDE047" />
          <line x1="22" y1="20" x2="22" y2="34" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
          <line x1="58" y1="20" x2="58" y2="34" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'action_drink' && (
        <g>
          <polygon points="24,24 56,24 50,64 30,64" fill="#38BDF8" stroke="#0369A1" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M44 24 L54 12 L62 12" fill="none" stroke="#F43F5E" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}

      {iconId === 'action_play' && (
        <g>
          <circle cx="40" cy="40" r="23" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.5" />
          <polygon points="40,26 51,34 47,47 33,47 29,34" fill="#0F172A" />
        </g>
      )}

      {![
        'cat',
        'dog',
        'bird',
        'fish',
        'lion',
        'sun',
        'moon',
        'water',
        'star',
        'mountain',
        'tree',
        'one',
        'two',
        'three',
        'four',
        'five',
        'book',
        'friend',
        'home',
        'bread',
        'apple',
        'milk',
        'honey',
        'tea',
        'orange_fruit',
        'color_red',
        'color_blue',
        'color_yellow',
        'color_green',
        'color_white',
        'mother',
        'father',
        'hand',
        'eye',
        'heart_shape',
        'flower',
        'sea',
        'action_run',
        'action_eat',
        'action_drink',
        'action_play',
      ].includes(iconId) && (
        <circle cx="40" cy="40" r="22" fill="#F59E0B" stroke="#78350F" strokeWidth="3" />
      )}
    </svg>
  );
};

/* ============================================================================
 * 5. BADGE & SHOP LUCIDE ICON RENDERER (ZERO EMOJIS)
 * ============================================================================ */
export const KidsBadgeIcon: React.FC<{
  iconId: string;
  className?: string;
}> = ({ iconId, className = 'w-6 h-6' }) => {
  switch (iconId) {
    case 'compass':
      return <Compass className={className} />;
    case 'film':
      return <Film className={className} />;
    case 'rocket':
      return <Rocket className={className} />;
    case 'bell':
      return <Bell className={className} />;
    case 'calc':
      return <Calculator className={className} />;
    case 'brain':
      return <Brain className={className} />;
    case 'globe':
      return <Globe className={className} />;
    case 'trophy':
      return <Trophy className={className} />;
    case 'planets':
      return <Orbit className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'star':
    default:
      return <Star className={className} />;
  }
};

/* ============================================================================
 * 6. PROFILE EMBLEM ARTWORK + DETERMINISTIC AVATAR GENERATOR (ZERO EMOJIS)
 * ============================================================================ */
export const KidsAvatarArtworkSvg: React.FC<{
  avatarId: KidsAvatarId | string;
  size?: number;
  className?: string;
}> = ({ avatarId, size = 44, className = '' }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {avatarId === 'lion' ? (
        <g>
          <circle cx="32" cy="32" r="24" fill="#9A3412" />
          <circle cx="32" cy="32" r="17" fill="#FBBF24" />
          <circle cx="26" cy="29" r="2.5" fill="#0F172A" />
          <circle cx="38" cy="29" r="2.5" fill="#0F172A" />
          <polygon points="32,36 28,32 36,32" fill="#78350F" />
        </g>
      ) : avatarId === 'owl' ? (
        <g>
          <circle cx="32" cy="34" r="22" fill="#7C3AED" />
          <circle cx="24" cy="30" r="8" fill="#FFFFFF" />
          <circle cx="40" cy="30" r="8" fill="#FFFFFF" />
          <circle cx="24" cy="30" r="3.5" fill="#0F172A" />
          <circle cx="40" cy="30" r="3.5" fill="#0F172A" />
          <polygon points="32,40 28,34 36,34" fill="#F59E0B" />
        </g>
      ) : avatarId === 'dolphin' ? (
        <g>
          <circle cx="32" cy="32" r="22" fill="#0284C7" />
          <path d="M16 38 Q26 16 44 26 Q52 32 46 42 Q34 36 22 44 Z" fill="#BAE6FD" />
          <circle cx="39" cy="28" r="2.5" fill="#0F172A" />
        </g>
      ) : avatarId === 'panda' ? (
        <g>
          <circle cx="19" cy="18" r="7" fill="#0F172A" />
          <circle cx="45" cy="18" r="7" fill="#0F172A" />
          <circle cx="32" cy="34" r="20" fill="#F8FAFC" />
          <ellipse cx="24" cy="31" rx="5" ry="6" fill="#0F172A" />
          <ellipse cx="40" cy="31" rx="5" ry="6" fill="#0F172A" />
          <circle cx="24" cy="30" r="2" fill="#FFFFFF" />
          <circle cx="40" cy="30" r="2" fill="#FFFFFF" />
          <ellipse cx="32" cy="39" rx="3.5" ry="2.5" fill="#0F172A" />
        </g>
      ) : avatarId === 'falcon' ? (
        <g>
          <circle cx="32" cy="32" r="22" fill="#0F766E" />
          <path d="M14 40 L32 16 L50 40 L32 34 Z" fill="#FDE047" />
          <circle cx="32" cy="28" r="3" fill="#0F172A" />
        </g>
      ) : (
        /* Fennec Fox (default mascot emblem) */
        <g>
          <polygon points="20,28 13,9 29,19" fill="#EA580C" />
          <polygon points="44,28 51,9 35,19" fill="#EA580C" />
          <circle cx="32" cy="36" r="19" fill="#EA580C" />
          <path d="M16 39 Q24 50 32 46 Q40 50 48 39 Q40 33 32 35 Q24 33 16 39 Z" fill="#FFFFFF" />
          <circle cx="25" cy="34" r="2.5" fill="#0F172A" />
          <circle cx="39" cy="34" r="2.5" fill="#0F172A" />
          <polygon points="32,42 29,39 35,39" fill="#0F172A" />
        </g>
      )}
    </svg>
  );
};

export interface KidsAvatarSpec {
  mascotId: KidsMascotId;
  avatarId: KidsAvatarId;
  bgStart: string;
  bgEnd: string;
  ringColor: string;
  initial: string;
}

const AVATAR_PALETTES = [
  { bgStart: '#F59E0B', bgEnd: '#B45309', ringColor: '#FDE68A' },
  { bgStart: '#38BDF8', bgEnd: '#0369A1', ringColor: '#BAE6FD' },
  { bgStart: '#EC4899', bgEnd: '#9D174D', ringColor: '#FBCFE8' },
  { bgStart: '#10B981', bgEnd: '#047857', ringColor: '#A7F3D0' },
  { bgStart: '#8B5CF6', bgEnd: '#5B21B6', ringColor: '#DDD6FE' },
  { bgStart: '#FB923C', bgEnd: '#C2410C', ringColor: '#FED7AA' },
];

const VALID_AVATAR_IDS: KidsAvatarId[] = ['fennec', 'lion', 'owl', 'dolphin', 'panda', 'falcon'];

export function generateKidsAvatarSpec(name: string, fallbackAvatarId = 'fennec'): KidsAvatarSpec {
  const clean = (name || 'Peque').trim();
  const lower = clean.toLowerCase();
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
  }

  let mascotId: KidsMascotId = (['fox', 'dino', 'bot', 'cat'] as KidsMascotId[])[hash % 4];
  let avatarId: KidsAvatarId = VALID_AVATAR_IDS.includes(fallbackAvatarId as KidsAvatarId)
    ? (fallbackAvatarId as KidsAvatarId)
    : 'fennec';

  if (/leo|leon|simba|rey/.test(lower)) {
    mascotId = 'cat';
    avatarId = 'lion';
  } else if (/dino|rex|dragon/.test(lower)) {
    mascotId = 'dino';
    avatarId = 'falcon';
  } else if (/bot|robo|max|neo/.test(lower)) {
    mascotId = 'bot';
    avatarId = 'owl';
  } else if (/zor|fox|luna|mia/.test(lower)) {
    mascotId = 'fox';
    avatarId = 'fennec';
  }

  const palette = AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  return {
    mascotId,
    avatarId,
    ...palette,
    initial: clean.charAt(0).toUpperCase() || 'R',
  };
}

export const KidsUniqueNameAvatarSvg: React.FC<{
  name: string;
  fallbackAvatarId?: string;
  size?: number;
  className?: string;
}> = ({ name, fallbackAvatarId = 'fennec', size = 44, className = '' }) => {
  const uid = useId().replace(/:/g, '');
  const spec = generateKidsAvatarSpec(name, fallbackAvatarId);

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative shrink-0 inline-flex items-center justify-center ${className}`}
      aria-label={name || 'Avatar Kids'}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <defs>
          <linearGradient id={`avbg-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={spec.bgStart} />
            <stop offset="100%" stopColor={spec.bgEnd} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill={`url(#avbg-${uid})`} stroke={spec.ringColor} strokeWidth="5" />
        <circle cx="32" cy="28" r="10" fill="#FFFFFF" opacity="0.16" />
        <g transform="translate(18, 18)">
          <svg width="64" height="64" viewBox="0 0 64 64">
            {spec.avatarId === 'lion' ? (
              <g>
                <circle cx="32" cy="32" r="24" fill="#9A3412" />
                <circle cx="32" cy="32" r="17" fill="#FBBF24" />
                <circle cx="26" cy="29" r="2.5" fill="#0F172A" />
                <circle cx="38" cy="29" r="2.5" fill="#0F172A" />
                <polygon points="32,36 28,32 36,32" fill="#78350F" />
              </g>
            ) : spec.avatarId === 'owl' ? (
              <g>
                <circle cx="32" cy="34" r="22" fill="#7C3AED" />
                <circle cx="24" cy="30" r="8" fill="#FFFFFF" />
                <circle cx="40" cy="30" r="8" fill="#FFFFFF" />
                <circle cx="24" cy="30" r="3.5" fill="#0F172A" />
                <circle cx="40" cy="30" r="3.5" fill="#0F172A" />
                <polygon points="32,40 28,34 36,34" fill="#F59E0B" />
              </g>
            ) : spec.avatarId === 'dolphin' ? (
              <g>
                <circle cx="32" cy="32" r="22" fill="#0284C7" />
                <path d="M16 38 Q26 16 44 26 Q52 32 46 42 Q34 36 22 44 Z" fill="#BAE6FD" />
                <circle cx="39" cy="28" r="2.5" fill="#0F172A" />
              </g>
            ) : spec.avatarId === 'panda' ? (
              <g>
                <circle cx="19" cy="18" r="7" fill="#0F172A" />
                <circle cx="45" cy="18" r="7" fill="#0F172A" />
                <circle cx="32" cy="34" r="20" fill="#F8FAFC" />
                <ellipse cx="24" cy="31" rx="5" ry="6" fill="#0F172A" />
                <ellipse cx="40" cy="31" rx="5" ry="6" fill="#0F172A" />
                <circle cx="24" cy="30" r="2" fill="#FFFFFF" />
                <circle cx="40" cy="30" r="2" fill="#FFFFFF" />
                <ellipse cx="32" cy="39" rx="3.5" ry="2.5" fill="#0F172A" />
              </g>
            ) : spec.avatarId === 'falcon' ? (
              <g>
                <circle cx="32" cy="32" r="22" fill="#0F766E" />
                <path d="M14 40 L32 16 L50 40 L32 34 Z" fill="#FDE047" />
                <circle cx="32" cy="28" r="3" fill="#0F172A" />
              </g>
            ) : (
              <g>
                <polygon points="20,28 13,9 29,19" fill="#EA580C" />
                <polygon points="44,28 51,9 35,19" fill="#EA580C" />
                <circle cx="32" cy="36" r="19" fill="#EA580C" />
                <path d="M16 39 Q24 50 32 46 Q40 50 48 39 Q40 33 32 35 Q24 33 16 39 Z" fill="#FFFFFF" />
                <circle cx="25" cy="34" r="2.5" fill="#0F172A" />
                <circle cx="39" cy="34" r="2.5" fill="#0F172A" />
                <polygon points="32,42 29,39 35,39" fill="#0F172A" />
              </g>
            )}
          </svg>
        </g>
        <circle cx="77" cy="77" r="16" fill="#0F172A" stroke={spec.ringColor} strokeWidth="3" />
        <text
          x="77"
          y="83"
          textAnchor="middle"
          fontSize="16"
          fontWeight="900"
          fill="#FFFFFF"
          fontFamily="Fredoka, system-ui, sans-serif"
        >
          {spec.initial}
        </text>
      </svg>
    </div>
  );
};
