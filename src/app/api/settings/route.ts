import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settingsMap: Record<string, string> = {};
    for (const r of rows) {
      settingsMap[r.key] = r.value;
    }
    return NextResponse.json({ success: true, settings: settingsMap });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();

    const upsertStmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const updateTx = db.transaction((entries: [string, any][]) => {
      for (const [k, v] of entries) {
        upsertStmt.run(k, String(v));
      }
    });

    updateTx(Object.entries(body));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
