import { useState, useRef, useCallback } from 'react';

type WhisperStatus = 'idle' | 'recording' | 'transcribing';

export function useWhisper() {
  const [status, setStatus] = useState<WhisperStatus>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setStatus('recording');
  }, []);

  const stopAndTranscribe = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state !== 'recording') {
        resolve('');
        return;
      }

      mediaRecorder.onstop = async () => {
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        setStatus('transcribing');

        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'audio/webm' },
            body: blob,
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.details || err.error || 'Transcription failed');
          }

          const { text } = await res.json();
          setStatus('idle');
          resolve(text || '');
        } catch (err) {
          setStatus('idle');
          reject(err);
        }
      };

      mediaRecorder.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      mediaRecorder.stop();
    }
    chunksRef.current = [];
    setStatus('idle');
  }, []);

  return {
    status,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
    isRecording: status === 'recording',
    isTranscribing: status === 'transcribing',
  };
}
