// Packs a glTF 2.0 (.gltf json + one .bin + texture files) into a single binary glTF (.glb).
// Pure function, no network, no file access, so it can be tested under plain Node.
import path from 'node:path';

const pad4 = (n) => (4 - (n % 4)) % 4;

/**
 * @param {object} gltf      parsed .gltf json
 * @param {Buffer} bin       contents of the single .bin buffer
 * @param {Map<string, Buffer>} textures  texture file name -> bytes
 * @returns {Buffer} the .glb file
 */
export function packGlb(gltf, bin, textures) {
  if (!Buffer.isBuffer(bin)) throw new Error('packGlb: the .bin buffer is missing');
  const json = JSON.parse(JSON.stringify(gltf));
  const chunks = [bin];
  let offset = bin.length;
  json.bufferViews = json.bufferViews || [];
  const viewOf = new Map();
  for (const img of json.images || []) {
    if (!img.uri) continue;
    const name = path.basename(decodeURIComponent(img.uri));
    const data = textures.get(name);
    if (!data) throw new Error('packGlb: missing texture ' + name);
    if (!viewOf.has(name)) {
      const before = pad4(offset);
      if (before) { chunks.push(Buffer.alloc(before)); offset += before; }
      json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
      viewOf.set(name, json.bufferViews.length - 1);
      chunks.push(data);
      offset += data.length;
    }
    img.bufferView = viewOf.get(name);
    img.mimeType = /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
    delete img.uri;
  }
  const after = pad4(offset);
  if (after) { chunks.push(Buffer.alloc(after)); offset += after; }
  json.buffers = [{ byteLength: offset }];
  const binChunk = Buffer.concat(chunks);
  let jsonText = JSON.stringify(json);
  jsonText += ' '.repeat(pad4(Buffer.byteLength(jsonText)));
  const jsonBuf = Buffer.from(jsonText);
  const total = 12 + 8 + jsonBuf.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonBuf.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binChunk.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4); // 'BIN\0'
  return Buffer.concat([header, jsonHead, jsonBuf, binHead, binChunk]);
}

/** Read a .glb back into {json, bin}. Used by the tests to check the packing. */
export function unpackGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
  if (buf.readUInt32LE(4) !== 2) throw new Error('glb version');
  if (buf.readUInt32LE(8) !== buf.length) throw new Error('glb length field does not match the file');
  let pos = 12, json = null, bin = null;
  while (pos < buf.length) {
    const len = buf.readUInt32LE(pos), type = buf.readUInt32LE(pos + 4);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (len % 4) throw new Error('chunk length is not 4 byte aligned');
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942) bin = body;
    pos += 8 + len;
  }
  return { json, bin };
}
