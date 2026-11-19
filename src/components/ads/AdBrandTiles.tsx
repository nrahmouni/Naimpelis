import React from 'react';

export const BrandTile: React.FC<{
  name: string;
  sub: string;
  accent: string;
  children: React.ReactNode;
}> = ({ name, sub, accent, children }) => (
  <div
    className="relative rounded-2xl p-4 bg-[#18181B] border border-white/[0.09] flex flex-col justify-between gap-3 overflow-hidden"
    style={{
      background: `linear-gradient(155deg, ${accent}1A 0%, #1F1F23 58%, #0E0E10 100%)`,
    }}
  >
    <div className="h-10 flex items-center">{children}</div>
    <div>
      <div className="font-display font-bold text-sm text-white tracking-tight leading-tight">
        {name}
      </div>
      <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{sub}</div>
    </div>
  </div>
);

/** Compact crisp vector brand badge used inside the Vertical Pro Ad Flyer & Story */
export const ProAdLogoPill: React.FC<{
  bg: string;
  textColor?: string;
  badge: string;
  name: string;
  detail: string;
}> = ({ bg, textColor = '#FFFFFF', badge, name, detail }) => (
  <div className="p-2.5 rounded-2xl bg-[#1F1F23]/95 border border-white/[0.11] flex items-center gap-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
    <div
      className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center font-display font-black text-[11px] tracking-tight shadow-inner"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {badge}
    </div>
    <div className="min-w-0">
      <div className="font-display font-bold text-xs text-white leading-tight truncate">
        {name}
      </div>
      <div className="text-[10px] text-zinc-400 leading-tight truncate mt-0.5">{detail}</div>
    </div>
  </div>
);

