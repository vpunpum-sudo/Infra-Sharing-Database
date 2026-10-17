import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as nodeCrc32 } from 'node:zlib';
import { crc32, createZip } from './zip';

test('crc32 matches zlib', () => {
  const data = new TextEncoder().encode('ถนนบรม KMZ');
  assert.equal(crc32(data), nodeCrc32(data));
});

test('writes stored entries with doc.kml first and a valid central directory', () => {
  const kml = new TextEncoder().encode('<kml/>');
  const png = new Uint8Array([137, 80, 78, 71]);
  const zip = createZip([{ name: 'doc.kml', data: kml }, { name: 'files/a.png', data: png }]);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(new TextDecoder().decode(zip.slice(30, 37)), 'doc.kml');
  assert.deepEqual(zip.slice(37, 43), kml);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  const centralOffset = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(centralOffset, true), 0x02014b50);
  assert.equal(view.getUint32(centralOffset + 16, true), nodeCrc32(kml));
});
