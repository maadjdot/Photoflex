import { deflateSync } from "node:zlib";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(kind: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(kind), data]);
  const length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Transparent left third, half-transparent middle, opaque right. APNG poster differs from frame zero. */
export function photoPng(width = 96, height = 64, animated = false): Uint8Array<ArrayBuffer> {
  const pixels = (color: readonly number[]) => {
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      raw[offset] = color[0]; raw[offset + 1] = color[1]; raw[offset + 2] = color[2];
      raw[offset + 3] = x < width / 3 ? 0 : x < width * 2 / 3 ? 128 : 255;
    }
    return deflateSync(raw);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const chunks = [chunk("IHDR", header)];
  if (animated) {
    const animation = Buffer.alloc(8); animation.writeUInt32BE(2);
    chunks.push(chunk("acTL", animation), chunk("IDAT", pixels([0, 0, 255])));
    for (const [index, color] of [[255, 0, 0], [0, 255, 0]].entries()) {
      const control = Buffer.alloc(26);
      control.writeUInt32BE(index * 2); control.writeUInt32BE(width, 4); control.writeUInt32BE(height, 8);
      control.writeUInt16BE(1, 20); control.writeUInt16BE(10, 22);
      const sequence = Buffer.alloc(4); sequence.writeUInt32BE(index * 2 + 1);
      chunks.push(chunk("fcTL", control), chunk("fdAT", Buffer.concat([sequence, pixels(color)])));
    }
  } else chunks.push(chunk("IDAT", pixels([255, 0, 0])));
  chunks.push(chunk("IEND", new Uint8Array()));
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]));
}
