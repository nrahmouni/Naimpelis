// server/mediaServer.ts
import dns2 from "dns";
import express2 from "express";
import { createServer } from "http";

// server/config/env.ts
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var ROOT_DIR = path.resolve(__dirname, "../..");
var isProdEnv = process.env.NODE_ENV === "production";
var parsedEnvPort = Number(process.env.PORT);
var ENV = {
  port: isProdEnv ? parsedEnvPort || 3e3 : parsedEnvPort && parsedEnvPort !== 8080 ? parsedEnvPort : 3e3,
  nodeEnv: isProdEnv ? "production" : process.env.NODE_ENV === "test" ? "test" : "development",
  isProd: isProdEnv,
  tmdbApiKey: process.env.TMDB_API_KEY || "90b2cae8d7161e8ba0f3836240d7d352",
  publicDomain: process.env.PUBLIC_APP_DOMAIN || "",
  appUrl: (process.env.APP_URL || "").replace(/\/+$/, ""),
  spotifyClientId: (process.env.SPOTIFY_CLIENT_ID || "").trim(),
  spotifyClientSecret: (process.env.SPOTIFY_CLIENT_SECRET || "").trim(),
  appVersionName: process.env.NAIM_APP_VERSION || "3.2.0",
  appVersionCodeMobile: Number(process.env.NAIM_MOBILE_VERSION_CODE) || 302,
  appVersionCodeTv: Number(process.env.NAIM_TV_VERSION_CODE) || 302,
  appVersionCodeMusic: Number(process.env.NAIM_MUSIC_VERSION_CODE) || 302,
  androidMobilePkg: process.env.ANDROID_MOBILE_PKG || "com.naimcine.mobile",
  androidTvPkg: process.env.ANDROID_TV_PKG || "com.naimcine.tv",
  androidMusicPkg: process.env.ANDROID_MUSIC_PKG || "com.riffan.music",
  legacyAndroidPkg: "studio.ai.naimcine.app",
  androidCertSha256: process.env.ANDROID_SHA256_FINGERPRINT || "70:B5:CB:FA:3D:E2:D3:D3:84:DD:04:93:15:5F:33:39:48:FC:47:B6:AB:E1:DD:13:B9:A8:75:58:29:23:96:30",
  belixXtreamServer: process.env.BELIX_XTREAM_SERVER || "",
  belixXtreamUser: process.env.BELIX_XTREAM_USER || "",
  belixXtreamPass: process.env.BELIX_XTREAM_PASS || ""
};

// server/utils/logger.ts
import pino from "pino";
function maskSensitiveText(val) {
  if (typeof val !== "string") return val;
  return val.replace(
    /([?&](?:pass|password|pwd|access_token|refresh_token|client_secret|token|api_key|apikey|key|secret)=)[^&\s]+/gi,
    "$1[REDACTED]"
  ).replace(
    /(https?:\/\/[^/\s]+\/(?:live|movie|series|timeshift)\/)([^/\s]+)\/([^/\s]+)(\/)/gi,
    "$1[REDACTED]/[REDACTED]$4"
  ).replace(/(Authorization:\s*Bearer\s+)[^\s,;]+/gi, "$1[REDACTED]").replace(/\b([a-zA-Z0-9._%+-]{2})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, "$1***@$2");
}
function sanitizeRecord(obj, depth = 0) {
  if (depth > 3) return obj;
  const copy = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      copy[k] = maskSensitiveText(v);
    } else if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Error)) {
      copy[k] = sanitizeRecord(v, depth + 1);
    } else {
      copy[k] = v;
    }
  }
  return copy;
}
var logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-api-key"]',
      "*.pin",
      "*.pinCode",
      "*.tvAuthToken",
      "*.password",
      "*.pass",
      "*.pwd",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.clientSecret",
      "*.secret",
      "*.email"
    ],
    censor: "[REDACTED]"
  },
  hooks: {
    logMethod(args, method) {
      const sanitized = args.map((arg) => {
        if (typeof arg === "string") return maskSensitiveText(arg);
        if (arg && typeof arg === "object" && !Array.isArray(arg)) {
          return sanitizeRecord(arg);
        }
        return arg;
      });
      return method.apply(this, sanitized);
    }
  },
  base: {
    service: "naim-cine-engine"
  }
});

// server/middleware/errorHandler.ts
function securityHeadersMiddleware(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=*, geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "on");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https: data: blob: ws: wss: 'unsafe-inline' 'unsafe-eval'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://aistudio.google.com https://*.google.com https://*.googleusercontent.com https://*.run.app;"
  );
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

// server/routes/proxies/proxyUtils.ts
import crypto from "crypto";
import fs from "fs";
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
function resolveFfmpegBin() {
  if (fs.existsSync("/usr/bin/ffmpeg")) {
    return "/usr/bin/ffmpeg";
  }
  try {
    const mod = require2("@ffmpeg-installer/ffmpeg");
    if (mod?.path && fs.existsSync(mod.path)) {
      return mod.path;
    }
  } catch {
  }
  return "ffmpeg";
}
var FFMPEG_BIN = resolveFfmpegBin();
function getOrCreateRequestId(req) {
  const existing = String(req.headers["x-naim-request-id"] || "").trim();
  if (existing && existing.length <= 64) return existing;
  return crypto.randomUUID();
}
function applyProxyCorsHeaders(res, reqId) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Content-Type, Accept-Ranges, X-Naim-Request-Id"
  );
  res.setHeader("X-Naim-Request-Id", reqId);
}
function findDisguisedTsOffset(buf) {
  if (!buf || buf.length < 380) return 0;
  if (buf[0] === 71 && buf[188] === 71) return 0;
  const isPng = buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71;
  const isGif = buf[0] === 71 && buf[1] === 73 && buf[2] === 70 && buf[3] === 56;
  const isJpg = buf[0] === 255 && buf[1] === 216 && buf[2] === 255;
  const isBmp = buf[0] === 66 && buf[1] === 77;
  if (!isPng && !isGif && !isJpg && !isBmp) return 0;
  const limit = Math.min(buf.length - 376, 4096);
  for (let i = 4; i < limit; i++) {
    if (buf[i] === 71 && buf[i + 188] === 71 && buf[i + 376] === 71) {
      return i;
    }
  }
  return 0;
}

// server/routes/proxies/dvbTranscoder.ts
import crypto2 from "crypto";
import fs2 from "fs";
import path2 from "path";
import { spawn } from "child_process";

// src/shared/lruCache.ts
var LruTtlCache = class {
  cache = /* @__PURE__ */ new Map();
  maxSize;
  defaultTtlMs;
  constructor(maxSize = 250, defaultTtlMs = 5 * 60 * 1e3) {
    this.maxSize = Math.max(1, maxSize);
    this.defaultTtlMs = Math.max(1e3, defaultTtlMs);
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return void 0;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return void 0;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }
  set(key, value, ttlMs) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== void 0) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs)
    });
  }
  has(key) {
    return this.get(key) !== void 0;
  }
  delete(key) {
    return this.cache.delete(key);
  }
  clear() {
    this.cache.clear();
  }
  *entries() {
    const now = Date.now();
    for (const [k, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(k);
        continue;
      }
      yield [k, entry.value];
    }
  }
  get size() {
    return this.cache.size;
  }
};

// server/utils/tlsFetch.ts
import http from "http";
import https from "https";
import zlib from "zlib";

// server/utils/ssrfGuard.ts
import dns from "node:dns/promises";
import net from "node:net";
function isPrivateIpAddress(rawIp) {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!ip) return true;
  if (ip.startsWith("::ffff:")) {
    const mapped = ip.slice(7);
    if (net.isIPv4(mapped)) {
      return isPrivateIpAddress(mapped);
    }
    const hexMatch = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1], 16);
      const lo = parseInt(hexMatch[2], 16);
      const v4 = `${hi >> 8 & 255}.${hi & 255}.${lo >> 8 & 255}.${lo & 255}`;
      return isPrivateIpAddress(v4);
    }
    return true;
  }
  const ver = net.isIP(ip);
  if (ver === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b, c] = p;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (ver === 6) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
    if (/^fe[89ab][0-9a-f]:/.test(ip) || ip.startsWith("fe80")) return true;
    if (/^fe[cdef][0-9a-f]:/.test(ip) || ip.startsWith("fec0")) return true;
    if (ip.startsWith("ff")) return true;
    if (ip.startsWith("64:ff9b:") || ip.startsWith("0064:ff9b:")) return true;
    if (ip.startsWith("100::") || ip.startsWith("0100::")) return true;
    if (ip.startsWith("2001:0:") || ip.startsWith("2001:0000:")) return true;
    if (ip.startsWith("2001:db8:") || ip.startsWith("2001:0db8:")) return true;
    if (ip.startsWith("2001:2:") || ip.startsWith("2001:0002:")) return true;
    if (ip.startsWith("2002:")) return true;
    return false;
  }
  return true;
}
function isDisallowedHostnameSyntax(hostname) {
  const low = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!low || low === "localhost" || low.endsWith(".localhost") || low.endsWith(".local") || low.endsWith(".internal") || low.endsWith(".arpa")) {
    return true;
  }
  if (net.isIP(low)) {
    return isPrivateIpAddress(low);
  }
  return false;
}
var PUBLIC_DNS_HOST_CACHE = /* @__PURE__ */ new Map();
var PUBLIC_DNS_TTL_MS = 9e4;
async function validateSafeOutboundUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, status: 400, reason: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, status: 403, reason: "Unsupported URL scheme" };
  }
  if (parsed.username || parsed.password) {
    return { safe: false, status: 403, reason: "Credentials in URL are forbidden" };
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isDisallowedHostnameSyntax(host)) {
    return { safe: false, status: 403, reason: "Forbidden private or local host" };
  }
  if (!net.isIP(host)) {
    const lowHost = host.toLowerCase();
    const cachedUntil = PUBLIC_DNS_HOST_CACHE.get(lowHost);
    if (cachedUntil && cachedUntil > Date.now()) {
      return { safe: true, url: parsed };
    }
    try {
      const records = await dns.lookup(host, { all: true });
      if (!records || records.length === 0) {
        return { safe: false, status: 403, reason: "Unresolvable upstream host" };
      }
      for (const rec of records) {
        if (isPrivateIpAddress(rec.address)) {
          return { safe: false, status: 403, reason: "Host resolves to private or disallowed IP" };
        }
      }
      if (PUBLIC_DNS_HOST_CACHE.size >= 500) {
        const firstKey = PUBLIC_DNS_HOST_CACHE.keys().next().value;
        if (firstKey) PUBLIC_DNS_HOST_CACHE.delete(firstKey);
      }
      PUBLIC_DNS_HOST_CACHE.set(lowHost, Date.now() + PUBLIC_DNS_TTL_MS);
    } catch {
      return { safe: false, status: 502, reason: "DNS resolution failed for upstream host" };
    }
  }
  return { safe: true, url: parsed };
}
async function assertSafeProxyUrl(rawUrl) {
  const check = await validateSafeOutboundUrl(rawUrl);
  if (!check.safe) {
    const err = new Error(check.reason);
    err.statusCode = check.status;
    throw err;
  }
  return check.url;
}

