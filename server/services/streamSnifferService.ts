import { logger } from '../utils/logger.ts';
import {
  isDisallowedHostnameSyntax,
  safeFetchFollowingRedirects,
  validateSafeOutboundUrl,
} from '../utils/ssrfGuard.ts';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const AD_DOMAIN_PATTERNS = [
  'doubleclick',
  'googlesyndication',
  'googleads',
  'adsterra',
  'popads',
  'popunder',
  'exoclick',
  'propeller',
  'onclickmega',
  'clickadu',
  'adcash',
  'hilltopads',
  'profitablecpmrate',
  'bet365',
  '1xbet',
  'trafficjunky',
  'adnxs',
];

function isBlockedAdUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return AD_DOMAIN_PATTERNS.some((domain) => lower.includes(domain));
}

function unpackDeanEdwardsBasic(html: string): string | null {
  const m = html.match(
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\.split\('\|'\)/
  );
  if (!m) return null;

  let [, payload, radixStr, countStr, dictStr] = m;
  const radix = parseInt(radixStr, 10);
  let count = parseInt(countStr, 10);
  const dict = dictStr.split('|');

  const toBase = (num: number, base: number): string => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return num < base ? chars[num] : toBase(Math.floor(num / base), base) + chars[num % base];
  };

  while (count--) {
    if (dict[count]) {
      const token = toBase(count, radix);
      payload = payload.replace(new RegExp(`\\b${token}\\b`, 'g'), dict[count]);
    }
  }
  return payload;
}

export interface SniffedStreamResult {
  streamUrl: string;
  referer: string;
  isDirectMp4: boolean;
}

/**
 * Lightweight, Puppeteer-free HTTP stream sniffer for Node 22-slim containers.
 * Follows redirects, unwraps nested iframes up to 3 hops, unpacks Dean Edwards JS,
 * and extracts .m3u8 or .mp4 URLs directly without spawning Chromium.
 */
export async function sniffStreamViaHttp(
  rawUrl: string,
  initialReferer?: string
): Promise<SniffedStreamResult | null> {
  let currentUrl = rawUrl.trim();
  let currentReferer = initialReferer || currentUrl;

  for (let hop = 0; hop < 3; hop += 1) {
    if (!currentUrl || !/^https?:\/\//i.test(currentUrl) || isBlockedAdUrl(currentUrl)) {
      return null;
    }

    let parsedCurrent: URL;
    try {
      parsedCurrent = new URL(currentUrl);
    } catch {
      return null;
    }
    if (
      (parsedCurrent.protocol !== 'http:' && parsedCurrent.protocol !== 'https:') ||
      parsedCurrent.username ||
      parsedCurrent.password ||
      isDisallowedHostnameSyntax(parsedCurrent.hostname)
    ) {
      return null;
    }

    if (/\.(m3u8)(\?|$)/i.test(currentUrl)) {
      return { streamUrl: currentUrl, referer: currentReferer, isDirectMp4: false };
    }
    if (/\.(mp4)(\?|$)/i.test(currentUrl)) {
      return { streamUrl: currentUrl, referer: currentReferer, isDirectMp4: true };
    }

    const urlSafety = await validateSafeOutboundUrl(currentUrl);
    if (!urlSafety.safe) {
      return null;
    }

    try {
      const { response: resp, finalUrl } = await safeFetchFollowingRedirects(currentUrl, {
        headers: {
          'User-Agent': CHROME_UA,
          Referer: currentReferer,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(6500),
      });

      const contentType = String(resp.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('mpegurl') || finalUrl.includes('.m3u8')) {
        return { streamUrl: finalUrl, referer: currentReferer, isDirectMp4: false };
      }
      if (contentType.includes('video/mp4') || /\.mp4(\?|$)/i.test(finalUrl)) {
        return { streamUrl: finalUrl, referer: currentReferer, isDirectMp4: true };
      }

      const rawHtml = await resp.text();
      const unpacked = unpackDeanEdwardsBasic(rawHtml) || '';
      const combined = `${rawHtml}\n${unpacked}`;

      const m3u8Match = combined.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
      if (m3u8Match && !isBlockedAdUrl(m3u8Match[0])) {
        return {
          streamUrl: m3u8Match[0].replace(/\\u002F/g, '/').replace(/\\/g, ''),
          referer: finalUrl,
          isDirectMp4: false,
        };
      }

      const mp4Match = combined.match(/https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/i);
      if (mp4Match && !isBlockedAdUrl(mp4Match[0])) {
        return {
          streamUrl: mp4Match[0].replace(/\\u002F/g, '/').replace(/\\/g, ''),
          referer: finalUrl,
          isDirectMp4: true,
        };
      }

      const iframeMatch = combined.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
      if (iframeMatch && !isBlockedAdUrl(iframeMatch[1]) && iframeMatch[1] !== currentUrl) {
        currentReferer = finalUrl;
        currentUrl = iframeMatch[1];
        continue;
      }

      break;
    } catch (err) {
      logger.debug({ err, url: currentUrl }, 'http_stream_sniff_hop_failed');
      break;
    }
  }

  return null;
}

/**
 * Lightweight Virtual Cloud Browser session metadata (runs without headless Chromium).
 * Keeps room state synchronized and provides a safe embed/direct-link preview URL.
 */
export interface CloudSessionLite {
  url: string;
  title: string;
  isLoading: boolean;
  detectedStreamUrl?: string | null;
}

export async function resolveCloudSessionLite(targetUrl: string): Promise<CloudSessionLite> {
  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const sniffed = await sniffStreamViaHttp(normalizedUrl);
  let pageTitle = normalizedUrl;
  try {
    const parsed = new URL(normalizedUrl);
    pageTitle = parsed.hostname.replace(/^www\./, '');
  } catch {
    // keep raw url
  }

  return {
    url: normalizedUrl,
    title: pageTitle,
    isLoading: false,
    detectedStreamUrl: sniffed ? sniffed.streamUrl : null,
  };
}
