import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { shouldSkipStaleCloudWrite } from '../src/services/userCloudSync';

const ROOT = process.cwd();

describe('Audit Checklist & Asset Integrity', () => {
  it('enforces updatedAt conflict resolution, World Shell architecture without bottom nav, online-first GamesHub, TV a11y, and WebP-only images', () => {
    expect(
      shouldSkipStaleCloudWrite({
        serverUpdatedMs: 20_000,
        clientUpdatedMs: 5_000,
      })
    ).toBe(true);
    expect(
      shouldSkipStaleCloudWrite({
        serverUpdatedMs: 12_000,
        clientUpdatedMs: 10_000,
      })
    ).toBe(false);

    expect(fs.existsSync(path.join(ROOT, 'src/components/MobileBottomNav.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'src/components/EntryHomeScreen.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/components/worlds/WorldShell.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/components/AvatarMenuSheet.tsx'))).toBe(true);

    const gamesHubSrc = fs.readFileSync(path.join(ROOT, 'src/components/GamesHubSection.tsx'), 'utf8');
    expect(gamesHubSrc).toContain("useState<'offline' | 'online'>('online')");

    const tvNavSrc = fs.readFileSync(path.join(ROOT, 'src/utils/tvSpatialNav.ts'), 'utf8');
    expect(tvNavSrc).toContain('naim-tv-a11y-live');
    expect(tvNavSrc).toContain('10009');

    const imgFiles = fs.readdirSync(path.join(ROOT, 'src/assets/images'));
    expect(imgFiles.some((f) => f.endsWith('.webp') || f.endsWith('.jpg'))).toBe(true);
    expect(imgFiles.some((f) => /\.png$/i.test(f))).toBe(false);
  });

  it('verifies AI Movie Request pipeline, SurpriseMe 2-mode UI, scalloped Futbol Chapas, and World Shell catalog structure', () => {
    const aiServiceSrc = fs.readFileSync(
      path.join(ROOT, 'server/services/aiMovieRequestService.ts'),
      'utf8'
    );
    expect(aiServiceSrc).toContain('gemini-4-hydrogen');
    expect(aiServiceSrc).toContain('aistudio-build');
    expect(aiServiceSrc).toContain('verifyAndBuildCatalogMovie');

    const serverSrc = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
    expect(serverSrc).toContain("app.post('/api/ai/request-movie'");
    expect(serverSrc).toContain("app.get('/api/ai/request-movie/:jobId'");

    const surpriseSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/SurpriseMeModal.tsx'),
      'utf8'
    );
    expect(surpriseSrc).toContain('Pedir película');
    expect(surpriseSrc).toContain('/api/ai/request-movie');

    const chapasSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/FutbolChapasStage.tsx'),
      'utf8'
    );
    expect(chapasSrc).toContain('traceBottleCapCrownPath');
    expect(chapasSrc).toContain('CHAPAS_PITCH_BOTTOM + 14');

    const catalogSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/MediaCatalogHub.tsx'),
      'utf8'
    );
    const footballViewSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/catalog/FootballWorldView.tsx'),
      'utf8'
    );
    expect(catalogSrc).toContain("worldMode === 'cine'");
    expect(footballViewSrc).toContain('Fútbol China (CCTV-5)');
    expect(footballViewSrc).toContain('China · Fútbol Internacional HD');
    expect(footballViewSrc).not.toContain('العربية');
    expect(footballViewSrc).not.toContain('欧冠');

    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    const worldsSrc = fs.readFileSync(path.join(ROOT, 'src/components/AppWorldsContent.tsx'), 'utf8');
    expect(appSrc).toContain('<AppWorldsContent');
    expect(worldsSrc).toContain('<EntryHomeScreen');
    expect(worldsSrc).toContain('<WorldShell');
  });

  it('guarantees fluid vertical scrolling across mobile, desktop and TV without nested overflow-y traps', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    const worldsSrc = fs.readFileSync(path.join(ROOT, 'src/components/AppWorldsContent.tsx'), 'utf8');
    expect(appSrc).toContain('className="h-[100dvh] w-full max-w-[100vw] bg-[#0B0B0E] text-[#EFEFF1] overflow-hidden"');
    expect(worldsSrc).toContain('ref={catalogScrollRef} className="w-full min-w-0 shrink-0"');
    expect(appSrc).toContain('overflow-y-auto overflow-x-clip touch-pan-y smooth-scroll-area');

    const entrySrc = fs.readFileSync(path.join(ROOT, 'src/components/EntryHomeScreen.tsx'), 'utf8');
    expect(entrySrc).toContain('overflow-x-clip');
    expect(entrySrc).not.toContain('overflow-x-hidden');

    const cssSrc = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
    expect(cssSrc).toContain('touch-action: pan-y;');
    expect(cssSrc).toMatch(/html,\s*body,\s*#root\s*\{[^}]*height:\s*100%;/);
  });
});
