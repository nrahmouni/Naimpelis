import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  areTitlesStrictlyEqual,
  extractTitleMatchVariants,
  isMetadataCompatibleForMedia,
  matchesYouTubeFallbackTitle,
  parseDurationTextToMinutes,
} from '../server/extractors/httpHelpers.ts';
import {
  parseGnulaPageMetadata,
  parseGnulaPlayerPayload,
  pickBestGnulaSearchResult,
  withGnmParam,
} from '../server/extractors/vidhideEmbed69.ts';
import {
  parseMovidyHtmlMetadata,
  verifyMovidyMetaMatch,
} from '../server/extractors/bingetrixMovidy.ts';
import { findVestSeedForMedia } from '../server/services/vestMirrorService.ts';
import { fetchTmdbUrlJson } from '../server/services/tmdbService.ts';

describe('Strict catalog & extractor title/year/director/runtime matching', () => {
  it('extracts title variants while ignoring bare release-year parentheses', () => {
    expect(extractTitleMatchVariants('The Killer (2024)')).toEqual(['the killer 2024', 'the killer']);
    expect(extractTitleMatchVariants('El asesino (The Killer)')).toEqual([
      'el asesino the killer',
      'el asesino',
      'the killer',
    ]);
  });

  it('rejects sequel/homonym substring traps under areTitlesStrictlyEqual', () => {
    expect(areTitlesStrictlyEqual('The Killer', ['El asesino', 'The Killer'])).toBe(true);
    expect(areTitlesStrictlyEqual("The Killer's Game", ['El asesino', 'The Killer'])).toBe(false);
    expect(areTitlesStrictlyEqual('Smile 2', ['Smile'])).toBe(false);
    expect(areTitlesStrictlyEqual('Red One', ['Red'])).toBe(false);
    expect(areTitlesStrictlyEqual('El asesino (The Killer)', ['The Killer'])).toBe(true);
  });

  it('parses ISO-8601 and human durations into minutes', () => {
    expect(parseDurationTextToMinutes('PT2H6M')).toBe(126);
    expect(parseDurationTextToMinutes('2h 06min')).toBe(126);
    expect(parseDurationTextToMinutes('2 hr. 6 min.')).toBe(126);
    expect(parseDurationTextToMinutes('118 min')).toBe(118);
  });

  it('rejects Fincher 2023 vs Woo 2024 remake collisions cleanly', () => {
    // Same title ("The Killer"), wrong year + wrong director -> reject
    expect(
      isMetadataCompatibleForMedia({
        candidateTitle: 'The Killer',
        targetTitleHints: ['El asesino', 'The Killer'],
        candidateYear: '2024',
        expectedYear: '2023',
        candidateDirector: 'John Woo',
        expectedDirector: 'David Fincher',
        candidateRuntimeMin: 126,
        expectedRuntimeMin: 118,
      })
    ).toMatchObject({ ok: false, reason: 'director_mismatch' });

    // Adjacent year (2023 vs 2024) with no corroborating proof -> reject
    expect(
      isMetadataCompatibleForMedia({
        candidateTitle: 'The Killer',
        targetTitleHints: ['El asesino', 'The Killer'],
        candidateYear: '2024',
        expectedYear: '2023',
      })
    ).toMatchObject({ ok: false, reason: 'adjacent_year_unverified' });

    // Adjacent festival/release year (2023 vs 2024) WITH matching director -> allow
    expect(
      isMetadataCompatibleForMedia({
        candidateTitle: 'The Killer',
        targetTitleHints: ['El asesino', 'The Killer'],
        candidateYear: '2024',
        expectedYear: '2023',
        candidateDirector: 'John Woo',
        expectedDirector: 'John Woo',
      })
    ).toMatchObject({ ok: true, exactYear: false });

    // Large runtime conflict (> 25 min) even in same year -> reject
    expect(
      isMetadataCompatibleForMedia({
        candidateTitle: 'You Can See Everything',
        targetTitleHints: ['You Can See Everything'],
        candidateYear: '2026',
        expectedYear: '2026',
        candidateRuntimeMin: 82,
        expectedRuntimeMin: 175,
      })
    ).toMatchObject({ ok: false, reason: 'runtime_mismatch' });
  });

  it('keeps CJK directors neutral rather than false-positive rejecting', () => {
    const html = `
      <html>
        <head>
          <title>The Killer (2024) | Gnula</title>
          <script type="application/ld+json">{"datePublished":"2024-08-23","director":[{"name":"吴宇森"}]}</script>
        </head>
        <body><span>Duración 2 hr. 6 min.</span></body>
      </html>
    `;
    const meta = parseGnulaPageMetadata(html);
    expect(meta).toEqual({
      title: 'The Killer',
      year: '2024',
      director: '吴宇森',
      runtimeMin: 126,
    });

    // Matching 2024 John Woo TMDB metadata accepts CJK director safely
    expect(
      isMetadataCompatibleForMedia({
        candidateTitle: meta.title,
        targetTitleHints: ['The Killer'],
        candidateYear: meta.year,
        expectedYear: '2024',
        candidateDirector: meta.director,
        expectedDirector: 'John Woo',
        candidateRuntimeMin: meta.runtimeMin,
        expectedRuntimeMin: 126,
      })
    ).toMatchObject({ ok: true, exactYear: true });

    // Rejects 2023 Fincher because adjacent year 2024 lacks director/tight runtime match
    expect(
      isMetadataCompatibleForMedia({
        candidateTitle: meta.title,
        targetTitleHints: ['El asesino', 'The Killer'],
        candidateYear: meta.year,
        expectedYear: '2023',
        candidateDirector: meta.director,
        expectedDirector: 'David Fincher',
        candidateRuntimeMin: meta.runtimeMin,
        expectedRuntimeMin: 118,
      })
    ).toMatchObject({ ok: false });
  });

  it('pickBestGnulaSearchResult picks exact year and rejects near-match titles', () => {
    const results = [
      { title: "The Killer's Game", type: 'pelicula', year: '2024', url: '/ver/the-killers-game/' },
      { title: 'The Killer', type: 'pelicula', year: '2024', url: '/ver/the-killer-2/' },
      { title: 'The Killer', type: 'pelicula', year: '2023', url: '/ver/the-killer/' },
    ];

    expect(
      pickBestGnulaSearchResult(results, {
        titleHints: ['El asesino', 'The Killer'],
        mediaType: 'movie',
        yearHint: '2023',
      })
    ).toEqual({ url: '/ver/the-killer/', exactYear: true });

    expect(
      pickBestGnulaSearchResult(results, {
        titleHints: ['The Killer'],
        mediaType: 'movie',
        yearHint: '2024',
      })
    ).toEqual({ url: '/ver/the-killer-2/', exactYear: true });

    // No match for unrelated short title "Killer"
    expect(
      pickBestGnulaSearchResult(results, {
        titleHints: ['Killer'],
        mediaType: 'movie',
        yearHint: '2024',
      })
    ).toBeNull();
  });

  it('verifyMovidyMetaMatch rejects TV shows for movie queries and enforces director/year', () => {
    const html = `
      <html>
        <head><title>Ver The Killer Movidy</title></head>
        <body>
          <h2>Ver The Killer Movidy</h2>
          <div class="numbers">
            <span>2024</span>
            <span>2h 06min</span>
          </div>
          <div class="links">
            <b>Director:</b> <a href="#">John Woo</a>
          </div>
          <p>Action thriller.</p>
        </body>
      </html>
    `;
    const meta = parseMovidyHtmlMetadata(html);
    expect(
      verifyMovidyMetaMatch(meta, {
        titleHints: ['El asesino', 'The Killer'],
        expectedYear: '2023',
        expectedDirector: 'David Fincher',
        expectedRuntimeMin: 118,
        expectedMediaType: 'movie',
      })
    ).toMatchObject({ ok: false, reason: 'director_mismatch' });

    expect(
      verifyMovidyMetaMatch(meta, {
        titleHints: ['The Killer'],
        expectedYear: '2024',
        expectedDirector: 'John Woo',
        expectedRuntimeMin: 126,
        expectedMediaType: 'movie',
      })
    ).toMatchObject({ ok: true, exactYear: true });

    expect(
      verifyMovidyMetaMatch(
        { ...meta, isTvShow: true },
        {
          titleHints: ['The Killer'],
          expectedYear: '2024',
          expectedMediaType: 'movie',
        }
      )
    ).toMatchObject({ ok: false, reason: 'tv_show_not_movie' });
  });

  it('matchesYouTubeFallbackTitle prevents stop-word single-token hijacks', () => {
    // Previously "you" matched "You (2018)" or random music videos
    expect(
      matchesYouTubeFallbackTitle('You Can See Everything', 'You Got Everything I Need (Official Video)')
    ).toBe(false);
    expect(
      matchesYouTubeFallbackTitle('You Can See Everything', 'You Can See Everything (2026) Full Documentary')
    ).toBe(true);
    expect(
      matchesYouTubeFallbackTitle('The Killer', 'The Wait is Over (Full Movie)')
    ).toBe(false);
    expect(
      matchesYouTubeFallbackTitle('The Killer', 'The Killer Full Movie HD')
    ).toBe(true);
  });

  it('findVestSeedForMedia blocks cross-media and mismatched-tmdbId title collisions', () => {
    // TV seed for One Piece works for tv:37854
    expect(
      findVestSeedForMedia({
        tmdbId: 37854,
        mediaType: 'tv',
        titleHints: ['One Piece'],
      })
    ).not.toBeNull();

    // Movie with same title ("One Piece") or different TMDB ID must NOT match the TV seed
    expect(
      findVestSeedForMedia({
        tmdbId: 900667,
        mediaType: 'movie',
        titleHints: ['One Piece'],
        yearHint: '2022',
      })
    ).toBeNull();

    // Different TV show with same title ("From") and different TMDB ID must NOT hijack TMDB 124364
    expect(
      findVestSeedForMedia({
        tmdbId: 999999,
        mediaType: 'tv',
        titleHints: ['From'],
        yearHint: '2018',
      })
    ).toBeNull();
  });

  it('fetchTmdbUrlJson rejects empty/invalid URLs safely without throwing and /api/catalog/series avoids uncaught AbortError fetches', async () => {
    await expect(fetchTmdbUrlJson('')).resolves.toBeNull();
    await expect(fetchTmdbUrlJson('not-a-valid-url')).resolves.toBeNull();

    const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    const seriesSectionStart = serverSrc.indexOf("app.get('/api/catalog/series'");
    const seriesSectionEnd = serverSrc.indexOf("app.get('/api/catalog/tv/:tmdbId'");
    expect(seriesSectionStart).toBeGreaterThan(-1);
    expect(seriesSectionEnd).toBeGreaterThan(seriesSectionStart);

    const seriesSection = serverSrc.slice(seriesSectionStart, seriesSectionEnd);
    expect(seriesSection).toContain('fetchTmdbUrlJson');
    expect(seriesSection).toContain('seriesCatalogStaleCache');
    expect(seriesSection).not.toMatch(/fetch\s*\(\s*endpoint\s*,/);
    expect(seriesSection).not.toMatch(/res\.status\(500\)/);
  });

  it('withGnmParam appends gnm=1 cleanly and parseGnulaPlayerPayload supports both new langs object and legacy array formats', () => {
    expect(withGnmParam('https://ww3.gnulahd.nu/ver/nocturno/')).toBe(
      'https://ww3.gnulahd.nu/ver/nocturno/?gnm=1'
    );
    expect(withGnmParam('https://ww3.gnulahd.nu/wp-json/gnrd/v1/search?q=from')).toBe(
      'https://ww3.gnulahd.nu/wp-json/gnrd/v1/search?q=from&gnm=1'
    );
    expect(withGnmParam('https://ww3.gnulahd.nu/?gnm=1')).toBe('https://ww3.gnulahd.nu/?gnm=1');

    const parsedNew = parseGnulaPlayerPayload({
      p: {
        t: 'nocturno',
        langs: [
          {
            label: 'Castellano',
            servers: [
              { title: 'voe', src: 'https://voe.sx/e/def' },
              { title: 'vidara', src: 'https://vidara.to/e/abc' },
            ],
          },
          {
            label: 'Subtitulado',
            servers: [{ title: 'streamwish', src: 'https://streamwish.to/e/ghi' }],
          },
        ],
        dl: [],
      },
    });
    expect(parsedNew).toHaveLength(3);
    expect(parsedNew[0]).toMatchObject({
      lang: 'ES',
      sourceUrl: 'https://vidara.to/e/abc',
      resolverType: 'vidhide_hls',
    });
    expect(parsedNew[1]).toMatchObject({
      lang: 'VOSE',
      sourceUrl: 'https://streamwish.to/e/ghi',
      resolverType: 'vidhide_hls',
    });
    expect(parsedNew[2]).toMatchObject({
      lang: 'ES',
      sourceUrl: 'https://voe.sx/e/def',
      resolverType: 'embed_sniff',
    });

    const parsedLegacy = parseGnulaPlayerPayload({
      d: [
        {
          name: 'Español',
          servers: [{ title: 'vidhide', src: 'https://vidhide.com/v/xyz' }],
        },
      ],
    });
    expect(parsedLegacy).toEqual([
      {
        id: 'gnula-hls-ES-0-0',
        label: 'Castellano · 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://vidhide.com/v/xyz',
        resolverType: 'vidhide_hls',
      },
    ]);
  });
});
