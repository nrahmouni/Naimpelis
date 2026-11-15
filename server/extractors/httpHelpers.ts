import { execFile } from 'child_process';
import http2 from 'http2';
import zlib from 'zlib';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { LruTtlCache } from '../utils/lruCache.ts';

export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const TDT_DVB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

export const CN_IPTV_UA = 'okhttp/4.12.0';

export const AD_DOMAIN_PATTERNS = [
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
  'capitalhospitals',
  'llvpn',
  'xadsmart',
  'laguneelemong',
  'mbuqxdxsra',
  'acscdn',
  'aclib',
  'tagivi',
  'unfortunatelyejectinflected',
  'lahochat',
  'disable-devtool',
  'lcban',
  'chaldeedaws',
  'sewinramjets',
  'directdexchange',
  'bet365',
  '1xbet',
  'trafficjunky',
  'adnxs',
];

export interface TrackRecord {
  id: string;
  label: string;
  lang: string;
  quality?: string;
  sourceUrl: string;
  referer?: string;
  resolverType:
    | 'movidy_embed'
    | 'vidhide_hls'
    | 'vest_hls'
    | 'embed_sniff'
    | 'bingetrix_en'
    | 'sports_channel'
    | 'tdt_hls'
    | 'direct_hls'
    | 'direct_mp4'
    | 'youtube'
    | 'web_embed'
    | 'cloud_browser';
  resolvedStreamUrl?: string;
  health?: {
    status: 'up' | 'degraded' | 'down' | 'unknown';
    latencyMs?: number;
    failCount?: number;
    checkedAt?: number;
    statusCode?: number;
  };
}

export interface SubtitleTrackOutput {
  id: string;
  label: string;
  lang: string;
  url: string;
}

export interface ExtractedStreamResult {
  success: boolean;
  mode: 'hls' | 'direct' | 'youtube' | 'embed' | 'cloud';
  streamUrl: string;
  rawStreamUrl?: string;
  referer?: string;
  youtubeId?: string;
  title?: string;
  poster?: string;
  backdrop?: string;
  tracks?: TrackRecord[];
  subtitles?: SubtitleTrackOutput[];
  requestedLang?: string;
  resolvedLang?: string;
  resolvedLabel?: string;
  languageFallbackUsed?: boolean;
  availableLanguages?: string[];
  requestId?: string;
  expiresAt: number;
}

export function isBlockedAdUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return AD_DOMAIN_PATTERNS.some((domain) => lower.includes(domain));
}

export function isDvbHeadendStream(urlStr: string): boolean {
  return urlStr.includes('90.163.85.113:8093');
}

export function isChineseIptvStream(urlStr: string): boolean {
  const lower = String(urlStr || '').toLowerCase();
  return (
    lower.includes('38.75.136.137') ||
    lower.includes('63.141.230.178') ||
    lower.includes('120.76.248.139') ||
    lower.includes('153.0.171.163') ||
    lower.includes('223.112.114.228') ||
    lower.includes('192.187.98.98') ||
    lower.includes('198.204.') ||
    lower.includes('204.12.') ||
    lower.includes('gmxw.7766.org') ||
    lower.includes('jdshipin.com') ||
    lower.includes('epg.pw/stream/') ||
    lower.includes('miguvideo.com') ||
    lower.includes('/gslb/dsdq') ||
    lower.includes('/gslb/zbdq') ||
    lower.includes('/live/bfgd/')
  );
}

export function getPreferredUpstreamUa(urlStr: string): string {
  if (isDvbHeadendStream(urlStr)) return TDT_DVB_UA;
  if (isChineseIptvStream(urlStr)) return CN_IPTV_UA;
  return CHROME_UA;
}

