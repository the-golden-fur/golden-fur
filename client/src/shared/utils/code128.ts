/**
 * Code 128 symbol patterns, indexed by symbol value. Each is the widths (in
 * modules) of its alternating bars and spaces, starting with a bar: six
 * widths summing to 11 for every symbol except Stop (106), which has seven
 * summing to 13.
 */
export const CODE128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
] as const;

const START_B = 104;
const STOP = 106;

/**
 * Encodes text as a Code 128 barcode (code set B: printable ASCII), for
 * drawing as plain rectangles - no barcode library needed for the one short
 * reference a receipt carries.
 *
 * Returns the module widths of the whole symbol, alternating bar / space and
 * starting with a bar, without quiet zones. Returns null for an empty value
 * or one with a character outside ASCII 32-126.
 */
export function encodeCode128(value: string): number[] | null {
  if (!/^[\x20-\x7e]+$/.test(value)) return null;

  const symbols = [START_B];
  let checksum = START_B;

  for (let index = 0; index < value.length; index += 1) {
    const symbol = value.charCodeAt(index) - 32;
    symbols.push(symbol);
    checksum += symbol * (index + 1);
  }

  symbols.push(checksum % 103, STOP);

  return symbols.flatMap((symbol) =>
    Array.from(CODE128_PATTERNS[symbol], Number)
  );
}
