import { useCallback, useRef, useState } from 'react';
import type React from 'react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  base64Pcm16ToFloat32,
  ConversationMessage,
  downsampleTo16k,
  float32ToPcm16Base64,
  VoiceAssistantAppAction,
  VoiceCandidateItem,
} from './voiceAudioHelpers';

interface UseGeminiLiveSessionArgs {
  lang: AppLanguage;
  cleanName: string;
  activeMediaTitle: string;
  onClose: () => void;
  onAppAction?: (action: VoiceAssistantAppAction) => void;
  isOpenRef: React.MutableRefObject<boolean>;
  mutedRef: React.MutableRefObject<boolean>;
  setMessages: React.Dispatch<React.SetStateAction<ConversationMessage[]>>;
  setInterimText: React.Dispatch<React.SetStateAction<string>>;
  setIsListening: React.Dispatch<React.SetStateAction<boolean>>;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  setMicNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setItems: React.Dispatch<React.SetStateAction<VoiceCandidateItem[]>>;
  setUseLiveApi: React.Dispatch<React.SetStateAction<boolean>>;
  stopLegacyAndRecorderRef: React.MutableRefObject<() => void>;
  stopSpeechOutputRef: React.MutableRefObject<() => void>;
  startLegacyListeningRef: React.MutableRefObject<() => void>;
}