export function sanitizeEmbedScript(rawJs: string, _scriptUrl = ''): string {
  let code = String(rawJs || '');
  if (!code) return code;

  // 1. Neutralize VidFast / Next.js chunk sandbox check that replaces document.body with "Please Disable Sandbox"
  code = code
    .replace(
      /if\s*\(\s*!\s*([a-zA-Z_$][\w$]*)\.current\s*&&\s*\(\s*\1\.current\s*=\s*!0\s*,\s*window\.self\s*!==\s*window\.top\s*\)\s*\)/g,
      'if(false)'
    )
    .replace(
      /document\.body\.innerHTML\s*=\s*(['"`])(?:(?!\1).)*?Please Disable Sandbox(?:(?!\1).)*?\1/gi,
      'void 0'
    )
    .replace(
      /document\.body\.innerHTML\s*=\s*(['"`])(?:(?!\1).)*?Sandbox(?:\s+is)?\s+not\s+allowed(?:(?!\1).)*?\1/gi,
      'void 0'
    )
    .replace(/\.hasAttribute\(\s*(['"`])sandbox\1\s*\)/g, '&&false')
    .replace(
      /function\s+opaqueOrigin\s*\(\s*\)\s*\{/g,
      'function opaqueOrigin(){return false;'
    )
    .replace(
      /function\s+sandboxVerdict\s*\(\s*\)\s*\{/g,
      "function sandboxVerdict(){return 'clean';"
    )
    .replace(/function\s+sandboxDeny\s*\(\s*\)\s*\{/g, 'function sandboxDeny(){return;')
    .replace(/function\s+popupsBlocked\s*\(\s*\)\s*\{/g, 'function popupsBlocked(){return false;}')
    .replace(
      /function\s+isReallySandboxed\s*\(\s*\)\s*\{/g,
      'function isReallySandboxed(){return false;}'
    )
    .replace(
      /function\s+Sandboxed\s*\(\s*\)\s*\{[\s\S]{0,120}?\}/gi,
      'function Sandboxed(){return false;}'
    );

  return code;
}

export function sanitizeEmbedHtml(rawHtml: string, baseHref: string): string {
  let html = String(rawHtml || '');

  // Determine canonical <base href>: preserve & resolve any existing <base href="..."> (e.g. /pl/ on vidsrc.buzz, / on videm.buzz)
  let resolvedBaseHref = baseHref;
  const existingBaseMatch = html.match(/<base\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i);
  if (existingBaseMatch?.[1]) {
    try {
      resolvedBaseHref = new URL(existingBaseMatch[1], baseHref).href;
    } catch {
      resolvedBaseHref = baseHref;
    }
  }
  html = html.replace(/<base\b[^>]*>/gi, '');

  // 1. Strip CSP meta tags that can restrict same-origin proxied frames
  html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

  const isEmbedHostHostname = (host: string): boolean =>
    /(^|\.)(vidfast\.[a-z.]+|vidlink\.pro|vidsrc\.(buzz|sh|to|me|cc|xyz|in|pm)|videm\.buzz|vidrock\.[a-z.]+|vidnest\.[a-z.]+|moviesapi\.[a-z.]+|vsembed\.[a-z.]+|2embed\.cc|streamsrcs\.2embed\.cc)$/i.test(
      host
    );

  // 2. Remove external ad / popunder / anti-devtool scripts & proxy embed-host player/chunk scripts via /api/embed-script
  html = html.replace(
    /<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/script>/gi,
    (full, preAttrs, src, postAttrs, tail) => {
      const rawSrc = String(src || '');
      if (isBlockedAdUrl(rawSrc) || /adplox|whos\.amung\.us/i.test(rawSrc)) {
        return '<!-- blocked ad script -->';
      }
      try {
        const absUrl = new URL(rawSrc, resolvedBaseHref).href;
        const parsed = new URL(absUrl);
        if (
          isEmbedHostHostname(parsed.hostname) &&
          /\/_next\/static\/chunks\/|player|embed|sandbox/i.test(parsed.pathname)
        ) {
          const proxiedSrc = `/api/embed-script?url=${encodeURIComponent(
            absUrl
          )}&referer=${encodeURIComponent(resolvedBaseHref)}`;
          const cleanedAttrs = `${preAttrs} ${postAttrs}`
            .replace(/\s+integrity\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s+crossorigin(?:\s*=\s*["'][^"']*["'])?/gi, '')
            .trim();
          return `<script ${cleanedAttrs} src="${proxiedSrc}">${tail}</script>`;
        }
      } catch {
        // leave non-URL script src as-is
      }
      return full;
    }
  );

  // 3. Remove small pure ad/popunder inline scripts, and surgically disarm sandbox detectors in any player script
  html = html.replace(/<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi, (_full, attrs, body) => {
    let code = String(body || '');
    const isLargePlayerScript =
      code.length > 4000 ||
      /\bvar\s+Q\s*=|Hls\b|playbtnx|iframesrc|api\.php|__next_f/i.test(code);

    if (
      !isLargePlayerScript &&
      /aclib|adcash|popunder|disabledevtool|unfortunatelyejectinflected|lahochat|lcban|tagivi|refcheck\.php|onclick\s*=\s*["']?window\.open/i.test(
        code
      )
    ) {
      return '<!-- blocked inline ad script -->';
    }

    // Disarm top-window redirect & sandbox self-blocking detectors inside player scripts (vidsrc.buzz / videm.buzz / 2embed.cc / vidfast)
    code = sanitizeEmbedScript(code, baseHref)
      .replace(/if\s*\(\s*Sandboxed\s*\(\s*\)\s*\)\s*throw\s*[^;]+;/gi, '')
      .replace(/if\s*\(\s*SB\s*===\s*['"]sandboxed['"]\s*\)/g, 'if(false)')
      .replace(/SB\s*=\s*['"]sandboxed['"]\s*;/g, "SB='clean';")
      .replace(/if\s*\(\s*isReallySandboxed\s*\(\s*\)\s*\)/g, 'if(false)')
      .replace(/if\s*\(\s*popupsBlocked\s*\(\s*\)\s*\)/g, 'if(false)')
      .replace(/Sandbox(?: is)? not allowed/gi, 'Stream ready')
      .replace(/Remove the sandbox attribute from the iframe to play the video\.?/gi, '')
      .replace(
        /if\s*\(\s*window\s*===\s*window\.top\s*\)\s*\{[\s\S]{0,200}?window\.location\.replace\([^)]*\)\s*;?\s*\}/gi,
        ''
      );

    return `<script${attrs}>${code}</script>`;
  });

  // 4. Strip sandbox error overlay markup & adplox tracking widgets
  html = html
    .replace(/<div\b[^>]*id\s*=\s*["']sbxErr["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<a\b[^>]+href\s*=\s*["']https?:\/\/adplox\.com[^"']*["'][^>]*>/gi, '<a href="javascript:void(0)">')
    .replace(/<img\b[^>]+src\s*=\s*["']https?:\/\/whos\.amung\.us[^"']*["'][^>]*>/gi, '');

  // 5. Route nested embed frames (e.g. 2embed.cc -> vidsrc.buzz / videm.buzz / streamsrcs) through /api/embed-proxy
  const toProxiedNestedEmbed = (urlVal: string): string => {
    const extraRef = /videm\.buzz/i.test(urlVal)
      ? `&referer=${encodeURIComponent('https://vidsrc.buzz/')}`
      : '';
    return `/api/embed-proxy?url=${encodeURIComponent(urlVal)}${extraRef}`;
  };
  html = html
    .replace(
      /(data-src\s*=\s*["'])(https?:\/\/(?:www\.)?(?:vidsrc\.buzz|videm\.buzz|streamsrcs\.2embed\.cc)\/[^"']+)(["'])/gi,
      (_m, pre, urlVal, post) => `${pre}${toProxiedNestedEmbed(urlVal)}${post}`
    )
    .replace(
      /(go\s*\(\s*['"])(https?:\/\/(?:www\.)?(?:vidsrc\.buzz|videm\.buzz|streamsrcs\.2embed\.cc)\/[^'"]+)(['"]\s*\))/gi,
      (_m, pre, urlVal, post) => `${pre}${toProxiedNestedEmbed(urlVal)}${post}`
    );

  // 6. Neutralize top-frame / sandbox checks, popup hijacks, and CORS-blocked upstream API/HLS calls via same-origin /api/embed-fetch & /api/embed-script
  const safeBaseLit = resolvedBaseHref.replace(/"/g, '&quot;');
  const guardScript = `<base href="${safeBaseLit}">
<style>#sbxErr,#lhb{display:none!important;visibility:hidden!important;pointer-events:none!important;}</style>
<script>(function(){
  var __BASE=${JSON.stringify(resolvedBaseHref)};
  var __PAGE=${JSON.stringify(baseHref)};
  var __BASE_ORIGIN='';
  try{__BASE_ORIGIN=new URL(__BASE).origin;}catch(e){}
  var __EMBED_HOST_RE=/(^|\\.)(vidfast\\.[a-z.]+|vidlink\\.pro|vidsrc\\.(buzz|sh|to|me|cc|xyz|in|pm)|videm\\.buzz|vidrock\\.[a-z.]+|vidnest\\.[a-z.]+|moviesapi\\.[a-z.]+|vsembed\\.[a-z.]+|2embed\\.cc|goodstream\\.cc|relay\\.videm\\.buzz)$/i;
  function __toRelay(raw){
    try{
      if(raw===undefined||raw===null)return raw;
      var s=String(raw);
      if(!s||s.indexOf('blob:')===0||s.indexOf('data:')===0||s.indexOf('javascript:')===0)return s;
      if(s.indexOf(location.origin+'/api/')===0||s.indexOf('/api/')===0)return s;
      var abs=new URL(s,document.baseURI||__BASE).href;
      var u=new URL(abs);
      if(u.origin===location.origin&&u.pathname.indexOf('/api/')===0)return s;
      var isEmbedHost=__EMBED_HOST_RE.test(u.hostname);
      var isApiOrStream=/(\\/api\\.php|\\/_stream\\b|\\/p\\/muh\\/|\\.m3u8(\\?|$))/i.test(u.pathname);
      if(u.origin===__BASE_ORIGIN||isEmbedHost||isApiOrStream){
        return location.origin+'/api/embed-fetch?url='+encodeURIComponent(abs)+'&referer='+encodeURIComponent(__PAGE);
      }
      return abs;
    }catch(e){return raw;}
  }
  function __toScriptRelay(raw){
    try{
      if(!raw)return raw;
      var s=String(raw);
      if(s.indexOf('blob:')===0||s.indexOf('data:')===0||s.indexOf('/api/embed-script')!==-1)return s;
      var abs=new URL(s,document.baseURI||__BASE).href;
      var u=new URL(abs);
      if((u.origin===__BASE_ORIGIN||__EMBED_HOST_RE.test(u.hostname))&&/\\/_next\\/static\\/chunks\\/|player|embed|sandbox/i.test(u.pathname)){
        return location.origin+'/api/embed-script?url='+encodeURIComponent(abs)+'&referer='+encodeURIComponent(__PAGE);
      }
      return raw;
    }catch(e){return raw;}
  }
  try{
    Object.defineProperty(Document.prototype,'domain',{configurable:true,get:function(){return location.hostname;},set:function(){}});
  }catch(e){}
  try{
    Object.defineProperty(document,'domain',{configurable:true,get:function(){return location.hostname;},set:function(){}});
  }catch(e){}
  try{
    var __origCreateEl=Document.prototype.createElement;
    Document.prototype.createElement=function(tag){
      var el=__origCreateEl.apply(this,arguments);
      try{
        var tl=String(tag||'').toLowerCase();
        if(tl==='object'){
          var __objData='';
          var __objOnLoad=null;
          var __objOnErr=null;
          Object.defineProperty(el,'onerror',{configurable:true,get:function(){return __objOnErr;},set:function(fn){__objOnErr=fn;}});
          Object.defineProperty(el,'onload',{configurable:true,get:function(){return __objOnLoad;},set:function(fn){__objOnLoad=fn;}});
          var __dataDesc=Object.getOwnPropertyDescriptor(HTMLObjectElement.prototype,'data');
          if(__dataDesc&&__dataDesc.set){
            Object.defineProperty(el,'data',{configurable:true,get:function(){return __objData||(__dataDesc.get?__dataDesc.get.call(this):'');},set:function(v){__objData=String(v||'');if(__objData.indexOf('data:application/pdf')===0){setTimeout(function(){if(typeof __objOnLoad==='function')try{__objOnLoad();}catch(e){}},20);return;}return __dataDesc.set.call(this,v);}});
          }
        }
      }catch(e){}
      return el;
    };
  }catch(e){}
  try{
    var __sd=Object.getOwnPropertyDescriptor(window.HTMLScriptElement&&window.HTMLScriptElement.prototype,'src');
    if(__sd&&__sd.set&&__sd.get){
      Object.defineProperty(window.HTMLScriptElement.prototype,'src',{
        configurable:true,
        get:function(){return __sd.get.call(this);},
        set:function(v){return __sd.set.call(this,__toScriptRelay(v));}
      });
    }
    var __origSetAttr=Element.prototype.setAttribute;
    Element.prototype.setAttribute=function(name,val){
      var n=String(name||'').toLowerCase();
      if(this.tagName==='SCRIPT'&&n==='integrity')return;
      if(this.tagName==='SCRIPT'&&n==='src')return __origSetAttr.call(this,name,__toScriptRelay(val));
      if(this.tagName==='OBJECT'&&n==='data'&&String(val||'').indexOf('data:application/pdf')===0)return;
      return __origSetAttr.apply(this,arguments);
    };
  }catch(e){}
  if(typeof window.fetch==='function'){
    var __origFetch=window.fetch.bind(window);
    window.fetch=function(input,init){
      try{
        if(typeof input==='string'||input instanceof URL){
          return __origFetch(__toRelay(String(input)),init);
        }
        if(input&&typeof input==='object'&&typeof input.url==='string'){
          var nextUrl=__toRelay(input.url);
          if(nextUrl!==input.url){
            return __origFetch(new Request(nextUrl,input),init);
          }
        }
      }catch(e){}
      return __origFetch(input,init);
    };
  }
  if(window.XMLHttpRequest&&window.XMLHttpRequest.prototype){
    var __origXhrOpen=window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open=function(method,url){
      var args=Array.prototype.slice.call(arguments);
      if(args.length>=2&&typeof args[1]==='string'){
        args[1]=__toRelay(args[1]);
      }
      return __origXhrOpen.apply(this,args);
    };
  }
  try{
    var __td=Object.getOwnPropertyDescriptor(window.HTMLTrackElement&&window.HTMLTrackElement.prototype,'src');
    if(__td&&__td.set&&__td.get){
      Object.defineProperty(window.HTMLTrackElement.prototype,'src',{
        configurable:true,
        get:function(){return __td.get.call(this);},
        set:function(v){return __td.set.call(this,__toRelay(v));}
      });
    }
  }catch(e){}
  try{Object.defineProperty(window,'open',{value:function(){return null;},writable:false,configurable:false});}catch(e){window.open=function(){return null;};}
  try{window.Sandboxed=function(){return false;};window.isReallySandboxed=function(){return false;};window.sandboxVerdict=function(){return 'clean';};window.opaqueOrigin=function(){return false;};window.popupsBlocked=function(){return false;};}catch(e){}
  try{
    var __notifiedPlay=false;
    document.addEventListener('playing',function(){
      if(__notifiedPlay)return;
      __notifiedPlay=true;
      try{window.parent.postMessage({source:'naim-embed-proxy',event:'playing'},'*');}catch(e){}
    },true);
    document.addEventListener('loadeddata',function(){
      try{window.parent.postMessage({source:'naim-embed-proxy',event:'loadeddata'},'*');}catch(e){}
    },true);
  }catch(e){}
  document.addEventListener('click',function(ev){
    var el=ev.target;
    while(el&&el!==document){
      if(el.tagName==='A'&&el.getAttribute('target')==='_blank'){
        ev.preventDefault();ev.stopPropagation();return false;
      }
      el=el.parentElement;
    }
  },true);
})();</script>`;

  if (/<head\b[^>]*>/i.test(html)) {
    html = html.replace(/<head\b[^>]*>/i, (m) => `${m}\n${guardScript}`);
  } else {
    html = `${guardScript}\n${html}`;
  }
  return html;
}

export function unwrapRelaySegmentUrl(
  rawSegUrl: string,
  fallbackReferer: string
): { url: string; referer: string } {
  try {
    const parsed = new URL(rawSegUrl);
    const wrappedU = parsed.searchParams.get('u');
    if (wrappedU && /^https?:\/\//i.test(wrappedU)) {
      const wrappedR = parsed.searchParams.get('r');
      return {
        url: wrappedU,
        referer: wrappedR && /^https?:\/\//i.test(wrappedR) ? wrappedR : fallbackReferer,
      };
    }
  } catch {
    // ignore
  }
  return { url: rawSegUrl, referer: fallbackReferer };
}

export function rewriteVidsrcBuzzM3u8(
  manifestText: string,
  baseUrl: string,
  embedOrigin: string
): { rewritten: string; firstSegment?: { url: string; referer: string } } {
  const lines = String(manifestText || '').split(/\r?\n/);
  let firstSegment: { url: string; referer: string } | undefined;
  let expectingVariant = false;

  const rewrittenLines = lines.map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    if (trimmed.startsWith('#')) {
      if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
        expectingVariant = true;
      }
      if (trimmed.includes('URI="')) {
        return raw.replace(/URI="([^"]+)"/g, (_m, uriVal) => {
          try {
            const absUri = new URL(uriVal, baseUrl).href;
            const unwrapped = unwrapRelaySegmentUrl(absUri, embedOrigin);
            if (trimmed.startsWith('#EXT-X-MEDIA') || absUri.includes('.m3u8')) {
              return `URI="${buildHlsProxyUrl(unwrapped.url, unwrapped.referer)}"`;
            }
            return `URI="${buildTsProxyUrl(unwrapped.url, unwrapped.referer)}"`;
          } catch {
            return _m;
          }
        });
      }
      return raw;
    }

    try {
      const absUrl = new URL(trimmed, baseUrl).href;
      const unwrapped = unwrapRelaySegmentUrl(absUrl, embedOrigin);
      const isPlaylist =
        expectingVariant ||
        (/\.m3u8(\?|$)/i.test(unwrapped.url) && !/relay\.videm\.buzz\/seg/i.test(absUrl));
      expectingVariant = false;
      if (isPlaylist) {
        return buildHlsProxyUrl(unwrapped.url, unwrapped.referer);
      }
      if (!firstSegment) {
        firstSegment = unwrapped;
      }
      return buildTsProxyUrl(unwrapped.url, unwrapped.referer);
    } catch {
      expectingVariant = false;
      return raw;
    }
  });

  return {
    rewritten: rewrittenLines.join('\n'),
    firstSegment,
  };
}

export function resolveKnownUpstreamReferer(urlStr: string, explicitReferer?: string): string {
  const cleanExplicit = String(explicitReferer || '').trim();
  if (/^https?:\/\//i.test(cleanExplicit)) return cleanExplicit;
  try {
    const u = new URL(urlStr);
    if (/(\.|^)stmify\.com$/i.test(u.hostname)) return 'https://stmify.com/';
    if (/(\.|^)footunder\.online$/i.test(u.hostname)) return 'https://footunder.online/';
  } catch {
    // ignore
  }
  return '';
}

export function buildHlsProxyUrl(
  rawM3u8Url: string,
  referer: string,
  transcodeAudio = false,
  originPrefix = ''
): string {
  const needsAac = transcodeAudio || isDvbHeadendStream(rawM3u8Url);
  return `${originPrefix}/api/hls-proxy/stream.m3u8?url=${encodeURIComponent(rawM3u8Url)}&referer=${encodeURIComponent(referer)}${needsAac ? '&aac=1' : ''}${originPrefix ? '&abs=1' : ''}`;
}

export function buildTsProxyUrl(
  rawMediaUrl: string,
  referer: string,
  transcodeAudio = false,
  originPrefix = ''
): string {
  const isMp4Segment =
    /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(rawMediaUrl) ||
    /\/segs\/[^/]+\/init\./i.test(rawMediaUrl);
  const ext = isMp4Segment ? 'segment.m4s' : 'segment.ts';
  const needsAac = !isMp4Segment && (transcodeAudio || isDvbHeadendStream(rawMediaUrl));
  return `${originPrefix}/api/ts-proxy/${ext}?url=${encodeURIComponent(rawMediaUrl)}&referer=${encodeURIComponent(referer)}${needsAac ? '&aac=1' : ''}`;
}

export function normalizeTitleForMatch(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function unpackDeanEdwards(html: string): string | null {
  const m = html.match(
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([^'"]*)\5\.split\(['"]\|['"]\)/
  );
  if (!m) return null;

  let [, , payload, radixStr, countStr, , dictStr] = m;
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

const tlsFallbackHostsCache = new LruTtlCache<string, true>(500, 6 * 60 * 60 * 1000);

export function shouldBypassNodeFetch(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (tlsFallbackHostsCache.has(host)) return true;
    if (host.endsWith('.ibra.lat') || host === 'ibra.lat') return true;
    return false;
  } catch {
    return false;
  }
}

export function markHostNeedsCurlFallback(urlStr: string): void {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (host) tlsFallbackHostsCache.set(host, true);
  } catch {
    // ignore
  }
}

export function h2GetRaw(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 6,
  redirectsLeft = 4
): Promise<{ buf: Buffer; effectiveUrl: string; status: number }> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(targetUrl);
    } catch (err) {
      return reject(err);
    }

    if (u.protocol !== 'https:') {
      streamingFetch(targetUrl, {
        headers,
        timeoutMs: maxTimeSec * 1000,
      })
        .then(async (r) => ({
          buf: Buffer.from(await r.arrayBuffer()),
          effectiveUrl: r.url || targetUrl,
          status: r.status,
        }))
        .then(resolve)
        .catch(reject);
      return;
    }

    const client = http2.connect(u.origin, { rejectUnauthorized: false });
    let settled = false;
    const finishErr = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {
        // ignore
      }
      reject(err);
    };

    client.on('error', finishErr);

    const reqHeaders: Record<string, string> = {
      ':method': 'GET',
      ':path': u.pathname + u.search,
      ':scheme': 'https',
      ':authority': u.host,
      'user-agent': CHROME_UA,
      'accept-encoding': 'gzip, deflate, br',
    };
    for (const [k, v] of Object.entries(headers)) {
      if (v) reqHeaders[k.toLowerCase()] = v;
    }

    const req = client.request(reqHeaders);
    let status = 0;
    let locationHeader = '';
    let contentEncoding = '';
    const chunks: Buffer[] = [];

    req.on('response', (resHeaders) => {
      status = Number(resHeaders[':status'] || 0);
      locationHeader = String(resHeaders['location'] || '');
      contentEncoding = String(resHeaders['content-encoding'] || '').toLowerCase();
    });

    req.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const finalize = () => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {
        // ignore
      }

      if ([301, 302, 303, 307, 308].includes(status) && locationHeader && redirectsLeft > 0) {
        const nextUrl = new URL(locationHeader, targetUrl).href;
        h2GetRaw(nextUrl, headers, maxTimeSec, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }

      let rawBuf = Buffer.concat(chunks);
      try {
        if (contentEncoding.includes('br')) {
          rawBuf = zlib.brotliDecompressSync(rawBuf);
        } else if (contentEncoding.includes('gzip')) {
          rawBuf = zlib.gunzipSync(rawBuf);
        } else if (contentEncoding.includes('deflate')) {
          rawBuf = zlib.inflateSync(rawBuf);
        }
      } catch {
        // keep raw buffer if already decompressed
      }

      resolve({ buf: rawBuf, effectiveUrl: targetUrl, status });
    };

    req.on('end', finalize);
    req.on('error', (err) => {
      if (chunks.length > 0) finalize();
      else finishErr(err);
    });
    req.setTimeout(maxTimeSec * 1000, () => {
      try {
        req.close();
      } catch {
        // ignore
      }
      if (chunks.length > 0) finalize();
      else finishErr(new Error('HTTP/2 request timeout'));
    });
    req.end();
  });
}

export async function curlGetText(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 6,
  preferCurlCli = false
): Promise<{ text: string; effectiveUrl: string }> {
  if (!preferCurlCli) {
    try {
      const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
      if (h2.buf.length > 0 && h2.status < 400) {
        return { text: h2.buf.toString('utf8'), effectiveUrl: h2.effectiveUrl };
      }
    } catch {
      // fallback to curl if available
    }
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-sS',
      '-L',
      '-k',
      '--compressed',
      '--max-time',
      String(maxTimeSec),
      '-w',
      '\n__FINAL_URL__:%{url_effective}',
    ];
    for (const [k, v] of Object.entries(headers)) {
      if (v) args.push('-H', `${k}: ${v}`);
    }
    args.push(targetUrl);
    execFile('curl', args, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        return reject(new Error(stderr || err.message));
      }
      const raw = String(stdout || '');
      const markerIdx = raw.lastIndexOf('\n__FINAL_URL__:');
      if (markerIdx !== -1) {
        return resolve({
          text: raw.slice(0, markerIdx),
          effectiveUrl: raw.slice(markerIdx + 15).trim() || targetUrl,
        });
      }
      resolve({ text: raw, effectiveUrl: targetUrl });
    });
  });
}

export async function curlGetBufferWithStatus(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 7
): Promise<{ buf: Buffer; status: number }> {
  try {
    const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
    if (h2.buf.length > 0 && h2.status >= 200 && h2.status < 400) {
      return { buf: h2.buf, status: h2.status };
    }
  } catch {
    // fallback to curl if available
  }

  const runCurl = (hdrs: Record<string, string>): Promise<{ buf: Buffer; status: number }> =>
    new Promise((resolve, reject) => {
      const marker = Buffer.from('\n__HTTP_STATUS__:');
      const args = [
        '-sS',
        '-L',
        '-k',
        '--max-time',
        String(maxTimeSec),
        '-w',
        '\n__HTTP_STATUS__:%{http_code}',
      ];
      for (const [k, v] of Object.entries(hdrs)) {
        if (v) args.push('-H', `${k}: ${v}`);
      }
      args.push(targetUrl);
      execFile(
        'curl',
        args,
        { encoding: 'buffer', maxBuffer: 25 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const outBuf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || '');
          const idx = outBuf.lastIndexOf(marker);
          if (idx !== -1) {
            const codeStr = outBuf
              .subarray(idx + marker.length)
              .toString('utf8')
              .trim();
            const status = parseInt(codeStr, 10) || 0;
            const body = outBuf.subarray(0, idx);
            if (status >= 200 && status < 400 && body.length > 0) {
              return resolve({ buf: body, status });
            }
            return resolve({ buf: Buffer.alloc(0), status: status || 502 });
          }
          if (err && outBuf.length === 0) {
            return reject(new Error(stderr ? stderr.toString() : err.message));
          }
          resolve({ buf: outBuf, status: outBuf.length > 0 ? 200 : 502 });
        }
      );
    });

  const first = await runCurl(headers);
  if (first.buf.length > 0 && first.status >= 200 && first.status < 400) {
    return first;
  }

  if (first.status === 400 || first.status === 401 || first.status === 403 || first.status === 406) {
    const noOriginHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== 'origin') noOriginHeaders[k] = v;
    }
    const second = await runCurl(noOriginHeaders).catch(() => ({
      buf: Buffer.alloc(0),
      status: 502,
    }));
    if (second.buf.length > 0 && second.status >= 200 && second.status < 400) {
      return second;
    }
    const minimalHeaders: Record<string, string> = headers.Range ? { Range: headers.Range } : {};
    const third = await runCurl(minimalHeaders).catch(() => ({
      buf: Buffer.alloc(0),
      status: 502,
    }));
    if (third.buf.length > 0 && third.status >= 200 && third.status < 400) {
      return third;
    }
  } else if (first.status >= 500 || first.status === 429 || first.status === 0) {
    await new Promise((r) => setTimeout(r, 200));
    const retry = await runCurl(headers).catch(() => ({ buf: Buffer.alloc(0), status: 502 }));
    if (retry.buf.length > 0 && retry.status >= 200 && retry.status < 400) {
      return retry;
    }
  }

  return first;
}

export async function curlGetBuffer(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 7
): Promise<Buffer> {
  const res = await curlGetBufferWithStatus(targetUrl, headers, maxTimeSec);
  return res.buf;
}

export async function curlPostJsonText(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  maxTimeSec = 5
): Promise<string> {
  return new Promise((resolve) => {
    const args = [
      '-sS',
      '-L',
      '-k',
      '--compressed',
      '--max-time',
      String(maxTimeSec),
      '-X',
      'POST',
      '-H',
      'Content-Type: application/json',
    ];
    for (const [k, v] of Object.entries(headers)) {
      if (v && k.toLowerCase() !== 'content-type') args.push('-H', `${k}: ${v}`);
    }
    args.push('-d', JSON.stringify(payload), url);
    execFile('curl', args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve('');
      resolve(String(stdout || ''));
    });
  });
}

export async function fetchTextWithCurlFallback(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 3500
): Promise<string> {
  if (!shouldBypassNodeFetch(url)) {
    try {
      const res = await streamingFetch(url, {
        headers,
        timeoutMs,
      });
      if (res.ok) {
        const txt = await res.text();
        if (txt) return txt;
      }
    } catch {
      markHostNeedsCurlFallback(url);
    }
  }
  const fb = await curlGetText(url, headers, Math.max(3, Math.ceil(timeoutMs / 1000)), true).catch(
    () => ({ text: '' })
  );
  return fb.text || '';
}

export async function probeHlsSegmentHealth(rawM3u8Url: string, origin: string): Promise<boolean> {
  const reqHeaders: Record<string, string> = {
    'User-Agent': CHROME_UA,
    Referer: `${origin}/`,
    Origin: origin,
    Accept: '*/*',
  };

  try {
    const masterText = await fetchTextWithCurlFallback(rawM3u8Url, reqHeaders, 3000);
    if (!masterText.includes('#EXTM3U')) return false;

    let mediaPlaylistUrl = rawM3u8Url;
    let mediaText = masterText;

    if (masterText.includes('#EXT-X-STREAM-INF')) {
      const lines = masterText.split(/\r?\n/);
      let bestVariant = '';
      let bestBw = -1;
      let pendingBw = 0;
      let expectingUrl = false;
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          const bwM = line.match(/BANDWIDTH=(\d+)/i);
          pendingBw = bwM ? parseInt(bwM[1], 10) || 0 : 0;
          expectingUrl = true;
          continue;
        }
        if (line.startsWith('#')) continue;
        if (expectingUrl) {
          expectingUrl = false;
          try {
            const absVar = new URL(line, rawM3u8Url).href;
            if (!bestVariant || pendingBw >= bestBw) {
              bestBw = pendingBw;
              bestVariant = absVar;
            }
          } catch {
            // ignore invalid variant URL
          }
        }
      }
      if (!bestVariant) return false;
      mediaPlaylistUrl = bestVariant;
      mediaText = await fetchTextWithCurlFallback(mediaPlaylistUrl, reqHeaders, 3000);
      if (!mediaText.includes('#EXTM3U')) return false;
    }

    const firstSegRel = mediaText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (!firstSegRel) return true;

    const firstSegUrl = new URL(firstSegRel, mediaPlaylistUrl).href;
    const segHeaders: Record<string, string> = {
      'User-Agent': CHROME_UA,
      Referer: `${origin}/`,
      Range: 'bytes=0-65535',
    };

    const isLikelyHtml = (buf: Buffer): boolean => {
      const head = buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
      return head.startsWith('<!doctype') || head.startsWith('<html');
    };

    if (!shouldBypassNodeFetch(firstSegUrl)) {
      try {
        const segResp = await streamingFetch(firstSegUrl, {
          headers: segHeaders,
          timeoutMs: 2800,
        });
        if (segResp.ok) {
          const ab = await segResp.arrayBuffer();
          const buf = Buffer.from(ab);
          if (buf.length >= 512 && !isLikelyHtml(buf)) {
            return true;
          }
          if (buf.length === 0 || isLikelyHtml(buf)) return false;
        }
      } catch {
        markHostNeedsCurlFallback(firstSegUrl);
      }
    }

    const curlSeg = await curlGetBufferWithStatus(firstSegUrl, segHeaders, 3).catch(() => ({
      buf: Buffer.alloc(0),
      status: 0,
    }));
    return (
      curlSeg.status >= 200 &&
      curlSeg.status < 400 &&
      curlSeg.buf.length >= 512 &&
      !isLikelyHtml(curlSeg.buf)
    );
  } catch {
    return false;
  }
}

