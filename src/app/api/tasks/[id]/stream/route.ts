import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { taskEvents, TaskLogEvent } from '@/lib/taskEvents';


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const task = db.prepare('SELECT * FROM transcription_tasks WHERE id = ?').get(id) as any;
  if (!task) {
    return new Response('Task not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial snapshot
      const initialEvent: TaskLogEvent = {
        taskId: id,
        type: task.status === 'completed' ? 'completed' : task.status === 'failed' ? 'failed' : 'progress',
        message: `當前任務狀態: ${task.status}`,
        completedChunks: task.completed_chunks,
        totalChunks: task.total_chunks,
        progressPercent: task.status === 'completed' ? 100 : Math.round((task.completed_chunks / Math.max(1, task.total_chunks)) * 80),
        result: task.status === 'completed' ? { fullText: task.full_text, srtContent: task.srt_content } : undefined,
        timestamp: new Date().toLocaleTimeString(),
      };

      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialEvent)}\n\n`));

      // If already completed or failed, close shortly
      if (task.status === 'completed' || task.status === 'failed') {
        setTimeout(() => {
          try {
            controller.close();
          } catch (e) {}
        }, 1000);
        return;
      }

      // 2. Register listener for real-time updates
      const listener = (event: TaskLogEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (event.type === 'completed' || event.type === 'failed') {
            setTimeout(() => {
              try {
                controller.close();
              } catch (e) {}
            }, 1000);
          }
        } catch (e) {
          // Stream might be closed by client
          taskEvents.off(`task:${id}`, listener);
        }
      };

      taskEvents.on(`task:${id}`, listener);

      // Handle client disconnect
      req.signal.addEventListener('abort', () => {
        taskEvents.off(`task:${id}`, listener);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
