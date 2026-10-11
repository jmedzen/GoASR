import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface SilencePoint {
  start: number;
  end: number;
  duration: number;
}

export interface ChunkInfo {
  chunkIndex: number;
  start: number;
  end: number;
  filePath: string;
  duration: number;
}

/**
 * Get accurate audio duration in seconds using ffprobe
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    let output = '';
    let errorOutput = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe failed with exit code ${code}: ${errorOutput}`));
      }
      const dur = parseFloat(output.trim());
      if (isNaN(dur)) {
        return reject(new Error(`Failed to parse duration: ${output}`));
      }
      resolve(dur);
    });

    ffprobe.on('error', (err) => reject(err));
  });
}

/**
 * Detect silence intervals using ffmpeg silencedetect filter
 */
export async function detectSilenceIntervals(
  filePath: string,
  minDurationSec: number = 0.5,
  noiseDb: number = -30
): Promise<SilencePoint[]> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', filePath,
      '-vn',
      '-map', '0:a:0',
      '-af', `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
      '-f', 'null',
      '-',
    ]);

    let stderrData = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    ffmpeg.on('close', (code) => {
      // ffmpeg with -f null outputs to stderr and closes with 0
      if (code !== 0 && code !== null) {
        // sometimes non-zero if warning, but check if we got silence points
      }

      const silences: SilencePoint[] = [];
      const lines = stderrData.split('\n');
      let currentStart: number | null = null;

      for (const line of lines) {
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        if (startMatch) {
          currentStart = parseFloat(startMatch[1]);
        }

        const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
        if (endMatch) {
          const end = parseFloat(endMatch[1]);
          const duration = parseFloat(endMatch[2]);
          const start = currentStart !== null ? currentStart : Math.max(0, end - duration);
          silences.push({ start, end, duration });
          currentStart = null;
        }
      }

      resolve(silences);
    });

    ffmpeg.on('error', (err) => reject(err));
  });
}

/**
 * Calculate smart cut points based on silence intervals and maximum chunk duration
 * Default to 240 seconds (4 minutes) for zero-drift LLM audio attention and precise timestamps.
 */
export function calculateSplitRanges(
  totalDuration: number,
  silences: SilencePoint[],
  maxChunkSec: number = 240
): Array<{ start: number; end: number }> {
  if (totalDuration <= maxChunkSec) {
    return [{ start: 0, end: totalDuration }];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  let currentStart = 0;

  while (currentStart < totalDuration) {
    const remaining = totalDuration - currentStart;
    if (remaining <= maxChunkSec) {
      ranges.push({ start: currentStart, end: totalDuration });
      break;
    }

    // Target split point is chunk start + maxChunkSec (e.g. +240s)
    const target = currentStart + maxChunkSec;
    // Search window for silence: 60s before target up to 45s after target
    const windowStart = Math.max(currentStart + 60, target - 60);
    const windowEnd = Math.min(totalDuration, target + 45);

    const candidates = silences.filter(
      (s) => s.end >= windowStart && s.start <= windowEnd
    );

    let cutPoint = target;
    if (candidates.length > 0) {
      // Find candidate closest to target
      candidates.sort((a, b) => {
        const midA = (a.start + a.end) / 2;
        const midB = (b.start + b.end) / 2;
        return Math.abs(midA - target) - Math.abs(midB - target);
      });
      const best = candidates[0];
      cutPoint = (best.start + best.end) / 2;
    }

    ranges.push({ start: currentStart, end: cutPoint });
    currentStart = cutPoint;
  }

  return ranges;
}

/**
 * Split audio file into chunks using ffmpeg
 */
export async function splitAudio(
  inputPath: string,
  outputDir: string,
  ranges: Array<{ start: number; end: number }>
): Promise<ChunkInfo[]> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const chunks: ChunkInfo[] = [];

  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i];
    const duration = end - start;
    const chunkFileName = `chunk_${String(i + 1).padStart(3, '0')}.mp3`;
    const chunkFilePath = path.join(outputDir, chunkFileName);

    await new Promise<void>((resolve, reject) => {
      // Use re-encode to ensure pristine MP3 frames and timestamps
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-ss', start.toFixed(2),
        '-to', end.toFixed(2),
        '-i', inputPath,
        '-vn',
        '-map', '0:a:0',
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        chunkFilePath,
      ]);

      let errorOutput = '';
      ffmpeg.stderr.on('data', (d) => {
        errorOutput += d.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Failed to split chunk ${i + 1} (code ${code}): ${errorOutput}`));
        }
        resolve();
      });

      ffmpeg.on('error', (err) => reject(err));
    });

    chunks.push({
      chunkIndex: i + 1,
      start,
      end,
      filePath: chunkFilePath,
      duration,
    });
  }

  return chunks;
}
