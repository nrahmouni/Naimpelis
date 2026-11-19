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
