import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queueManager } from '@/lib/queueManager';

export async function POST(
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

    // Reset task status
    db.prepare(`
      UPDATE transcription_tasks
      SET status = 'pending', completed_chunks = 0, error_message = NULL, completed_at = NULL
      WHERE id = ?
    `).run(id);

    // Delete previous chunks to re-evaluate cleanly
    db.prepare('DELETE FROM task_chunks WHERE task_id = ?').run(id);

    // Re-enqueue task
    queueManager.enqueue(id);

    return NextResponse.json({ success: true, message: '任務已重設並重新排入處理佇列！' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
