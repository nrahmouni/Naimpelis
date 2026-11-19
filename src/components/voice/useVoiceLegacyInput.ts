import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  blobToBase64,
  getSpeechRecognitionCtor,
  resolveSpeechLocale,
  type SpeechRecognitionLike,
} from './voiceAudioHelpers';

interface UseVoiceLegacyInputArgs {
  lang: AppLanguage;
  recognitionRef: MutableRefObject<SpeechRecognitionLike | null>;
  mediaRecorderRef: MutableRefObject<MediaRecorder | null>;
  mediaStreamRef: MutableRefObject<MediaStream | null>;
  audioChunksRef: MutableRefObject<Blob[]>;
  recordAutoStopRef: MutableRefObject<number | null>;
  stopListening: () => void;
  stopSpeechOutput: () => void;
  stopMediaRecorderOnly: (discard?: boolean) => void;
  submitVoiceQuery: (rawQuery: string) => Promise<void>;
  setIsListening: Dispatch<SetStateAction<boolean>>;
  setIsRecordingAudio: Dispatch<SetStateAction<boolean>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setInterimText: Dispatch<SetStateAction<string>>;
  setMicNotice: Dispatch<SetStateAction<string | null>>;
}

export function useVoiceLegacyInput({
  lang,
  recognitionRef,
  mediaRecorderRef,
  mediaStreamRef,
  audioChunksRef,
  recordAutoStopRef,
  stopListening,
  stopSpeechOutput,
  stopMediaRecorderOnly,
  submitVoiceQuery,
  setIsListening,
  setIsRecordingAudio,
  setIsThinking,
  setInterimText,
  setMicNotice,
}: UseVoiceLegacyInputArgs) {
  const startAudioRecorderFallback = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setMicNotice(
        pickLang(lang, {
          es: 'Tu navegador no permite capturar audio; escribe tu mensaje abajo.',
          ca: 'El navegador no permet capturar àudio; escriu el missatge a sota.',
          en: 'Audio capture is not available in this browser; type below.',
          zh: '当前浏览器不支持录音；请在下方输入消息。',
        })
      );
      return;
    }

    stopListening();
    stopSpeechOutput();
    setMicNotice(null);
    setInterimText('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeCandidate = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(
        (m) => MediaRecorder.isTypeSupported(m)
      );
      const recorder = mimeCandidate
        ? new MediaRecorder(stream, { mimeType: mimeCandidate })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const usedMime = recorder.mimeType || 'audio/webm';
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        setIsRecordingAudio(false);
        setIsListening(false);

        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: usedMime });
        if (blob.size < 400) return;

        setIsThinking(true);
        try {
          const base64 = await blobToBase64(blob);
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType: usedMime, lang }),
          });
          const data = (await res.json()) as { success?: boolean; transcript?: string };
          if (data.success && data.transcript?.trim()) {
            await submitVoiceQuery(data.transcript.trim());
            return;
          }
          setIsThinking(false);
          setMicNotice(
            pickLang(lang, {
              es: 'No se escuchó voz clara. Pulsa el micro e inténtalo de nuevo.',
              ca: 'No s’ha sentit veu clara. Prem el micro i torna-ho a provar.',
              en: 'No clear voice detected. Tap the mic to retry.',
              zh: '未检测到清晰语音，请点击麦克风重试。',
            })
          );
        } catch {
          setIsThinking(false);
          setMicNotice(
            pickLang(lang, {
              es: 'Error al transcribir audio. Escribe abajo o reintenta.',
              ca: 'Error en transcriure l’àudio. Escriu a sota o reintenta.',
              en: 'Audio transcription error. Type below or retry.',
              zh: '音频转写失败，请重说或直接打字。',
            })
          );
        }
      };

      recorder.start();
      setIsRecordingAudio(true);
      setIsListening(true);
      triggerHaptic('light');

      recordAutoStopRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 12000);
    } catch {
      setIsRecordingAudio(false);
      setIsListening(false);
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
    audioChunksRef,
    lang,
    mediaRecorderRef,
    mediaStreamRef,
    recordAutoStopRef,
    setInterimText,
    setIsListening,
    setIsRecordingAudio,
    setIsThinking,
    setMicNotice,
    stopListening,
    stopSpeechOutput,
    submitVoiceQuery,
  ]);

  const stopRecordingAndSend = useCallback(() => {
    if (recordAutoStopRef.current !== null) {
      window.clearTimeout(recordAutoStopRef.current);
      recordAutoStopRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === 'recording') {
      try {
        rec.stop();
      } catch {
        stopMediaRecorderOnly(true);
      }
    }
  }, [mediaRecorderRef, recordAutoStopRef, stopMediaRecorderOnly]);

  const startLegacyListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      void startAudioRecorderFallback();
      return;
    }

    stopListening();
    stopSpeechOutput();
    setMicNotice(null);
    setInterimText('');

    try {
      const rec = new Ctor();
      rec.lang = resolveSpeechLocale(lang);
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      let finalCaptured = '';
      let submitted = false;

      rec.onresult = (ev) => {
        let interim = '';
        let finalStr = '';
        for (let i = 0; i < ev.results.length; i += 1) {
          const r = ev.results[i];
          const text = r[0]?.transcript || '';
          if (r.isFinal) finalStr += `${text} `;
          else interim += `${text} `;
        }
        const merged = (finalStr || interim).trim();
        finalCaptured = merged;
        setInterimText(merged);
        if (finalStr.trim() && !submitted) {
          submitted = true;
          void submitVoiceQuery(finalStr.trim());
        }
      };

      rec.onerror = (ev) => {
        setIsListening(false);
        recognitionRef.current = null;
        const errCode = String(ev?.error || '');
        if (
          errCode === 'network' ||
          errCode === 'service-not-allowed' ||
          errCode === 'audio-capture'
        ) {
          void startAudioRecorderFallback();
          return;
        }
        if (errCode === 'not-allowed') {
          setMicNotice(
            pickLang(lang, {
              es: 'Permiso de micrófono denegado. Puedes escribir lo que quieres abajo.',
              ca: 'Permís de micròfon denegat. Pots escriure a sota.',
              en: 'Microphone permission denied. You can type below.',
              zh: '麦克风权限被拒绝，请在下方输入。',
            })
          );
        } else if (errCode !== 'no-speech' && errCode !== 'aborted') {
          setMicNotice(
            pickLang(lang, {
              es: 'No pude oírte bien. Pulsa el micro para intentarlo o usa el chat de texto.',
              ca: 'No t’he sentit bé. Prem el micro o escriu a sota.',
              en: 'Could not hear clearly. Tap mic to retry or type below.',
              zh: '未能清晰收音，请重试或输入文字。',
            })
          );
        }
      };

      rec.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        if (finalCaptured.trim() && !submitted) {
          submitted = true;
          void submitVoiceQuery(finalCaptured.trim());
        }
      };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
      triggerHaptic('light');
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      void startAudioRecorderFallback();
    }
  }, [
    lang,
    recognitionRef,
    setInterimText,
    setIsListening,
    setMicNotice,
    startAudioRecorderFallback,
    stopListening,
    stopSpeechOutput,
    submitVoiceQuery,
  ]);

  return { startAudioRecorderFallback, stopRecordingAndSend, startLegacyListening };
}
