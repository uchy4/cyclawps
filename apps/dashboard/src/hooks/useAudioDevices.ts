import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cyclawps:selectedMicId';

export function useAudioDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );

  const enumerate = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = all.filter((d) => d.kind === 'audioinput');
      setDevices(audioInputs);

      // If persisted device no longer exists, reset to default
      const persisted = localStorage.getItem(STORAGE_KEY);
      if (persisted && !audioInputs.some((d) => d.deviceId === persisted)) {
        localStorage.removeItem(STORAGE_KEY);
        setSelectedDeviceIdState(null);
      }
    } catch (err) {
      console.error('Failed to enumerate audio devices:', err);
    }
  }, []);

  useEffect(() => {
    enumerate();
    navigator.mediaDevices.addEventListener('devicechange', enumerate);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerate);
  }, [enumerate]);

  const setSelectedDeviceId = useCallback((id: string | null) => {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setSelectedDeviceIdState(id);
  }, []);

  return { devices, selectedDeviceId, setSelectedDeviceId };
}
