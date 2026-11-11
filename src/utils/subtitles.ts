export interface ParsedSubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

function parseTimestampToSec(raw: string): number {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return 0;
}

/**
 * Parses both SubRip (.srt) and WebVTT (.vtt) subtitle files into fast searchable cues.
 */
export function parseSubtitleText(rawText: string): ParsedSubtitleCue[] {
  if (!rawText) return [];
  const normalized = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const blocks = normalized.split(/\n{2,}/);
  const cues: ParsedSubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;

    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx === -1) continue;

    const timingLine = lines[timingIdx];
    const [startRaw, endWithSettings] = timingLine.split('-->');
    if (!startRaw || !endWithSettings) continue;

    const endRaw = endWithSettings.trim().split(/\s+/)[0];
    const startSec = parseTimestampToSec(startRaw);
    const endSec = parseTimestampToSec(endRaw);
    if (endSec <= startSec) continue;

    const textLines = lines
      .slice(timingIdx + 1)
      .map((line) =>
        line
          .replace(/<[^>]+>/g, '')
          .replace(/\{\\[^}]+\}/g, '')
          .trim()
      )
      .filter(Boolean);

    if (textLines.length > 0) {
      cues.push({
        startSec,
        endSec,
        text: textLines.join('\n'),
      });
    }
  }

  return cues;
}

export function findActiveSubtitleText(
  cues: ParsedSubtitleCue[],
  currentTimeSec: number,
  offsetSec: number
): string | null {
  if (!cues.length) return null;
  const adjustedTime = currentTimeSec - offsetSec;
  // Binary search for fast O(log n) lookup on 60fps timeupdate
  let low = 0;
  let high = cues.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const cue = cues[mid];
    if (adjustedTime < cue.startSec) {
      high = mid - 1;
    } else if (adjustedTime > cue.endSec) {
      low = mid + 1;
    } else {
      return cue.text;
    }
  }
  return null;
}
