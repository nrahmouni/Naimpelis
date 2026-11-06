import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RefreshCw, Crown, AlertCircle, Sparkles } from 'lucide-react';
import { FloatingReaction, VideoState } from '../types';
import { formatTime, parseVideoUrl } from '../utils/videoParser';
import { YouTubeController, YouTubePlayer } from './YouTubePlayer';
import { VimeoController, VimeoPlayer } from './VimeoPlayer';

interface VideoPlayerContainerProps {
  videoState: VideoState;
  isHost: boolean;
  userName: string;
  userColor: string;
  reactions: FloatingReaction[];
  onStateChange: (action: 'play' | 'pause' | 'seek', time: number, isPlaying: boolean) => void;
  onSendReaction: (emoji: string) => void;
}

export const VideoPlayerContainer: React.FC<VideoPlayerContainerProps> = ({
  videoState,
  isHost,
  userName,
  userColor,
  reactions,
  onStateChange,
  onSendReaction,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playbackControllerRef = useRef<YouTubeController | VimeoController | null>(null);

  const [isPlaying, setIsPlaying] = useState(videoState.isPlaying);
  const [currentTime, setCurrentTime] = useState(videoState.currentTime);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [outOfSync, setOutOfSync] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const parsedVideo = parseVideoUrl(videoState.url);
  const controlsTimeoutRef = useRef<any>(null);

  // Sync effect when remote videoState updates
  useEffect(() => {
    if (parsedVideo.type === 'direct' && videoRef.current) {
      const vid = videoRef.current;
      const timeDiff = Math.abs(vid.currentTime - videoState.currentTime);

      if (timeDiff > 2) {
        vid.currentTime = videoState.currentTime;
      }

      if (videoState.isPlaying && vid.paused) {
        vid.play().catch(() => {});
        setIsPlaying(true);
      } else if (!videoState.isPlaying && !vid.paused) {
        vid.pause();
        setIsPlaying(false);
      }
    } else if (parsedVideo.type === 'youtube') {
      setIsPlaying(videoState.isPlaying);
      setCurrentTime(videoState.currentTime);
    } else {
      setIsPlaying(videoState.isPlaying);
      setCurrentTime(videoState.currentTime);
    }
  }, [videoState.lastUpdated, videoState.url, videoState.isPlaying, videoState.currentTime]);

  // Track HTML5 video progress
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);

      // Check drift from target host state if non-host
      if (!isHost && videoState.isPlaying) {
        const expectedTime = videoState.currentTime + (Date.now() - videoState.lastUpdated) / 1000;
        if (Math.abs(cur - expectedTime) > 3) {
          setOutOfSync(true);
        } else {
          setOutOfSync(false);
        }
      } else {
        setOutOfSync(false);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  // User playback actions
  const togglePlay = () => {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);

    if (parsedVideo.type === 'direct' && videoRef.current) {
      if (nextPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }

    onStateChange(nextPlaying ? 'play' : 'pause', currentTime, nextPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    onStateChange('seek', newTime, isPlaying);
  };

  const [resyncFeedback, setResyncFeedback] = useState(false);

  const handleSyncWithHost = () => {
    const elapsedSinceLastUpdate = videoState.isPlaying ? (Date.now() - videoState.lastUpdated) / 1000 : 0;
    const targetTime = Math.max(0, videoState.currentTime + elapsedSinceLastUpdate);

    if (parsedVideo.type === 'direct' && videoRef.current) {
      videoRef.current.currentTime = targetTime;
      if (videoState.isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    } else if ((parsedVideo.type === 'youtube' || parsedVideo.type === 'vimeo') && playbackControllerRef.current) {
      playbackControllerRef.current.seekTo(targetTime);
      if (videoState.isPlaying) playbackControllerRef.current.play();
      else playbackControllerRef.current.pause();
    } else if (iframeRef.current) {
      // Reload iframe if out of sync
      iframeRef.current.src = iframeRef.current.src;
    }

    setCurrentTime(targetTime);
    setIsPlaying(videoState.isPlaying);
    setOutOfSync(false);
    setResyncFeedback(true);
    setTimeout(() => setResyncFeedback(false), 2000);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const resetControlsTimeout = () => {
    setShowControls(true);
    clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3500);
  };

  const EMOJI_REACTIONS = ['🍿', '❤️', '🔥', '😂', '😮', '👏'];

  return (
    <div className="w-full flex flex-col bg-black">
      {/* Main Video Viewport */}
      <div
        ref={containerRef}
        onMouseMove={resetControlsTimeout}
        onTouchStart={resetControlsTimeout}
        className="relative w-full aspect-video bg-black overflow-hidden flex items-center justify-center group select-none shadow-2xl"
      >
        {/* Floating Reactions Overlay */}
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          {reactions.map((r) => (
            <div
              key={r.id}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-float-up flex items-center gap-1 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700/60 shadow-lg text-white text-sm font-semibold whitespace-nowrap"
              style={{
                left: `${30 + ((parseInt(r.id.replace(/\D/g, ''), 10) || 0) % 40)}%`,
              }}
            >
              <span className="text-xl">{r.emoji}</span>
              <span className="text-xs text-slate-300 font-normal">{r.senderName}</span>
            </div>
          ))}
        </div>

        {/* Video or Virtual Browser Element according to type */}
        {videoState.sourceType === 'iframe' || parsedVideo.type === 'iframe' ? (
          <div className="w-full h-full flex flex-col bg-slate-950">
            {/* Virtual Browser Mini Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-3 py-1.5 flex items-center justify-between text-xs text-slate-300 shrink-0 z-10">
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[11px] font-mono text-slate-400 truncate">
                  Navegador Virtual Sincronizado: {videoState.url}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    if (iframeRef.current) {
                      iframeRef.current.src = iframeRef.current.src;
                    }
                  }}
                  className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors text-[11px] flex items-center gap-1 font-medium"
                  title="Recargar página"
                >
                  <RefreshCw className="w-3 h-3" /> Recargar
                </button>
                <a
                  href={videoState.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-600 text-white text-[11px] font-medium transition-colors"
                >
                  Pestaña nueva ↗
                </a>
              </div>
            </div>

            {/* Embedded Web Page via Virtual Browser Proxy */}
            <iframe
              ref={iframeRef}
              src={parsedVideo.embedUrl}
              title={videoState.title || 'Navegador Virtual'}
              sandbox="allow-scripts allow-forms allow-popups allow-presentation"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              className="w-full flex-1 border-0 bg-white"
            />
          </div>
        ) : parsedVideo.type === 'youtube' ? (
          <YouTubePlayer
            videoId={parsedVideo.videoId}
            videoState={videoState}
            isHost={isHost}
            onStateChange={onStateChange}
            onController={(controller) => {
              playbackControllerRef.current = controller;
            }}
            onProgress={(time, nextDuration, playing) => {
              setCurrentTime(time);
              setDuration(nextDuration);
              setIsPlaying(playing);
              if (!isHost && videoState.isPlaying) {
                const expectedTime = videoState.currentTime + (Date.now() - videoState.lastUpdated) / 1000;
                setOutOfSync(Math.abs(time - expectedTime) > 3);
              } else {
                setOutOfSync(false);
              }
            }}
          />
        ) : parsedVideo.type === 'vimeo' ? (
          <VimeoPlayer
            videoId={parsedVideo.videoId}
            videoState={videoState}
            isHost={isHost}
            onStateChange={onStateChange}
            onController={(controller) => {
              playbackControllerRef.current = controller;
            }}
            onProgress={(time, nextDuration, playing) => {
              setCurrentTime(time);
              setDuration(nextDuration);
              setIsPlaying(playing);
              if (!isHost && videoState.isPlaying) {
                const expectedTime = videoState.currentTime + (Date.now() - videoState.lastUpdated) / 1000;
                setOutOfSync(Math.abs(time - expectedTime) > 3);
              } else {
                setOutOfSync(false);
              }
            }}
          />
        ) : parsedVideo.type === 'direct' ? (
          <video
            ref={videoRef}
            src={parsedVideo.embedUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            playsInline
            className="w-full h-full object-contain cursor-pointer"
            onClick={togglePlay}
          />
        ) : (
          <iframe
            ref={iframeRef}
            src={parsedVideo.embedUrl}
            title={videoState.title || 'YouTube Video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0"
          />
        )}

        {/* Host Control Badge & Manual Force Resync Action */}
        <div className="absolute top-3 left-3 z-20 pointer-events-auto flex items-center gap-2">
          {isHost ? (
            <span className="flex items-center gap-1 bg-amber-500/90 text-slate-950 font-bold text-[11px] px-2.5 py-1 rounded-full shadow-lg backdrop-blur-sm pointer-events-none">
              <Crown className="w-3.5 h-3.5" /> Control Host
            </span>
          ) : (
            <button
              onClick={handleSyncWithHost}
              className={`flex items-center gap-1 font-bold text-[11px] px-2.5 py-1 rounded-full shadow-lg backdrop-blur-sm transition-all active:scale-95 ${
                resyncFeedback
                  ? 'bg-emerald-600 text-white'
                  : outOfSync
                  ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                  : 'bg-slate-900/90 hover:bg-rose-600 text-slate-200 hover:text-white border border-slate-700/60'
              }`}
              title="Forzar re-sincronización con el anfitrión"
            >
              <RefreshCw className={`w-3 h-3 ${resyncFeedback ? 'animate-spin' : ''}`} />
              <span>{resyncFeedback ? '¡Sincronizado!' : 'Force Resync'}</span>
            </button>
          )}
        </div>

        {/* External portal launch button if movie link */}
        {videoState.originalPortalUrl && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            <a
              href={videoState.originalPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-rose-600 text-slate-200 hover:text-white border border-slate-700/70 text-[10px] font-semibold flex items-center gap-1 shadow-lg backdrop-blur-md transition-all active:scale-95"
            >
              <span>Abrir ficha</span>
              <span className="text-[11px]">↗</span>
            </a>
          </div>
        )}

        {/* Floating Play/Pause Center Tap Button */}
        {parsedVideo.type === 'direct' && (
          <div
            className={`absolute inset-0 flex items-center justify-center z-10 transition-opacity duration-300 pointer-events-none ${
              showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <button
              onClick={togglePlay}
              className="pointer-events-auto w-14 h-14 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-950/60 border border-white/20 active:scale-90 transition-transform"
            >
              {isPlaying ? <Pause className="w-7 h-7 fill-white" /> : <Play className="w-7 h-7 fill-white translate-x-0.5" />}
            </button>
          </div>
        )}

        {/* Controls Overlay for Direct Video */}
        {parsedVideo.type === 'direct' && (
          <div
            className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-6 flex flex-col gap-2 z-20 transition-opacity duration-300 ${
              showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Timeline Scrub Slider */}
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-rose-500 hover:accent-rose-400"
              />
            </div>

            {/* Controls Bar */}
            <div className="flex items-center justify-between text-xs text-slate-200">
              <div className="flex items-center gap-3">
                <button onClick={togglePlay} className="p-1 hover:text-white transition-colors">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <button onClick={toggleMute} className="p-1 hover:text-white transition-colors">
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <span className="font-mono text-[11px] text-slate-300">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!isHost && (
                  <button
                    onClick={handleSyncWithHost}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700"
                    title="Forzar sincronía"
                  >
                    <RefreshCw className="w-3 h-3" /> Sync
                  </button>
                )}

                <button onClick={toggleFullscreen} className="p-1 hover:text-white transition-colors">
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Reaction Emoji Toolbar below video */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400" /> Reacciones
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {EMOJI_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSendReaction(emoji)}
              className="w-9 h-8 rounded-xl bg-slate-800 hover:bg-slate-700/80 active:scale-125 border border-slate-700/50 flex items-center justify-center text-lg transition-transform"
              title={`Enviar ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Movie Details Banner when resolved */}
      {videoState.title && (
        <div className="bg-slate-950/90 border-b border-slate-800/80 px-3.5 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {videoState.poster && (
              <img
                src={videoState.poster}
                alt={videoState.title}
                className="w-7 h-10 object-cover rounded-md border border-slate-800 shrink-0 shadow-sm"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-100 truncate">
                  {videoState.title}
                </span>
                {videoState.releaseYear && (
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    · {videoState.releaseYear}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 line-clamp-1">
                {videoState.overview || 'Reproduciendo en sala compartida'}
              </p>
            </div>
          </div>

          {videoState.trailerUrl && (
            <div className="flex items-center gap-1 shrink-0">
              <a
                href={videoState.trailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 rounded-lg bg-rose-600/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold hover:bg-rose-600/30 transition-colors"
              >
                Tráiler oficial
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
