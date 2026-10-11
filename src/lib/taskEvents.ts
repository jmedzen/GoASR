import { EventEmitter } from 'events';

export interface TaskLogEvent {
  taskId: string;
  type: 'log' | 'progress' | 'chunk_update' | 'completed' | 'failed';
  message?: string;
  progressPercent?: number;
  completedChunks?: number;
  totalChunks?: number;
  chunk?: any;
  result?: any;
  timestamp: string;
}

class TaskEventEmitter extends EventEmitter {}

export const taskEvents = new TaskEventEmitter();
// Increase listener limit for multiple SSE clients
taskEvents.setMaxListeners(100);

export function broadcastTaskEvent(event: Omit<TaskLogEvent, 'timestamp'>) {
  const fullEvent: TaskLogEvent = {
    ...event,
    timestamp: new Date().toLocaleTimeString(),
  };
  taskEvents.emit(`task:${event.taskId}`, fullEvent);
  taskEvents.emit('task:*', fullEvent);
}