export const FullSheetBrandGrid: React.FC = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
    <BrandTile name="Netflix" sub="Estrenos, Películas y Series Originales HD" accent="#E50914">
      <svg viewBox="0 0 120 32" className="h-7 w-auto">
        <rect width="32" height="32" rx="8" fill="#E50914" />
        <path d="M9.5 6.5H14L19.5 20V6.5H23.5V25.5H19.2L13.5 11.8V25.5H9.5V6.5Z" fill="#FFFFFF" />
        <text x="40" y="22" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="16" letterSpacing="0.5">NETFLIX</text>
      </svg>
    </BrandTile>

    <BrandTile name="HBO Max" sub="From, La Casa del Dragón, The Last of Us y Cine" accent="#7C3AED">
      <svg viewBox="0 0 130 32" className="h-7 w-auto">
        <rect width="46" height="32" rx="8" fill="#5B21B6" />
        <text x="23" y="21" textAnchor="middle" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="900" fontSize="13" letterSpacing="1">MAX</text>
        <text x="55" y="22" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">HBO Max</text>
      </svg>
    </BrandTile>

    <BrandTile name="Disney+" sub="Disney, Pixar, Marvel, Star Wars y Star" accent="#2563EB">
      <svg viewBox="0 0 130 32" className="h-7 w-auto">
        <rect width="40" height="32" rx="8" fill="#0063E5" />
        <text x="20" y="21.5" textAnchor="middle" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="900" fontSize="14">D+</text>
        <text x="49" y="22" fill="#93C5FD" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="16">Disney+</text>
      </svg>
    </BrandTile>

    <BrandTile name="Prime Video" sub="Reina Roja, The Boys, Fallout y Superproducciones" accent="#00A8E1">
      <svg viewBox="0 0 140 32" className="h-7 w-auto">
        <rect width="50" height="32" rx="8" fill="#00A8E1" />
        <text x="25" y="20.5" textAnchor="middle" fill="#04121A" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="900" fontSize="11">PRIME</text>
        <text x="59" y="22" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">prime video</text>
      </svg>
    </BrandTile>

    <BrandTile name="Apple TV+" sub="Severance, Silo, Ted Lasso y Apple Originals" accent="#E4E4E7">
      <svg viewBox="0 0 130 32" className="h-7 w-auto">
        <rect width="42" height="32" rx="8" fill="#F4F4F5" />
        <text x="21" y="21.5" textAnchor="middle" fill="#0E0E10" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="900" fontSize="14">tv+</text>
        <text x="51" y="22" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">Apple TV+</text>
      </svg>
    </BrandTile>

    <BrandTile name="Movistar+ en Vivo" sub="M+ LaLiga, Liga de Campeones, Vamos, Estrenos y Acción" accent="#019DF4">
      <svg viewBox="0 0 145 32" className="h-7 w-auto">
        <rect width="42" height="32" rx="8" fill="#019DF4" />
        <text x="21" y="21.5" textAnchor="middle" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="900" fontSize="15">M+</text>
        <text x="51" y="22" fill="#38BDF8" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">Movistar+</text>
      </svg>
    </BrandTile>

    <BrandTile name="DAZN en Directo" sub="DAZN LaLiga, DAZN F1 24/7, MotoGP y DAZN 1–4 HD" accent="#FFFFFF">
      <svg viewBox="0 0 135 32" className="h-7 w-auto">
        <rect x="1" y="1" width="48" height="30" rx="7" fill="#FFFFFF" />
        <text x="25" y="20.5" textAnchor="middle" fill="#0E0E10" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="900" fontSize="12" letterSpacing="-0.3">DAZN</text>
        <text x="58" y="22" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">DAZN Live</text>
      </svg>
    </BrandTile>

    <BrandTile name="TDT España + Guía EPG" sub="La 1, Antena 3, Cuatro, Telecinco, laSexta, 24h y Autonómicas" accent="#10B981">
      <svg viewBox="0 0 145 32" className="h-7 w-auto">
        <rect width="44" height="32" rx="8" fill="#10B981" />
        <text x="22" y="21" textAnchor="middle" fill="#03140E" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="900" fontSize="12">TDT</text>
        <text x="53" y="22" fill="#6EE7B7" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">TDT España</text>
      </svg>
    </BrandTile>

    <BrandTile name="Anime por Género" sub="Series y películas de animación japonesa en VOSE y Español" accent="#F97316">
      <svg viewBox="0 0 150 32" className="h-7 w-auto">
        <rect width="42" height="32" rx="8" fill="#F47521" />
        <circle cx="21" cy="16" r="7.5" fill="#FFFFFF" />
        <circle cx="23" cy="16" r="5" fill="#F47521" />
        <text x="51" y="22" fill="#FDBA74" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">Anime & Cine</text>
      </svg>
    </BrandTile>

    <BrandTile name="Todo en Castellano" sub="Hub dedicado 100% Doblaje Español de España + VO" accent="#F59E0B">
      <svg viewBox="0 0 145 32" className="h-7 w-auto">
        <rect width="44" height="32" rx="8" fill="#F59E0B" />
        <text x="22" y="21.5" textAnchor="middle" fill="#170E02" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="900" fontSize="13">ES</text>
        <text x="53" y="22" fill="#FDE68A" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">Castellano HD</text>
      </svg>
    </BrandTile>

    <BrandTile name="Anime en Català" sub="SX3 · 3Cat · TV3 · Bola de Drac, Conan, Sakura i clàssics" accent="#9146FF">
      <svg viewBox="0 0 148 32" className="h-7 w-auto">
        <rect width="48" height="32" rx="8" fill="#9146FF" />
        <text x="24" y="21" textAnchor="middle" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="900" fontSize="12">SX3</text>
        <text x="57" y="22" fill="#E9D5FF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">Català · 3Cat</text>
      </svg>
    </BrandTile>

    <BrandTile name="YouTube & Cloud URL" sub="Watch Party de YouTube, enlaces M3U8/MP4 y Cloud Browser" accent="#EF4444">
      <svg viewBox="0 0 145 32" className="h-7 w-auto">
        <rect width="44" height="32" rx="8" fill="#FF0033" />
        <path d="M18 10.5L28.5 16L18 21.5V10.5Z" fill="#FFFFFF" />
        <text x="53" y="22" fill="#FFFFFF" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15">YouTube Sala</text>
      </svg>
    </BrandTile>
  </div>
);