export function useGeminiLiveSession({
  lang,
  cleanName,
  activeMediaTitle,
  onClose,
  onAppAction,
  isOpenRef,
  mutedRef,
  setMessages,
  setInterimText,
  setIsListening,
  setIsThinking,
  setIsSpeaking,
  setMicNotice,
  setItems,
  setUseLiveApi,
  stopLegacyAndRecorderRef,
  stopSpeechOutputRef,
  startLegacyListeningRef,
}: UseGeminiLiveSessionArgs) {
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'live'>('idle');

  const liveWsRef = useRef<WebSocket | null>(null);
  const liveMicStreamRef = useRef<MediaStream | null>(null);
  const liveInputCtxRef = useRef<AudioContext | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveOutputCtxRef = useRef<AudioContext | null>(null);
  const liveNextStartTimeRef = useRef<number>(0);
  const liveActiveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveUserMsgIdRef = useRef<string | null>(null);
  const liveUserBufRef = useRef<string>('');
  const liveAssistantMsgIdRef = useRef<string | null>(null);
  const liveAssistantBufRef = useRef<string>('');
  const livePendingAutoPlayTimerRef = useRef<number | null>(null);

  const stopLiveAudioPlayback = useCallback(() => {
    liveActiveSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
    });
    liveActiveSourcesRef.current.clear();
    liveNextStartTimeRef.current = 0;
  }, []);

  const stopGeminiLiveSession = useCallback(() => {
    if (livePendingAutoPlayTimerRef.current !== null) {
      window.clearTimeout(livePendingAutoPlayTimerRef.current);
      livePendingAutoPlayTimerRef.current = null;
    }
    if (liveProcessorRef.current) {
      try {
        liveProcessorRef.current.onaudioprocess = null;
        liveProcessorRef.current.disconnect();
      } catch {
        // ignore
      }
      liveProcessorRef.current = null;
    }
    if (liveInputCtxRef.current) {
      try {
        void liveInputCtxRef.current.close();
      } catch {
        // ignore
      }
      liveInputCtxRef.current = null;
    }
    if (liveMicStreamRef.current) {
      liveMicStreamRef.current.getTracks().forEach((t) => t.stop());
      liveMicStreamRef.current = null;
    }
    if (liveWsRef.current) {
      try {
        liveWsRef.current.onopen = null;
        liveWsRef.current.onmessage = null;
        liveWsRef.current.onerror = null;
        liveWsRef.current.onclose = null;
        liveWsRef.current.close();
      } catch {
        // ignore
      }
      liveWsRef.current = null;
    }
    stopLiveAudioPlayback();
    if (liveOutputCtxRef.current) {
      try {
        void liveOutputCtxRef.current.close();
      } catch {
        // ignore
      }
      liveOutputCtxRef.current = null;
    }
    liveUserMsgIdRef.current = null;
    liveUserBufRef.current = '';
    liveAssistantMsgIdRef.current = null;
    liveAssistantBufRef.current = '';
    setLiveStatus('idle');
  }, [stopLiveAudioPlayback]);

  const startGeminiLiveSession = useCallback(async () => {
    if (
      typeof window === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof WebSocket === 'undefined'
    ) {
      startLegacyListeningRef.current();
      return;
    }

    stopLegacyAndRecorderRef.current();
    stopGeminiLiveSession();
    stopSpeechOutputRef.current();
    setMicNotice(null);
    setInterimText('');
    setLiveStatus('connecting');
    setIsThinking(true);

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      liveMicStreamRef.current = micStream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      let outCtx: AudioContext;
      try {
        outCtx = new AudioCtx({ sampleRate: 24000 });
      } catch {
        outCtx = new AudioCtx();
      }
      if (outCtx.state === 'suspended') {
        await outCtx.resume().catch(() => {});
      }
      liveOutputCtxRef.current = outCtx;
      liveNextStartTimeRef.current = outCtx.currentTime;

      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/ws/gemini-live?userName=${encodeURIComponent(
        cleanName
      )}&lang=${encodeURIComponent(lang)}&activeMedia=${encodeURIComponent(activeMediaTitle)}`;

      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      const enqueueLivePcm = (b64: string) => {
        if (mutedRef.current || !liveOutputCtxRef.current) return;
        const ctx = liveOutputCtxRef.current;
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
        const float32 = base64Pcm16ToFloat32(b64);
        if (float32.length === 0) return;
        const buffer = ctx.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        const startAt = Math.max(ctx.currentTime + 0.02, liveNextStartTimeRef.current);
        source.start(startAt);
        liveNextStartTimeRef.current = startAt + buffer.duration;
        liveActiveSourcesRef.current.add(source);
        setIsSpeaking(true);
        source.onended = () => {
          liveActiveSourcesRef.current.delete(source);
          if (liveActiveSourcesRef.current.size === 0) {
            setIsSpeaking(false);
          }
        };
      };

      ws.onmessage = (ev) => {
        if (!isOpenRef.current) return;
        try {
          const msg = JSON.parse(String(ev.data)) as {
            ready?: boolean;
            error?: string;
            fallback?: boolean;
            inputTranscript?: string;
            outputTranscript?: string;
            audio?: string;
            interrupted?: boolean;
            turnComplete?: boolean;
            toolItems?: VoiceCandidateItem[];
            autoPlay?: boolean;
            toolAction?: VoiceAssistantAppAction;
          };

          if (msg.fallback || msg.error) {
            stopGeminiLiveSession();
            setIsThinking(false);
            setUseLiveApi(false);
            startLegacyListeningRef.current();
            return;
          }

          if (msg.ready) {
            setLiveStatus('live');
            setIsThinking(false);
            setIsListening(true);
            triggerHaptic('medium');

            try {
              let inCtx: AudioContext;
              try {
                inCtx = new AudioCtx({ sampleRate: 16000 });
              } catch {
                inCtx = new AudioCtx();
              }
              liveInputCtxRef.current = inCtx;
              const srcNode = inCtx.createMediaStreamSource(micStream);
              const processor = inCtx.createScriptProcessor(2048, 1, 1);
              const silentGain = inCtx.createGain();
              silentGain.gain.value = 0;

              processor.onaudioprocess = (audioEv) => {
                const activeWs = liveWsRef.current;
                if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
                const rawChannel = audioEv.inputBuffer.getChannelData(0);
                const pcm16k = downsampleTo16k(rawChannel, inCtx.sampleRate);
                const audioB64 = float32ToPcm16Base64(pcm16k);
                activeWs.send(JSON.stringify({ audio: audioB64 }));
              };

              srcNode.connect(processor);
              processor.connect(silentGain);
              silentGain.connect(inCtx.destination);
              liveProcessorRef.current = processor;
            } catch {
              stopGeminiLiveSession();
              setUseLiveApi(false);
              startLegacyListeningRef.current();
            }
            return;
          }

          if (msg.inputTranscript) {
            liveUserBufRef.current = `${liveUserBufRef.current} ${msg.inputTranscript}`
              .replace(/\s+/g, ' ')
              .trim();
            setInterimText(liveUserBufRef.current);
            liveAssistantMsgIdRef.current = null;
            liveAssistantBufRef.current = '';
          }

          if (msg.outputTranscript) {
            if (liveUserBufRef.current) {
              const userText = liveUserBufRef.current;
              const uId = liveUserMsgIdRef.current || `u-live-${Date.now()}`;
              liveUserMsgIdRef.current = null;
              liveUserBufRef.current = '';
              setInterimText('');
              setMessages((prev) =>
                prev.some((m) => m.id === uId)
                  ? prev.map((m) => (m.id === uId ? { ...m, text: userText } : m))
                  : [...prev, { id: uId, role: 'user', text: userText }]
              );
            }

            const aId = liveAssistantMsgIdRef.current || `a-live-${Date.now()}`;
            liveAssistantMsgIdRef.current = aId;
            liveAssistantBufRef.current = `${liveAssistantBufRef.current}${msg.outputTranscript}`;
            const mergedAssistant = liveAssistantBufRef.current.trim();
            setMessages((prev) =>
              prev.some((m) => m.id === aId)
                ? prev.map((m) => (m.id === aId ? { ...m, text: mergedAssistant } : m))
                : [...prev, { id: aId, role: 'assistant', text: mergedAssistant }]
            );
          }

          if (msg.audio) {
            enqueueLivePcm(msg.audio);
          }

          if (msg.interrupted) {
            stopLiveAudioPlayback();
            setIsSpeaking(false);
          }

          if (msg.turnComplete) {
            liveAssistantMsgIdRef.current = null;
            liveAssistantBufRef.current = '';
          }

          if (msg.toolAction && onAppAction) {
            const actionPayload = msg.toolAction;
            window.setTimeout(() => {
              onAppAction(actionPayload);
              if (
                actionPayload.type === 'open_world' ||
                actionPayload.type === 'surprise_me' ||
                actionPayload.type === 'open_friends'
              ) {
                onClose();
              }
            }, 650);
          }

          if (Array.isArray(msg.toolItems) && msg.toolItems.length > 0) {
            setItems(msg.toolItems);
          }
        } catch {
          // ignore malformed ws payload
        }
      };

      ws.onerror = () => {
        stopGeminiLiveSession();
        setIsThinking(false);
        setUseLiveApi(false);
        startLegacyListeningRef.current();
      };

      ws.onclose = () => {
        setLiveStatus('idle');
        setIsListening(false);
        setIsThinking(false);
      };
    } catch {
      stopGeminiLiveSession();
      setIsThinking(false);
      setMicNotice(
        pickLang(lang, {
          es: 'Permiso de micrófono bloqueado. Permite el micro o escribe abajo.',
          ca: 'Permís de micròfon bloquejat. Permet el micro o escriu a sota.',
          en: 'Microphone blocked. Allow mic permission or type below.',
          zh: '麦克风权限被阻止，请允许权限或在下方输入。',
        })
      );
    }
  }, [
    activeMediaTitle,
    cleanName,
    isOpenRef,
    lang,
    mutedRef,
    onAppAction,
    onClose,
    setInterimText,
    setIsListening,
    setIsSpeaking,
    setIsThinking,
    setItems,
    setMessages,
    setMicNotice,
    setUseLiveApi,
    startLegacyListeningRef,
    stopGeminiLiveSession,
    stopLegacyAndRecorderRef,
    stopLiveAudioPlayback,
    stopSpeechOutputRef,
  ]);

  return {
    liveStatus,
    liveWsRef,
    stopLiveAudioPlayback,
    stopGeminiLiveSession,
    startGeminiLiveSession,
  };
}
