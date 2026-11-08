import React from 'react';
import { Activity, Wifi, Clock, RefreshCw, X, ShieldAlert, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import { VideoState } from '../types';
import { formatTime } from '../utils/videoParser';
import { Language, TRANSLATIONS } from '../utils/i18n';
import { ProxyDiagnostics } from './ProxyDiagnostics';

interface HealthMonitorModalProps {
  latencyMs: number;
  videoState: VideoState;
  isHost: boolean;
  participantCount: number;
  language: Language;
  onForceResync: () => void;
  onClose: () => void;
}

export const HealthMonitorModal: React.FC<HealthMonitorModalProps> = ({
  latencyMs,
  videoState,
  isHost,
  participantCount,
  language,
  onForceResync,
  onClose,
}) => {
  const t = TRANSLATIONS[language];
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
            <h3 className="text-sm font-bold text-slate-100">{t.healthTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
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
                {isHealthy ? (language === 'es' ? 'Conexión Óptima' : 'Optimal Connection') : isWarning ? (language === 'es' ? 'Latencia Moderada' : 'Moderate Latency') : (language === 'es' ? 'Desfase Detectado' : 'Drift Detected')}
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {isHealthy
                  ? (language === 'es' ? 'El reproductor y el chat están perfectamente sincronizados.' : 'Player and chat are perfectly synced.')
                  : isWarning
                  ? (language === 'es' ? 'Pequeña latencia en red. La reproducción sigue en marcha.' : 'Minor network latency. Playback continues.')
                  : (language === 'es' ? 'Se recomienda pulsar "Resync" para igualar el vídeo.' : 'Manual resync recommended.')}
              </p>
            </div>
          </div>

          {/* Metric Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Wifi className="w-3 h-3 text-blue-400" /> {t.latency}
              </span>
              <p className="text-lg font-mono font-bold text-slate-100 mt-1">{latencyMs} ms</p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" /> {language === 'es' ? 'Tiempo Actual' : 'Current Time'}
              </span>
              <p className="text-lg font-mono font-bold text-slate-100 mt-1">
                {formatTime(videoState.currentTime)}
              </p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Layers className="w-3 h-3 text-purple-400" /> {language === 'es' ? 'Fuente' : 'Source'}
              </span>
              <p className="text-xs font-semibold text-slate-200 mt-1.5 uppercase truncate">
                {videoState.sourceType}
              </p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400" /> {language === 'es' ? 'Estado' : 'Status'}
              </span>
              <p className="text-xs font-semibold text-slate-200 mt-1.5">
                {videoState.isPlaying ? '▶️' : '⏸️'}
              </p>
            </div>
          </div>

          {/* Proxy Diagnostics Tool */}
          <ProxyDiagnostics url={videoState.url} />

          {/* Manual Force Resync Action */}
          <button
            onClick={() => {
              onForceResync();
              onClose();
            }}
            className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 active:scale-95 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t.resync}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
