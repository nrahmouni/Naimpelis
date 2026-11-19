import React from 'react';

const KNOWN_VOCAB_IDS = [
  'cat', 'dog', 'bird', 'fish', 'lion', 'sun', 'moon', 'water', 'star', 'mountain', 'tree',
  'one', 'two', 'three', 'four', 'five', 'book', 'friend', 'home', 'bread', 'apple', 'milk',
  'honey', 'tea', 'orange_fruit', 'color_red', 'color_blue', 'color_yellow', 'color_green',
  'color_white', 'mother', 'father', 'hand', 'eye', 'heart_shape', 'flower', 'sea',
  'action_run', 'action_eat', 'action_drink', 'action_play',
];

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
            <line key={deg} x1="40" y1="10" x2="40" y2="18" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" transform={`rotate(${deg} 40 40)`} />
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

      {!KNOWN_VOCAB_IDS.includes(iconId) && (
        <circle cx="40" cy="40" r="22" fill="#F59E0B" stroke="#78350F" strokeWidth="3" />
      )}
    </svg>
  );
};
