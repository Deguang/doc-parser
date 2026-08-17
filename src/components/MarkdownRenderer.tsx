import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Configure marked with GitHub Flavored Markdown (GFM)
marked.setOptions({
  gfm: true,
  breaks: true,
});

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const html = useMemo(() => {
    if (!content || !content.trim()) {
      return '<p class="text-on-surface-variant italic">*(No content)*</p>';
    }
    try {
      return marked.parse(content) as string;
    } catch (err) {
      console.error('Markdown parse error:', err);
      return `<pre class="whitespace-pre-wrap font-mono text-xs text-error">${content}</pre>`;
    }
  }, [content]);

  return (
    <div
      className={`markdown-body prose prose-invert max-w-none text-on-surface leading-relaxed text-sm font-body-rt ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
