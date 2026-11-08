import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RefreshCw, Crown, AlertCircle } from 'lucide-react';
import { FloatingReaction, VideoState } from '../types';
import { formatTime, parseVideoUrl } from '../utils/videoParser';

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

  const [isPlaying, setIsPlaying] = useState(videoState.isPlaying);
  const [currentTime, setCurrentTime] = useState(videoState.currentTime);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const parsedVideo = parseVideoUrl(videoState.url);

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
    }
    setCurrentTime(videoState.currentTime);
    setIsPlaying(videoState.isPlaying);
  }, [videoState.lastUpdated, videoState.currentTime, videoState.isPlaying]);

  const handlePlayPause = () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);
    if (videoRef.current) {
      if (nextState) videoRef.current.play().catch(() => {});
      else videoRef.current.pause();
    }
    onStateChange(nextState ? 'play' : 'pause', currentTime, nextState);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
    onStateChange('seek', target, isPlaying);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group select-none"
    >
      {/* Floating Emoji Reactions Overlay */}
      <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            className="absolute animate-float-up text-3xl sm:text-4xl drop-shadow-lg"
            style={{
              left: `${15 + Math.random() * 70}%`,
              bottom: '10%',
            }}
          >
            <span>{reaction.emoji}</span>
          </div>
        ))}
      </div>

      {/* Video Content Rendering */}
      {parsedVideo.type === 'youtube' ? (
        <iframe
          ref={iframeRef}
          src={parsedVideo.embedUrl}
          title={videoState.title || 'YouTube Player'}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="w-full h-full border-0 bg-black"
        />
      ) : parsedVideo.type === 'vimeo' ? (
        <iframe
          src={parsedVideo.embedUrl}
          title={videoState.title || 'Vimeo Player'}
          allow="autoplay; fullscreen"
          allowFullScreen
          className="w-full h-full border-0 bg-black"
        />
      ) : parsedVideo.type === 'direct' ? (
        <video
          ref={videoRef}
          src={videoState.url}
          className="w-full h-full object-contain bg-black"
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration || 0);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            onStateChange('pause', duration, false);
          }}
          playsInline
        />
      ) : (
        <iframe
          src={videoState.url}
          title={videoState.title || 'External Player'}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          className="w-full h-full border-0 bg-black"
        />
      )}

      {/* Controls Overlay for Direct Videos */}
      {parsedVideo.type === 'direct' && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 flex flex-col gap-2 z-20">
          {/* Progress Bar */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-slate-700 accent-rose-600 rounded-lg cursor-pointer"
          />

          <div className="flex items-center justify-between text-white text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayPause}
                className="w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center text-white transition-transform active:scale-95"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>

              <button onClick={toggleMute} className="text-slate-300 hover:text-white">
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <span className="font-mono text-[11px] text-slate-300">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <button onClick={toggleFullscreen} className="text-slate-300 hover:text-white">
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
