import { VideoSourceType } from '../types';

export interface ParsedVideo {
  type: VideoSourceType;
  id: string;
  embedUrl: string;
}

export function parseVideoUrl(url: string): ParsedVideo {
  if (!url) {
    return { type: 'iframe', id: '', embedUrl: '' };
  }

  // YouTube match
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return {
      type: 'youtube',
      id: ytMatch[1],
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?enablejsapi=1&autoplay=1&controls=1&rel=0&modestbranding=1`,
    };
  }

  // Vimeo match
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/i);
  if (vimeoMatch && vimeoMatch[3]) {
    return {
      type: 'vimeo',
      id: vimeoMatch[3],
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[3]}?autoplay=1`,
    };
  }

  // Direct video file (.mp4, .webm, .m3u8, .ogg)
  if (/\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(url)) {
    return {
      type: 'direct',
      id: url,
      embedUrl: url,
    };
  }

  // Otherwise iframe/portal
  return {
    type: 'iframe',
    id: url,
    embedUrl: url,
  };
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
