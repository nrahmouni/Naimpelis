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
  Star,
  Trophy,
  Activity,
  Clock
} from 'lucide-react';
import { motion } from 'framer-motion';

import { Language, TRANSLATIONS } from '../utils/i18n';
import { StreamSelectorModal } from './StreamSelectorModal';

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
  language: Language;
  onNavigate: (newUrl: string, title?: string) => void;
  onPlaybackChange?: (action: 'play' | 'pause' | 'seek', time: number, isPlaying: boolean) => void;
  onSendReaction: (emoji: string) => void;
}

export const VirtualChromeBrowser: React.FC<VirtualChromeBrowserProps> = ({
  currentUrl,
  videoState,
  isHost,
  roomId,
  language,
  onNavigate,
  onPlaybackChange,
  onSendReaction,
}) => {
  const t = TRANSLATIONS[language];
  const [activeTab, setActiveTab] = useState<'finder' | 'web'>('finder');
  const [activeCategory, setActiveCategory] = useState<'movidy' | 'english' | 'sports'>('movidy');
  const [searchQuery, setSearchQuery] = useState('');
  const [addressInput, setAddressInput] = useState(currentUrl || 'https://bingetrix.sc/watch/1423191');
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [sportsEvents, setSportsEvents] = useState<any[]>([]);
  const [streamOptions, setStreamOptions] = useState<any[]>([]);
  const [showStreamSelector, setShowStreamSelector] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieItem | null>(null);
  const [isLoadingMovies, setIsLoadingMovies] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const proxyUrl = `/api/proxy-web?url=${encodeURIComponent(currentUrl || addressInput)}&roomId=${encodeURIComponent(roomId)}`;

  // Sync logic for video and navigation
  useEffect(() => {
    const handleProxyMessage = (event: MessageEvent) => {
      if (!event.data) return;

      if (event.data.type === 'VIRTUAL_BROWSER_NAVIGATE' || event.data.type === 'VIRTUAL_BROWSER_URL_CHANGED') {
        const navUrl = event.data.url;
        if (navUrl && navUrl !== currentUrl && /^https?:\/\//i.test(navUrl)) {
          setAddressInput(navUrl);
          onNavigate(navUrl, 'Navegación Sincronizada');
        }
      } else if (event.data.type === 'VIRTUAL_BROWSER_VIDEO_SYNC') {
        const time = event.data.currentTime || 0;
        const isPlaying = event.data.isPlaying ?? false;
        const action = event.data.action || 'sync';

        if (isHost && onPlaybackChange && (action === 'play' || action === 'pause' || action === 'seek')) {
          onPlaybackChange(action, time, isPlaying);
        }
      }
    };

    window.addEventListener('message', handleProxyMessage);
    return () => window.removeEventListener('message', handleProxyMessage);
  }, [currentUrl, isHost, onNavigate, onPlaybackChange]);

  // When remote state updates, command the iframe
  useEffect(() => {
    if (videoState && iframeRef.current?.contentWindow) {
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

  // Load movies based on category or search
  const fetchMovies = async (query = '', category = activeCategory) => {
    setIsLoadingMovies(true);
    try {
      const catParam = query ? '' : category;
      const res = await fetch(`/api/search-movies?query=${encodeURIComponent(query)}&category=${catParam}`);
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

  const fetchSportsEvents = async () => {
    setIsLoadingMovies(true);
    try {
      const res = await fetch('/api/sports-events');
      const data = await res.json();
      if (data.success && data.events) {
        setSportsEvents(data.events);
      }
    } catch (err) {
      console.error('Error fetching sports:', err);
    } finally {
      setIsLoadingMovies(false);
    }
  };

  useEffect(() => {
    if (activeCategory !== 'sports') {
      fetchMovies('', activeCategory);
    } else {
      fetchSportsEvents();
      setActiveTab('finder');
    }
  }, [activeCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      fetchMovies(searchQuery.trim());
    }
  };

  const fetchStreamOptions = async (matchUrl: string) => {
    setIsLoadingMovies(true);
    try {
      const res = await fetch(`/api/sports-match-options?url=${encodeURIComponent(matchUrl)}`);
      const data = await res.json();
      if (data.success && data.options) {
        setStreamOptions(data.options);
        setShowStreamSelector(true);
      }
    } catch (err) {
      console.error('Error fetching streams:', err);
    } finally {
      setIsLoadingMovies(false);
    }
  };

  const handleSelectStream = (url: string) => {
    setShowStreamSelector(false);
    setAddressInput(url);
    setActiveTab('web');
    onNavigate(url, 'Deportes en Directo');
  };

  const handleSelectMovie = (movie: MovieItem) => {
    const url = activeCategory === 'movidy' ? movie.movidyUrl : movie.streamUrl;
    setSelectedMovie(movie);
    setAddressInput(url);
    setActiveTab('web');
    onNavigate(url, movie.title);
  };

  // ... (keep rest of the file)
  
  return (
    <div
      ref={containerRef}
      className={`w-full flex flex-col bg-slate-950 border-b border-white/5 shadow-2xl overflow-hidden transition-all duration-500 ${
        isFullscreen ? 'h-screen fixed inset-0 z-50' : 'flex-1'
      }`}
    >
      {/* ... (keep existing browser header) */}
      
      {/* Main Viewport */}
      <div className="flex-1 relative overflow-hidden bg-slate-950">
        {/* Stream Selector Modal */}
        {showStreamSelector && (
          <StreamSelectorModal
            options={streamOptions}
            onSelect={handleSelectStream}
            onClose={() => setShowStreamSelector(false)}
          />
        )}
        
        {/* Main Viewport Content (Tab Switcher) */}
        {activeTab === 'finder' ? (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {isLoadingMovies ? (
              <div className="h-64 flex flex-col items-center justify-center space-y-4">
                <div className="w-10 h-10 border-4 border-rose-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t.loadingCatalog}</p>
              </div>
            ) : activeCategory === 'sports' ? (
              <div className="p-4 sm:p-6 pb-12">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sportsEvents.length === 0 && (
                     <div className="col-span-full text-center py-20 bg-slate-900/50 rounded-[2rem] border border-white/5">
                        <Trophy className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">No hay eventos disponibles ahora</p>
                     </div>
                  )}
                  {sportsEvents.map((event) => (
                    <motion.div
                      key={event.id}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => fetchStreamOptions(event.sourceUrl)}
                      className="group bg-slate-900 hover:bg-slate-800 p-5 rounded-[1.5rem] border border-white/5 cursor-pointer transition-all flex flex-col justify-between shadow-lg"
                    >
                      <div className="flex justify-between items-start mb-4">
                         <span className="px-2 py-0.5 rounded-lg bg-rose-600/10 text-rose-500 text-[10px] font-black uppercase tracking-tighter border border-rose-500/20">
                            {event.sport || 'Fútbol'}
                         </span>
                         <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">En Directo</span>
                         </div>
                      </div>
                      
                      <h3 className="text-sm font-black text-slate-100 uppercase tracking-tight mb-4 flex-1">
                          {event.title}
                      </h3>

                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase">{event.time}</span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-950 group-hover:bg-rose-600 flex items-center justify-center text-white transition-colors">
                           <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 p-6">
                {movies.map((m) => (
                  <motion.div
                    key={m.id}
                    whileHover={{ y: -8 }}
                    onClick={() => handleSelectMovie(m)}
                    className="group relative bg-slate-900 rounded-[2rem] overflow-hidden cursor-pointer shadow-2xl border border-white/5"
                  >
                    <div className="aspect-[2/3] relative">
                      {m.poster ? (
                        <img src={m.poster} alt={m.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-800 text-4xl opacity-20">🎬</div>
                      )}
                      
                      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10 flex items-center gap-1.5 shadow-lg">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span className="text-[10px] font-black text-white">{m.rating || 'N/A'}</span>
                      </div>

                      <div className="absolute inset-0 bg-rose-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <div className="w-14 h-14 bg-rose-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-rose-950 scale-75 group-hover:scale-100 transition-transform duration-300">
                          <Play className="w-6 h-6 fill-white ml-1" />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-1">
                      <h3 className="text-xs font-black text-white line-clamp-1 group-hover:text-rose-500 transition-colors uppercase tracking-tight">{m.title}</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-500 uppercase">{m.year}</span>
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          <span className="text-[9px] font-black text-rose-500 uppercase">{t.streamingHD}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
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
