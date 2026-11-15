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
  pickBestGnulaSearchResult,
} from '../server/extractors/vidhideEmbed69.ts';
import {
  parseMovidyHtmlMetadata,
  verifyMovidyMetaMatch,
} from '../server/extractors/bingetrixMovidy.ts';
import { findVestSeedForMedia } from '../server/services/vestMirrorService.ts';

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
});
