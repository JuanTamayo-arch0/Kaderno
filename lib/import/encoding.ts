// Decodificación de archivos de texto sin depender de TextDecoder, que no está
// completo en todos los motores de React Native.
//
// Excel en Windows en español guarda CSV en Windows-1252 (Latin-1 con extras);
// Google Sheets y casi todo lo demás, en UTF-8. Se intenta UTF-8 estricto y si los
// bytes no son UTF-8 válido se lee como Windows-1252.

const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d,
  0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

/** Devuelve el texto si los bytes son UTF-8 válido, o null si no lo son. */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  let out = '';
  const chunk: number[] = [];
  const flush = () => {
    if (chunk.length) {
      out += String.fromCodePoint(...chunk);
      chunk.length = 0;
    }
  };
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b0 = bytes[i];
    let cp: number;
    if (b0 < 0x80) {
      cp = b0;
      i += 1;
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      if (i + 1 >= n) return null;
      const b1 = bytes[i + 1];
      if ((b1 & 0xc0) !== 0x80) return null;
      cp = ((b0 & 0x1f) << 6) | (b1 & 0x3f);
      i += 2;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      if (i + 2 >= n) return null;
      const b1 = bytes[i + 1], b2 = bytes[i + 2];
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80) return null;
      cp = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f);
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) return null;
      i += 3;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      if (i + 3 >= n) return null;
      const b1 = bytes[i + 1], b2 = bytes[i + 2], b3 = bytes[i + 3];
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) return null;
      cp = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      if (cp < 0x10000 || cp > 0x10ffff) return null;
      i += 4;
    } else {
      return null;
    }
    chunk.push(cp);
    if (chunk.length >= 4096) flush();
  }
  flush();
  return out;
}

export function decodeCp1252(bytes: Uint8Array): string {
  let out = '';
  const chunk: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    chunk.push(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b] ?? 0xfffd : b);
    if (chunk.length >= 4096) {
      out += String.fromCharCode(...chunk);
      chunk.length = 0;
    }
  }
  if (chunk.length) out += String.fromCharCode(...chunk);
  return out;
}

export function decodeText(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  let b = bytes;
  // BOM de UTF-8
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  const utf8 = decodeUtf8Strict(b);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };
  return { text: decodeCp1252(b), encoding: 'windows-1252' };
}

/** Texto a UTF-8, para exportar. */
export function encodeUtf8(text: string, withBom = false): Uint8Array {
  const bytes: number[] = withBom ? [0xef, 0xbb, 0xbf] : [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(bytes);
}
