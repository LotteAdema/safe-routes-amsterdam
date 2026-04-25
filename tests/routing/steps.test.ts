import { describe, it, expect } from 'vitest';

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

describe('stripHtml', () => {
  it('removes bold tags from Google instructions', () => {
    expect(stripHtml('Turn <b>left</b> onto Damrak')).toBe('Turn left onto Damrak');
  });

  it('removes nested tags', () => {
    expect(stripHtml('Head <div class="x"><b>north</b></div> on Rokin')).toBe(
      'Head north on Rokin',
    );
  });

  it('decodes &amp; entity', () => {
    expect(stripHtml('Take exit &amp; continue')).toBe('Take exit & continue');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('Continue straight')).toBe('Continue straight');
  });

  it('decodes &nbsp; entity', () => {
    expect(stripHtml('Turn&nbsp;right')).toBe('Turn right');
  });
});
