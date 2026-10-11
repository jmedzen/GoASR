import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const reveal = searchParams.get('reveal') === 'true';

    const keys = db.prepare(`
      SELECT id, name, key_val, note, is_active, total_calls, total_tokens, last_used_at, created_at
      FROM api_keys
      ORDER BY id ASC
    `).all() as any[];

    const formatted = keys.map((k) => ({
      ...k,
      is_active: Boolean(k.is_active),
      display_key: reveal
        ? k.key_val
        : k.key_val.length > 10
        ? `${k.key_val.slice(0, 8)}...${k.key_val.slice(-4)}`
        : '******',
    }));

    return NextResponse.json({ success: true, keys: formatted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, key_val, note } = body;

    if (!name || !key_val) {
      return NextResponse.json({ success: false, error: '請提供名稱與 API Key' }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO api_keys (name, key_val, note, is_active, created_at)
      VALUES (?, ?, ?, 1, datetime('now', 'localtime'))
    `).run(name.trim(), key_val.trim(), note?.trim() || '');

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, key_val, note, is_active } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 Key ID' }, { status: 400 });
    }

    const db = getDb();
    if (key_val) {
      db.prepare(`
        UPDATE api_keys
        SET name = ?, key_val = ?, note = ?, is_active = ?
        WHERE id = ?
      `).run(name.trim(), key_val.trim(), note?.trim() || '', is_active ? 1 : 0, id);
    } else {
      db.prepare(`
        UPDATE api_keys
        SET name = ?, note = ?, is_active = ?
        WHERE id = ?
      `).run(name.trim(), note?.trim() || '', is_active ? 1 : 0, id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 Key ID' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
