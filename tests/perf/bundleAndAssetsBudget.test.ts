import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

function walkDirBytes(dirPath: string): { files: number; bytes: number; largest: { rel: string; bytes: number } } {
  let files = 0;
  let bytes = 0;
  let largest = { rel: '', bytes: 0 };

  function walk(cur: string) {
    if (!fs.existsSync(cur)) return;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const size = fs.statSync(full).size;
        files += 1;
        bytes += size;
        if (size > largest.bytes) {
          largest = { rel: path.relative(dirPath, full), bytes: size };
        }
      }
    }
  }

  walk(dirPath);
  return { files, bytes, largest };
}

describe('Performance & Speed — Bundle Splitting, PWA Cache & Smart TV Asset Budgets', () => {
  it('enforces manual code splitting and PWA caching rules in vite.config.ts', () => {
    const viteCfg = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    const requiredChunks = [
      'vendor-react',
      'vendor-tanstack',
      'vendor-firebase',
      'vendor-media',
      'vendor-zip',
      'vendor-three',
      'vendor-pixi',
      'vendor-rive',
      'feature-kids',
      'feature-music',
      'feature-sports',
      'feature-games',
      'feature-admin',
    ];
    for (const chunk of requiredChunks) {
      expect(viteCfg).toContain(`'${chunk}'`);
    }
    expect(viteCfg).toContain('chunkSizeWarningLimit');
    expect(viteCfg).toContain('StaleWhileRevalidate');
    expect(viteCfg).toContain('CacheFirst');
  });

  it('keeps Smart TV ES5 runtime, Draco decoders & bundled game assets within fast Tizen .wgt budgets', () => {
    const root = process.cwd();
    const tvStats = walkDirBytes(path.join(root, 'public/tv'));
    const assetsStats = walkDirBytes(path.join(root, 'public/assets/games'));
    const dracoStats = walkDirBytes(path.join(root, 'public/draco/gltf'));
    const vendorStats = walkDirBytes(path.join(root, 'public/vendor'));

    const toKb = (b: number) => Number((b / 1024).toFixed(1));
    console.info(
      `[PERF ASSET BUDGET] public/tv=${toKb(tvStats.bytes)}KB (${tvStats.files} files) | public/assets/games=${toKb(assetsStats.bytes)}KB (${assetsStats.files} files, largest=${assetsStats.largest.rel}:${toKb(assetsStats.largest.bytes)}KB) | public/draco=${toKb(dracoStats.bytes)}KB | public/vendor=${toKb(vendorStats.bytes)}KB`
    );

    // Tight budgets ensure instant Tizen .wgt installation & fast mobile cold loads
    expect(tvStats.bytes).toBeLessThan(750 * 1024);
    expect(assetsStats.bytes).toBeLessThan(12 * 1024 * 1024);
    expect(dracoStats.bytes).toBeLessThan(1.5 * 1024 * 1024);
    expect(dracoStats.files).toBeGreaterThanOrEqual(3);
  });

  it('audits production dist/ bundle chunk sizes when build artifacts exist', () => {
    const distAssetsDir = path.resolve(process.cwd(), 'dist/assets');
    if (!fs.existsSync(distAssetsDir)) {
      console.info('[PERF BUNDLE] dist/assets not generated yet (skipping optional dist chunk audit)');
      expect(true).toBe(true);
      return;
    }

    const entries = fs.readdirSync(distAssetsDir, { withFileTypes: true }).filter((e) => e.isFile());
    const jsChunks = entries
      .filter((e) => e.name.endsWith('.js'))
      .map((e) => ({ name: e.name, bytes: fs.statSync(path.join(distAssetsDir, e.name)).size }))
      .sort((a, b) => b.bytes - a.bytes);

    const stats = walkDirBytes(distAssetsDir);
    const totalMb = Number((stats.bytes / (1024 * 1024)).toFixed(2));
    const largestJs = jsChunks[0];
    const entryChunk = jsChunks.find((c) => /^index-.*\.js$/.test(c.name));
    const reactChunk = jsChunks.find((c) => /^vendor-react-.*\.js$/.test(c.name));
    const gamesChunk = jsChunks.find((c) => /^feature-games-.*\.js$/.test(c.name));

    console.info(
      `[PERF BUNDLE] dist/assets=${totalMb}MB (${stats.files} files, ${jsChunks.length} JS chunks) | entry=${entryChunk ? (entryChunk.bytes / 1024).toFixed(1) : 'N/A'}KB | vendor-react=${reactChunk ? (reactChunk.bytes / 1024).toFixed(1) : 'N/A'}KB | feature-games=${gamesChunk ? (gamesChunk.bytes / 1024).toFixed(1) : 'N/A'}KB | largestJS=${largestJs ? `${largestJs.name} (${(largestJs.bytes / 1024).toFixed(1)}KB)` : 'N/A'}`
    );

    expect(stats.files).toBeGreaterThan(0);
    // Core boot path must remain lean for fast first contentful paint
    if (entryChunk) expect(entryChunk.bytes).toBeLessThan(1.1 * 1024 * 1024);
    if (reactChunk) expect(reactChunk.bytes).toBeLessThan(350 * 1024);
    if (gamesChunk) expect(gamesChunk.bytes).toBeLessThan(1.2 * 1024 * 1024);
    // No single JS chunk should exceed 1.8MB uncompressed after splitting Three/Pixi/Rive/games
    if (largestJs) expect(largestJs.bytes).toBeLessThan(1.8 * 1024 * 1024);
  });
});
