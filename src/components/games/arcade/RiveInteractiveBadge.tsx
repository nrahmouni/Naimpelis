import React, { useEffect, useRef, useState } from 'react';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';

export type RiveBadgeTheme = 'skills' | 'vehicles';

interface RiveInteractiveBadgeProps {
  theme?: RiveBadgeTheme;
  className?: string;
  label?: string;
  interactive?: boolean;
}

export const RiveInteractiveBadge: React.FC<RiveInteractiveBadgeProps> = ({
  theme = 'vehicles',
  className = 'w-14 h-14',
  label = 'Animación Rive interactiva',
  interactive = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const riveRef = useRef<{
    cleanup: () => void;
    play?: () => void;
    pause?: () => void;
    stateMachineInputs?: (name: string) => Array<{ fire?: () => void; value?: boolean | number }>;
    stateMachineNames?: string[];
  } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [burstActive, setBurstActive] = useState(false);
  const burstTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') {
      setFallback(true);
      return;
    }

    let disposed = false;

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
        // Both themes route through CORS-verified Rive CDN asset so zero CORS errors occur
        const src = resolveGameAssetUrl('assets/games/rive/vehicles.riv');
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
        riveRef.current = r as unknown as typeof riveRef.current;
      })
      .catch(() => {
        if (!disposed) setFallback(true);
      });

    return () => {
      disposed = true;
      try {
        riveRef.current?.cleanup();
      } catch {
        // ignore cleanup
      }
      riveRef.current = null;
    };
  }, [theme]);

  const handleInteract = () => {
    if (!interactive) return;
    setBurstActive(true);
    if (burstTimerRef.current !== null) window.clearTimeout(burstTimerRef.current);
    burstTimerRef.current = window.setTimeout(() => setBurstActive(false), 320);

    if (!riveRef.current) return;
    try {
      const machines = riveRef.current.stateMachineNames || [];
      if (machines.length > 0 && riveRef.current.stateMachineInputs) {
        const inputs = riveRef.current.stateMachineInputs(machines[0]) || [];
        inputs.forEach((inp) => {
          if (typeof inp.fire === 'function') inp.fire();
          else if (typeof inp.value === 'boolean') inp.value = !inp.value;
        });
      } else {
        riveRef.current.play?.();
      }
    } catch {
      // ignore interactive trigger failures
    }
  };

  if (fallback) {
    return (
      <div
        onClick={interactive ? handleInteract : undefined}
        onPointerEnter={interactive ? handleInteract : undefined}
        className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-white/10 transition-transform duration-200 ${interactive ? 'cursor-pointer' : ''} ${burstActive ? 'scale-105 drop-shadow-[0_0_14px_rgba(56,189,248,0.85)]' : ''} ${className}`}
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
      onClick={interactive ? handleInteract : undefined}
      onPointerEnter={interactive ? handleInteract : undefined}
      className={`block transition-transform duration-200 ${interactive ? 'cursor-pointer' : ''} ${burstActive ? 'scale-105 drop-shadow-[0_0_14px_rgba(56,189,248,0.85)]' : ''} ${className}`}
    />
  );
};
