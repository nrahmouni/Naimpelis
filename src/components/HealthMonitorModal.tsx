import React from 'react';
import { Activity, Wifi, Clock, RefreshCw, X, ShieldAlert, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import { VideoState } from '../types';
import { formatTime } from '../utils/videoParser';

interface HealthMonitorModalProps {
  latencyMs: number;
  videoState: VideoState;
  isHost: boolean;
  participantCount: number;
  onForceResync: () => void;
  onClose: () => void;
}

export const HealthMonitorModal: React.FC<HealthMonitorModalProps> = ({
  latencyMs,
  videoState,
  isHost,
  participantCount,
  onForceResync,
  onClose,
}) => {
  const timeDriftSeconds = videoState.isPlaying
    ? Math.abs((Date.now() - videoState.lastUpdated) / 1000)
    : 0;

  const isHealthy = latencyMs < 120;
  const isWarning = latencyMs >= 120 && latencyMs < 300;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-100">Monitor de Salud y Latencia</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {/* Main Health Status Card */}
          <div
            className={`p-4 rounded-2xl border flex items-center gap-3.5 ${
              isHealthy
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : isWarning
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {isHealthy ? (
              <CheckCircle2 className="w-8 h-8 shrink-0 text-emerald-400" />
            ) : isWarning ? (
              <AlertTriangle className="w-8 h-8 shrink-0 text-amber-400" />
            ) : (
              <ShieldAlert className="w-8 h-8 shrink-0 text-rose-400" />
            )}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide">
                {isHealthy ? 'Conexión Óptima' : isWarning ? 'Latencia Moderada' : 'Desfase Detectado'}
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {isHealthy
                  ? 'El reproductor y el chat están perfectamente sincronizados con el servidor.'
                  : isWarning
                  ? 'Pequeña latencia en red. La reproducción sigue en marcha.'
                  : 'Se recomienda pulsar "Force Resync" para igualar el vídeo al anfitrión.'}
              </p>
            </div>
          </div>

          {/* Metric Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Wifi className="w-3 h-3 text-blue-400" /> Latencia WS
              </span>
              <p className="text-lg font-mono font-bold text-slate-100 mt-1">{latencyMs} ms</p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" /> Tiempo Actual
              </span>
              <p className="text-lg font-mono font-bold text-slate-100 mt-1">
                {formatTime(videoState.currentTime)}
              </p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Layers className="w-3 h-3 text-purple-400" /> Fuente de Vídeo
              </span>
              <p className="text-xs font-semibold text-slate-200 mt-1.5 uppercase truncate">
                {videoState.sourceType}
              </p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400" /> Estado
              </span>
              <p className="text-xs font-semibold text-slate-200 mt-1.5">
                {videoState.isPlaying ? '▶️ Reproduciendo' : '⏸️ Pausado'}
              </p>
            </div>
          </div>

          {/* Manual Force Resync Action */}
          <button
            onClick={() => {
              onForceResync();
              onClose();
            }}
            className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 active:scale-95 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Force Resync (Re-sincronizar Vídeo Manualmente)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
