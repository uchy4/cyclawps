import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { initWhisper, type WhisperContext } from '@fugood/whisper.node';

const MODEL_PATH = path.resolve(__dirname, '../../../../models/ggml-small.en.bin');
const TMP_DIR = path.join(os.tmpdir(), 'cyclawps-whisper');

let whisperContext: WhisperContext | null = null;

async function getWhisperContext(): Promise<WhisperContext> {
  if (!whisperContext) {
    whisperContext = await initWhisper({ filePath: MODEL_PATH, useGpu: true });
  }
  return whisperContext;
}

function convertToWav(inputPath: string): string {
  const wavPath = inputPath.replace(/\.[^.]+$/, '.wav');
  execSync(
    `ffmpeg -nostats -loglevel error -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`,
  );
  return wavPath;
}

export function registerTranscribeRoutes(fastify: FastifyInstance): void {
  fastify.post('/api/transcribe', async (request, reply) => {
    const contentType = request.headers['content-type'] || '';

    const data = request.body as Buffer;
    if (!data || !(data instanceof Buffer || ArrayBuffer.isView(data))) {
      return reply.code(400).send({ error: 'No audio data received' });
    }

    let ext = '.webm';
    if (contentType.includes('wav')) ext = '.wav';
    else if (contentType.includes('mp3') || contentType.includes('mpeg')) ext = '.mp3';
    else if (contentType.includes('ogg')) ext = '.ogg';
    else if (contentType.includes('mp4')) ext = '.mp4';

    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    const tmpFile = path.join(TMP_DIR, `${randomUUID()}${ext}`);
    let wavFile: string | null = null;

    try {
      fs.writeFileSync(tmpFile, data);

      // Convert to 16kHz mono WAV for whisper
      wavFile = convertToWav(tmpFile);

      const ctx = await getWhisperContext();
      const { promise } = ctx.transcribeFile(wavFile, {
        language: 'en',
        temperature: 0.0,
      });

      const result = await promise;
      return { text: result.result.trim() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error(`Transcription failed: ${message}`);
      return reply.code(500).send({ error: 'Transcription failed', details: message });
    } finally {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        if (wavFile && fs.existsSync(wavFile)) fs.unlinkSync(wavFile);
      } catch { /* ignore cleanup errors */ }
    }
  });
}
