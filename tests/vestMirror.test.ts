import { describe, expect, it } from 'vitest';
import {
  findVestSeedWithEpisode,
  isVestMirrorUrl,
  listVestCatalogEntries,
  parseVestDetailHtml,
  parseVestDetailUrl,
} from '../server/services/vestMirrorService';

describe('Vest Mirror Service (DramasFree + 321MoviesFree)', () => {
  it('recognizes dramasfree.com and 321moviesfree.com detail URLs', () => {
    const jjkUrl =
      'https://www3.dramasfree.com/es/detail/drama/48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3/1/';
    const fromUrl =
      'https://ww20.321moviesfree.com/es/detail/drama/MKkK0ZMtYN54vJuysYznp-From-Season-4/1/';

    expect(isVestMirrorUrl(jjkUrl)).toBe(true);
    expect(isVestMirrorUrl(fromUrl)).toBe(true);

    const parsedJjk = parseVestDetailUrl(jjkUrl);
    expect(parsedJjk?.paramId).toBe('48BzZjCCHYX5ZQvFviD9V');
    expect(parsedJjk?.episodeNum).toBe(1);

    const parsedFrom = parseVestDetailUrl(fromUrl);
    expect(parsedFrom?.paramId).toBe('MKkK0ZMtYN54vJuysYznp');
    expect(parsedFrom?.episodeNum).toBe(1);
  });

  it('maps Jujutsu Kaisen T1/T2/T3 both by split season and TMDB absolute episode number', () => {
    const s1 = findVestSeedWithEpisode({ tmdbId: 95479, season: 1, episode: 5 });
    expect(s1?.seed.key).toBe('gCt2oc0DFw51NrR5EAVrx');
    expect(s1?.mappedEpisode).toBe(5);

    const s2Explicit = findVestSeedWithEpisode({ tmdbId: 95479, season: 2, episode: 3 });
    expect(s2Explicit?.seed.key).toBe('3r6P9qNezGIHi5KaUglFH');
    expect(s2Explicit?.mappedEpisode).toBe(3);

    const s3Explicit = findVestSeedWithEpisode({ tmdbId: 95479, season: 3, episode: 1 });
    expect(s3Explicit?.seed.key).toBe('48BzZjCCHYX5ZQvFviD9V');
    expect(s3Explicit?.mappedEpisode).toBe(1);

    // Unified TMDB season 1 absolute episode 48 -> Season 3 Ep 1
    const s3Absolute = findVestSeedWithEpisode({ tmdbId: 95479, season: 1, episode: 48 });
    expect(s3Absolute?.seed.key).toBe('48BzZjCCHYX5ZQvFviD9V');
    expect(s3Absolute?.mappedEpisode).toBe(1);
  });

  it('maps From Season 4 according to preferred language (ES vs VOSE)', () => {
    const fromEs = findVestSeedWithEpisode({
      tmdbId: 124364,
      season: 4,
      episode: 2,
      preferLang: 'ES',
    });
    expect(fromEs?.seed.key).toBe('8JsoLCi6DNWXexKol4WnR');
    expect(fromEs?.mappedEpisode).toBe(2);

    const fromVose = findVestSeedWithEpisode({
      tmdbId: 124364,
      season: 4,
      episode: 2,
      preferLang: 'VOSE',
    });
    expect(fromVose?.seed.key).toBe('MKkK0ZMtYN54vJuysYznp');
    expect(fromVose?.mappedEpisode).toBe(2);
  });

  it('lists From T4 and Jujutsu Kaisen T3 in the Vest catalog registry', () => {
    const tvItems = listVestCatalogEntries({ mediaType: 'tv' });
    expect(tvItems.some((item) => item.tmdbId === 95479 && item.seasonNumber === 3)).toBe(true);
    expect(tvItems.some((item) => item.tmdbId === 124364 && item.seasonNumber === 4)).toBe(true);
  });

  it('parses Next.js __NEXT_DATA__ payloads from Vest mirrors', () => {
    const fakePayload = {
      props: {
        pageProps: {
          paramIds: '48BzZjCCHYX5ZQvFviD9V',
          websiteParam: '48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3',
          category: 1,
          name: '[Doblaje Español] Jujutsu Kaisen Season 3',
          audioLanguageCode: 'es',
          dubMode: '1',
          currentEpisodeNumber: 1,
          score: '9.0',
          mediaInfoList: [
            { currentDefinition: 'GROOT_SD', mediaUrl: 'https://cdn.example.com/jjk-s3-1.m3u8' },
          ],
          episodeVo: [
            {
              id: 'ep1',
              seriesNo: 1,
              subtitlingList: [
                {
                  language: 'Español',
                  languageAbbr: 'es',
                  subtitlingUrl: 'https://cdn.example.com/jjk-s3-1.srt',
                },
              ],
            },
          ],
          dubbingList: [],
          refList: [],
        },
      },
    };
    const html = `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      fakePayload
    )}</script></head><body></body></html>`;

    const parsed = parseVestDetailHtml(
      html,
      'https://www3.dramasfree.com/es/detail/drama/48BzZjCCHYX5ZQvFviD9V-Jujutsu-Kaisen-Season-3/1/'
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.cleanTitle).toBe('Jujutsu Kaisen Season 3');
    expect(parsed?.inferredLang).toBe('ES');
    expect(parsed?.qualityList[0]?.url).toBe('https://cdn.example.com/jjk-s3-1.m3u8');
    expect(parsed?.currentSubtitles[0]?.languageAbbr).toBe('es');
  });
});
