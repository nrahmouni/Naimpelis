import fs from 'fs';
import path from 'path';
import type http from 'http';
import express from 'express';
import { logger } from '../utils/logger.ts';
import {
  injectDynamicOgMeta,
  injectMusicPwaMeta,
  isMusicAppPath,
  resolveOpenGraphMetaForRequest,
  shouldInjectDeepLinkOg,
} from './deepLinkResolver.ts';

export interface SpaFrontendMountDeps {
  rootDir: string;
  isProd: boolean;
  httpServer: http.Server;
  getPublicOrigin: (req: express.Request) => string;
  sendSmartTvReceiverHtml: (res: express.Response) => void;
}

export function mountSpaFrontend(app: express.Express, deps: SpaFrontendMountDeps): void {
  const { rootDir, isProd, httpServer, getPublicOrigin, sendSmartTvReceiverHtml } = deps;

  if (!isProd) {
    let viteMiddleware: express.RequestHandler | null = null;
    let viteInstance: {
      transformIndexHtml: (url: string, html: string) => Promise<string>;
    } | null = null;
    let viteInitError: unknown = null;

    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const hmrEnabled = process.env.DISABLE_HMR !== 'true';
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          ws: { server: httpServer },
          hmr: hmrEnabled,
          watch: hmrEnabled ? {} : null,
        },
        appType: 'spa',
      });
      viteInstance = vite;
      viteMiddleware = vite.middlewares;
    })().catch((err) => {
      viteInitError = err;
      logger.error({ err }, 'vite_dev_server_init_failed');
    });

    app.use(async (req, res, next) => {
      if (!viteMiddleware && !viteInitError) {
        await viteReady;
      }
      if (viteInitError || !viteMiddleware) {
        res.status(503).json({
          ok: false,
          error: 'Dev frontend compiler unavailable',
        });
        return;
      }
      const isMusicReq = isMusicAppPath(req.path);
      if (req.method === 'GET' && viteInstance && (isMusicReq || shouldInjectDeepLinkOg(req.path))) {
        try {
          const indexHtmlPath = path.resolve(rootDir, 'index.html');
          const [rawHtml, ogMeta] = await Promise.all([
            fs.promises.readFile(indexHtmlPath, 'utf8'),
            shouldInjectDeepLinkOg(req.path)
              ? resolveOpenGraphMetaForRequest(req.originalUrl, getPublicOrigin(req))
              : Promise.resolve(null),
          ]);
          const transformed = await viteInstance.transformIndexHtml(req.originalUrl, rawHtml);
          let finalHtml = ogMeta ? injectDynamicOgMeta(transformed, ogMeta) : transformed;
          if (isMusicReq) {
            finalHtml = injectMusicPwaMeta(finalHtml, getPublicOrigin(req));
          }
          res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(finalHtml);
          return;
        } catch {
          // Fall back gracefully to standard Vite SPA middleware
        }
      }
      return viteMiddleware(req, res, next);
    });
    return;
  }

  const distDir = path.resolve(rootDir, 'dist');
  const distIndex = path.join(distDir, 'index.html');
  if (fs.existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith('.html') ||
            filePath.endsWith('sw.js') ||
            filePath.includes(`${path.sep}tv${path.sep}`)
          ) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          }
        },
      })
    );
  } else {
    logger.warn({ distDir }, 'production_dist_directory_missing');
  }

  app.get('*', async (req, res) => {
    if (req.path === '/tv' || req.path === '/tv/') {
      return sendSmartTvReceiverHtml(res);
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    if (fs.existsSync(distIndex)) {
      const isMusicReq = isMusicAppPath(req.path);
      if (isMusicReq || shouldInjectDeepLinkOg(req.path)) {
        try {
          const [rawHtml, ogMeta] = await Promise.all([
            fs.promises.readFile(distIndex, 'utf8'),
            shouldInjectDeepLinkOg(req.path)
              ? resolveOpenGraphMetaForRequest(req.originalUrl, getPublicOrigin(req))
              : Promise.resolve(null),
          ]);
          let finalHtml = ogMeta ? injectDynamicOgMeta(rawHtml, ogMeta) : rawHtml;
          if (isMusicReq) {
            finalHtml = injectMusicPwaMeta(finalHtml, getPublicOrigin(req));
          }
          if (isMusicReq || ogMeta) {
            return res.type('html').send(finalHtml);
          }
        } catch {
          // Fall through cleanly to static dist/index.html
        }
      }
      return res.sendFile(distIndex);
    }
    return res
      .status(503)
      .type('text/plain')
      .send('RiffanTV engine is running; frontend build (dist/index.html) not found.');
  });
}
