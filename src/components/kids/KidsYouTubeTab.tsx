import React, { useEffect, useState, useMemo } from 'react';
import { Search, Play, Loader2, Mic, Youtube } from 'lucide-react';
import type { AppLanguage, KidsAgeGroup, KidsLanguageCode, CatalogMovie } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import { KIDS_LANGUAGES } from './kidsData';
import { speakKidsText } from './kidsTtsHelper';
import { KidsAnimatedCategoryIcon } from './KidsSvgArt';

interface KidsYouTubeTabProps {
  shellLang: AppLanguage;
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  onPlayYouTube: (videoItem: { videoId: string; title: string; thumbnail?: string }) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
}

interface YouTubeVideoItem {
  videoId: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  duration?: string;
}

const DEFAULT_YT_QUERIES: Record<KidsLanguageCode, string[]> = {
  es: ['dibujos animados infantiles', 'canciones infantiles', 'cuentos infantiles', 'CantaJuego'],
  ca: ['dibuixos en catala', 'super3 cançons', 'pamtoma', 'contes infantils catala'],
  en: ['kids cartoons full episodes', 'nursery rhymes', 'bluey official', 'super simple songs'],
  nl: ['kinderliedjes', 'samson en marie', 'ketnet junior', 'maya de bij'],
  fr: ['dessin animé français', 'comptines pour enfants', 'petit ours brun', 'peppa pig français'],
  ar: ['أناشيد أطفال سبيستون', 'كرتون للأطفال', 'طيور الجنة', 'قصص للأطفال'],
  rif: ['arrac n arrif', 'tiḥuja d tisasin', 'tamazight kids songs', 'nador music kids'],
  zh: ['儿童经典动画', '宝宝儿歌', '熊出没动画片', '趣味少儿'],
};

