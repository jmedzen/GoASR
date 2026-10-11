import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') === 'srt' ? 'srt' : 'txt';

    const db = getDb();
    const task = db.prepare('SELECT file_name, full_text, srt_content FROM transcription_tasks WHERE id = ?').get(id) as any;

    if (!task) {
      return new NextResponse('Task not found', { status: 404 });
    }

    const baseName = task.file_name.replace(/\.[^/.]+$/, '');
    const content = format === 'srt' ? task.srt_content || '' : task.full_text || '';
    const ext = format === 'srt' ? 'srt' : 'txt';
    const filename = `${encodeURIComponent(baseName)}.${ext}`;

    return new NextResponse(content, {
      headers: {
        'Content-Type': format === 'srt' ? 'text/plain; charset=utf-8' : 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (err: any) {
    return new NextResponse(err.message, { status: 500 });
  }
}
