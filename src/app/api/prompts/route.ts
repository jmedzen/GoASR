import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface PromptTemplate {
  id: number;
  title: string;
  content: string;
  description: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, title, content, description, is_default, sort_order, created_at, updated_at
      FROM prompt_templates
      ORDER BY is_default DESC, sort_order ASC, id ASC
    `).all() as any[];

    const prompts: PromptTemplate[] = rows.map((r) => ({
      ...r,
      is_default: Boolean(r.is_default),
    }));

    return NextResponse.json({ success: true, prompts, templates: prompts });
  } catch (err: any) {
    console.error('Error in GET /api/prompts:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = body.title?.trim();
    const content = body.content?.trim();
    const description = body.description?.trim() || null;
    const isDefault = Boolean(body.is_default);

    if (!title) {
      return NextResponse.json({ success: false, error: '請輸入提示詞範本名稱 (Title)' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ success: false, error: '請輸入提示詞內容 (Content)' }, { status: 400 });
    }

    const db = getDb();

    // If marked as default, unset other defaults
    if (isDefault) {
      db.prepare('UPDATE prompt_templates SET is_default = 0').run();
      db.prepare(`
        INSERT INTO settings (key, value) VALUES ('default_prompt', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(content);
    }

    const maxOrderRow = db.prepare('SELECT MAX(sort_order) as maxOrder FROM prompt_templates').get() as any;
    const sortOrder = (maxOrderRow?.maxOrder || 0) + 1;

    const result = db.prepare(`
      INSERT INTO prompt_templates (title, content, description, is_default, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(title, content, description, isDefault ? 1 : 0, sortOrder);

    const newId = Number(result.lastInsertRowid);
    const newPrompt = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(newId) as any;

    logger.info(
      'system',
      '新增提示詞範本',
      `成功建立提示詞範本「${title}」${isDefault ? '（已設為預設）' : ''}`,
      { id: newId, title, isDefault }
    );

    return NextResponse.json({
      success: true,
      prompt: {
        ...newPrompt,
        is_default: Boolean(newPrompt.is_default),
      },
    });
  } catch (err: any) {
    console.error('Error in POST /api/prompts:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
