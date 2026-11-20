import React, { useId } from 'react';

export interface RiffanIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  /**
   * 'always': runs kit animation continuously (best for loaders, live beacons, unread bell, active spinners)
   * 'hover': static by default, plays kit animation when button or parent `.group` is hovered
   * 'none': static gradient/currentColor vector
   */
  animate?: 'always' | 'hover' | 'none';
  /**
   * 'brand': signature RiffanTV #8B5CF6 -> #4CC9F0 gradient stroke/fill
   * 'current': inherits currentColor for crisp contrast inside solid #9146FF / colored buttons
   */
  tone?: 'brand' | 'current';
}

export function useRiffanIconDefs(tone: 'brand' | 'current' = 'brand') {
  const rawId = useId().replace(/:/g, '');
  const gradId = `rtv-g-${rawId}`;
  const paint = tone === 'current' ? 'currentColor' : `url(#${gradId})`;
  return { rawId, gradId, paint };
}

export const BrandGradientDef: React.FC<{ id: string; x1?: number; y1?: number; x2?: number; y2?: number }> = ({
  id,
  x1 = 6,
  y1 = 6,
  x2 = 42,
  y2 = 42,
}) => (
  <defs>
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="#8B5CF6" />
      <stop offset="1" stopColor="#4CC9F0" />
    </linearGradient>
  </defs>
);

export const ToneGradientDef: React.FC<{ tone: 'brand' | 'current'; id: string }> = ({
  tone,
  id,
}) => {
  if (tone === 'current') return null;
  return <BrandGradientDef id={id} />;
};

export const BASE_STROKE = {
  fill: 'none',
  strokeWidth: 3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
