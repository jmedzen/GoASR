import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'json';

    // Retrieve recent 2000 logs for export
    const { logs } = logger.queryLogs({ limit: 2000 });

    const nowStr = new Date().toISOString().slice(0, 10);

    if (format === 'txt') {
      const lines = logs.map(
        (l) =>
          `[${l.created_at}] [${l.level.toUpperCase()}] [${l.category}] ${l.title} - ${l.message} ${
            l.task_id ? `(Task: ${l.task_id})` : ''
          }`
      );
      const content = lines.join('\n');

      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="goasr-logs-${nowStr}.log"`,
        },
      });
    }

    const jsonContent = JSON.stringify(logs, null, 2);
    return new NextResponse(jsonContent, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="goasr-logs-${nowStr}.json"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
