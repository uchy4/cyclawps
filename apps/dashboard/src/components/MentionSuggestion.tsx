import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { ROLE_COLORS, formatRoleName } from '@app/shared';

// ─── Agent Suggestion ───────────────────────────────────────

interface AgentItem {
  role: string;
  name: string;
  displayName: string | null;
  accentColor: string | null;
}

export function AgentSuggestionList({
  items,
  command,
}: {
  items: AgentItem[];
  command: (item: { id: string; label: string }) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i >= items.length - 1 ? 0 : i + 1));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (items[selectedIndex]) {
          const agent = items[selectedIndex];
          command({ id: agent.role, label: (agent.displayName || agent.name).replace(/\s+/g, '_') });
        }
        return true;
      }
      return false;
    },
    [items, selectedIndex, command]
  );

  // Expose onKeyDown via ref for the suggestion plugin
  const ref = useRef<{ onKeyDown: (e: KeyboardEvent) => boolean }>({ onKeyDown });
  ref.current.onKeyDown = onKeyDown;
  (AgentSuggestionList as unknown as Record<string, unknown>)._keyDownRef = ref;

  if (items.length === 0) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg py-1 shadow-lg max-h-48 overflow-y-auto min-w-[180px]">
      {items.map((agent, i) => {
        const color = agent.accentColor || ROLE_COLORS[agent.role] || '#8b949e';
        return (
          <button
            key={agent.role}
            onClick={() => command({ id: agent.role, label: (agent.displayName || agent.name).replace(/\s+/g, '_') })}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer transition-colors ${
              i === selectedIndex ? 'bg-slate-700' : 'hover:bg-slate-700/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="font-mono text-xs" style={{ color }}>
              @{(agent.displayName || agent.name).replace(/\s+/g, '_')}
            </span>
            <span className="text-slate-500">{agent.role}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Task Suggestion ────────────────────────────────────────

interface TaskItem {
  id: string;
  guid: string;
  title: string;
}

export function TaskSuggestionList({
  items,
  command,
}: {
  items: TaskItem[];
  command: (item: { id: string; label: string }) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i >= items.length - 1 ? 0 : i + 1));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (items[selectedIndex]) {
          const task = items[selectedIndex];
          command({ id: task.id, label: task.guid });
        }
        return true;
      }
      return false;
    },
    [items, selectedIndex, command]
  );

  const ref = useRef<{ onKeyDown: (e: KeyboardEvent) => boolean }>({ onKeyDown });
  ref.current.onKeyDown = onKeyDown;
  (TaskSuggestionList as unknown as Record<string, unknown>)._keyDownRef = ref;

  if (items.length === 0) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg py-1 shadow-lg max-h-48 overflow-y-auto min-w-[220px]">
      {items.map((task, i) => (
        <button
          key={task.id}
          onClick={() => command({ id: task.id, label: task.guid })}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer transition-colors ${
            i === selectedIndex ? 'bg-slate-700' : 'hover:bg-slate-700/50'
          }`}
        >
          <span className="text-orange-400 font-mono text-xs">#{task.guid}</span>
          <span className="text-slate-400 truncate">{task.title}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Suggestion Renderer Factory ────────────────────────────

export function createSuggestionRenderer(
  Component: typeof AgentSuggestionList | typeof TaskSuggestionList,
  onOpenChange?: (open: boolean) => void
) {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof import('react-dom/client').createRoot> | null = null;
  let keyDownHandler: ((e: KeyboardEvent) => boolean) | null = null;

  return {
    onStart: (props: SuggestionProps) => {
      onOpenChange?.(true);
      container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.zIndex = '50';
      document.body.appendChild(container);
      updatePosition(props, container);
      renderComponent(props);
    },
    onUpdate: (props: SuggestionProps) => {
      if (container) updatePosition(props, container);
      renderComponent(props);
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') {
        cleanup();
        return true;
      }
      return keyDownHandler?.(props.event) || false;
    },
    onExit: () => {
      cleanup();
    },
  };

  function updatePosition(props: SuggestionProps, el: HTMLDivElement) {
    const rect = props.clientRect?.();
    if (!rect) return;
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top - 8}px`;
    el.style.transform = 'translateY(-100%)';
  }

  async function renderComponent(props: SuggestionProps) {
    if (!container) return;
    const { createRoot } = await import('react-dom/client');
    if (!root) {
      root = createRoot(container);
    }

    const Comp = Component as React.FC<{ items: unknown[]; command: (item: { id: string; label: string }) => void }>;

    // We need to capture the keydown handler from the component
    const wrappedCommand = (item: { id: string; label: string }) => {
      props.command(item);
    };

    root.render(
      <Comp items={props.items} command={wrappedCommand} />
    );

    // After render, grab the keydown ref
    requestAnimationFrame(() => {
      const ref = (Component as unknown as Record<string, unknown>)._keyDownRef as
        | React.RefObject<{ onKeyDown: (e: KeyboardEvent) => boolean }>
        | undefined;
      if (ref?.current) {
        keyDownHandler = ref.current.onKeyDown;
      }
    });
  }

  function cleanup() {
    onOpenChange?.(false);
    if (root) {
      root.unmount();
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
    keyDownHandler = null;
  }
}
