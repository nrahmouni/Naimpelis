import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft,
  ArrowRight,
  RotateCw, 
  Lock, 
  Search, 
  Film,
  Maximize2,
  Minimize2,
  Play,
  Star,
  ShieldCheck,
} from 'lucide-react';
import { VideoState } from '../types';
import { parseVideoUrl } from '../utils/videoParser';
import { SportsEventsView } from './SportsEventsView';

interface MovieItem {
  id: number;
  title: string;
  year: string;
  overview: string;
  poster: string;
  backdrop: string;
  rating: string;
  isTv: boolean;
}

interface VirtualChromeBrowserProps {
  currentUrl: string;
  videoState?: VideoState;
  remoteBrowserActive?: boolean;
  remoteBrowserError?: string;
  isHost: boolean;
  roomId: string;
  catalogRequest?: number;
  onNavigate: (newUrl: string, title?: string, fallbackUrls?: string[]) => void;
  onPlaybackChange?: (action: 'play' | 'pause' | 'seek', time: number, isPlaying: boolean) => void;
  onSendReaction: (emoji: string) => void;
}

export const VirtualChromeBrowser: React.FC<VirtualChromeBrowserProps> = ({
  currentUrl,
  videoState,
  remoteBrowserActive = false,
  remoteBrowserError,
  isHost,
  roomId,
  catalogRequest = 0,
  onNavigate,
  onPlaybackChange,
  onSendReaction,
}) => {
  const [activeTab, setActiveTab] = useState<'finder' | 'sports' | 'web'>('web');
  const [sportsSource, setSportsSource] = useState<'all' | 'rojadirectv' | 'rojadirectahd'>('rojadirectv');
  const [searchQuery, setSearchQuery] = useState('');
  const [addressInput, setAddressInput] = useState(currentUrl || 'https://bingetrix.sc/watch');
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieItem | null>(null);
  const [catalogError, setCatalogError] = useState('');

  // Browser Navigation History Stack
  const [historyStack, setHistoryStack] = useState<string[]>([currentUrl || 'https://bingetrix.sc/watch']);
  const [historyIndex, setHistoryIndex] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getEffectiveStreamUrl = (url: string) => {
    if (/^https?:\/\/bingetrix\.sc\/?$/i.test(url.trim())) {
      return 'https://bingetrix.sc/watch';
    }
    return url;
  };

  // Sync addressInput when remote videoUrl changes
  useEffect(() => {
    if (currentUrl) {
      setAddressInput(currentUrl);
      if (/bingetrix|movidy|vidsrc|autoembed|rojadirect|footunder|crackstreams|\/api\/proxy-web/i.test(currentUrl)) {
        setActiveTab('web');
      }
    }
  }, [currentUrl]);

  // Navigate helper with history stack recording
  const navigateToUrl = (newUrl: string, title?: string) => {
    const effective = getEffectiveStreamUrl(newUrl);
    setAddressInput(effective);
    setActiveTab('web');
    setHistoryStack((prev) => {
      const updated = prev.slice(0, historyIndex + 1);
      updated.push(effective);
      setHistoryIndex(updated.length - 1);
      return updated;
    });

    onNavigate(effective, title);
  };

  const handleGoBack = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      const prevUrl = historyStack[prevIdx];
      setHistoryIndex(prevIdx);
      setAddressInput(prevUrl);
      setActiveTab('web');
      onNavigate(prevUrl);
    }
  };

  const handleGoForward = () => {
    if (historyIndex < historyStack.length - 1) {
      const nextIdx = historyIndex + 1;
      const nextUrl = historyStack[nextIdx];
      setHistoryIndex(nextIdx);
      setAddressInput(nextUrl);
      setActiveTab('web');
      onNavigate(nextUrl);
    }
  };

  const handleReload = () => {
    if (iframeRef.current) {
      iframeRef.current.src = proxyUrl;
    }
    onNavigate(addressInput, 'Recargado');
  };

  // Fetch movie catalog from TMDB
  const fetchMovies = async (query = '') => {
    setIsLoadingMovies(true);
    setCatalogError('');
    try {
      const response = await fetch(`/api/search-movies?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setMovies(data.results || []);
    } catch {
      setCatalogError('Error al conectar con la cartelera.');
    } finally {
      setIsLoadingMovies(false);
    }
  };

  useEffect(() => {
    void fetchMovies('');
  }, [catalogRequest]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchMovies(searchQuery.trim());
  };

  const handleOpenPortal = (url: string, title: string) => {
    setSelectedMovie(null);
    setAddressInput(url);
    setActiveTab('web');
    onNavigate(url, title);
  };

  const handleSelectMovie = (movie: MovieItem) => {
    setSelectedMovie(movie);
  };

  const handleOpenSportsTab = (source: 'all' | 'rojadirectv' | 'rojadirectahd') => {
    setSelectedMovie(null);
    setSportsSource(source);
    setActiveTab('sports');
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let url = addressInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        setActiveTab('finder');
        setSearchQuery(url);
        void fetchMovies(url);
        return;
      }
    }
    setAddressInput(url);
    setActiveTab('web');
    onNavigate(url);
  };

  const fallbackQuery = (videoState?.altEmbeds || [])
    .slice(0, 4)
    .map((url) => `&fallback=${encodeURIComponent(url)}`)
    .join('');
  const proxyUrl = `/api/proxy-web?url=${encodeURIComponent(addressInput)}&roomId=${encodeURIComponent(roomId)}${fallbackQuery}`;

  return (
    <div
      ref={containerRef}
      className={`w-full flex flex-col bg-slate-900 border-b border-slate-800 shadow-2xl overflow-hidden ${
        isFullscreen ? 'h-screen fixed inset-0 z-50' : 'h-full min-h-0 flex-1'
      }`}
    >
      {/* Sleek Unified Navigation Bar with Full History Navigation (Atrás, Adelante, Recargar, Inicio) */}
      <div className="bg-slate-950 px-2.5 pt-2 pb-1.5 flex flex-col gap-2 border-b border-slate-800 select-none">
        {/* Row 1: Browser Navigation Controls + Main Portal Categories */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Navigation History Controls */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
              <button
                onClick={handleGoBack}
                disabled={historyIndex <= 0}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Página anterior (Atrás)"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleGoForward}
                disabled={historyIndex >= historyStack.length - 1}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Página siguiente (Adelante)"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleReload}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 transition-all"
                title="Recargar página actual"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

          <div className="order-3 flex w-full shrink-0 items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1 sm:order-none sm:w-auto">
            <button
              type="button"
              onClick={() => { setActiveTab('finder'); setSelectedMovie(null); }}
              aria-pressed={activeTab === 'finder'}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:flex-none ${activeTab === 'finder' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Cartelera
            </button>
            <button
              type="button"
              onClick={() => handleOpenSportsTab('all')}
              aria-pressed={activeTab === 'sports'}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:flex-none ${activeTab === 'sports' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Deportes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('web')}
              aria-pressed={activeTab === 'web'}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:flex-none ${activeTab === 'web' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Navegar
            </button>
          </div>

          {/* Right tools: Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white shrink-0"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Row 2: Omnibox Address Bar & Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Address Bar Form */}
          <form onSubmit={handleAddressSubmit} className="flex-1 min-w-0">
            <div className="w-full bg-slate-900 border border-slate-700/80 focus-within:border-rose-500 rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-inner">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="https://bingetrix.sc/watch o enlace de transmisión..."
                className="w-full bg-transparent text-xs text-slate-100 focus:outline-none font-mono"
              />
            </div>
          </form>

        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 min-h-0 relative bg-black">
        {activeTab === 'sports' ? (
          /* Dedicated Sports Hub Tab with RojaDirecta feeds */
          <SportsEventsView
            initialSource={sportsSource}
            onSelectStream={(streamUrl, title, fallbackUrls) => {
              setAddressInput(streamUrl);
              setActiveTab('web');
              onNavigate(streamUrl, title, fallbackUrls);
            }}
            onOpenWeb={(webUrl, title) => {
              setAddressInput(webUrl);
              setActiveTab('web');
              onNavigate(webUrl, title);
            }}
          />
        ) : activeTab === 'finder' ? (
          /* Movie Catalog Explorer View */
          <div className="h-full overflow-y-auto p-4 space-y-4 bg-slate-950">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenPortal('https://movidy.pw/', 'Movidy')}
                className="rounded-xl border border-rose-500/30 bg-rose-600/15 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-600/30"
              >
                Abrir Movidy
              </button>
              <button
                type="button"
                onClick={() => handleOpenPortal('https://bingetrix.sc/watch', 'Bingetrix')}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/20"
              >
                Abrir Bingetrix
              </button>
            </div>
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar película o serie..."
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all shadow-md"
              >
                Buscar
              </button>
            </form>

            {catalogError && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                {catalogError}
              </div>
            )}

            {isLoadingMovies ? (
              <div className="flex flex-col items-center justify-center min-h-[180px] text-slate-500">
                <div className="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin mb-2" />
                <p className="text-xs font-bold">Cargando catálogo...</p>
              </div>
            ) : (
              <>
                {selectedMovie && (
                  <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900 p-4 sm:flex-row">
                    {selectedMovie.poster && (
                      <img src={selectedMovie.poster} alt="" className="hidden w-24 self-start rounded-xl object-cover sm:block" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-base font-bold text-white">{selectedMovie.title}</h2>
                          <p className="mt-1 text-xs text-slate-400">{selectedMovie.year || 'Año desconocido'} · {selectedMovie.isTv ? 'Serie' : 'Película'}</p>
                        </div>
                        <button type="button" onClick={() => setSelectedMovie(null)} aria-label="Cerrar detalles" className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white">Cerrar</button>
                      </div>
                      <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-300">{selectedMovie.overview}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenPortal(`https://bingetrix.sc/${selectedMovie.isTv ? 'tv' : 'movie'}/${selectedMovie.id}`, 'Bingetrix')}
                          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-rose-500"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" /> Ver en Bingetrix
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPortal('https://movidy.pw/', 'Movidy')}
                          className="rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                        >
                          Buscar en Movidy
                        </button>
                      </div>
                    </div>
                  </section>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {movies.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => handleSelectMovie(m)}
                      aria-pressed={selectedMovie?.id === m.id}
                      className={`group overflow-hidden rounded-2xl border bg-slate-900 text-left transition hover:shadow-lg ${
                        selectedMovie?.id === m.id ? 'border-rose-500' : 'border-slate-800 hover:border-rose-500/50'
                      }`}
                    >
                      <div className="relative aspect-[2/3] overflow-hidden bg-slate-950">
                        {m.poster ? (
                          <img src={m.poster} alt={m.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-600"><Film className="h-8 w-8" /></div>
                        )}
                      </div>
                      <div className="p-2">
                        <h4 className="truncate text-xs font-bold text-slate-100 group-hover:text-rose-400">{m.title}</h4>
                        <p className="text-[10px] text-slate-500">{m.year || 'Año n/d'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Web Browser Viewport - Filtered & Protected */
          <div className="w-full h-full relative group bg-black">
            {/* Ad-Block & Popup Blocker Active Indicator */}
            <div className="absolute top-2 right-3 z-10 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur border border-emerald-500/40 text-[11px] text-emerald-300 font-bold shadow-lg">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sin Publicidad · Popups Bloqueados</span>
            </div>

            {remoteBrowserError && (
              <div className="absolute inset-x-3 top-3 z-10 rounded-xl border border-rose-400/30 bg-rose-950/80 px-3 py-2 text-xs text-rose-100 shadow-lg backdrop-blur">
                {remoteBrowserError}
              </div>
            )}

            <iframe
              ref={iframeRef}
              src={proxyUrl}
              title="Virtual Chrome Player"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture; display-capture"
              allowFullScreen
              className="h-full w-full border-0 bg-black"
            />
          </div>
        )}
      </div>

    </div>
  );
};
