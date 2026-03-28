import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useState, useEffect, useRef } from 'react';

// Markdown preview components — styled for dark theme without relying on @tailwindcss/typography
const mdPreviewComponents: Components = {
  h1: ({ children, ...props }) => <h1 className="text-lg font-bold my-1 text-white" {...props}>{children}</h1>,
  h2: ({ children, ...props }) => <h2 className="text-base font-bold my-1 text-white" {...props}>{children}</h2>,
  h3: ({ children, ...props }) => <h3 className="text-sm font-semibold my-0.5 text-white" {...props}>{children}</h3>,
  p: ({ children, ...props }) => <p className="my-0.5 text-slate-200" {...props}>{children}</p>,
  ul: ({ children, ...props }) => <ul className="list-disc ml-4 my-1 text-slate-200" {...props}>{children}</ul>,
  ol: ({ children, ...props }) => <ol className="list-decimal ml-4 my-1 text-slate-200" {...props}>{children}</ol>,
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-2 border-orange-500/50 pl-3 my-1 text-slate-400 italic" {...props}>{children}</blockquote>
  ),
  code: ({ children, ...props }) => (
    <code className="rounded bg-slate-700/80 px-1.5 py-0.5 text-xs font-mono text-orange-300" {...props}>{children}</code>
  ),
  a: ({ children, href, ...props }) => (
    <a href={href} className="text-orange-400 underline hover:text-orange-300" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
  ),
  strong: ({ children, ...props }) => <strong className="font-bold text-white" {...props}>{children}</strong>,
  em: ({ children, ...props }) => <em className="italic" {...props}>{children}</em>,
  hr: (props) => <hr className="border-slate-700 my-2" {...props} />,
};

const LANGUAGES = [
  { value: '', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
];

// Map common aliases to their canonical language value
const LANGUAGE_ALIASES: Record<string, string> = {
  md: 'markdown',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
};

interface CodeBlockViewProps {
  node: {
    attrs: { language: string };
    textContent: string;
  };
  updateAttributes: (attrs: Record<string, unknown>) => void;
  extension: unknown;
}

export function CodeBlockView({ node, updateAttributes }: CodeBlockViewProps) {
  const rawLang = node.attrs.language || '';
  // Normalize aliases to canonical values on first render
  const normalized = LANGUAGE_ALIASES[rawLang] || rawLang;
  const didNormalize = useRef(false);

  useEffect(() => {
    if (normalized !== rawLang && !didNormalize.current) {
      didNormalize.current = true;
      updateAttributes({ language: normalized });
    }
  }, [normalized, rawLang, updateAttributes]);

  const language = normalized;
  const isMarkdown = language === 'markdown';
  const [showPreview, setShowPreview] = useState(isMarkdown);

  // Keep preview state synced with language selection
  useEffect(() => {
    setShowPreview(language === 'markdown');
  }, [language]);

  return (
    <NodeViewWrapper className="code-block-wrapper my-2">
      <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
        {/* Language selector bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700 bg-slate-800/60">
          <select
            contentEditable={false}
            value={language}
            onChange={(e) => {
              didNormalize.current = false;
              updateAttributes({ language: e.target.value });
            }}
            className="bg-slate-700 text-slate-300 text-xs rounded px-2 py-0.5 border border-slate-600 outline-none cursor-pointer hover:bg-slate-600 transition-colors"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
          {isMarkdown && (
            <button
              contentEditable={false}
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700 transition-colors"
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
          )}
        </div>

        {/* Code content or Markdown preview */}
        {isMarkdown && showPreview ? (
          <div contentEditable={false} className="px-3 py-2 text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdPreviewComponents}>
              {node.textContent || '*Empty*'}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="px-3 py-2 text-sm font-mono overflow-x-auto">
            <NodeViewContent as="code" />
          </pre>
        )}
      </div>
    </NodeViewWrapper>
  );
}
