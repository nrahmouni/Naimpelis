import React from 'react';
import { Star } from 'lucide-react';
import type { RoomGameInviteType } from '../shared/protocol';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { socketService } from '../services/socket';
import { shareDedicatedLink } from '../utils/shareDedicatedLink';
import {
  FOOTBALL_SCOPE_MAP,
  resolveActiveTvPackSlug,
  slugify,
  type CanonicalLinkInput,
} from '../shared/dedicatedRoutes';
import { useAppStore } from '../store/useAppStore';
import { EntryHomeScreen } from './EntryHomeScreen';
import { WorldShell } from './worlds/WorldShell';
import { MediaCatalogHub } from './MediaCatalogHub';
import type { useAppController } from '../hooks/useAppController';
import { lazyWithRetry } from '../utils/lazyWithRetry';

const GamesHubSection = lazyWithRetry(() =>
  import('./GamesHubSection').then((m) => ({ default: m.GamesHubSection }))
);
const ClipBoxWorldView = lazyWithRetry(() =>
  import('./clipbox/ClipBoxWorldView').then((m) => ({ default: m.ClipBoxWorldView }))
);
const RbtvWorldView = lazyWithRetry(() =>
  import('./rbtv/RbtvWorldView').then((m) => ({ default: m.RbtvWorldView }))
);
const BelixWorldView = lazyWithRetry(() =>
  import('./belix/BelixWorldView').then((m) => ({ default: m.BelixWorldView }))
);

interface AppWorldsContentProps {
  controller: ReturnType<typeof useAppController>;
  renderPartySidebar: () => React.ReactNode;
}

