// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChampionsWorldView } from '../src/components/champions/ChampionsWorldView';
import { QuickAddMatchSheet } from '../src/components/sports/QuickAddMatchSheet';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChampionsWorldView — Direct MultiChampions Match Picker (Web/Mobile)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const mockHub = {
      matches: [
        {
          id: 'ucl-1',
          eventId: '101',
          leagueSlug: 'uefa.champions',
          leagueName: 'UEFA Champions League',
          groupTitle: 'UEFA Champions League',
          homeTeam: 'Real Madrid',
          awayTeam: 'Arsenal',
          homeShort: 'RMA',
          awayShort: 'ARS',
          homeScore: '2',
          awayScore: '1',
          statusState: 'live',
          statusLabel: "64'",
          kickoffTime: '21:00',
          kickoffDateLabel: 'Hoy',
          channels: [{ id: 'c1', label: 'M+ Champions', lang: 'ES', sourceUrl: '/api/iptv/live/ch1.m3u8', resolverType: 'tdt_hls' }],
        },
        {
          id: 'ucl-2',
          eventId: '102',
          leagueSlug: 'uefa.champions',
          leagueName: 'UEFA Champions League',
          groupTitle: 'UEFA Champions League',
          homeTeam: 'FC Barcelona',
          awayTeam: 'Bayern München',
          homeShort: 'BAR',
          awayShort: 'BAY',
          homeScore: '1',
          awayScore: '0',
          statusState: 'live',
          statusLabel: "64'",
          kickoffTime: '21:00',
          kickoffDateLabel: 'Hoy',
          channels: [{ id: 'c2', label: 'M+ Champions 2', lang: 'ES', sourceUrl: '/api/iptv/live/ch2.m3u8', resolverType: 'tdt_hls' }],
        },
        {
          id: 'ucl-3',
          eventId: '103',
          leagueSlug: 'uefa.champions',
          leagueName: 'UEFA Champions League',
          groupTitle: 'UEFA Champions League',
          homeTeam: 'PSG',
          awayTeam: 'Inter Milan',
          homeShort: 'PSG',
          awayShort: 'INT',
          homeScore: '0',
          awayScore: '0',
          statusState: 'live',
          statusLabel: "64'",
          kickoffTime: '21:00',
          kickoffDateLabel: 'Hoy',
          channels: [{ id: 'c3', label: 'M+ Champions 3', lang: 'ES', sourceUrl: '/api/iptv/live/ch3.m3u8', resolverType: 'tdt_hls' }],
        },
      ],
      multiplexChannels: [],
      standings: null,
    };

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes('/api/sports/champions-hub')) {
        return new Response(JSON.stringify(mockHub), { status: 200 });
      }
      return new Response(JSON.stringify({ matches: [] }), { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('lets the user clear, pick 3 specific matches directly on MultiChampions, and launch them together', async () => {
    const onLaunch = vi.fn();

    await act(async () => {
      root.render(
        <ChampionsWorldView
          lang="es"
          isChannelFavorited={() => false}
          onToggleChannelFavorite={vi.fn()}
          onPlaySportsMatch={vi.fn()}
          onPlaySecondaryChannel={vi.fn()}
          onLaunchMultiMatchPreset={onLaunch}
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Clear auto-seeded selection first
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Limpiar')
    );
    expect(clearBtn).toBeDefined();
    act(() => {
      clearBtn?.click();
    });

    // Tap the 3 match cards directly on the default MultiChampions screen
    const cards = Array.from(container.querySelectorAll('[role="button"]'));
    const pickMatch = (team: string) => {
      const card = cards.find((el) => el.textContent?.includes(team));
      expect(card).toBeDefined();
      act(() => {
        (card as HTMLElement).click();
      });
    };

    pickMatch('PSG');
    pickMatch('FC Barcelona');
    pickMatch('Real Madrid');

    const launchBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Ver 3 partidos ahora')
    );
    expect(launchBtn).toBeDefined();
    act(() => {
      launchBtn?.click();
    });

    expect(onLaunch).toHaveBeenCalledTimes(1);
    const launched = onLaunch.mock.calls[0][0];
    expect(launched).toHaveLength(3);
    expect(launched.map((s: { title: string }) => s.title)).toEqual([
      'PSG vs Inter Milan',
      'FC Barcelona vs Bayern München',
      'Real Madrid vs Arsenal',
    ]);
  });

  it('never marks multiple distinct matches as P1 when they happen to share a channel URL', async () => {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes('/api/sports/champions-hub')) {
        return new Response(
          JSON.stringify({
            matches: [
              {
                id: 'ucl-a',
                eventId: '201',
                leagueSlug: 'uefa.champions',
                leagueName: 'Champions League',
                homeTeam: 'Arsenal',
                awayTeam: 'Dortmund',
                homeScore: '1',
                awayScore: '1',
                statusState: 'live',
                statusLabel: "75'",
                channels: [{ id: 'ch-a', label: 'M+ HD', lang: 'ES', sourceUrl: 'https://shared.example/feed', resolverType: 'sports_channel' }],
              },
              {
                id: 'ucl-b',
                eventId: '202',
                leagueSlug: 'uefa.champions',
                leagueName: 'Champions League',
                homeTeam: 'Como',
                awayTeam: 'AEK Athens',
                homeScore: '1',
                awayScore: '0',
                statusState: 'live',
                statusLabel: "69'",
                channels: [{ id: 'ch-b', label: 'M+ HD', lang: 'ES', sourceUrl: 'https://shared.example/feed', resolverType: 'sports_channel' }],
              },
            ],
            multiplexChannels: [],
            standings: null,
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ matches: [] }), { status: 200 });
    }) as typeof fetch;

    await act(async () => {
      root.render(
        <ChampionsWorldView
          lang="es"
          isChannelFavorited={() => false}
          onToggleChannelFavorite={vi.fn()}
          onPlaySportsMatch={vi.fn()}
          onPlaySecondaryChannel={vi.fn()}
          onLaunchMultiMatchPreset={vi.fn()}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const cards = Array.from(container.querySelectorAll('[role="button"]'));
    const arsenalCard = cards.find((c) => c.textContent?.includes('Arsenal'));
    const comoCard = cards.find((c) => c.textContent?.includes('Como'));
    expect(arsenalCard?.textContent).toContain('P1');
    expect(comoCard?.textContent).not.toContain('P1');
    expect(comoCard?.textContent).toContain('Elegir');

    act(() => {
      (comoCard as HTMLElement).click();
    });
    expect(comoCard?.textContent).toContain('P2');
    expect(arsenalCard?.textContent).toContain('P1');
  });

  it('QuickAddMatchSheet lets user watching a normal football match add a 2nd/3rd live match immediately', async () => {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes('/api/sports/champions-hub')) {
        return new Response(JSON.stringify({ matches: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          matches: [
            {
              id: 'ucl-rma',
              eventId: '301',
              leagueSlug: 'uefa.champions',
              leagueName: 'Champions League',
              homeTeam: 'Real Madrid',
              awayTeam: 'PSV',
              homeScore: '3',
              awayScore: '1',
              statusState: 'live',
              statusLabel: "72'",
              channels: [{ id: 'ch-1', label: 'M+ Liga de Campeones', lang: 'ES', sourceUrl: 'https://streamxhd.sbs/live1.php?stream=mligacampeones', resolverType: 'sports_channel' }],
            },
            {
              id: 'ucl-ars',
              eventId: '302',
              leagueSlug: 'uefa.champions',
              leagueName: 'Champions League',
              homeTeam: 'Arsenal',
              awayTeam: 'Borussia Dortmund',
              homeScore: '1',
              awayScore: '1',
              statusState: 'live',
              statusLabel: "76'",
              channels: [{ id: 'ch-2', label: 'ESPN 2 AR', lang: 'ES', sourceUrl: 'https://streamxhd.sbs/live1.php?stream=espn2ar', resolverType: 'sports_channel' }],
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const onAddMatch = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <QuickAddMatchSheet
          isOpen
          onClose={onClose}
          lang="es"
          currentPrimaryTitle="Real Madrid vs PSV"
          currentPrimaryMatchId="301"
          secondaryStreams={[]}
          activeAudioSlot={0}
          onAddMatch={onAddMatch}
          onFocusSlot={vi.fn()}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const rmaBtn = buttons.find((b) => b.textContent?.includes('Real Madrid'));
    const arsBtn = buttons.find((b) => b.textContent?.includes('Arsenal'));
    expect(rmaBtn?.textContent).toContain('P1');
    expect(arsBtn?.textContent).toContain('P2');

    act(() => {
      arsBtn?.click();
    });

    expect(onAddMatch).toHaveBeenCalledTimes(1);
    expect(onAddMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Arsenal vs Borussia Dortmund',
        sourceUrl: 'https://streamxhd.sbs/live1.php?stream=espn2ar',
        matchId: 'ucl-ars',
        forceLayout: 'split',
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
