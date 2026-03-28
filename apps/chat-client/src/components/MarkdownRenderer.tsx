import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';
import { common, createLowlight } from 'lowlight';
import { toHtml } from 'hast-util-to-html';
import { evaluateSync } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { useMDXComponents } from '@mdx-js/react';

const lowlight = createLowlight(common);

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
      title="Copy code"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function PreviewToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`transition-colors cursor-pointer ${active ? 'text-orange-400 hover:text-orange-300' : 'text-zinc-400 hover:text-zinc-200'}`}
      title={active ? 'Show source' : 'Preview markdown'}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>
  );
}

// Render MDX content synchronously, falling back to plain text on error
function MdxPreview({ source }: { source: string }) {
  const rendered = useMemo(() => {
    try {
      const { default: Content } = evaluateSync(source, {
        ...(runtime as Record<string, unknown>),
        remarkPlugins: [remarkGfm],
        useMDXComponents,
      });
      return <Content />;
    } catch {
      // If MDX compilation fails (invalid JSX, etc.), fall back to react-markdown
      return <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>;
    }
  }, [source]);

  return <>{rendered}</>;
}

// Wrapper component for markdown code blocks with preview toggle
function MarkdownCodeBlock({ codeString, lang }: { codeString: string; lang: string }) {
  const [previewing, setPreviewing] = useState(false);
  return (
    <div className="my-1.5 rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden text-sm">
      <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-700 bg-zinc-800/60">
        <span className="text-xs text-zinc-400 font-sans">{lang}</span>
        <div className="flex items-center gap-2">
          <PreviewToggle active={previewing} onClick={() => setPreviewing(!previewing)} />
          <CopyButton text={codeString} />
        </div>
      </div>
      {previewing ? (
        <div className="px-3 py-2 text-sm font-sans">
          <MdxPreview source={codeString} />
        </div>
      ) : (
        <code className="block px-3 py-2 whitespace-pre-wrap font-mono">{codeString}</code>
      )}
    </div>
  );
}

interface MarkdownRendererProps {
  content: string;
  /** Fallback color for mentions without a role color */
  mentionColor?: string;
  /** Map of role/name → hex color for per-agent mention coloring */
  roleColors?: Record<string, string>;
  /** When true, headings render inline (same size as body text). Useful for input overlays. */
  inlineHeadings?: boolean;
}

function preprocessMentions(text: string, defaultColor: string, roleColors?: Record<string, string>): string {
  // Replace @word mentions with styled spans (outside code blocks)
  // We split on code fences and inline code first to avoid coloring mentions inside code
  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Match fenced code block
    const fenceMatch = remaining.match(/^```[\s\S]*?```/);
    if (fenceMatch && remaining.indexOf(fenceMatch[0]) === 0) {
      parts.push(fenceMatch[0]);
      remaining = remaining.slice(fenceMatch[0].length);
      continue;
    }

    // Match inline code
    const inlineMatch = remaining.match(/^`[^`]+`/);
    if (inlineMatch && remaining.indexOf(inlineMatch[0]) === 0) {
      parts.push(inlineMatch[0]);
      remaining = remaining.slice(inlineMatch[0].length);
      continue;
    }

    // Find next code delimiter
    const nextFence = remaining.indexOf('```');
    const nextInline = remaining.indexOf('`');
    let nextCode = -1;
    if (nextFence > 0 && nextInline > 0) nextCode = Math.min(nextFence, nextInline);
    else if (nextFence > 0) nextCode = nextFence;
    else if (nextInline > 0) nextCode = nextInline;

    const plainEnd = nextCode > 0 ? nextCode : remaining.length;
    const plain = remaining.slice(0, plainEnd);

    // Color @mentions and #task references in plain text
    const withMentions = plain.replace(
      /@(\w+)/g,
      (_match, name: string) => {
        const color = roleColors?.[name] || roleColors?.[name.toLowerCase()] || defaultColor;
        return `<span style="color:${color};font-weight:600">@${name}</span>`;
      }
    );
    const withTasks = withMentions.replace(
      /#(TASK-\d+)/g,
      (_match, guid: string) => {
        return `<span style="color:#fb923c;font-weight:600">#${guid}</span>`;
      }
    );
    parts.push(withTasks);
    remaining = remaining.slice(plainEnd);
  }

  return parts.join('');
}

