import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  Home, 
  Lock, 
  Globe, 
  ExternalLink, 
  Search, 
  Film,
  Sparkles,
  Maximize2,
  Minimize2,
  Play,
  Star
} from 'lucide-react';

interface MovieItem {
  id: number;
  title: string;
  year: string;
  overview: string;
  poster: string;
  backdrop: string;
  rating: string;
  isTv: boolean;
  streamUrl: string;
  bingetrixUrl: string;
  movidyUrl: string;
}

interface VirtualChromeBrowserProps {
  currentUrl: string;
  videoState?: any;
  isHost: boolean;
  roomId: string;
  onNavigate: (newUrl: string, title?: string) => void;
  onPlaybackChange?: (action: 'play' | 'pause' | 'seek', time: number, isPlaying: boolean) => void;
  onSendReaction: (emoji: string) => void;
}

export const VirtualChromeBrowser: React.FC<VirtualChromeBrowserProps> = ({
  currentUrl,
  videoState,
  isHost,
  roomId,
  onNavigate,
  onPlaybackChange,
  onSendReaction,
}) => {
  const [activeTab, setActiveTab] = useState<'finder' | 'web'>('finder');
  const [searchQuery, setSearchQuery] = useState('');
  const [addressInput, setAddressInput] = useState(currentUrl || 'https://bingetrix.sc/watch/1423191');
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieItem | null>(null);
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [isLoadingWeb, setIsLoadingWeb] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      if (!event.data) return;

      if (
        event.data.type === 'VIRTUAL_BROWSER_NAVIGATE' ||
        event.data.type === 'VIRTUAL_BROWSER_URL_CHANGED'
      ) {
        const navUrl = event.data.url;
        if (navUrl && navUrl !== currentUrl && /^https?:\/\//i.test(navUrl)) {
          setAddressInput(navUrl);
          onNavigate(navUrl, 'Bingetrix - Navegación');
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
    try {
      const res = await fetch(`/api/search-movies?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.results) {
        setMovies(data.results);
      }
    } catch (err) {
      console.error('Error fetching movies:', err);
    } finally {
      setIsLoadingMovies(false);
    }
  };

  useEffect(() => {
    fetchMovies('Resident Evil');
  }, []);

  // When host navigates or a newly invited user connects, synchronize the browser tab and URL!
  useEffect(() => {
    if (currentUrl) {
      setAddressInput(currentUrl);
      setActiveTab('web');
    }
  }, [currentUrl]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      fetchMovies(searchQuery.trim());
    }
  };

  const handleSelectMovie = (movie: MovieItem) => {
    setSelectedMovie(movie);
    // Switch to web player tab and navigate both users
    setActiveTab('web');
    setAddressInput(movie.streamUrl);
    onNavigate(movie.streamUrl, movie.title);
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

  const isDirectEmbedProvider = /vidsrc|autoembed|2embed|\/embed\//i.test(addressInput);

  const proxyUrl = isDirectEmbedProvider
    ? addressInput
    : `/api/proxy-web?url=${encodeURIComponent(addressInput)}&roomId=${encodeURIComponent(roomId)}`;

  return (
    <div
      ref={containerRef}
      className={`w-full flex flex-col bg-slate-900 border-b border-slate-800 shadow-2xl overflow-hidden ${
        isFullscreen ? 'h-screen fixed inset-0 z-50' : 'h-[38vh] sm:h-[45vh] md:h-full flex-1'
      }`}
    >
      {/* Chrome Tab Strip */}
      <div className="bg-slate-950 px-3 pt-1.5 pb-1 flex items-center justify-between border-b border-slate-800 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Tab 1: Movie Explorer & Catalog (Primary View) */}
          <button
            onClick={() => setActiveTab('finder')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-t-xl text-xs font-bold transition-all border-t border-x ${
              activeTab === 'finder'
                ? 'bg-slate-900 text-rose-400 border-slate-800 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Buscador / Catálogo</span>
          </button>

          {/* Movidy Quick Portal Button */}
          <button
            onClick={() => {
              const movidyUrl = 'https://movidy.pw/';
              setAddressInput(movidyUrl);
              setActiveTab('web');
              onNavigate(movidyUrl, 'Movidy Películas');
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shrink-0 active:scale-95"
            title="Abrir Movidy"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Movidy.pw</span>
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
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-mono hidden sm:inline-block">
            Sincronizado
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
              const bUrl = 'https://bingetrix.sc/watch/1423191';
              setAddressInput(bUrl);
              setActiveTab('web');
              onNavigate(bUrl, 'Bingetrix');
            }}
            className="p-1 rounded hover:bg-slate-800 text-rose-400 hover:text-rose-300"
            title="Ir a inicio de Bingetrix"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (iframeRef.current) {
                iframeRef.current.src = proxyUrl;
              }
              onNavigate(addressInput, 'Película Sincronizada');
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all active:scale-95"
            title="Sincronizar y recargar esta película en las pantallas de todos los invitados"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[10px] hidden xs:inline">Sincronizar</span>
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
          <div className="h-full flex flex-col p-4 overflow-y-auto">
            {/* Search Input Filter */}
            <form onSubmit={handleSearchSubmit} className="mb-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Busca cualquier película o serie por nombre..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95"
              >
                Buscar
              </button>
            </form>

            {/* Movie Grid */}
            {isLoadingMovies ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
                <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs font-semibold">Cargando catálogo de películas...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pb-6">
                {movies.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => handleSelectMovie(m)}
                    className="group bg-slate-900 border border-slate-800/80 hover:border-rose-500/70 rounded-2xl overflow-hidden cursor-pointer flex flex-col transition-all hover:scale-[1.02] shadow-lg"
                  >
                    <div className="relative aspect-[2/3] bg-slate-950 w-full overflow-hidden">
                      {m.poster ? (
                        <img
                          src={m.poster}
                          alt={m.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl">
                          🎬
                        </div>
                      )}
                      {m.rating && (
                        <span className="absolute top-2 right-2 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-400" /> {m.rating}
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg">
                          <Play className="w-5 h-5 fill-white translate-x-0.5" />
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 flex flex-col justify-between flex-1">
                      <div>
                        <h4 className="text-xs font-bold text-slate-200 line-clamp-1 group-hover:text-rose-400 transition-colors">
                          {m.title}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-500">{m.year}</span>
                      </div>
                      <button
                        type="button"
                        className="mt-2 w-full py-1 bg-rose-600/20 group-hover:bg-rose-600 group-hover:text-white text-rose-300 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <Play className="w-3 h-3 fill-current" /> Ver en Sala
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Web Browser Viewport */
          <div className="w-full h-full relative group">
            <iframe
              ref={iframeRef}
              src={proxyUrl}
              title="Virtual Chrome Player"
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0 bg-black"
            />
          </div>
        )}
      </div>
    </div>
  );
};