export const AppWorldsContent: React.FC<AppWorldsContentProps> = ({
  controller: c,
  renderPartySidebar,
}) => {
  const {
    lang,
    setLang,
    profile,
    watchHistory,
    watchlist,
    favoriteChannels,
    quickPool,
    activeWorld,
    lastUsedWorld,
    cineTab,
    setCineTab,
    cineCastellano,
    setCineCastellano,
    futbolTab,
    setFutbolTab,
    setShowDesignSystem,
    setProfileHubOpen,
    profileHubOpen,
    setProfileHubTab,
    setShowCommandSearch,
    showCommandSearch,
    setShowSurpriseModal,
    showSurpriseModal,
    setAiSearchLaunch,
    setShowWatchlistOnly,
    showWatchlistOnly,
    setShowVoiceAssistant,
    showVoiceAssistant,
    roomId,
    worldSearchQuery,
    setWorldSearchQuery,
    catalogScrollRef,
    roomState,
    isHostUser,
    currentUser,
    voiceChat,
    liveMatchesCount,
    homeFootballMatches,
    portalLandingActive,
    preloadWorld,
    enterWorld,
    socialActions,
    roomGameActions,
    playback,
    lifecycle,
    hasConnectedSmartTv,
    isPlayerActive,
    isDockedMini,
    sessionMode,
  } = c;

  const requestedMovieModal = useAppStore((s) => s.requestedMovieModal);
  const requestedSeriesModal = useAppStore((s) => s.requestedSeriesModal);
  const futbolFavOnly = useAppStore((s) => s.futbolFavOnly);
  const setFutbolFavOnly = useAppStore((s) => s.setFutbolFavOnly);
  const suppressHomeSearchOverlay = Boolean(
    requestedMovieModal ||
      requestedSeriesModal ||
      (isPlayerActive && !isDockedMini) ||
      showSurpriseModal ||
      showCommandSearch ||
      showVoiceAssistant ||
      profileHubOpen
  );

  const handleSelectedGameChange = React.useCallback(
    (game: Parameters<typeof roomState.activeHubGameRef.current extends infer T ? (g: T) => void : never>[0]) => {
      roomState.activeHubGameRef.current = game;
      roomState.setIsInActiveGame(game !== null);
    },
    [roomState.activeHubGameRef, roomState.setIsInActiveGame]
  );

  const shareRoomId = sessionMode !== 'solo' && roomId ? roomId : undefined;

  const handleShareActiveWorld = () => {
    const store = useAppStore.getState();
    let target: CanonicalLinkInput = { kind: 'home' };
    let title = 'RiffanTV';

    if (activeWorld === 'cine') {
      target = {
        kind: 'world',
        world: 'cine',
        cineTab,
        cineCategory: !cineCastellano && cineTab === 'movies' ? 'vose' : undefined,
      };
      title = cineTab === 'series' ? 'RiffanTV · Series' : 'RiffanTV · Cine';
    } else if (activeWorld === 'tv') {
      const packSlug = resolveActiveTvPackSlug({
        tvRegion: store.tvRegion,
        tdtCategory: store.tdtCategory,
        adrarCountryFilter: store.adrarCountryFilter,
      });
      target = packSlug ? { kind: 'pack', packSlug } : { kind: 'world', world: 'tv' };
      title = packSlug ? `RiffanTV · ${packSlug.toUpperCase()}` : 'RiffanTV · TV en Directo';
    } else if (activeWorld === 'futbol') {
      if (futbolTab === 'channels') {
        target = { kind: 'world', world: 'futbol', futbolTab: 'channels' };
      } else {
        let matchedScope: string | undefined;
        if (store.futbolDayOffset === 1) matchedScope = 'manana';
        else if (store.futbolDayOffset === -1) matchedScope = 'ayer';
        else if (store.futbolStatusTab === 'live') matchedScope = 'en-vivo';
        else if (store.futbolLeagueFilter && store.futbolLeagueFilter !== 'all') {
          const found = Object.values(FOOTBALL_SCOPE_MAP).find(
            (cfg) => cfg.leagueFilter === store.futbolLeagueFilter
          );
          if (found) matchedScope = found.scope;
        } else if (store.futbolSearchQuery.trim()) {
          const cleanQ = slugify(store.futbolSearchQuery);
          if (FOOTBALL_SCOPE_MAP[cleanQ]) matchedScope = FOOTBALL_SCOPE_MAP[cleanQ].scope;
        }
        target = matchedScope
          ? { kind: 'footballScope', scope: matchedScope }
          : { kind: 'world', world: 'futbol', futbolTab: 'matches' };
      }
      title = 'RiffanTV · Fútbol en Directo';
    } else if (activeWorld === 'juegos') {
      target = roomState.activeHubGameRef.current
        ? { kind: 'game', gameId: roomState.activeHubGameRef.current }
        : { kind: 'world', world: 'juegos' };
      title = 'Riffan Play · Juegos';
    } else if (activeWorld === 'youtube') {
      target = { kind: 'world', world: 'youtube' };
      title = 'RiffanTV · YouTube';
    } else if (activeWorld === 'clipbox') {
      target = { kind: 'world', world: 'clipbox' };
      title = 'RiffanTV · ClipBox Vault';
    } else if (activeWorld === 'rbtv') {
      target = { kind: 'world', world: 'rbtv' };
      title = 'RiffanTV · RBTV+ Cluster';
    } else if (activeWorld === 'belix') {
      target = { kind: 'world', world: 'belix' };
      title = 'RiffanTV · Belix TV Xtream';
    }

    void shareDedicatedLink({ target, roomId: shareRoomId, title });
  };

  if (activeWorld === 'entry') {
    return (
      <div ref={catalogScrollRef} className="w-full min-w-0 shrink-0">
        <EntryHomeScreen
          lang={lang}
          sessionMode={sessionMode}
          displayName={profile.name}
          isGuestName={!profile.isCustomized}
          onUpdateDisplayName={(newName) =>
            socialActions.handleUpdateProfile(newName, profile.avatar, profile.color)
          }
          watchHistory={watchHistory}
          onResumeHistoryItem={(item) => {
            void playback.handleReplayHistoryItem(item, false);
          }}
          onOpenContinueWatchingAll={() => {
            setProfileHubTab('history');
            setProfileHubOpen(true);
          }}
          onOpenSurpriseMe={() => {
            setAiSearchLaunch((prev) => ({
              query: '',
              mediaType: 'all',
              mode: 'surprise',
              seq: (prev?.seq || 0) + 1,
            }));
            setShowSurpriseModal(true);
          }}
          onSelectWorld={(world, originRect) =>
            enterWorld(world, {
              withPortal:
                world === 'cine' ||
                world === 'futbol' ||
                world === 'tv' ||
                world === 'juegos' ||
                world === 'sala' ||
                world === 'clipbox' ||
                world === 'rbtv' ||
                world === 'belix',
              originRect,
            })
          }
          onPreloadWorld={preloadWorld}
          lastUsedWorld={lastUsedWorld}
          liveMatchesCount={liveMatchesCount}
          roomParticipantsCount={roomState.participants.length}
          movies={quickPool.movies}
          series={quickPool.series}
          tdtChannels={quickPool.tdt}
          liveMatches={homeFootballMatches}
          suppressSearchOverlay={suppressHomeSearchOverlay}
          onOpenMovieDetails={(movieItem) => {
            const store = useAppStore.getState();
            store.setRequestedSeriesModal(null);
            store.setRequestedMovieModal(movieItem);
          }}
          onOpenSeriesPage={(seriesItem) => {
            const store = useAppStore.getState();
            const resolvedTmdbId = Number(
              seriesItem.tmdbId || String(seriesItem.id || '').replace(/[^\d]/g, '') || 0
            );
            if (resolvedTmdbId > 0) {
              store.setRequestedMovieModal(null);
              store.setRequestedSeriesModal({
                series: { ...seriesItem, tmdbId: resolvedTmdbId, mediaType: 'tv' },
                season: seriesItem.seasonNumber || 1,
              });
              return;
            }
            store.setRequestedSeriesModal(null);
            store.setRequestedMovieModal(seriesItem);
          }}
          onOpenDesignSystem={() => setShowDesignSystem(true)}
          onChangeLang={setLang}
          onPlayChannel={(ch) => {
            void playback.handlePlayTdtChannel(ch, 0);
          }}
          onPlayMatch={(matchItem) => {
            void playback.handlePlaySportsMatch(matchItem, 0);
          }}
          onSelectGame={(gid) => {
            const mappedGame = (gid === 'billar' ? 'pool' : gid) as RoomGameInviteType;
            roomState.setForcedOpenGame({ gameType: mappedGame, seq: Date.now() });
            roomState.setIsInActiveGame(true);
            enterWorld('juegos', { withPortal: true });
          }}
          onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
        />
      </div>
    );
  }

  if (activeWorld === 'sala') {
    return (
      <WorldShell
        world="sala"
        title={pickLang(lang, {
          es: 'Sala con Amigos',
          ca: 'Sala amb Amics',
          en: 'Watch Party',
        })}
        lang={lang}
        onBack={() => enterWorld('entry')}
        onGoHome={() => enterWorld('entry')}
        onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
        fullHeight
        className={portalLandingActive ? 'rtv-world-touchdown' : ''}
      >
        {renderPartySidebar()}
      </WorldShell>
    );
  }

  if (activeWorld === 'juegos') {
    return (
      <WorldShell
        world="juegos"
        title={pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
        lang={lang}
        sessionMode={sessionMode}
        onUpgradeSoloToParty={() =>
          void lifecycle.upgradeSoloToPartyRoom({ keepDedicatedUrl: true })
        }
        onShareWorld={handleShareActiveWorld}
        onBack={() => {
          if (roomState.isInActiveGame) {
            roomState.setIsInActiveGame(false);
            roomState.setForcedOpenGame(null);
          }
          enterWorld('entry');
        }}
        onGoHome={() => enterWorld('entry')}
        onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
        fullHeight={roomState.isInActiveGame}
        className={portalLandingActive ? 'rtv-world-touchdown' : ''}
      >
        <div
          className={
            roomState.isInActiveGame
              ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
              : 'w-full flex flex-col'
          }
        >
          <GamesHubSection
            lang={lang}
            roomId={roomId}
            currentUser={currentUser}
            participants={roomState.participants}
            roomBoardGame={roomState.roomGameState}
            roomPartyGame={roomState.partyGameState}
            roomPinturilloGame={roomState.pinturilloState}
            roomPoolGame={roomState.poolGameState}
            roomChapasGame={roomState.chapasGameState}
            roomHeadSoccerGame={roomState.headSoccerGameState}
            headSoccerSyncSnapshot={roomState.headSoccerSyncSnapshot}
            headSoccerPeerInput={roomState.headSoccerPeerInput}
            roomPokerGame={roomState.pokerGameState}
            roomBlackjackGame={roomState.blackjackGameState}
            matchResponses={roomState.matchResponses}
            gameMoveError={roomState.gameMoveError}
            isHost={isHostUser}
            voiceChat={voiceChat}
            requestedGameOpen={roomState.forcedOpenGame}
            onSelectedGameChange={handleSelectedGameChange}
            {...roomGameActions}
          />
        </div>
      </WorldShell>
    );
  }

  if (activeWorld === 'clipbox') {
    return (
      <WorldShell
        world="clipbox"
        title="ClipBox"
        lang={lang}
        sessionMode={sessionMode}
        onUpgradeSoloToParty={() =>
          void lifecycle.upgradeSoloToPartyRoom({ keepDedicatedUrl: true })
        }
        onShareWorld={handleShareActiveWorld}
        onBack={() => enterWorld('entry')}
        onGoHome={() => enterWorld('entry')}
        onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
        searchValue={worldSearchQuery}
        onSearchChange={setWorldSearchQuery}
        searchPlaceholder={pickLang(lang, {
          es: 'Buscar película, serie o anime en ClipBox...',
          ca: 'Cercar pel·lícula, sèrie o anime a ClipBox...',
          en: 'Search movie, series or anime in ClipBox...',
        })}
        className={portalLandingActive ? 'rtv-world-touchdown' : ''}
      >
        <ClipBoxWorldView
          lang={lang}
          externalSearchQuery={worldSearchQuery}
          onPlayCustomUrl={playback.handlePlayCustomUrl}
          onPlayMovie={playback.handlePlayMovie}
          onPlayClipboxMedia={playback.handlePlayClipboxMedia}
        />
      </WorldShell>
    );
  }

  if (activeWorld === 'rbtv') {
    return (
      <WorldShell
        world="rbtv"
        title="RBTV+"
        lang={lang}
        sessionMode={sessionMode}
        onUpgradeSoloToParty={() =>
          void lifecycle.upgradeSoloToPartyRoom({ keepDedicatedUrl: true })
        }
        onShareWorld={handleShareActiveWorld}
        onBack={() => enterWorld('entry')}
        onGoHome={() => enterWorld('entry')}
        onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
        searchValue={worldSearchQuery}
        onSearchChange={setWorldSearchQuery}
        searchPlaceholder={pickLang(lang, {
          es: 'Buscar partido, canal 24/7 o dominio RBTV+...',
          ca: 'Cercar partit, canal 24/7 o domini RBTV+...',
          en: 'Search match, 24/7 channel or RBTV+ domain...',
        })}
        className={portalLandingActive ? 'rtv-world-touchdown' : ''}
      >
        <RbtvWorldView
          lang={lang}
          externalSearchQuery={worldSearchQuery}
          onPlaySportsMatch={(match, idx) => {
            void playback.handlePlaySportsMatch(match, idx);
          }}
          onPlayTdtChannel={(ch, idx) => {
            void playback.handlePlayTdtChannel(ch, idx);
          }}
        />
      </WorldShell>
    );
  }

  if (activeWorld === 'belix') {
    return (
      <WorldShell
        world="belix"
        title="Belix TV"
        lang={lang}
        sessionMode={sessionMode}
        onUpgradeSoloToParty={() =>
          void lifecycle.upgradeSoloToPartyRoom({ keepDedicatedUrl: true })
        }
        onShareWorld={handleShareActiveWorld}
        onBack={() => enterWorld('entry')}
        onGoHome={() => enterWorld('entry')}
        onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
        searchValue={worldSearchQuery}
        onSearchChange={setWorldSearchQuery}
        searchPlaceholder={pickLang(lang, {
          es: 'Buscar canal, partido o ruta Xtream en Belix TV...',
          ca: 'Cercar canal, partit o ruta Xtream a Belix TV...',
          en: 'Search channel, match or Xtream route in Belix TV...',
        })}
        className={portalLandingActive ? 'rtv-world-touchdown' : ''}
      >
        <BelixWorldView
          lang={lang}
          externalSearchQuery={worldSearchQuery}
          onPlaySportsMatch={(match, idx) => {
            void playback.handlePlaySportsMatch(match, idx);
          }}
          onPlayTdtChannel={(ch, idx) => {
            void playback.handlePlayTdtChannel(ch, idx);
          }}
          onPlayCustomUrl={playback.handlePlayCustomUrl}
        />
      </WorldShell>
    );
  }

  return (
    <WorldShell
      world={activeWorld}
      className={portalLandingActive ? 'rtv-world-touchdown' : ''}
      sessionMode={sessionMode}
      onUpgradeSoloToParty={() =>
        void lifecycle.upgradeSoloToPartyRoom({ keepDedicatedUrl: true })
      }
      onShareWorld={handleShareActiveWorld}
      title={
        activeWorld === 'cine'
          ? pickLang(lang, { es: 'Cine', ca: 'Cinema', en: 'Cinema' })
          : activeWorld === 'futbol'
          ? pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' })
          : activeWorld === 'tv'
          ? pickLang(lang, {
              es: 'TV en Directo',
              ca: 'TV en Directe',
              en: 'Live TV',
            })
          : 'YouTube'
      }
      lang={lang}
      onBack={() => enterWorld('entry')}
      onGoHome={() => enterWorld('entry')}
      onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
      quickActions={
        activeWorld === 'futbol' ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setFutbolFavOnly(!futbolFavOnly);
            }}
            aria-pressed={futbolFavOnly}
            aria-label={pickLang(lang, {
              es: 'Solo favoritos',
              ca: 'Només favorits',
              en: 'Favorites only',
            })}
            title={pickLang(lang, {
              es: 'Solo favoritos',
              ca: 'Només favorits',
              en: 'Favorites only',
            })}
            className={`min-w-11 min-h-11 rounded-2xl border flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
              futbolFavOnly
                ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_6px_18px_rgba(124,58,237,0.38)]'
                : 'bg-[#0D0D12] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200 hover:text-white'
            }`}
          >
            <Star className={`w-4 h-4 ${futbolFavOnly ? 'fill-current nc-pop-spring' : ''}`} />
          </button>
        ) : activeWorld === 'cine' ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowWatchlistOnly(!showWatchlistOnly);
            }}
            aria-pressed={showWatchlistOnly}
            aria-label={pickLang(lang, {
              es: 'Mi lista guardada',
              ca: 'La meva llista',
              en: 'Saved list',
            })}
            title={pickLang(lang, {
              es: 'Mi lista guardada',
              ca: 'La meva llista',
              en: 'Saved list',
            })}
            className={`min-w-11 min-h-11 rounded-2xl border flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
              showWatchlistOnly
                ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_6px_18px_rgba(124,58,237,0.38)]'
                : 'bg-[#0D0D12] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200 hover:text-white'
            }`}
          >
            <Star className={`w-4 h-4 ${showWatchlistOnly ? 'fill-current nc-pop-spring' : ''}`} />
          </button>
        ) : undefined
      }
      searchValue={worldSearchQuery}
      onSearchChange={setWorldSearchQuery}
      searchPlaceholder={
        activeWorld === 'cine'
          ? pickLang(lang, {
              es: 'Buscar película, serie o enlace...',
              ca: 'Cercar pel·lícula, sèrie o enllaç...',
              en: 'Search movie, series or URL...',
            })
          : activeWorld === 'futbol'
          ? pickLang(lang, {
              es: 'Buscar partido, equipo o canal...',
              ca: 'Cercar partit, equip o canal...',
              en: 'Search match, team or channel...',
            })
          : activeWorld === 'tv'
          ? pickLang(lang, {
              es: 'Buscar canal o programa...',
              ca: 'Cercar canal o programa...',
              en: 'Search channel or show...',
            })
          : pickLang(lang, {
              es: 'Buscar en YouTube...',
              ca: 'Cercar a YouTube...',
              en: 'Search YouTube...',
            })
      }
    >
      <MediaCatalogHub
        worldMode={activeWorld}
        sessionMode={sessionMode}
        roomId={roomId}
        externalSearchQuery={worldSearchQuery}
        onExternalSearchChange={setWorldSearchQuery}
        cineTab={cineTab}
        onCineTabChange={setCineTab}
        cineCastellano={cineCastellano}
        onCineCastellanoChange={setCineCastellano}
        futbolTab={futbolTab}
        onFutbolTabChange={setFutbolTab}
        activeSection={roomState.catalogSection}
        onChangeSection={(sec) => {
          if (sec === 'tdt') enterWorld('tv');
          else if (sec === 'sports') enterWorld('futbol');
          else if (sec === 'youtube') enterWorld('youtube');
          else if (sec === 'games') enterWorld('juegos');
          else if (sec === 'direct') enterWorld('sala');
          else roomState.setCatalogSection(sec);
        }}
        lang={lang}
        userName={currentUser.name}
        activeVideoRawUrl={roomState.videoState.rawSourceUrl}
        activeMediaTitle={
          roomState.videoState.mode !== 'idle' ? roomState.videoState.title : ''
        }
        loadingItemId={playback.loadingItemId}
        roomQueue={roomState.roomQueue}
        watchHistory={watchHistory}
        watchlist={watchlist}
        favoriteChannels={favoriteChannels}
        onToggleCatalogFavorite={socialActions.handleToggleCatalogFavorite}
        onToggleChannelFavorite={socialActions.handleToggleChannelFavorite}
        onPlayFavoriteChannel={playback.handlePlayFavoriteChannel}
        onPlayMovie={playback.handlePlayMovie}
        onPlaySeriesEpisode={playback.handlePlaySeriesEpisode}
        onPlayCatalaEpisode={playback.handlePlayCatalaEpisode}
        onReplayHistoryItem={playback.handleReplayHistoryItem}
        onRemoveHistoryItem={socialActions.handleRemoveHistoryItem}
        onClearHistory={socialActions.handleClearAllHistory}
        onPlaySportsMatch={playback.handlePlaySportsMatch}
        onPlayTdtChannel={playback.handlePlayTdtChannel}
        onPlayYouTubeVideo={playback.handlePlayYouTubeVideo}
        onPlayCustomUrl={playback.handlePlayCustomUrl}
        onOpenCloudBrowser={lifecycle.handleOpenCloudBrowser}
        onAddToQueue={lifecycle.handleAddToQueue}
        onRemoveFromQueue={(id) => socketService.removeFromQueue(id)}
        onPlayQueueItem={playback.handlePlayQueueItem}
        onStartPollFromQueue={lifecycle.handleStartPollFromQueue}
        onPlaySecondaryChannel={playback.handlePlaySecondaryChannel}
        hasConnectedSmartTv={hasConnectedSmartTv}
        onCreateNewRoom={lifecycle.handleCreateFreshRoom}
        showWatchlistOnly={showWatchlistOnly}
        onWatchlistOnlyChange={setShowWatchlistOnly}
        currentUser={currentUser}
        participants={roomState.participants}
        onSearchWithAi={(query, mediaType = 'all') => {
          setShowCommandSearch(false);
          setAiSearchLaunch((prev) => ({
            query,
            mediaType,
            mode: 'request',
            seq: (prev?.seq || 0) + 1,
          }));
          setShowSurpriseModal(true);
        }}
        onOpenSurpriseMe={() => {
          setAiSearchLaunch((prev) => ({
            query: '',
            mediaType: 'all',
            mode: 'surprise',
            seq: (prev?.seq || 0) + 1,
          }));
          setShowSurpriseModal(true);
        }}
      />
    </WorldShell>
  );
};
