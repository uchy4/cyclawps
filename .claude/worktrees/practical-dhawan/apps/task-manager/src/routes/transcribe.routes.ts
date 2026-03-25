import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export function registerTranscribeRoutes(fastify: FastifyInstance): void {
  // POST /api/transcribe — accepts audio blob, returns transcribed text
  fastify.post('/api/transcribe', async (request, reply) => {
    const contentType = request.headers['content-type'] || '';

    // Accept raw audio body (audio/webm, audio/wav, etc.)
    const data = await request.body as Buffer;
    if (!data || !(data instanceof Buffer || ArrayBuffer.isView(data))) {
      return reply.code(400).send({ error: 'No audio data received' });
    }

    // Determine file extension from content type
    let ext = '.webm';
    if (contentType.includes('wav')) ext = '.wav';
    else if (contentType.includes('mp3') || contentType.includes('mpeg')) ext = '.mp3';
    else if (contentType.includes('ogg')) ext = '.ogg';
    else if (contentType.includes('mp4')) ext = '.mp4';

    // Write to temp file
    const tmpDir = path.join(os.tmpdir(), 'agents-manager-whisper');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `${randomUUID()}${ext}`);

    try {
      fs.writeFileSync(tmpFile, Buffer.from(data as ArrayBufferLike));

      const { nodewhisper } = await import('nodejs-whisper');
      await nodewhisper(tmpFile, {
        modelName: 'base.en',
        autoDownloadModelName: 'base.en',
        removeWavFileAfterTranscription: true,
        whisperOptions: {
          outputInText: true,
        },
      });

      // Read the generated .txt file
      // nodewhisper creates output alongside the wav file it converts to
      const baseName = path.basename(tmpFile, ext);
      const possibleOutputs = [
        path.join(tmpDir, `${baseName}.wav.txt`),
        path.join(tmpDir, `${baseName}.txt`),
      ];

      // Also check for files matching the pattern in tmpDir
      const dirFiles = fs.readdirSync(tmpDir);
      const txtFile = dirFiles.find((f) => f.startsWith(baseName) && f.endsWith('.txt'));

      let transcript = '';
      const outputPath = txtFile
        ? path.join(tmpDir, txtFile)
        : possibleOutputs.find((p) => fs.existsSync(p));

      if (outputPath && fs.existsSync(outputPath)) {
        transcript = fs.readFileSync(outputPath, 'utf-8').trim();
        fs.unlinkSync(outputPath); // cleanup
      }

      return { text: transcript };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error(`Transcription failed: ${message}`);
      return reply.code(500).send({ error: 'Transcription failed', details: message });
    } finally {
      // Cleanup temp files
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        // Clean up any wav conversion artifacts
        const dirFiles = fs.readdirSync(tmpDir);
        const baseName = path.basename(tmpFile, ext);
        for (const f of dirFiles) {
          if (f.startsWith(baseName)) {
            fs.unlinkSync(path.join(tmpDir, f));
          }
        }
      } catch { /* ignore cleanup errors */ }
    }
  });
}
