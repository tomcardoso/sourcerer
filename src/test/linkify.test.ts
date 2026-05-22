import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { linkifyText } from '../renderer/src/utils/linkify';

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

  it('preserves trailing comma after a URL', () => {
    const result = linkifyText('visit https://example.com, or call');
    const link = result.find(isLink)!;
    const comma = result[result.indexOf(link) + 1];
    expect(linkHref(link)).toBe('https://example.com');
    expect(comma).toBe(',');
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
