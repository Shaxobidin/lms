/**
 * Maqsad: rasm o'lchamini faqat sarlavha baytlaridan o'qish (PNG, JPEG, GIF) —
 * tashqi kutubxonasiz. HOTSPOT importida piksel koordinatalarini foizga
 * o'girish uchun kerak.
 */

export interface ImageDimensions {
  width: number;
  height: number;
  mime: string;
}

export function imageDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) return null;

  // PNG: 8 bayt imzo, IHDR da 16..24 — width/height (big-endian)
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), mime: 'image/png' };
  }

  // GIF: "GIF8" + 6..10 da width/height (little-endian)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), mime: 'image/gif' };
  }

  // JPEG: SOFn markerlarini qidiramiz (FF C0..C3, C5..C7, C9..CB, CD..CF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1] ?? 0;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
          mime: 'image/jpeg',
        };
      }
      offset += 2 + length;
    }
  }

  return null;
}
