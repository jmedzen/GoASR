import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const level = (searchParams.get('level') || 'all') as any;
    const category = (searchParams.get('category') || 'all') as any;
    const taskId = searchParams.get('taskId') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const result = logger.queryLogs({
      level,
      category,
      taskId,
      search,
      page,
      limit,
    });
    const stats = logger.getStats();

    return NextResponse.json({
      success: true,
      ...result,
      stats,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    logger.clearAll();
    return NextResponse.json({ success: true, message: '日誌已成功清空' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
