// Tool tests (not game logic): the glb packer used by tools/fetch-models.mjs.
// Run with npm run test:tools (tests/tools/run.mjs picks up every *.test.mjs). The game's rules are tested separately through src/core.
import { test, assert } from '../harness.mjs';
import { packGlb, unpackGlb } from '../../tools/glb.mjs';

const gltf = () => ({
  asset: { version: '2.0' },
  buffers: [{ uri: 'model.bin', byteLength: 10 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 10 }],
  images: [{ uri: 'tex_diff_1k.jpg' }, { uri: 'tex_nor_1k.jpg' }, { uri: 'tex_diff_1k.jpg' }],
  textures: [{ source: 0 }, { source: 1 }, { source: 2 }],
});

test('packs the bin and every texture into one aligned glb', () => {
  const bin = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // 10 bytes, not a multiple of 4
  const tex = new Map([['tex_diff_1k.jpg', Buffer.from('JPEGDIFFUSE!')], ['tex_nor_1k.jpg', Buffer.from('JPEGNORMAL')]]);
  const glb = packGlb(gltf(), bin, tex);
  const { json, bin: packed } = unpackGlb(glb);
  assert.equal(packed.length % 4, 0);
  assert.equal(json.buffers.length, 1);
  assert.equal(json.buffers[0].byteLength, packed.length);
  // the original bin is untouched at the start
  assert.deepEqual([...packed.subarray(0, 10)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const img of json.images) {
    assert.equal(img.uri, undefined);
    assert.equal(img.mimeType, 'image/jpeg');
    const v = json.bufferViews[img.bufferView];
    assert.equal(v.byteOffset % 4, 0, 'texture views start on a 4 byte boundary');
    assert.ok(v.byteOffset + v.byteLength <= packed.length);
  }
});

test('the bytes of each texture survive the round trip', () => {
  const bin = Buffer.alloc(8, 7);
  const a = Buffer.from('AAAAAAAAAAAAAAAAAAA'), b = Buffer.from('BBBBBBB');
  const glb = packGlb(gltf(), bin, new Map([['tex_diff_1k.jpg', a], ['tex_nor_1k.jpg', b]]));
  const { json, bin: packed } = unpackGlb(glb);
  const take = (img) => { const v = json.bufferViews[img.bufferView]; return packed.subarray(v.byteOffset, v.byteOffset + v.byteLength); };
  assert.equal(take(json.images[0]).toString(), a.toString());
  assert.equal(take(json.images[1]).toString(), b.toString());
});

test('an image listed twice is stored once', () => {
  const glb = packGlb(gltf(), Buffer.alloc(4), new Map([['tex_diff_1k.jpg', Buffer.from('xxxx')], ['tex_nor_1k.jpg', Buffer.from('yyyy')]]));
  const { json } = unpackGlb(glb);
  assert.equal(json.images[0].bufferView, json.images[2].bufferView);
  assert.equal(json.bufferViews.length, 3); // geometry view plus two textures
});

test('url encoded texture names and subfolders are resolved by file name', () => {
  const g = gltf();
  g.images = [{ uri: 'textures/my%20tex.png' }];
  const glb = packGlb(g, Buffer.alloc(4), new Map([['my tex.png', Buffer.from('PNG!')]]));
  const { json } = unpackGlb(glb);
  assert.equal(json.images[0].mimeType, 'image/png');
});

test('a missing texture or bin is an error, not a broken file', () => {
  assert.throws(() => packGlb(gltf(), Buffer.alloc(4), new Map()), /missing texture/);
  assert.throws(() => packGlb(gltf(), null, new Map()), /bin/);
});

test('the input gltf object is not modified', () => {
  const g = gltf();
  const before = JSON.stringify(g);
  packGlb(g, Buffer.alloc(4), new Map([['tex_diff_1k.jpg', Buffer.from('x')], ['tex_nor_1k.jpg', Buffer.from('y')]]));
  assert.equal(JSON.stringify(g), before);
});
