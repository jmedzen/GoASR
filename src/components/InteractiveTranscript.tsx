'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Play, Clock, Sparkles, Save, Check, RotateCcw, Cpu, Calculator } from 'lucide-react';
import { splitIntoSubtitleUnits } from '@/lib/merger';

interface InteractiveTranscriptProps {
  content: string;
  rawText?: string;
  type: 'text' | 'srt';
  currentTime?: number;
  taskId?: string;
  duration?: number;
  onSeek: (seconds: number) => void;
  onContentUpdate?: (newContent: string) => void;
}

interface SrtBlock {
  id: number;
  startTimeStr: string;
  endTimeStr: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return 0;
}

function formatSecondsShort(seconds: number): string {
  const safeSec = Math.max(0, seconds);
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = Math.floor(safeSec % 60);
  const ms = Math.floor((safeSec % 1) * 10);
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalS = Math.floor(totalMs / 1000);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function blocksToSrt(blocks: SrtBlock[]): string {
  return blocks
    .map(
      (b, idx) =>
        `${idx + 1}\n${formatSrtTime(b.startSeconds)} --> ${formatSrtTime(b.endSeconds)}\n${b.text}`
    )
    .join('\n\n');
}

export function InteractiveTranscript({
  content,
  rawText,
  type,
  currentTime = 0,
  taskId,
  duration = 0,
  onSeek,
  onContentUpdate,
}: InteractiveTranscriptProps) {
  const [autoScroll, setAutoScroll] = useState(false);
  const [offsetSeconds, setOffsetSeconds] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const activeBlockRef = useRef<HTMLDivElement | null>(null);

  // Detect whether the model output text contains explicit timestamps [MM:SS - MM:SS] or canonical SRT
  const hasModelTimestamps = useMemo(() => {
    const textToCheck = rawText || content || '';
    const rangeRegex = /(?:\[|\()(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*(?:-|–|—|-->|至)\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)(?:\]|\))/;
    return /-->/.test(content || '') || rangeRegex.test(textToCheck);
  }, [rawText, content]);

  // Selected timestamp source: 'model' (模型輸出) or 'local' (本地推算)
  const [sourceMode, setSourceMode] = useState<'model' | 'local'>('model');

  // Sync default sourceMode based on timestamp availability
  useEffect(() => {
    if (hasModelTimestamps) {
      setSourceMode('model');
    } else {
      setSourceMode('local');
    }
  }, [hasModelTimestamps]);

  // Clear offset when content or sourceMode changes
  useEffect(() => {
    setOffsetSeconds(0);
    setSaveSuccessMsg('');
  }, [content, sourceMode]);

  // 1. Model Output SRT Blocks: parsed from canonical SRT (if it had model timestamps) or extracted from rawText
  const modelSrtBlocks = useMemo<SrtBlock[]>(() => {
    if (type !== 'srt') return [];

    // If canonical content in DB has standard SRT format
    if (content && /-->/.test(content)) {
      const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const rawChunks = normalized.split(/\n\s*\n/);
      const blocks: SrtBlock[] = [];

      for (const chunk of rawChunks) {
        const lines = chunk.trim().split('\n');
        if (lines.length >= 2) {
          let timeIndex = 0;
          let id = 0;
          if (/^\d+$/.test(lines[0].trim()) && lines.length >= 2) {
            id = parseInt(lines[0].trim(), 10);
            timeIndex = 1;
          }

          const timeLine = lines[timeIndex] || '';
          const match = timeLine.match(
            /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/
          );

          if (match) {
            const rawStart = parseTimeToSeconds(match[1]);
            const rawEnd = parseTimeToSeconds(match[2]);

            const startSeconds = Math.max(0, rawStart + offsetSeconds);
            const endSeconds = Math.max(startSeconds + 0.2, rawEnd + offsetSeconds);

            let text = lines.slice(timeIndex + 1).join('\n').trim();
            text = text.replace(/\[\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\s*(?:-|–|—|-->|至)\s*\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, '').trim();

            if (text.length > 0) {
              blocks.push({
                id: id || blocks.length + 1,
                startTimeStr: formatSecondsShort(startSeconds),
                endTimeStr: formatSecondsShort(endSeconds),
                startSeconds,
                endSeconds,
                text,
              });
            }
          }
        }
      }

      if (blocks.length > 0) {
        return blocks;
      }
    }

    // Fallback: extract directly from rawText or content range timestamps with chunk section offsets
    const textToCheck = rawText || content || '';
    const headerRegex = /【(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)】\s*[\(（]第\s*(\d+)\s*節[\)）]/g;
    const headerMatches: { startStr: string; endStr: string; index: number; length: number }[] = [];
    let hm;
    while ((hm = headerRegex.exec(textToCheck)) !== null) {
      headerMatches.push({
        startStr: hm[1],
        endStr: hm[2],
        index: hm.index,
        length: hm[0].length,
      });
    }

    interface TextSection {
      startSeconds: number;
      endSeconds: number;
      body: string;
    }

    const sections: TextSection[] = [];
    if (headerMatches.length > 0) {
      for (let i = 0; i < headerMatches.length; i++) {
        const cur = headerMatches[i];
        const nextStart = i < headerMatches.length - 1 ? headerMatches[i + 1].index : textToCheck.length;
        sections.push({
          startSeconds: parseTimeToSeconds(cur.startStr),
          endSeconds: parseTimeToSeconds(cur.endStr),
          body: textToCheck.slice(cur.index + cur.length, nextStart),
        });
      }
    } else {
      sections.push({
        startSeconds: 0,
        endSeconds: duration > 0 ? duration : 3600,
        body: textToCheck,
      });
    }

    const rangeRegex = /(?:\[|\()(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*(?:-|–|—|-->|至)\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)(?:\]|\))[:：]?/g;
    const blocksFromModel: SrtBlock[] = [];

    for (const sec of sections) {
      const secText = sec.body;
      const matches: { startStr: string; endStr: string; index: number; length: number }[] = [];
      let rm;
      while ((rm = rangeRegex.exec(secText)) !== null) {
        matches.push({
          startStr: rm[1],
          endStr: rm[2],
          index: rm.index,
          length: rm[0].length,
        });
      }

      if (matches.length === 0) continue;

      const maxRawEnd = Math.max(...matches.map((m) => parseTimeToSeconds(m.endStr)));
      const secDur = Math.max(0.1, sec.endSeconds - sec.startSeconds);
      const isSecRelative = sec.startSeconds > 0 && maxRawEnd <= secDur + 30;
      const sectionOffset = isSecRelative ? sec.startSeconds : 0;

      for (let i = 0; i < matches.length; i++) {
        const cur = matches[i];
        const nextStart = i < matches.length - 1 ? matches[i + 1].index : secText.length;
        let piece = secText.slice(cur.index + cur.length, nextStart).trim();
        piece = piece.replace(/^[:：\s]+/, '').trim();
        piece = piece.replace(/【\d{1,2}:\d{2}(?::\d{2})?\s*-\s*\d{1,2}:\d{2}(?::\d{2})?】\s*[\(（]第\s*\d+\s*節[\)）]/g, '').trim();
        piece = piece.replace(/\[\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\s*(?:-|–|—|-->|至)\s*\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, '').trim();

        const rawStart = parseTimeToSeconds(cur.startStr);
        const rawEnd = parseTimeToSeconds(cur.endStr);
        const startSeconds = Math.max(0, rawStart + sectionOffset + offsetSeconds);
        const endSeconds = Math.max(startSeconds + 0.5, rawEnd + sectionOffset + offsetSeconds);

        if (piece.length > 0) {
          blocksFromModel.push({
            id: blocksFromModel.length + 1,
            startTimeStr: formatSecondsShort(startSeconds),
            endTimeStr: formatSecondsShort(endSeconds),
            startSeconds,
            endSeconds,
            text: piece,
          });
        }
      }
    }

    return blocksFromModel;
  }, [content, rawText, type, offsetSeconds, duration]);

  // 2. Local Estimation SRT Blocks: strictly computed via sentence length & punctuation weight distribution
  const localSrtBlocks = useMemo<SrtBlock[]>(() => {
    if (type !== 'srt') return [];

    // If model never produced timestamps and content in DB is standard SRT, that content was computed via local estimation!
    if (!hasModelTimestamps && content && /-->/.test(content)) {
      const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const rawChunks = normalized.split(/\n\s*\n/);
      const blocks: SrtBlock[] = [];

      for (const chunk of rawChunks) {
        const lines = chunk.trim().split('\n');
        if (lines.length >= 2) {
          let timeIndex = 0;
          let id = 0;
          if (/^\d+$/.test(lines[0].trim()) && lines.length >= 2) {
            id = parseInt(lines[0].trim(), 10);
            timeIndex = 1;
          }

          const timeLine = lines[timeIndex] || '';
          const match = timeLine.match(
            /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/
          );

          if (match) {
            const rawStart = parseTimeToSeconds(match[1]);
            const rawEnd = parseTimeToSeconds(match[2]);

            const startSeconds = Math.max(0, rawStart + offsetSeconds);
            const endSeconds = Math.max(startSeconds + 0.2, rawEnd + offsetSeconds);

            const text = lines.slice(timeIndex + 1).join('\n').trim();
            if (text.length > 0) {
              blocks.push({
                id: id || blocks.length + 1,
                startTimeStr: formatSecondsShort(startSeconds),
                endTimeStr: formatSecondsShort(endSeconds),
                startSeconds,
                endSeconds,
                text,
              });
            }
          }
        }
      }

      if (blocks.length > 0) {
        return blocks;
      }
    }

    // Otherwise, compute local estimation by stripping bracket timestamps from rawText or content
    const textToProcess = rawText || content || '';
    if (!textToProcess) return [];

    const headerRegex = /【(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)】\s*[\(（]第\s*(\d+)\s*節[\)）]/g;
    const headerMatches: { startStr: string; endStr: string; index: number; length: number }[] = [];
    let hm;
    while ((hm = headerRegex.exec(textToProcess)) !== null) {
      headerMatches.push({
        startStr: hm[1],
        endStr: hm[2],
        index: hm.index,
        length: hm[0].length,
      });
    }

    interface Section {
      startSeconds: number;
      endSeconds: number;
      text: string;
    }

    const sections: Section[] = [];
    if (headerMatches.length > 0) {
      for (let i = 0; i < headerMatches.length; i++) {
        const cur = headerMatches[i];
        const nextStart = i < headerMatches.length - 1 ? headerMatches[i + 1].index : textToProcess.length;
        sections.push({
          startSeconds: parseTimeToSeconds(cur.startStr),
          endSeconds: parseTimeToSeconds(cur.endStr),
          text: textToProcess.slice(cur.index + cur.length, nextStart),
        });
      }
    } else {
      let maxEnd = duration;
      if (!maxEnd && modelSrtBlocks.length > 0) {
        maxEnd = modelSrtBlocks[modelSrtBlocks.length - 1].endSeconds;
      }
      sections.push({
        startSeconds: 0,
        endSeconds: maxEnd > 0 ? maxEnd : 3600,
        text: textToProcess,
      });
    }

    const blocks: SrtBlock[] = [];
    let blockId = 1;

    for (const sec of sections) {
      let clean = sec.text
        .replace(/【\d{1,2}:\d{2}(?::\d{2})?\s*-\s*\d{1,2}:\d{2}(?::\d{2})?】\s*[\(（]第\s*\d+\s*節[\)）]/g, '')
        .replace(/\[\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\s*(?:-|–|—|-->|至)\s*\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, '')
        .replace(/\(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\s*(?:-|–|—|-->|至)\s*\d{1,2}:\d{2}(?::\d{2})?\)\s*/g, '')
        .trim();

      clean = clean.replace(/^(?:以下是|這是一份|好的|為您整理|根據音檔)[\s\S]*?[:：\n]+/, '').trim();

      const units = splitIntoSubtitleUnits(clean);
      if (units.length === 0) continue;

      const secDur = Math.max(0.1, sec.endSeconds - sec.startSeconds);
      const weights = units.map((u) => {
        let pauseWeight = 0;
        if (/[。！？!?]$/.test(u)) pauseWeight = 2.0;
        else if (/[，、；：;:,]$/.test(u)) pauseWeight = 1.0;
        return 3.0 + u.length + pauseWeight;
      });

      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      let curTime = sec.startSeconds;

      for (let i = 0; i < units.length; i++) {
        const isLast = i === units.length - 1;
        const ratio = totalWeight > 0 ? weights[i] / totalWeight : 1 / units.length;
        const segDur = secDur * ratio;
        const sentenceEnd = isLast ? sec.endSeconds : curTime + segDur;

        const startSec = Math.max(0, curTime + offsetSeconds);
        const endSec = Math.max(startSec + 0.2, sentenceEnd + offsetSeconds);

        blocks.push({
          id: blockId++,
          startTimeStr: formatSecondsShort(startSec),
          endTimeStr: formatSecondsShort(endSec),
          startSeconds: startSec,
          endSeconds: endSec,
          text: units[i],
        });

        curTime = sentenceEnd;
      }
    }

    return blocks;
  }, [content, rawText, type, offsetSeconds, duration, hasModelTimestamps, modelSrtBlocks]);

  // Active SRT blocks according to current sourceMode
  const srtBlocks = useMemo<SrtBlock[]>(() => {
    if (sourceMode === 'model' && hasModelTimestamps && modelSrtBlocks.length > 0) {
      return modelSrtBlocks;
    }
    return localSrtBlocks.length > 0 ? localSrtBlocks : modelSrtBlocks;
  }, [sourceMode, hasModelTimestamps, modelSrtBlocks, localSrtBlocks]);

  // Whether both sources are available for user switching
  const canSwitchSource = hasModelTimestamps && modelSrtBlocks.length > 0 && localSrtBlocks.length > 0;

  // High-accuracy active block matching: exact start without premature offset
  const activeBlockId = useMemo<number | null>(() => {
    if (srtBlocks.length === 0) return null;
    for (let i = 0; i < srtBlocks.length; i++) {
      const b = srtBlocks[i];
      const nextB = srtBlocks[i + 1];

      // Exact start matching: highlight starts when audio reaches this block's start
      const effectiveStart = b.startSeconds;

      // Bridge natural pauses between sentences up to 0.4s to prevent flickering
      const effectiveEnd = nextB
        ? Math.min(nextB.startSeconds, b.endSeconds + 0.4)
        : b.endSeconds + 0.3;

      if (currentTime >= effectiveStart && currentTime < effectiveEnd) {
        return b.id;
      }
    }
    return null;
  }, [srtBlocks, currentTime]);

  // Parse Text content into sections if headers exist
  const textSections = useMemo(() => {
    if (type !== 'text' || !content) return [];
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const sections: Array<{
      header?: {
        raw: string;
        startTimeStr: string;
        endTimeStr: string;
        startSeconds: number;
        endSeconds: number;
        label: string;
      };
      paragraphs: string[];
    }> = [];

    let currentSection: {
      header?: any;
      paragraphs: string[];
    } = { paragraphs: [] };

    for (const line of lines) {
      const headerMatch = line.match(/^【(\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*】(.*)/);
      if (headerMatch) {
        if (currentSection.header || currentSection.paragraphs.length > 0) {
          sections.push(currentSection);
        }
        currentSection = {
          header: {
            raw: line,
            startTimeStr: headerMatch[1],
            endTimeStr: headerMatch[2],
            startSeconds: parseTimeToSeconds(headerMatch[1]),
            endSeconds: parseTimeToSeconds(headerMatch[2]),
            label: headerMatch[3]?.trim() || '',
          },
          paragraphs: [],
        };
      } else {
        if (line.trim().length > 0) {
          currentSection.paragraphs.push(line);
        }
      }
    }

    if (currentSection.header || currentSection.paragraphs.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  }, [content, type]);

  // Auto-scroll only when active block changes
  useEffect(() => {
    if (autoScroll && activeBlockRef.current) {
      activeBlockRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeBlockId, autoScroll]);

  // Handle saving the current active SRT content (with source & offset) to the task
  const handleSaveActiveSrt = async () => {
    if (!taskId || srtBlocks.length === 0) return;
    setIsSaving(true);
    setSaveSuccessMsg('');
    try {
      const srtStr = blocksToSrt(srtBlocks);
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srtContent: srtStr }),
      });
      const data = await res.json();
      if (data.success) {
        const modeLabel = sourceMode === 'model' ? '模型輸出' : '本地推算';
        setSaveSuccessMsg(`✓ 已成功將【${modeLabel}】設為主要 SRT！`);
        setOffsetSeconds(0);
        if (onContentUpdate) {
          onContentUpdate(srtStr);
        }
      } else {
        alert(data.error || '儲存失敗');
      }
    } catch (e: any) {
      alert(`錯誤: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Render SRT mode
  if (type === 'srt') {
    return (
      <div className="space-y-3">
        {/* Timestamp Source Indicator & Mode Switcher Bar */}
        <div
          className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-sm transition-all"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {/* Timestamp Source Selector / Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[11px] flex items-center gap-1" style={{ color: 'var(--text-main)' }}>
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              <span>時間戳來源:</span>
            </span>

            {canSwitchSource ? (
              <div
                className="inline-flex rounded-lg p-0.5 border gap-0.5"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
              >
                <button
                  type="button"
                  onClick={() => setSourceMode('model')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    sourceMode === 'model' ? 'shadow-sm font-bold' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: sourceMode === 'model' ? 'var(--primary)' : 'transparent',
                    color: sourceMode === 'model' ? 'var(--primary-fg)' : 'var(--text-main)',
                  }}
                  title="由 Gemini 模型原生輸出之時間戳（精確語音對齊）"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>模型輸出</span>
                  <span className="text-[10px] opacity-80 font-mono">({modelSrtBlocks.length} 句)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceMode('local')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    sourceMode === 'local' ? 'shadow-sm font-bold' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: sourceMode === 'local' ? 'var(--primary)' : 'transparent',
                    color: sourceMode === 'local' ? 'var(--primary-fg)' : 'var(--text-main)',
                  }}
                  title="依標點符號與字數長度本地平滑推算之時間戳（排版均勻）"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  <span>本地推算</span>
                  <span className="text-[10px] opacity-80 font-mono">({localSrtBlocks.length} 句)</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span
                  className="px-2.5 py-0.5 rounded-md border text-[11px] font-semibold flex items-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--primary)',
                  }}
                >
                  {hasModelTimestamps ? (
                    <>
                      <Cpu className="w-3.5 h-3.5" />
                      <span>模型輸出 ({modelSrtBlocks.length} 句)</span>
                    </>
                  ) : (
                    <>
                      <Calculator className="w-3.5 h-3.5" />
                      <span>本地推算 ({localSrtBlocks.length} 句)</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] opacity-60" style={{ color: 'var(--text-muted)' }}>
                  {hasModelTimestamps
                    ? '（模型原生時間戳）'
                    : '（模型原文未輸出時間戳，由本地演算法推算）'}
                </span>
              </div>
            )}
          </div>

          {/* Right side: Auto scroll & Save version */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                autoScroll ? 'font-bold' : 'opacity-70'
              }`}
              style={{
                backgroundColor: autoScroll ? 'var(--primary)' : 'var(--bg-card)',
                color: autoScroll ? 'var(--primary-fg)' : 'var(--text-main)',
                borderColor: 'var(--border)',
              }}
            >
              {autoScroll ? '✓ 播放自動跟隨中' : '開啟自動跟隨'}
            </button>

            {taskId && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveActiveSrt}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer disabled:opacity-50 hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-fg)',
                }}
                title="將當前顯示的 SRT 版本儲存至任務"
              >
                <Save className="w-3 h-3" />
                <span>{isSaving ? '儲存中...' : '儲存此版本'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Real-time Subtitle Offset Bar */}
        <div
          className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-sm transition-all"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 font-bold" style={{ color: 'var(--text-main)' }}>
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
              <span>時間軸微調:</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {[-1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0, 3.0].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setOffsetSeconds(val)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer ${
                    offsetSeconds === val ? 'shadow-sm ring-1' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: offsetSeconds === val ? 'var(--primary)' : 'var(--bg-input)',
                    color: offsetSeconds === val ? 'var(--primary-fg)' : 'var(--text-main)',
                    borderColor: offsetSeconds === val ? 'var(--primary)' : 'var(--border)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                  }}
                  title={val > 0 ? `延後 ${val} 秒出現` : val < 0 ? `提早 ${Math.abs(val)} 秒出現` : '原版'}
                >
                  {val > 0 ? `+${val}s` : val < 0 ? `${val}s` : '原版'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {offsetSeconds !== 0 && (
              <span className="text-[11px] font-medium" style={{ color: 'var(--primary)' }}>
                {offsetSeconds > 0 ? `字幕延遲 +${offsetSeconds}s 試聽中` : `字幕提早 ${offsetSeconds}s 試聽中`}
              </span>
            )}

            {saveSuccessMsg && (
              <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-1">
                <Check className="w-3 h-3" />
                {saveSuccessMsg}
              </span>
            )}
          </div>
        </div>

        {/* SRT Subtitle List */}
        <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
          {srtBlocks.length === 0 ? (
            <div className="whitespace-pre-wrap font-mono text-xs">{content}</div>
          ) : (
            srtBlocks.map((block) => {
              const isActive = block.id === activeBlockId;
              const handleBlockSeek = () => {
                onSeek(block.startSeconds);
              };

              return (
                <div
                  key={block.id}
                  ref={isActive ? activeBlockRef : null}
                  onClick={handleBlockSeek}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all duration-200 group ${
                    isActive ? 'shadow-sm ring-1' : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: isActive ? 'var(--badge-bg)' : 'var(--bg-input)',
                    borderColor: isActive ? 'var(--primary)' : 'var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold opacity-50 text-[10px]">
                        #{block.id}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBlockSeek();
                        }}
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold flex items-center gap-1 transition-all group-hover:scale-105"
                        style={{
                          backgroundColor: isActive ? 'var(--primary)' : 'var(--bg-card)',
                          color: isActive ? 'var(--primary-fg)' : 'var(--primary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>
                          {block.startTimeStr} → {block.endTimeStr}
                        </span>
                      </button>
                    </div>

                    {isActive && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse"
                        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-fg)' }}
                      >
                        ● 正在播放
                      </span>
                    )}
                  </div>

                  <p
                    className="leading-relaxed font-sans text-sm pl-1"
                    style={{
                      color: isActive ? 'var(--text-main)' : 'var(--text-main)',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {block.text}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Render TXT mode
  return (
    <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
      <div className="flex items-center justify-between text-xs pb-1" style={{ color: 'var(--text-muted)' }}>
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
          <span>逐字稿全文：點擊任意段落時間戳標籤即可跳轉試聽</span>
        </div>
      </div>

      {textSections.length === 0 ? (
        <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{content}</div>
      ) : (
        textSections.map((sec, idx) => {
          const isActive =
            sec.header &&
            currentTime >= sec.header.startSeconds &&
            currentTime < sec.header.endSeconds;

          return (
            <div
              key={idx}
              className={`rounded-xl border p-4 space-y-3 transition-all ${
                isActive ? 'shadow-sm ring-1' : ''
              }`}
              style={{
                backgroundColor: isActive ? 'var(--badge-bg)' : 'var(--bg-card)',
                borderColor: isActive ? 'var(--primary)' : 'var(--border)',
              }}
            >
              {sec.header ? (
                <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-2.5" style={{ borderColor: 'var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => onSeek(sec.header!.startSeconds)}
                    className="px-2.5 py-1 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
                    style={{
                      backgroundColor: 'var(--primary)',
                      color: 'var(--primary-fg)',
                      borderColor: 'var(--primary)',
                    }}
                    title="點擊從此段開頭播放"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>
                      【{sec.header.startTimeStr} - {sec.header.endTimeStr}】
                    </span>
                    {sec.header.label && <span className="font-sans font-normal opacity-90">{sec.header.label}</span>}
                  </button>

                  {isActive ? (
                    <span
                      className="text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse"
                      style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-fg)' }}
                    >
                      ● 當前播放段落
                    </span>
                  ) : (
                    <span className="text-[11px] opacity-60 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Clock className="w-3 h-3" /> 點擊快速試聽
                    </span>
                  )}
                </div>
              ) : null}

              <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-main)' }}>
                {sec.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="whitespace-pre-wrap">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
