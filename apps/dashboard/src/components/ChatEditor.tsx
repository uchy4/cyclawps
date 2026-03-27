import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { ROLE_COLORS } from '@app/shared';
import {
  AgentSuggestionList,
  TaskSuggestionList,
  createSuggestionRenderer,
} from './MentionSuggestion.js';

interface AgentInfo {
  role: string;
  name: string;
  displayName: string | null;
  accentColor: string | null;
}

interface TaskInfo {
  id: string;
  guid: string;
  title: string;
}

interface ChatEditorProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  agents: AgentInfo[];
  tasks: TaskInfo[];
  mentionColors: Record<string, string>;
  onTaskMentioned?: (task: { id: string; guid: string }) => void;
}

export interface ChatEditorHandle {
  insertText: (text: string) => void;
  focus: () => void;
  clear: () => void;
}

// Extract plain text from TipTap JSON, converting mention nodes back to @Name / #GUID
function jsonToPlainText(json: Record<string, unknown>): string {
  const parts: string[] = [];
  let isFirstParagraph = true;

  function walk(node: Record<string, unknown>) {
    if (node.type === 'text') {
      parts.push(node.text as string);
    } else if (node.type === 'agentMention') {
      const attrs = node.attrs as { label: string };
      parts.push(`@${attrs.label}`);
    } else if (node.type === 'taskMention') {
      const attrs = node.attrs as { label: string };
      parts.push(`#${attrs.label}`);
    } else if (node.type === 'paragraph') {
      if (!isFirstParagraph) parts.push('\n');
      isFirstParagraph = false;
      const content = node.content as Record<string, unknown>[] | undefined;
      if (content) content.forEach(walk);
    } else {
      const content = node.content as Record<string, unknown>[] | undefined;
      if (content) content.forEach(walk);
    }
  }

  walk(json);
  return parts.join('').trim();
}

// Create extension classes once at module level
const AgentMention = Mention.extend({ name: 'agentMention' });
const TaskMention = Mention.extend({ name: 'taskMention' });

