import { describe, it, expect } from 'vitest';
import { parseYesNo } from '@/lib/voice/parse-yes-no';

describe('parseYesNo', () => {
  it.each([
    ['yes', true],
    ['Yes.', true],
    ['yeah', true],
    ['yep', true],
    ['ja', true],
    ['ja!', true],
    ['no', false],
    ['nope', false],
    ['No way', false],
    ['nee', false],
    ['', null],
    ['maybe', null],
    ['what', null],
  ])('parses %j as %j', (input, expected) => {
    expect(parseYesNo(input)).toBe(expected);
  });
});