export function extractTitleMatchVariants(raw: string): string[] {
  const str = String(raw || '').trim();
  if (!str) return [];
  const full = normalizeTitleForMatch(str);
  const outside = normalizeTitleForMatch(str.replace(/\s*\([^)]*\)/g, ''));
  const variants = new Set<string>();
  if (full.length >= 2) variants.add(full);
  if (outside.length >= 2) variants.add(outside);
  const parenRe = /\(([^)]+)\)/g;
  let pm: RegExpExecArray | null;
  while ((pm = parenRe.exec(str)) !== null) {
    const insideRaw = String(pm[1] || '').trim();
    // Ignore pure release-year parentheses like "(2024)" unless the main title matches too
    if (/^(?:19|20)\d{2}$/.test(insideRaw)) continue;
    const insideNorm = normalizeTitleForMatch(insideRaw);
    if (insideNorm.length >= 2) variants.add(insideNorm);
  }
  return Array.from(variants);
}

export function areTitlesStrictlyEqual(candidateTitle: string, targetHints: string[]): boolean {
  const candVariants = extractTitleMatchVariants(candidateTitle);
  if (candVariants.length === 0) return false;
  const targetVariants = new Set(targetHints.flatMap((h) => extractTitleMatchVariants(h)));
  if (targetVariants.size === 0) return false;
  return candVariants.some((cv) => targetVariants.has(cv));
}

