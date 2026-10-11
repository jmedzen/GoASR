import { NextRequest, NextResponse } from 'next/server';
import { queueManager } from '@/lib/queueManager';

export async function GET() {
  try {
    const status = queueManager.getStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, taskId, direction } = body;

    if (action === 'pause') {
      const success = queueManager.pause();
      return NextResponse.json({ success, isPaused: true });
    }

    if (action === 'resume') {
      const success = queueManager.resume();
      return NextResponse.json({ success, isPaused: false });
    }

    if (action === 'move') {
      if (!taskId || !direction || (direction !== 'up' && direction !== 'down')) {
        return NextResponse.json({ success: false, error: '缺少 taskId 或 direction 無效' }, { status: 400 });
      }
      const success = queueManager.moveQueueItem(taskId, direction);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ success: false, error: `未知操作: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少任務 ID' }, { status: 400 });
    }

    const removed = queueManager.cancelPendingTask(id);
    return NextResponse.json({ success: true, removed });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

