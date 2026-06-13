'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  /** Markdown source — either the deterministic FALLBACK or the Ollama-UPGRADED guidance. */
  content: string;
};

/**
 * Replace the LaTeX arrow macros the LLM occasionally emits (e.g. `$\rightarrow$`)
 * with their unicode equivalents. We deliberately do NOT add KaTeX/rehype here:
 * the only LaTeX seen in guidance is these directional arrows, so a tiny string
 * swap keeps them readable without pulling in a math renderer or raw-HTML risk.
 */
function normalizeLatexArrows(content: string): string {
  return content
    .replace(/\$\s*\\rightarrow\s*\$/g, '→')
    .replace(/\$\s*\\to\s*\$/g, '→')
    .replace(/\$\s*\\leftarrow\s*\$/g, '←');
}

/**
 * Renders AI guidance markdown (headings, bold, GFM tables) inside the brief's
 * violet card. remark-gfm enables the `| 카테고리 | 지표명 | … |` tables in the
 * guidance; rehype-raw is intentionally omitted so any literal HTML in the
 * LLM/template output stays inert (XSS-safe). The `.guidance-prose` wrapper
 * (see globals.css) supplies legible heading/table/spacing styles.
 */
export function GuidanceMarkdown({ content }: Props) {
  return (
    <div className="guidance-prose text-violet-12">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {normalizeLatexArrows(content)}
      </ReactMarkdown>
    </div>
  );
}
