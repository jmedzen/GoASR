import fs from 'fs';
import path from 'path';
import { getDb } from './db';

export interface UploadResult {
  name: string;
  uri: string;
  state: string;
}

export interface TranscriptionResponse {
  text: string;
  tokens: number;
  promptTokens: number;
  candidateTokens: number;
  raw?: any;
}

export interface ModelInfo {
  name: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
}

/**
 * Resumable upload of an audio file to Google Gemini Files API
 */
export async function uploadAudioToGemini(
  apiKey: string,
  filePath: string,
  mimeType: string = 'audio/mp3'
): Promise<UploadResult> {
  const fileStats = fs.statSync(filePath);
  const fileSize = fileStats.size;
  const safeDisplayName = path.basename(filePath).replace(/[^\x00-\x7F]/g, '_');

  // Step 1: Initiate resumable upload session
  const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
  const initRes = await fetch(initUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
      'X-Goog-Upload-Header-Content-Type': mimeType,
    },
    body: JSON.stringify({
      file: {
        displayName: safeDisplayName,
      },
    }),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Failed to initiate file upload (${initRes.status}): ${errText}`);
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Google Files API did not return x-goog-upload-url');
  }

  // Step 2: Upload binary data
  const fileBuffer = fs.readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': fileSize.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Failed to upload file content (${uploadRes.status}): ${errText}`);
  }

  const uploadJson = await uploadRes.json();
  const fileData = uploadJson.file;

  if (!fileData || !fileData.uri) {
    throw new Error('Upload response missing file URI: ' + JSON.stringify(uploadJson));
  }

  // Step 3: Check state; wait if PROCESSING
  let currentFile = fileData;
  while (currentFile.state === 'PROCESSING') {
    await new Promise((r) => setTimeout(r, 2000));
    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${currentFile.name}?key=${apiKey}`
    );
    if (checkRes.ok) {
      currentFile = await checkRes.json();
    }
  }

  if (currentFile.state === 'FAILED') {
    throw new Error(`File processing failed in Gemini Files API: ${currentFile.name}`);
  }

  return {
    name: currentFile.name,
    uri: currentFile.uri,
    state: currentFile.state,
  };
}

/**
 * Transcribe an audio file using Gemini generateContent
 */
export async function transcribeWithGemini(
  apiKey: string,
  modelName: string,
  fileUri: string,
  prompt: string,
  mimeType: string = 'audio/mp3'
): Promise<TranscriptionResponse> {
  // Strip "models/" prefix if user supplied it
  const cleanModelName = modelName.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`;

  const reqBody = {
    contents: [
      {
        parts: [
          {
            fileData: {
              mimeType: mimeType,
              fileUri: fileUri,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reqBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    const error: any = new Error(`Gemini generateContent error (${res.status}): ${errText}`);
    error.statusCode = res.status;
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    if (candidate && candidate.finishReason === 'STOP') {
      return {
        text: '',
        tokens: data.usageMetadata?.totalTokenCount || 0,
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        candidateTokens: 0,
        raw: data,
      };
    }
    throw new Error('Empty response or no candidate generated: ' + JSON.stringify(data));
  }

  let text = '';
  for (const part of candidate.content.parts) {
    // 1. Check for audio_transcription or audioTranscription specialized structure
    if (part.audio_transcription?.text) {
      text += part.audio_transcription.text + '\n';
    } else if (part.audioTranscription?.text) {
      text += part.audioTranscription.text + '\n';
    } else if (part.text) {
      text += part.text + '\n';
    }
  }

  const tokens = data.usageMetadata?.totalTokenCount || 0;
  const promptTokens = data.usageMetadata?.promptTokenCount || 0;
  const candidateTokens = data.usageMetadata?.candidatesTokenCount || 0;

  return {
    text: text.trim(),
    tokens,
    promptTokens,
    candidateTokens,
    raw: data,
  };
}

/**
 * Delete uploaded file from Gemini Files API
 */
export async function deleteGeminiFile(apiKey: string, fileName: string): Promise<void> {
  const cleanName = fileName.replace(/^files\//, 'files/');
  const url = `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${apiKey}`;
  try {
    await fetch(url, { method: 'DELETE' });
  } catch (e) {
    console.warn(`Failed to delete remote file ${fileName}:`, e);
  }
}

/**
 * List available models and filter audio-compatible ones
 */
export async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to list models (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const models = data.models || [];

  // Filter models that are relevant for ASR / multimodal audio
  const nonAudioPatterns = /embedding|veo|lyria|imagen|aqa|robotics|nano-banana/i;

  return models
    .filter((m: any) => {
      const name = m.name.toLowerCase();
      if (nonAudioPatterns.test(name)) return false;
      // Must support generateContent
      if (!m.supportedGenerationMethods?.includes('generateContent')) return false;
      return true;
    })
    .map((m: any) => ({
      name: m.name.replace(/^models\//, ''),
      displayName: m.displayName || m.name,
      description: m.description || '',
      inputTokenLimit: m.inputTokenLimit || 0,
      outputTokenLimit: m.outputTokenLimit || 0,
      supportedGenerationMethods: m.supportedGenerationMethods || [],
    }));
}

import { logger } from './logger';

export interface FailoverRetryInfo {
  retryCount: number;
  maxRetries: number;
  delaySeconds: number;
  previousKeyName: string;
  nextKeyName: string;
  error: any;
}

export interface FailoverOptions {
  preferredKeyId?: number;
  maxRetries?: number; // 預設 10 次
  delayStepSeconds?: number; // 預設 2 秒 (等差數列公差)
  taskId?: string;
  chunkIndex?: number;
  onRetry?: (info: FailoverRetryInfo) => void;
}

/**
 * Multi-Key Failover Pool Executor
 * 支援 API 呼叫失敗重試（預設 10 次）、金鑰輪替（Rotate API Keys）與等差加大退避等待（Arithmetic Progression Backoff）
 */
export async function executeWithFailover<T>(
  action: (apiKey: string, keyRecord: { id: number; name: string; key_val: string }) => Promise<T>,
  optionsOrPreferredKeyId?: number | FailoverOptions
): Promise<{ result: T; keyUsed: { id: number; name: string; key_val: string } }> {
  const options: FailoverOptions =
    typeof optionsOrPreferredKeyId === 'number'
      ? { preferredKeyId: optionsOrPreferredKeyId }
      : optionsOrPreferredKeyId || {};

  const maxRetries = options.maxRetries ?? 10;
  const delayStep = options.delayStepSeconds ?? 2;
  const preferredKeyId = options.preferredKeyId;

  const db = getDb();
  let keys = db
    .prepare('SELECT id, name, key_val FROM api_keys WHERE is_active = 1 ORDER BY last_used_at ASC, id ASC')
    .all() as { id: number; name: string; key_val: string }[];

  if (keys.length === 0) {
    logger.error('keys', '金鑰庫無可用金鑰', '未設定任何啟用的 Google API Key', undefined, options.taskId);
    throw new Error('未設定任何啟用的 Google API Key，請至「API Key 管理」新增或啟用 Key。');
  }

  // If preferredKeyId is provided and active, move it to the front
  if (preferredKeyId) {
    const foundIdx = keys.findIndex((k) => k.id === preferredKeyId);
    if (foundIdx > 0) {
      const [preferred] = keys.splice(foundIdx, 1);
      keys.unshift(preferred);
    }
  }

  let currentKeyIndex = 0;
  let retryCount = 0;
  let lastError: any = null;

  while (retryCount <= maxRetries) {
    const keyRecord = keys[currentKeyIndex];
    try {
      const result = await action(keyRecord.key_val, keyRecord);

      // 調用成功：更新金鑰調用統計與最後使用時間
      db.prepare(`
        UPDATE api_keys 
        SET total_calls = total_calls + 1, last_used_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(keyRecord.id);

      if (retryCount > 0) {
        logger.info(
          'gemini',
          'API 重試調用成功',
          `經歷第 ${retryCount} 次重試後，金鑰 [${keyRecord.name}] 成功完成請求`,
          { keyName: keyRecord.name, retryCount, maxRetries },
          options.taskId
        );
      } else {
        logger.info(
          'gemini',
          'API 呼叫成功',
          `金鑰 [${keyRecord.name}] 調用成功`,
          { keyName: keyRecord.name },
          options.taskId
        );
      }

      return { result, keyUsed: keyRecord };
    } catch (err: any) {
      lastError = err;
      retryCount++;

      if (retryCount > maxRetries) {
        break;
      }

      // 輪替切換至下一組金鑰（多把時循環輪替，單把時保持原金鑰）
      const nextKeyIndex = (currentKeyIndex + 1) % keys.length;
      const nextKeyRecord = keys[nextKeyIndex];

      // 等差加大延遲計算：delay = retryCount * delayStep (例如 2s, 4s, 6s, 8s, 10s... 20s)
      const delaySeconds = retryCount * delayStep;
      const delayMs = delaySeconds * 1000;

      const isRateLimit =
        err.status === 429 ||
        err.statusCode === 429 ||
        /resource_exhausted|rate limit|quota/i.test(err.message || '');

      logger.warn(
        'gemini',
        isRateLimit ? `配額超限 (429) 重試 [${retryCount}/${maxRetries}]` : `API 異常重試 [${retryCount}/${maxRetries}]`,
        `金鑰 [${keyRecord.name}] 請求失敗: ${err.message}。正在輪替至 [${nextKeyRecord.name}]，依等差退避等待 ${delaySeconds} 秒後重試...`,
        {
          failedKey: keyRecord.name,
          nextKey: nextKeyRecord.name,
          retryCount,
          maxRetries,
          delaySeconds,
          error: err.message,
          statusCode: err.status || err.statusCode,
        },
        options.taskId
      );

      // 觸發外部回調（供 taskRunner log 廣播到前端即時面板）
      if (options.onRetry) {
        options.onRetry({
          retryCount,
          maxRetries,
          delaySeconds,
          previousKeyName: keyRecord.name,
          nextKeyName: nextKeyRecord.name,
          error: err,
        });
      }

      // 等差等待
      await new Promise((r) => setTimeout(r, delayMs));

      // 推進到下一把金鑰
      currentKeyIndex = nextKeyIndex;
    }
  }

  // 10 次重試全數失敗
  logger.error(
    'gemini',
    `API 調用失敗已達上限 (${maxRetries}次重試)`,
    `經歷 ${maxRetries} 次重試與金鑰輪替，仍全數失敗: ${lastError?.message}`,
    {
      maxRetries,
      attemptedKeys: keys.map((k) => k.name),
      error: lastError?.message,
    },
    options.taskId
  );

  throw new Error(
    `API 呼叫失敗，已重試 ${maxRetries} 次並輪替金鑰，仍然無法完成: ${lastError?.message || '未知錯誤'}`
  );
}

/**
 * Update key token counts in database
 */
export function recordTokensForApiKey(keyId: number, tokens: number) {
  const db = getDb();
  db.prepare(`
    UPDATE api_keys 
    SET total_tokens = total_tokens + ?
    WHERE id = ?
  `).run(tokens, keyId);
}
