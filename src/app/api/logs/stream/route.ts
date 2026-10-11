import { NextRequest } from 'next/server';
import { logEmitter, SystemLogEntry } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(': connected\n\n'));

      const listener = (entry: SystemLogEntry) => {
        try {
          const payload = `data: ${JSON.stringify(entry)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream might be closed
        }
      };

      logEmitter.on('log', listener);

      // Keepalive ping every 15 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(pingInterval);
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        logEmitter.off('log', listener);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
