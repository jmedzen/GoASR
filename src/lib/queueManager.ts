import { getDb } from './db';
import { runTask } from './taskRunner';
import { broadcastTaskEvent } from './taskEvents';
import { cleanTaskArtifacts } from './cleanup';
import { logger } from './logger';

class QueueManager {
  private isProcessing: boolean = false;
  private isPaused: boolean = false;
  private currentTaskId: string | null = null;

  constructor() {
    // Check if there are any lingering pending tasks on startup
    if (typeof process !== 'undefined') {
      setTimeout(() => {
        this.processNextQueueItem().catch(console.error);
      }, 2000);
    }
  }

  /**
   * Add a task to the queue and trigger processing if idle and not paused
   */
  public enqueue(taskId: string) {
    broadcastTaskEvent({
      taskId,
      type: 'log',
      message: '已加入排程佇列，等待順序處理...',
    });
    logger.info('queue', '任務入列', `任務 ${taskId.slice(0, 8)}... 已加入批次排程佇列`, undefined, taskId);

    this.broadcastQueueChange();
    if (!this.isPaused) {
      this.processNextQueueItem().catch(console.error);
    }
  }

  /**
   * Pause the queue from automatically starting the next task
   */
  public pause(): boolean {
    this.isPaused = true;
    console.log('[Queue] Batch queue paused by user.');
    logger.warn('queue', '批次佇列已暫停', '使用者暫停了批次佇列的自動順序處理');
    this.broadcastQueueChange();
    return true;
  }

  /**
   * Resume queue and start processing pending tasks
   */
  public resume(): boolean {
    this.isPaused = false;
    console.log('[Queue] Batch queue resumed by user.');
    logger.info('queue', '批次佇列已繼續', '使用者恢復了批次佇列的順序處理');
    this.broadcastQueueChange();
    this.processNextQueueItem().catch(console.error);
    return true;
  }

  /**
   * Get current queue status (active task, paused state, and pending tasks)
   */
  public getStatus() {
    const db = getDb();
    const pendingTasks = db.prepare(`
      SELECT id, file_name, file_size, model_name, created_at, status
      FROM transcription_tasks
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all() as any[];

    return {
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      currentTaskId: this.currentTaskId,
      pendingCount: pendingTasks.length,
      pendingTasks,
    };
  }

  /**
   * Move pending task position up or down
   */
  public moveQueueItem(taskId: string, direction: 'up' | 'down'): boolean {
    const db = getDb();
    const pendingTasks = db.prepare(`
      SELECT id, created_at
      FROM transcription_tasks
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all() as { id: string; created_at: string }[];

    const index = pendingTasks.findIndex((t) => t.id === taskId);
    if (index === -1) return false;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pendingTasks.length) return false;

    // Swap created_at timestamps to persist ordering in SQLite
    const currentTask = pendingTasks[index];
    const targetTask = pendingTasks[targetIndex];

    const updateStmt = db.prepare('UPDATE transcription_tasks SET created_at = ? WHERE id = ?');
    const swapTx = db.transaction(() => {
      // Temporary swap
      updateStmt.run('2099-01-01 00:00:00', currentTask.id);
      updateStmt.run(currentTask.created_at, targetTask.id);
      updateStmt.run(targetTask.created_at, currentTask.id);
    });

    swapTx();
    logger.info('queue', '佇列順序調整', `任務 ${taskId.slice(0, 8)}... 順序已調整為: ${direction === 'up' ? '上移（優先）' : '下移'}`, { taskId, direction }, taskId);
    this.broadcastQueueChange();
    return true;
  }

  /**
   * Cancel and remove a pending task from the queue
   */
  public cancelPendingTask(taskId: string) {
    const db = getDb();
    const task = db.prepare("SELECT * FROM transcription_tasks WHERE id = ? AND status = 'pending'").get(taskId) as any;
    if (task) {
      cleanTaskArtifacts(task.id, task.original_file_path);
      db.prepare('DELETE FROM task_chunks WHERE task_id = ?').run(taskId);
      db.prepare('DELETE FROM transcription_tasks WHERE id = ?').run(taskId);
      logger.info('queue', '取消排程任務', `已取消任務 [${task.file_name}] (${taskId.slice(0, 8)}...) 並清除暫存`, undefined, taskId);
      this.broadcastQueueChange();
      return true;
    }
    return false;
  }

  /**
   * Sequential worker loop: process one file at a time
   */
  public async processNextQueueItem(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    if (this.isPaused) {
      console.log('[Queue] Queue is currently paused. Skipping next item.');
      return;
    }

    const db = getDb();
    const nextTask = db.prepare(`
      SELECT id, file_name 
      FROM transcription_tasks 
      WHERE status = 'pending' 
      ORDER BY created_at ASC 
      LIMIT 1
    `).get() as { id: string; file_name: string } | undefined;

    if (!nextTask) {
      this.currentTaskId = null;
      this.broadcastQueueChange();
      return;
    }

    this.isProcessing = true;
    this.currentTaskId = nextTask.id;
    this.broadcastQueueChange();

    try {
      console.log(`[Queue] Starting next task: ${nextTask.file_name} (${nextTask.id})`);
      await runTask(nextTask.id);
    } catch (err: any) {
      console.error(`[Queue] Task ${nextTask.id} failed in queue runner:`, err);
    } finally {
      this.isProcessing = false;
      this.currentTaskId = null;
      this.broadcastQueueChange();

      // If not paused, automatically pick up next task in queue
      if (!this.isPaused) {
        setImmediate(() => {
          this.processNextQueueItem().catch(console.error);
        });
      }
    }
  }

  private broadcastQueueChange() {
    broadcastTaskEvent({
      taskId: this.currentTaskId || 'queue',
      type: 'progress',
      message: 'QUEUE_STATUS_UPDATED',
    });
  }
}

// Global singleton for Next.js server runtime
declare global {
  var __goasr_queue_manager: QueueManager | undefined;
}

export const queueManager: QueueManager =
  globalThis.__goasr_queue_manager || (globalThis.__goasr_queue_manager = new QueueManager());