// server/utils/tlsFetch.ts
var tlsRelaxedAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  keepAliveMsecs: 15e3,
  maxSockets: 48
});
var plainHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 15e3,
  maxSockets: 48
});
var STREAMING_TLS_RELAX_PATTERNS = [
  /(\.|^)stmify\.com$/i,
  /(\.|^)footunder\.online$/i,
  /(\.|^)7odxv0l067ka\.net$/i,
  /(\.|^)futlivehd\.com$/i,
  /(\.|^)streamxhd\.(sbs|st)$/i,
  /(\.|^)rojadirectv\.live$/i,
  /(\.|^)movidy\.(work|pw|tv|ws)$/i,
  /(\.|^)bingetrix\.(sc|to|sx|cc)$/i,
  /(\.|^)vidhide/i,
  /(\.|^)embed69/i,
  /(\.|^)filemoon/i,
  /(\.|^)streamwish/i,
  /(\.|^)dood/i,
  /(\.|^)mixdrop/i,
  /(\.|^)lulustream/i,
  /(\.|^)earnvids/i,
  /(\.|^)gnula/i,
  /(\.|^)vest/i,
  /(\.|^)ok\.ru$/i,
  /(\.|^)vk\.com$/i,
  /(\.|^)tilinhd\.lol$/i
];
var DIRECT_IPV4_HTTPS_HOSTS = new LruTtlCache(400, 6 * 60 * 60 * 1e3);
var PROACTIVE_DIRECT_IPV4_PATTERNS = [
  /(\.|^)footunder\.online$/i,
  /(\.|^)7odxv0l067ka\.net$/i,
  /(\.|^)futlivehd\.com$/i,
  /(\.|^)streamxhd\.(sbs|st)$/i,
  /(\.|^)rojadirectv\.live$/i,
  /(\.|^)tilinhd\.lol$/i
];
var STRICT_TLS_ONLY_HOSTS = [
  /(\.|^)googleapis\.com$/i,
  /(\.|^)google\.com$/i,
  /(\.|^)firebaseio\.com$/i,
  /(\.|^)themoviedb\.org$/i,
  /(\.|^)tmdb\.org$/i,
  /(\.|^)github\.com$/i,
  /(\.|^)githubusercontent\.com$/i
];
function shouldRelaxStreamingTls(hostname) {
  const clean = hostname.toLowerCase().replace(/\.$/, "");
  if (STRICT_TLS_ONLY_HOSTS.some((rx) => rx.test(clean))) return false;
  return STREAMING_TLS_RELAX_PATTERNS.some((rx) => rx.test(clean));
}
function shouldUseDirectIpv4Http(hostname) {
  const clean = hostname.toLowerCase().replace(/\.$/, "");
  if (STRICT_TLS_ONLY_HOSTS.some((rx) => rx.test(clean))) return false;
  if (DIRECT_IPV4_HTTPS_HOSTS.has(clean)) return true;
  return PROACTIVE_DIRECT_IPV4_PATTERNS.some((rx) => rx.test(clean));
}
function isTlsCertificateError(err) {
  const msg = err instanceof Error ? `${err.message} ${String(err.cause?.code || "")} ${String(err.cause?.message || "")}` : String(err || "");
  return /UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|ERR_TLS_CERT_ALTNAME_INVALID|unable to verify the first certificate/i.test(
    msg
  );
}
function isUndiciTimeoutOrConnectError(err) {
  const msg = err instanceof Error ? `${err.name} ${err.message} ${String(err.cause?.code || "")}` : String(err || "");
  return /TimeoutError|AbortError|aborted due to timeout|ETIMEDOUT|ECONNRESET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT/i.test(
    msg
  );
}
function createDecompressedWebStream(res, contentEncoding, onAbortCleanup) {
  let decompressor = null;
  let stream = res;
  if (contentEncoding === "gzip") {
    decompressor = zlib.createGunzip();
    res.pipe(decompressor);
    stream = decompressor;
  } else if (contentEncoding === "deflate") {
    decompressor = zlib.createInflate();
    res.pipe(decompressor);
    stream = decompressor;
  } else if (contentEncoding === "br") {
    decompressor = zlib.createBrotliDecompress();
    res.pipe(decompressor);
    stream = decompressor;
  }
  let settled = false;
  let onData = null;
  let onEnd = null;
  let onResClose = null;
  const detachDataListeners = () => {
    if (onData) {
      stream.off("data", onData);
      onData = null;
    }
    if (onEnd) {
      stream.off("end", onEnd);
      onEnd = null;
    }
    if (onResClose) {
      res.off("close", onResClose);
      onResClose = null;
    }
  };
  const destroyStreams = () => {
    if (decompressor) {
      try {
        res.unpipe(decompressor);
      } catch {
      }
      if (!decompressor.destroyed) {
        decompressor.destroy();
      }
    }
    if (!res.destroyed) {
      res.destroy();
    }
  };
  return new ReadableStream({
    start(controller) {
      const closeOnce = () => {
        if (settled) return;
        settled = true;
        detachDataListeners();
        try {
          controller.close();
        } catch {
        }
        onAbortCleanup();
      };
      const errorOnce = (err) => {
        if (settled) return;
        settled = true;
        detachDataListeners();
        destroyStreams();
        try {
          controller.error(err);
        } catch {
        }
        onAbortCleanup();
      };
      onData = (chunk) => {
        if (settled) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (buf.length === 0) return;
        try {
          controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            stream.pause();
          }
        } catch {
          settled = true;
          detachDataListeners();
          destroyStreams();
          onAbortCleanup();
        }
      };
      onEnd = () => {
        closeOnce();
      };
      const onStreamError = (err) => {
        if (settled) return;
        errorOnce(err);
      };
      const onResError = (err) => {
        if (settled) return;
        errorOnce(err);
      };
      onResClose = () => {
        if (!settled && res.complete === false) {
          errorOnce(new Error("Upstream response closed prematurely"));
          return;
        }
        if (!decompressor) {
          closeOnce();
        } else {
          onAbortCleanup();
        }
      };
      stream.on("error", onStreamError);
      if (decompressor) {
        res.on("error", onResError);
      }
      stream.on("data", onData);
      stream.once("end", onEnd);
      res.once("close", onResClose);
      if (stream.readableEnded) {
        closeOnce();
      }
    },
    pull() {
      if (!settled && stream.isPaused()) {
        stream.resume();
      }
    },
    cancel() {
      if (settled) return;
      settled = true;
      detachDataListeners();
      destroyStreams();
      onAbortCleanup();
    }
  });
}
function relaxedHttpsRequest(targetUrl, options) {
  const timeoutMs = options.timeoutMs ?? 12e3;
  const redirectCount = options.redirectCount ?? 0;
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const isHttps = targetUrl.protocol === "https:";
    const mod = isHttps ? https : http;
    let settled = false;
    let req = null;
    const onExternalAbort = () => {
      if (req && !req.destroyed) {
        req.destroy(new DOMException("The operation was aborted.", "AbortError"));
      }
      if (!settled) {
        settled = true;
        reject(new DOMException("The operation was aborted.", "AbortError"));
      }
    };
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });
    const cleanupSignal = () => {
      options.signal?.removeEventListener("abort", onExternalAbort);
    };
    req = mod.request(
      targetUrl,
      {
        method: options.method || "GET",
        headers: options.headers,
        family: 4,
        timeout: timeoutMs,
        agent: isHttps ? options.rejectUnauthorized === false ? tlsRelaxedAgent : void 0 : plainHttpAgent,
        ...isHttps && options.rejectUnauthorized === false ? { rejectUnauthorized: false } : {}
      },
      (res) => {
        const status = res.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectCount < 5) {
          res.resume();
          cleanupSignal();
          settled = true;
          const nextUrl = new URL(res.headers.location, targetUrl);
          assertSafeProxyUrl(nextUrl.toString()).then(
            (safeNextUrl) => relaxedHttpsRequest(safeNextUrl, {
              ...options,
              method: status === 303 ? "GET" : options.method,
              redirectCount: redirectCount + 1
            })
          ).then(resolve).catch(reject);
          return;
        }
        const enc = String(res.headers["content-encoding"] || "").toLowerCase();
        const respHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          const lowerK = k.toLowerCase();
          if (lowerK === "content-encoding" || lowerK === "transfer-encoding") continue;
          if (Array.isArray(v)) respHeaders.set(k, v.join(", "));
          else if (typeof v === "string") respHeaders.set(k, v);
        }
        settled = true;
        const bodyStream = options.method === "HEAD" ? null : createDecompressedWebStream(res, enc, cleanupSignal);
        if (options.method === "HEAD") {
          res.resume();
          cleanupSignal();
        }
        const response = new Response(bodyStream, {
          status,
          statusText: res.statusMessage || "",
          headers: respHeaders
        });
        try {
          Object.defineProperty(response, "url", { value: targetUrl.toString() });
        } catch {
        }
        resolve(response);
      }
    );
    req.on("timeout", () => {
      req?.destroy(new Error(`Upstream timeout after ${timeoutMs}ms`));
    });
    req.on("error", (err) => {
      cleanupSignal();
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}
async function streamingFetch(rawUrl, init = {}) {
  const parsed = new URL(rawUrl);
  const timeoutMs = init.timeoutMs ?? 12e3;
  const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
  const normalizeHeaders = () => {
    const out = {};
    if (!init.headers) return out;
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        out[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) out[k] = v;
    } else {
      Object.assign(out, init.headers);
    }
    return out;
  };
  const allowFallback = init.allowTlsFallback !== false && parsed.protocol === "https:" && !STRICT_TLS_ONLY_HOSTS.some((rx) => rx.test(parsed.hostname));
  if (shouldUseDirectIpv4Http(parsed.hostname)) {
    return relaxedHttpsRequest(parsed, {
      method: init.method || "GET",
      headers: normalizeHeaders(),
      body: typeof init.body === "string" || Buffer.isBuffer(init.body) ? init.body : void 0,
      timeoutMs,
      signal,
      rejectUnauthorized: !shouldRelaxStreamingTls(parsed.hostname)
    });
  }
  try {
    return await fetch(parsed.toString(), { ...init, signal });
  } catch (err) {
    if (init.signal?.aborted) {
      throw err;
    }
    if (allowFallback && (shouldRelaxStreamingTls(parsed.hostname) || isTlsCertificateError(err) || isUndiciTimeoutOrConnectError(err))) {
      DIRECT_IPV4_HTTPS_HOSTS.set(parsed.hostname.toLowerCase().replace(/\.$/, ""), true);
      logger.debug({ host: parsed.hostname }, "streaming_tls_relaxed_fallback");
      return relaxedHttpsRequest(parsed, {
        method: init.method || "GET",
        headers: normalizeHeaders(),
        body: typeof init.body === "string" || Buffer.isBuffer(init.body) ? init.body : void 0,
        timeoutMs,
        signal,
        rejectUnauthorized: false
      });
    }
    throw err;
  }
}

