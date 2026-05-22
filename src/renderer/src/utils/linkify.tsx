import type { ReactNode } from 'react';

const URL_PATTERN = /https?:\/\/[^\s<>"',;]+/g;

function trimTrailing(url: string): string {
  return url.replace(/[.,;:!?)\]]+$/, '');
}

export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    if (match.index == null) continue;
    const url = trimTrailing(match[0]);
    const suffix = match[0].slice(url.length); // stripped trailing punctuation
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <a
        key={match.index}
        href={url}
        className="notes-link"
        onClick={(e) => { e.preventDefault(); window.open(url); }}
      >
        {url}
      </a>
    );
    last = match.index + match[0].length; // advance past full raw match
    if (suffix) nodes.push(suffix);       // re-insert stripped trailing chars
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
