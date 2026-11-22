import React from 'react';
import type { AdminOverviewSnapshot } from './adminConsoleTypes';

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0s';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTimeShort(ts: number): string {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '—';
  }
}

export const StatusLabel: React.FC<{
  state: 'healthy' | 'up' | 'degraded' | 'warn' | 'down' | 'error' | 'open-circuit' | 'unknown';
  text?: string;
}> = ({ state, text }) => {
  const isOk = state === 'healthy' || state === 'up';
  const isWarn = state === 'degraded' || state === 'warn';
  const isErr = state === 'down' || state === 'error' || state === 'open-circuit';
  const colorCls = isOk
    ? 'text-emerald-400'
    : isWarn
      ? 'text-amber-400'
      : isErr
        ? 'text-rose-400'
        : 'text-zinc-400';

  const label =
    text ||
    (state === 'healthy' || state === 'up'
      ? 'Operativo'
      : state === 'degraded' || state === 'warn'
        ? 'Degradado'
        : state === 'open-circuit'
          ? 'Circuito abierto'
          : state === 'down' || state === 'error'
            ? 'Caído'
            : 'Sin datos');

  return <span className={`font-medium text-xs tabular-nums ${colorCls}`}>{label}</span>;
};

export const TelemetryTrendChart: React.FC<{
  history: AdminOverviewSnapshot['latencyHistory'];
}> = ({ history }) => {
  const points = history.slice(-30);
  const width = 640;
  const height = 160;
  const padX = 12;
  const padY = 16;

  if (points.length < 2) {
    return (
      <div className="h-[160px] flex items-center justify-center border border-white/10 rounded-lg bg-[#0D0E14] text-xs text-zinc-400">
        Recopilando muestras de Event Loop y latencia HTTP en tiempo real...
      </div>
    );
  }

  const maxEl = Math.max(25, ...points.map((p) => p.eventLoopP95Ms));
  const maxHttp = Math.max(40, ...points.map((p) => p.httpAvgMs));
  const maxVal = Math.max(maxEl, maxHttp);

  const buildPath = (extractor: (p: (typeof points)[number]) => number) =>
    points
      .map((pt, idx) => {
        const x = padX + (idx / Math.max(1, points.length - 1)) * (width - padX * 2);
        const y = height - padY - (extractor(pt) / maxVal) * (height - padY * 2);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

  const elPath = buildPath((p) => p.eventLoopP95Ms);
  const httpPath = buildPath((p) => p.httpAvgMs);
  const latest = points[points.length - 1];

  return (
    <div className="border border-white/10 rounded-lg bg-[#0D0E14] p-4">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div className="text-xs text-zinc-300 font-medium">
          Latencia en vivo · últimas {points.length} muestras
        </div>
        <div className="flex items-center gap-4 text-xs tabular-nums">
          <span className="text-violet-300">
            Event Loop p95: <strong className="font-mono">{latest.eventLoopP95Ms} ms</strong>
          </span>
          <span className="text-sky-300">
            HTTP medio: <strong className="font-mono">{latest.httpAvgMs} ms</strong>
          </span>
          <span className="text-zinc-400">
            RSS: <strong className="font-mono">{latest.rssMb} MB</strong>
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[140px] overflow-visible"
        role="img"
        aria-label="Gráfico de latencia de Event Loop y HTTP en tiempo real"
      >
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = padY + ratio * (height - padY * 2);
          return (
            <line
              key={ratio}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="3 3"
            />
          );
        })}
        <path d={httpPath} fill="none" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
        <path d={elPath} fill="none" stroke="#8B5CF6" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  );
};
