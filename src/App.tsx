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

  const [videoState, setVideoState] = useState<VideoState>({
    url: 'https://movidy.pw/',
    title: 'Movidy - Cine y Series',
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
  const [latencyMs, setLatencyMs] = useState(24);

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
              videoState.url.includes('bingetrix') ? videoState.url : 'https://bingetrix.sc/watch/1423191',
              'Navegador Virtual',
              true
            );
          }
        }}
        onToggleScreenShare={(enabled) => setIsScreenSharing(enabled)}
        onOpenInvite={() => setShowInviteModal(true)}
        onOpenParticipants={() => setShowParticipantsModal(true)}
        onOpenProfile={() => setShowProfileModal(true)}
        onLeaveRoom={handleLeaveRoom}
        onOpenHealthMonitor={() => setShowHealthMonitor(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Upper / Left: Video Player, WebRTC Screen Share or Virtual Browser Section */}
        <div className="w-full md:w-3/5 lg:w-2/3 flex flex-col bg-black border-b md:border-b-0 md:border-r border-slate-800/80 shrink-0 md:shrink h-[42vh] sm:h-[48vh] md:h-full overflow-hidden">
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

        {/* Lower / Right: Handsome Live Chat - Takes full remaining height! */}
        <div className="w-full md:w-2/5 lg:w-1/3 flex-1 flex flex-col min-h-0 bg-slate-950 overflow-hidden">
          <HandsomeChat
            messages={messages}
            currentUser={currentUser}
            onSendMessage={handleSendMessage}
          />
        </div>
      </div>

      {/* Modals */}
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