export function parseDurationTextToMinutes(rawDuration?: string | null): number {
  const txt = String(rawDuration || '').trim();
  if (!txt) return 0;
  // ISO-8601 e.g. PT2H6M or PT118M
  const isoMatch = txt.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (isoMatch) {
    const h = Number(isoMatch[1] || 0);
    const m = Number(isoMatch[2] || 0);
    return h * 60 + m;
  }
  const hmMatch = txt.match(
    /(\d+)\s*(?:hours?|hrs?\.?|h\.?)\s*(?:(\d+)\s*(?:minutos?|mins?\.?|m\.?)?)?/i
  );
  if (hmMatch) {
    return Number(hmMatch[1] || 0) * 60 + Number(hmMatch[2] || 0);
  }
  const minMatch = txt.match(/(\d+)\s*(?:minutos?|mins?\.?|m\.?)(?!\w)/i);
  if (minMatch) {
    return Number(minMatch[1] || 0);
  }
  return 0;
}

export function directorsMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeTitleForMatch(a || '');
  const nb = normalizeTitleForMatch(b || '');
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aTokens = na.split(/\s+/).filter((t) => t.length >= 4);
  const bTokens = nb.split(/\s+/).filter((t) => t.length >= 4);
  return aTokens.some((tok) => bTokens.includes(tok));
}

