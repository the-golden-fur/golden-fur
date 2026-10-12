import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, encodeCode128 } from './code128';

describe('CODE128_PATTERNS', () => {
  it('has all 107 symbols, each a distinct pattern of the right width', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);

    CODE128_PATTERNS.forEach((pattern, symbol) => {
      const modules = Array.from(pattern, Number).reduce((a, b) => a + b, 0);
      // Stop is the one wider symbol - it ends on an extra bar.
      expect(modules).toBe(symbol === 106 ? 13 : 11);
    });
  });
});

describe('encodeCode128', () => {
  it('wraps the characters in Start B, a mod-103 checksum, and Stop', () => {
    // "A" is symbol 33: checksum (104 + 33 * 1) % 103 = 34.
    expect(encodeCode128('A')?.join('')).toBe(
      [
        CODE128_PATTERNS[104],
        CODE128_PATTERNS[33],
        CODE128_PATTERNS[34],
        CODE128_PATTERNS[106],
      ].join('')
    );
  });

  it('weights each character by its position in the checksum', () => {
    // "AB": (104 + 33 * 1 + 34 * 2) % 103 = 102.
    const widths = encodeCode128('AB');
    expect(widths?.slice(18, 24).join('')).toBe(CODE128_PATTERNS[102]);
  });

  it('gives different values different barcodes', () => {
    expect(encodeCode128('A1B2C3D4E5F6')).not.toEqual(
      encodeCode128('A1B2C3D4E5F7')
    );
  });

  it('returns null for an empty value or one it cannot encode', () => {
    expect(encodeCode128('')).toBeNull();
    expect(encodeCode128('niño')).toBeNull();
  });
});
