import express from 'express';
import { Readable } from 'stream';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import {
  CHROME_UA,
  curlGetBufferWithStatus,
  curlGetText,
  curlPostJsonText,
  rewriteVidsrcBuzzM3u8,
  sanitizeEmbedHtml,
  sanitizeEmbedScript,
} from '../../extractors/httpHelpers.ts';
import { applyProxyCorsHeaders, getOrCreateRequestId } from './proxyUtils.ts';

export function registerEmbedProxyRoutes(app: express.Express): void {
  app.get('/api/img-proxy', async (req, res) => {
    const rawUrl = String(req.query.url || '');
    const reqId = getOrCreateRequestId(req);
    if (!rawUrl) return res.status(400).end();

    try {
      const fullUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
      await assertSafeProxyUrl(fullUrl);
      const upstream = await streamingFetch(fullUrl, {
        headers: {
          Referer: 'https://movidy.work/',
          'User-Agent': CHROME_UA,
        },
        timeoutMs: 6000,
      });
      if (!upstream.ok || !upstream.body) return res.status(404).end();

      res.setHeader('X-Naim-Request-Id', reqId);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const imgStream = Readable.fromWeb(upstream.body as never);
      imgStream.on('error', () => {
        if (!res.headersSent) res.status(404);
        if (!res.writableEnded) res.end();
      });
      req.on('close', () => {
        if (!res.writableEnded && !imgStream.destroyed) imgStream.destroy();
      });
      imgStream.pipe(res);
    } catch {
      if (!res.headersSent) res.status(404).end();
    }
  });

  app.get('/api/embed-proxy', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || '').trim();
    const explicitReferer = String(req.query.referer || '').trim();
    if (!targetUrl) return res.status(400).send('Missing url');
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      return res.status(403).send('Forbidden target host');
    }

    try {
      const parsedTarget = new URL(targetUrl);
      const defaultReferer = /(\.|^)videm\.buzz$/i.test(parsedTarget.hostname)
        ? 'https://vidsrc.buzz/'
        : parsedTarget.origin + '/';
      const headers: Record<string, string> = {
        'User-Agent': CHROME_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        Referer: explicitReferer || defaultReferer,
      };

      let html = '';
      let effectiveUrl = targetUrl;
      try {
        const up = await streamingFetch(targetUrl, { headers, timeoutMs: 7000 });
        if (up.ok) {
          effectiveUrl = up.url || targetUrl;
          html = await up.text();
        }
      } catch {
        // fallback to curl
      }

      if (!html) {
        const fb = await curlGetText(targetUrl, headers, 8, true).catch(() => ({
          text: '',
          effectiveUrl: targetUrl,
        }));
        html = fb.text || '';
        effectiveUrl = fb.effectiveUrl || targetUrl;
      }

      if (!html) {
        return res.status(502).send('Upstream embed unavailable');
      }

      const cleanHtml = sanitizeEmbedHtml(html, effectiveUrl);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).send(cleanHtml);
    } catch {
      return res.status(502).send('Embed proxy failed');
    }
  });

  app.get('/api/embed-script', async (req, res) => {
    const reqId = getOrCreateRequestId(req);
    const targetUrl = String(req.query.url || '').trim();
    const explicitReferer = String(req.query.referer || '').trim();
    if (!targetUrl) return res.status(400).send('Missing url');
    try {
      await assertSafeProxyUrl(targetUrl);
    } catch {
      return res.status(403).send('Forbidden target host');
    }

    try {
      const parsedTarget = new URL(targetUrl);
      const headers: Record<string, string> = {
        'User-Agent': CHROME_UA,
        Accept: '*/*',
        Referer: explicitReferer || `${parsedTarget.origin}/`,
      };
      let jsCode = '';
      let effectiveUrl = targetUrl;
      try {
        const up = await streamingFetch(targetUrl, { headers, timeoutMs: 6500 });
        if (up.ok) {
          effectiveUrl = up.url || targetUrl;
          jsCode = await up.text();
        }
      } catch {
        // fallback to curl
      }
      if (!jsCode) {
        const fb = await curlGetText(targetUrl, headers, 7, true).catch(() => ({
          text: '',
          effectiveUrl: targetUrl,
        }));
        jsCode = fb.text || '';
        effectiveUrl = fb.effectiveUrl || targetUrl;
      }
      if (!jsCode) {
        return res.status(502).send('// Upstream script unavailable');
      }
      const cleanJs = sanitizeEmbedScript(jsCode, effectiveUrl);
      applyProxyCorsHeaders(res, reqId);
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=1800');
      return res.status(200).send(cleanJs);
    } catch {
      return res.status(502).send('// Embed script proxy failed');
    }
  });

  app.all(
    '/api/embed-fetch',
    express.raw({ type: '*/*', limit: '1mb' }),
    async (req, res) => {
      const reqId = getOrCreateRequestId(req);
      if (req.method === 'OPTIONS') {
        applyProxyCorsHeaders(res, reqId);
        return res.status(204).end();
      }

      const targetUrl = String(req.query.url || '').trim();
      const explicitReferer = String(req.query.referer || '').trim();
      if (!targetUrl) return res.status(400).send('Missing url');
      try {
        await assertSafeProxyUrl(targetUrl);
      } catch {
        return res.status(403).send('Forbidden target host');
      }

      try {
        const parsedTarget = new URL(targetUrl);
        const refererHeader =
          explicitReferer ||
          (/(\.|^)videm\.buzz$/i.test(parsedTarget.hostname)
            ? 'https://vidsrc.buzz/'
            : parsedTarget.origin + '/');
        let originHeader = parsedTarget.origin;
        try {
          originHeader = new URL(refererHeader).origin;
        } catch {
          // keep parsedTarget.origin
        }

        const forwardedPlayerHeaders: Record<string, string> = {};
        for (const hName of ['x-requested-with', 'x-csrf-token', 'x-csrf', 'x-token']) {
          const val = req.headers[hName];
          if (typeof val === 'string' && val.trim()) {
            forwardedPlayerHeaders[hName] = val.trim();
          }
        }

        if (req.method === 'POST') {
          const rawBody = Buffer.isBuffer(req.body)
            ? req.body.toString('utf8')
            : typeof req.body === 'string'
              ? req.body
              : req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0
                ? JSON.stringify(req.body)
                : '';
          const postHeaders: Record<string, string> = {
            'User-Agent': CHROME_UA,
            Accept: 'application/json, text/plain, */*',
            Referer: refererHeader,
            Origin: originHeader,
            ...forwardedPlayerHeaders,
          };
          if (req.headers['content-type']) {
            postHeaders['Content-Type'] = String(req.headers['content-type']);
          }
          let status = 200;
          let respText = '';
          let respCt = 'application/json; charset=utf-8';
          try {
            const up = await streamingFetch(targetUrl, {
              method: 'POST',
              headers: postHeaders,
              body: rawBody || undefined,
              timeoutMs: 6500,
            });
            status = up.status;
            respCt = up.headers.get('content-type') || respCt;
            respText = await up.text();
          } catch {
            let parsedPayload: unknown = rawBody;
            try {
              parsedPayload = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              // keep raw string if not JSON
            }
            respText = await curlPostJsonText(targetUrl, parsedPayload, postHeaders, 6).catch(
              () => ''
            );
          }
          applyProxyCorsHeaders(res, reqId);
          res.setHeader('Content-Type', respCt);
          res.setHeader('Cache-Control', 'no-store');
          return res.status(status >= 200 && status < 500 ? status : 502).send(respText);
        }

        const getHeaders: Record<string, string> = {
          'User-Agent': CHROME_UA,
          Accept: '*/*',
          Referer: refererHeader,
        };

        let bodyBuf: Buffer = Buffer.alloc(0);
        let upstreamStatus = 0;
        let effectiveUrl = targetUrl;
        let upstreamCt = '';

        try {
          const up = await streamingFetch(targetUrl, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: getHeaders,
            timeoutMs: 6500,
          });
          upstreamStatus = up.status;
          effectiveUrl = up.url || targetUrl;
          upstreamCt = up.headers.get('content-type') || '';
          if (up.ok && req.method !== 'HEAD') {
            bodyBuf = Buffer.from(await up.arrayBuffer());
          }
        } catch {
          // fallback to curl below
        }

        if (req.method === 'HEAD' && upstreamStatus >= 200 && upstreamStatus < 400) {
          applyProxyCorsHeaders(res, reqId);
          if (upstreamCt) res.setHeader('Content-Type', upstreamCt);
          return res.status(upstreamStatus).end();
        }

        if (!bodyBuf.length && req.method !== 'HEAD') {
          const fb = await curlGetBufferWithStatus(targetUrl, getHeaders, 7).catch(() => ({
            buf: Buffer.alloc(0),
            status: 502,
          }));
          if (fb.buf.length > 0 && fb.status >= 200 && fb.status < 400) {
            bodyBuf = fb.buf;
            upstreamStatus = fb.status;
          } else {
            const txtFb = await curlGetText(targetUrl, getHeaders, 7, true).catch(() => ({
              text: '',
              effectiveUrl: targetUrl,
            }));
            if (txtFb.text) {
              bodyBuf = Buffer.from(txtFb.text, 'utf8');
              effectiveUrl = txtFb.effectiveUrl || targetUrl;
              upstreamStatus = 200;
            }
          }
        }

        if (!bodyBuf.length) {
          applyProxyCorsHeaders(res, reqId);
          return res.status(upstreamStatus >= 400 ? upstreamStatus : 502).send('Upstream error');
        }

        const headSnippet = bodyBuf.subarray(0, 512).toString('utf8');
        if (headSnippet.includes('#EXTM3U')) {
          const manifestText = bodyBuf.toString('utf8');
          const { rewritten } = rewriteVidsrcBuzzM3u8(
            manifestText,
            effectiveUrl,
            originHeader + '/'
          );
          applyProxyCorsHeaders(res, reqId);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.status(200).send(rewritten);
        }

        applyProxyCorsHeaders(res, reqId);
        const trimmedHead = headSnippet.trimStart();
        const inferredCt =
          upstreamCt ||
          (trimmedHead.startsWith('{') || trimmedHead.startsWith('[')
            ? 'application/json; charset=utf-8'
            : trimmedHead.startsWith('WEBVTT')
              ? 'text/vtt; charset=utf-8'
              : 'text/plain; charset=utf-8');
        res.setHeader('Content-Type', inferredCt);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(bodyBuf);
      } catch {
        return res.status(502).send('Embed fetch relay failed');
      }
    }
  );
}
