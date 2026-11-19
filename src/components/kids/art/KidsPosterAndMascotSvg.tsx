import React, { useId } from 'react';
import type { KidsLanguageCode } from '../../../types';
import type { KidsMascotId } from '../kidsData';
import { getKidsUiCopy } from '../kidsI18n';

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
