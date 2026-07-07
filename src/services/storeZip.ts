// ponytail: store-only zip, add fflate/jszip if resource packages get large

export interface StoreZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const textEncoder = new TextEncoder();

export function textToBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

// Store-only ZIP (compression method 0). All integer fields little-endian.
// Layout: [local header + data]* then [central dir header]* then EOCD.
export function createStoreZip(entries: StoreZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const nameBytes = textToBytes(entry.name);
    const data = entry.data;
    const checksum = crc32(data);
    const size = data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); // signature PK\x03\x04
    localView.setUint16(4, 20, true); // version needed 2.0
    localView.setUint16(6, 0x0800, true); // flag: UTF-8 filename (bit 11)
    localView.setUint16(8, 0, true); // method: store
    localView.setUint16(10, 0, true); // mod time
    localView.setUint16(12, 0x0021, true); // mod date 1980-01-01 (must not be 0)
    localView.setUint32(14, checksum, true); // CRC-32
    localView.setUint32(18, size, true); // compressed size == uncompressed
    localView.setUint32(22, size, true); // uncompressed size
    localView.setUint16(26, nameBytes.length, true); // filename length
    localView.setUint16(28, 0, true); // extra field length
    local.set(nameBytes, 30);

    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); // signature PK\x01\x02
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0x0800, true); // flag: UTF-8 (must match local)
    centralView.setUint16(10, 0, true); // method: store
    centralView.setUint16(12, 0, true); // mod time
    centralView.setUint16(14, 0x0021, true); // mod date
    centralView.setUint32(16, checksum, true); // CRC-32
    centralView.setUint32(20, size, true); // compressed size
    centralView.setUint32(24, size, true); // uncompressed size
    centralView.setUint16(28, nameBytes.length, true); // filename length
    centralView.setUint16(30, 0, true); // extra field length
    centralView.setUint16(32, 0, true); // comment length
    centralView.setUint16(34, 0, true); // disk number start
    centralView.setUint16(36, 0, true); // internal attributes
    centralView.setUint32(38, 0, true); // external attributes
    centralView.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);

    centralParts.push(central);
    centralSize += central.length;
    offset += local.length + data.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // signature PK\x05\x06
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true); // disk with central dir
  eocdView.setUint16(8, entries.length, true); // records on this disk
  eocdView.setUint16(10, entries.length, true); // total records
  eocdView.setUint32(12, centralSize, true); // central dir size
  eocdView.setUint32(16, offset, true); // central dir offset
  eocdView.setUint16(20, 0, true); // comment length

  const totalSize = offset + centralSize + eocd.length;
  const result = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  result.set(eocd, cursor);

  return result;
}

// Minimal self-check. Throws if the CRC32 implementation drifts.
export function assertStoreZipSelfCheck(): void {
  const check = crc32(textToBytes('123456789'));
  if (check !== 0xcbf43926) {
    throw new Error(`storeZip CRC32 self-check failed: got 0x${check.toString(16)}, expected 0xcbf43926`);
  }
}
