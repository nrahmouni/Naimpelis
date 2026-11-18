import type express from 'express';
import { LruTtlCache } from '../utils/lruCache.ts';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export function parseYouTubeVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  );
  return m ? m[1] : null;
}

const ytSearchCache = new LruTtlCache<string, { videos: any[]; ts: number }>(150, 5 * 60 * 1000);

export function registerYouTubeCatalogRoutes(app: express.Express) {
  app.get('/api/catalog/youtube', async (req, res) => {
    const q = String(req.query.q || '').trim() || 'trailers peliculas 2025 hd';
    const cached = ytSearchCache.get(q.toLowerCase());
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return res.json({ success: true, videos: cached.videos });
    }

    try {
      // Support direct YouTube URL pasted into the search bar
      const directId = parseYouTubeVideoId(q);
      if (directId) {
        return res.json({
          success: true,
          videos: [
            {
              id: `yt-${directId}`,
              videoId: directId,
              title: 'Vídeo de YouTube Directo',
              channel: 'YouTube',
              duration: 'HD',
              views: '',
              thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
              url: `https://www.youtube.com/watch?v=${directId}`,
            },
          ],
        });
      }

      const ytRes = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
        {
          headers: {
            'User-Agent': CHROME_UA,
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(5500),
        }
      );
      if (!ytRes.ok) return res.json({ success: true, videos: [] });

      const html = await ytRes.text();
      const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
      if (!initMatch) return res.json({ success: true, videos: [] });

      const data = JSON.parse(initMatch[1]);
      const sections =
        data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
          ?.contents || [];

      const videos: any[] = [];
      for (const sec of sections) {
        const items = sec?.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const vr = item?.videoRenderer;
          if (!vr?.videoId) continue;
          const title = vr.title?.runs?.map((r: any) => r.text).join('') || 'YouTube Video';
          const channel =
            vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'YouTube';
          const duration = vr.lengthText?.simpleText || 'LIVE';
          const views = vr.shortViewCountText?.simpleText || vr.viewCountText?.simpleText || '';
          videos.push({
            id: `yt-${vr.videoId}`,
            videoId: vr.videoId,
            title,
            channel,
            duration,
            views,
            thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${vr.videoId}`,
          });
          if (videos.length >= 18) break;
        }
        if (videos.length >= 18) break;
      }

      ytSearchCache.set(q.toLowerCase(), { videos, ts: Date.now() });
      res.json({ success: true, videos });
    } catch (err) {
      console.warn('YouTube search error:', err);
      res.json({ success: true, videos: [] });
    }
  });
}
