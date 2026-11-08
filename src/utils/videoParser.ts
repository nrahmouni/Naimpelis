import { VideoSourceType } from '../types';

export interface ParsedVideo {
  type: VideoSourceType;
  videoId: string;
  embedUrl: string;
  originalUrl: string;
}

export function parseVideoUrl(url: string): ParsedVideo {
  const cleanUrl = url.trim();

  // YouTube match (supports watch?v=, youtu.be/, shorts/, embed/, with ?t= or &t= timestamp)
  const ytMatch = cleanUrl.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    // Check for start time if present in URL
    const timeMatch = cleanUrl.match(/[?&]t=(\d+)s?/i);
    const startParam = timeMatch ? `&start=${timeMatch[1]}` : '';

    return {
      type: 'youtube',
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1${startParam}`,
      originalUrl: cleanUrl,
    };
  }

  // Vimeo match
  const vimeoMatch = cleanUrl.match(/(?:vimeo\.com\/)(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/\d+\/video\/|video\/|)(\d+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    const videoId = vimeoMatch[1];
    return {
      type: 'vimeo',
      videoId,
      embedUrl: `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0`,
      originalUrl: cleanUrl,
    };
  }

  // Direct video file extensions (.mp4, .webm, .ogv, .m4v, .mov)
  const isDirectVideo = /\.(mp4|webm|ogv|m4v|mov)(\?.*)?$/i.test(cleanUrl) || 
    cleanUrl.startsWith('blob:') || 
    cleanUrl.includes('commondatastorage.googleapis.com');
  if (isDirectVideo) {
    return {
      type: 'direct',
      videoId: cleanUrl,
      embedUrl: cleanUrl,
      originalUrl: cleanUrl,
    };
  }

  // Dailymotion match
  const dmMatch = cleanUrl.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/i);
  if (dmMatch && dmMatch[1]) {
    return {
      type: 'iframe',
      videoId: dmMatch[1],
      embedUrl: `https://www.dailymotion.com/embed/video/${dmMatch[1]}?autoplay=1`,
      originalUrl: cleanUrl,
    };
  }

  // Generic fallback: route external web pages through virtual browser proxy so they can be embedded
  if (/^https?:\/\//i.test(cleanUrl)) {
    return {
      type: 'iframe',
      videoId: cleanUrl,
      embedUrl: `/api/proxy-web?url=${encodeURIComponent(cleanUrl)}`,
      originalUrl: cleanUrl,
    };
  }

  return {
    type: 'direct',
    videoId: cleanUrl,
    embedUrl: cleanUrl,
    originalUrl: cleanUrl,
  };
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
