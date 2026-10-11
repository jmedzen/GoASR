import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const template = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id) as any;
    if (!template) {
      return NextResponse.json({ success: false, error: '找不到指定提示詞範本' }, { status: 404 });
    }

    db.prepare('UPDATE prompt_templates SET is_default = 0').run();
    db.prepare('UPDATE prompt_templates SET is_default = 1 WHERE id = ?').run(id);

    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('default_prompt', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(template.content);

    logger.info(
      'system',
      '變更預設提示詞範本',
      `已將「${template.title}」設為全系統預設轉錄提示詞`,
      { id, title: template.title }
    );

    return NextResponse.json({
      success: true,
      message: `已將「${template.title}」設為預設範本！`,
    });
  } catch (err: any) {
    console.error('Error in POST /api/prompts/[id]/default:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
