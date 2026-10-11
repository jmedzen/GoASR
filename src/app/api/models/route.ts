import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { fetchGeminiModels } from '@/lib/gemini';

export async function GET() {
  try {
    const db = getDb();
    const models = db.prepare(`
      SELECT id, name, display_name, description, input_token_limit, output_token_limit, is_audio_supported, is_enabled, is_default, sort_order, updated_at
      FROM models
      ORDER BY is_default DESC, sort_order ASC, id ASC
    `).all() as any[];

    return NextResponse.json({
      success: true,
      models: models.map((m) => ({
        ...m,
        is_audio_supported: Boolean(m.is_audio_supported),
        is_enabled: Boolean(m.is_enabled),
        is_default: Boolean(m.is_default),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json().catch(() => ({}));
    let apiKey = body.apiKey;

    if (!apiKey) {
      const activeKey = db.prepare('SELECT key_val FROM api_keys WHERE is_active = 1 LIMIT 1').get() as any;
      if (!activeKey) {
        return NextResponse.json(
          { success: false, error: '請先新增並啟用至少一組 Google API Key 才能同步模型。' },
          { status: 400 }
        );
      }
      apiKey = activeKey.key_val;
    }

    const fetchedModels = await fetchGeminiModels(apiKey);

    const upsertStmt = db.prepare(`
      INSERT INTO models (name, display_name, description, input_token_limit, output_token_limit, is_audio_supported, is_enabled, is_default, sort_order, updated_at)
      VALUES (@name, @displayName, @description, @inputTokenLimit, @outputTokenLimit, 1, 1, 0, 99, datetime('now', 'localtime'))
      ON CONFLICT(name) DO UPDATE SET
        display_name = excluded.display_name,
        description = excluded.description,
        input_token_limit = excluded.input_token_limit,
        output_token_limit = excluded.output_token_limit,
        updated_at = datetime('now', 'localtime')
    `);

    const updateMany = db.transaction((list: any[]) => {
      for (const m of list) {
        upsertStmt.run({
          name: m.name,
          displayName: m.displayName,
          description: m.description,
          inputTokenLimit: m.inputTokenLimit,
          outputTokenLimit: m.outputTokenLimit,
        });
      }
    });

    updateMany(fetchedModels);

    return NextResponse.json({
      success: true,
      count: fetchedModels.length,
      message: `已成功同步 ${fetchedModels.length} 個語音/多模態模型！`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, is_enabled, is_default, sort_order } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 Model ID' }, { status: 400 });
    }

    const db = getDb();

    if (is_default) {
      // Clear default flag on other models
      db.prepare('UPDATE models SET is_default = 0').run();
      db.prepare('UPDATE models SET is_default = 1, is_enabled = 1 WHERE id = ?').run(id);
    } else if (is_enabled !== undefined) {
      db.prepare('UPDATE models SET is_enabled = ? WHERE id = ?').run(is_enabled ? 1 : 0, id);
    } else if (sort_order !== undefined) {
      db.prepare('UPDATE models SET sort_order = ? WHERE id = ?').run(sort_order, id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