// server/extractors/httpHelperParts/curlAndH2Client.ts
import { execFile } from "child_process";
import http2 from "http2";
import zlib2 from "zlib";
var CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var TDT_DVB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
var CN_IPTV_UA = "okhttp/4.12.0";
function isDvbHeadendStream(urlStr) {
  return urlStr.includes("90.163.85.113:8093");
}
function isChineseIptvStream(urlStr) {
  const lower = String(urlStr || "").toLowerCase();
  return lower.includes("38.75.136.137") || lower.includes("63.141.230.178") || lower.includes("120.76.248.139") || lower.includes("153.0.171.163") || lower.includes("223.112.114.228") || lower.includes("192.187.98.98") || lower.includes("198.204.") || lower.includes("204.12.") || lower.includes("gmxw.7766.org") || lower.includes("jdshipin.com") || lower.includes("epg.pw/stream/") || lower.includes("miguvideo.com") || lower.includes("/gslb/dsdq") || lower.includes("/gslb/zbdq") || lower.includes("/live/bfgd/");
}
function getPreferredUpstreamUa(urlStr) {
  if (isDvbHeadendStream(urlStr)) return TDT_DVB_UA;
  if (isChineseIptvStream(urlStr)) return CN_IPTV_UA;
  return CHROME_UA;
}
var easyBroadcastTokenCache = new LruTtlCache(60, 25e3);
function resolveKnownUpstreamReferer(urlStr, explicitReferer) {
  const cleanExplicit = String(explicitReferer || "").trim();
  if (/^https?:\/\//i.test(cleanExplicit)) return cleanExplicit;
  try {
    const u = new URL(urlStr);
    if (/(\.|^)stmify\.com$/i.test(u.hostname)) return "https://stmify.com/";
    if (/(\.|^)footunder\.online$/i.test(u.hostname)) return "https://footunder.online/";
    if (/(\.|^)easybroadcast\.io$/i.test(u.hostname)) return "https://snrt.player.easybroadcast.io/";
    if (/(\.|^)akamaized\.net$/i.test(u.hostname) && /\/2m_monde\//i.test(u.pathname)) {
      return "http://www.radio2m.ma/";
    }
    if (/(\.|^)usnlive\.com$/i.test(u.hostname)) return "https://usnewson.com/";
    if (/(\.|^)(rousav\.tech|vidbolt\.(?:st|xyz)|johndoesdmc\.workers\.dev)$/i.test(u.hostname)) {
      return "https://vidbolt.st/";
    }
    if (/(\.|^)(dailymotion\.com|dmcdn\.net|dai\.ly)$/i.test(u.hostname)) {
      return "https://www.dailymotion.com/";
    }
    if (/(\.|^)(elahmad\.(?:ru|store)|glwiz\.com|mangomolo\.com)$/i.test(u.hostname)) {
      return "https://www.elahmad.ru/";
    }
  } catch {
  }
  return "";
}
function buildHlsProxyUrl(rawM3u8Url, referer, transcodeAudio = false, originPrefix = "") {
  const needsAac = transcodeAudio || isDvbHeadendStream(rawM3u8Url);
  return `${originPrefix}/api/hls-proxy/stream.m3u8?url=${encodeURIComponent(rawM3u8Url)}&referer=${encodeURIComponent(referer)}${needsAac ? "&aac=1" : ""}${originPrefix ? "&abs=1" : ""}`;
}
function buildTsProxyUrl(rawMediaUrl, referer, transcodeAudio = false, originPrefix = "") {
  const isMp4Segment = /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(rawMediaUrl) || /\/segs\/[^/]+\/init\./i.test(rawMediaUrl);
  const ext = isMp4Segment ? "segment.m4s" : "segment.ts";
  const needsAac = !isMp4Segment && (transcodeAudio || isDvbHeadendStream(rawMediaUrl));
  return `${originPrefix}/api/ts-proxy/${ext}?url=${encodeURIComponent(rawMediaUrl)}&referer=${encodeURIComponent(referer)}${needsAac ? "&aac=1" : ""}`;
}
var tlsFallbackHostsCache = new LruTtlCache(500, 6 * 60 * 60 * 1e3);
function shouldBypassNodeFetch(urlStr) {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (tlsFallbackHostsCache.has(host)) return true;
    if (host.endsWith(".ibra.lat") || host === "ibra.lat" || /(?:^|\.)(movidy\.(?:work|pw|tv|ws)|nupload\.[a-z]+|gnulahd\.(?:nu|click|bid|com)|serieskao\.top|embed69\.org|byse[a-z]*\.[a-z]+|vidaraa?\.[a-z]+|vidhide[a-z]*\.[a-z]+|smoothpre\.[a-z]+|earnvids\.[a-z]+|streamwish\.[a-z]+|hglink\.[a-z]+|filelions\.[a-z]+)$/i.test(
      host
    )) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
function markHostNeedsCurlFallback(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return;
    const host = u.hostname.toLowerCase();
    if (host) tlsFallbackHostsCache.set(host, true);
  } catch {
  }
}
function h2GetRaw(targetUrl, headers = {}, maxTimeSec = 6, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(targetUrl);
    } catch (err) {
      return reject(err);
    }
    if (u.protocol !== "https:") {
      streamingFetch(targetUrl, {
        headers,
        timeoutMs: maxTimeSec * 1e3
      }).then(async (r) => ({
        buf: Buffer.from(await r.arrayBuffer()),
        effectiveUrl: r.url || targetUrl,
        status: r.status
      })).then(resolve).catch(reject);
      return;
    }
    const client = http2.connect(u.origin, { rejectUnauthorized: false });
    let settled = false;
    let overallTimer = null;
    const clearOverallTimer = () => {
      if (overallTimer) {
        clearTimeout(overallTimer);
        overallTimer = null;
      }
    };
    const finishErr = (err) => {
      if (settled) return;
      settled = true;
      clearOverallTimer();
      try {
        client.destroy();
      } catch {
      }
      reject(err);
    };
    overallTimer = setTimeout(() => {
      finishErr(new Error(`HTTP/2 connect/request timeout after ${maxTimeSec}s`));
    }, maxTimeSec * 1e3);
    overallTimer.unref?.();
    client.on("error", finishErr);
    const reqHeaders = {
      ":method": "GET",
      ":path": u.pathname + u.search,
      ":scheme": "https",
      ":authority": u.host,
      "user-agent": CHROME_UA,
      "accept-encoding": "gzip, deflate, br"
    };
    for (const [k, v] of Object.entries(headers)) {
      if (v) reqHeaders[k.toLowerCase()] = v;
    }
    const req = client.request(reqHeaders);
    let status = 0;
    let locationHeader = "";
    let contentEncoding = "";
    const chunks = [];
    req.on("response", (resHeaders) => {
      status = Number(resHeaders[":status"] || 0);
      locationHeader = String(resHeaders["location"] || "");
      contentEncoding = String(resHeaders["content-encoding"] || "").toLowerCase();
    });
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    const finalize = () => {
      if (settled) return;
      settled = true;
      clearOverallTimer();
      try {
        client.close();
      } catch {
      }
      if ([301, 302, 303, 307, 308].includes(status) && locationHeader && redirectsLeft > 0) {
        const nextUrl = new URL(locationHeader, targetUrl).href;
        h2GetRaw(nextUrl, headers, maxTimeSec, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }
      let rawBuf = Buffer.concat(chunks);
      try {
        if (contentEncoding.includes("br")) {
          rawBuf = zlib2.brotliDecompressSync(rawBuf);
        } else if (contentEncoding.includes("gzip")) {
          rawBuf = zlib2.gunzipSync(rawBuf);
        } else if (contentEncoding.includes("deflate")) {
          rawBuf = zlib2.inflateSync(rawBuf);
        }
      } catch {
      }
      resolve({ buf: rawBuf, effectiveUrl: targetUrl, status });
    };
    req.on("end", finalize);
    req.on("error", (err) => {
      if (chunks.length > 0) finalize();
      else finishErr(err);
    });
    req.setTimeout(maxTimeSec * 1e3, () => {
      try {
        req.close();
      } catch {
      }
      if (chunks.length > 0) finalize();
      else finishErr(new Error("HTTP/2 request timeout"));
    });
    req.end();
  });
}
async function curlGetText(targetUrl, headers = {}, maxTimeSec = 6, preferCurlCli = false, forceIpv4 = true) {
  if (!preferCurlCli) {
    try {
      const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
      if (h2.buf.length > 0 && h2.status < 400) {
        return { text: h2.buf.toString("utf8"), effectiveUrl: h2.effectiveUrl };
      }
    } catch {
    }
  }
  return new Promise((resolve, reject) => {
    const args = [
      ...forceIpv4 ? ["-4"] : [],
      "-sS",
      "-L",
      "-k",
      "--compressed",
      "--connect-timeout",
      String(Math.min(3, Math.max(2, maxTimeSec))),
      "--max-time",
      String(maxTimeSec),
      "-w",
      "\n__FINAL_URL__:%{url_effective}"
    ];
    for (const [k, v] of Object.entries(headers)) {
      if (v) args.push("-H", `${k}: ${v}`);
    }
    args.push(targetUrl);
    execFile("curl", args, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        return reject(new Error(stderr || err.message));
      }
      const raw = String(stdout || "");
      const markerIdx = raw.lastIndexOf("\n__FINAL_URL__:");
      if (markerIdx !== -1) {
        return resolve({
          text: raw.slice(0, markerIdx),
          effectiveUrl: raw.slice(markerIdx + 15).trim() || targetUrl
        });
      }
      resolve({ text: raw, effectiveUrl: targetUrl });
    });
  });
}
async function curlGetBufferWithStatus(targetUrl, headers = {}, maxTimeSec = 7) {
  try {
    const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
    if (h2.buf.length > 0 && h2.status >= 200 && h2.status < 400) {
      return { buf: h2.buf, status: h2.status };
    }
  } catch {
  }
  const runCurl = (hdrs) => new Promise((resolve, reject) => {
    const marker = Buffer.from("\n__HTTP_STATUS__:");
    const args = [
      "-4",
      "-sS",
      "-L",
      "-k",
      "--connect-timeout",
      String(Math.min(3, Math.max(2, maxTimeSec))),
      "--max-time",
      String(maxTimeSec),
      "-w",
      "\n__HTTP_STATUS__:%{http_code}"
    ];
    for (const [k, v] of Object.entries(hdrs)) {
      if (v) args.push("-H", `${k}: ${v}`);
    }
    args.push(targetUrl);
    execFile(
      "curl",
      args,
      { encoding: "buffer", maxBuffer: 25 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const outBuf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || "");
        const idx = outBuf.lastIndexOf(marker);
        if (idx !== -1) {
          const codeStr = outBuf.subarray(idx + marker.length).toString("utf8").trim();
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
    const noOriginHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== "origin") noOriginHeaders[k] = v;
    }
    const second = await runCurl(noOriginHeaders).catch(() => ({
      buf: Buffer.alloc(0),
      status: 502
    }));
    if (second.buf.length > 0 && second.status >= 200 && second.status < 400) {
      return second;
    }
    const minimalHeaders = headers.Range ? { Range: headers.Range } : {};
    const third = await runCurl(minimalHeaders).catch(() => ({
      buf: Buffer.alloc(0),
      status: 502
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
async function curlGetBuffer(targetUrl, headers = {}, maxTimeSec = 7) {
  const res = await curlGetBufferWithStatus(targetUrl, headers, maxTimeSec);
  return res.buf;
}
async function curlPostJsonText(url, payload, headers, maxTimeSec = 5) {
  return new Promise((resolve) => {
    const args = [
      "-4",
      "-sS",
      "-L",
      "-k",
      "--compressed",
      "--connect-timeout",
      String(Math.min(3, Math.max(2, maxTimeSec))),
      "--max-time",
      String(maxTimeSec),
      "-X",
      "POST",
      "-H",
      "Content-Type: application/json"
    ];
    for (const [k, v] of Object.entries(headers)) {
      if (v && k.toLowerCase() !== "content-type") args.push("-H", `${k}: ${v}`);
    }
    args.push("-d", JSON.stringify(payload), url);
    execFile("curl", args, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve("");
      resolve(String(stdout || ""));
    });
  });
}

// server/extractors/httpHelperParts/embedSanitizer.ts
var AD_DOMAIN_PATTERNS = [
  "doubleclick",
  "googlesyndication",
  "googleads",
  "adsterra",
  "popads",
  "popunder",
  "exoclick",
  "propeller",
  "onclickmega",
  "clickadu",
  "adcash",
  "hilltopads",
  "profitablecpmrate",
  "capitalhospitals",
  "llvpn",
  "xadsmart",
  "laguneelemong",
  "mbuqxdxsra",
  "acscdn",
  "aclib",
  "tagivi",
  "unfortunatelyejectinflected",
  "lahochat",
  "disable-devtool",
  "lcban",
  "chaldeedaws",
  "sewinramjets",
  "directdexchange",
  "bet365",
  "1xbet",
  "trafficjunky",
  "adnxs"
];
function isBlockedAdUrl(url) {
  const lower = url.toLowerCase();
  return AD_DOMAIN_PATTERNS.some((domain) => lower.includes(domain));
}
function sanitizeEmbedScript(rawJs, _scriptUrl = "") {
  let code = String(rawJs || "");
  if (!code) return code;
  code = code.replace(
    /if\s*\(\s*!\s*([a-zA-Z_$][\w$]*)\.current\s*&&\s*\(\s*\1\.current\s*=\s*!0\s*,\s*window\.self\s*!==\s*window\.top\s*\)\s*\)/g,
    "if(false)"
  ).replace(
    /document\.body\.innerHTML\s*=\s*(['"`])(?:(?!\1).)*?Please Disable Sandbox(?:(?!\1).)*?\1/gi,
    "void 0"
  ).replace(
    /document\.body\.innerHTML\s*=\s*(['"`])(?:(?!\1).)*?Sandbox(?:\s+is)?\s+not\s+allowed(?:(?!\1).)*?\1/gi,
    "void 0"
  ).replace(/\.hasAttribute\(\s*(['"`])sandbox\1\s*\)/g, "&&false").replace(
    /function\s+opaqueOrigin\s*\(\s*\)\s*\{/g,
    "function opaqueOrigin(){return false;"
  ).replace(
    /function\s+sandboxVerdict\s*\(\s*\)\s*\{/g,
    "function sandboxVerdict(){return 'clean';"
  ).replace(/function\s+sandboxDeny\s*\(\s*\)\s*\{/g, "function sandboxDeny(){return;").replace(/function\s+popupsBlocked\s*\(\s*\)\s*\{/g, "function popupsBlocked(){return false;}").replace(
    /function\s+isReallySandboxed\s*\(\s*\)\s*\{/g,
    "function isReallySandboxed(){return false;}"
  ).replace(
    /function\s+Sandboxed\s*\(\s*\)\s*\{[\s\S]{0,120}?\}/gi,
    "function Sandboxed(){return false;}"
  );
  return code;
}
function sanitizeEmbedHtml(rawHtml, baseHref) {
  let html = String(rawHtml || "");
  let resolvedBaseHref = baseHref;
  const existingBaseMatch = html.match(/<base\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i);
  if (existingBaseMatch?.[1]) {
    try {
      resolvedBaseHref = new URL(existingBaseMatch[1], baseHref).href;
    } catch {
      resolvedBaseHref = baseHref;
    }
  }
  html = html.replace(/<base\b[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
  const isEmbedHostHostname = (host) => /(^|\.)(vidfast\.[a-z.]+|vidlink\.pro|vidsrc\.(buzz|sh|to|me|cc|xyz|in|pm)|videm\.buzz|vidrock\.[a-z.]+|vidnest\.[a-z.]+|moviesapi\.[a-z.]+|vsembed\.[a-z.]+|2embed\.cc|streamsrcs\.2embed\.cc)$/i.test(
    host
  );
  html = html.replace(
    /<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/script>/gi,
    (full, preAttrs, src, postAttrs, tail) => {
      const rawSrc = String(src || "");
      if (isBlockedAdUrl(rawSrc) || /adplox|whos\.amung\.us/i.test(rawSrc)) {
        return "<!-- blocked ad script -->";
      }
      try {
        const absUrl = new URL(rawSrc, resolvedBaseHref).href;
        const parsed = new URL(absUrl);
        if (isEmbedHostHostname(parsed.hostname) && /\/_next\/static\/chunks\/|player|embed|sandbox/i.test(parsed.pathname)) {
          const proxiedSrc = `/api/embed-script?url=${encodeURIComponent(
            absUrl
          )}&referer=${encodeURIComponent(resolvedBaseHref)}`;
          const cleanedAttrs = `${preAttrs} ${postAttrs}`.replace(/\s+integrity\s*=\s*["'][^"']*["']/gi, "").replace(/\s+crossorigin(?:\s*=\s*["'][^"']*["'])?/gi, "").trim();
          return `<script ${cleanedAttrs} src="${proxiedSrc}">${tail}</script>`;
        }
      } catch {
      }
      return full;
    }
  );
  html = html.replace(/<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi, (_full, attrs, body) => {
    let code = String(body || "");
    const isLargePlayerScript = code.length > 4e3 || /\bvar\s+Q\s*=|Hls\b|playbtnx|iframesrc|api\.php|__next_f/i.test(code);
    if (!isLargePlayerScript && /aclib|adcash|popunder|disabledevtool|unfortunatelyejectinflected|lahochat|lcban|tagivi|refcheck\.php|onclick\s*=\s*["']?window\.open/i.test(
      code
    )) {
      return "<!-- blocked inline ad script -->";
    }
    code = sanitizeEmbedScript(code, baseHref).replace(/if\s*\(\s*Sandboxed\s*\(\s*\)\s*\)\s*throw\s*[^;]+;/gi, "").replace(/if\s*\(\s*SB\s*===\s*['"]sandboxed['"]\s*\)/g, "if(false)").replace(/SB\s*=\s*['"]sandboxed['"]\s*;/g, "SB='clean';").replace(/if\s*\(\s*isReallySandboxed\s*\(\s*\)\s*\)/g, "if(false)").replace(/if\s*\(\s*popupsBlocked\s*\(\s*\)\s*\)/g, "if(false)").replace(/Sandbox(?: is)? not allowed/gi, "Stream ready").replace(/Remove the sandbox attribute from the iframe to play the video\.?/gi, "").replace(
      /if\s*\(\s*window\s*===\s*window\.top\s*\)\s*\{[\s\S]{0,200}?window\.location\.replace\([^)]*\)\s*;?\s*\}/gi,
      ""
    );
    return `<script${attrs}>${code}</script>`;
  });
  html = html.replace(/<div\b[^>]*id\s*=\s*["']sbxErr["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "").replace(/<a\b[^>]+href\s*=\s*["']https?:\/\/adplox\.com[^"']*["'][^>]*>/gi, '<a href="javascript:void(0)">').replace(/<img\b[^>]+src\s*=\s*["']https?:\/\/whos\.amung\.us[^"']*["'][^>]*>/gi, "");
  const toProxiedNestedEmbed = (urlVal) => {
    const extraRef = /videm\.buzz/i.test(urlVal) ? `&referer=${encodeURIComponent("https://vidsrc.buzz/")}` : "";
    return `/api/embed-proxy?url=${encodeURIComponent(urlVal)}${extraRef}`;
  };
  html = html.replace(
    /(data-src\s*=\s*["'])(https?:\/\/(?:www\.)?(?:vidsrc\.buzz|videm\.buzz|streamsrcs\.2embed\.cc)\/[^"']+)(["'])/gi,
    (_m, pre, urlVal, post) => `${pre}${toProxiedNestedEmbed(urlVal)}${post}`
  ).replace(
    /(go\s*\(\s*['"])(https?:\/\/(?:www\.)?(?:vidsrc\.buzz|videm\.buzz|streamsrcs\.2embed\.cc)\/[^'"]+)(['"]\s*\))/gi,
    (_m, pre, urlVal, post) => `${pre}${toProxiedNestedEmbed(urlVal)}${post}`
  );
  const safeBaseLit = resolvedBaseHref.replace(/"/g, "&quot;");
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
    html = html.replace(/<head\b[^>]*>/i, (m) => `${m}
${guardScript}`);
  } else {
    html = `${guardScript}
${html}`;
  }
  return html;
}
function unwrapRelaySegmentUrl(rawSegUrl, fallbackReferer) {
  try {
    const parsed = new URL(rawSegUrl);
    const wrappedU = parsed.searchParams.get("u");
    if (wrappedU && /^https?:\/\//i.test(wrappedU)) {
      const wrappedR = parsed.searchParams.get("r");
      return {
        url: wrappedU,
        referer: wrappedR && /^https?:\/\//i.test(wrappedR) ? wrappedR : fallbackReferer
      };
    }
  } catch {
  }
  return { url: rawSegUrl, referer: fallbackReferer };
}
function rewriteVidsrcBuzzM3u8(manifestText, baseUrl, embedOrigin) {
  const lines = String(manifestText || "").split(/\r?\n/);
  let firstSegment;
  let expectingVariant = false;
  const rewrittenLines = lines.map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    if (trimmed.startsWith("#")) {
      if (trimmed.startsWith("#EXT-X-STREAM-INF")) {
        expectingVariant = true;
      }
      if (trimmed.includes('URI="')) {
        return raw.replace(/URI="([^"]+)"/g, (_m, uriVal) => {
          try {
            const absUri = new URL(uriVal, baseUrl).href;
            const unwrapped = unwrapRelaySegmentUrl(absUri, embedOrigin);
            if (trimmed.startsWith("#EXT-X-MEDIA") || absUri.includes(".m3u8")) {
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
      const isPlaylist = expectingVariant || /\.m3u8(\?|$)/i.test(unwrapped.url) && !/relay\.videm\.buzz\/seg/i.test(absUrl);
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
    rewritten: rewrittenLines.join("\n"),
    firstSegment
  };
}

// server/services/runtimeMetricsCollector.ts
import os from "os";
import { monitorEventLoopDelay } from "perf_hooks";
var RuntimeMetricsCollector = class {
  eventLoopMonitor = null;
  lastCpuUsage = process.cpuUsage();
  lastCpuSampleAt = Date.now();
  latestCpuPercent = 0;
  httpCounters = {
    totalRequests: 0,
    errors5xx: 0,
    rateLimited429: 0,
    avgLatencyMs: 0
  };
  latencyWindow = [];
  media = {
    hlsRequests: 0,
    tsRequests: 0,
    dvbRequests: 0,
    embedRequests: 0,
    belixRequests: 0,
    musicProxyRequests: 0,
    activeMediaStreams: 0,
    totalBytesProxied: 0,
    nativeFetchSuccess: 0,
    curlFallbackCount: 0,
    directPlayEvaluated: 0,
    directPlayEligible: 0,
    vodManifestCacheHits: 0,
    dvbTranscodeSuccess: 0,
    dvbTranscodeErrors: 0
  };
  aiMetrics = {
    totalRequests: 0,
    fallbackResponses: 0,
    rateLimit429Count: 0,
    overload503Count: 0,
    liveVoiceSessions: 0
  };
  workerStats = {
    mode: "in-process",
    healthy: true,
    sweepsCompleted: 0,
    lastSweepDurationMs: 0,
    lastSweepAt: 0,
    lastError: null
  };
  clientVitals = [];
  adminEvents = [];
  latencyHistory = [];
  constructor() {
    try {
      this.eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
      this.eventLoopMonitor.enable();
    } catch {
      this.eventLoopMonitor = null;
    }
  }
  sampleSystemTick() {
    const now = Date.now();
    const elapsedMs = Math.max(100, now - this.lastCpuSampleAt);
    const diff = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuSampleAt = now;
    const cpuCount = Math.max(1, os.cpus()?.length || 1);
    const totalMicros = diff.user + diff.system;
    const pct = totalMicros / (elapsedMs * 1e3 * cpuCount) * 100;
    this.latestCpuPercent = Number(Math.min(100, Math.max(0, pct)).toFixed(1));
    const mem = process.memoryUsage();
    const el = this.getEventLoopStats();
    this.latencyHistory.push({
      ts: now,
      eventLoopP95Ms: el.p95Ms,
      httpAvgMs: this.httpCounters.avgLatencyMs,
      rssMb: Math.round(mem.rss / (1024 * 1024))
    });
    if (this.latencyHistory.length > 60) {
      this.latencyHistory.shift();
    }
  }
  getEventLoopStats() {
    if (!this.eventLoopMonitor) {
      return { minMs: 0, meanMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
    }
    const toMs = (ns) => Number((Math.max(0, ns) / 1e6).toFixed(2));
    return {
      minMs: toMs(this.eventLoopMonitor.min),
      meanMs: toMs(this.eventLoopMonitor.mean),
      p95Ms: toMs(this.eventLoopMonitor.percentile(95)),
      p99Ms: toMs(this.eventLoopMonitor.percentile(99)),
      maxMs: toMs(this.eventLoopMonitor.max)
    };
  }
  recordHttpRequest(statusCode, durationMs) {
    this.httpCounters.totalRequests += 1;
    if (statusCode >= 500) this.httpCounters.errors5xx += 1;
    if (statusCode === 429) this.httpCounters.rateLimited429 += 1;
    this.latencyWindow.push(Math.max(0, Math.round(durationMs)));
    if (this.latencyWindow.length > 100) this.latencyWindow.shift();
    const sum = this.latencyWindow.reduce((a, b) => a + b, 0);
    this.httpCounters.avgLatencyMs = Math.round(sum / Math.max(1, this.latencyWindow.length));
  }
  recordMediaRequest(kind, bytes = 0) {
    if (kind === "hls") this.media.hlsRequests += 1;
    else if (kind === "ts") this.media.tsRequests += 1;
    else if (kind === "dvb") this.media.dvbRequests += 1;
    else if (kind === "embed") this.media.embedRequests += 1;
    else if (kind === "belix") this.media.belixRequests += 1;
    else if (kind === "music") this.media.musicProxyRequests += 1;
    if (bytes > 0) this.media.totalBytesProxied += bytes;
  }
  adjustActiveMediaStreams(delta) {
    this.media.activeMediaStreams = Math.max(0, this.media.activeMediaStreams + delta);
  }
  recordUpstreamTransport(usedCurlFallback, bytes = 0) {
    if (usedCurlFallback) this.media.curlFallbackCount += 1;
    else this.media.nativeFetchSuccess += 1;
    if (bytes > 0) this.media.totalBytesProxied += bytes;
  }
  recordDirectPlayDecision(eligible) {
    this.media.directPlayEvaluated += 1;
    if (eligible) this.media.directPlayEligible += 1;
  }
  recordVodManifestHit() {
    this.media.vodManifestCacheHits += 1;
  }
  recordDvbTranscodeResult(ok) {
    if (ok) this.media.dvbTranscodeSuccess += 1;
    else this.media.dvbTranscodeErrors += 1;
  }
  recordAiOutcome(outcome) {
    this.aiMetrics.totalRequests += 1;
    if (outcome === "fallback") this.aiMetrics.fallbackResponses += 1;
    if (outcome === "429") this.aiMetrics.rateLimit429Count += 1;
    if (outcome === "503") this.aiMetrics.overload503Count += 1;
  }
  adjustLiveVoiceSessions(delta) {
    this.aiMetrics.liveVoiceSessions = Math.max(0, this.aiMetrics.liveVoiceSessions + delta);
  }
  updateWorkerStatus(patch) {
    Object.assign(this.workerStats, patch);
  }
  recordClientVitals(sample) {
    const entry = {
      id: `vital-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      ...sample
    };
    this.clientVitals.push(entry);
    if (this.clientVitals.length > 200) {
      this.clientVitals.shift();
    }
    return entry;
  }
  pushAdminEvent(event) {
    const entry = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      ...event
    };
    this.adminEvents.unshift(entry);
    if (this.adminEvents.length > 150) {
      this.adminEvents.pop();
    }
    return entry;
  }
  getClientVitalsSummary() {
    const byPlatform = {};
    const byVertical = {};
    for (const s of this.clientVitals) {
      byVertical[s.vertical] = (byVertical[s.vertical] || 0) + 1;
      const cur = byPlatform[s.platform] || { count: 0, avgTtfbMs: 0, avgFcpMs: 0, pwaCount: 0 };
      const nextCount = cur.count + 1;
      cur.avgTtfbMs = typeof s.ttfbMs === "number" ? Math.round((cur.avgTtfbMs * cur.count + s.ttfbMs) / nextCount) : cur.avgTtfbMs;
      cur.avgFcpMs = typeof s.fcpMs === "number" ? Math.round((cur.avgFcpMs * cur.count + s.fcpMs) / nextCount) : cur.avgFcpMs;
      if (s.standalonePwa) cur.pwaCount += 1;
      cur.count = nextCount;
      byPlatform[s.platform] = cur;
    }
    return {
      totalSamples: this.clientVitals.length,
      byPlatform,
      byVertical,
      recent: this.clientVitals.slice(-15).reverse()
    };
  }
  getSnapshot() {
    const mem = process.memoryUsage();
    return {
      ts: Date.now(),
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
      pid: process.pid,
      cpuPercent: this.latestCpuPercent,
      cpuCores: os.cpus()?.length || 1,
      memory: {
        rssMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
        externalMb: Math.round(mem.external / (1024 * 1024)),
        systemFreeMb: Math.round(os.freemem() / (1024 * 1024)),
        systemTotalMb: Math.round(os.totalmem() / (1024 * 1024))
      },
      eventLoop: this.getEventLoopStats(),
      http: { ...this.httpCounters },
      media: { ...this.media },
      ai: { ...this.aiMetrics },
      worker: { ...this.workerStats },
      latencyHistory: [...this.latencyHistory],
      recentEvents: [...this.adminEvents],
      clientVitals: this.getClientVitalsSummary()
    };
  }
};
var runtimeMetrics = new RuntimeMetricsCollector();

// server/routes/proxies/dvbTranscoder.ts
var dvbAacSegmentCache = new LruTtlCache(
  80,
  8e4
);
var dvbRollingPlaylistMap = new LruTtlCache(45, 9e4);
var activeDvbTranscodes = 0;
var MAX_CONCURRENT_DVB_TRANSCODES = 4;
var dvbTranscodeQueue = [];
function scheduleDvbTranscode(fn, highPriority) {
  return new Promise((resolve, reject) => {
    const execTask = () => {
      activeDvbTranscodes++;
      fn().then(resolve, reject).finally(() => {
        activeDvbTranscodes = Math.max(0, activeDvbTranscodes - 1);
        const next = dvbTranscodeQueue.shift();
        if (next) next.run();
      });
    };
    if (activeDvbTranscodes < MAX_CONCURRENT_DVB_TRANSCODES) {
      execTask();
    } else if (highPriority) {
      let insertIdx = 0;
      while (insertIdx < dvbTranscodeQueue.length && dvbTranscodeQueue[insertIdx].highPriority) {
        insertIdx++;
      }
      dvbTranscodeQueue.splice(insertIdx, 0, { run: execTask, highPriority: true });
    } else {
      dvbTranscodeQueue.push({ run: execTask, highPriority: false });
    }
  });
}
function remuxDvbTsToAac(segmentUrl, referer, highPriority = false) {
  const now = Date.now();
  const cached = dvbAacSegmentCache.get(segmentUrl);
  if (cached && now - cached.ts < 75e3) {
    return cached.promise;
  }
  const jobPromise = (async () => {
    const segHeaders = {
      "User-Agent": getPreferredUpstreamUa(segmentUrl),
      Accept: "*/*"
    };
    if (referer) {
      segHeaders["Referer"] = referer;
    }
    let rawBuf = null;
    try {
      const resp = await streamingFetch(segmentUrl, {
        headers: segHeaders,
        timeoutMs: 7e3
      });
      if (resp.ok) {
        rawBuf = Buffer.from(await resp.arrayBuffer());
      }
    } catch {
    }
    if (!rawBuf || rawBuf.length === 0) {
      rawBuf = await curlGetBuffer(segmentUrl, segHeaders, 8);
    }
    if (!rawBuf || rawBuf.length < 376) {
      throw new Error("Empty or truncated DVB TS segment");
    }
    return await scheduleDvbTranscode(
      () => new Promise((resolve, reject) => {
        const ff = spawn(FFMPEG_BIN, [
          "-hide_banner",
          "-loglevel",
          "error",
          "-fflags",
          "+genpts+discardcorrupt",
          "-avoid_negative_ts",
          "make_zero",
          "-f",
          "mpegts",
          "-i",
          "pipe:0",
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-ac",
          "2",
          "-ar",
          "48000",
          "-b:a",
          "128k",
          "-sn",
          "-dn",
          "-copyts",
          "-muxdelay",
          "0",
          "-muxpreload",
          "0",
          "-f",
          "mpegts",
          "pipe:1"
        ]);
        const outChunks = [];
        const safetyTimer = setTimeout(() => {
          try {
            ff.kill("SIGKILL");
          } catch {
          }
        }, 12e3);
        ff.stdout.on("data", (chunk) => outChunks.push(chunk));
        ff.on("error", (err) => {
          clearTimeout(safetyTimer);
          reject(err);
        });
        ff.on("close", (code) => {
          clearTimeout(safetyTimer);
          const remuxed = Buffer.concat(outChunks);
          if (code === 0 && remuxed.length >= 564 && remuxed[0] === 71) {
            runtimeMetrics.recordDvbTranscodeResult(true);
            resolve(remuxed);
          } else {
            runtimeMetrics.recordDvbTranscodeResult(false);
            reject(new Error(`DVB segment remux failed (code=${code}, len=${remuxed.length})`));
          }
        });
        ff.stdin.on("error", () => {
        });
        ff.stdin.end(rawBuf);
      }),
      highPriority
    );
  })();
  jobPromise.catch(() => {
    dvbAacSegmentCache.delete(segmentUrl);
  });
  dvbAacSegmentCache.set(segmentUrl, { promise: jobPromise, ts: now });
  return jobPromise;
}
var DVB_LIVE_ROOT = "/tmp/naim-dvb-live";
try {
  if (fs2.existsSync(DVB_LIVE_ROOT)) {
    fs2.rmSync(DVB_LIVE_ROOT, { recursive: true, force: true });
  }
} catch {
}
var MAX_LIVE_DVB_SESSIONS = 5;
var DVB_SESSION_IDLE_MS = 45e3;
var liveDvbSessions = /* @__PURE__ */ new Map();
var dvbSessionUpstreamMeta = new LruTtlCache(200, 24 * 60 * 60 * 1e3);
function normalizeDvbUpstream(rawUpstreamUrl) {
  return String(rawUpstreamUrl || "").trim().replace(/[?&]profile=(hd|fast|iptv)\b/gi, "");
}
function buildDvbSessionKey(rawUpstreamUrl, profile = "hd") {
  const cleanUpstream = normalizeDvbUpstream(rawUpstreamUrl);
  const hash = crypto2.createHash("sha1").update(`${cleanUpstream}|${profile}`).digest("hex").slice(0, 14);
  return `dvb_${hash}`;
}
function destroyLiveDvbSession(key) {
  const sess = liveDvbSessions.get(key);
  if (!sess) return;
  sess.dead = true;
  liveDvbSessions.delete(key);
  try {
    sess.proc.kill("SIGKILL");
  } catch {
  }
  void fs2.promises.rm(sess.dir, { recursive: true, force: true }).catch(() => {
  });
}
function destroyAllLiveDvbSessions() {
  const keys = Array.from(liveDvbSessions.keys());
  for (const key of keys) {
    destroyLiveDvbSession(key);
  }
  return keys.length;
}
function getActiveDvbSessionCount() {
  return liveDvbSessions.size;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, sess] of liveDvbSessions.entries()) {
    if (sess.dead || now - sess.lastAccessAt > DVB_SESSION_IDLE_MS) {
      destroyLiveDvbSession(key);
    }
  }
}, 15e3).unref();
async function ensureLiveDvbCleanHlsSession(rawUpstreamUrl, profile = "hd", referer = "", attempt = 0) {
  const cleanUpstream = normalizeDvbUpstream(rawUpstreamUrl);
  const sessionKey = buildDvbSessionKey(cleanUpstream, profile);
  dvbSessionUpstreamMeta.set(sessionKey, { upstreamUrl: cleanUpstream, profile, referer });
  const existing = liveDvbSessions.get(sessionKey);
  if (existing && !existing.dead) {
    existing.lastAccessAt = Date.now();
    const ok = await existing.readyPromise;
    const plFile = path2.join(existing.dir, "index.m3u8");
    let fresh = false;
    if (ok && fs2.existsSync(plFile)) {
      try {
        const st = fs2.statSync(plFile);
        fresh = Date.now() - st.mtimeMs < 15e3;
      } catch {
        fresh = false;
      }
    }
    if (fresh) {
      existing.lastAccessAt = Date.now();
      return `/api/dvb-live/${sessionKey}/index.m3u8`;
    }
    destroyLiveDvbSession(sessionKey);
  }
  while (liveDvbSessions.size >= MAX_LIVE_DVB_SESSIONS) {
    let oldestKey = "";
    let oldestAccess = Infinity;
    for (const [k, s] of liveDvbSessions.entries()) {
      if (s.lastAccessAt < oldestAccess) {
        oldestAccess = s.lastAccessAt;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    destroyLiveDvbSession(oldestKey);
  }
  const sessionDir = path2.join(DVB_LIVE_ROOT, sessionKey);
  try {
    await fs2.promises.rm(sessionDir, { recursive: true, force: true });
    await fs2.promises.mkdir(sessionDir, { recursive: true });
  } catch {
    return null;
  }
  const playlistPath = path2.join(sessionDir, "index.m3u8");
  const segmentPattern = path2.join(sessionDir, "seg_%05d.ts");
  const isXtreamLive = /\/live\/[^/]+\/[^/]+\//i.test(cleanUpstream);
  const ffArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-user_agent",
    isXtreamLive ? "IPTVSmartersPlayer" : TDT_DVB_UA
  ];
  if (referer && /^https?:\/\//i.test(referer)) {
    ffArgs.push("-headers", `Referer: ${referer}\r
`);
  }
  const isFastProfile = profile === "fast";
  const isUhd4kStream = /\/stream\/6[4568]\//i.test(cleanUpstream);
  const vfFilter = isUhd4kStream ? isFastProfile ? "fps=25,scale=1280:720:flags=fast_bilinear,format=yuv420p" : "fps=25,scale=1920:1080:flags=fast_bilinear,format=yuv420p" : isFastProfile ? "yadif=0:-1:0,scale='min(1280,iw)':-2,format=yuv420p" : "yadif=0:-1:0,scale='min(1920,iw)':-2,format=yuv420p";
  ffArgs.push(
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "2",
    "-rw_timeout",
    "6000000",
    "-analyzeduration",
    "1200000",
    "-probesize",
    "1500000",
    "-live_start_index",
    "-2",
    "-fflags",
    "+genpts+discardcorrupt",
    "-avoid_negative_ts",
    "make_zero",
    ...isUhd4kStream ? [] : ["-err_detect", "+crccheck+bitstream", "-ec", "favor_inter+deblock"],
    "-i",
    cleanUpstream,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    vfFilter,
    "-c:v",
    "libx264",
    "-preset",
    isUhd4kStream ? "ultrafast" : "superfast",
    "-tune",
    "zerolatency",
    "-profile:v",
    "high",
    "-level:v",
    isFastProfile ? "4.0" : "4.1",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    isFastProfile ? "21" : "19",
    "-maxrate",
    isFastProfile ? "2600k" : "5200k",
    "-bufsize",
    isFastProfile ? "5200k" : "10400k",
    "-r",
    "25",
    "-g",
    "50",
    "-keyint_min",
    "50",
    "-sc_threshold",
    "0",
    "-force_key_frames",
    "expr:gte(t,n_forced*2)",
    "-threads",
    isUhd4kStream ? "3" : "2",
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-b:a",
    "128k",
    "-sn",
    "-dn",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "8",
    "-hls_flags",
    "delete_segments+independent_segments+omit_endlist+temp_file",
    "-hls_segment_filename",
    segmentPattern,
    playlistPath
  );
  const proc = spawn(FFMPEG_BIN, ffArgs);
  const session = {
    key: sessionKey,
    upstreamUrl: cleanUpstream,
    referer,
    dir: sessionDir,
    proc,
    startedAt: Date.now(),
    lastAccessAt: Date.now(),
    dead: false,
    readyPromise: Promise.resolve(false)
  };
  let stderrTail = "";
  proc.stderr?.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-400);
  });
  proc.on("exit", (code) => {
    if (code !== 0 && !session.dead) {
      logger.warn({ key: sessionKey, code, stderrTail }, "dvb_ffmpeg_exited_early");
    }
    session.dead = true;
  });
  proc.on("error", (err) => {
    logger.warn({ key: sessionKey, err: err?.message }, "dvb_ffmpeg_spawn_error");
    session.dead = true;
  });
  session.readyPromise = new Promise((resolve) => {
    const deadline = Date.now() + 12e3;
    let inTick = false;
    const poll = setInterval(async () => {
      if (session.dead) {
        clearInterval(poll);
        resolve(false);
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(poll);
        destroyLiveDvbSession(sessionKey);
        resolve(false);
        return;
      }
      if (inTick) return;
      inTick = true;
      try {
        const content = await fs2.promises.readFile(playlistPath, "utf8");
        const segMatches = content.match(/seg_\d+\.ts/g);
        if (segMatches && segMatches.length >= 2) {
          const firstSegPath = path2.join(sessionDir, segMatches[0]);
          const st = await fs2.promises.stat(firstSegPath);
          if (st.size > 564) {
            clearInterval(poll);
            resolve(true);
            return;
          }
        }
      } catch {
      } finally {
        inTick = false;
      }
    }, 50);
  });
  liveDvbSessions.set(sessionKey, session);
  const ready = await session.readyPromise;
  if (ready) {
    session.lastAccessAt = Date.now();
    return `/api/dvb-live/${sessionKey}/index.m3u8`;
  }
  const elapsed = Date.now() - session.startedAt;
  destroyLiveDvbSession(sessionKey);
  if (attempt === 0 && elapsed < 7e3) {
    return ensureLiveDvbCleanHlsSession(rawUpstreamUrl, profile, referer, 1);
  }
  return null;
}
var handleDvbLive = async (req, res) => {
  runtimeMetrics.recordMediaRequest("dvb");
  const reqId = getOrCreateRequestId(req);
  const sessionKey = String(req.params.sessionKey || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = String(req.params.filename || "").replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!filename || filename.includes("..")) {
    res.status(404).send("Invalid filename");
    return;
  }
  let sess = liveDvbSessions.get(sessionKey);
  if ((!sess || sess.dead) && filename === "index.m3u8") {
    const remembered = dvbSessionUpstreamMeta.get(sessionKey);
    if (remembered) {
      await ensureLiveDvbCleanHlsSession(
        remembered.upstreamUrl,
        remembered.profile,
        remembered.referer
      ).catch(() => null);
      sess = liveDvbSessions.get(sessionKey);
    }
  }
  if (!sess || sess.dead) {
    res.status(404).send("Live session expired");
    return;
  }
  sess.lastAccessAt = Date.now();
  const filePath = path2.join(sess.dir, filename);
  let fileStat = await fs2.promises.stat(filePath).catch(() => null);
  if (!fileStat && filename === "index.m3u8") {
    await sess.readyPromise.catch(() => false);
    fileStat = await fs2.promises.stat(filePath).catch(() => null);
  }
  if (!fileStat) {
    res.status(404).send("Segment not ready");
    return;
  }
  applyProxyCorsHeaders(res, reqId);
  if (filename.endsWith(".m3u8")) {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  } else {
    res.setHeader("Content-Type", "video/mp2t");
    res.setHeader("Cache-Control", "public, max-age=15");
  }
  if (req.method === "HEAD") {
    res.setHeader("Content-Length", String(fileStat.size));
    res.status(200).end();
    return;
  }
  res.sendFile(filePath);
};

// server/routes/proxies/vodManifestManager.ts
var vodHlsManifestCache = new LruTtlCache(400, 10 * 60 * 1e3);
var registeredVodManifestCache = new LruTtlCache(500, 18 * 60 * 1e3);
function createVodManifestHandler(getPublicOrigin2) {
  return (req, res) => {
    const reqId = getOrCreateRequestId(req);
    const id = String(req.params.filename || "").replace(/\.m3u8$/i, "").replace(/[^a-zA-Z0-9_-]/g, "");
    const rawManifest = id ? registeredVodManifestCache.get(id) : void 0;
    if (!rawManifest) {
      res.status(404).send("VOD manifest expired");
      return;
    }
    const useAbs = req.query.abs === "1";
    const originPrefix = useAbs ? getPublicOrigin2(req) : "";
    const out = originPrefix ? rawManifest.replace(/(^|\n)(\/api\/(?:ts-proxy|hls-proxy|vod-manifest)\/[^\n]+)/g, `$1${originPrefix}$2`) : rawManifest;
    applyProxyCorsHeaders(res, reqId);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Content-Length", String(Buffer.byteLength(out)));
    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }
    res.send(out);
  };
}

// server/routes/proxies/embedProxyRoutes.ts
import express from "express";
import { Readable } from "stream";
function registerEmbedProxyRoutes(app2) {
  app2.get("/api/img-proxy", async (req, res) => {
    const rawUrl = String(req.query.url || "");
    const reqId = getOrCreateRequestId(req);
    if (!rawUrl) return res.status(400).end();
    try {
      const fullUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
      await assertSafeProxyUrl(fullUrl);
      const upstream = await streamingFetch(fullUrl, {
        headers: {
          Referer: "https://movidy.work/",
          "User-Agent": CHROME_UA
        },
        timeoutMs: 6e3
      });
      if (!upstream.ok || !upstream.body) return res.status(404).end();
      res.setHeader("X-Naim-Request-Id", reqId);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/webp");
      res.setHeader("Cache-Control", "public, max-age=86400");
      const imgStream = Readable.fromWeb(upstream.body);
      imgStream.on("error", () => {
        if (!res.headersSent) res.status(404);
        if (!res.writableEnded) res.end();
      });
      req.on("close", () => {
        if (!res.writableEnded && !imgStream.destroyed) imgStream.destroy();
      });
      imgStream.pipe(res);
    } catch {
      if (!res.headersSent) res.status(404).end();
    }
  });
  app2.get("/api/embed-proxy", async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || "").trim();
    const explicitReferer = String(req.query.referer || "").trim();
    if (!targetUrl) return res.status(400).send("Missing url");
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      return res.status(403).send("Forbidden target host");
    }
    try {
      const parsedTarget = new URL(targetUrl);
      const defaultReferer = /(\.|^)videm\.buzz$/i.test(parsedTarget.hostname) ? "https://vidsrc.buzz/" : parsedTarget.origin + "/";
      const headers = {
        "User-Agent": CHROME_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        Referer: explicitReferer || defaultReferer
      };
      let html = "";
      let effectiveUrl = targetUrl;
      try {
        const up = await streamingFetch(targetUrl, { headers, timeoutMs: 7e3 });
        if (up.ok) {
          effectiveUrl = up.url || targetUrl;
          html = await up.text();
        }
      } catch {
      }
      if (!html) {
        const fb = await curlGetText(targetUrl, headers, 8, true).catch(() => ({
          text: "",
          effectiveUrl: targetUrl
        }));
        html = fb.text || "";
        effectiveUrl = fb.effectiveUrl || targetUrl;
      }
      if (!html) {
        return res.status(502).send("Upstream embed unavailable");
      }
      const cleanHtml = sanitizeEmbedHtml(html, effectiveUrl);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.status(200).send(cleanHtml);
    } catch {
      return res.status(502).send("Embed proxy failed");
    }
  });
  app2.get("/api/embed-script", async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || "").trim();
    const explicitReferer = String(req.query.referer || "").trim();
    if (!targetUrl) return res.status(400).send("Missing url");
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      return res.status(403).send("Forbidden target host");
    }
    try {
      const parsedTarget = new URL(targetUrl);
      const headers = {
        "User-Agent": CHROME_UA,
        Accept: "*/*",
        Referer: explicitReferer || `${parsedTarget.origin}/`
      };
      let jsCode = "";
      let effectiveUrl = targetUrl;
      try {
        const up = await streamingFetch(targetUrl, { headers, timeoutMs: 6500 });
        if (up.ok) {
          effectiveUrl = up.url || targetUrl;
          jsCode = await up.text();
        }
      } catch {
      }
      if (!jsCode) {
        const fb = await curlGetText(targetUrl, headers, 7, true).catch(() => ({
          text: "",
          effectiveUrl: targetUrl
        }));
        jsCode = fb.text || "";
        effectiveUrl = fb.effectiveUrl || targetUrl;
      }
      if (!jsCode) {
        return res.status(502).send("// Upstream script unavailable");
      }
      const cleanJs = sanitizeEmbedScript(jsCode, effectiveUrl);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=1800");
      return res.status(200).send(cleanJs);
    } catch {
      return res.status(502).send("// Embed script proxy failed");
    }
  });
  app2.all(
    "/api/embed-fetch",
    express.raw({ type: "*/*", limit: "1mb" }),
    async (req, res) => {
      const reqId = getOrCreateRequestId(req);
      if (req.method === "OPTIONS") {
        applyProxyCorsHeaders(res, reqId);
        return res.status(204).end();
      }
      const targetUrl = String(req.query.url || "").trim();
      const explicitReferer = String(req.query.referer || "").trim();
      if (!targetUrl) return res.status(400).send("Missing url");
      try {
        await assertSafeProxyUrl(targetUrl);
      } catch {
        return res.status(403).send("Forbidden target host");
      }
      try {
        const parsedTarget = new URL(targetUrl);
        const refererHeader = explicitReferer || (/(\.|^)videm\.buzz$/i.test(parsedTarget.hostname) ? "https://vidsrc.buzz/" : parsedTarget.origin + "/");
        let originHeader = parsedTarget.origin;
        try {
          originHeader = new URL(refererHeader).origin;
        } catch {
        }
        const forwardedPlayerHeaders = {};
        for (const hName of ["x-requested-with", "x-csrf-token", "x-csrf", "x-token"]) {
          const val = req.headers[hName];
          if (typeof val === "string" && val.trim()) {
            forwardedPlayerHeaders[hName] = val.trim();
          }
        }
        if (req.method === "POST") {
          const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : req.body && typeof req.body === "object" && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : "";
          const postHeaders = {
            "User-Agent": CHROME_UA,
            Accept: "application/json, text/plain, */*",
            Referer: refererHeader,
            Origin: originHeader,
            ...forwardedPlayerHeaders
          };
          if (req.headers["content-type"]) {
            postHeaders["Content-Type"] = String(req.headers["content-type"]);
          }
          let status = 200;
          let respText = "";
          let respCt = "application/json; charset=utf-8";
          try {
            const up = await streamingFetch(targetUrl, {
              method: "POST",
              headers: postHeaders,
              body: rawBody || void 0,
              timeoutMs: 6500
            });
            status = up.status;
            respCt = up.headers.get("content-type") || respCt;
            respText = await up.text();
          } catch {
            let parsedPayload = rawBody;
            try {
              parsedPayload = rawBody ? JSON.parse(rawBody) : {};
            } catch {
            }
            respText = await curlPostJsonText(targetUrl, parsedPayload, postHeaders, 6).catch(
              () => ""
            );
            if (!respText) {
              status = 502;
            }
          }
          applyProxyCorsHeaders(res, reqId);
          res.setHeader("Content-Type", respCt);
          res.setHeader("Cache-Control", "no-store");
          return res.status(status >= 200 && status < 500 ? status : 502).send(respText);
        }
        const getHeaders = {
          "User-Agent": CHROME_UA,
          Accept: "*/*",
          Referer: refererHeader
        };
        let bodyBuf = Buffer.alloc(0);
        let upstreamStatus = 0;
        let effectiveUrl = targetUrl;
        let upstreamCt = "";
        try {
          const up = await streamingFetch(targetUrl, {
            method: req.method === "HEAD" ? "HEAD" : "GET",
            headers: getHeaders,
            timeoutMs: 6500
          });
          upstreamStatus = up.status;
          effectiveUrl = up.url || targetUrl;
          upstreamCt = up.headers.get("content-type") || "";
          if (up.ok && req.method !== "HEAD") {
            bodyBuf = Buffer.from(await up.arrayBuffer());
          }
        } catch {
        }
        if (req.method === "HEAD" && upstreamStatus >= 200 && upstreamStatus < 400) {
          applyProxyCorsHeaders(res, reqId);
          if (upstreamCt) res.setHeader("Content-Type", upstreamCt);
          return res.status(upstreamStatus).end();
        }
        if (!bodyBuf.length && req.method !== "HEAD") {
          const fb = await curlGetBufferWithStatus(targetUrl, getHeaders, 7).catch(() => ({
            buf: Buffer.alloc(0),
            status: 502
          }));
          if (fb.buf.length > 0 && fb.status >= 200 && fb.status < 400) {
            bodyBuf = fb.buf;
            upstreamStatus = fb.status;
          } else {
            const txtFb = await curlGetText(targetUrl, getHeaders, 7, true).catch(() => ({
              text: "",
              effectiveUrl: targetUrl
            }));
            if (txtFb.text) {
              bodyBuf = Buffer.from(txtFb.text, "utf8");
              effectiveUrl = txtFb.effectiveUrl || targetUrl;
              upstreamStatus = 200;
            }
          }
        }
        if (!bodyBuf.length) {
          applyProxyCorsHeaders(res, reqId);
          return res.status(upstreamStatus >= 400 ? upstreamStatus : 502).send("Upstream error");
        }
        const headSnippet = bodyBuf.subarray(0, 512).toString("utf8");
        if (headSnippet.includes("#EXTM3U")) {
          const manifestText = bodyBuf.toString("utf8");
          const { rewritten } = rewriteVidsrcBuzzM3u8(
            manifestText,
            effectiveUrl,
            originHeader + "/"
          );
          applyProxyCorsHeaders(res, reqId);
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          return res.status(200).send(rewritten);
        }
        applyProxyCorsHeaders(res, reqId);
        const trimmedHead = headSnippet.trimStart();
        const inferredCt = upstreamCt || (trimmedHead.startsWith("{") || trimmedHead.startsWith("[") ? "application/json; charset=utf-8" : trimmedHead.startsWith("WEBVTT") ? "text/vtt; charset=utf-8" : "text/plain; charset=utf-8");
        res.setHeader("Content-Type", inferredCt);
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(bodyBuf);
      } catch {
        return res.status(502).send("Embed fetch relay failed");
      }
    }
  );
}

// server/services/vestHelpers/vestTypesAndUtils.ts
import { execFile as execFile2 } from "child_process";
function curlPlainGetText(targetUrl, maxTimeSec = 9) {
  return new Promise((resolve, reject) => {
    execFile2(
      "curl",
      ["-sS", "-L", "--compressed", "--max-time", String(maxTimeSec), targetUrl],
      { maxBuffer: 15 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          return reject(new Error(stderr || err.message));
        }
        resolve(String(stdout || ""));
      }
    );
  });
}

// server/services/vestHelpers/vestSeedsAndRegistry.ts
var vestCatalogRegistry = /* @__PURE__ */ new Map();
var INITIAL_VEST_SEEDS = [
  {
    key: "vdXAbbyiZgaslQlAZ9Z6H",
    websiteParam: "vdXAbbyiZgaslQlAZ9Z6H-One-Piece",
    mediaType: "tv",
    tmdbId: 37854,
    title: "One Piece",
    originalTitle: "One Piece",
    year: "1999",
    rating: "8.9",
    overview: "Monkey D. Luffy se lanza a la mar para encontrar el tesoro legendario One Piece y convertirse en el Rey de los Piratas. Disponible en Doblaje Espa\xF1ol y Sub Espa\xF1ol (720p HLS + subt\xEDtulos multiidioma).",
    poster: "https://img.321moviesfree.com/cover/20260519/1779176008983_b032a8f6de28e5a88036819840a8da11uiIB9ctqZFbfRXXimtpmZb5dusi.webp",
    backdrop: "https://image.tmdb.org/t/p/w1280/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg",
    vestUrl: "https://ww20.321moviesfree.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/",
    mirrorUrls: [
      "https://ww20.321moviesfree.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/",
      "https://es.cuevana4br.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/",
      "https://flixlat.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/",
      "https://ver.123pelicula.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/"
    ],
    languages: ["Castellano", "VOSE"],
    episodeCount: 1188,
    discoveredAt: Date.now()
  },
  {
    key: "MdpUkP2oMneAfFppRBkY4",
    websiteParam: "MdpUkP2oMneAfFppRBkY4-One-Piece",
    mediaType: "tv",
    tmdbId: 37854,
    title: "One Piece (Doblaje Espa\xF1ol)",
    originalTitle: "One Piece",
    year: "1999",
    rating: "8.9",
    overview: "One Piece en Doblaje Espa\xF1ol completo (1.180 episodios en streaming HLS directo 720p/540p sin anuncios en 321moviesfree, Cuevana4br, FlixLat y 123pelicula).",
    poster: "https://img.321moviesfree.com/cover/20260518/1779082523894_b032a8f6de28e5a88036819840a8da11ONE%20PIECE.webp",
    backdrop: "https://image.tmdb.org/t/p/w1280/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg",
    vestUrl: "https://ww20.321moviesfree.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/",
    mirrorUrls: [
      "https://ww20.321moviesfree.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/",
      "https://es.cuevana4br.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/",
      "https://flixlat.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/",
      "https://ver.123pelicula.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/"
    ],
    languages: ["Castellano"],
    episodeCount: 1180,
    discoveredAt: Date.now()
  },
  // Jujutsu Kaisen (TMDB 95479) — Temporadas 1, 2 y 3 (DramasFree / 321Movies)
  {
    key: "gCt2oc0DFw51NrR5EAVrx",
    websiteParam: "gCt2oc0DFw51NrR5EAVrx-Jujutsu-Kaisen",
    mediaType: "tv",
    tmdbId: 95479,
    seasonNumber: 1,
    title: "Jujutsu Kaisen \xB7 Temporada 1",
    originalTitle: "Jujutsu Kaisen",
    year: "2020",
    rating: "8.6",
    overview: "Yuji Itadori se adentra en el mundo de los hechiceros jujutsu tras ingerir un dedo maldito de Ryomen Sukuna. Temporada 1 completa en Doblaje Espa\xF1ol y VOSE.",
    poster: "https://img.dramasfree.com/cover/20260518/1779098925895_cb5aae9815e76914bbe111173fb547d0Jujutsu%20Kaisen.webp",
    backdrop: "https://image.tmdb.org/t/p/w1280/flgn0jXbg8GIe2qaWfd70A0uzfp.jpg",
    vestUrl: "https://www3.dramasfree.com/es/detail/drama/gCt2oc0DFw51NrR5EAVrx-Jujutsu-Kaisen/1/",
    mirrorUrls: [
      "https://www3.dramasfree.com/es/detail/drama/gCt2oc0DFw51NrR5EAVrx-Jujutsu-Kaisen/1/",
      "https://ww20.321moviesfree.com/es/detail/drama/gCt2oc0DFw51NrR5EAVrx-Jujutsu-Kaisen/1/"
    ],
    languages: ["Castellano", "VOSE"],
    episodeCount: 24,
    discoveredAt: Date.now()
  },
  {
    key: "3r6P9qNezGIHi5KaUglFH",
    websiteParam: "3r6P9qNezGIHi5KaUglFH-Jujutsu-Kaisen-Season-2",
    mediaType: "tv",
    tmdbId: 95479,
    seasonNumber: 2,
    title: "Jujutsu Kaisen \xB7 Temporada 2 (Shibuya)",
    originalTitle: "Jujutsu Kaisen Season 2",
    year: "2023",
    rating: "8.8",
    overview: "El pasado de Satoru Gojo y Geto seguido del Incidente de Shibuya. Temporada 2 completa en Doblaje Espa\xF1ol y Sub Espa\xF1ol.",
    poster: "https://img.dramasfree.com/cover/20260518/1779099350450_23a174129837f4db7af067e2a948910cJujutsu%20Kaisen%20Season%202.png",
    backdrop: "https://image.tmdb.org/t/p/w1280/flgn0jXbg8GIe2qaWfd70A0uzfp.jpg",
    vestUrl: "https://www3.dramasfree.com/es/detail/drama/3r6P9qNezGIHi5KaUglFH-Jujutsu-Kaisen-Season-2/1/",
    mirrorUrls: [
      "https://www3.dramasfree.com/es/detail/drama/3r6P9qNezGIHi5KaUglFH-Jujutsu-Kaisen-Season-2/1/",
      "https://ww20.321moviesfree.com/es/detail/drama/3r6P9qNezGIHi5KaUglFH-Jujutsu-Kaisen-Season-2/1/"
    ],
    languages: ["Castellano", "VOSE"],
    episodeCount: 23,
    discoveredAt: Date.now()
  },
  {
    key: "48BzZjCCHYX5ZQvFviD9V",
    websiteParam: "48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3",
    mediaType: "tv",
    tmdbId: 95479,
    seasonNumber: 3,
    title: "Jujutsu Kaisen \xB7 Temporada 3 (Culling Game)",
    originalTitle: "Jujutsu Kaisen Season 3",
    year: "2026",
    rating: "9.0",
    overview: "El Juego del Sacrificio comienza tras el Incidente de Shibuya. Temporada 3 completa (12 episodios) en Doblaje Espa\xF1ol y Sub Espa\xF1ol HD.",
    poster: "https://img.dramasfree.com/cover/20251230/1767080544319_4eb5f2c10b0df3bd35bca2f45b23390c5TmWcu2Gs0uhyCQXle3cCvgrbIA.webp",
    backdrop: "https://image.tmdb.org/t/p/w1280/flgn0jXbg8GIe2qaWfd70A0uzfp.jpg",
    vestUrl: "https://www3.dramasfree.com/es/detail/drama/48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3/1/",
    mirrorUrls: [
      "https://www3.dramasfree.com/es/detail/drama/48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3/1/",
      "https://ww20.321moviesfree.com/es/detail/drama/48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3/1/"
    ],
    languages: ["Castellano", "VOSE"],
    episodeCount: 12,
    discoveredAt: Date.now()
  },
  // From (TMDB 124364) — Temporadas 1, 2, 3 y 4 (321MoviesFree / DramasFree)
  {
    key: "v3HBgSbGMGBfDZO6EzXza",
    websiteParam: "v3HBgSbGMGBfDZO6EzXza-From",
    mediaType: "tv",
    tmdbId: 124364,
    seasonNumber: 1,
    title: "From \xB7 Temporada 1",
    originalTitle: "From",
    year: "2022",
    rating: "8.2",
    overview: "Un pueblo de pesadilla en Am\xE9rica atrapa a todo el que entra mientras criaturas nocturnas acechan en el bosque.",
    poster: "https://image.tmdb.org/t/p/w500/7pHMZ6EsZfs2qZu0Lv2UGtTo5MU.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/m7eiSGHFzr584zFmetGqkqaU6BN.jpg",
    vestUrl: "https://ww20.321moviesfree.com/es/detail/drama/v3HBgSbGMGBfDZO6EzXza-From/1/",
    mirrorUrls: [
      "https://ww20.321moviesfree.com/es/detail/drama/v3HBgSbGMGBfDZO6EzXza-From/1/",
      "https://www3.dramasfree.com/es/detail/drama/v3HBgSbGMGBfDZO6EzXza-From/1/"
    ],
    languages: ["Castellano", "VOSE"],
    episodeCount: 10,
    discoveredAt: Date.now()
  },
  {
    key: "5D00Ra6GMcEITfE8DfE2d",
    websiteParam: "5D00Ra6GMcEITfE8DfE2d-From-Season-2",
    mediaType: "tv",
    tmdbId: 124364,
    seasonNumber: 2,
    title: "From \xB7 Temporada 2",
    originalTitle: "From Season 2",
    year: "2023",
    rating: "8.2",
    overview: "Nuevas verdades ocultas salen a la luz en el pueblo mientras el terror escala.",
    poster: "https://image.tmdb.org/t/p/w500/7pHMZ6EsZfs2qZu0Lv2UGtTo5MU.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/m7eiSGHFzr584zFmetGqkqaU6BN.jpg",
    vestUrl: "https://ww20.321moviesfree.com/es/detail/drama/5D00Ra6GMcEITfE8DfE2d-From-Season-2/1/",
    mirrorUrls: [
      "https://ww20.321moviesfree.com/es/detail/drama/5D00Ra6GMcEITfE8DfE2d-From-Season-2/1/"
    ],
    languages: ["Castellano", "VOSE"],
    episodeCount: 10,
    discoveredAt: Date.now()
  },
  {
    key: "wsUcgDlN09vM0f3AUIoJD",
    websiteParam: "wsUcgDlN09vM0f3AUIoJD-From-Season-3",
    mediaType: "tv",
    tmdbId: 124364,
    seasonNumber: 3,
    title: "From \xB7 Temporada 3",
    originalTitle: "From Season 3",
    year: "2024",
    rating: "8.3",
    overview: "La lucha por escapar se vuelve m\xE1s desesperada que nunca.",
    poster: "https://image.tmdb.org/t/p/w500/7pHMZ6EsZfs2qZu0Lv2UGtTo5MU.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/m7eiSGHFzr584zFmetGqkqaU6BN.jpg",
    vestUrl: "https://ww20.321moviesfree.com/es/detail/drama/wsUcgDlN09vM0f3AUIoJD-From-Season-3/1/",
    mirrorUrls: [
      "https://ww20.321moviesfree.com/es/detail/drama/wsUcgDlN09vM0f3AUIoJD-From-Season-3/1/"
    ],
    languages: ["Castellano", "VOSE"],
    episodeCount: 10,
    discoveredAt: Date.now()
  },
  {
    key: "8JsoLCi6DNWXexKol4WnR",
    websiteParam: "8JsoLCi6DNWXexKol4WnR-From-Season-4",
    mediaType: "tv",
    tmdbId: 124364,
    seasonNumber: 4,
    title: "From \xB7 Temporada 4 (Espa\xF1ol)",
    originalTitle: "From Season 4",
    year: "2026",
    rating: "8.4",
    overview: "Nueva Temporada 4 completa (10 episodios) en Doblaje Espa\xF1ol y Sub Espa\xF1ol HD con subt\xEDtulos sincronizados.",
    poster: "https://img.321moviesfree.com/cover/20260518/1779099655641_9b678d1469ec7cc0b2e3a72dff432890From%20Season%204.webp",
    backdrop: "https://img.321moviesfree.com/cover/20260518/1779099661401_5580672950692c6fda24472c9a072868From%20Season%204.webp",
    vestUrl: "https://ww20.321moviesfree.com/es/detail/drama/8JsoLCi6DNWXexKol4WnR-From-Season-4/1/",
    mirrorUrls: [
      "https://ww20.321moviesfree.com/es/detail/drama/8JsoLCi6DNWXexKol4WnR-From-Season-4/1/",
      "https://ww20.321moviesfree.com/es/detail/drama/MKkK0ZMtYN54vJuysYznp-From-Season-4/1/",
      "https://www3.dramasfree.com/es/detail/drama/8JsoLCi6DNWXexKol4WnR-From-Season-4/1/"
    ],
    languages: ["Castellano", "VOSE"],
    episodeCount: 10,
    discoveredAt: Date.now()
  },
  {
    key: "MKkK0ZMtYN54vJuysYznp",
    websiteParam: "MKkK0ZMtYN54vJuysYznp-From-Season-4",
    mediaType: "tv",
    tmdbId: 124364,
    seasonNumber: 4,
    title: "From \xB7 Temporada 4 (VOSE)",
    originalTitle: "From Season 4",
    year: "2026",
    rating: "8.4",
    overview: "Desvela el misterio de un pueblo de pesadilla que atrapa a todos los que entran. Temporada 4 completa en Sub Espa\xF1ol y Doblaje Espa\xF1ol.",
    poster: "https://img.321moviesfree.com/cover/20260518/1779099655641_9b678d1469ec7cc0b2e3a72dff432890From%20Season%204.webp",
    backdrop: "https://img.321moviesfree.com/cover/20260518/1779099661401_5580672950692c6fda24472c9a072868From%20Season%204.webp",
    vestUrl: "https://ww20.321moviesfree.com/es/detail/drama/MKkK0ZMtYN54vJuysYznp-From-Season-4/1/",
    mirrorUrls: [
      "https://ww20.321moviesfree.com/es/detail/drama/MKkK0ZMtYN54vJuysYznp-From-Season-4/1/",
      "https://ww20.321moviesfree.com/es/detail/drama/8JsoLCi6DNWXexKol4WnR-From-Season-4/1/"
    ],
    languages: ["VOSE", "Castellano"],
    episodeCount: 10,
    discoveredAt: Date.now()
  }
];
for (const seed of INITIAL_VEST_SEEDS) {
  vestCatalogRegistry.set(seed.key, seed);
}

// server/services/mediaPlaneRouter.ts
var KNOWN_DIRECT_PLAY_CORS_HOSTS = [
  /(\.|^)rtve\.es$/i,
  /(\.|^)atresmedia\.com$/i,
  /(\.|^)mediaset\.es$/i,
  /(\.|^)ccma\.cat$/i,
  /(\.|^)akamaized\.net$/i,
  /(\.|^)cloudfront\.net$/i,
  /(\.|^)fastly\.net$/i,
  /(\.|^)twitch\.tv$/i,
  /(\.|^)youtube\.com$/i,
  /(\.|^)googlevideo\.com$/i
];
var REQUIRES_HEADER_PROXY_HOSTS = [
  /(\.|^)stmify\.com$/i,
  /(\.|^)footunder\.online$/i,
  /(\.|^)7odxv0l067ka\.net$/i,
  /(\.|^)futlivehd\.com$/i,
  /(\.|^)streamxhd\.(sbs|st)$/i,
  /(\.|^)rojadirectv\.live$/i,
  /(\.|^)tilinhd\.lol$/i,
  /(\.|^)ok\.ru$/i,
  /(\.|^)vk\.com$/i
];
function getMediaPlaneOrigin() {
  const raw = String(process.env.MEDIA_PROXY_ORIGIN || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(raw) ? raw : null;
}
function evaluateDirectPlayEligibility(targetUrl, opts) {
  const clean = String(targetUrl || "").trim();
  const externalOrigin = getMediaPlaneOrigin();
  if (!clean || !/^https?:\/\//i.test(clean)) {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: "invalid_scheme", recommendedOrigin: externalOrigin };
  }
  if (opts?.forceAac || isDvbHeadendStream(clean)) {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: "dvb_aac_remux_required", recommendedOrigin: externalOrigin };
  }
  if (clean.startsWith("http://")) {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: "mixed_content_http_upgrade", recommendedOrigin: externalOrigin };
  }
  let hostname = "";
  try {
    hostname = new URL(clean).hostname.toLowerCase();
  } catch {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: "malformed_url", recommendedOrigin: externalOrigin };
  }
  if (opts?.referer || REQUIRES_HEADER_PROXY_HOSTS.some((rx) => rx.test(hostname))) {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: "upstream_referer_or_tls_required", recommendedOrigin: externalOrigin };
  }
  const eligible = KNOWN_DIRECT_PLAY_CORS_HOSTS.some((rx) => rx.test(hostname));
  runtimeMetrics.recordDirectPlayDecision(eligible);
  return {
    directPlayEligible: eligible,
    reason: eligible ? "direct_https_cors_cdn" : "standard_proxy_fallback",
    recommendedOrigin: eligible ? null : externalOrigin
  };
}
function getMediaPlaneSnapshot() {
  const snap = runtimeMetrics.getSnapshot();
  const externalOrigin = getMediaPlaneOrigin();
  const totalTransport = snap.media.nativeFetchSuccess + snap.media.curlFallbackCount;
  const nativeRatioPct = totalTransport > 0 ? Math.round(snap.media.nativeFetchSuccess / totalTransport * 100) : 100;
  const directPlayPct = snap.media.directPlayEvaluated > 0 ? Math.round(snap.media.directPlayEligible / snap.media.directPlayEvaluated * 100) : 0;
  return {
    deploymentMode: externalOrigin ? "split-media-origin" : "co-located-isolated",
    mediaProxyOrigin: externalOrigin,
    activeDvbFfmpegSessions: getActiveDvbSessionCount(),
    nativeTransportPct: nativeRatioPct,
    directPlayEligiblePct: directPlayPct,
    metrics: snap.media
  };
}

// server/routes/proxies/hlsProxyHandler.ts
function createHlsProxyHandler(getPublicOrigin2) {
  return async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || "");
    const referer = resolveKnownUpstreamReferer(targetUrl, String(req.query.referer || ""));
    const forceAac = req.query.aac === "1" || isDvbHeadendStream(targetUrl);
    const useAbs = req.query.abs === "1";
    const originPrefix = useAbs ? getPublicOrigin2(req) : "";
    const vodCacheKey = useAbs ? `${originPrefix}|${targetUrl}` : targetUrl;
    if (!targetUrl) {
      res.status(400).send("Missing url");
      return;
    }
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      res.status(403).send("Forbidden target host");
      return;
    }
    runtimeMetrics.recordMediaRequest("hls");
    evaluateDirectPlayEligibility(targetUrl, { referer, forceAac });
    const cachedVod = !forceAac ? vodHlsManifestCache.get(vodCacheKey) : void 0;
    if (cachedVod) {
      runtimeMetrics.recordVodManifestHit();
      applyProxyCorsHeaders(res, reqId);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Content-Length", String(Buffer.byteLength(cachedVod)));
      if (req.method === "HEAD") {
        res.status(200).end();
        return;
      }
      res.send(cachedVod);
      return;
    }
    try {
      const headers = {
        "User-Agent": getPreferredUpstreamUa(targetUrl),
        Accept: "*/*"
      };
      if (referer) {
        headers["Referer"] = referer;
        try {
          headers["Origin"] = new URL(referer).origin;
        } catch {
        }
      }
      let baseUrl = targetUrl;
      let manifestText = "";
      if (shouldBypassNodeFetch(targetUrl)) {
        let fallback = await curlGetText(targetUrl, headers, 7);
        if (!fallback.text || !fallback.text.includes("#EXTM3U")) {
          const plainTxt = await curlPlainGetText(targetUrl, 7).catch(() => "");
          if (plainTxt && plainTxt.includes("#EXTM3U")) {
            fallback = { text: plainTxt, effectiveUrl: targetUrl };
          } else {
            res.status(502).send("Upstream HLS error");
            return;
          }
        }
        baseUrl = fallback.effectiveUrl || targetUrl;
        manifestText = fallback.text;
        runtimeMetrics.recordUpstreamTransport(true, Buffer.byteLength(manifestText));
      } else {
        const hdrCtrl = new AbortController();
        const hdrTimer = setTimeout(() => hdrCtrl.abort(), 4800);
        try {
          const upstream = await streamingFetch(targetUrl, {
            headers,
            signal: hdrCtrl.signal,
            timeoutMs: 4800
          });
          clearTimeout(hdrTimer);
          if (!upstream.ok) {
            throw new Error(`HTTP ${upstream.status}`);
          }
          baseUrl = upstream.url || targetUrl;
          manifestText = await upstream.text();
          if (!manifestText.includes("#EXTM3U") || /nosignal/i.test(manifestText)) {
            throw new Error("Not M3U8 or offline placeholder");
          }
          runtimeMetrics.recordUpstreamTransport(false, Buffer.byteLength(manifestText));
        } catch {
          clearTimeout(hdrTimer);
          markHostNeedsCurlFallback(targetUrl);
          let fallback = await curlGetText(targetUrl, headers, 7);
          if (!fallback.text || !fallback.text.includes("#EXTM3U") || /nosignal/i.test(fallback.text)) {
            const plainTxt = await curlPlainGetText(targetUrl, 7).catch(() => "");
            if (plainTxt && plainTxt.includes("#EXTM3U") && !/nosignal/i.test(plainTxt)) {
              fallback = { text: plainTxt, effectiveUrl: targetUrl };
            } else {
              res.status(502).send("Upstream HLS error");
              return;
            }
          }
          baseUrl = fallback.effectiveUrl || targetUrl;
          manifestText = fallback.text;
          runtimeMetrics.recordUpstreamTransport(true, Buffer.byteLength(manifestText));
        }
      }
      if (/nosignal/i.test(manifestText)) {
        res.status(502).send("Upstream signal offline");
        return;
      }
      const effectiveReferer = referer || new URL(baseUrl).origin + "/";
      let easyBroadcastTokenQs = "";
      try {
        const parsedBase = new URL(baseUrl);
        if (/(\.|^)easybroadcast\.io$/i.test(parsedBase.hostname) && parsedBase.searchParams.has("token")) {
          easyBroadcastTokenQs = parsedBase.search;
        }
      } catch {
      }
      const appendEasyBroadcastToken = (raw) => {
        if (!easyBroadcastTokenQs || /[?&]token=/i.test(raw)) return raw;
        return `${raw}${raw.includes("?") ? "&" : "?"}${easyBroadcastTokenQs.replace(/^\?/, "")}`;
      };
      const lines = manifestText.split(/\r?\n/);
      let nextLineIsVariantPlaylist = false;
      const discoveredTsUrls = [];
      const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith("#")) {
          if (trimmed.startsWith("#EXT-X-STREAM-INF")) {
            nextLineIsVariantPlaylist = true;
          }
          if (trimmed.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (_match, uriVal) => {
              try {
                const absUri = new URL(uriVal, baseUrl).href;
                const unwrapped = unwrapRelaySegmentUrl(absUri, effectiveReferer);
                const resolvedUri = appendEasyBroadcastToken(unwrapped.url);
                if (trimmed.startsWith("#EXT-X-MEDIA") || resolvedUri.includes(".m3u8")) {
                  return `URI="${buildHlsProxyUrl(resolvedUri, unwrapped.referer, forceAac, originPrefix)}"`;
                }
                return `URI="${buildTsProxyUrl(resolvedUri, unwrapped.referer, forceAac, originPrefix)}"`;
              } catch {
                return _match;
              }
            });
          }
          return line;
        }
        try {
          const absUrl = new URL(trimmed, baseUrl).href;
          const unwrapped = unwrapRelaySegmentUrl(absUrl, effectiveReferer);
          const resolvedUrl = appendEasyBroadcastToken(unwrapped.url);
          const isPlaylist = nextLineIsVariantPlaylist || /\.m3u8(\?|$)/i.test(resolvedUrl) && !/relay\.videm\.buzz\/seg/i.test(absUrl) || resolvedUrl.includes("stream_tv=");
          nextLineIsVariantPlaylist = false;
          if (!isPlaylist && forceAac) {
            discoveredTsUrls.push(resolvedUrl);
          }
          return isPlaylist ? buildHlsProxyUrl(resolvedUrl, unwrapped.referer, forceAac, originPrefix) : buildTsProxyUrl(resolvedUrl, unwrapped.referer, forceAac, originPrefix);
        } catch {
          nextLineIsVariantPlaylist = false;
          return line;
        }
      });
      let finalManifest = rewritten.join("\n");
      if (forceAac && discoveredTsUrls.length > 0 && req.method !== "HEAD") {
        for (const segUrl of discoveredTsUrls.slice(-2)) {
          remuxDvbTsToAac(segUrl, effectiveReferer, false).catch(() => {
          });
        }
        if (isDvbHeadendStream(targetUrl) && !manifestText.includes("#EXT-X-STREAM-INF")) {
          const seqMatch = manifestText.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/i);
          if (seqMatch) {
            const baseSeq = parseInt(seqMatch[1], 10);
            const nowMs = Date.now();
            const currentSegs = [];
            let pendingExtinf = "#EXTINF:2.500000,";
            let segOffset = 0;
            for (const rawLine of lines) {
              const t = rawLine.trim();
              if (!t) continue;
              if (t.startsWith("#EXTINF:")) {
                pendingExtinf = t;
              } else if (!t.startsWith("#")) {
                try {
                  const abs = new URL(t, baseUrl).href;
                  currentSegs.push({
                    seq: baseSeq + segOffset,
                    extinf: pendingExtinf,
                    absUrl: abs,
                    proxiedUrl: buildTsProxyUrl(abs, effectiveReferer, true, originPrefix),
                    ts: nowMs
                  });
                  segOffset++;
                } catch {
                }
              }
            }
            if (currentSegs.length > 0) {
              const dvbCacheKey = useAbs ? `${originPrefix}|${targetUrl}` : targetUrl;
              const prevHistory = dvbRollingPlaylistMap.get(dvbCacheKey) || [];
              const bySeq = /* @__PURE__ */ new Map();
              for (const oldSeg of prevHistory) {
                if (nowMs - oldSeg.ts < 65e3 && dvbAacSegmentCache.has(oldSeg.absUrl)) {
                  bySeq.set(oldSeg.seq, oldSeg);
                }
              }
              for (const curSeg of currentSegs) {
                bySeq.set(curSeg.seq, curSeg);
              }
              const maxSeq = currentSegs[currentSegs.length - 1].seq;
              const contiguous = [];
              for (let s = maxSeq; s > maxSeq - 11; s--) {
                const found = bySeq.get(s);
                if (!found) break;
                contiguous.unshift(found);
              }
              dvbRollingPlaylistMap.set(dvbCacheKey, contiguous);
              if (contiguous.length > currentSegs.length) {
                const targetDurMatch = manifestText.match(/#EXT-X-TARGETDURATION:(\d+)/i);
                const targetDur = targetDurMatch ? targetDurMatch[1] : "4";
                const headerLines = [
                  "#EXTM3U",
                  "#EXT-X-VERSION:3",
                  `#EXT-X-MEDIA-SEQUENCE:${contiguous[0].seq}`,
                  "#EXT-X-ALLOW-CACHE:YES",
                  `#EXT-X-TARGETDURATION:${targetDur}`
                ];
                for (const seg of contiguous) {
                  headerLines.push(seg.extinf);
                  headerLines.push(seg.proxiedUrl);
                }
                finalManifest = headerLines.join("\n") + "\n";
              }
            }
          }
        }
      }
      const isStaticVodManifest = manifestText.includes("#EXT-X-ENDLIST") || !manifestText.includes("#EXT-X-MEDIA-SEQUENCE") && targetUrl.includes("ibra.lat");
      if (!forceAac && isStaticVodManifest) {
        vodHlsManifestCache.set(vodCacheKey, finalManifest);
      }
      applyProxyCorsHeaders(res, reqId);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Content-Length", String(Buffer.byteLength(finalManifest)));
      if (req.method === "HEAD") {
        res.status(200).end();
        return;
      }
      res.send(finalManifest);
    } catch (err) {
      logger.error({ err, reqId, targetUrl }, "hls_proxy_fetch_failed");
      res.status(502).send("HLS proxy fetch failed");
    }
  };
}

// server/routes/proxies/tsProxyHandler.ts
import { Readable as Readable2 } from "stream";
async function handleTsProxy(req, res) {
  const reqId = getOrCreateRequestId(req);
  const targetUrl = String(req.query.url || "");
  const referer = resolveKnownUpstreamReferer(targetUrl, String(req.query.referer || ""));
  const forceAac = req.query.aac === "1" || isDvbHeadendStream(targetUrl);
  if (!targetUrl) {
    res.status(400).end();
    return;
  }
  try {
    await assertSafeProxyUrl(targetUrl);
  } catch {
    res.status(403).end();
    return;
  }
  runtimeMetrics.recordMediaRequest("ts");
  const isUrlSubtitle = /\.(vtt|webvtt|srt)(\?|$)/i.test(targetUrl);
  const isUrlMp4 = /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(targetUrl) || /\/segs\/[^/]+\/init\./i.test(targetUrl) || /bcdn\.hakunaymatata\.com/i.test(targetUrl) || /[?&](?:mime|type)=video(?:%2F|\/)mp4/i.test(targetUrl);
  const effectiveForceAac = !isUrlSubtitle && !isUrlMp4 && forceAac;
  if (req.method === "HEAD") {
    if (effectiveForceAac) {
      try {
        const remuxedBuf = await remuxDvbTsToAac(targetUrl, referer, true);
        if (req.destroyed || res.writableEnded) return;
        if (!remuxedBuf || remuxedBuf.length < 564 || remuxedBuf[0] !== 71) {
          res.status(502).end();
          return;
        }
        applyProxyCorsHeaders(res, reqId);
        res.status(200);
        res.setHeader("Content-Type", "video/mp2t");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Length", String(remuxedBuf.length));
        res.end();
        return;
      } catch {
        if (!res.writableEnded) res.status(502).end();
        return;
      }
    }
    const defaultHeadCt = isUrlSubtitle ? "text/vtt; charset=utf-8" : isUrlMp4 ? "video/mp4" : "video/mp2t";
    try {
      const headers2 = {
        "User-Agent": getPreferredUpstreamUa(targetUrl),
        Accept: "*/*"
      };
      if (referer) headers2["Referer"] = referer;
      const upstream = await streamingFetch(targetUrl, {
        method: "HEAD",
        headers: headers2,
        timeoutMs: 5e3
      });
      applyProxyCorsHeaders(res, reqId);
      res.status(upstream.status);
      res.setHeader("Content-Type", defaultHeadCt);
      res.setHeader("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
      const cl = upstream.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);
      res.end();
      return;
    } catch {
      applyProxyCorsHeaders(res, reqId);
      res.status(200);
      res.setHeader("Content-Type", defaultHeadCt);
      res.setHeader("Accept-Ranges", "bytes");
      res.end();
      return;
    }
  }
  if (effectiveForceAac) {
    try {
      const remuxedBuf = await remuxDvbTsToAac(targetUrl, referer, true);
      if (req.destroyed || res.writableEnded) return;
      if (!remuxedBuf || remuxedBuf.length < 564 || remuxedBuf[0] !== 71) {
        res.status(502).end();
        return;
      }
      res.status(200);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Cache-Control", "public, max-age=20");
      res.setHeader("Content-Length", String(remuxedBuf.length));
      res.end(remuxedBuf);
      return;
    } catch {
      if (req.destroyed || res.writableEnded) return;
      res.status(502).end();
      return;
    }
  }
  const headers = {
    "User-Agent": getPreferredUpstreamUa(targetUrl),
    Accept: "*/*"
  };
  if (referer) {
    headers["Referer"] = referer;
    try {
      headers["Origin"] = new URL(referer).origin;
    } catch {
    }
  }
  const rawRange = String(req.headers.range || "");
  const rangeMatch = rawRange.match(/^bytes=(\d+)-(\d*)$/i);
  const isInitialByteZeroRangeProbe = Boolean(rangeMatch && parseInt(rangeMatch[1], 10) === 0 && !isUrlMp4);
  if (req.headers.range && !isInitialByteZeroRangeProbe) {
    headers["Range"] = req.headers.range;
  }
  const hdrCtrl = new AbortController();
  const hdrTimer = setTimeout(() => hdrCtrl.abort(), 6500);
  req.on("close", () => {
    if (!res.writableEnded) hdrCtrl.abort();
  });
  const isLiveSportsStreamHost = /footunder\.online|7odxv0l067ka\.net|futlivehd\.com|streamxhd\.(?:sbs|st)|tilinhd\.lol/i.test(
    targetUrl
  );
  try {
    if (!isLiveSportsStreamHost && shouldBypassNodeFetch(targetUrl)) {
      throw new Error("Use fast curl/h2 fallback");
    }
    let upstream = await streamingFetch(targetUrl, {
      headers,
      signal: hdrCtrl.signal,
      timeoutMs: 6500
    });
    if ((upstream.status === 400 || upstream.status === 401 || upstream.status === 403 || upstream.status === 406) && headers["Origin"]) {
      const noOriginHeaders = { ...headers };
      delete noOriginHeaders["Origin"];
      const retryResp = await streamingFetch(targetUrl, {
        headers: noOriginHeaders,
        signal: hdrCtrl.signal,
        timeoutMs: 9e3
      }).catch(() => null);
      if (retryResp && retryResp.ok && retryResp.body) {
        upstream = retryResp;
      }
    } else if (upstream.status >= 500 || upstream.status === 429) {
      await new Promise((r) => setTimeout(r, 180));
      if (!hdrCtrl.signal.aborted) {
        const retryResp = await streamingFetch(targetUrl, {
          headers,
          signal: hdrCtrl.signal,
          timeoutMs: 9e3
        }).catch(() => null);
        if (retryResp && retryResp.ok && retryResp.body) {
          upstream = retryResp;
        }
      }
    }
    clearTimeout(hdrTimer);
    if (!upstream.ok || !upstream.body) {
      if (isUrlMp4 && (upstream.status === 429 || upstream.status === 403 || upstream.status === 404 || upstream.status === 410)) {
        try {
          await upstream.body?.cancel?.();
        } catch {
        }
        res.status(upstream.status === 429 ? 429 : 502).end();
        return;
      }
      throw new Error(`TS upstream ${upstream.status}`);
    }
    const rawCt = (upstream.headers.get("content-type") || "").toLowerCase();
    if (isUrlMp4 && (rawCt.startsWith("text/html") || rawCt.includes("application/json"))) {
      try {
        await upstream.body?.cancel?.();
      } catch {
      }
      res.status(502).end();
      return;
    }
    const isSubtitleContent = isUrlSubtitle || rawCt.includes("vtt") || rawCt.includes("subrip");
    const isDisguisedSegment = !isSubtitleContent && (!rawCt || rawCt.startsWith("text/html") || rawCt.startsWith("text/plain") || rawCt.startsWith("text/css") || rawCt.startsWith("image/") || rawCt.startsWith("font/") || rawCt.includes("woff") || rawCt.includes("javascript") || rawCt.startsWith("application/octet-stream"));
    const shouldSniffImageHeader = !isUrlMp4 && !isSubtitleContent && isDisguisedSegment && (!req.headers.range || isInitialByteZeroRangeProbe);
    const cl = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");
    const ar = upstream.headers.get("accept-ranges");
    if (isInitialByteZeroRangeProbe && shouldSniffImageHeader && rangeMatch) {
      const parsedReqEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 65535;
      const maxProbeBytes = Math.min(512 * 1024, Math.max(65536, parsedReqEnd + 16384));
      const reader = upstream.body.getReader();
      const probeChunks2 = [];
      let totalRead = 0;
      let streamCompleted = false;
      try {
        while (totalRead < maxProbeBytes) {
          const { done, value } = await reader.read();
          if (done) {
            streamCompleted = true;
            break;
          }
          if (value && value.length > 0) {
            const b = Buffer.from(value);
            probeChunks2.push(b);
            totalRead += b.length;
          }
        }
      } finally {
        await reader.cancel().catch(() => {
        });
      }
      const fullBuf = Buffer.concat(probeChunks2);
      const offset = findDisguisedTsOffset(fullBuf);
      const cleanBuf = offset > 0 ? fullBuf.subarray(offset) : fullBuf;
      const crTotalMatch = cr?.match(/\/(\d+)$/);
      const rawTotalLen = crTotalMatch ? parseInt(crTotalMatch[1], 10) : cl ? parseInt(cl, 10) : streamCompleted ? fullBuf.length : 0;
      const adjustedTotal = rawTotalLen > offset ? rawTotalLen - offset : Math.max(cleanBuf.length, 1);
      const reqEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : cleanBuf.length - 1;
      const end = Math.min(Math.max(cleanBuf.length - 1, 0), Math.max(0, reqEnd));
      const slice = cleanBuf.subarray(0, end + 1);
      applyProxyCorsHeaders(res, reqId);
      res.status(206);
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Range", `bytes 0-${end}/${adjustedTotal}`);
      res.setHeader("Content-Length", String(slice.length));
      res.end(slice);
      return;
    }
    const writeCommonHeaders = (clAdjust = 0) => {
      res.status(upstream.status);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader(
        "Content-Type",
        isSubtitleContent ? "text/vtt; charset=utf-8" : isDisguisedSegment ? isUrlMp4 ? "video/mp4" : "video/mp2t" : rawCt
      );
      if (cl) {
        const numCl = Number(cl);
        if (Number.isFinite(numCl) && numCl > clAdjust) {
          res.setHeader("Content-Length", String(numCl - clAdjust));
        }
      }
      if (cr) res.setHeader("Content-Range", cr);
      if (ar) res.setHeader("Accept-Ranges", ar);
    };
    const nodeStream = Readable2.fromWeb(upstream.body);
    runtimeMetrics.adjustActiveMediaStreams(1);
    let streamMetricClosed = false;
    const releaseStreamMetric = () => {
      if (streamMetricClosed) return;
      streamMetricClosed = true;
      runtimeMetrics.adjustActiveMediaStreams(-1);
    };
    res.once("close", releaseStreamMetric);
    res.once("finish", releaseStreamMetric);
    let streamIdleTimer = null;
    const armIdleTimer = () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      streamIdleTimer = setTimeout(() => {
        nodeStream.destroy();
      }, 2e4);
    };
    armIdleTimer();
    nodeStream.on("data", armIdleTimer);
    nodeStream.once("end", () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
    });
    nodeStream.once("close", () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      releaseStreamMetric();
    });
    nodeStream.on("error", () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      releaseStreamMetric();
      if (!res.headersSent) res.status(502);
      if (!res.writableEnded) res.end();
    });
    req.on("close", () => {
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      releaseStreamMetric();
      if (!res.writableEnded && !nodeStream.destroyed) nodeStream.destroy();
    });
    runtimeMetrics.recordUpstreamTransport(false);
    if (!shouldSniffImageHeader) {
      writeCommonHeaders(0);
      nodeStream.pipe(res);
      return;
    }
    let headerChecked = false;
    const probeChunks = [];
    let probeLen = 0;
    const flushInitial = (ended) => {
      if (headerChecked) return;
      headerChecked = true;
      const headBuf = Buffer.concat(probeChunks);
      const offset = findDisguisedTsOffset(headBuf);
      writeCommonHeaders(offset);
      if (offset > 0) {
        res.write(headBuf.subarray(offset));
      } else if (headBuf.length > 0) {
        res.write(headBuf);
      }
      probeChunks.length = 0;
      if (ended) {
        res.end();
      }
    };
    nodeStream.on("data", (chunk) => {
      if (!headerChecked) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        probeChunks.push(b);
        probeLen += b.length;
        if (probeLen >= 512) {
          flushInitial(false);
        }
      } else if (!res.writableEnded) {
        if (!res.write(chunk)) {
          nodeStream.pause();
          res.once("drain", () => nodeStream.resume());
        }
      }
    });
    nodeStream.once("end", () => {
      if (!headerChecked) {
        flushInitial(true);
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  } catch (err) {
    clearTimeout(hdrTimer);
    if (req.destroyed || res.writableEnded) return;
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!errMsg.startsWith("TS upstream ") && !errMsg.includes("Use fast curl")) {
      markHostNeedsCurlFallback(targetUrl);
    }
    if (res.headersSent) {
      res.end();
      return;
    }
    try {
      const buf = await curlGetBuffer(targetUrl, headers, 18);
      if (req.destroyed || res.writableEnded) return;
      if (!buf || buf.length === 0) {
        res.status(502).end();
        return;
      }
      const headProbe = buf.subarray(0, Math.min(buf.length, 64)).toString("utf8").trimStart();
      if (/^(<!doctype|<html\b|<head\b|<body\b)/i.test(headProbe)) {
        res.status(502).end();
        return;
      }
      const boxType = buf.length >= 8 ? buf.subarray(4, 8).toString("ascii") : "";
      const isFmp4Buffer = isUrlMp4 || boxType === "ftyp" || boxType === "styp" || boxType === "moof" || boxType === "sidx";
      let cleanFullBuf = buf;
      if (!isFmp4Buffer) {
        const tsOff = findDisguisedTsOffset(buf);
        if (tsOff > 0) cleanFullBuf = buf.subarray(tsOff);
      }
      let outBuf = cleanFullBuf;
      let statusCode = 200;
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const rawEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : cleanFullBuf.length - 1;
        if (start >= 0 && start < cleanFullBuf.length) {
          const end = Math.min(cleanFullBuf.length - 1, Math.max(start, rawEnd));
          outBuf = cleanFullBuf.subarray(start, end + 1);
          statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${cleanFullBuf.length}`);
          res.setHeader("Accept-Ranges", "bytes");
        }
      }
      res.status(statusCode);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader("Content-Type", isFmp4Buffer ? "video/mp4" : "video/mp2t");
      res.setHeader("Content-Length", String(outBuf.length));
      runtimeMetrics.recordUpstreamTransport(true, outBuf.length);
      res.end(outBuf);
    } catch {
      if (!res.headersSent) res.status(502);
      res.end();
    }
  }
}

// server/routes/proxies.ts
function registerProxyRoutes(app2, deps) {
  const { getPublicOrigin: getPublicOrigin2 } = deps;
  app2.options(
    [
      "/api/dvb-live/:sessionKey/:filename",
      "/api/vod-manifest/:filename",
      "/api/embed-proxy",
      "/api/embed-fetch",
      "/api/hls-proxy",
      "/api/hls-proxy/:filename",
      "/api/ts-proxy",
      "/api/ts-proxy/:filename",
      "/naim-cine.m3u",
      "/NAIM-CINE-Samsung-TV.m3u",
      "/riffantv.m3u",
      "/riffantv-smarttv.m3u",
      "/channels.m3u",
      "/playlist.m3u",
      "/iptv.m3u",
      "/naim-cine.m3u8",
      "/api/iptv/playlist.m3u",
      "/api/iptv/live/:channelId",
      "/api/iptv/logo/:channelId",
      "/epg.xml",
      "/riffantv-epg.xml",
      "/api/iptv/epg.xml"
    ],
    (req, res) => {
      applyProxyCorsHeaders(res, getOrCreateRequestId(req));
      res.status(204).end();
    }
  );
  registerEmbedProxyRoutes(app2);
  const handleVodManifest = createVodManifestHandler(getPublicOrigin2);
  app2.get("/api/vod-manifest/:filename", handleVodManifest);
  app2.head("/api/vod-manifest/:filename", handleVodManifest);
  app2.get("/api/dvb-live/:sessionKey/:filename", handleDvbLive);
  app2.head("/api/dvb-live/:sessionKey/:filename", handleDvbLive);
  const handleHlsProxy = createHlsProxyHandler(getPublicOrigin2);
  app2.get(["/api/hls-proxy", "/api/hls-proxy/:filename"], handleHlsProxy);
  app2.head(["/api/hls-proxy", "/api/hls-proxy/:filename"], handleHlsProxy);
  app2.get(["/api/ts-proxy", "/api/ts-proxy/:filename"], handleTsProxy);
  app2.head(["/api/ts-proxy", "/api/ts-proxy/:filename"], handleTsProxy);
}

// server/utils/gracefulShutdown.ts
function createGracefulShutdownHandler(deps) {
  let shuttingDown = false;
  const timeoutMs = deps.timeoutMs ?? 6e3;
  const exitFn = deps.exitFn ?? ((code) => process.exit(code));
  return async function handleShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "graceful_shutdown_started");
    const forceTimer = setTimeout(() => {
      logger.warn({ signal, timeoutMs }, "graceful_shutdown_forced_exit");
      exitFn(0);
    }, timeoutMs);
    forceTimer.unref?.();
    for (const stop of deps.stopTimers || []) {
      try {
        stop();
      } catch (err) {
        logger.warn({ err }, "graceful_shutdown_timer_stop_error");
      }
    }
    for (const cleanup of deps.cleanupSessions || []) {
      try {
        await cleanup();
      } catch (err) {
        logger.warn({ err }, "graceful_shutdown_session_cleanup_error");
      }
    }
    if (deps.wss) {
      try {
        for (const client of deps.wss.clients) {
          try {
            if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) {
              client.close(1001, "Server restarting");
            }
          } catch {
          }
        }
        await new Promise((resolve) => {
          deps.wss?.close(() => resolve());
        });
      } catch (err) {
        logger.warn({ err }, "graceful_shutdown_wss_close_error");
      }
    }
    await new Promise((resolve) => {
      deps.httpServer.close((err) => {
        if (err) {
          logger.warn({ err }, "graceful_shutdown_http_close_warning");
        }
        resolve();
      });
    });
    clearTimeout(forceTimer);
    logger.info({ signal }, "graceful_shutdown_complete");
    exitFn(0);
  };
}

// server/mediaServer.ts
dns2.setDefaultResultOrder("ipv4first");
var MEDIA_PORT = Number(process.env.MEDIA_PORT || 3001);
var app = express2();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(securityHeadersMiddleware);
function getPublicOrigin(req) {
  const rawProto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
  const rawHost = String(req.headers["x-forwarded-host"] || req.get("host") || `localhost:${MEDIA_PORT}`).split(",")[0].trim();
  return `${rawProto}://${rawHost}`;
}
app.get(["/health", "/ready"], (_req, res) => {
  res.json({
    ok: true,
    role: "riffan-media-plane",
    env: ENV.nodeEnv,
    mediaPlane: getMediaPlaneSnapshot(),
    ts: Date.now()
  });
});
registerProxyRoutes(app, { getPublicOrigin });
var httpServer = createServer(app);
httpServer.listen(MEDIA_PORT, "0.0.0.0", () => {
  logger.info({ port: MEDIA_PORT }, "riffan_media_plane_started");
});
var shutdown = createGracefulShutdownHandler({
  httpServer,
  cleanupSessions: [
    () => {
      destroyAllLiveDvbSessions();
    }
  ]
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
