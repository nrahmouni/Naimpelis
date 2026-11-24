import React, { useEffect, useRef, useState } from 'react';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';

export type RiveBadgeTheme = 'skills' | 'vehicles';

interface RiveInteractiveBadgeProps {
  theme?: RiveBadgeTheme;
  className?: string;
  label?: string;
}

export const RiveInteractiveBadge: React.FC<RiveInteractiveBadgeProps> = ({
  theme = 'skills',
  className = 'w-14 h-14',
  label = 'Animación Rive interactiva',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') {
      setFallback(true);
      return;
    }

    let disposed = false;
    let instance: { cleanup: () => void } | null = null;

    void import('@rive-app/canvas')
      .then((mod) => {
        if (disposed || !canvasRef.current) return;
        const RiveCtor =
          mod.Rive ||
          (mod as unknown as { default?: { Rive?: typeof mod.Rive } }).default?.Rive;
        if (!RiveCtor) {
          setFallback(true);
          return;
        }
        const src = resolveGameAssetUrl(
          theme === 'vehicles' ? 'assets/games/rive/vehicles.riv' : 'assets/games/rive/skills.riv'
        );
        const r = new RiveCtor({
          src,
          canvas: canvasRef.current,
          autoplay: true,
          onLoad: () => {
            if (!disposed) {
              r.resizeDrawingSurfaceToCanvas();
            }
          },
          onLoadError: () => {
            if (!disposed) setFallback(true);
          },
        });
        instance = r;
      })
      .catch(() => {
        if (!disposed) setFallback(true);
      });

    return () => {
      disposed = true;
      try {
        instance?.cleanup();
      } catch {
        // ignore cleanup
      }
    };
  }, [theme]);

  if (fallback) {
    return (
      <div
        className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-white/10 ${className}`}
        aria-label={label}
      >
        <img
          src={resolveGameAssetUrl(
            theme === 'vehicles'
              ? 'assets/games/space/playerShip1_blue.png'
              : 'assets/games/toon/male_cheer0.png'
          )}
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          alt={label}
          className="w-4/5 h-4/5 object-contain drop-shadow-[0_2px_8px_rgba(56,189,248,0.5)]"
        />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={120}
      aria-label={label}
      className={`block ${className}`}
    />
  );
};
