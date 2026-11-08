import React, { useState, useEffect } from 'react';
import { 
  Search, 
  RotateCw, 
  Play, 
  ExternalLink, 
  ShieldCheck, 
  Radio, 
  Trophy, 
  Flame, 
  Tv, 
  Filter,
  CheckCircle,
  Globe
} from 'lucide-react';
import { SportsEvent, SportsChannel } from '../types';

interface SportsEventsViewProps {
  initialSource?: 'all' | 'rojadirectv' | 'rojadirectahd';
  onSelectStream: (url: string, title: string) => void;
  onOpenWeb: (url: string, title: string) => void;
}

export const SportsEventsView: React.FC<SportsEventsViewProps> = ({
  initialSource = 'all',
  onSelectStream,
  onOpenWeb,
}) => {
  const [events, setEvents] = useState<SportsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<'all' | 'rojadirectv' | 'rojadirectahd'>(initialSource);
  const [onlyLive, setOnlyLive] = useState(false);
  const [sourcesMeta, setSourcesMeta] = useState<Record<string, { name: string; url: string; total: number }>>({});
  const [selectedEvent, setSelectedEvent] = useState<SportsEvent | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sports-events');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.events)) {
        setEvents(data.events);
        setSourcesMeta(data.sources || {});
      } else {
        throw new Error('Respuesta no válida del servidor');
      }
    } catch (err: unknown) {
      console.error('Error fetching sports events:', err);
      setError('No se pudieron cargar los eventos deportivos en este momento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchEvents();
  }, []);

  useEffect(() => {
    if (initialSource) {
      setSelectedSource(initialSource);
    }
  }, [initialSource]);

  // Unique sports list for filter tabs
  const sportsCategories = [
    { id: 'all', label: 'Todos los deportes' },
    { id: 'futbol', label: '⚽ Fútbol', match: ['futbol', 'fútbol', 'soccer', 'laliga', 'serie a', 'premier', 'league', 'champions'] },
    { id: 'baloncesto', label: '🏀 Baloncesto / NBA', match: ['baloncesto', 'basketball', 'nba', 'endesa', 'euroleague'] },
    { id: 'motor', label: '🏎️ Motor / F1 / MotoGP', match: ['motogp', 'f1', 'formula', 'motor', 'nascar'] },
    { id: 'tenis', label: '🎾 Tenis', match: ['tenis', 'tennis', 'atp', 'wta'] },
    { id: 'combate', label: '🥊 MMA / Boxeo', match: ['ufc', 'mma', 'boxeo', 'boxing', 'wwe'] },
  ];

  const filteredEvents = events.filter((ev) => {
    // Filter by source
    if (selectedSource !== 'all' && ev.source !== selectedSource) {
      return false;
    }

    // Filter by live status
    if (onlyLive && ev.status !== 'live') {
      return false;
    }

    // Filter by sport category
    if (selectedSport !== 'all') {
      const category = sportsCategories.find((c) => c.id === selectedSport);
      if (category?.match) {
        const text = `${ev.sport} ${ev.competition} ${ev.title}`.toLowerCase();
        const hasMatch = category.match.some((kw) => text.includes(kw));
        if (!hasMatch) return false;
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = `${ev.title} ${ev.sport} ${ev.competition} ${ev.homeTeam || ''} ${ev.awayTeam || ''}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    return true;
  });

  const liveCount = events.filter((e) => e.status === 'live').length;

  return (
    <div className="h-full flex flex-col bg-[#080b11] text-slate-100 overflow-hidden font-sans select-none">
      {/* Single Ultra-Clean Control Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2 text-xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar equipo o partido..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-medium"
          />
        </div>

        {/* Sport Category Select Dropdown */}
        <select
          value={selectedSport}
          onChange={(e) => setSelectedSport(e.target.value)}
          className="bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-rose-500 cursor-pointer shrink-0"
        >
          {sportsCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </select>

        {/* Live Filter Toggle */}
        <button
          onClick={() => setOnlyLive(!onlyLive)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 ${
            onlyLive
              ? 'bg-rose-600 border-rose-500 text-white shadow-md'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
          <span className="hidden xs:inline">En vivo</span>
          <span>({liveCount})</span>
        </button>

        {/* Refresh */}
        <button
          onClick={() => void fetchEvents()}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-all shrink-0"
          title="Actualizar agenda deportiva"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Content Area: Events List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
        {error && (
          <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => void fetchEvents()}
              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px]"
            >
              Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[220px] text-slate-500">
            <div className="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin mb-3" />
            <p className="text-xs font-bold text-slate-300">Conectando con RojaDirecta...</p>
            <p className="text-[11px] text-slate-500 mt-1">Cargando agenda deportiva sin publicidad</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[200px] border border-dashed border-slate-800 rounded-2xl p-6 text-center">
            <Trophy className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-bold text-slate-300">No se encontraron eventos</p>
            <p className="text-xs text-slate-500 mt-1">
              Prueba a cambiar los filtros o el término de búsqueda.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedSport('all');
                setSelectedSource('all');
                setOnlyLive(false);
              }}
              className="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-all"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredEvents.map((ev) => (
              <div
                key={ev.id}
                className="bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 rounded-2xl p-3.5 flex flex-col justify-between transition-all group hover:shadow-lg hover:shadow-black/40"
              >
                <div>
                  {/* Top Bar of Card */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {ev.status === 'live' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-extrabold uppercase tracking-wider animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          <span>EN VIVO</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold">
                          🕒 {ev.time}
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-slate-400 truncate max-w-[120px]">
                        {ev.competition}
                      </span>
                    </div>

                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      ev.source === 'rojadirectv'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                    }`}>
                      {ev.source === 'rojadirectv' ? 'RojaDirecta TV' : 'RojaDirecta HD'}
                    </span>
                  </div>

                  {/* Match Title & Teams */}
                  <div className="my-1.5">
                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-rose-300 transition-colors line-clamp-2 leading-snug">
                      {ev.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                      <span className="text-slate-500">Deporte:</span>
                      <span className="font-semibold text-slate-300 capitalize">{ev.sport}</span>
                    </p>
                  </div>
                </div>

                {/* Channels / Streams Buttons */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Canales disponibles ({ev.channels.length})
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {ev.channels.map((ch, idx) => (
                      <button
                        key={`${ev.id}-ch-${idx}`}
                        onClick={() => {
                          onSelectStream(ch.url, `${ev.title} (${ch.name})`);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/30 text-xs font-bold transition-all active:scale-95 shadow-sm"
                        title={`Transmitir ${ch.name} a la sala sin anuncios`}
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{ch.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
