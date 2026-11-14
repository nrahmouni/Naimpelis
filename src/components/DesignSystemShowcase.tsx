import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Film,
  Palette,
  Play,
  Search,
  Sparkles,
  Tv,
  Zap,
} from 'lucide-react';
import { useThemeStore } from '../store/useThemeStore';
import type { AppTheme } from '../types';
import { NaimBrandLogo } from './NaimBrandLogo';
import {
  EmptyStateCard,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  SkeletonPosterGrid,
  StandardInput,
} from './ui/DesignSystem';

interface DesignSystemShowcaseProps {
  onClose?: () => void;
}

export const DesignSystemShowcase: React.FC<DesignSystemShowcaseProps> = ({ onClose }) => {
  const {
    theme,
    density,
    liteMode,
    reducedMotion,
    setTheme,
    setDensity,
    setLiteMode,
    setReducedMotion,
  } = useThemeStore();

  const [sampleTab, setSampleTab] = useState<'buttons' | 'cards' | 'states'>('buttons');
  const [inputVal, setInputVal] = useState('');

  const themeOptions: Array<{ id: AppTheme; label: string; desc: string }> = [
    { id: 'oled', label: 'OLED Negro Puro', desc: '#08090d · Contraste máximo' },
    { id: 'soft-dark', label: 'Soft Dark', desc: '#10131c · Gris pizarra cinematográfico' },
    { id: 'high-contrast', label: 'Alto Contraste', desc: '#000000 · Texto ≥7:1 AAA' },
  ];

  return (
    <div className="min-h-dvh bg-[var(--nc-bg-canvas)] text-[var(--nc-text-primary)] p-4 sm:p-8 pb-20">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <NaimBrandLogo size={36} />
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
                NAIM CINE · Design System v2.4
              </h1>
              <p className="text-xs text-[var(--nc-text-secondary)]">
                Tokens @theme · 3 Temas AA/AAA · Escala Móvil/TV · Componentes y Estados
              </p>
            </div>
          </div>
          {onClose && (
            <SecondaryButton onClick={onClose}>
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a la app</span>
            </SecondaryButton>
          )}
        </header>

        {/* Live Theme & Mode Switcher */}
        <section className="p-5 rounded-3xl bg-[var(--nc-bg-elevated)] nc-specular-surface border border-[var(--nc-border)] space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Palette className="w-4 h-4 text-[#BF94FF]" />
            <span>Temas Semánticos & Rendimiento</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {themeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  theme === opt.id
                    ? 'border-[#9146FF] bg-[#9146FF]/15'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>{opt.label}</span>
                  {theme === opt.id && <Check className="w-4 h-4 text-[#BF94FF]" />}
                </div>
                <p className="text-[11px] text-[var(--nc-text-secondary)] mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SecondaryButton
              onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
              active={density === 'compact'}
            >
              <span>Densidad: {density === 'compact' ? 'Compacta' : 'Cómoda'}</span>
            </SecondaryButton>
            <SecondaryButton
              onClick={() => setLiteMode(!liteMode, true)}
              active={liteMode}
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Modo Lite GPU: {liteMode ? 'ON' : 'OFF'}</span>
            </SecondaryButton>
            <SecondaryButton
              onClick={() => setReducedMotion(!reducedMotion)}
              active={reducedMotion}
            >
              <span>Movimiento reducido: {reducedMotion ? 'ON' : 'OFF'}</span>
            </SecondaryButton>
          </div>
        </section>

        {/* Color Tokens Swatches */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--nc-text-secondary)]">
            Superficies y Tokens Semánticos
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ['Canvas', 'var(--nc-bg-canvas)'],
              ['Elevated', 'var(--nc-bg-elevated)'],
              ['Surface', 'var(--nc-bg-surface)'],
              ['Subtle', 'var(--nc-bg-subtle)'],
              ['Accent Broadcast', 'var(--nc-accent)'],
            ].map(([name, token]) => (
              <div
                key={name}
                className="p-3 rounded-2xl border border-white/10 bg-[var(--nc-bg-elevated)] space-y-2"
              >
                <div
                  className="h-12 rounded-xl border border-white/15"
                  style={{ backgroundColor: token }}
                />
                <div className="text-xs font-bold">{name}</div>
                <div className="text-[10px] font-mono text-[var(--nc-text-secondary)]">{token}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive Components × States */}
        <section className="space-y-4">
          <SegmentedControl
            value={sampleTab}
            onChange={setSampleTab}
            options={[
              { id: 'buttons', label: 'Botones e Inputs', icon: <Sparkles className="w-3.5 h-3.5" /> },
              { id: 'cards', label: 'Tarjetas 2:3 & 16:9', icon: <Film className="w-3.5 h-3.5" /> },
              { id: 'states', label: 'Esqueletos y Vacíos', icon: <Tv className="w-3.5 h-3.5" /> },
            ]}
          />

          {sampleTab === 'buttons' && (
            <div className="p-5 rounded-3xl bg-[var(--nc-bg-elevated)] nc-specular-surface border border-[var(--nc-border)] space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <PrimaryButton size="lg">
                  <Play className="w-4 h-4 fill-current" />
                  <span>Reproducir HD</span>
                </PrimaryButton>
                <SecondaryButton size="lg">Ver con amigos</SecondaryButton>
                <PrimaryButton disabled>Deshabilitado</PrimaryButton>
                <IconButton aria-label="Buscar">
                  <Search className="w-5 h-5" />
                </IconButton>
              </div>
              <StandardInput
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Campo accesible (min-h 44px, focus-visible ring)"
                icon={<Search className="w-4 h-4" />}
              />
            </div>
          )}

          {sampleTab === 'cards' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="apple-card p-3 space-y-2">
                <div className="aspect-[2/3] rounded-xl bg-gradient-to-br from-[#9146FF]/35 to-zinc-900 flex items-end p-3">
                  <span className="px-2 py-0.5 rounded bg-black/75 text-[11px] font-bold">
                    4K · ES
                  </span>
                </div>
                <div className="text-xs font-bold">Póster fijo 2:3</div>
              </div>
              <div className="apple-card p-3 space-y-2 sm:col-span-2">
                <div className="aspect-video rounded-xl bg-gradient-to-br from-sky-500/20 to-zinc-900 flex items-end p-3 relative overflow-hidden">
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
                    <div className="h-full w-2/3 bg-[#9146FF]" />
                  </div>
                  <span className="px-2 py-0.5 rounded bg-black/75 text-[11px] font-bold">
                    16:9 · Progreso 66%
                  </span>
                </div>
                <div className="text-xs font-bold">Backdrop 16:9 con barra de progreso</div>
              </div>
            </div>
          )}

          {sampleTab === 'states' && (
            <div className="space-y-4">
              <SkeletonPosterGrid count={5} aspect="poster" />
              <EmptyStateCard
                icon={<Film className="w-6 h-6" />}
                title="Lista vacía"
                description="Estado vacío estandarizado con jerarquía limpia y acción clara."
                actionLabel="Explorar catálogo"
                onAction={() => setSampleTab('cards')}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
