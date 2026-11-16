import { describe, expect, it } from 'vitest';
import { INTERNATIONAL_TV_CHANNELS } from '../server/data/internationalChannels.ts';
import { resolveOfficialChannelLogoUrl } from '../src/shared/channelLogos.ts';
import {
  buildFallbackVoicePlan,
  detectOrdinalSelection,
  matchChannelsByKeywords,
  parseSeriesSeasonAndEpisode,
} from '../server/routes/voiceAssistant.ts';
import {
  buildLocalizedInviteMessage,
  buildWhatsAppShareUrl,
} from '../src/utils/inviteShare.ts';
import type { SpanishTdtChannel } from '../src/types.ts';

describe('International channels catalog & official logos', () => {
  it('covers all 6 international groups with valid channels and official logo URLs', () => {
    const categories = new Set(INTERNATIONAL_TV_CHANNELS.map((c) => c.category));
    expect(categories.has('bein_arabic')).toBe(true);
    expect(categories.has('marruecos')).toBe(true);
    expect(categories.has('documentales')).toBe(true);
    expect(categories.has('usa_tv')).toBe(true);
    expect(categories.has('europa_tv')).toBe(true);
    expect(categories.has('noticias_intl')).toBe(true);

    for (const ch of INTERNATIONAL_TV_CHANNELS) {
      expect(ch.channels.length).toBeGreaterThan(0);
      const logo = resolveOfficialChannelLogoUrl(ch);
      expect(logo, `Expected official logoUrl for ${ch.id}`).toBeTruthy();
    }
  });
});

describe('Voice Assistant episode/season precision & sports routing', () => {
  it('accurately parses season and episode from "quiero ver el capítulo 3 de la primera temporada de Nocturno"', () => {
    const parsed = parseSeriesSeasonAndEpisode('quiero ver el capítulo 3 de la primera temporada de Nocturno');
    expect(parsed.hasEpisodeRequest).toBe(true);
    expect(parsed.episode).toBe(3);
    expect(parsed.season).toBe(1);
    expect(parsed.cleanTitle).toBe('nocturno');

    const plan = buildFallbackVoicePlan('quiero ver el capítulo 3 de la primera temporada de Nocturno', 'es');
    expect(plan.intent).toBe('play_series');
    expect(plan.autoPlay).toBe(true);
    expect(plan.targetSeason).toBe(1);
    expect(plan.targetEpisode).toBe(3);
    expect(plan.tmdbQuery.titleSearch).toBe('nocturno');
    expect(plan.tmdbQuery.mediaType).toBe('tv');
    expect(plan.spokenReply).toContain('capítulo 3');
    expect(plan.spokenReply).toContain('temporada 1');
  });

  it('accurately parses "temporada 2 capitulo 5 de breaking bad"', () => {
    const parsed = parseSeriesSeasonAndEpisode('temporada 2 capitulo 5 de breaking bad');
    expect(parsed.hasEpisodeRequest).toBe(true);
    expect(parsed.season).toBe(2);
    expect(parsed.episode).toBe(5);
    expect(parsed.cleanTitle).toBe('breaking bad');
  });

  it('routes "quiero saber cuando juega el Barça el siguiente partido" to sports_info', () => {
    const plan = buildFallbackVoicePlan('quiero saber cuando juega el Barça el siguiente partido', 'es');
    expect(plan.intent).toBe('sports_info');
    expect(plan.matchKeywords.length).toBeGreaterThan(0);
    expect(plan.matchKeywords).toContain('barca');
    expect(plan.channelKeywords).toContain('dazn');
  });

  it('routes "quiero ver dazn la liga" directly to DAZN LaLiga with autoPlay=true', () => {
    const plan = buildFallbackVoicePlan('quiero ver dazn la liga', 'es');
    expect(plan.intent).toBe('play_channel');
    expect(plan.autoPlay).toBe(true);
    expect(plan.channelKeywords.join(' ')).toMatch(/dazn|la liga/);

    const sampleChannels: Array<SpanishTdtChannel & { logoUrl?: string }> = [
      {
        id: 'tdt-dazn-laliga',
        dial: 55,
        name: 'DAZN LaLiga',
        shortMark: 'DAZN',
        brandTone: '#0F172A',
        network: 'DAZN',
        category: 'dazn',
        quality: '1080p',
        description: 'LaLiga EA Sports en directo',
        channels: [],
      },
      {
        id: 'doc-natgeo',
        dial: 340,
        name: 'National Geographic',
        shortMark: 'NATGEO',
        brandTone: '#FACC15',
        network: 'NatGeo',
        category: 'documentales',
        quality: '1080p',
        description: 'Documentales',
        channels: [],
      },
    ];

    const matched = matchChannelsByKeywords(sampleChannels, plan.channelKeywords, plan.categoryHint);
    expect(matched[0]?.id).toBe('tdt-dazn-laliga');
  });

  it('parses "quiero las mejores 3 pelis de terror de este mes" with genreId=27, timeframe=this_month, limit=3', () => {
    const plan = buildFallbackVoicePlan('quiero las mejores 3 pelis de terror de este mes', 'es');
    expect(plan.intent).toBe('recommend_movies');
    expect(plan.autoPlay).toBe(false);
    expect(plan.tmdbQuery.mediaType).toBe('movie');
    expect(plan.tmdbQuery.genreId).toBe(27);
    expect(plan.tmdbQuery.timeframe).toBe('this_month');
    expect(plan.tmdbQuery.sortBy).toBe('top_rated');
    expect(plan.tmdbQuery.limit).toBe(3);
  });

  it('detects Spanish ordinal selections cleanly', () => {
    expect(detectOrdinalSelection('la primera')).toBe(0);
    expect(detectOrdinalSelection('ponme la segunda')).toBe(1);
    expect(detectOrdinalSelection('el tercero')).toBe(2);
    expect(detectOrdinalSelection('quiero ver una de miedo')).toBeNull();
  });
});

describe('Rich room sharing / invite messages (Partidazo, Channel, Movie)', () => {
  it('generates rich partidazo invite with Home vs Away and Competition', () => {
    const msg = buildLocalizedInviteMessage({
      lang: 'es',
      roomName: 'Sala VIP',
      activeSportsMatch: {
        homeTeam: 'Real Madrid',
        awayTeam: 'FC Barcelona',
        competition: 'LaLiga EA Sports',
        score: '2 - 1',
      },
    });
    expect(msg).toContain('partidazo');
    expect(msg).toContain('Real Madrid vs FC Barcelona');
    expect(msg).toContain('LaLiga EA Sports');
    expect(msg).toContain('[2 - 1]');
  });

  it('generates rich channel invite with dial and network', () => {
    const msg = buildLocalizedInviteMessage({
      lang: 'ca',
      roomName: 'Sala 3',
      activeChannel: {
        name: 'TV3 HD',
        dial: 3,
        network: '3Cat',
      },
    });
    expect(msg).toContain('canal en directe');
    expect(msg).toContain('TV3 HD');
    expect(msg).toContain('Dial 3');
  });

  it('generates rich movie invite with year and episode badge', () => {
    const msg = buildLocalizedInviteMessage({
      lang: 'en',
      roomName: 'Cinema Room',
      activeMovie: {
        title: 'Stranger Things',
        year: '2024',
        season: 4,
        episode: 9,
      },
    });
    expect(msg).toContain('Stranger Things');
    expect(msg).toContain('(2024)');
    expect(msg).toContain('[T4·E9]');
  });
});
