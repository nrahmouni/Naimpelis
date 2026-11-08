import React from 'react';
import { Activity, RefreshCw, X, ShieldCheck } from 'lucide-react';
import { VideoState } from '../types';

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
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-100">Estado de Conexión</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 font-mono text-xs text-slate-300">
          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Latencia WebSocket:</span>
              <span className="font-bold text-emerald-400">{latencyMs} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Usuarios conectados:</span>
              <span className="font-bold text-slate-200">{participantCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Estado de reproductor:</span>
              <span className="font-bold text-rose-400">{videoState.isPlaying ? 'Reproduciendo' : 'Pausado'}</span>
            </div>
          </div>

          <button
            onClick={() => {
              onForceResync();
              onClose();
            }}
            className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-sans font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Forzar Re-sincronización</span>
          </button>
        </div>
      </div>
    </div>
  );
};
