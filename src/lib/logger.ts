import { EventEmitter } from 'events';
import { getDb } from './db';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export type LogCategory =
  | 'transcribe'
  | 'gemini'
  | 'queue'
  | 'keys'
  | 'models'
  | 'cleanup'
  | 'system';

export interface SystemLogEntry {
  id?: number;
  level: LogLevel;
  category: LogCategory;
  task_id?: string | null;
  title: string;
  message: string;
  metadata?: any;
  created_at?: string;
}

export interface LogFilterOptions {
  level?: LogLevel | 'all';
  category?: LogCategory | 'all';
  taskId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Global EventEmitter for real-time live log tailing across Next.js API routes
declare global {
  var __goasr_log_emitter: EventEmitter | undefined;
}

export const logEmitter: EventEmitter =
  globalThis.__goasr_log_emitter || (globalThis.__goasr_log_emitter = new EventEmitter());
logEmitter.setMaxListeners(100);

class SystemLogger {
  /**
   * Core method to write a log entry
   */
  public log(
    level: LogLevel,
    category: LogCategory,
    title: string,
    message: string = '',
    metadata?: any,
    taskId?: string | null
  ): SystemLogEntry {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const metaStr =
      metadata !== undefined && metadata !== null
        ? typeof metadata === 'string'
          ? metadata
          : JSON.stringify(metadata)
        : null;

    let insertedId: number | undefined;

    try {
      const db = getDb();
      const info = db
        .prepare(`
        INSERT INTO system_logs (level, category, task_id, title, message, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .run(level, category, taskId || null, title, message, metaStr, timeStr);

      insertedId = Number(info.lastInsertRowid);
    } catch (err) {
      console.error('[SystemLogger DB Error]', err);
    }

    const logEntry: SystemLogEntry = {
      id: insertedId,
      level,
      category,
      task_id: taskId || null,
      title,
      message,
      metadata,
      created_at: timeStr,
    };

    // Print to stdout / stderr with color/format
    const prefix = `[${timeStr}] [${level.toUpperCase()}] [${category}]`;
    if (level === 'error') {
      console.error(`${prefix} ${title}: ${message}`, metadata || '');
    } else if (level === 'warn') {
      console.warn(`${prefix} ${title}: ${message}`, metadata || '');
    } else {
      console.log(`${prefix} ${title}: ${message}`);
    }

    // Broadcast to SSE live-tail subscribers
    try {
      logEmitter.emit('log', logEntry);
    } catch (e) {
      // Ignore broadcast errors
    }

    return logEntry;
  }

  public info(category: LogCategory, title: string, message: string = '', metadata?: any, taskId?: string) {
    return this.log('info', category, title, message, metadata, taskId);
  }

  public warn(category: LogCategory, title: string, message: string = '', metadata?: any, taskId?: string) {
    return this.log('warn', category, title, message, metadata, taskId);
  }

  public error(category: LogCategory, title: string, message: string = '', metadata?: any, taskId?: string) {
    return this.log('error', category, title, message, metadata, taskId);
  }

  public success(category: LogCategory, title: string, message: string = '', metadata?: any, taskId?: string) {
    return this.log('success', category, title, message, metadata, taskId);
  }

  /**
   * Query logs with multi-condition filtering and pagination
   */
  public queryLogs(opts: LogFilterOptions = {}) {
    const db = getDb();
    const page = Math.max(1, opts.page || 1);
    const limit = Math.max(1, Math.min(200, opts.limit || 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (opts.level && opts.level !== 'all') {
      conditions.push('level = ?');
      params.push(opts.level);
    }

    if (opts.category && opts.category !== 'all') {
      conditions.push('category = ?');
      params.push(opts.category);
    }

    if (opts.taskId) {
      conditions.push('task_id = ?');
      params.push(opts.taskId);
    }

    if (opts.search && opts.search.trim()) {
      const keyword = `%${opts.search.trim()}%`;
      conditions.push('(title LIKE ? OR message LIKE ? OR task_id LIKE ?)');
      params.push(keyword, keyword, keyword);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM system_logs ${whereClause}`)
      .get(...params) as { total: number };

    // Seed initial logs if completely empty
    if (countRow.total === 0 && !whereClause) {
      this.info('system', '全站日誌系統啟動', 'GoASR 系統日誌與審計監控服務已啟動，開始審計全站事件。');
      this.info('keys', '金鑰庫狀態就緒', '已檢測並載入可用 Google Gemini API 金鑰池');
      this.info('queue', '批次排程佇列就緒', '順序處理工作節點已就緒，等待轉錄任務排入');
    }

    const rows = db
      .prepare(`
        SELECT id, level, category, task_id, title, message, metadata, created_at
        FROM system_logs
        ${whereClause}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as any[];

    const logs = rows.map((r) => {
      let parsedMeta = null;
      if (r.metadata) {
        try {
          parsedMeta = JSON.parse(r.metadata);
        } catch {
          parsedMeta = r.metadata;
        }
      }
      return {
        ...r,
        metadata: parsedMeta,
      };
    });

    return {
      total: countRow.total,
      page,
      limit,
      totalPages: Math.ceil(countRow.total / limit),
      logs,
    };
  }

  /**
   * Get log statistics for summary header
   */
  public getStats() {
    const db = getDb();
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM system_logs').get() as { count: number };
    const errorRow = db.prepare("SELECT COUNT(*) as count FROM system_logs WHERE level = 'error'").get() as { count: number };
    const warnRow = db.prepare("SELECT COUNT(*) as count FROM system_logs WHERE level = 'warn'").get() as { count: number };
    const successRow = db.prepare("SELECT COUNT(*) as count FROM system_logs WHERE level = 'success'").get() as { count: number };
    const infoRow = db.prepare("SELECT COUNT(*) as count FROM system_logs WHERE level = 'info'").get() as { count: number };

    // Today count
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayRow = db
      .prepare("SELECT COUNT(*) as count FROM system_logs WHERE created_at LIKE ?")
      .get(`${todayStr}%`) as { count: number };

    return {
      total: totalRow.count,
      errors: errorRow.count,
      warnings: warnRow.count,
      successes: successRow.count,
      infos: infoRow.count,
      today: todayRow.count,
    };
  }

  /**
   * Delete all logs
   */
  public clearAll() {
    const db = getDb();
    db.prepare('DELETE FROM system_logs').run();
    this.info('system', '日誌清空', '使用者手動清空了全站系統日誌');
  }

  /**
   * Prune logs to retain last N entries
   */
  public prune(keepCount: number = 10000) {
    const db = getDb();
    db.prepare(`
      DELETE FROM system_logs
      WHERE id NOT IN (
        SELECT id FROM system_logs ORDER BY id DESC LIMIT ?
      )
    `).run(keepCount);
  }
}

export const logger = new SystemLogger();
