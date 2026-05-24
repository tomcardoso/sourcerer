import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { linkifyText, safeOpen } from '../renderer/src/utils/linkify';

function isLink(node: unknown): node is ReactElement {
  return isValidElement(node) && (node as ReactElement).type === 'a';
}

function linkHref(node: unknown): string {
  return (node as ReactElement<{ href: string }>).props.href;
}

describe('linkifyText', () => {
  it('returns text unchanged when no URLs present', () => {
    const result = linkifyText('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Hello world');
  });

  it('returns empty array for empty string', () => {
    expect(linkifyText('')).toHaveLength(0);
  });

  it('wraps a bare URL in an anchor element', () => {
    const result = linkifyText('https://example.com');
    expect(result).toHaveLength(1);
    expect(isLink(result[0])).toBe(true);
    expect(linkHref(result[0])).toBe('https://example.com');
  });

  it('splits surrounding text around an inline URL', () => {
    const result = linkifyText('See https://example.com for details');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('See ');
    expect(isLink(result[1])).toBe(true);
    expect(result[2]).toBe(' for details');
  });

  it('preserves trailing period after a URL', () => {
    const result = linkifyText('See https://example.com. Next.');
    expect(result).toHaveLength(4);
    expect(isLink(result[1])).toBe(true);
    expect(linkHref(result[1])).toBe('https://example.com');
    expect(result[2]).toBe('.');
    expect(result[3]).toBe(' Next.');
  });

  it('preserves comma after a URL as part of trailing text', () => {
    // Comma stops the match; it lands in the trailing text node, not a suffix node
    const result = linkifyText('visit https://example.com, or call');
    expect(result).toHaveLength(3);
    expect(isLink(result[1])).toBe(true);
    expect(linkHref(result[1])).toBe('https://example.com');
    expect(result[2]).toBe(', or call');
  });

  it('treats adjacent comma-separated URLs as two separate links', () => {
    const result = linkifyText('https://a.com,https://b.com');
    const links = result.filter(isLink);
    expect(links).toHaveLength(2);
    expect(linkHref(links[0])).toBe('https://a.com');
    expect(result[1]).toBe(',');
    expect(linkHref(links[1])).toBe('https://b.com');
  });

  it('handles multiple URLs', () => {
    const result = linkifyText('https://a.com and https://b.com');
    expect(result).toHaveLength(3);
    expect(isLink(result[0])).toBe(true);
    expect(linkHref(result[0])).toBe('https://a.com');
    expect(result[1]).toBe(' and ');
    expect(isLink(result[2])).toBe(true);
    expect(linkHref(result[2])).toBe('https://b.com');
  });

  it('applies notes-link class to anchors', () => {
    const result = linkifyText('https://example.com');
    expect((result[0] as ReactElement<{ className: string }>).props.className).toBe('notes-link');
  });

  it('uses the URL as anchor text', () => {
    const result = linkifyText('https://example.com/path');
    expect((result[0] as ReactElement<{ children: string }>).props.children).toBe('https://example.com/path');
  });
});

describe('safeOpen', () => {
  let openMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openMock = vi.fn();
    vi.stubGlobal('window', { open: openMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens http URLs with _blank and noopener,noreferrer', () => {
    safeOpen('http://example.com');
    expect(openMock).toHaveBeenCalledWith('http://example.com', '_blank', 'noopener,noreferrer');
  });

  it('opens https URLs with _blank and noopener,noreferrer', () => {
    safeOpen('https://example.com/path?q=1');
    expect(openMock).toHaveBeenCalledWith('https://example.com/path?q=1', '_blank', 'noopener,noreferrer');
  });

  it('does not open non-http(s) URLs', () => {
    safeOpen('javascript:alert(1)');
    safeOpen('ftp://files.example.com');
    expect(openMock).not.toHaveBeenCalled();
  });

  it('does not open malformed URLs', () => {
    safeOpen('not a url at all');
    expect(openMock).not.toHaveBeenCalled();
  });
});
