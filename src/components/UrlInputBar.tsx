import React, { useState } from 'react';
import { Link2, Play, Sparkles, Film, Check, ArrowRight } from 'lucide-react';
import { SAMPLE_VIDEOS } from '../data/sampleVideos';
import { SampleVideo } from '../types';

interface UrlInputBarProps {
  currentUrl: string;
  isVirtualBrowser: boolean;
  onUrlChange: (url: string, title?: string, forceVirtualBrowser?: boolean) => void;
  onToggleVirtualBrowser: (enabled: boolean) => void;
}

export const UrlInputBar: React.FC<UrlInputBarProps> = ({
  currentUrl,
  isVirtualBrowser,
  onUrlChange,
  onToggleVirtualBrowser,
}) => {
  const [inputUrl, setInputUrl] = useState('');
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      let rawUrl = inputUrl.trim();
      if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = 'https://' + rawUrl;
      }
      onUrlChange(rawUrl, isVirtualBrowser ? 'Página Web / Película' : 'Vídeo Personalizado', isVirtualBrowser);
      setInputUrl('');
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    }
  };

  const handleSelectPreset = (video: SampleVideo) => {
    onUrlChange(video.url, video.title, false);
    setShowPresetsModal(false);
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 px-3 py-1.5 flex flex-col sm:flex-row items-center gap-2">
      {/* Mode Selector Tabs: Video Player vs Virtual Browser */}
      <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-xl border border-slate-800 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
        <button
          type="button"
          onClick={() => onToggleVirtualBrowser(false)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
            !isVirtualBrowser
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🎬 Reproductor
        </button>
        <button
          type="button"
          onClick={() => onToggleVirtualBrowser(true)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
            isVirtualBrowser
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🌐 Navegador Virtual
        </button>
      </div>

      {/* URL Input Form */}
      <form onSubmit={handleSubmit} className="flex-1 w-full flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
            <Link2 className={`w-3.5 h-3.5 ${isVirtualBrowser ? 'text-emerald-400' : 'text-rose-500'}`} />
          </div>
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder={
              isVirtualBrowser
                ? 'Pega una página web (ej: https://www.themoviedb.org/movie/1423191)...'
                : 'Pega enlace de vídeo (YouTube, MP4, etc.)...'
            }
            className={`w-full pl-8 pr-2.5 py-1 bg-slate-950 border rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-all ${
              isVirtualBrowser
                ? 'border-emerald-700/60 focus:ring-1 focus:ring-emerald-500/50'
                : 'border-slate-700/70 focus:ring-1 focus:ring-rose-500/50'
            }`}
            required
          />
        </div>

        <button
          type="submit"
          className={`px-3 py-1 rounded-xl text-white font-semibold text-xs flex items-center gap-1 transition-all shadow-md active:scale-95 shrink-0 ${
            isVirtualBrowser
              ? 'bg-emerald-600 hover:bg-emerald-500'
              : 'bg-rose-600 hover:bg-rose-500'
          }`}
        >
          {copiedSuccess ? <Check className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
          <span>{isVirtualBrowser ? 'Ir' : 'Cargar'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowPresetsModal(true)}
          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700/60 text-xs shrink-0"
          title="Ver vídeos de prueba"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Recommended Movies Drawer / Modal */}
      {showPresetsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-bold text-slate-100">Catálogo de Vídeos de Prueba</h3>
              </div>
              <button
                onClick={() => setShowPresetsModal(false)}
                className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* List of Videos */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <p className="text-xs text-slate-400">
                Selecciona una de nuestras películas y cortometrajes listos para ver en sincronía con tus amigos:
              </p>

              {SAMPLE_VIDEOS.map((video) => (
                <div
                  key={video.id}
                  onClick={() => handleSelectPreset(video)}
                  className="flex gap-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-rose-500/50 hover:bg-slate-800/50 cursor-pointer transition-all group"
                >
                  <div className="w-16 h-14 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-750 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                    {video.thumbnail}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                          {video.category}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">{video.duration}</span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 group-hover:text-rose-400 transition-colors truncate">
                        {video.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{video.description}</p>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 pt-1">
                      <span>Cargar en sala</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