export const ChatEditor = forwardRef<ChatEditorHandle, ChatEditorProps>(
  function ChatEditor({ onSubmit, disabled, placeholder, agents, tasks, mentionColors, onTaskMentioned }, ref) {
    // Use refs for callbacks so the editor doesn't need to be recreated when they change
    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;
    const onTaskMentionedRef = useRef(onTaskMentioned);
    onTaskMentionedRef.current = onTaskMentioned;
    const agentsRef = useRef(agents);
    agentsRef.current = agents;
    const tasksRef = useRef(tasks);
    tasksRef.current = tasks;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
        }),
        Placeholder.configure({ placeholder: placeholder || 'Type a message...' }),
        AgentMention.configure({
          HTMLAttributes: { class: 'mention-agent' },
          suggestion: {
            char: '@',
            items: ({ query }: { query: string }) => {
              return agentsRef.current
                .filter(
                  (a) =>
                    (a.displayName || a.name).toLowerCase().includes(query.toLowerCase()) ||
                    a.role.toLowerCase().includes(query.toLowerCase())
                )
                .slice(0, 10);
            },
            render: () => createSuggestionRenderer(AgentSuggestionList),
          },
          renderLabel: ({ node }: { node: { attrs: { label: string } } }) => `@${node.attrs.label}`,
        }),
        TaskMention.configure({
          HTMLAttributes: { class: 'mention-task' },
          suggestion: {
            char: '#',
            items: ({ query }: { query: string }) => {
              return tasksRef.current
                .filter(
                  (t) =>
                    t.guid.toLowerCase().includes(query.toLowerCase()) ||
                    t.title.toLowerCase().includes(query.toLowerCase())
                )
                .slice(0, 10);
            },
            render: () => createSuggestionRenderer(TaskSuggestionList),
          },
          renderLabel: ({ node }: { node: { attrs: { label: string } } }) => `#${node.attrs.label}`,
        }),
      ],
      editorProps: {
        attributes: {
          class: 'outline-none text-white text-base leading-6 min-h-[24px] max-h-[100px] overflow-y-auto w-full',
        },
        handleKeyDown: (view, event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const json = view.state.doc.toJSON();
            const text = jsonToPlainText(json);
            if (text) {
              onSubmitRef.current(text);
              // Clear after a tick so the editor processes the event first
              requestAnimationFrame(() => {
                view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
              });
            }
            return true;
          }
          return false;
        },
      },
      editable: !disabled,
      onTransaction: ({ transaction }) => {
        const cb = onTaskMentionedRef.current;
        if (!cb) return;
        for (const step of transaction.steps) {
          const stepJson = (step as unknown as { toJSON: () => Record<string, unknown> }).toJSON();
          const slice = stepJson.slice as { content?: Array<Record<string, unknown>> } | undefined;
          if (slice?.content) {
            for (const node of slice.content) {
              if (node.type === 'taskMention') {
                const attrs = node.attrs as { id?: string; label?: string } | undefined;
                if (attrs?.id && attrs?.label) {
                  cb({ id: attrs.id, guid: attrs.label });
                }
              }
              // Also check nested content (e.g. paragraph wrapping mention)
              const nested = node.content as Array<Record<string, unknown>> | undefined;
              if (nested) {
                for (const child of nested) {
                  if (child.type === 'taskMention') {
                    const attrs = child.attrs as { id?: string; label?: string } | undefined;
                    if (attrs?.id && attrs?.label) {
                      cb({ id: attrs.id, guid: attrs.label });
                    }
                  }
                }
              }
            }
          }
        }
      },
    });

    // Update editable state when disabled changes
    useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [editor, disabled]);

    // Update placeholder dynamically
    useEffect(() => {
      if (!editor) return;
      const placeholderExt = editor.extensionManager.extensions.find(
        (ext) => ext.name === 'placeholder'
      );
      if (placeholderExt) {
        placeholderExt.options.placeholder = placeholder || 'Type a message...';
        // Force re-render by dispatching an empty transaction
        const { tr } = editor.state;
        editor.view.dispatch(tr.setMeta('placeholder', true));
      }
      // Also update the DOM attribute directly for immediate visual feedback
      const el = editor.view.dom.querySelector('p.is-editor-empty');
      if (el) {
        el.setAttribute('data-placeholder', placeholder || 'Type a message...');
      }
    }, [editor, placeholder]);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      insertText: (text: string) => {
        editor?.commands.insertContent(text);
      },
      focus: () => {
        editor?.commands.focus();
      },
      clear: () => {
        editor?.commands.clearContent();
      },
    }), [editor]);

    // Inject dynamic CSS for mention node colors
    useEffect(() => {
      const styleId = 'chat-editor-mention-styles';
      let style = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
      }

      const agentRules = agents.map((a) => {
        const color = a.accentColor || ROLE_COLORS[a.role] || '#8b949e';
        return `.mention-agent[data-id="${a.role}"] { color: ${color}; font-weight: 600; }`;
      }).join('\n');

      style.textContent = `
        .mention-agent { color: #fb923c; font-weight: 600; }
        .mention-task { color: #fb923c; font-weight: 600; }
        ${agentRules}
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
        }
        .tiptap p { margin: 0; }
        .tiptap:focus { outline: none; }
        .tiptap, .tiptap > div, .ProseMirror { width: 100%; min-height: 24px; }
        /* Make EditorContent wrapper span full width */
        [data-node-view-wrapper], .ProseMirror-focused { width: 100%; }
      `;
    }, [agents]);

    return <EditorContent editor={editor} className="w-full cursor-text [&>.tiptap]:w-full [&>.tiptap]:min-h-[24px] [&>.tiptap]:cursor-text" />;
  }
);
