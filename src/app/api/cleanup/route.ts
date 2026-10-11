import { NextResponse } from 'next/server';
import { cleanOrphanFiles } from '@/lib/cleanup';

export async function POST() {
  try {
    const result = cleanOrphanFiles();
    return NextResponse.json({
      success: true,
      ...result,
      message: `孤兒檔案清理完成！共清除 ${result.deletedUploads} 個無主暫存音檔與 ${result.deletedChunks} 個殘留片段資料夾。`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