// Helper: recursively flatten React children into a plain string
function flattenChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (!children) return '';
  if (Array.isArray(children)) return children.map(flattenChildren).join('');
  if (typeof children === 'object' && 'props' in children) {
    return flattenChildren((children.props as { children?: React.ReactNode }).children);
  }
  return '';
}

// Helper: extract code string and language from a <pre>'s children (the <code> element)
function extractCodeInfo(children: React.ReactNode): { codeString: string; lang: string | null } {
  let lang: string | null = null;

  // react-markdown renders <pre><code className="language-X">...</code></pre>
  const child = Array.isArray(children) ? children[0] : children;
  if (child && typeof child === 'object' && 'props' in child) {
    const codeProps = child.props as { className?: string; children?: React.ReactNode };
    const langMatch = codeProps.className?.match(/language-(\w+)/);
    lang = langMatch ? langMatch[1] : null;
  }

  const codeString = flattenChildren(children).replace(/\n$/, '');
  return { codeString, lang };
}

const components: Components = {
  pre: ({ children, ...props }) => {
    const { codeString, lang } = extractCodeInfo(children);

    // Markdown code blocks show plain text by default with a preview toggle
    if (lang === 'markdown' || lang === 'md') {
      return <MarkdownCodeBlock codeString={codeString} lang={lang === 'md' ? 'markdown' : lang} />;
    }

    // Syntax-highlighted code blocks
    let highlighted: string | null = null;
    try {
      if (lang && lowlight.registered(lang)) {
        const tree = lowlight.highlight(lang, codeString);
        highlighted = toHtml(tree);
      }
    } catch {
      // Fall back to plain text
    }

    return (
      <pre className="my-1.5 rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden text-sm font-mono" {...props}>
        <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-700 bg-zinc-800/60">
          <span className="text-xs text-zinc-400">{lang || 'code'}</span>
          <CopyButton text={codeString} />
        </div>
        {highlighted ? (
          <code
            className="block px-3 py-2 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code className="block px-3 py-2 whitespace-pre-wrap">{codeString}</code>
        )}
      </pre>
    );
  },
  code: ({ children, className, ...props }) => {
    // If this code has a language class, it's block code being rendered inside our custom <pre>
    // Just pass through — the <pre> component handles everything
    if (className?.startsWith('language-')) {
      return <code className={className} {...props}>{children}</code>;
    }

    // Inline code
    return (
      <code
        className="rounded bg-zinc-700/80 px-1.5 py-0.5 text-sm font-mono text-orange-300"
        {...props}
      >
        {children}
      </code>
    );
  },
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-orange-400 underline hover:text-orange-300"
      {...props}
    >
      {children}
    </a>
  ),
  details: ({ children, ...props }) => (
    <details
      className="my-1.5 rounded-lg bg-zinc-900/50 border border-zinc-700 overflow-hidden"
      {...props}
    >
      {children}
    </details>
  ),
  summary: ({ children, ...props }) => (
    <summary
      className="cursor-pointer px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-orange-400"
      {...props}
    >
      {children}
    </summary>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc ml-4 my-1" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal ml-4 my-1" {...props}>{children}</ol>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-orange-500/50 pl-3 my-1 text-zinc-400 italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  p: ({ children, ...props }) => (
    <p className="my-0.5" {...props}>{children}</p>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="text-lg font-bold my-1" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-base font-bold my-1" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-sm font-bold my-0.5" {...props}>{children}</h3>
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-1.5">
      <table className="text-sm border-collapse border border-zinc-700" {...props}>{children}</table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-zinc-700 px-2 py-1 text-left bg-zinc-800 font-medium" {...props}>{children}</th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-zinc-700 px-2 py-1" {...props}>{children}</td>
  ),
  hr: (props) => (
    <hr className="border-zinc-700 my-2" {...props} />
  ),
};

const inlineHeadingComponents: Partial<Components> = {
  h1: ({ children, ...props }) => <span {...props}># {children}</span>,
  h2: ({ children, ...props }) => <span {...props}>## {children}</span>,
  h3: ({ children, ...props }) => <span {...props}>### {children}</span>,
};

export function MarkdownRenderer({ content, mentionColor, roleColors, inlineHeadings }: MarkdownRendererProps) {
  const color = mentionColor || '#fb923c';
  const processed = preprocessMentions(content, color, roleColors);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={inlineHeadings ? { ...components, ...inlineHeadingComponents } : components}
    >
      {processed}
    </ReactMarkdown>
  );
}
