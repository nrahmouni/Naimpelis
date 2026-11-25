/**
 * @module server/services/mediasetLiveService
 * @description Resolves live Mediaset España / Mediaset Infinity HLS streams
 * (Energy, Be Mad, FDF, Divinity, Telecinco, Cuatro) through direct Akamai/Origin CDN
 * and Mediaset Infinity API endpoints, automatically honoring Spain VPN Gateway routing.
 */
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA } from '../extractors/httpHelpers.ts';

export interface MediasetChannelSpec {
  slug: 'energy' | 'bemad' | 'fdf' | 'divinity' | 'telecinco' | 'cuatro';
  callSign: string;
  pageUrl: string;
  candidateHlsUrls: string[];
}

export const MEDIASET_CHANNEL_SPECS: Record<string, MediasetChannelSpec> = {
  energy: {
    slug: 'energy',
    callSign: 'EN',
    pageUrl: 'https://www.mediasetinfinity.es/directo/energy/',
    candidateHlsUrls: [
      'https://directos.energytv.es/orilinear03/live/linear03/main/main.isml/main-audio_spa=128000-video=1500000.m3u8',
      'https://directos.energytv.es/orilinear03/live/linear03/main/main.isml/master.m3u8',
    ],
  },
  bemad: {
    slug: 'bemad',
    callSign: 'BM',
    pageUrl: 'https://www.mediasetinfinity.es/directo/bemad/',
    candidateHlsUrls: [
      'https://directos.bemad.es/orilinear02/live/linear02/main/main.isml/main-audio_spa=128000-video=1500000.m3u8',
      'https://directos.bemad.es/orilinear02/live/linear02/main/main.isml/master.m3u8',
    ],
  },
  divinity: {
    slug: 'divinity',
    callSign: 'DV',
    pageUrl: 'https://www.mediasetinfinity.es/directo/divinity/',
    candidateHlsUrls: [
      'https://directos.divinity.es/orilinear04/live/linear04/main/main.isml/main-audio_spa=128000-video=1500000.m3u8',
      'https://directos.divinity.es/orilinear04/live/linear04/main/main.isml/master.m3u8',
    ],
  },
  fdf: {
    slug: 'fdf',
    callSign: 'FDF',
    pageUrl: 'https://www.mediasetinfinity.es/directo/fdf/',
    candidateHlsUrls: [
      'https://mdslivehls-i.akamaihd.net/hls/live/571650/fdf/bitrate_1.m3u8',
      'https://directos.fdf.es/orilinear01/live/linear01/main/main.isml/master.m3u8',
    ],
  },
  telecinco: {
    slug: 'telecinco',
    callSign: 'T5',
    pageUrl: 'https://www.mediasetinfinity.es/directo/telecinco/',
    candidateHlsUrls: [
      'https://livehlsdai-i.akamaihd.net/hls/live/571640/telecinco/bitrate_1.m3u8',
    ],
  },
  cuatro: {
    slug: 'cuatro',
    callSign: 'C4',
    pageUrl: 'https://www.mediasetinfinity.es/directo/cuatro/',
    candidateHlsUrls: [
      'https://livehlsdai-i.akamaihd.net/hls/live/571643/cuatro/bitrate_1.m3u8',
    ],
  },
};

function detectMediasetSlug(input: string): MediasetChannelSpec | null {
  const low = String(input || '').trim().toLowerCase();
  for (const spec of Object.values(MEDIASET_CHANNEL_SPECS)) {
    if (
      low === spec.slug ||
      low.includes(`mediasetinfinity.es/directo/${spec.slug}`) ||
      low.includes(`directos.${spec.slug}`) ||
      (spec.slug === 'energy' && low.includes('energytv.es')) ||
      low.includes(`/${spec.slug}/`)
    ) {
      return spec;
    }
  }
  return null;
}

export async function resolveMediasetLiveHlsUrl(
  sourceUrlOrSlug: string
): Promise<{ streamUrl: string; referer: string } | null> {
  const spec = detectMediasetSlug(sourceUrlOrSlug);
  const candidates = spec ? [...spec.candidateHlsUrls] : [];
  if (/\.m3u8/i.test(sourceUrlOrSlug) && !candidates.includes(sourceUrlOrSlug)) {
    candidates.unshift(sourceUrlOrSlug);
  }
  const referer = spec?.pageUrl || 'https://www.mediasetinfinity.es/';

  // 1. Try known origin / Akamai candidates first (honors active Spain VPN Gateway automatically)
  for (const cand of candidates) {
    try {
      const resp = await streamingFetch(cand, {
        headers: {
          'User-Agent': CHROME_UA,
          Referer: referer,
          Origin: 'https://www.mediasetinfinity.es',
          Accept: '*/*',
        },
        timeoutMs: 4200,
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('#EXTM3U')) {
          return { streamUrl: resp.url || cand, referer };
        }
      } else {
        await resp.body?.cancel?.().catch(() => {});
      }
    } catch {
      // try next candidate or page discovery
    }
  }

  // 2. Live SSR discovery on mediasetinfinity.es/directo/<slug>/
  if (spec) {
    try {
      const pageResp = await streamingFetch(spec.pageUrl, {
        headers: {
          'User-Agent': CHROME_UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
        timeoutMs: 4500,
      });
      if (pageResp.ok) {
        const html = await pageResp.text();
        const foundUrls = html.match(/https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*/gi) || [];
        for (const u of foundUrls) {
          const clean = u.replace(/\\u002F/g, '/').replace(/\\/g, '');
          if (!clean.includes('.m3u8')) continue;
          try {
            const probe = await streamingFetch(clean, {
              headers: {
                'User-Agent': CHROME_UA,
                Referer: referer,
                Origin: 'https://www.mediasetinfinity.es',
              },
              timeoutMs: 3800,
            });
            if (probe.ok) {
              const txt = await probe.text();
              if (txt.includes('#EXTM3U')) {
                return { streamUrl: probe.url || clean, referer };
              }
            } else {
              await probe.body?.cancel?.().catch(() => {});
            }
          } catch {
            // continue scanning found URLs
          }
        }
      }
    } catch {
      // ignore SSR fallback errors
    }
  }

  return null;
}
