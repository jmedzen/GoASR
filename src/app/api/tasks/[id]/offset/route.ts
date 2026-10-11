import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { shiftSrtTimestamps } from '@/lib/merger';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const offsetSeconds = typeof body.offsetSeconds === 'number' ? body.offsetSeconds : 0;

    if (offsetSeconds === 0) {
      return NextResponse.json({ success: false, error: '偏移秒數不能為 0' }, { status: 400 });
    }

    const db = getDb();
    const task = db.prepare('SELECT id, file_name, srt_content FROM transcription_tasks WHERE id = ?').get(id) as any;

    if (!task) {
      return NextResponse.json({ success: false, error: '找不到指定任務' }, { status: 404 });
    }

    if (!task.srt_content) {
      return NextResponse.json({ success: false, error: '此任務無 SRT 字幕內容可微調' }, { status: 400 });
    }

    const newSrt = shiftSrtTimestamps(task.srt_content, offsetSeconds);

    db.prepare('UPDATE transcription_tasks SET srt_content = ? WHERE id = ?').run(newSrt, id);

    logger.info(
      'system',
      'SRT 時間軸微調',
      `任務 [${task.file_name}] 的 SRT 字幕已微調偏移 ${offsetSeconds > 0 ? '+' : ''}${offsetSeconds} 秒`,
      { taskId: id, offsetSeconds },
      id
    );

    return NextResponse.json({
      success: true,
      srtContent: newSrt,
      message: `已成功將時間軸平移 ${offsetSeconds > 0 ? '+' : ''}${offsetSeconds} 秒！`,
    });
  } catch (err: any) {
    console.error('Error in /api/tasks/[id]/offset:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
