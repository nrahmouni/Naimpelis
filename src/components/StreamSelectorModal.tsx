import React from 'react';
import { Play, X, Tv } from 'lucide-react';

interface StreamSelectorModalProps {
  options: { label: string; url: string }[];
  onSelect: (url: string) => void;
  onClose: () => void;
}

export const StreamSelectorModal: React.FC<StreamSelectorModalProps> = ({ options, onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-100">Seleccionar Fuente</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {options.length === 0 ? (
            <p className="text-center py-6 text-slate-500 text-xs">No se encontraron opciones disponibles.</p>
          ) : (
            options.map((opt, i) => (
              <button
                key={i}
                onClick={() => onSelect(opt.url)}
                className="w-full p-4 bg-slate-950 hover:bg-slate-800 border border-white/5 rounded-2xl flex items-center justify-between transition-all group"
              >
                <span className="text-xs font-bold text-slate-200 truncate">{opt.label}</span>
                <Play className="w-4 h-4 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
