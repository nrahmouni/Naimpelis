import { describe, expect, it } from 'vitest';
import {
  CN_IPTV_UA,
  CHROME_UA,
  getPreferredUpstreamUa,
  isBlockedAdUrl,
  isChineseIptvStream,
  sanitizeEmbedHtml,
  unwrapRelaySegmentUrl,
} from '../server/extractors/httpHelpers.ts';
import { rewriteVidsrcBuzzM3u8 } from '../server/extractors/bingetrixMovidy.ts';
import {
  CHINESE_FOOTBALL_CHANNELS,
  getChineseFootballMatchTracks,
  getChineseFootballMultiplexCard,
} from '../server/extractors/chineseSports.ts';
import {
  CATALAN_FUNNY_RANDOM_NAMES,
  generateRandomGuestName,
} from '../src/utils/storage.ts';

describe('Embed sanitizer, ad blocking & VidsrcBuzz HLS unwrapping', () => {
  it('detects all click-hijack and scam ad domains including aclib/tagivi/lahochat', () => {
    expect(isBlockedAdUrl('https://acscdn.com/script/aclib.js')).toBe(true);
    expect(isBlockedAdUrl('https://cdn.tagivi.com/pop.js')).toBe(true);
    expect(isBlockedAdUrl('https://unfortunatelyejectinflected.com/go')).toBe(true);
    expect(isBlockedAdUrl('https://lahochat.com/clean')).toBe(true);
    expect(isBlockedAdUrl('https://cdn.jsdelivr.net/npm/disable-devtool')).toBe(true);
    expect(isBlockedAdUrl('https://cdn.example.com/hls.min.js')).toBe(false);
  });

  it('sanitizes embed HTML: strips CSP meta, strips ad scripts, stubs Sandboxed(), freezes window.open', () => {
    const rawHtml = `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'">
  <script src="https://acscdn.com/script/aclib.js"></script>
  <script src="https://cdn.example.com/player.js"></script>
  <script>function Sandboxed(){if(window.self!==window.top)return true;} if(Sandboxed()) throw "Sandbox not allowed";</script>
  <script>aclib.runPop({zoneId: 999});</script>
</head>
<body><div id="player"></div></body>
</html>`;

    const sanitized = sanitizeEmbedHtml(rawHtml, 'https://vidsrc.buzz/embed/tv/312359/1/1');
    expect(sanitized).not.toContain('Content-Security-Policy');
    expect(sanitized).not.toContain('acscdn.com/script/aclib.js');
    expect(sanitized).not.toContain('aclib.runPop');
    expect(sanitized).not.toContain('Sandbox not allowed');
    expect(sanitized).toContain('cdn.example.com/player.js');
    expect(sanitized).toContain('<base href="https://vidsrc.buzz/embed/tv/312359/1/1">');
    expect(sanitized).toContain('function Sandboxed(){return false;}');
    expect(sanitized).toContain("Object.defineProperty(window,'open'");
    expect(sanitized).toContain('/api/embed-fetch?url=');
  });

  it('preserves and resolves vidsrc.buzz <base href="/pl/">, disarms sandboxVerdict/popupsBlocked, and sanitizes 2embed.cc nested frames', () => {
    const vidsrcHtml = `<!doctype html>
<html>
<head><base href="/pl/"></head>
<body>
<script src="https://unfortunatelyejectinflected.com/ad.js"></script>
<script>
  var Q = {"id":"tt0088509","t":"tok123"};
  function opaqueOrigin(){return true;}
  function sandboxVerdict(){return 'sandboxed';}
  function sandboxDeny(){stopMsg('Sandbox is not allowed','Remove the sandbox attribute from the iframe to play the video.');}
  function popupsBlocked(){return true;}
  var SB=sandboxVerdict();if(SB==='sandboxed'){sandboxDeny();return;}
  if(popupsBlocked()){SB='sandboxed';sandboxDeny();}
  fetch('api.php?a=play&ref=1');
</script>
</body>
</html>`;

    const cleanVidsrc = sanitizeEmbedHtml(vidsrcHtml, 'https://vidsrc.buzz/embed/tv/12609/1/1');
    expect(cleanVidsrc).toContain('<base href="https://vidsrc.buzz/pl/">');
    expect(cleanVidsrc).not.toContain('<base href="https://vidsrc.buzz/embed/tv/12609/1/1">');
    expect(cleanVidsrc).not.toContain('unfortunatelyejectinflected');
    expect(cleanVidsrc).not.toContain('Sandbox is not allowed');
    expect(cleanVidsrc).not.toContain('Remove the sandbox attribute');
    expect(cleanVidsrc).toContain('function opaqueOrigin(){return false;');
    expect(cleanVidsrc).toContain("function sandboxVerdict(){return 'clean';");
    expect(cleanVidsrc).toContain('function sandboxDeny(){return;');
    expect(cleanVidsrc).toContain('function popupsBlocked(){return false;');
    expect(cleanVidsrc).toContain('if(false)');
    expect(cleanVidsrc).toContain("SB='clean';");
    expect(cleanVidsrc).toContain('window.XMLHttpRequest.prototype.open');

    const twoEmbedHtml = `<html><head>
<script src="https://cdn.jsdelivr.net/npm/disable-devtool@latest"></script>
<script>if (window === window.top) { window.location.replace("https://www.2embed.skin/tv/12609"); }function go(loc){document.getElementById('iframesrc').src=loc;}</script>
</head><body>
<a href="https://adplox.com/" target="_blank">Servers</a>
<a href="javascript:void();" onclick="go('https://videm.buzz/embed/tv/12609/1/1')">Videm</a>
<script src="https://tagivi.com/1/abc"></script>
<iframe id="iframesrc" src="about:blank" data-src="https://vidsrc.buzz/embed/tv/12609/1/1"></iframe>
<div id="sbxErr"><div><h4>Sandbox not allowed</h4><p>Remove sandbox</p></div></div>
<img src="https://whos.amung.us/widget/2embedtv/">
<script>function isReallySandboxed(){return true;}(function(){if(isReallySandboxed()){return false;}})();</script>
</body></html>`;

    const clean2Embed = sanitizeEmbedHtml(twoEmbedHtml, 'https://www.2embed.cc/embedtv/12609&s=1&e=1');
    expect(clean2Embed).not.toContain('disable-devtool');
    expect(clean2Embed).not.toContain('tagivi.com');
    expect(clean2Embed).not.toContain('adplox.com');
    expect(clean2Embed).not.toContain('whos.amung.us');
    expect(clean2Embed).not.toContain('window.location.replace');
    expect(clean2Embed).not.toContain('Sandbox not allowed');
    expect(clean2Embed).toContain('function isReallySandboxed(){return false;');
    expect(clean2Embed).toContain(
      `data-src="/api/embed-proxy?url=${encodeURIComponent('https://vidsrc.buzz/embed/tv/12609/1/1')}"`
    );
    expect(clean2Embed).toContain(
      `go('/api/embed-proxy?url=${encodeURIComponent('https://videm.buzz/embed/tv/12609/1/1')}&referer=${encodeURIComponent('https://vidsrc.buzz/')}')`
    );
  });

  it('unwraps relay.videm.buzz/seg?u=...&r=... into direct upstream URL + referer', () => {
    const wrapped =
      'https://relay.videm.buzz/seg?u=https%3A%2F%2Fcdn77.example.com%2Fhls%2Fseg001.png&r=https%3A%2F%2Fcloudnestra.com%2F';
    const unwrapped = unwrapRelaySegmentUrl(wrapped, 'https://vidsrc.buzz');
    expect(unwrapped).toEqual({
      url: 'https://cdn77.example.com/hls/seg001.png',
      referer: 'https://cloudnestra.com/',
    });
  });

  it('rewrites VidsrcBuzz M3U8 playlists cleanly through /api/ts-proxy and records firstSegment', () => {
    const rawM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXTINF:6.000,
https://relay.videm.buzz/seg?u=https%3A%2F%2Fcdn.test%2Fseg0.png&r=https%3A%2F%2Fvidem.buzz%2F
#EXTINF:6.000,
https://relay.videm.buzz/seg?u=https%3A%2F%2Fcdn.test%2Fseg1.png&r=https%3A%2F%2Fvidem.buzz%2F
#EXT-X-ENDLIST`;

    const { rewritten, firstSegment } = rewriteVidsrcBuzzM3u8(
      rawM3u8,
      'https://relay.videm.buzz/pl/master.m3u8',
      'https://vidsrc.buzz'
    );

    expect(firstSegment).toEqual({
      url: 'https://cdn.test/seg0.png',
      referer: 'https://videm.buzz/',
    });
    expect(rewritten).toContain(
      `/api/ts-proxy/segment.ts?url=${encodeURIComponent('https://cdn.test/seg0.png')}&referer=${encodeURIComponent('https://videm.buzz/')}`
    );
    expect(rewritten).toContain(
      `/api/ts-proxy/segment.ts?url=${encodeURIComponent('https://cdn.test/seg1.png')}&referer=${encodeURIComponent('https://videm.buzz/')}`
    );
    expect(rewritten).not.toContain('relay.videm.buzz/seg');
  });
});

