import { useState, useRef, useCallback, useEffect } from 'react';

type WhisperStatus = 'idle' | 'recording' | 'transcribing';

const BAR_COUNT = 10;
const POLL_INTERVAL_MS = 120; // push a new bar roughly 8× per second

export function useWhisper(deviceId?: string | null) {
  const [status, setStatus] = useState<WhisperStatus>('idle');
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastPushRef = useRef<number>(0);

  const pollLevels = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const now = performance.now();
    if (now - lastPushRef.current >= POLL_INTERVAL_MS) {
      lastPushRef.current = now;

      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);

      // Compute overall RMS volume (0..1)
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const vol = sum / data.length / 255;

      // Push new volume on the right, shift everything left
      setLevels((prev) => [...prev.slice(1), vol]);
    }

    rafRef.current = requestAnimationFrame(pollLevels);
  }, []);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    chunksRef.current = [];

    // Set up Web Audio analyser
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setStatus('recording');

    // Start polling
    rafRef.current = requestAnimationFrame(pollLevels);
  }, [deviceId, pollLevels]);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    analyserRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setLevels(new Array(BAR_COUNT).fill(0));
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
        cleanup();
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
  }, [cleanup]);

  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stream.getTracks().forEach((t) => t.stop());
      mediaRecorder.stop();
    }
    chunksRef.current = [];
    cleanup();
    setStatus('idle');
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  return {
    status,
    levels,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
    isRecording: status === 'recording',
    isTranscribing: status === 'transcribing',
  };
}