export function isMetadataCompatibleForMedia(opts: {
  candidateTitle?: string;
  targetTitleHints: string[];
  candidateYear?: string | number | null;
  expectedYear?: string | number | null;
  candidateDirector?: string | null;
  expectedDirector?: string | null;
  candidateRuntimeMin?: number | null;
  expectedRuntimeMin?: number | null;
  allowAdjacentYearWithoutProof?: boolean;
}): { ok: boolean; exactYear: boolean; reason?: string } {
  if (opts.candidateTitle && opts.targetTitleHints.length > 0) {
    if (!areTitlesStrictlyEqual(opts.candidateTitle, opts.targetTitleHints)) {
      return { ok: false, exactYear: false, reason: 'title_mismatch' };
    }
  }

  const expYear = Number(String(opts.expectedYear || '').replace(/\D/g, '')) || 0;
  const candYear = Number(String(opts.candidateYear || '').replace(/\D/g, '')) || 0;
  const hasDirPair = Boolean(
    normalizeTitleForMatch(opts.candidateDirector || '') &&
      normalizeTitleForMatch(opts.expectedDirector || '')
  );
  const dirOk = hasDirPair && directorsMatch(opts.candidateDirector, opts.expectedDirector);

  if (hasDirPair && !dirOk) {
    return { ok: false, exactYear: false, reason: 'director_mismatch' };
  }

  const expRun = Number(opts.expectedRuntimeMin || 0);
  const candRun = Number(opts.candidateRuntimeMin || 0);
  const hasRunPair = expRun >= 30 && candRun >= 30;
  if (hasRunPair && Math.abs(expRun - candRun) > 25) {
    return { ok: false, exactYear: false, reason: 'runtime_mismatch' };
  }
  const tightRuntimeOk = hasRunPair && Math.abs(expRun - candRun) <= 3;

  if (expYear > 1900) {
    if (candYear > 1900) {
      const yearDiff = Math.abs(candYear - expYear);
      if (yearDiff > 1) {
        return { ok: false, exactYear: false, reason: 'year_mismatch' };
      }
      if (yearDiff === 1 && !dirOk && !tightRuntimeOk && !opts.allowAdjacentYearWithoutProof) {
        return { ok: false, exactYear: false, reason: 'adjacent_year_unverified' };
      }
      return { ok: true, exactYear: yearDiff === 0 };
    }
    // Candidate has no year: require corroborating director or tight runtime match
    if (!dirOk && !tightRuntimeOk) {
      return { ok: false, exactYear: false, reason: 'missing_candidate_year' };
    }
  }

  return { ok: true, exactYear: candYear > 1900 && expYear > 1900 && candYear === expYear };
}