interface BrowserSpeechRec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export const KidsYouTubeTab: React.FC<KidsYouTubeTabProps> = ({
  shellLang,
  kidsLang,
  ageGroup: _ageGroup,
  onPlayYouTube,
  onEarnStar,
}) => {
  const activeLangMeta =
    KIDS_LANGUAGES.find((l) => l.code === kidsLang) || KIDS_LANGUAGES[0];

  const defaultQueryList = DEFAULT_YT_QUERIES[kidsLang] || DEFAULT_YT_QUERIES.es;
  const [selectedTopic, setSelectedTopic] = useState<string>(defaultQueryList[0]);
  const [searchDraft, setSearchDraft] = useState<string>('');
  const [activeQuery, setActiveQuery] = useState<string>(defaultQueryList[0]);
  const [videos, setVideos] = useState<YouTubeVideoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [listeningVoice, setListeningVoice] = useState<boolean>(false);

  const supportsVoice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    const qParam = activeQuery || defaultQueryList[0];
    const langSuffix =
      kidsLang === 'es'
        ? 'español'
        : kidsLang === 'ca'
        ? 'català'
        : kidsLang === 'en'
        ? 'english kids'
        : kidsLang === 'nl'
        ? 'vlaams nederlands'
        : kidsLang === 'fr'
        ? 'français'
        : kidsLang === 'ar'
        ? 'عربي أطفال'
        : kidsLang === 'rif'
        ? 'tarifit n arrif'
        : '中文儿童';

    const fullQuery = `${qParam} ${langSuffix} kids safe`;

    fetch(`/api/catalog/youtube?q=${encodeURIComponent(fullQuery)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.videos)
          ? data.videos
          : Array.isArray(data)
          ? data
          : [];
        setVideos(list);
        if (list.length === 0) {
          setErrorMsg(
            pickLang(shellLang, {
              es: 'No se encontraron vídeos de YouTube para esta búsqueda.',
              ca: 'No s’han trobat vídeos de YouTube per a aquesta cerca.',
              en: 'No YouTube videos found for this search.',
            })
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg(
            pickLang(shellLang, {
              es: 'Error al conectar con YouTube Kids.',
              ca: 'Error en connectar amb YouTube Kids.',
              en: 'Connection error connecting to YouTube Kids.',
            })
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeQuery, kidsLang, shellLang, defaultQueryList]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchDraft.trim()) return;
    triggerHaptic('light');
    setActiveQuery(searchDraft.trim());
  };

  const handleVoiceSearch = () => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRec;
      webkitSpeechRecognition?: new () => BrowserSpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    triggerHaptic('medium');
    setListeningVoice(true);
    try {
      const rec = new Ctor();
      rec.lang = activeLangMeta.speechCode || 'es-ES';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (evt) => {
        const transcript = String(evt.results?.[0]?.[0]?.transcript || '').trim();
        if (transcript) {
          setSearchDraft(transcript);
          setActiveQuery(transcript);
        }
        setListeningVoice(false);
      };
      rec.onerror = () => setListeningVoice(false);
      rec.onend = () => setListeningVoice(false);
      rec.start();
    } catch {
      setListeningVoice(false);
    }
  };

  const handleSelectVideo = (vid: YouTubeVideoItem) => {
    triggerHaptic('medium');
    onEarnStar(1);
    onPlayYouTube({
      videoId: vid.videoId,
      title: vid.title,
      thumbnail: vid.thumbnail,
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      {/* Top Bar: Language Ribbon */}
      <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {KIDS_LANGUAGES.map((item) => {
          const selected = item.code === kidsLang;
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                void speakKidsText(item.greeting, item.code);
              }}
              className={`h-9 px-3 rounded-2xl text-xs font-black flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-all border-b-2 active:scale-95 ${
                selected
                  ? 'bg-gradient-to-r from-red-400 to-red-600 text-white border-red-800 ring-2 ring-red-400 shadow-md scale-105'
                  : 'bg-[#182144] hover:bg-[#232F5C] text-zinc-300 border-[#0D1226]'
              }`}
            >
              <FlagBadgeSvg code={item.flagCode} className="w-5 h-3.5 shadow-sm" />
              <span>{item.nativeLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Row 2: YouTube Safe Kid Topics & Search */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <div className="flex items-center gap-1 bg-red-600/20 px-3 py-1.5 rounded-2xl border border-red-500/40 text-red-200 text-xs font-black">
            <Youtube className="w-4 h-4 text-red-400 shrink-0" />
            <span>YouTube Kids</span>
          </div>
          {defaultQueryList.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedTopic(topic);
                setActiveQuery(topic);
              }}
              className={`h-8 px-3 rounded-xl text-xs font-black whitespace-nowrap cursor-pointer border-b-2 flex items-center gap-1.5 transition-all active:scale-95 ${
                selectedTopic === topic && !searchDraft
                  ? 'bg-gradient-to-r from-red-400 to-red-600 text-white border-red-800 shadow-md scale-105'
                  : 'bg-[#182144] hover:bg-[#232F5C] text-zinc-200 border-[#0D1226]'
              }`}
            >
              <KidsAnimatedCategoryIcon name="animation" size={14} />
              <span className="capitalize">{topic}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {supportsVoice && (
            <button
              type="button"
              onClick={handleVoiceSearch}
              aria-label="Buscar con voz en YouTube"
              title="Habla para buscar en YouTube Kids"
              className={`h-9 w-9 rounded-2xl flex items-center justify-center cursor-pointer border-b-2 transition-all active:scale-95 ${
                listeningVoice
                  ? 'bg-rose-500 text-white border-rose-700 animate-pulse ring-2 ring-rose-400'
                  : 'bg-red-500/30 hover:bg-red-500/45 text-red-200 border-red-700/60'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>
          )}

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1 bg-[#161D38] border border-red-500/35 rounded-xl p-1">
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={`Buscar en YouTube (${activeLangMeta.nativeLabel})...`}
              className="w-36 sm:w-48 h-8 px-2.5 rounded-lg bg-[#0B0F20] text-xs text-white placeholder:text-zinc-400 outline-none"
            />
            <button
              type="submit"
              className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer flex items-center gap-1"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Buscar</span>
            </button>
          </form>
        </div>
      </div>

      {errorMsg && (
        <div className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs text-rose-100">
          {errorMsg}
        </div>
      )}

      {/* Video Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="h-44 rounded-2xl bg-[#18203D]/80 animate-pulse" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="h-full rounded-2xl bg-[#141B34] border border-white/10 flex flex-col items-center justify-center p-4 text-center gap-2">
            <div className="text-3xl">📺</div>
            <p className="text-sm font-bold text-white">No se encontraron vídeos</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {videos.map((vid) => (
              <div
                key={vid.videoId}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectVideo(vid)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectVideo(vid);
                  }
                }}
                className="group relative rounded-2xl bg-[#151D38] border-2 border-[#253059] border-b-4 hover:border-red-400 overflow-hidden text-left flex flex-col cursor-pointer transition-all active:translate-y-0.5 shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <div className="relative aspect-video w-full bg-[#1C2547] overflow-hidden">
                  {vid.thumbnail ? (
                    <img
                      src={vid.thumbnail}
                      alt={vid.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-red-950/40">
                      <Youtube className="w-10 h-10 text-red-500" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0D1226] via-transparent to-transparent pointer-events-none" />

                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-red-600 text-white font-black text-[10px] shadow">
                    YouTube
                  </span>

                  <span className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </span>
                </div>

                <div className="p-2.5 bg-[#10162E] flex-1 flex flex-col justify-between">
                  <h3 className="font-display font-bold text-xs text-white line-clamp-2">
                    {vid.title}
                  </h3>
                  {vid.channelTitle && (
                    <span className="text-[10px] text-zinc-400 truncate mt-1">
                      {vid.channelTitle}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
