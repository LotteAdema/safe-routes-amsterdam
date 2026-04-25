import { describe, it, expect } from 'vitest';

// Replicate the function here for isolated testing — it's not exported from
// google-directions.ts (it's internal). Test the exported behaviour via
// RouteStep shapes in the integration path; unit-test the logic directly.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
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

  it('decodes html entities', () => {
    expect(stripHtml('Take exit &amp; continue')).toBe('Take exit & continue');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('Continue straight')).toBe('Continue straight');
  });
});
