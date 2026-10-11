import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'goasr.db');

const globalForDb = globalThis as unknown as {
  __goasr_db__: Database.Database | undefined;
};

function initDbInstance(): Database.Database {
  const db = new Database(DB_PATH, { timeout: 10000 });
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 10000');

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_val TEXT NOT NULL UNIQUE,
      note TEXT,
      is_active INTEGER DEFAULT 1,
      total_calls INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      input_token_limit INTEGER,
      output_token_limit INTEGER,
      is_audio_supported INTEGER DEFAULT 1,
      is_enabled INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transcription_tasks (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      original_file_path TEXT,
      file_size INTEGER DEFAULT 0,
      duration_seconds REAL DEFAULT 0,
      model_name TEXT NOT NULL,
      api_key_id INTEGER,
      api_key_name TEXT,
      status TEXT NOT NULL,
      total_chunks INTEGER DEFAULT 1,
      completed_chunks INTEGER DEFAULT 0,
      prompt TEXT,
      full_text TEXT,
      srt_content TEXT,
      token_usage INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      start_seconds REAL NOT NULL,
      end_seconds REAL NOT NULL,
      chunk_file_path TEXT,
      status TEXT NOT NULL,
      text_result TEXT,
      tokens INTEGER DEFAULT 0,
      api_key_used TEXT,
      error_message TEXT,
      FOREIGN KEY (task_id) REFERENCES transcription_tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      task_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON system_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_category ON system_logs(category);
    CREATE INDEX IF NOT EXISTS idx_logs_task_id ON system_logs(task_id);
  `);

  // Seed default settings
  const defaultSettings: Record<string, string> = {
    theme: 'gruvbox',
    default_prompt: '請將這段音檔完整轉錄為標準繁體中文 SRT 字幕格式。請精確對齊講者的實際發音起訖時間（包含小數點毫秒，格式為 HH:MM:SS,mmm --> HH:MM:SS,mmm）。保留講者的講述內容，語意通順，標點清晰，不要遺漏任何內容。',
    silence_duration: '0.6',
    silence_noise_db: '-30',
    chunk_max_minutes: '4',
    max_concurrency: '3',
    keep_timestamps: 'true',
    api_max_retries: '10',
    api_retry_delay_step: '2',
  };

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  // Seed user tested API key if not exists
  const existingKeys = db.prepare('SELECT COUNT(*) as count FROM api_keys').get() as { count: number };
  if (existingKeys.count === 0) {
    db.prepare(`
      INSERT INTO api_keys (name, key_val, note, is_active, created_at)
      VALUES (?, ?, ?, 1, datetime('now', 'localtime'))
    `).run('Google Free API 1', 'AIzaSyCiAewOSYjhLrFo81e7j_3T4i2aBkIQ7Jw', '實測通過之 Free API Key');
  }

  // Seed models if not exist
  const existingModels = db.prepare('SELECT COUNT(*) as count FROM models').get() as { count: number };
  if (existingModels.count === 0) {
    const defaultModels = [
      {
        name: 'gemini-3.5-transcribe',
        display_name: 'Gemini 3.5 Transcribe',
        description: '專用語音轉錄模型，高準確率',
        input_token_limit: 98304,
        output_token_limit: 32768,
        is_default: 1,
        sort_order: 1,
      },
      {
        name: 'gemini-2.5-flash',
        display_name: 'Gemini 2.5 Flash',
        description: '超長 Context (1M tokens)，快速輕量',
        input_token_limit: 1048576,
        output_token_limit: 65536,
        is_default: 0,
        sort_order: 2,
      },
      {
        name: 'gemini-2.5-pro',
        display_name: 'Gemini 2.5 Pro',
        description: '高推理能力多模態模型',
        input_token_limit: 1048576,
        output_token_limit: 65536,
        is_default: 0,
        sort_order: 3,
      },
      {
        name: 'gemini-3.5-flash',
        display_name: 'Gemini 3.5 Flash',
        description: '次世代高效多模態模型',
        input_token_limit: 1048576,
        output_token_limit: 65536,
        is_default: 0,
        sort_order: 4,
      },
      {
        name: 'gemini-3-flash-preview',
        display_name: 'Gemini 3 Flash Preview',
        description: 'Gemini 3 預覽模型',
        input_token_limit: 1048576,
        output_token_limit: 65536,
        is_default: 0,
        sort_order: 5,
      },
    ];

    const insertModel = db.prepare(`
      INSERT INTO models (name, display_name, description, input_token_limit, output_token_limit, is_audio_supported, is_enabled, is_default, sort_order, updated_at)
      VALUES (@name, @display_name, @description, @input_token_limit, @output_token_limit, 1, 1, @is_default, @sort_order, datetime('now', 'localtime'))
    `);

    for (const m of defaultModels) {
      insertModel.run(m);
    }
  }

  // Seed prompt templates if not exists
  const existingTemplates = db.prepare('SELECT COUNT(*) as count FROM prompt_templates').get() as { count: number };
  if (existingTemplates.count === 0) {
    const currentDefaultPrompt =
      (db.prepare("SELECT value FROM settings WHERE key = 'default_prompt'").get() as any)?.value ||
      '請將這段音檔完整轉錄為標準繁體中文 SRT 字幕格式。請精確對齊講者的實際發音起訖時間（包含小數點毫秒，格式為 HH:MM:SS,mmm --> HH:MM:SS,mmm）。保留講者的講述內容，語意通順，標點清晰，不要遺漏任何內容。';

    const defaultTemplates = [
      {
        title: '標準繁體中文 SRT 字幕格式（高精度時間戳）',
        description: '精確對齊實際發音起訖時間（包含毫秒），標點清晰，無遺漏',
        content: currentDefaultPrompt,
        is_default: 1,
        sort_order: 1,
      },
      {
        title: '佛學開示逐字稿（區間時間戳格式）',
        description: '每句標註 [MM:SS - MM:SS] 語音區間，適合佛法開示與口傳講義',
        content: `請將這段音檔完整轉錄為繁體中文逐字稿，保留講者的講述內容，語意通順。\n請在每一句前方附上講者實際發音的時間戳，格式如下：\n[MM:SS - MM:SS] 逐字稿文字\n例如：\n[00:00 - 00:04] 阿彌陀佛，大家早。`,
        is_default: 0,
        sort_order: 2,
      },
      {
        title: '佛學講座精讀（純文字閱讀版）',
        description: '佛教通俗正體名相術語（阿賴耶識、唯識、止觀、般若等），適合整理成冊閱讀',
        content:
          '請將這段音檔完整轉錄為繁體中文逐字稿，內容是漢文佛法的講座與解說，保留講者的講述內容，語意通順，自然添加適當標點符號，名相術語請依佛教通俗繁體正字（如：阿賴耶識、唯識、止觀、般若等）。',
        is_default: 0,
        sort_order: 3,
      },
      {
        title: '通用高精準逐字稿（會議/訪談）',
        description: '通用商務會議、學術演講與訪談記錄，修飾冗贅詞，語意流暢',
        content: '請將這段音檔完整轉錄為繁體中文，去除語病與冗餘贅詞，保持原意完整通順，自然添加適當標點符號。',
        is_default: 0,
        sort_order: 4,
      },
      {
        title: '雙語會議與專有名詞保留',
        description: '保留英文原文專有名詞與技術術語，繁體中文主體',
        content: '請將這段音檔轉錄為繁體中文，若有英文專有名詞請保留英文原文，語氣自然通順，添加適當標點符號。',
        is_default: 0,
        sort_order: 5,
      },
    ];

    const insertTemplate = db.prepare(`
      INSERT INTO prompt_templates (title, content, description, is_default, sort_order, created_at, updated_at)
      VALUES (@title, @content, @description, @is_default, @sort_order, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    for (const t of defaultTemplates) {
      insertTemplate.run(t);
    }
  }

  return db;
}

export function getDb(): Database.Database {
  const existing = globalForDb.__goasr_db__;
  if (existing && existing.open) {
    try {
      existing.prepare('SELECT 1').get();
      return existing;
    } catch (err: any) {
      console.warn('[DB] Connection check failed, auto-recovering:', err.message);
      try {
        existing.close();
      } catch (_) {}
      globalForDb.__goasr_db__ = undefined;
    }
  }

  const db = initDbInstance();
  globalForDb.__goasr_db__ = db;
  return db;
}

/**
 * Perform WAL checkpoint to flush transactions to disk safely
 */
export function checkpointDb() {
  try {
    const db = getDb();
    db.pragma('wal_checkpoint(PASSIVE)');
  } catch (e) {
    console.warn('[DB] Checkpoint warning:', e);
  }
}
