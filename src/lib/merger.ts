export interface ChunkMergeItem {
  chunkIndex: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

/**
 * Format seconds to HH:MM:SS
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm with safe integer millisecond rounding
 */
export function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalS = Math.floor(totalMs / 1000);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Parse time string (HH:MM:SS,mmm / MM:SS / etc.) into seconds
 */
export function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    return h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  } else if (parts.length === 1) {
    const s = parseFloat(parts[0]);
    return isNaN(s) ? null : s;
  }
  return null;
}

/**
 * Break plain text into comfortable, readable subtitle units (typically 12~28 characters)
 * avoiding excessively long clauses while preserving natural semantic pauses.
 */
export function splitIntoSubtitleUnits(text: string): string[] {
  // First split by paragraph / major sentence-ending punctuation
  const majorParts = text
    .split(/(?<=[。！？!?\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const units: string[] = [];

  for (const part of majorParts) {
    // If the sentence is already short and readable, keep it
    if (part.length <= 28) {
      units.push(part);
      continue;
    }

    // Secondary split by pause marks and commas
    const secondaryClauses = part
      .split(/(?<=[，、；：;:,—…])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let buffer = '';
    for (const clause of secondaryClauses) {
      if (!buffer) {
        buffer = clause;
      } else if (buffer.length + clause.length <= 26) {
        buffer += clause;
      } else {
        units.push(buffer);
        buffer = clause;
      }
    }

    if (buffer) {
      // If buffer has no punctuation and is still over 32 characters, hard-split cleanly
      if (buffer.length > 32) {
        let remaining = buffer;
        while (remaining.length > 32) {
          const sliceCandidate = remaining.slice(0, 26);
          const spaceIdx = sliceCandidate.lastIndexOf(' ');
          const cutIdx = spaceIdx > 12 ? spaceIdx + 1 : 24;
          units.push(remaining.slice(0, cutIdx).trim());
          remaining = remaining.slice(cutIdx).trim();
        }
        if (remaining) {
          units.push(remaining);
        }
      } else {
        units.push(buffer);
      }
    }
  }

  return units;
}

export interface TimestampedItem {
  start: number;
  end: number;
  text: string;
}

/**
 * Detect and parse inline timestamps in chunk text if model produced them
 */
export function extractExplicitTimestamps(
  text: string,
  chunkStart: number,
  chunkEnd: number
): TimestampedItem[] | null {
  let norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  // Strip markdown code fences if model wrapped output in ```srt ... ```
  norm = norm.replace(/^```(?:srt)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // 1. Try standard SRT block format
  const srtBlockRegex = /(?:^|\n)\s*(?:\d+\s*\n)?\s*(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})\s*\n+([\s\S]+?)(?=\n\s*(?:\d+\s*\n)?\s*\d{1,2}:\d{2}|\s*$)/g;
  let match;
  const srtEntries: TimestampedItem[] = [];
  while ((match = srtBlockRegex.exec(norm)) !== null) {
    const s = parseTimeToSeconds(match[1]);
    const e = parseTimeToSeconds(match[2]);
    const t = match[3].replace(/```/g, '').trim();
    if (s !== null && e !== null && t) {
      srtEntries.push({ start: s, end: e, text: t });
    }
  }
  if (srtEntries.length >= 2) {
    return adjustAndOffsetTimestamps(srtEntries, chunkStart, chunkEnd);
  }

  // 2. Global scan for range timestamps: [MM:SS - MM:SS] or (MM:SS --> MM:SS) anywhere in text (multiline or inline)
  const rangeRegex = /(?:\[|\()(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*(?:-|–|—|-->|至)\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)(?:\]|\))[:：]?/g;
  const rangeMatches: { startStr: string; endStr: string; index: number; length: number }[] = [];
  let rm;
  while ((rm = rangeRegex.exec(norm)) !== null) {
    rangeMatches.push({
      startStr: rm[1],
      endStr: rm[2],
      index: rm.index,
      length: rm[0].length,
    });
  }

  if (rangeMatches.length >= 2) {
    const items: TimestampedItem[] = [];
    for (let i = 0; i < rangeMatches.length; i++) {
      const cur = rangeMatches[i];
      const nextStart = i < rangeMatches.length - 1 ? rangeMatches[i + 1].index : norm.length;
      let piece = norm.slice(cur.index + cur.length, nextStart).trim();
      piece = piece.replace(/^[:：\s]+/, '').trim();
      const s = parseTimeToSeconds(cur.startStr);
      const e = parseTimeToSeconds(cur.endStr);
      if (s !== null && e !== null && piece.length > 0) {
        items.push({ start: s, end: Math.max(s + 0.5, e), text: piece });
      }
    }
    if (items.length >= 2) {
      return adjustAndOffsetTimestamps(items, chunkStart, chunkEnd);
    }
  }

  // 3. Global scan for single timestamps: [MM:SS] anywhere in text
  const singleRegex = /(?:\[|\()(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)(?:\]|\))[:：]?/g;
  const singleMatches: { startStr: string; index: number; length: number }[] = [];
  let sm;
  while ((sm = singleRegex.exec(norm)) !== null) {
    singleMatches.push({
      startStr: sm[1],
      index: sm.index,
      length: sm[0].length,
    });
  }

  if (singleMatches.length >= 2) {
    const items: TimestampedItem[] = [];
    for (let i = 0; i < singleMatches.length; i++) {
      const cur = singleMatches[i];
      const nextStart = i < singleMatches.length - 1 ? singleMatches[i + 1].index : norm.length;
      let piece = norm.slice(cur.index + cur.length, nextStart).trim();
      piece = piece.replace(/^[:：\s]+/, '').trim();
      const s = parseTimeToSeconds(cur.startStr);
      if (s !== null && piece.length > 0) {
        const nextMatch = i < singleMatches.length - 1 ? singleMatches[i + 1] : null;
        const nextS = nextMatch ? parseTimeToSeconds(nextMatch.startStr) : null;
        const e = nextS !== null && nextS > s ? nextS : s + 4;
        items.push({ start: s, end: Math.max(s + 0.5, e), text: piece });
      }
    }
    if (items.length >= 2) {
      return adjustAndOffsetTimestamps(items, chunkStart, chunkEnd);
    }
  }

  return null;
}

function adjustAndOffsetTimestamps(
  entries: TimestampedItem[],
  chunkStart: number,
  chunkEnd: number
): TimestampedItem[] {
  const maxEnd = Math.max(...entries.map((e) => e.end));
  const chunkDur = Math.max(0.1, chunkEnd - chunkStart);
  // If max timestamp is within chunk duration + 15s, it is chunk-relative!
  const isChunkRelative = maxEnd <= chunkDur + 15;
  const offset = isChunkRelative ? chunkStart : 0;

  return entries.map((e) => {
    const s = Math.max(chunkStart, Math.min(chunkEnd, e.start + offset));
    const candidateEnd = Math.max(chunkStart, Math.min(chunkEnd, e.end + offset));
    const end = Math.max(s + 0.5, candidateEnd);
    return {
      start: s,
      end,
      text: e.text,
    };
  });
}

/**
 * Smart merge multiple chunks with optional timestamp headers and boundary deduplication
 */
export function mergeChunkTexts(
  chunks: ChunkMergeItem[],
  includeTimestamps: boolean = true
): string {
  if (chunks.length === 0) return '';
  if (chunks.length === 1 && !includeTimestamps) return chunks[0].text.trim();

  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const mergedSections: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    let currentText = item.text.trim();

    // Check for boundary overlap deduplication with previous chunk
    if (i > 0) {
      const prevText = sorted[i - 1].text.trim();
      const prevEndSnippet = prevText.slice(-60); // last 60 chars of prev chunk
      const curStartSnippet = currentText.slice(0, 60);

      // Simple overlap check
      for (let len = 40; len >= 10; len--) {
        const needle = prevEndSnippet.slice(-len);
        if (curStartSnippet.startsWith(needle)) {
          currentText = currentText.slice(len).trim();
          break;
        }
      }
    }

    if (includeTimestamps) {
      const timeHeader = `【${formatTime(item.startSeconds)} - ${formatTime(item.endSeconds)}】(第 ${item.chunkIndex} 節)`;
      mergedSections.push(`${timeHeader}\n${currentText}`);
    } else {
      mergedSections.push(currentText);
    }
  }

  return mergedSections.join('\n\n');
}

/**
 * Generate standard .srt subtitle content from chunk texts with strictly normalized timestamps
 * and smart subtitle unit splitting to eliminate cumulative drift and clamping bugs.
 */
export function generateSrtContent(chunks: ChunkMergeItem[]): string {
  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const srtEntries: string[] = [];
  let srtIndex = 1;

  for (const chunk of sorted) {
    const cleanText = chunk.text.trim();
    if (!cleanText) continue;

    const startSec = (chunk as any).startSeconds ?? (chunk as any).start_seconds ?? 0;
    const endSec = (chunk as any).endSeconds ?? (chunk as any).end_seconds ?? startSec;
    const chunkDuration = Math.max(0.1, endSec - startSec);

    // 1. Try explicit timestamps from model
    const explicit = extractExplicitTimestamps(cleanText, startSec, endSec);
    if (explicit && explicit.length > 0) {
      for (const item of explicit) {
        if (item.end <= item.start) continue;
        srtEntries.push(
          `${srtIndex}\n${formatSrtTime(item.start)} --> ${formatSrtTime(item.end)}\n${item.text}`
        );
        srtIndex++;
      }
      continue;
    }

    // 2. Smart subtitle unit segmentation
    const units = splitIntoSubtitleUnits(cleanText);
    if (units.length === 0) continue;

    // 3. Strictly normalized weight calculation (mathematically guarantees sum === chunkDuration)
    const weights = units.map((u) => {
      let pauseWeight = 0;
      if (/[。！？!?]$/.test(u)) pauseWeight = 2.0;
      else if (/[，、；：;:,]$/.test(u)) pauseWeight = 1.0;
      // Base weight gives short phrases (e.g. "好。", "對。") appropriate breathing duration
      return 3.0 + u.length + pauseWeight;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let currentTime = chunk.startSeconds;

    for (let i = 0; i < units.length; i++) {
      const isLast = i === units.length - 1;
      const ratio = totalWeight > 0 ? weights[i] / totalWeight : 1 / units.length;
      const segmentDuration = chunkDuration * ratio;
      // Strictly pin the last segment to chunk.endSeconds to prevent floating-point epsilon divergence
      const sentenceEnd = isLast ? chunk.endSeconds : currentTime + segmentDuration;

      srtEntries.push(
        `${srtIndex}\n${formatSrtTime(currentTime)} --> ${formatSrtTime(sentenceEnd)}\n${units[i]}`
      );
      srtIndex++;

      currentTime = sentenceEnd;
    }
  }

  return srtEntries.join('\n\n');
}

/**
 * Shift all timestamps in an existing SRT content by offsetSeconds (e.g. +1.5s or -0.5s)
 */
export function shiftSrtTimestamps(srtContent: string, offsetSeconds: number): string {
  if (!srtContent || offsetSeconds === 0) return srtContent;

  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const chunks = normalized.split(/\n\s*\n/);
  const result: string[] = [];

  for (const chunk of chunks) {
    const lines = chunk.trim().split('\n');
    if (lines.length < 2) continue;

    let timeIndex = 0;
    if (/^\d+$/.test(lines[0].trim()) && lines.length >= 2) {
      timeIndex = 1;
    }

    const timeLine = lines[timeIndex] || '';
    const match = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );

    if (match) {
      const s = parseTimeToSeconds(match[1]);
      const e = parseTimeToSeconds(match[2]);
      if (s !== null && e !== null) {
        const dur = Math.max(0.5, e - s);
        const newStart = Math.max(0, s + offsetSeconds);
        const newEnd = Math.max(newStart + 0.2, newStart + dur);
        lines[timeIndex] = `${formatSrtTime(newStart)} --> ${formatSrtTime(newEnd)}`;
      }
    }

    result.push(lines.join('\n'));
  }

  return result.join('\n\n');
}