describe('Chinese Football (中文) IPTV stream detection & channel definitions', () => {
  it('assigns okhttp/4.12.0 User-Agent to Chinese IPTV feeds and Chrome UA to generic HLS', () => {
    const cnUrl = 'http://38.75.136.137:98/gslb/dsdqbv/cctv5hd.m3u8?auth=test20251009';
    const cnBfgd = 'http://120.76.248.139/live/bfgd/4200000249.m3u8';
    const genericUrl = 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8';

    expect(isChineseIptvStream(cnUrl)).toBe(true);
    expect(isChineseIptvStream(cnBfgd)).toBe(true);
    expect(isChineseIptvStream(genericUrl)).toBe(false);

    expect(getPreferredUpstreamUa(cnUrl)).toBe(CN_IPTV_UA);
    expect(getPreferredUpstreamUa(cnBfgd)).toBe(CN_IPTV_UA);
    expect(getPreferredUpstreamUa(genericUrl)).toBe(CHROME_UA);
  });

  it('exposes verified native Chinese football channels & multiplex for Champions, LaLiga & Premier League', () => {
    expect(CHINESE_FOOTBALL_CHANNELS.length).toBeGreaterThanOrEqual(6);
    for (const ch of CHINESE_FOOTBALL_CHANNELS) {
      expect(ch.category).toBe('china_football');
      expect(ch.channels.length).toBeGreaterThan(0);
      expect(ch.channels[0].lang).toBe('ZH');
      expect(ch.channels[0].resolverType).toBe('tdt_hls');
    }

    const mux = getChineseFootballMultiplexCard();
    expect(mux.id).toBe('mux-china-football');
    expect(mux.channels.length).toBeGreaterThanOrEqual(5);

    const uclTracks = getChineseFootballMatchTracks('uefa.champions', 'ucl-1');
    const laligaTracks = getChineseFootballMatchTracks('esp.1', 'esp-1');
    const eplTracks = getChineseFootballMatchTracks('eng.1', 'eng-1');
    expect(uclTracks.length).toBeGreaterThanOrEqual(2);
    expect(laligaTracks.length).toBeGreaterThanOrEqual(2);
    expect(eplTracks.length).toBeGreaterThanOrEqual(2);
    expect(uclTracks.every((t) => t.lang === 'ZH' && t.resolverType === 'tdt_hls')).toBe(true);
    expect(laligaTracks.every((t) => t.lang === 'ZH' && t.resolverType === 'tdt_hls')).toBe(true);
    expect(eplTracks.every((t) => t.lang === 'ZH' && t.resolverType === 'tdt_hls')).toBe(true);
  });
});

describe('Catalan funny random guest names', () => {
  it('provides classic funny Catalan insults and picks non-repeating names', () => {
    expect(CATALAN_FUNNY_RANDOM_NAMES).toContain('Capsigrany');
    expect(CATALAN_FUNNY_RANDOM_NAMES).toContain('Pocasoltes');
    expect(CATALAN_FUNNY_RANDOM_NAMES).toContain('Carallot');
    expect(CATALAN_FUNNY_RANDOM_NAMES.length).toBeGreaterThanOrEqual(20);

    for (let i = 0; i < 30; i += 1) {
      const picked = generateRandomGuestName('Capsigrany');
      expect(picked).not.toBe('Capsigrany');
      expect(CATALAN_FUNNY_RANDOM_NAMES).toContain(picked);
    }
  });
});
