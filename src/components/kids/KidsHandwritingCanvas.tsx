import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eraser, PenTool, Snail, Volume2 } from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { KIDS_TRACING_GLYPHS, type TracingGlyphMeta } from './kidsCurriculumData';
import { playKidsSound } from './kidsAudioEngine';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSquishButton } from './KidsPrimitives';

interface KidsHandwritingCanvasProps {
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  onCompleteGlyph: (glyphId: string) => void;
}

export const KidsHandwritingCanvas: React.FC<KidsHandwritingCanvasProps> = ({
  kidsLang,
  ageGroup,
  onCompleteGlyph,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const [scriptFilter, setScriptFilter] = useState<'all' | TracingGlyphMeta['scriptTag']>('all');
  const [glyphIdx, setGlyphIdx] = useState(0);
  const [strokeCoverage, setStrokeCoverage] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const pointsDrawnRef = useRef(0);

  const filtered =
    scriptFilter === 'all'
      ? KIDS_TRACING_GLYPHS
      : KIDS_TRACING_GLYPHS.filter((g) => g.scriptTag === scriptFilter);

  const current = filtered[glyphIdx % Math.max(1, filtered.length)] || KIDS_TRACING_GLYPHS[0];

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pointsDrawnRef.current = 0;
    setStrokeCoverage(0);
  };

  useEffect(() => {
    clearCanvas();
  }, [current.id]);

  const drawPoint = (clientX: number, clientY: number, isStart = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = ageGroup === '3-5' ? 18 : 13;
    ctx.strokeStyle = '#FBBF24';
    ctx.shadowColor = 'rgba(251, 191, 36, 0.55)';
    ctx.shadowBlur = 8;

    if (isStart) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.1, y + 0.1);
      ctx.stroke();
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    pointsDrawnRef.current += 1;
    const pct = Math.min(100, Math.round((pointsDrawnRef.current / 36) * 100));
    setStrokeCoverage(pct);
  };

  const handleFinishStroke = () => {
    if (strokeCoverage < 40) {
      playKidsSound('error', ux.soundEnabled, true);
      return;
    }
    triggerHaptic('success');
    playKidsSound('star', ux.soundEnabled, true);
    if (!completedIds.includes(current.id)) {
      setCompletedIds((prev) => [...prev, current.id]);
    }
    onCompleteGlyph(current.id);
    if (ux.soundEnabled) {
      void speakKidsText(current.spoken, current.lang, {
        ageGroup,
        rate: ux.tortoiseSpeech ? 0.68 : undefined,
      });
    }
    setGlyphIdx((i) => (i + 1) % filtered.length);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-y-auto no-scrollbar pb-2">
      {/* Script Filter + Glyph Strip */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {(['all', 'Latin', 'Arabe', 'Hanzi', 'Numero'] as const).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                playKidsSound('tap', ux.soundEnabled, true);
                setScriptFilter(tag);
                setGlyphIdx(0);
              }}
              className={`h-8 px-2.5 rounded-lg text-xs font-black cursor-pointer border transition-colors ${
                scriptFilter === tag
                  ? 'bg-amber-400 text-slate-950 border-amber-200'
                  : 'bg-[#172149] text-sky-100 border-white/10 hover:bg-[#223066]'
              }`}
            >
              {tag === 'all' ? 'Todos' : tag}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {filtered.map((item, idx) => {
            const active = item.id === current.id;
            const done = completedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  playKidsSound('tap', ux.soundEnabled, true);
                  setGlyphIdx(idx);
                }}
                className={`min-w-[38px] h-9 px-2 rounded-xl text-sm font-black border cursor-pointer flex items-center justify-center gap-1 ${
                  active
                    ? 'bg-sky-400 text-slate-950 border-sky-200'
                    : done
                    ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                    : 'bg-[#141D40] text-white border-white/10'
                }`}
              >
                <span>{item.glyph}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split Drawing Stage */}
      <div className="flex-1 min-h-[250px] landscape:min-h-[180px] grid grid-cols-1 md:grid-cols-12 landscape:grid-cols-12 gap-3 items-stretch">
        {/* Interactive Canvas Pad */}
        <div className="md:col-span-7 landscape:col-span-7 relative rounded-3xl bg-[#0D132B] border-2 border-amber-400/40 shadow-2xl overflow-hidden flex items-center justify-center min-h-[230px] landscape:min-h-[180px] touch-none">
          {/* Tracing Guide Overlay */}
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 w-full h-full max-w-[280px] max-h-[280px] m-auto pointer-events-none opacity-35"
            aria-hidden="true"
          >
            <line x1="8" y1="50" x2="92" y2="50" stroke="#38BDF8" strokeWidth="0.6" strokeDasharray="3 3" />
            <line x1="50" y1="8" x2="50" y2="92" stroke="#38BDF8" strokeWidth="0.6" strokeDasharray="3 3" />
            {current.guideStrokes.map((d, idx) => (
              <g key={idx}>
                <path
                  d={d}
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="4 4"
                />
                <circle cx="50" cy="50" r="0" />
              </g>
            ))}
          </svg>

          <span
            aria-hidden="true"
            className="pointer-events-none select-none font-display font-black text-[130px] sm:text-[160px] text-white/[0.06] leading-none"
          >
            {current.glyph}
          </span>

          <canvas
            ref={canvasRef}
            width={360}
            height={280}
            onPointerDown={(e) => {
              drawingRef.current = true;
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              drawPoint(e.clientX, e.clientY, true);
            }}
            onPointerMove={(e) => {
              if (!drawingRef.current) return;
              drawPoint(e.clientX, e.clientY, false);
            }}
            onPointerUp={() => {
              drawingRef.current = false;
            }}
            onPointerCancel={() => {
              drawingRef.current = false;
            }}
            className="absolute inset-0 w-full h-full cursor-crosshair"
          />

          <div className="absolute top-3 start-3 px-2.5 py-1 rounded-lg bg-black/50 text-[11px] font-bold text-amber-200 flex items-center gap-1.5 pointer-events-none">
            <PenTool className="w-3.5 h-3.5" />
            <span>Dibuja encima con el dedo o ratón</span>
          </div>

          <div className="absolute bottom-3 start-3 end-3 flex items-center justify-between gap-2 pointer-events-none">
            <span className="text-[11px] font-extrabold text-sky-200 bg-black/45 px-2.5 py-1 rounded-lg tabular-nums">
              Trazo: {strokeCoverage}%
            </span>
          </div>
        </div>

        {/* Info + Audio + Controls */}
        <div className="md:col-span-5 landscape:col-span-5 rounded-3xl bg-[#161F45] border border-white/15 p-4 landscape:p-3 flex flex-col justify-between gap-3 landscape:gap-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-sky-300">
                {current.scriptTag}
              </span>
              <span className="text-xs font-bold text-amber-300 tabular-nums">
                {completedIds.length}/{KIDS_TRACING_GLYPHS.length} trazos
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#0B1026] border border-amber-400/40 flex items-center justify-center font-display font-black text-4xl text-amber-300 shrink-0">
                {current.glyph}
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-black text-lg text-white leading-tight">
                  {current.label}
                </h3>
                <p className="text-xs text-sky-200/80 mt-0.5">
                  Sigue las líneas punteadas del centro para practicar la escritura.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <KidsSquishButton
                onClick={() =>
                  void speakKidsText(current.spoken, current.lang || kidsLang, { ageGroup })
                }
                className="flex-1 !min-h-[42px] px-3 rounded-xl bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" />
                <span>Escuchar</span>
              </KidsSquishButton>
              <KidsSquishButton
                onClick={() =>
                  void speakKidsText(current.spoken, current.lang || kidsLang, {
                    ageGroup,
                    rate: 0.65,
                  })
                }
                className="!min-h-[42px] px-3 rounded-xl bg-[#222F66] text-sky-100 font-black text-xs flex items-center justify-center gap-1.5"
              >
                <Snail className="w-4 h-4 text-emerald-300" />
                <span>Lento</span>
              </KidsSquishButton>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <KidsSquishButton
              onClick={() => {
                playKidsSound('tap', ux.soundEnabled, true);
                clearCanvas();
              }}
              className="!min-h-[44px] px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5"
            >
              <Eraser className="w-4 h-4" />
              <span>Borrar</span>
            </KidsSquishButton>
            <KidsSquishButton
              onClick={handleFinishStroke}
              className={`flex-1 !min-h-[44px] px-3.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 ${
                strokeCoverage >= 40
                  ? 'bg-emerald-400 text-slate-950 border-b-4 border-emerald-600'
                  : 'bg-[#25326B] text-zinc-300 border-b-4 border-[#12193A]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Validar trazo (+3)</span>
            </KidsSquishButton>
          </div>
        </div>
      </div>
    </div>
  );
};
