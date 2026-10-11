import path from 'path';
import fs from 'fs';
import { getDb } from './db';
import { getAudioDuration, detectSilenceIntervals, calculateSplitRanges, splitAudio, ChunkInfo } from './audio';
import {
  uploadAudioToGemini,
  transcribeWithGemini,
  deleteGeminiFile,
  executeWithFailover,
  recordTokensForApiKey,
} from './gemini';
import { mergeChunkTexts, generateSrtContent, ChunkMergeItem } from './merger';
import { broadcastTaskEvent } from './taskEvents';
import { logger } from './logger';

/**
 * Execute a transcription task from start to finish
 */
export async function runTask(taskId: string): Promise<void> {
  const db = getDb();
  const task = db.prepare('SELECT * FROM transcription_tasks WHERE id = ?').get(taskId) as any;
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const log = (msg: string) => {
    broadcastTaskEvent({ taskId, type: 'log', message: msg });
  };

  const updateProgress = (completed: number, total: number, percent: number) => {
    broadcastTaskEvent({
      taskId,
      type: 'progress',
      completedChunks: completed,
      totalChunks: total,
      progressPercent: percent,
    });
  };

  const chunksDir = path.join(process.cwd(), 'data', 'chunks', taskId);

  try {
    log(`開始處理任務 [${task.file_name}]...`);
    db.prepare("UPDATE transcription_tasks SET status = 'splitting' WHERE id = ?").run(taskId);

    // Retrieve settings
    const getSetting = (k: string, defaultVal: string) => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as any;
      return row ? row.value : defaultVal;
    };

    const silenceDur = parseFloat(getSetting('silence_duration', '2.0'));
    const silenceDb = parseFloat(getSetting('silence_noise_db', '-30'));
    const chunkMaxMin = parseFloat(getSetting('chunk_max_minutes', '25'));
    const maxConcurrency = parseInt(getSetting('max_concurrency', '3'), 10);
    const keepTimestamps = getSetting('keep_timestamps', 'true') === 'true';
    const apiMaxRetries = parseInt(getSetting('api_max_retries', '10'), 10);
    const apiRetryDelayStep = parseFloat(getSetting('api_retry_delay_step', '2.0'));

    const maxChunkSec = chunkMaxMin * 60;
    const audioFilePath = task.original_file_path;

    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`原始音檔不存在: ${audioFilePath}`);
    }

    log(`分析音訊時長中...`);
    const duration = await getAudioDuration(audioFilePath);
    const minutes = (duration / 60).toFixed(1);
    log(`音檔總時長: ${duration.toFixed(1)} 秒 (${minutes} 分鐘)`);
    logger.info('transcribe', '任務啟動', `開始處理檔案 [${task.file_name}]，時長 ${minutes} 分鐘`, { durationSeconds: duration }, taskId);

    db.prepare('UPDATE transcription_tasks SET duration_seconds = ? WHERE id = ?').run(duration, taskId);

    let chunks: ChunkInfo[] = [];

    if (duration > maxChunkSec) {
      log(`音檔超過單段上限 (${chunkMaxMin} 分鐘)，正在偵測靜音斷句點 (閾值: ${silenceDur}s, ${silenceDb}dB)...`);
      const silences = await detectSilenceIntervals(audioFilePath, silenceDur, silenceDb);
      log(`偵測到 ${silences.length} 個靜音區間，計算最佳切割點...`);

      const ranges = calculateSplitRanges(duration, silences, maxChunkSec);
      log(`計劃切割為 ${ranges.length} 個段落，正在使用 ffmpeg 分割音訊...`);

      chunks = await splitAudio(audioFilePath, chunksDir, ranges);
      log(`音訊分割完成！共生成 ${chunks.length} 個片段。`);
    } else {
      log(`音檔時長小於分割閾值 (${chunkMaxMin} 分鐘)，無需切割，直接轉錄。`);
      if (!fs.existsSync(chunksDir)) {
        fs.mkdirSync(chunksDir, { recursive: true });
      }
      chunks = [
        {
          chunkIndex: 1,
          start: 0,
          end: duration,
          filePath: audioFilePath,
          duration,
        },
      ];
    }

    // Insert chunks into database
    const insertChunkStmt = db.prepare(`
      INSERT INTO task_chunks (task_id, chunk_index, start_seconds, end_seconds, chunk_file_path, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    for (const c of chunks) {
      insertChunkStmt.run(taskId, c.chunkIndex, c.start, c.end, c.filePath);
    }

    db.prepare(`
      UPDATE transcription_tasks 
      SET total_chunks = ?, status = 'transcribing'
      WHERE id = ?
    `).run(chunks.length, taskId);

    updateProgress(0, chunks.length, 10);
    log(`進入並行轉錄階段 (並行上限: ${maxConcurrency})...`);

    // Concurrency queue
    let completedCount = 0;
    const mergeItems: ChunkMergeItem[] = [];
    let totalTokensAccum = 0;

    // Helper to process a single chunk
    const processChunk = async (chunk: ChunkInfo) => {
      const chunkPrefix = `[段落 ${chunk.chunkIndex}/${chunks.length}]`;
      log(`${chunkPrefix} 開始處理 (${(chunk.duration / 60).toFixed(1)} 分鐘)...`);

      db.prepare(`
        UPDATE task_chunks 
        SET status = 'uploading'
        WHERE task_id = ? AND chunk_index = ?
      `).run(taskId, chunk.chunkIndex);

      broadcastTaskEvent({
        taskId,
        type: 'chunk_update',
        chunk: { index: chunk.chunkIndex, status: 'uploading' },
      });

      // Execute upload & transcription with multi-key failover
      const promptToUse = task.prompt || getSetting('default_prompt', '請將音檔轉錄為繁體中文逐字稿。');

      const { result, keyUsed } = await executeWithFailover(
        async (apiKey, keyRec) => {
          log(`${chunkPrefix} 使用 API Key [${keyRec.name}] 上傳中...`);
          const uploadRes = await uploadAudioToGemini(apiKey, chunk.filePath);

          try {
            log(`${chunkPrefix} 上傳成功，請求模型 ${task.model_name} 轉錄...`);
            db.prepare(`
              UPDATE task_chunks 
              SET status = 'transcribing', api_key_used = ?
              WHERE task_id = ? AND chunk_index = ?
            `).run(keyRec.name, taskId, chunk.chunkIndex);

            broadcastTaskEvent({
              taskId,
              type: 'chunk_update',
              chunk: { index: chunk.chunkIndex, status: 'transcribing' },
            });

            const transRes = await transcribeWithGemini(
              apiKey,
              task.model_name,
              uploadRes.uri,
              promptToUse
            );

            return { uploadRes, transRes };
          } finally {
            // Clean up remote file
            await deleteGeminiFile(apiKey, uploadRes.name).catch(() => {});
          }
        },
        {
          preferredKeyId: task.api_key_id,
          maxRetries: apiMaxRetries,
          delayStepSeconds: apiRetryDelayStep,
          taskId,
          chunkIndex: chunk.chunkIndex,
          onRetry: (info) => {
            log(
              `${chunkPrefix} ⚠️ API 呼叫失敗 (${info.error.message || '請求異常'})，正在進行第 ${info.retryCount}/${info.maxRetries} 次重試，已輪替至金鑰 [${info.nextKeyName}]，等差延遲等待 ${info.delaySeconds} 秒...`
            );
          },
        }
      );

      const tokens = result.transRes.tokens;
      totalTokensAccum += tokens;
      recordTokensForApiKey(keyUsed.id, tokens);

      db.prepare(`
        UPDATE task_chunks 
        SET status = 'completed', text_result = ?, tokens = ?, api_key_used = ?
        WHERE task_id = ? AND chunk_index = ?
      `).run(result.transRes.text, tokens, keyUsed.name, taskId, chunk.chunkIndex);

      mergeItems.push({
        chunkIndex: chunk.chunkIndex,
        startSeconds: chunk.start,
        endSeconds: chunk.end,
        text: result.transRes.text,
      });

      completedCount++;
      const currentPercent = 10 + Math.round((completedCount / chunks.length) * 80);

      db.prepare(`
        UPDATE transcription_tasks 
        SET completed_chunks = ?, token_usage = ?
        WHERE id = ?
      `).run(completedCount, totalTokensAccum, taskId);

      log(`${chunkPrefix} ✅ 轉錄完成！獲得 ${result.transRes.text.length} 字元，消耗 ${tokens} Tokens。`);
      updateProgress(completedCount, chunks.length, currentPercent);

      broadcastTaskEvent({
        taskId,
        type: 'chunk_update',
        chunk: {
          index: chunk.chunkIndex,
          status: 'completed',
          tokens,
          text: result.transRes.text.slice(0, 80) + '...',
        },
      });
    };

    // Parallel pool execution
    const executing: Promise<void>[] = [];
    for (const chunk of chunks) {
      const p = processChunk(chunk).catch((err) => {
        log(`[段落 ${chunk.chunkIndex}] ❌ 錯誤: ${err.message}`);
        db.prepare(`
          UPDATE task_chunks 
          SET status = 'failed', error_message = ?
          WHERE task_id = ? AND chunk_index = ?
        `).run(err.message, taskId, chunk.chunkIndex);
        throw err;
      });

      executing.push(p);

      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        // Remove settled promises
        for (let i = executing.length - 1; i >= 0; i--) {
          const status = await Promise.race([executing[i].then(() => 'resolved', () => 'rejected'), Promise.resolve('pending')]);
          if (status !== 'pending') {
            executing.splice(i, 1);
          }
        }
      }
    }

    await Promise.all(executing);

    // Merge stage
    log(`所有段落轉錄完成，開始智慧合併與生成 SRT 字幕...`);
    db.prepare("UPDATE transcription_tasks SET status = 'merging' WHERE id = ?").run(taskId);
    updateProgress(chunks.length, chunks.length, 95);

    const fullText = mergeChunkTexts(mergeItems, keepTimestamps);
    const srtContent = generateSrtContent(mergeItems);

    db.prepare(`
      UPDATE transcription_tasks 
      SET status = 'completed', full_text = ?, srt_content = ?, completed_at = datetime('now', 'localtime'), token_usage = ?
      WHERE id = ?
    `).run(fullText, srtContent, totalTokensAccum, taskId);

    log(`🎉 任務圓滿完成！總字數: ${fullText.length}，總消耗 Tokens: ${totalTokensAccum}`);
    logger.success('transcribe', '任務轉錄完成', `[${task.file_name}] 轉錄合併完成，總字數: ${fullText.length}，總 Token: ${totalTokensAccum}`, { fullTextLength: fullText.length, totalTokens: totalTokensAccum }, taskId);
    updateProgress(chunks.length, chunks.length, 100);

    broadcastTaskEvent({
      taskId,
      type: 'completed',
      result: {
        fullText,
        srtContent,
        tokens: totalTokensAccum,
      },
    });

    // Cleanup local split chunks to save disk space
    if (fs.existsSync(chunksDir)) {
      try {
        fs.rmSync(chunksDir, { recursive: true, force: true });
      } catch (e) {}
    }
  } catch (err: any) {
    console.error(`Task ${taskId} failed:`, err);
    log(`❌ 任務發生嚴重錯誤: ${err.message}`);
    logger.error('transcribe', '任務執行失敗', `[${task.file_name}] 失敗: ${err.message}`, { error: err.message }, taskId);
    db.prepare(`
      UPDATE transcription_tasks 
      SET status = 'failed', error_message = ?
      WHERE id = ?
    `).run(err.message, taskId);

    broadcastTaskEvent({
      taskId,
      type: 'failed',
      message: err.message,
    });

    // Cleanup local split chunks on failure too
    if (fs.existsSync(chunksDir)) {
      try {
        fs.rmSync(chunksDir, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}
