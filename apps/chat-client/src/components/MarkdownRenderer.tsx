import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';

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

const components: Components = {
  pre: ({ children, ...props }) => (
    <pre
      className="my-1.5 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 overflow-x-auto text-sm font-mono"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ children, className, ...props }) => {
    const isBlock = className?.startsWith('language-') || false;
    if (isBlock) {
      return <code className={className} {...props}>{children}</code>;
    }
    // Check if parent is a <pre> — if so, render as block code
    return (
      <code
        className="rounded bg-slate-700/80 px-1.5 py-0.5 text-sm font-mono text-orange-300"
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
      className="my-1.5 rounded-lg bg-slate-900/50 border border-slate-700 overflow-hidden"
      {...props}
    >
      {children}
    </details>
  ),
  summary: ({ children, ...props }) => (
    <summary
      className="cursor-pointer px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-orange-400"
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
      className="border-l-2 border-orange-500/50 pl-3 my-1 text-slate-400 italic"
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
      <table className="text-sm border-collapse border border-slate-700" {...props}>{children}</table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-slate-700 px-2 py-1 text-left bg-slate-800 font-medium" {...props}>{children}</th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-slate-700 px-2 py-1" {...props}>{children}</td>
  ),
  hr: (props) => (
    <hr className="border-slate-700 my-2" {...props} />
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
