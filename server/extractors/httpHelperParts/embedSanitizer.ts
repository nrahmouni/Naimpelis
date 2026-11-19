import { buildHlsProxyUrl, buildTsProxyUrl } from './curlAndH2Client.ts';

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

export function isBlockedAdUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return AD_DOMAIN_PATTERNS.some((domain) => lower.includes(domain));
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
