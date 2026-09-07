// Segmentacja SMS i normalizacja numerów. Bez zależności od środowiska — łatwe do testów.

// Alfabet GSM-7 (3GPP TS 23.038). Znaki spoza niego (w tym polskie ogonki) wymuszają UCS-2.
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = '^{}\\[~]|€';

export interface Segmentation {
  encoding: 'gsm7' | 'ucs2';
  parts: number;
  length: number;
}

/** Liczba części SMS wg realnego kodowania treści (SMSAPI nalicza po zawartości). */
export function segment(text: string): Segmentation {
  let units = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else {
      unicode = true;
      break;
    }
  }
  if (unicode) {
    const length = [...text].length;
    return { encoding: 'ucs2', parts: length <= 70 ? 1 : Math.ceil(length / 67), length };
  }
  return { encoding: 'gsm7', parts: units <= 160 ? 1 : Math.ceil(units / 153), length: units };
}

/**
 * Normalizuje numer do postaci E.164 bez plusa (tak przyjmuje SMSAPI), np. "48600100200".
 * Akceptuje: "+48 600 100 200", "600100200" (domyślnie PL), "0048600100200".
 * Zwraca null, gdy numer nie wygląda na poprawny.
 */
export function normalizeMsisdn(input: unknown, defaultCountry = '48'): string | null {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 9) digits = defaultCountry + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function formatE164(msisdn: string): string {
  return `+${msisdn}`;
}

/** Pole nadawcy: 1–11 znaków alfanumerycznych (wymóg SMSAPI dla nazw). */
export function validateSender(sender: unknown): string | null {
  if (typeof sender !== 'string') return null;
  const s = sender.trim();
  if (!/^[A-Za-z0-9 .\-_]{1,11}$/.test(s)) return null;
  return s;
}
