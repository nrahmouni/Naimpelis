import { chromium, Browser, BrowserContext, CDPSession, Page } from 'playwright';
import WebSocket from 'ws';
import { RemoteBrowserInput } from '../src/types';

const DEFAULT_ALLOWED_HOSTS = 'bingetrix.sc,movidy.pw,vidsrc.pm,vidsrc.me,vidsrc.to,autoembed.to';
const allowedHosts = (process.env.RBI_ALLOWED_HOSTS || DEFAULT_ALLOWED_HOSTS)
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
const MAX_SESSIONS = Math.max(1, Number(process.env.RBI_MAX_SESSIONS) || 4);
const VIEWPORT = { width: 1280, height: 720 };

interface RemoteBrowserSession {
  hostId: string;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  latestFrame?: string;
  sequence: number;
  inputWindowStart: number;
  inputCount: number;
}

type RoomBroadcast = (roomId: string, message: unknown) => void;

export function isAllowedRemoteBrowserUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    return ['http:', 'https:'].includes(url.protocol) && allowedHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

export class RemoteBrowserManager {
  private browser: Browser | null = null;
  private readonly sessions = new Map<string, RemoteBrowserSession>();

  constructor(private readonly broadcast: RoomBroadcast) {}

  public async start(roomId: string, hostId: string, targetUrl: string) {
    if (!isAllowedRemoteBrowserUrl(targetUrl)) {
      throw new Error('El dominio no está incluido en RBI_ALLOWED_HOSTS.');
    }
    if (!this.sessions.has(roomId) && this.sessions.size >= MAX_SESSIONS) {
      throw new Error('Se alcanzó el máximo de sesiones de navegador remoto.');
    }

    await this.stop(roomId);
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      acceptDownloads: false,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(20000);
    page.setDefaultTimeout(10000);
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (/^(about:|data:|blob:)/i.test(requestUrl)) {
        await route.continue();
        return;
      }
      if (isAllowedRemoteBrowserUrl(requestUrl)) {
        await route.continue();
        return;
      }
      await route.abort('blockedbyclient');
    });

    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      const cdp = await context.newCDPSession(page);
      const session: RemoteBrowserSession = {
        hostId,
        context,
        page,
        cdp,
        sequence: 0,
        inputWindowStart: Date.now(),
        inputCount: 0,
      };
      this.sessions.set(roomId, session);
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
          this.broadcast(roomId, {
            type: 'REMOTE_BROWSER_LOCATION',
            payload: { url: frame.url() },
          });
        }
      });

      cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
        if (this.sessions.get(roomId) !== session) return;
        session.latestFrame = data;
        session.sequence += 1;
        this.broadcast(roomId, {
          type: 'REMOTE_BROWSER_FRAME',
          payload: { sequence: session.sequence, image: data, url: page.url() },
        });
        await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
      });

      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 55,
        maxWidth: VIEWPORT.width,
        maxHeight: VIEWPORT.height,
        everyNthFrame: 3,
      });
      session.latestFrame = (await page.screenshot({ type: 'jpeg', quality: 55 })).toString('base64');
      this.sendFrameToClient(roomId, session.latestFrame, session.sequence, page.url());
      this.broadcast(roomId, {
        type: 'REMOTE_BROWSER_READY',
        payload: { url: page.url(), width: VIEWPORT.width, height: VIEWPORT.height },
      });
    } catch (error) {
      await context.close().catch(() => undefined);
      throw error;
    }
  }

  public async input(roomId: string, userId: string, input: RemoteBrowserInput) {
    const session = this.sessions.get(roomId);
    if (!session || session.hostId !== userId) return false;
    if (!this.consumeInputBudget(session)) return false;

    switch (input.kind) {
      case 'click': {
        if (!this.isNormalizedCoordinate(input.x) || !this.isNormalizedCoordinate(input.y)) return false;
        await session.page.mouse.click(input.x * VIEWPORT.width, input.y * VIEWPORT.height, {
          button: input.button || 'left',
        });
        return true;
      }
      case 'wheel': {
        if (!this.isNormalizedCoordinate(input.x) || !this.isNormalizedCoordinate(input.y)) return false;
        await session.page.mouse.move(input.x * VIEWPORT.width, input.y * VIEWPORT.height);
        await session.page.mouse.wheel(
          Math.max(-1200, Math.min(1200, input.deltaX)),
          Math.max(-1200, Math.min(1200, input.deltaY))
        );
        return true;
      }
      case 'key': {
        if (!/^(Enter|Tab|Escape|Backspace|Delete|Arrow(Up|Down|Left|Right)|[a-zA-Z0-9])$/.test(input.key)) return false;
        await session.page.keyboard.press(input.key);
        return true;
      }
      case 'text': {
        if (typeof input.text !== 'string' || input.text.length > 500) return false;
        await session.page.keyboard.insertText(input.text);
        return true;
      }
      case 'navigate': {
        if (!isAllowedRemoteBrowserUrl(input.url)) return false;
        await session.page.goto(input.url, { waitUntil: 'domcontentloaded' });
        return true;
      }
      case 'reload':
        await session.page.reload({ waitUntil: 'domcontentloaded' });
        return true;
    }
  }

  public sendLatestFrame(roomId: string, client: WebSocket) {
    const session = this.sessions.get(roomId);
    if (session?.latestFrame && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'REMOTE_BROWSER_FRAME',
        payload: { sequence: session.sequence, image: session.latestFrame, url: session.page.url() },
      }));
    }
  }

  public async stop(roomId: string) {
    const session = this.sessions.get(roomId);
    if (!session) return;
    this.sessions.delete(roomId);
    await session.cdp.send('Page.stopScreencast').catch(() => undefined);
    await session.context.close().catch(() => undefined);
    if (this.sessions.size === 0 && this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  public async close() {
    await Promise.all([...this.sessions.keys()].map((roomId) => this.stop(roomId)));
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }

  private async getBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  private sendFrameToClient(roomId: string, image: string, sequence: number, url: string) {
    this.broadcast(roomId, {
      type: 'REMOTE_BROWSER_FRAME',
      payload: { sequence, image, url },
    });
  }

  private isNormalizedCoordinate(value: number) {
    return Number.isFinite(value) && value >= 0 && value <= 1;
  }

  private consumeInputBudget(session: RemoteBrowserSession) {
    const now = Date.now();
    if (now - session.inputWindowStart >= 1000) {
      session.inputWindowStart = now;
      session.inputCount = 0;
    }
    session.inputCount += 1;
    return session.inputCount <= 30;
  }
}