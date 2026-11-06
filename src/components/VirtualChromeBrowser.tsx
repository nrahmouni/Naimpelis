import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft,
  RotateCw, 
  Lock, 
  Globe, 
  ExternalLink, 
  Search, 
  Film,
  Sparkles,
  Maximize2,
  Minimize2,
  Play,
  Star,
  Clapperboard,
} from 'lucide-react';
import { VideoState } from '../types';
import { parseVideoUrl } from '../utils/videoParser';
import { RemoteBrowserViewport } from './RemoteBrowserViewport';
import { socketService } from '../services/socket';

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
  remoteBrowserActive: boolean;
  remoteBrowserError?: string;
  isHost: boolean;
  roomId: string;
  catalogRequest?: number;
  onNavigate: (newUrl: string, title?: string) => void;
  onPlaybackChange?: (action: 'play' | 'pause' | 'seek', time: number, isPlaying: boolean) => void;
  onSendReaction: (emoji: string) => void;
}

export const VirtualChromeBrowser: React.FC<VirtualChromeBrowserProps> = ({
  currentUrl,
  videoState,
  remoteBrowserActive,
  remoteBrowserError,
  isHost,
  roomId,
  catalogRequest = 0,
  onNavigate,
  onPlaybackChange,
  onSendReaction,
}) => {
  const [activeTab, setActiveTab] = useState<'finder' | 'web'>('finder');
  const [searchQuery, setSearchQuery] = useState('');
  const [addressInput, setAddressInput] = useState(currentUrl || 'https://movidy.pw/ver/hope/');
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieItem | null>(null);
  const [catalogError, setCatalogError] = useState('');

  // Sync state for iframe video
  const [syncedTime, setSyncedTime] = useState<number>(videoState?.currentTime || 0);
  const [syncedDuration, setSyncedDuration] = useState<number>(0);
  const [syncedIsPlaying, setSyncedIsPlaying] = useState<boolean>(videoState?.isPlaying || false);
  const [resyncNotice, setResyncNotice] = useState<string>('');

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const formatSecs = (sec: number) => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Listen for navigation & video sync postMessages sent by proxied iframe
  useEffect(() => {
    const handleProxyMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data) return;

      if (
        event.data.type === 'VIRTUAL_BROWSER_NAVIGATE' ||
        event.data.type === 'VIRTUAL_BROWSER_URL_CHANGED'
      ) {
        const navUrl = event.data.url;
        if (navUrl && navUrl !== currentUrl && /^https?:\/\//i.test(navUrl)) {
          setAddressInput(navUrl);
          onNavigate(navUrl, 'Navegación web');
        }
      } else if (event.data.type === 'VIRTUAL_BROWSER_VIDEO_SYNC') {
        const time = event.data.currentTime || 0;
        const isPlaying = event.data.isPlaying ?? false;
        const duration = event.data.duration || 0;
        const action = event.data.action || 'sync';

        setSyncedTime(time);
        setSyncedIsPlaying(isPlaying);
        if (duration > 0) setSyncedDuration(duration);

        // If host triggers a play, pause, or seek inside iframe video, sync to room via WebSocket!
        if (isHost && onPlaybackChange && (action === 'play' || action === 'pause' || action === 'seek')) {
          onPlaybackChange(action, time, isPlaying);
        }
      }
    };

    window.addEventListener('message', handleProxyMessage);
    return () => window.removeEventListener('message', handleProxyMessage);
  }, [currentUrl, isHost, onNavigate, onPlaybackChange]);

  useEffect(() => socketService.subscribe(({ type, payload }) => {
    if ((type === 'REMOTE_BROWSER_LOCATION' || type === 'REMOTE_BROWSER_FRAME') && typeof payload?.url === 'string') {
      setAddressInput(payload.url);
      setActiveTab('web');
    }
  }), []);

  // When remote videoState updates (e.g. Host seeks to 15:51), forward command to iframe!
  useEffect(() => {
    if (videoState && iframeRef.current?.contentWindow) {
      setSyncedTime(videoState.currentTime || 0);
      setSyncedIsPlaying(videoState.isPlaying || false);

      iframeRef.current.contentWindow.postMessage(
        {
          type: 'W2G_REMOTE_VIDEO_COMMAND',
          currentTime: videoState.currentTime,
          isPlaying: videoState.isPlaying,
        },
        '*'
      );
    }
  }, [videoState?.lastUpdated, videoState?.currentTime, videoState?.isPlaying]);

  // Force Broadcast Sync (Host sends current timestamp to all room members)
  const handleForceBroadcastSync = () => {
    if (onPlaybackChange) {
      onPlaybackChange('seek', syncedTime, syncedIsPlaying);
      setResyncNotice('¡Sincronía enviada a toda la sala!');
      setTimeout(() => setResyncNotice(''), 2500);
    }
  };

  // Load popular/trending catalog on mount or when search query updates
  const fetchMovies = async (query = '') => {
    setIsLoadingMovies(true);
    setCatalogError('');
    try {
      const res = await fetch(`/api/search-movies?query=${encodeURIComponent(query)}`);
      if (!res.ok) {
        throw new Error(`No se pudo cargar el catálogo (${res.status}).`);
      }
      const data = await res.json();
      if (!Array.isArray(data.results)) throw new Error('La respuesta del catálogo no es válida.');
      setMovies(data.results);
    } catch (err) {
      console.error('Error fetching movies:', err);
      setCatalogError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo.');
    } finally {
      setIsLoadingMovies(false);
    }
  };

  useEffect(() => {
    void fetchMovies();
  }, []);

  // Keep the address bar in sync without forcing users out of the catalog.
  useEffect(() => {
    if (currentUrl) {
      setAddressInput(currentUrl);
    }
  }, [currentUrl]);

  useEffect(() => {
    if (catalogRequest > 0) {
      setSelectedMovie(null);
      setActiveTab('finder');
    }
  }, [catalogRequest]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedMovie(null);
    void fetchMovies(searchQuery.trim());
  };

  const handleSelectMovie = (movie: MovieItem) => {
    setSelectedMovie(movie);
  };

  const handleOpenPortal = (url: string, title: string) => {
    setSelectedMovie(null);
    setAddressInput(url);
    setActiveTab('web');
    onNavigate(url, title);
  };

  const handlePlayTrailer = async () => {
    if (!selectedMovie) return;

    try {
      const tmdbRef = `tmdb/${selectedMovie.isTv ? 'tv/' : ''}${selectedMovie.id}`;
      const response = await fetch(`/api/resolve-movie?url=${encodeURIComponent(tmdbRef)}`);
      if (!response.ok) throw new Error(`No se pudo cargar la ficha (${response.status}).`);
      const data = await response.json();
      if (data.trailerUrl) {
        setAddressInput(data.trailerUrl);
        setActiveTab('web');
        onNavigate(data.trailerUrl, `${selectedMovie.title} - Tráiler`);
      } else {
        setCatalogError('No hay un tráiler oficial disponible para este título.');
      }
    } catch (err) {
      console.error('Error fetching movie trailer:', err);
      setCatalogError(err instanceof Error ? err.message : 'No se pudo cargar el tráiler.');
    }
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let url = addressInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        // Search movies catalog directly if plain words entered!
        setActiveTab('finder');
        setSearchQuery(url);
        fetchMovies(url);
        return;
      }
    }
    setAddressInput(url);
    setActiveTab('web');
    onNavigate(url);
  };

  const isPlaybackControllable = ['youtube', 'vimeo', 'direct'].includes(parseVideoUrl(addressInput).type) || remoteBrowserActive;
  const proxyUrl = `/api/proxy-web?url=${encodeURIComponent(addressInput)}&roomId=${encodeURIComponent(roomId)}`;

  return (
    <div
      ref={containerRef}
      className={`w-full flex flex-col bg-slate-900 border-b border-slate-800 shadow-2xl overflow-hidden ${
        isFullscreen ? 'h-screen fixed inset-0 z-50' : 'h-full min-h-0 flex-1'
      }`}
    >
      {/* Chrome Tab Strip */}
      <div className="bg-slate-950 px-3 pt-1.5 pb-1 flex items-center justify-between border-b border-slate-800 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Tab 1: Movie Explorer & Catalog (Primary View) */}
          <button
            onClick={() => {
              setActiveTab('finder');
              setSelectedMovie(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-t-xl text-xs font-bold transition-all border-t border-x ${
              activeTab === 'finder'
                ? 'bg-slate-900 text-rose-400 border-slate-800 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Buscador / Catálogo</span>
          </button>

          {/* Tab 2: Virtual Web Browser View */}
          <button
            onClick={() => setActiveTab('web')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-t-xl text-xs font-bold transition-all border-t border-x ${
              activeTab === 'web'
                ? 'bg-slate-900 text-blue-400 border-slate-800 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="hidden sm:inline">Navegador Web</span>
          </button>
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium hidden sm:inline-block ${
            isPlaybackControllable
              ? 'text-emerald-200 bg-emerald-500/10 border border-emerald-400/20'
              : 'text-amber-100 bg-amber-500/10 border border-amber-300/20'
          }`}>
            {remoteBrowserActive ? 'Navegador remoto sincronizado' : isPlaybackControllable ? 'Reproducción sincronizable' : 'Solo se comparte el enlace'}
          </span>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Chrome Omnibox / Navigation Bar */}
      <div className="bg-slate-900 px-2.5 py-1 flex items-center gap-2 border-b border-slate-800">
        <div className="flex items-center gap-1 text-slate-300 shrink-0">
          <button
            onClick={() => {
              setSelectedMovie(null);
              setActiveTab('finder');
            }}
            className="p-1 rounded hover:bg-slate-800 text-rose-400 hover:text-rose-300"
            title="Volver al catálogo"
          >
            <Clapperboard className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (iframeRef.current) {
                iframeRef.current.src = proxyUrl;
              }
              onNavigate(addressInput, 'Película Sincronizada');
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all active:scale-95"
            title={isPlaybackControllable ? 'Enviar estado de reproducción a la sala' : 'Abrir esta dirección en las pantallas de la sala'}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[10px] hidden xs:inline">{isPlaybackControllable ? 'Sincronizar' : 'Abrir para todos'}</span>
          </button>
        </div>

        {/* Address Bar Form */}
        <form onSubmit={handleAddressSubmit} className="flex-1 min-w-0">
          <div className="w-full bg-slate-950 border border-slate-700/80 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20 rounded-full px-3 py-1 flex items-center gap-2">
            <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Escribe para buscar peli (ej: Resident Evil) o introduce URL..."
              className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
            />
          </div>
        </form>

        <a
          href={addressInput}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
          title="Abrir en pestaña nueva"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 w-full relative bg-slate-950 overflow-hidden">
        {activeTab === 'finder' ? (
          /* Movie Catalog Explorer View */
          <div className="h-full overflow-y-auto bg-[#090b10]">
            {selectedMovie ? (
              <section className="relative min-h-full overflow-hidden">
                {selectedMovie.backdrop && (
                  <img
                    src={selectedMovie.backdrop}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover opacity-25"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-[#090b10] via-[#090b10]/90 to-[#090b10]/45" />
                <div className="relative flex min-h-full flex-col justify-center p-4 sm:p-7">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMovie(null);
                      setCatalogError('');
                    }}
                    className="mb-4 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    <ArrowLeft className="h-4 w-4" /> Volver al catálogo
                  </button>
                  <div className="flex items-center gap-4 sm:gap-6">
                    {selectedMovie.poster && (
                      <img
                        src={selectedMovie.poster}
                        alt={`Póster de ${selectedMovie.title}`}
                        className="hidden w-28 shrink-0 rounded-xl shadow-2xl sm:block md:w-36"
                      />
                    )}
                    <div className="max-w-2xl">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-300">
                        <span>{selectedMovie.isTv ? 'Serie' : 'Película'}</span>
                        {selectedMovie.year && <span className="text-slate-400">{selectedMovie.year}</span>}
                        {selectedMovie.rating && (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <Star className="h-3 w-3 fill-current" /> {selectedMovie.rating}
                          </span>
                        )}
                      </div>
                      <h1 className="text-2xl font-black leading-tight text-white sm:text-4xl">{selectedMovie.title}</h1>
                      <p className="mt-3 max-w-xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                        {selectedMovie.overview || 'Sinopsis no disponible.'}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handlePlayTrailer()}
                          className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-400"
                        >
                          <Play className="h-4 w-4 fill-current" /> Ver tráiler oficial
                        </button>
                        <a
                          href={`https://www.themoviedb.org/${selectedMovie.isTv ? 'tv' : 'movie'}/${selectedMovie.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                        >
                          Más información <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                  {catalogError && (
                    <p role="alert" className="mt-4 text-xs text-rose-300">{catalogError}</p>
                  )}
                </div>
              </section>
            ) : (
              <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
                <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-rose-300">Naimpelis · Descubre</p>
                    <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">Películas y series</h1>
                    <p className="mt-1 text-xs text-slate-400">Explora títulos, consulta sus fichas y comparte tráileres oficiales.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:w-[min(100%,27rem)]">
                    <form onSubmit={handleSearchSubmit} className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Buscar película o serie"
                          aria-label="Buscar película o serie"
                          className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-500 focus:border-rose-400/60 focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="rounded-full bg-rose-500 px-4 text-xs font-bold text-white transition hover:bg-rose-400"
                      >
                        Buscar
                      </button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPortal('https://movidy.pw/ver/hope/', 'Movidy')}
                        className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-slate-200 transition hover:border-rose-400/40 hover:bg-rose-500/10"
                      >
                        Abrir Movidy
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenPortal('https://bingetrix.sc/movie/1423191', 'Bingetrix')}
                        className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-slate-200 transition hover:border-rose-400/40 hover:bg-rose-500/10"
                      >
                        Abrir Bingetrix
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white">{searchQuery.trim() ? `Resultados para “${searchQuery.trim()}”` : 'Tendencias de la semana'}</h2>
                  <span className="text-[10px] text-slate-500">{movies.length} títulos</span>
                </div>

                {catalogError && !selectedMovie && (
                  <div role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
                    {catalogError}
                  </div>
                )}

                {isLoadingMovies ? (
                  <div className="flex min-h-40 flex-col items-center justify-center text-slate-500">
                    <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
                    <p className="text-xs font-semibold">Cargando catálogo…</p>
                  </div>
                ) : movies.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 pb-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {movies.map((movie) => (
                      <button
                        type="button"
                        key={`${movie.isTv ? 'tv' : 'movie'}-${movie.id}`}
                        onClick={() => handleSelectMovie(movie)}
                        className="group overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.035] text-left transition hover:-translate-y-1 hover:border-rose-400/50 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-rose-400/70"
                        aria-label={`Ver ficha de ${movie.title}`}
                      >
                        <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
                          {movie.poster ? (
                            <img
                              src={movie.poster}
                              alt={`Póster de ${movie.title}`}
                              loading="lazy"
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-4xl text-slate-700"><Film /></div>
                          )}
                          <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/75 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-200">
                            {movie.isTv ? 'Serie' : 'Película'}
                          </span>
                          {movie.rating && (
                            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-[10px] font-bold text-amber-300">
                              <Star className="h-3 w-3 fill-current" /> {movie.rating}
                            </span>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg">
                              <Play className="h-5 w-5 fill-current" />
                            </span>
                          </div>
                        </div>
                        <div className="p-2.5">
                          <h3 className="truncate text-xs font-bold text-slate-100 group-hover:text-rose-200">{movie.title}</h3>
                          <p className="mt-1 text-[10px] text-slate-500">{movie.year || 'Año sin datos'} · Ver ficha</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  !catalogError && (
                    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-center">
                      <Film className="mb-2 h-7 w-7 text-slate-600" />
                      <p className="text-sm font-semibold text-slate-300">No encontramos títulos</p>
                      <p className="mt-1 text-xs text-slate-500">Prueba con otro nombre.</p>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ) : (
          /* Web Browser Viewport */
          <div className="w-full h-full relative group">
            {remoteBrowserError && (
              <div
                role="alert"
                className="absolute inset-x-3 top-3 z-10 rounded-xl border border-rose-400/30 bg-rose-950/80 px-3 py-2 text-xs leading-relaxed text-rose-100 shadow-lg backdrop-blur"
              >
                {remoteBrowserError}
              </div>
            )}
            {!isPlaybackControllable && !remoteBrowserError && (
              <div
                role="status"
                className="absolute inset-x-3 top-3 z-10 rounded-xl border border-amber-200/15 bg-slate-950/90 px-3 py-2 text-xs leading-relaxed text-slate-200 shadow-lg backdrop-blur"
              >
                Este reproductor externo no permite control remoto. Para mostrar el mismo instante, el anfitrión puede compartir su pantalla.
              </div>
            )}
            {videoState?.sourceType === 'iframe' ? (
              <RemoteBrowserViewport isHost={isHost} active={remoteBrowserActive} />
            ) : (
              <iframe
                ref={iframeRef}
                src={proxyUrl}
                title="Virtual Chrome Player"
                sandbox="allow-scripts allow-forms allow-presentation"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0 bg-black"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
