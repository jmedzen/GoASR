import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id) as any;
    if (!row) {
      return NextResponse.json({ success: false, error: '找不到指定提示詞範本' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      prompt: {
        ...row,
        is_default: Boolean(row.is_default),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const title = body.title?.trim();
    const content = body.content?.trim();
    const description = body.description !== undefined ? body.description?.trim() || null : undefined;
    const isDefault = body.is_default !== undefined ? Boolean(body.is_default) : undefined;

    if (!title) {
      return NextResponse.json({ success: false, error: '提示詞範本名稱不可為空' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ success: false, error: '提示詞內容不可為空' }, { status: 400 });
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ success: false, error: '找不到指定提示詞範本' }, { status: 404 });
    }

    // If setting to default, unset others and update settings.default_prompt
    if (isDefault) {
      db.prepare('UPDATE prompt_templates SET is_default = 0 WHERE id != ?').run(id);
      db.prepare(`
        INSERT INTO settings (key, value) VALUES ('default_prompt', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(content);
    } else if (existing.is_default && isDefault === false) {
      // If unsetting the current default, ensure another default exists
      const other = db.prepare('SELECT id, content FROM prompt_templates WHERE id != ? LIMIT 1').get(id) as any;
      if (other) {
        db.prepare('UPDATE prompt_templates SET is_default = 1 WHERE id = ?').run(other.id);
        db.prepare(`
          INSERT INTO settings (key, value) VALUES ('default_prompt', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(other.content);
      }
    }

    db.prepare(`
      UPDATE prompt_templates
      SET title = ?, content = ?, description = COALESCE(?, description), is_default = COALESCE(?, is_default), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(title, content, description, isDefault !== undefined ? (isDefault ? 1 : 0) : null, id);

    // If it was already default and its content was edited, update settings.default_prompt as well
    if (existing.is_default || isDefault) {
      db.prepare(`
        INSERT INTO settings (key, value) VALUES ('default_prompt', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(content);
    }

    const updated = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id) as any;

    logger.info(
      'system',
      '更新提示詞範本',
      `成功更新提示詞範本「${title}」`,
      { id, title, isDefault: Boolean(updated.is_default) }
    );

    return NextResponse.json({
      success: true,
      prompt: {
        ...updated,
        is_default: Boolean(updated.is_default),
      },
    });
  } catch (err: any) {
    console.error('Error in PUT /api/prompts/[id]:', err);
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

    const countRow = db.prepare('SELECT COUNT(*) as count FROM prompt_templates').get() as { count: number };
    if (countRow.count <= 1) {
      return NextResponse.json({ success: false, error: '系統至少需保留一個轉錄提示詞範本，無法全數刪除' }, { status: 400 });
    }

    const existing = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ success: false, error: '找不到欲刪除的提示詞範本' }, { status: 404 });
    }

    const wasDefault = Boolean(existing.is_default);

    db.prepare('DELETE FROM prompt_templates WHERE id = ?').run(id);

    // If deleted template was default, assign default to another template
    if (wasDefault) {
      const nextDefault = db.prepare('SELECT id, title, content FROM prompt_templates ORDER BY id ASC LIMIT 1').get() as any;
      if (nextDefault) {
        db.prepare('UPDATE prompt_templates SET is_default = 1 WHERE id = ?').run(nextDefault.id);
        db.prepare(`
          INSERT INTO settings (key, value) VALUES ('default_prompt', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(nextDefault.content);
      }
    }

    logger.info(
      'system',
      '刪除提示詞範本',
      `已刪除提示詞範本「${existing.title}」`,
      { id, title: existing.title, wasDefault }
    );

    return NextResponse.json({ success: true, message: `已成功刪除範本「${existing.title}」` });
  } catch (err: any) {
    console.error('Error in DELETE /api/prompts/[id]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
