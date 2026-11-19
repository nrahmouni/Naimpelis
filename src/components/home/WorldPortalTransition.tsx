import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import {
  WORLD_SPECS,
  WorldEmblemTile,
  type WorldPortalKind,
  type WorldSpec,
} from './WorldEmblemTile';

export { WORLD_SPECS, WorldEmblemTile, type WorldPortalKind, type WorldSpec };

export interface PortalOriginRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface WorldPortalTransitionProps {
  portal: WorldPortalKind | null;
  originRect?: PortalOriginRect | null;
  lang: AppLanguage;
}

const EASE_STUDIO: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_EXIT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const WorldPortalTransition: React.FC<WorldPortalTransitionProps> = ({
  portal,
  originRect,
  lang,
}) => {
  const initialClip = useMemo(() => {
    if (originRect && typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = Math.max(0, Math.round(originRect.top));
      const left = Math.max(0, Math.round(originRect.left));
      const right = Math.max(0, Math.round(vw - (originRect.left + originRect.width)));
      const bottom = Math.max(0, Math.round(vh - (originRect.top + originRect.height)));
      return `inset(${top}px ${right}px ${bottom}px ${left}px round 24px)`;
    }
    return 'inset(0px 0px 0px 0px round 0px)';
  }, [originRect]);

  const spec = portal ? WORLD_SPECS[portal] : WORLD_SPECS.cine;

  const overlay = (
    <AnimatePresence>
      {portal && (
        <motion.div
          key={portal}
          initial={{ opacity: originRect ? 0.96 : 0, clipPath: initialClip }}
          animate={{ opacity: 1, clipPath: 'inset(0px 0px 0px 0px round 0px)' }}
          exit={{ opacity: 0, scale: 1.01, transition: { duration: 0.14, ease: EASE_EXIT } }}
          transition={{
            clipPath: { duration: 0.16, ease: EASE_STUDIO },
            opacity: { duration: 0.12, ease: 'easeOut' },
          }}
          className="fixed inset-0 w-screen h-[100dvh] z-[9998] pointer-events-none overflow-hidden select-none bg-[#06070C] flex items-center justify-center"
          aria-hidden="true"
        >
          {/* Breathing Studio Radial Ambient Stage */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1.02 }}
            transition={{ duration: 0.18, ease: EASE_STUDIO }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: spec.ambient }}
          />

          {/* Subtle Optical Studio Vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, transparent 38%, rgba(3,4,8,0.84) 100%)',
            }}
          />

          {/* Precision Anamorphic Horizon Beam */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0.25 }}
            animate={{ opacity: [0, 1, 0.55], scaleX: 1 }}
            transition={{ duration: 0.18, ease: EASE_STUDIO }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[58px] w-[min(680px,86vw)] h-[1.5px] pointer-events-none"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${spec.accent}80 24%, #FFFFFFD9 50%, ${spec.secondary}80 76%, transparent 100%)`,
              boxShadow: `0 0 26px rgba(${spec.glowRgb},0.6)`,
            }}
          />

          {/* Centerpiece Optical Focus Lockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.16, ease: EASE_STUDIO }}
            className="relative z-10 flex flex-col items-center gap-4 px-6 text-center"
          >
            {/* Dual Optical Aperture Rings + Sculpted Emblem */}
            <div className="relative flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0.85, scale: 1.24 }}
                animate={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, ease: EASE_STUDIO }}
                className="absolute w-32 h-32 sm:w-36 sm:h-36 rounded-[34px] pointer-events-none"
                style={{
                  border: `1.5px solid ${spec.accent}`,
                  boxShadow: `0 0 32px rgba(${spec.glowRgb},0.48)`,
                }}
              />
              <WorldEmblemTile kind={portal} animate="always" className="w-24 h-24 sm:w-28 sm:h-28" />
            </div>

            {/* Staggered Editorial Typography & Hairline Progress */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.26em] text-zinc-400">
                <span className="w-4 h-px bg-white/20" />
                <span>RiffanTV</span>
                <span className="w-4 h-px bg-white/20" />
              </div>

              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white tracking-tight leading-none">
                {pickLang(lang, spec.title)}
              </h2>

              <p className="text-xs sm:text-[13px] font-medium text-zinc-400 tracking-wide">
                {pickLang(lang, spec.subtitle)}
              </p>

              {/* Razor-Thin Studio Sync Hairline */}
              <div className="mt-2 w-40 h-[2px] rounded-full bg-white/[0.08] overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.18, ease: EASE_STUDIO }}
                  className="w-full h-full origin-left rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${spec.accent}, ${spec.secondary})`,
                  }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(overlay, document.body);
  }
  return overlay;
};
