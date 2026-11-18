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
  const [subtitleSize, setSubtitleSize] = useState<'sm' | 'md' | 'lg'>('md');
  const subtitleFileInputRef = useRef<HTMLInputElement | null>(null);

  const onResetMenusRef = useRef(onResetMenus);
  onResetMenusRef.current = onResetMenus;

  useEffect(() => {
    setActiveSubId('off');
    setParsedCues([]);
    setSubtitleOffsetSec(0);
    onResetMenusRef.current();

    if (videoState.mode !== 'hls' && videoState.mode !== 'direct') {
      setSubtitleTracks([]);
      return;
    }

    const builtInSubs: SubtitleTrackItem[] = Array.isArray(videoState.subtitles)
      ? videoState.subtitles
      : [];

    let detectedTmdbId = videoState.seriesMeta?.tmdbId;
    if (!detectedTmdbId && videoState.rawSourceUrl) {
      const m = videoState.rawSourceUrl.match(/(?:watch|movie|-)\/?(\d{2,9})(?:$|\/)/i);
      if (m) detectedTmdbId = Number(m[1]);
    }
    if (!detectedTmdbId) {
      setSubtitleTracks(builtInSubs);
      return;
    }

    setSubtitleTracks(builtInSubs);
    let cancelled = false;
    const qs = new URLSearchParams({ tmdbId: String(detectedTmdbId) });
    if (videoState.seriesMeta?.season && videoState.seriesMeta?.episode) {
      qs.set('season', String(videoState.seriesMeta.season));
      qs.set('episode', String(videoState.seriesMeta.episode));
    }

    fetch(`/api/subtitles/search?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.tracks)) {
          const merged = [...builtInSubs];
          const seenIds = new Set(merged.map((s) => s.id));
          for (const tr of data.tracks as SubtitleTrackItem[]) {
            if (tr?.id && !seenIds.has(tr.id)) {
              seenIds.add(tr.id);
              merged.push(tr);
            }
          }
          setSubtitleTracks(merged);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    videoState.url,
    videoState.mode,
    videoState.rawSourceUrl,
    videoState.subtitles,
    videoState.seriesMeta?.tmdbId,
    videoState.seriesMeta?.season,
    videoState.seriesMeta?.episode,
  ]);

  const handleSelectSubtitleTrack = async (trackId: string) => {
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
        const text = await res.text();
        setParsedCues(parseSubtitleText(text));
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
