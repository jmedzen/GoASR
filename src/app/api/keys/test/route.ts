import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { key_val } = await req.json();
    if (!key_val) {
      return NextResponse.json({ success: false, error: '請提供 Key 進行測試' }, { status: 400 });
    }

    const startTime = Date.now();
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key_val}`;
    const res = await fetch(testUrl);
    const latency = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({
        success: false,
        valid: false,
        latency,
        error: `Google API 回傳錯誤 (${res.status}): ${errText}`,
      });
    }

    const data = await res.json();
    const modelCount = data.models?.length || 0;

    return NextResponse.json({
      success: true,
      valid: true,
      latency,
      modelCount,
      message: `連線成功！該 Key 有效，已偵測到 ${modelCount} 個模型，延遲 ${latency}ms`,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      valid: false,
      error: `網路或連線失敗: ${err.message}`,
    });
  }
}
