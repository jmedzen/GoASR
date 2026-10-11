import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { getDb } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const task = db.prepare('SELECT original_file_path, file_name FROM transcription_tasks WHERE id = ?').get(id) as any;

    if (!task || !task.original_file_path) {
      return new NextResponse('Task or audio path not found', { status: 404 });
    }

    const filePath = task.original_file_path;
    if (!fs.existsSync(filePath)) {
      return new NextResponse(`Audio file not found on disk: ${filePath}`, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // Determine MIME type
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
    };
    const contentType = mimeTypes[ext] || 'audio/mpeg';

    const range = req.headers.get('range');

    if (range) {
      // Parse Range header (e.g. "bytes=1048576-")
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new NextResponse('Requested range not satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
        });
      }

      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(nodeStream);

      return new Response(webStream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
        },
      });
    } else {
      const nodeStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream);

      return new Response(webStream as any, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': fileSize.toString(),
          'Content-Type': contentType,
        },
      });
    }
  } catch (err: any) {
    console.error('Error streaming audio:', err);
    return new NextResponse(err.message, { status: 500 });
  }
}
