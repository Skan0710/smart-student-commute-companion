import React from 'react';

/**
 * Parses inline formatting:
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_
 * - Code: `code`
 * - Links: [label](url)
 * Also strips accidental stray asterisks left by LLMs.
 */
export function formatInlineText(text) {
  if (!text) return null;

  // First replace unclosed or orphan asterisks if any
  let clean = String(text);

  // Split tokens by regex capturing code, bold, italic, and links
  const tokenRegex = /(`[^`]+`|\*\*[^*]+?\*\*|__[^_]+?__|(?<!\*)\*[^*]+?\*(?!\*)|\[[^\]]+?\]\([^)]+?\))/g;
  const parts = clean.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;

    // Code: `example`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[12px] font-mono text-blue-600 dark:text-blue-400 border border-slate-200/80 dark:border-slate-700/80 break-all"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold: **example** or __example__
    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <strong key={i} className="font-bold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic: *example*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={i} className="italic text-slate-800 dark:text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Markdown link: [Title](https://...)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 font-semibold underline hover:text-blue-700"
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Plain text: clean any stray asterisk bullets inside plain segments
    const cleanSegment = part.replace(/(^|\s)\*(?!\*)/g, '$1•');
    return <span key={i}>{cleanSegment}</span>;
  });
}

/**
 * AiFormattedText
 * Transforms raw LLM answers into beautifully spaced, readable typography:
 * - Replaces raw * with bold headers and clean bullet indicators
 * - Spaces paragraphs and bullet lists with generous padding
 * - Groups list items into readable blocks
 */
export default function AiFormattedText({ text, className = '' }) {
  if (!text) return null;

  const rawLines = String(text).split('\n');

  return (
    <div className={`space-y-3.5 leading-relaxed text-slate-800 dark:text-slate-200 ${className}`}>
      {rawLines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Section Headers: #, ##, ###, ####
        if (trimmed.startsWith('#')) {
          const headerText = trimmed.replace(/^#+\s*/, '');
          return (
            <div
              key={idx}
              className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white pt-3 pb-1 border-b border-slate-200/80 dark:border-slate-800 tracking-tight"
            >
              {formatInlineText(headerText)}
            </div>
          );
        }

        // Numbered list: 1. , 2. , 3.
        const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
        if (numMatch) {
          const num = numMatch[1];
          const rest = numMatch[2];
          return (
            <div key={idx} className="flex items-start gap-3 my-2 pl-1">
              <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-[11px] flex items-center justify-center mt-0.5 shadow-2xs">
                {num}
              </span>
              <div className="flex-1 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {formatInlineText(rest)}
              </div>
            </div>
          );
        }

        // Bullet points: •, -, *, +
        const bulletMatch = trimmed.match(/^([•\-\*\+])\s+(.*)$/);
        if (bulletMatch) {
          const rest = bulletMatch[2];
          return (
            <div key={idx} className="flex items-start gap-3 my-2 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 mt-2 shrink-0" />
              <div className="flex-1 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {formatInlineText(rest)}
              </div>
            </div>
          );
        }

        // Standard Paragraph
        return (
          <p key={idx} className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed my-1.5">
            {formatInlineText(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

