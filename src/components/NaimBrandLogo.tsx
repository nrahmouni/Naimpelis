import React, { useId } from 'react';

interface NaimBrandLogoProps {
  size?: number;
  className?: string;
  /** Dramatic theatrical timing used inside the full-screen NaimcineIntro */
  animated?: boolean;
  /** Render the dark Obsidian Cinema squircle stage behind the N C ribbons */
  withFrame?: boolean;
  /** Enable the signature Netflix-style ribbon unfold + periodic crimson sheen in headers/cards */
  live?: boolean;
}

/**
 * NAIM CINE "NC" Cinema Monogram (Netflix-Inspired 3D Folded Ribbon Edition):
 * - Left: Iconic 3-stroke folded 'N' in Netflix Scarlet (#E50914) with deep cast fold shadows
 *   (Left pillar rises -> Front diagonal ribbon unfolds -> Right pillar rises).
 * - Right: Matching 3D folded 'C' ribbon sweeping smoothly around with a crisp diagonal fold crease.
 * - Background: Pitch-black Obsidian stage (#050507) with subtle vertical Netflix spectrum filaments
 *   and a periodic specular light sweep across the N C ribbons.
 */
export const NaimBrandLogo: React.FC<NaimBrandLogoProps> = ({
  size = 40,
  className = '',
  animated = false,
  withFrame = true,
  live = true,
}) => {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  const chassisGrad = `nc-chassis-${uid}`;
  const bezelGrad = `nc-bezel-${uid}`;
  const ambientGlow = `nc-glow-${uid}`;
  const nPillarGrad = `nc-npillar-${uid}`;
  const nHeroDiagGrad = `nc-ndiag-${uid}`;
  const cLowerGrad = `nc-clower-${uid}`;
  const cUpperHeroGrad = `nc-cupper-${uid}`;
  const sheenGrad = `nc-sheen-${uid}`;
  const horizonGrad = `nc-horizon-${uid}`;
  const foldShadow = `nc-fold-${uid}`;
  const emblemGlow = `nc-emblemglow-${uid}`;
  const nClipId = `nc-nclip-${uid}`;
  const cClipId = `nc-cclip-${uid}`;
  const allLettersClipId = `nc-allclip-${uid}`;
  const cRevealMaskId = `nc-cmask-${uid}`;

  // Precise geometric paths for N and C (viewBox 0 0 100 100)
  const nLeftPath = 'M 13 21 H 23 V 78.1 L 13 79 Z';
  const nRightPath = 'M 39 21 H 49 V 77.0 L 39 77.3 Z';
  const nDiagPath = 'M 13 21 H 23.4 L 49 77.0 L 38.6 77.3 Z';

  // Bold architectural C with exact 10-unit ribbon thickness & wide 25-unit right aperture
  const cMasterPath = [
    'M 87.5 34.0',
    'C 84.8 24.8, 79.8 20.8, 73.2 20.8',
    'C 62.4 20.8, 55.5 32.8, 55.5 49.8',
    'C 55.5 66.8, 62.4 78.8, 73.2 78.8',
    'C 79.8 78.8, 84.8 74.8, 87.5 65.6',
    'L 78.2 62.4',
    'C 77.0 66.5, 75.4 68.8, 73.4 68.8',
    'C 68.4 68.8, 65.7 61.0, 65.7 49.8',
    'C 65.7 38.6, 68.4 30.8, 73.4 30.8',
    'C 75.4 30.8, 77.0 33.1, 78.2 37.2',
    'Z',
  ].join(' ');

  // Upper folded hero ribbon of C (casts Netflix 3D crease shadow onto lower C arc)
  const cUpperFoldPolygon = 'M 53 19 H 90 V 42 L 67 47 L 53 60 Z';

  // Centerline stroke used by the SVG mask to sweep-draw the C smoothly
  const cSweepCenterline =
    'M 83.2 36.2 C 80.8 28.0, 77.4 25.6, 73.3 25.6 C 65.2 25.6, 60.5 35.6, 60.5 49.8 C 60.5 64.0, 65.2 74.0, 73.3 74.0 C 77.4 74.0, 80.8 71.6, 83.2 63.4';

  const isAnimated = animated || live;
  const modePrefix = animated ? 'nc-intro' : live ? 'nc-live' : '';

  const remSize = `${(size / 16).toFixed(3)}rem`;

  return (
    <svg
      width={remSize}
      height={remSize}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="NAIM CINE NC Logo"
    >
      <defs>
        {/* Pitch-Black Netflix Cinema Obsidian Stage */}
        <linearGradient id={chassisGrad} x1="10" y1="6" x2="90" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#111116" />
          <stop offset="38%" stopColor="#060609" />
          <stop offset="100%" stopColor="#020204" />
        </linearGradient>

        {/* Subtle Scarlet & Smoked-Platinum Rim */}
        <linearGradient id={bezelGrad} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.34" />
          <stop offset="45%" stopColor="#27272A" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#E50914" stopOpacity="0.68" />
        </linearGradient>

        {/* Deep Theater Scarlet Ambient Backlight */}
        <radialGradient id={ambientGlow} cx="50" cy="52" r="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E50914" stopOpacity="0.28" />
          <stop offset="58%" stopColor="#990610" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* Recessed Vertical Pillars of N (Darker Netflix Crimson Behind Fold) */}
        <linearGradient id={nPillarGrad} x1="18" y1="21" x2="18" y2="79" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B80710" />
          <stop offset="48%" stopColor="#7D050C" />
          <stop offset="100%" stopColor="#A90610" />
        </linearGradient>

        {/* Signature Front Folded Diagonal Ribbon of N (Vibrant Netflix Scarlet) */}
        <linearGradient id={nHeroDiagGrad} x1="14" y1="21" x2="48" y2="77" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF2A38" />
          <stop offset="28%" stopColor="#E50914" />
          <stop offset="72%" stopColor="#D80813" />
          <stop offset="100%" stopColor="#FF1F2E" />
        </linearGradient>

        {/* Lower Recessed Arc of C */}
        <linearGradient id={cLowerGrad} x1="56" y1="45" x2="87" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#83050D" />
          <stop offset="52%" stopColor="#B50710" />
          <stop offset="100%" stopColor="#DF0914" />
        </linearGradient>

        {/* Upper Folded Hero Ribbon of C */}
        <linearGradient id={cUpperHeroGrad} x1="86" y1="22" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF3341" />
          <stop offset="42%" stopColor="#E50914" />
          <stop offset="88%" stopColor="#C90812" />
          <stop offset="100%" stopColor="#9E060F" />
        </linearGradient>

        {/* Moving Diagonal Specular Light Glint Across N C Ribbons */}
        <linearGradient id={sheenGrad} x1="0" y1="0" x2="100" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="45%" stopColor="#FFE4E6" stopOpacity="0.65" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        {/* Bottom CinemaScope Concave Scarlet Horizon Line */}
        <linearGradient id={horizonGrad} x1="15" y1="85" x2="85" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E50914" stopOpacity="0" />
          <stop offset="30%" stopColor="#E50914" stopOpacity="0.75" />
          <stop offset="50%" stopColor="#FF6B75" stopOpacity="0.95" />
          <stop offset="70%" stopColor="#E50914" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#E50914" stopOpacity="0" />
        </linearGradient>

        {/* 3D Cast Crease Shadow Where Ribbons Fold Over Each Other */}
        <filter id={foldShadow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2.4" stdDeviation="2.1" floodColor="#000000" floodOpacity="0.88" />
        </filter>

        {/* Subtle Theater Halation Around the N C Monogram */}
        <filter id={emblemGlow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.6" floodColor="#000000" floodOpacity="0.85" />
          <feDropShadow dx="0" dy="0" stdDeviation="2.8" floodColor="#E50914" floodOpacity="0.32" />
        </filter>

        <clipPath id={nClipId}>
          <path d={nLeftPath} />
          <path d={nRightPath} />
          <path d={nDiagPath} />
        </clipPath>

        <clipPath id={cClipId}>
          <path d={cMasterPath} />
        </clipPath>

        <clipPath id={allLettersClipId}>
          <path d={nLeftPath} />
          <path d={nRightPath} />
          <path d={nDiagPath} />
          <path d={cMasterPath} />
        </clipPath>

        <mask id={cRevealMaskId} maskUnits="userSpaceOnUse" x="50" y="15" width="45" height="70">
          <path
            d={cSweepCenterline}
            stroke="#FFFFFF"
            strokeWidth="15"
            strokeLinecap="square"
            fill="none"
            pathLength={100}
            className={isAnimated ? `${modePrefix}-c-stroke` : undefined}
          />
        </mask>
      </defs>

      {/* ================================================================== */}
      {/* 1. PITCH-BLACK OBSIDIAN STAGE + SUBTLE NETFLIX SPECTRUM FILAMENTS  */}
      {/* ================================================================== */}
      {withFrame && (
        <g>
          <rect width="100" height="100" rx="22" fill={`url(#${chassisGrad})`} />
          <rect x="2" y="2" width="96" height="96" rx="20" fill={`url(#${ambientGlow})`} />

          {/* Vertical Prismatic Netflix Spectrum Filaments in Deep Background */}
          <g className={isAnimated ? 'nc-spectrum-bars' : 'opacity-25'}>
            <rect x="17" y="10" width="1.6" height="80" fill="#E50914" fillOpacity="0.28" />
            <rect x="29" y="14" width="1.1" height="72" fill="#F59E0B" fillOpacity="0.16" />
            <rect x="44" y="8" width="2.0" height="84" fill="#E50914" fillOpacity="0.24" />
            <rect x="59" y="12" width="1.2" height="76" fill="#38BDF8" fillOpacity="0.14" />
            <rect x="73" y="10" width="1.8" height="80" fill="#E50914" fillOpacity="0.26" />
            <rect x="84" y="16" width="1.1" height="68" fill="#FB7185" fillOpacity="0.18" />
          </g>

          <rect
            x="1.1"
            y="1.1"
            width="97.8"
            height="97.8"
            rx="20.9"
            stroke={`url(#${bezelGrad})`}
            strokeWidth="1.4"
          />
        </g>
      )}

      {/* ================================================================== */}
      {/* 2. THE "N C" 3D FOLDED NETFLIX RIBBON MONOGRAM                     */}
      {/* ================================================================== */}
      <g filter={`url(#${emblemGlow})`}>
        {/* ---------------- LETTER 'N' (3-STROKE FOLDED RIBBON) ----------- */}
        <g clipPath={`url(#${nClipId})`}>
          {/* Stroke 1: Left Vertical Pillar (Rises UP) */}
          <path
            d={nLeftPath}
            fill={`url(#${nPillarGrad})`}
            className={isAnimated ? `${modePrefix}-n-left` : undefined}
          />

          {/* Stroke 3: Right Vertical Pillar (Rises UP) */}
          <path
            d={nRightPath}
            fill={`url(#${nPillarGrad})`}
            className={isAnimated ? `${modePrefix}-n-right` : undefined}
          />

          {/* Stroke 2: Front Diagonal Hero Ribbon (Unfolds Top-Left -> Bottom-Right) */}
          <g
            filter={`url(#${foldShadow})`}
            className={isAnimated ? `${modePrefix}-n-diag` : undefined}
          >
            <path d={nDiagPath} fill={`url(#${nHeroDiagGrad})`} />
            {/* Crisp Specular Celluloid Edge Highlight */}
            <line
              x1="23.1"
              y1="21.4"
              x2="48.6"
              y2="76.8"
              stroke="#FF9AA2"
              strokeOpacity="0.48"
              strokeWidth="0.75"
            />
          </g>
        </g>

        {/* ---------------- LETTER 'C' (3D FOLDED RIBBON ARC) ------------- */}
        <g mask={isAnimated ? `url(#${cRevealMaskId})` : undefined}>
          <g clipPath={`url(#${cClipId})`}>
            {/* Lower Recessed Scarlet Ribbon of C */}
            <path d={cMasterPath} fill={`url(#${cLowerGrad})`} />

            {/* Upper Folded Hero Ribbon of C Casting Crease Shadow */}
            <g filter={`url(#${foldShadow})`}>
              <path d={cUpperFoldPolygon} fill={`url(#${cUpperHeroGrad})`} />
            </g>

            {/* Subtle Outer Rim Highlight on Crown of C */}
            <path
              d="M 86.8 33.8 C 84.2 25.2, 79.4 21.4, 73.2 21.4 C 63.0 21.4, 56.2 33.0, 56.2 49.8"
              stroke="#FF9AA2"
              strokeOpacity="0.42"
              strokeWidth="0.75"
              fill="none"
            />
          </g>
        </g>

        {/* ---------------- LIVE RIBBON SPECULAR SHEEN SWEEP -------------- */}
        {isAnimated && (
          <g clipPath={`url(#${allLettersClipId})`}>
            <rect
              x="-45"
              y="10"
              width="34"
              height="82"
              transform="skewX(-20)"
              fill={`url(#${sheenGrad})`}
              className={animated ? 'nc-intro-sheen' : 'nc-live-sheen'}
            />
          </g>
        )}
      </g>

      {/* ================================================================== */}
      {/* 3. CINEMASCOPE SCARLET CURVED BASELINE                             */}
      {/* ================================================================== */}
      <path
        d="M 15 84.8 Q 50 82.2 85 84.8"
        stroke={`url(#${horizonGrad})`}
        strokeWidth="1.35"
        strokeLinecap="round"
        className={isAnimated ? `${modePrefix}-horizon` : undefined}
      />
    </svg>
  );
};
