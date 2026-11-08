import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { VideoPlayerContainer } from './components/VideoPlayerContainer';
import { VirtualChromeBrowser } from './components/VirtualChromeBrowser';
import { ScreenShareContainer } from './components/ScreenShareContainer';
import { HandsomeChat } from './components/HandsomeChat';
import { InviteModal } from './components/InviteModal';
import { ParticipantsModal } from './components/ParticipantsModal';
import { UserProfileModal } from './components/UserProfileModal';
import { HealthMonitorModal } from './components/HealthMonitorModal';
import { RoomJoinScreen } from './components/RoomJoinScreen';
import { socketService } from './services/socket';
import { SendToTvModal } from './components/SendToTvModal';
import { MessageSquare, X } from 'lucide-react';
import { ChatMessage, FloatingReaction, Participant, VideoSourceType, VideoState } from './types';
import { parseVideoUrl } from './utils/videoParser';

export default function App() {
  const [joinedRoom, setJoinedRoom] = useState(false);
  const [roomId, setRoomId] = useState<string>('');
  const [hostId, setHostId] = useState<string>('');
  const [roomName, setRoomName] = useState<string>('Sala de Cine 🍿');

  // Check URL query parameters for invitation links
  const queryParams = new URLSearchParams(window.location.search);
  const initialRoomFromUrl = queryParams.get('room') || '';

  const [currentUser, setCurrentUser] = useState<Participant>({
    id: `user-${Math.random().toString(36).substring(2, 8)}`,
    name: `Cinefilo_${Math.floor(Math.random() * 900 + 100)}`,
    avatar: '🍿',
    color: '#f43f5e',
    isHost: false,
    joinedAt: Date.now(),
  });

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const [videoState, setVideoState] = useState<VideoState>({
    url: 'https://bingetrix.sc/watch',
    title: 'Bingetrix',
    sourceType: 'iframe',
    currentTime: 0,
    isPlaying: false,
    lastUpdated: Date.now(),
  });

  // Modals state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showHealthMonitor, setShowHealthMonitor] = useState(false);
  const [showTvModal, setShowTvModal] = useState(false);
  const isTvScreenMode = queryParams.get('tv') === '1';
  const [latencyMs, setLatencyMs] = useState(24);

  // Auto-connect when opened in Smart TV mode
  useEffect(() => {
    if (isTvScreenMode && initialRoomFromUrl && !joinedRoom) {
      const tvUser = {
        id: `tv-${Math.random().toString(36).substring(2, 7)}`,
        name: '📺 Smart TV Pantalla',
        avatar: '📺',
        color: '#3b82f6',
        isHost: false,
        joinedAt: Date.now(),
      };
      setCurrentUser(tvUser);
      setRoomId(initialRoomFromUrl);
      setJoinedRoom(true);
      socketService.connect(initialRoomFromUrl, tvUser);
    }
  }, [isTvScreenMode, initialRoomFromUrl, joinedRoom]);

  // Monitor latency periodically via WebSocket round-trip
  useEffect(() => {
    if (!joinedRoom) return;
    const interval = setInterval(() => {
      const start = performance.now();
      fetch('/api/rooms/' + encodeURIComponent(roomId))
        .then(() => {
          const roundTrip = Math.round(performance.now() - start);
          setLatencyMs(roundTrip);
        })
        .catch(() => {});
    }, 4000);

    return () => clearInterval(interval);
  }, [joinedRoom, roomId]);

  // Subscribe to real-time events once connected
  useEffect(() => {
    if (!joinedRoom || !roomId) return;

    const unsubscribe = socketService.subscribe(({ type, payload }) => {
      if (type === 'ROOM_STATE') {
        setHostId(payload.hostId);
        setRoomName(payload.name || `Sala ${roomId}`);
        setParticipants(payload.participants || []);
        if (payload.videoState) {
          setVideoState(payload.videoState);
          // If the room is already in Virtual Browser/iframe mode, switch invited user immediately!
          if (payload.videoState.sourceType === 'iframe' || payload.videoState.url?.includes('vidsrc') || payload.videoState.url?.includes('bingetrix')) {
            setIsVirtualBrowser(true);
          }
        }
        if (payload.messages) {
          setMessages(payload.messages);
        }

        // Update current user's host status if set by server
        const meInRoom = payload.participants?.find((p: Participant) => p.id === currentUser.id);
        if (meInRoom) {
          setCurrentUser((prev) => ({ ...prev, isHost: meInRoom.isHost }));
        }
      } else if (type === 'PARTICIPANTS_UPDATED') {
        setParticipants(payload.participants || []);
        if (payload.hostId) setHostId(payload.hostId);
        if (payload.message) {
          setMessages((prev) => [...prev, payload.message]);
        }

        const meInRoom = payload.participants?.find((p: Participant) => p.id === currentUser.id);
        if (meInRoom) {
          setCurrentUser((prev) => ({ ...prev, isHost: meInRoom.isHost }));
        }
      } else if (type === 'VIDEO_STATE_UPDATED') {
        setVideoState(payload.videoState);
        if (payload.videoState?.sourceType === 'iframe' || payload.videoState?.url?.includes('vidsrc') || payload.videoState?.url?.includes('bingetrix')) {
          setIsVirtualBrowser(true);
        }
        if (payload.messages) {
          setMessages(payload.messages);
        }
      } else if (type === 'NEW_CHAT_MESSAGE') {
        setMessages((prev) => [...prev, payload]);
        setIsChatOpen((open) => {
          if (!open) setUnreadChatCount((count) => count + 1);
          return open;
        });
      } else if (type === 'FLOATING_REACTION') {
        setReactions((prev) => [...prev, payload]);
        // Remove reaction after floating animation finishes (2.2s)
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== payload.id));
        }, 2200);
      } else if (type === 'HOST_TRANSFERRED') {
        setHostId(payload.hostId);
        setParticipants(payload.participants);
        if (payload.message) {
          setMessages((prev) => [...prev, payload.message]);
        }
        setCurrentUser((prev) => ({ ...prev, isHost: payload.hostId === prev.id }));
      } else if (type === 'WEBRTC_SIGNAL') {
        if (payload?.signalData?.type === 'screen_share_started') {
          setIsScreenSharing(true);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [joinedRoom, roomId, currentUser.id]);

  const handleJoinRoom = (targetRoomId: string, userMeta: { name: string; avatar: string; color: string }) => {
    const updatedUser = {
      ...currentUser,
      name: userMeta.name,
      avatar: userMeta.avatar,
      color: userMeta.color,
    };
    setCurrentUser(updatedUser);
    setRoomId(targetRoomId);
    setJoinedRoom(true);

    // Update browser URL query param without full page reload
    const newUrl = `${window.location.pathname}?room=${targetRoomId}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);

    // Connect to WebSocket server & fallback
    socketService.connect(targetRoomId, updatedUser);
  };

  // Video State Handler
  const handleVideoPlaybackChange = (action: 'play' | 'pause' | 'seek', time: number, isPlaying: boolean) => {
    const newVideoState: VideoState = {
      ...videoState,
      currentTime: time,
      isPlaying,
      lastUpdated: Date.now(),
      updatedBy: currentUser.name,
    };
    setVideoState(newVideoState);
    socketService.syncVideoState(action, newVideoState, currentUser.name);
  };

  const [isVirtualBrowser, setIsVirtualBrowser] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Handle URL change with movie resolver and virtual browser proxy support
  const handleUrlChange = async (newUrl: string, title?: string, forceVirtualBrowser?: boolean) => {
    let finalUrl = newUrl;
    let finalTitle = title || 'Película / Vídeo';
    let poster = '';
    let overview = '';
    let releaseYear = '';
    let originalPortalUrl = '';
    let altEmbeds: string[] = [];
    let trailerUrl = '';
    let determinedSourceType: VideoSourceType = forceVirtualBrowser ? 'iframe' : 'direct';

    // If user explicitly picked Virtual Browser or it's a web portal
    if (forceVirtualBrowser || /bingetrix\.[a-z]+\/(?:watch|movie|tv)\/\d+/i.test(newUrl)) {
      determinedSourceType = 'iframe';
      originalPortalUrl = newUrl;
      finalTitle = 'Bingetrix - Resident Evil (2026)';

      try {
        const res = await fetch(`/api/resolve-movie?url=${encodeURIComponent(newUrl)}`);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data && data.success) {
            finalTitle = `${data.title} ${data.releaseYear ? `(${data.releaseYear})` : ''}`;
            poster = data.poster || '';
            overview = data.overview || '';
            releaseYear = data.releaseYear || '';
            altEmbeds = data.streamEmbeds || [];
            trailerUrl = data.trailerUrl || '';
          }
        }
      } catch (err) {
        console.error('Error resolving movie URL:', err);
      }
    } else {
      const parsed = parseVideoUrl(finalUrl);
      determinedSourceType = parsed.type;
    }

    const newVideoState: VideoState = {
      url: finalUrl,
      title: finalTitle,
      sourceType: determinedSourceType,
      currentTime: 0,
      isPlaying: true,
      lastUpdated: Date.now(),
      updatedBy: currentUser.name,
      poster,
      overview,
      releaseYear,
      originalPortalUrl,
      altEmbeds,
      trailerUrl,
    };

    setVideoState(newVideoState);
    socketService.syncVideoState('change_url', newVideoState, currentUser.name);
  };

  // Send Chat Message
  const handleSendMessage = (text: string) => {
    socketService.sendChatMessage(currentUser, text);
  };

  // Send Reaction
  const handleSendReaction = (emoji: string) => {
    socketService.sendReaction(currentUser, emoji);
  };

  // Host transfer
  const handleTransferHost = (newHostId: string) => {
    socketService.transferHost(newHostId);
    setShowParticipantsModal(false);
  };

  // User Profile save
  const handleSaveProfile = (name: string, avatar: string, color: string) => {
    const updatedUser = { ...currentUser, name, avatar, color };
    setCurrentUser(updatedUser);
  };

  const handleLeaveRoom = () => {
    socketService.disconnect();
    setJoinedRoom(false);
    setRoomId('');
    const cleanUrl = window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
  };

  if (!joinedRoom) {
    return (
      <RoomJoinScreen
        initialRoomId={initialRoomFromUrl}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Bar Header */}
      <Header
        roomName={roomName}
        roomId={roomId}
        participants={participants}
        currentUser={currentUser}
        latencyMs={latencyMs}
        isVirtualBrowser={isVirtualBrowser}
        isScreenSharing={isScreenSharing}
        onToggleVirtualBrowser={(enabled) => {
          setIsVirtualBrowser(enabled);
          if (enabled && videoState.sourceType !== 'iframe') {
            handleUrlChange(
              videoState.url.includes('bingetrix') ? videoState.url : 'https://bingetrix.sc/watch',
              'Navegador Virtual',
              true
            );
          }
        }}
        onToggleScreenShare={(enabled) => setIsScreenSharing(enabled)}
        onOpenInvite={() => setShowInviteModal(true)}
        onOpenTv={() => setShowTvModal(true)}
        onOpenParticipants={() => setShowParticipantsModal(true)}
        onOpenProfile={() => setShowProfileModal(true)}
        onLeaveRoom={handleLeaveRoom}
        onOpenHealthMonitor={() => setShowHealthMonitor(true)}
      />

      {/* Main Content Area */}
      {isTvScreenMode ? (
        /* Fullscreen Pure TV Cinema Viewport (Zero distracting bars on the big screen) */
        <div className="flex-1 w-full h-full bg-black relative flex items-center justify-center overflow-hidden">
          {/* Subtle TV Cinema Watermark */}
          <div className="absolute top-3 left-4 z-20 pointer-events-none flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs text-white/80">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="font-bold">Modo Cine TV</span>
            <span className="text-white/40 font-mono">| {roomName}</span>
          </div>

          {videoState.sourceType === 'iframe' || isVirtualBrowser ? (
            <iframe
              src={
                /vidsrc|autoembed|2embed|movidy|\/embed\//i.test(videoState.url)
                  ? videoState.url
                  : `/api/proxy-web?url=${encodeURIComponent(videoState.url)}&roomId=${encodeURIComponent(roomId)}`
              }
              title="TV Cinema Screen"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0 bg-black"
            />
          ) : (
            <VideoPlayerContainer
              videoState={videoState}
              isHost={false}
              userName={currentUser.name}
              userColor={currentUser.color}
              reactions={reactions}
              onStateChange={handleVideoPlaybackChange}
              onSendReaction={handleSendReaction}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 w-full h-full min-h-0 relative flex flex-col overflow-hidden bg-black">
          {/* Main Content: Full-screen Video Player, WebRTC Screen Share or Virtual Browser */}
          <div className="flex-1 w-full h-full min-h-0 flex flex-col overflow-hidden">
            {isScreenSharing ? (
              <ScreenShareContainer
                isHost={currentUser.isHost}
                roomId={roomId}
                currentUserId={currentUser.id}
                onStopScreenShare={() => setIsScreenSharing(false)}
              />
            ) : isVirtualBrowser || videoState.sourceType === 'iframe' ? (
              <VirtualChromeBrowser
                currentUrl={videoState.url}
                videoState={videoState}
                remoteBrowserActive={false}
                isHost={currentUser.isHost}
                roomId={roomId}
                onNavigate={(navUrl, navTitle) => {
                  handleUrlChange(navUrl, navTitle || 'Navegador Virtual Sincronizado', true);
                }}
                onPlaybackChange={handleVideoPlaybackChange}
                onSendReaction={handleSendReaction}
              />
            ) : (
              <VideoPlayerContainer
                videoState={videoState}
                isHost={currentUser.isHost}
                userName={currentUser.name}
                userColor={currentUser.color}
                reactions={reactions}
                onStateChange={handleVideoPlaybackChange}
                onSendReaction={handleSendReaction}
              />
            )}
          </div>

          {/* Floating Chat Action Button - By default chat is always in this floating button */}
          {!isChatOpen && (
            <button
              onClick={() => {
                setIsChatOpen(true);
                setUnreadChatCount(0);
              }}
              className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-rose-600 via-rose-500 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-extrabold text-sm shadow-2xl shadow-rose-950/80 border border-white/20 active:scale-95 transition-all duration-200 group cursor-pointer"
              aria-label="Abrir chat flotante"
            >
              <div className="relative">
                <MessageSquare className="w-5 h-5 transition-transform group-hover:scale-110" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-950 font-black text-[10px] ring-2 ring-slate-950 animate-bounce">
                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
                  </span>
                )}
              </div>
              <span className="font-extrabold tracking-wide">Chat</span>
              <span className="text-white/70 text-xs font-normal">({participants.length})</span>
            </button>
          )}

          {/* Floating Chat Modal / Drawer - Appears on top when opened, can be minimized/closed */}
          {isChatOpen && (
            <div className="fixed inset-x-3 bottom-3 top-20 md:inset-x-auto md:top-auto md:bottom-5 md:right-5 md:w-[380px] md:h-[540px] z-50 flex flex-col rounded-2xl shadow-2xl shadow-black/90 border border-slate-700/80 bg-slate-950/95 backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
              {/* Header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 text-slate-100 select-none">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="font-extrabold text-sm truncate">Chat de la Sala</span>
                  <span className="text-xs text-slate-400 font-medium">({participants.length} en línea)</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsChatOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    title="Minimizar a botón flotante"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Chat View */}
              <div className="flex-1 min-h-0 flex flex-col">
                <HandsomeChat
                  messages={messages}
                  currentUser={currentUser}
                  onSendMessage={handleSendMessage}
                  onClose={() => setIsChatOpen(false)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showTvModal && (
        <SendToTvModal
          isOpen={showTvModal}
          onClose={() => setShowTvModal(false)}
          roomId={roomId}
          roomName={roomName}
          currentVideoUrl={videoState.url}
          currentVideoTitle={videoState.title}
        />
      )}

      {showInviteModal && (
        <InviteModal
          roomId={roomId}
          roomName={roomName}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {showParticipantsModal && (
        <ParticipantsModal
          participants={participants}
          currentUser={currentUser}
          hostId={hostId}
          onTransferHost={handleTransferHost}
          onClose={() => setShowParticipantsModal(false)}
        />
      )}

      {showProfileModal && (
        <UserProfileModal
          currentUser={currentUser}
          onSave={handleSaveProfile}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {showHealthMonitor && (
        <HealthMonitorModal
          latencyMs={latencyMs}
          videoState={videoState}
          isHost={currentUser.isHost}
          participantCount={participants.length}
          onForceResync={() => {
            // Force re-sync with latest video state from server
            fetch('/api/rooms/' + encodeURIComponent(roomId))
              .then((r) => r.json())
              .then((room) => {
                if (room?.videoState) {
                  setVideoState({ ...room.videoState, lastUpdated: Date.now() });
                }
              })
              .catch(() => {});
          }}
          onClose={() => setShowHealthMonitor(false)}
        />
      )}
    </div>
  );
}
