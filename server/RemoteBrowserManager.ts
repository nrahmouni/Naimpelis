import puppeteer, { Browser, Page } from 'puppeteer';
import { WebSocket } from 'ws';
import { RemoteBrowserInput } from '../src/types';

export function isAllowedRemoteBrowserUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const url = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

interface RemoteSession {
  userId: string;
  url: string;
  browser: Browser;
  page: Page;
  timer: NodeJS.Timeout;
  lastFrame?: string;
  isCapturing?: boolean;
}

export class RemoteBrowserManager {
  private onMessage: (roomId: string, message: unknown) => void;
  private activeSessions = new Map<string, RemoteSession>();

  constructor(onMessage: (roomId: string, message: unknown) => void) {
    this.onMessage = onMessage;
  }

  sendLatestFrame(roomId: string, ws: WebSocket): void {
    const session = this.activeSessions.get(roomId);
    if (session?.lastFrame) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'REMOTE_BROWSER_FRAME',
          payload: { frame: session.lastFrame, url: session.url }
        }));
      }
    }
  }

  async start(roomId: string, userId: string, initialUrl: string): Promise<void> {
    // Clean up existing session for room if any
    await this.stop(roomId);

    let formattedUrl = initialUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--autoplay-policy=no-user-gesture-required',
          '--window-size=1280,720',
        ],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

      // Auto-close popups and popunders
      page.on('popup', (popup) => {
        popup?.close().catch(() => {});
      });

      // Auto-dismiss alert/confirm/prompt dialogs
      page.on('dialog', (dialog) => {
        dialog.dismiss().catch(() => {});
      });

      // Allow requests freely without blocking/aborting stream chunks

      // Evaluate script on new documents to neutralize popups and redirects
      await page.evaluateOnNewDocument(() => {
        window.open = function() { return null; };
        window.alert = function() {};
        window.confirm = function() { return false; };
        window.prompt = function() { return null; };
      });

      const session: RemoteSession = {
        userId,
        url: formattedUrl,
        browser,
        page,
        timer: null as any,
      };

      // Set up frame capture loop (~5 fps live video stream)
      session.timer = setInterval(async () => {
        if (session.isCapturing) return;
        session.isCapturing = true;
        try {
          if (page.isClosed()) return;
          const buffer = await page.screenshot({ type: 'jpeg', quality: 65, encoding: 'base64' });
          const frame = `data:image/jpeg;base64,${buffer}`;
          session.lastFrame = frame;
          session.url = page.url();

          this.onMessage(roomId, {
            type: 'REMOTE_BROWSER_FRAME',
            payload: { frame, url: session.url }
          });
        } catch {
          // Ignore capture error during page navigation
        } finally {
          session.isCapturing = false;
        }
      }, 200);

      this.activeSessions.set(roomId, session);

      this.onMessage(roomId, {
        type: 'REMOTE_BROWSER_READY',
        payload: { url: session.url, width: 1280, height: 720 }
      });

      await page.goto(formattedUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    } catch (err: unknown) {
      console.error('Failed to start Puppeteer Remote Browser:', err);
      const message = err instanceof Error ? err.message : 'Error al iniciar el navegador remoto Chromium.';
      throw new Error(message);
    }
  }

  async input(roomId: string, userId: string, inputData: RemoteBrowserInput): Promise<void> {
    const session = this.activeSessions.get(roomId);
    if (!session || session.page.isClosed()) return;

    try {
      const page = session.page;
      const type = inputData.type;

      if (type === 'click' && typeof inputData.x === 'number' && typeof inputData.y === 'number') {
        const x = Math.max(0, Math.min(1280, inputData.x));
        const y = Math.max(0, Math.min(720, inputData.y));
        await page.mouse.click(x, y);
      } else if (type === 'move' && typeof inputData.x === 'number' && typeof inputData.y === 'number') {
        const x = Math.max(0, Math.min(1280, inputData.x));
        const y = Math.max(0, Math.min(720, inputData.y));
        await page.mouse.move(x, y);
      } else if (type === 'scroll' && typeof inputData.deltaY === 'number') {
        const deltaY = inputData.deltaY;
        await page.mouse.wheel({ deltaY });
      } else if (type === 'type' && typeof inputData.text === 'string') {
        await page.keyboard.type(inputData.text);
      } else if (type === 'key' && typeof inputData.key === 'string') {
        await page.keyboard.press(inputData.key as any);
      } else if (type === 'navigate' && typeof inputData.url === 'string') {
        let navUrl = inputData.url.trim();
        if (!/^https?:\/\//i.test(navUrl)) navUrl = 'https://' + navUrl;
        await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      } else if (type === 'back') {
        await page.goBack().catch(() => {});
      } else if (type === 'forward') {
        await page.goForward().catch(() => {});
      } else if (type === 'reload') {
        await page.reload().catch(() => {});
      }
    } catch (err) {
      console.error('Remote Browser input error:', err);
    }
  }

  async stop(roomId: string): Promise<void> {
    const session = this.activeSessions.get(roomId);
    if (session) {
      clearInterval(session.timer);
      this.activeSessions.delete(roomId);
      try {
        await session.browser.close();
      } catch {}
    }
  }

  transferHost(roomId: string, newHostId: string): void {
    const session = this.activeSessions.get(roomId);
    if (session) {
      session.userId = newHostId;
    }
  }

  async close(): Promise<void> {
    for (const roomId of Array.from(this.activeSessions.keys())) {
      await this.stop(roomId);
    }
  }
}
