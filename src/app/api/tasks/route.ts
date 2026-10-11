import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const tasks = db.prepare(`
      SELECT 
        id, file_name, file_size, duration_seconds, model_name, api_key_name,
        status, total_chunks, completed_chunks, prompt, token_usage, error_message,
        created_at, completed_at
      FROM transcription_tasks
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return NextResponse.json({ success: true, tasks });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
