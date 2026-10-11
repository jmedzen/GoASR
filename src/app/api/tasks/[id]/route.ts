import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cleanTaskArtifacts, cleanOrphanFiles } from '@/lib/cleanup';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const task = db.prepare('SELECT * FROM transcription_tasks WHERE id = ?').get(id) as any;
    if (!task) {
      return NextResponse.json({ success: false, error: '找不到指定任務' }, { status: 404 });
    }

    const chunks = db.prepare(`
      SELECT id, chunk_index, start_seconds, end_seconds, status, text_result, tokens, api_key_used, error_message
      FROM task_chunks
      WHERE task_id = ?
      ORDER BY chunk_index ASC
    `).all(id);

    return NextResponse.json({
      success: true,
      task: {
        ...task,
        chunks,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    // 1. Fetch task record to locate associated files
    const task = db
      .prepare('SELECT id, original_file_path FROM transcription_tasks WHERE id = ?')
      .get(id) as any;

    if (task) {
      // 2. Clean all files, chunks, and uploaded data from disk
      cleanTaskArtifacts(task.id, task.original_file_path);
    }

    // 3. Delete database records
    db.prepare('DELETE FROM task_chunks WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM transcription_tasks WHERE id = ?').run(id);

    // 4. Double check and remove any orphan files
    cleanOrphanFiles();

    return NextResponse.json({ success: true, message: '任務與所有相關檔案數據已徹底清除！' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    if (typeof body.srtContent === 'string') {
      db.prepare('UPDATE transcription_tasks SET srt_content = ? WHERE id = ?').run(body.srtContent, id);
      return NextResponse.json({ success: true, message: 'SRT 字幕內容已成功更新！' });
    }
    return NextResponse.json({ success: false, error: '缺少 srtContent 參數' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
