/**
 * Encoding detection and decoding utilities.
 * Supports UTF-8 (with/without BOM) and Shift_JIS (CP932).
 */

/**
 * Detect encoding from an ArrayBuffer and decode to string.
 * Checks for UTF-8 BOM first, then uses heuristics for Shift_JIS detection.
 */
export function decodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // Check for UTF-8 BOM (EF BB BF)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer);
  }

  // Heuristic: Check for Shift_JIS patterns
  if (isLikelyShiftJIS(bytes)) {
    try {
      return new TextDecoder('shift_jis').decode(buffer);
    } catch {
      // Fall through to UTF-8
    }
  }

  // Default: UTF-8
  return new TextDecoder('utf-8').decode(buffer);
}

/**
 * Heuristic check for Shift_JIS encoding.
 * Looks for byte patterns typical of Shift_JIS double-byte characters.
 */
function isLikelyShiftJIS(bytes: Uint8Array): boolean {
  let shiftJISPairs = 0;
  let invalidUTF8 = 0;
  const limit = Math.min(bytes.length, 8192); // Check first 8KB

  for (let i = 0; i < limit; i++) {
    const b = bytes[i];

    // Shift_JIS lead bytes: 0x81-0x9F, 0xE0-0xFC
    if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)) {
      if (i + 1 < limit) {
        const b2 = bytes[i + 1];
        // Shift_JIS trail bytes: 0x40-0x7E, 0x80-0xFC
        if ((b2 >= 0x40 && b2 <= 0x7e) || (b2 >= 0x80 && b2 <= 0xfc)) {
          shiftJISPairs++;
          i++; // Skip trail byte
          continue;
        }
      }
    }

    // Check for bytes that are invalid in UTF-8 but valid in Shift_JIS context
    if (b >= 0x80 && b <= 0xff) {
      // Check if this could be a valid UTF-8 continuation
      if ((b & 0xc0) !== 0x80) {
        // Not a UTF-8 continuation byte but high-bit set
        // Check if it's a valid UTF-8 multi-byte start
        let expectedCont = 0;
        if ((b & 0xe0) === 0xc0) expectedCont = 1;
        else if ((b & 0xf0) === 0xe0) expectedCont = 2;
        else if ((b & 0xf8) === 0xf0) expectedCont = 3;
        else {
          invalidUTF8++;
          continue;
        }

        // Check continuation bytes
        let validUTF8 = true;
        for (let j = 1; j <= expectedCont && i + j < limit; j++) {
          if ((bytes[i + j] & 0xc0) !== 0x80) {
            validUTF8 = false;
            break;
          }
        }
        if (!validUTF8) {
          invalidUTF8++;
        }
      }
    }
  }

  // If we found Shift_JIS pairs and invalid UTF-8 sequences, likely Shift_JIS
  return shiftJISPairs > 0 && invalidUTF8 > 0;
}
