import { useState, useEffect, useRef, useCallback } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isClosing, setIsClosing] = useState(false);
  const isElectron = typeof window !== 'undefined' && !!document.getElementById('electron-titlebar');

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else if (drawerRef.current) {
      setIsClosing(true);
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (!isClosing) {
      document.body.style.overflow = open ? 'hidden' : '';
    }
  }, [isClosing, open]);

  if (!open && !isClosing) return null;

  return (
    <div className={`fixed inset-x-0 bottom-0 ${isElectron ? 'top-[2.5rem]' : 'top-0'} z-50 flex justify-end`}>
      <div
        role="presentation"
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={`relative w-full max-w-2xl bg-slate-900 border-l border-slate-700 shadow-xl flex flex-col ${isClosing ? 'animate-slide-out' : 'animate-slide-in'}`}
        onAnimationEnd={() => {
          if (isClosing) setIsClosing(false);
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 id="drawer-title" className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
