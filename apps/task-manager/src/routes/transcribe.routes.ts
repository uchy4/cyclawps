import type { FastifyInstance } from 'fastify';

const WHISPER_SERVICE_URL =
  process.env.WHISPER_SERVICE_URL || 'http://localhost:4002';

export function registerTranscribeRoutes(fastify: FastifyInstance): void {
  fastify.post('/api/transcribe', async (request, reply) => {
    const contentType = request.headers['content-type'] || 'audio/webm';
    const data = request.body as Buffer;

    if (!data || !(data instanceof Buffer || ArrayBuffer.isView(data))) {
      return reply.code(400).send({ error: 'No audio data received' });
    }

    try {
      const blob = new Blob([new Uint8Array(data)], { type: contentType });
      const form = new FormData();
      form.append('file', blob, 'audio.webm');

      const res = await fetch(`${WHISPER_SERVICE_URL}/transcribe`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const err = await res.text();
        fastify.log.error(`Whisper service error: ${res.status} ${err}`);
        return reply.code(502).send({ error: 'Transcription service error' });
      }

      const result = (await res.json()) as { text: string };
      return { text: result.text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error(`Transcription failed: ${message}`);
      return reply
        .code(502)
        .send({ error: 'Transcription service unavailable', details: message });
    }
  });
}