const YOUTUBE_TITLE_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'you',
  'can',
  'see',
  'her',
  'his',
  'she',
  'its',
  'that',
  'this',
  'are',
  'not',
  'but',
  'out',
  'all',
  'one',
  'two',
  'los',
  'las',
  'una',
  'uno',
  'unos',
  'unas',
  'del',
  'con',
  'por',
  'para',
  'que',
  'sin',
  'mas',
  'sobre',
]);

export function matchesYouTubeFallbackTitle(movieTitle: string, videoTitle: string): boolean {
  const normMovie = normalizeTitleForMatch(
    String(movieTitle || '').replace(/\s*\([^)]*\)/g, '')
  );
  const normVideo = normalizeTitleForMatch(videoTitle);
  if (!normMovie || !normVideo) return false;

  const allTokens = normMovie.split(/\s+/).filter(Boolean);
  const meaningfulTokens = allTokens.filter(
    (tok) => tok.length >= 3 && !YOUTUBE_TITLE_STOPWORDS.has(tok)
  );
  const requiredTokens =
    meaningfulTokens.length >= 1 && meaningfulTokens.length * 2 >= allTokens.length
      ? meaningfulTokens
      : allTokens.filter((tok) => tok.length >= 2);
  if (requiredTokens.length === 0) return false;

  const videoWords = new Set(normVideo.split(/\s+/).filter(Boolean));
  return requiredTokens.every((tok) => videoWords.has(tok));
}

