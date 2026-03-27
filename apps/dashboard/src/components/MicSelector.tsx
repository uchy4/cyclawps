import { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronUp, Check } from 'lucide-react';

interface MicSelectorProps {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string | null) => void;
  disabled?: boolean;
}

function deviceLabel(device: MediaDeviceInfo, index: number): string {
  return device.label || `Microphone ${index + 1}`;
}

export function MicSelector({ devices, selectedDeviceId, onSelect, disabled }: MicSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click-outside or Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`flex items-center py-1 transition-colors ${
          disabled
            ? 'text-slate-600 cursor-default'
            : 'text-slate-400 hover:text-orange-400 cursor-pointer'
        }`}
        aria-label="Select microphone"
      >
        {open
          ? <ChevronUp className="w-3.5 h-3.5" />
          : <ChevronRight className="w-3.5 h-3.5" />
        }
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-64 bg-slate-800 border border-slate-700 rounded-lg py-1 shadow-lg z-50">
          <div className="px-3 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
            Microphone
          </div>

          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
              selectedDeviceId === null
                ? 'text-orange-400 bg-orange-600/10'
                : 'text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            <span className="w-4 shrink-0">
              {selectedDeviceId === null && <Check className="w-4 h-4" />}
            </span>
            System Default
          </button>

          {devices.map((device, i) => (
            <button
              key={device.deviceId}
              type="button"
              onClick={() => { onSelect(device.deviceId); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                selectedDeviceId === device.deviceId
                  ? 'text-orange-400 bg-orange-600/10'
                  : 'text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              <span className="w-4 shrink-0">
                {selectedDeviceId === device.deviceId && <Check className="w-4 h-4" />}
              </span>
              <span className="truncate">{deviceLabel(device, i)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
