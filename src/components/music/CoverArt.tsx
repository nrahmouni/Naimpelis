import React, { useEffect, useState } from 'react';

interface CoverArtProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  priority?: boolean;
}

const PALETTES: Array<[string, string]> = [
  ['#064E3B', '#0E7490'],
  ['#065F46', '#155E75'],
  ['#0F766E', '#0369A1'],
  ['#047857', '#0891B2'],
  ['#115E59', '#1D4ED8'],
];

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function extractInitials(label: string): string {
  const clean = label.trim();
  if (!clean) return 'RM';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export const CoverArt: React.FC<CoverArtProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackLabel,
  priority = false,
}) => {
  const trimmed = (src || '').trim();
  const [stage, setStage] = useState<'direct' | 'proxy' | 'monogram'>(
    trimmed ? 'direct' : 'monogram'
  );

  useEffect(() => {
    setStage(trimmed ? 'direct' : 'monogram');
  }, [trimmed]);

  const seedText = fallbackLabel || alt || 'Riffan Music';
  const [c1, c2] = PALETTES[hashSeed(seedText) % PALETTES.length];
  const initials = extractInitials(seedText);

  if (stage === 'monogram' || !trimmed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center select-none font-display font-black tracking-tight text-white/90 ${className}`}
        style={{
          background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
        }}
      >
        <span className="text-sm sm:text-base drop-shadow">{initials}</span>
      </div>
    );
  }

  const resolvedSrc =
    stage === 'proxy' && trimmed.startsWith('https://')
      ? `/api/music/image-proxy?url=${encodeURIComponent(trimmed)}`
      : trimmed;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (stage === 'direct' && trimmed.startsWith('https://')) {
          setStage('proxy');
        } else {
          setStage('monogram');
        }
      }}
      className={className}
    />
  );
};
