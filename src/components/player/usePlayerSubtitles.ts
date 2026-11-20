import React, { useEffect, useRef, useState } from 'react';
import type { AppLanguage, SubtitleTrackItem, VideoState } from '../../types';
import { pickLang } from '../../utils/i18n';
import { ParsedSubtitleCue, parseSubtitleText } from '../../utils/subtitles';

interface UsePlayerSubtitlesParams {
  videoState: VideoState;
  lang: AppLanguage;
  showTransientToast: (msg: string) => void;
  onResetMenus: () => void;
}

export function usePlayerSubtitles({
  videoState,
  lang,
  showTransientToast,
  onResetMenus,
}: UsePlayerSubtitlesParams) {
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrackItem[]>([]);
  const [activeSubId, setActiveSubId] = useState<string>('off');
  const [parsedCues, setParsedCues] = useState<ParsedSubtitleCue[]>([]);
  const [subtitleOffsetSec, setSubtitleOffsetSec] = useState<number>(0);
  const [subtitleSize, setSubtitleSize] = useState<'sm' | 'md' | 'lg'>('sm');
  const subtitleFileInputRef = useRef<HTMLInputElement | null>(null);
  const autoLoadedKeyRef = useRef<string>('');
  const manualSelectionRef = useRef<boolean>(false);

  const onResetMenusRef = useRef(onResetMenus);
  onResetMenusRef.current = onResetMenus;

  useEffect(() => {
    setActiveSubId('off');
    setParsedCues([]);
    setSubtitleOffsetSec(0);
    autoLoadedKeyRef.current = '';
    manualSelectionRef.current = false;
    onResetMenusRef.current();

    if (videoState.mode !== 'hls' && videoState.mode !== 'direct') {
      setSubtitleTracks([]);
      return;
    }

    const builtInSubs: SubtitleTrackItem[] = Array.isArray(videoState.subtitles)
      ? videoState.subtitles
      : [];

    let detectedTmdbId = videoState.tmdbId ?? videoState.seriesMeta?.tmdbId;
    if (!detectedTmdbId && videoState.rawSourceUrl) {
      const m = videoState.rawSourceUrl.match(/(?:watch|movie|tv|-|\/)(\d{2,9})(?:$|\/|\?)/i);
      if (m) detectedTmdbId = Number(m[1]);
    }
    const cleanTitle = String(videoState.seriesMeta?.seriesTitle || videoState.title || '')
      .replace(/\s*·\s*\d+x\d+.*$/i, '')
      .trim();

    if (!detectedTmdbId && (!cleanTitle || videoState.isLive)) {
      setSubtitleTracks(builtInSubs);
      return;
    }

    setSubtitleTracks(builtInSubs);
    let cancelled = false;
    const qs = new URLSearchParams();
    if (detectedTmdbId) qs.set('tmdbId', String(detectedTmdbId));
    if (cleanTitle) qs.set('title', cleanTitle);
    if (videoState.seriesMeta?.season && videoState.seriesMeta?.episode) {
      qs.set('mediaType', 'tv');
      qs.set('season', String(videoState.seriesMeta.season));
      qs.set('episode', String(videoState.seriesMeta.episode));
    }

    const normalizeSubCode = (rawLang?: string, rawLabel?: string): string => {
      const code = String(rawLang || '').trim().toUpperCase();
      const lbl = String(rawLabel || '').trim().toUpperCase();
      if (/^(ES|SPA|ESP|CASTELLANO)$/.test(code) || /ESPAÑOL|CASTELLANO|SPANISH/.test(lbl)) return 'ES';
      if (/^(LAT)$/.test(code) || /LATIN/.test(lbl)) return 'LAT';
      if (/^(CAT|CA)$/.test(code) || /CATAL/.test(lbl)) return 'CAT';
      if (/^(EN|ENG|US|UK)$/.test(code) || /ENGLISH|INGL/.test(lbl)) return 'EN';
      return code || 'SUB';
    };

    const getOrderedCandidates = (tracks: SubtitleTrackItem[]): SubtitleTrackItem[] => {
      const order =
        lang === 'ca'
          ? ['CAT', 'ES', 'LAT', 'EN']
          : lang === 'en'
          ? ['EN', 'ES', 'LAT', 'CAT']
          : ['ES', 'LAT', 'CAT', 'EN'];
      return [...tracks].sort((a, b) => {
        const ai = order.indexOf(normalizeSubCode(a.lang, a.label));
        const bi = order.indexOf(normalizeSubCode(b.lang, b.label));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    };

    const applyBestDefaultIfForeign = async (tracks: SubtitleTrackItem[]) => {
      if (cancelled || tracks.length === 0 || manualSelectionRef.current) return;
      const streamIdentity = `${videoState.url}|${videoState.activeTrackIndex}`;
      if (autoLoadedKeyRef.current === streamIdentity) return;

      const activeTrack = videoState.tracks?.[videoState.activeTrackIndex];
      const activeTrackLang = String(activeTrack?.lang || '').toUpperCase();
      const activeTrackLabel = String(activeTrack?.label || '').toUpperCase();
      const isPureSpanishAudio =
        activeTrackLang === 'ES' ||
        activeTrackLang === 'LAT' ||
        activeTrackLang === 'CAT' ||
        /CASTELLANO|ESPAÑOL AUDIO|LATINO/.test(activeTrackLabel);
      const isClipboxSource = String(videoState.rawSourceUrl || '').startsWith('clipbox:');
      const needsAutoSub =
        !isPureSpanishAudio &&
        (isClipboxSource ||
          /^(VOSE|VOS|SUB|VO|MULTI|ORIGINAL|EN|JA|JP|KO|FR|IT|DE|PT|ZH)/.test(activeTrackLang) ||
          /VOSE|SUBTITUL|ENGLISH|JAPON|ANIME/.test(activeTrackLabel));
      if (!needsAutoSub) return;

      const candidates = getOrderedCandidates(tracks).slice(0, 5);
      for (const candidate of candidates) {
        if (cancelled || manualSelectionRef.current) return;
        if (candidate.rawContent) {
          const cues = parseSubtitleText(candidate.rawContent);
          if (cues.length > 0 && !cancelled && !manualSelectionRef.current) {
            autoLoadedKeyRef.current = streamIdentity;
            setActiveSubId(candidate.id);
            setParsedCues(cues);
            return;
          }
        } else if (candidate.url) {
          try {
            const r = await fetch(candidate.url);
            if (!r.ok) continue;
            const text = await r.text();
            const cues = parseSubtitleText(text);
            if (cues.length > 0 && !cancelled && !manualSelectionRef.current) {
              autoLoadedKeyRef.current = streamIdentity;
              setActiveSubId(candidate.id);
              setParsedCues(cues);
              return;
            }
          } catch {
            // try next candidate
          }
        }
      }
    };

    if (builtInSubs.length > 0) {
      void applyBestDefaultIfForeign(builtInSubs);
    }

    fetch(`/api/subtitles/search?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.tracks)) {
          const merged = [...builtInSubs];
          const seenKeys = new Set(merged.map((s) => s.url || s.id));
          for (const tr of data.tracks as SubtitleTrackItem[]) {
            const key = tr?.url || tr?.id;
            if (key && !seenKeys.has(key)) {
              seenKeys.add(key);
              merged.push(tr);
            }
          }
          setSubtitleTracks(merged);
          if (merged.length > 0) {
            void applyBestDefaultIfForeign(merged);
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    videoState.url,
    videoState.mode,
    videoState.tmdbId,
    videoState.rawSourceUrl,
    videoState.title,
    videoState.isLive,
    videoState.subtitles,
    videoState.activeTrackIndex,
    videoState.tracks,
    videoState.seriesMeta?.tmdbId,
    videoState.seriesMeta?.seriesTitle,
    videoState.seriesMeta?.season,
    videoState.seriesMeta?.episode,
  ]);

  const handleSelectSubtitleTrack = async (trackId: string) => {
    manualSelectionRef.current = true;
    setActiveSubId(trackId);
    if (trackId === 'off') {
      setParsedCues([]);
      return;
    }
    const found = subtitleTracks.find((s) => s.id === trackId);
    if (!found) return;
    if (found.rawContent) {
      setParsedCues(parseSubtitleText(found.rawContent));
      return;
    }
    if (found.url) {
      try {
        const res = await fetch(found.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const cues = parseSubtitleText(text);
        setParsedCues(cues);
        if (cues.length === 0) {
          showTransientToast(
            pickLang(lang, {
              es: 'Este subtítulo no contiene líneas válidas',
              ca: 'Aquest subtítol no conté línies vàlides',
              en: 'This subtitle track had no valid cues',
            })
          );
        }
      } catch {
        showTransientToast(
          pickLang(lang, {
            es: 'No se pudo cargar este subtítulo',
            ca: 'No s’ha pogut carregar aquest subtítol',
            en: 'Failed to load subtitle',
          })
        );
      }
    }
  };

  const handleUploadLocalSubtitle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const cues = parseSubtitleText(content);
      const customId = `local-${Date.now()}`;
      const newTrack: SubtitleTrackItem = {
        id: customId,
        label: file.name.slice(0, 26),
        lang: 'LOCAL',
        rawContent: content,
      };
      setSubtitleTracks((prev) => [newTrack, ...prev]);
      setActiveSubId(customId);
      setParsedCues(cues);
      showTransientToast(
        pickLang(lang, {
          es: `Subtítulos cargados (${cues.length} líneas)`,
          ca: `Subtítols carregats (${cues.length} línies)`,
          en: `Subtitles loaded (${cues.length} cues)`,
        })
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return {
    subtitleTracks,
    activeSubId,
    parsedCues,
    subtitleOffsetSec,
    setSubtitleOffsetSec,
    subtitleSize,
    setSubtitleSize,
    subtitleFileInputRef,
    handleSelectSubtitleTrack,
    handleUploadLocalSubtitle,
  };
}
