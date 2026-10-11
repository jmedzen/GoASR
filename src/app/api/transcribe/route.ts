import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { queueManager } from '@/lib/queueManager';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    const db = getDb();

    // Retrieve default model and prompt with robust fallbacks
    let fallbackModel = 'gemini-3.5-transcribe';
    let fallbackPrompt = '請將這段音檔完整轉錄為繁體中文逐字稿，內容是漢文佛法的講座與解說，保留講者的講述內容，語意通順，自然添加適當標點符號。';
    try {
      const defaultModelRow = db.prepare('SELECT name FROM models WHERE is_default = 1 LIMIT 1').get() as any;
      if (defaultModelRow?.name) fallbackModel = defaultModelRow.name;

      const defaultPromptRow = db.prepare("SELECT value FROM settings WHERE key = 'default_prompt'").get() as any;
      if (defaultPromptRow?.value) fallbackPrompt = defaultPromptRow.value;
    } catch (e: any) {
      console.warn('[transcribe] Warning reading defaults from DB, using fallback defaults:', e.message);
    }

    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    interface TaskItemToQueue {
      id: string;
      fileName: string;
      filePath: string;
      fileSize: number;
      modelName: string;
      prompt: string;
      apiKeyId?: number;
    }

    const tasksToCreate: TaskItemToQueue[] = [];

    if (contentType.includes('application/json')) {
      const body = await req.json();
      const modelName = body.model_name || fallbackModel;
      const prompt = body.prompt?.trim() || fallbackPrompt;
      const apiKeyId = body.api_key_id ? parseInt(body.api_key_id, 10) : undefined;

      // Can be single string or array of paths, or newline-delimited paths
      const rawPaths: string[] = Array.isArray(body.local_paths)
        ? body.local_paths
        : typeof body.local_path === 'string'
        ? body.local_path.split('\n').map((p: string) => p.trim()).filter(Boolean)
        : [];

      if (rawPaths.length === 0) {
        return NextResponse.json({ success: false, error: '未提供任何有效的音檔路徑' }, { status: 400 });
      }

      for (const p of rawPaths) {
        if (!fs.existsSync(p)) {
          return NextResponse.json({ success: false, error: `找不到音檔: ${p}` }, { status: 400 });
        }
        const taskId = uuidv4();
        const stat = fs.statSync(p);
        tasksToCreate.push({
          id: taskId,
          fileName: path.basename(p),
          filePath: p,
          fileSize: stat.size,
          modelName,
          prompt,
          apiKeyId,
        });
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const modelName = (formData.get('model_name') as string) || fallbackModel;
      const rawPrompt = formData.get('prompt') as string | null;
      const prompt = rawPrompt?.trim() || fallbackPrompt;
      const keyIdStr = formData.get('api_key_id') as string | null;
      const apiKeyId = keyIdStr ? parseInt(keyIdStr, 10) : undefined;

      // Multiple local paths passed via form
      const localPathsStr = formData.get('local_path') as string | null;
      if (localPathsStr) {
        const rawPaths = localPathsStr.split('\n').map((p) => p.trim()).filter(Boolean);
        for (const p of rawPaths) {
          if (fs.existsSync(p)) {
            const taskId = uuidv4();
            const stat = fs.statSync(p);
            tasksToCreate.push({
              id: taskId,
              fileName: path.basename(p),
              filePath: p,
              fileSize: stat.size,
              modelName,
              prompt,
              apiKeyId,
            });
          }
        }
      }

      // Collect uploaded files (support 'files' array or multiple 'file' fields)
      const uploadedFiles: File[] = [];
      const allFiles = formData.getAll('files') as File[];
      const singleFile = formData.getAll('file') as File[];
      for (const f of [...allFiles, ...singleFile]) {
        if (f && typeof f === 'object' && f.size > 0) {
          uploadedFiles.push(f);
        }
      }

      for (const f of uploadedFiles) {
        const taskId = uuidv4();
        const buffer = Buffer.from(await f.arrayBuffer());
        const safeName = `${taskId}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(uploadsDir, safeName);
        fs.writeFileSync(filePath, buffer);

        tasksToCreate.push({
          id: taskId,
          fileName: f.name,
          filePath,
          fileSize: f.size,
          modelName,
          prompt,
          apiKeyId,
        });
      }

      if (tasksToCreate.length === 0) {
        return NextResponse.json({ success: false, error: '未上傳音檔或提供音檔路徑' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ success: false, error: '不支援的 Request Content-Type' }, { status: 400 });
    }

    // Insert all tasks into database with status = 'pending'
    const executeInsert = () => {
      const activeDb = getDb();
      const insertStmt = activeDb.prepare(`
        INSERT INTO transcription_tasks (
          id, file_name, original_file_path, file_size, model_name, api_key_id, status, prompt, created_at
        )
        VALUES (@id, @fileName, @filePath, @fileSize, @modelName, @apiKeyId, 'pending', @prompt, datetime('now', 'localtime'))
      `);

      const insertTx = activeDb.transaction((list: TaskItemToQueue[]) => {
        for (const t of list) {
          insertStmt.run({
            id: t.id,
            fileName: t.fileName,
            filePath: t.filePath,
            fileSize: t.fileSize,
            modelName: t.modelName,
            apiKeyId: t.apiKeyId || null,
            prompt: t.prompt,
          });
        }
      });

      insertTx(tasksToCreate);
    };

    try {
      executeInsert();
    } catch (insertErr: any) {
      console.warn('[transcribe] Initial insert transaction hit error, retrying with fresh connection:', insertErr.message);
      await new Promise((r) => setTimeout(r, 200));
      executeInsert();
    }

    // Enqueue each task into the sequential queue
    for (const t of tasksToCreate) {
      queueManager.enqueue(t.id);
    }

    return NextResponse.json({
      success: true,
      count: tasksToCreate.length,
      taskId: tasksToCreate[0].id,
      taskIds: tasksToCreate.map((t) => t.id),
      message:
        tasksToCreate.length > 1
          ? `已成功將 ${tasksToCreate.length} 個檔案加入批次佇列，依序自動處理中！`
          : '任務已排入佇列並開始處理！',
    });
  } catch (err: any) {
    console.error('Error in /api/transcribe:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
