import path from 'path';
import fs from 'fs';
import { getDb } from './db';
import { logger } from './logger';

/**
 * Remove all on-disk artifacts associated with a specific task
 */
export function cleanTaskArtifacts(taskId: string, originalFilePath?: string | null) {
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
  const chunksDir = path.join(process.cwd(), 'data', 'chunks', taskId);

  // 1. Delete chunks folder if exists
  if (fs.existsSync(chunksDir)) {
    try {
      fs.rmSync(chunksDir, { recursive: true, force: true });
      console.log(`[Cleanup] Deleted chunks folder for task ${taskId}: ${chunksDir}`);
    } catch (e) {
      console.warn(`[Cleanup] Failed to delete chunks folder for task ${taskId}:`, e);
    }
  }

  // 2. Delete uploaded audio file if it is stored in data/uploads
  if (originalFilePath && typeof originalFilePath === 'string') {
    const normalizedOriginal = path.resolve(originalFilePath);
    const normalizedUploads = path.resolve(uploadsDir);

    // Only delete files located inside data/uploads to avoid touching user's external disk files
    if (normalizedOriginal.startsWith(normalizedUploads) && fs.existsSync(normalizedOriginal)) {
      try {
        fs.rmSync(normalizedOriginal, { force: true });
        console.log(`[Cleanup] Deleted uploaded audio file for task ${taskId}: ${normalizedOriginal}`);
      } catch (e) {
        console.warn(`[Cleanup] Failed to delete uploaded file for task ${taskId}:`, e);
      }
    }
  }

  // 3. Also check for any file in uploads starting with taskId_
  if (fs.existsSync(uploadsDir)) {
    try {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        if (file.startsWith(`${taskId}_`)) {
          const fullPath = path.join(uploadsDir, file);
          fs.rmSync(fullPath, { force: true });
          console.log(`[Cleanup] Deleted upload matching prefix: ${fullPath}`);
        }
      }
    } catch (e) {}
  }
}

/**
 * Scan data/uploads and data/chunks to eliminate any orphan files that do not belong to any active task
 */
export function cleanOrphanFiles(): { deletedUploads: number; deletedChunks: number } {
  const db = getDb();
  const rows = db.prepare('SELECT id, original_file_path FROM transcription_tasks').all() as {
    id: string;
    original_file_path: string | null;
  }[];

  const knownTaskIds = new Set(rows.map((r) => r.id));
  const knownFilePaths = new Set(
    rows
      .map((r) => (r.original_file_path ? path.resolve(r.original_file_path) : ''))
      .filter(Boolean)
  );

  let deletedUploads = 0;
  let deletedChunks = 0;

  // 1. Clean orphan files in data/uploads
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    for (const f of files) {
      const fullPath = path.join(uploadsDir, f);
      const isKnown = knownFilePaths.has(path.resolve(fullPath));
      const matchesTaskId = Array.from(knownTaskIds).some((id) => f.startsWith(`${id}_`));

      if (!isKnown && !matchesTaskId) {
        try {
          fs.rmSync(fullPath, { force: true });
          deletedUploads++;
          console.log(`[Cleanup] Removed orphan uploaded file: ${fullPath}`);
        } catch (e) {}
      }
    }
  }

  // 2. Clean orphan folders in data/chunks
  const chunksDir = path.join(process.cwd(), 'data', 'chunks');
  if (fs.existsSync(chunksDir)) {
    const folders = fs.readdirSync(chunksDir);
    for (const folder of folders) {
      if (!knownTaskIds.has(folder)) {
        const fullPath = path.join(chunksDir, folder);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          deletedChunks++;
          console.log(`[Cleanup] Removed orphan chunks folder: ${fullPath}`);
        } catch (e) {}
      }
    }
  }

  logger.info(
    'cleanup',
    '孤兒檔案深度清理',
    `清理完成：刪除 ${deletedUploads} 個孤兒上傳檔，清理 ${deletedChunks} 個孤兒分段資料夾`,
    { deletedUploads, deletedChunks }
  );

  return { deletedUploads, deletedChunks };
}
