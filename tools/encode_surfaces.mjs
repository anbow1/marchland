// Compresses the scanned surfaces (src/assets/photo/<id>/{color,normal,orm}.jpg) to KTX2 (Basis Universal)
// for the GPU: public/surfaces/<id>_<map>.ktx2, mipmaps included, each checked against its source by PSNR.
// After anbow1/mediveal-village's tools/assets/encode_surfaces.mjs.
//
// The encoder and image decoder are not dependencies of the game; install them once anywhere:
//   mkdir /tmp/ktx2-tools && cd /tmp/ktx2-tools && npm i ktx2-encoder sharp
//   KTX2_TOOLS=/tmp/ktx2-tools/node_modules node tools/encode_surfaces.mjs [--bench <id>] [--mode uastc|etc1s (all maps)]
//
// Rows are stored bottom first (v = 0 at the bottom), as the JPG layers were (createImageBitmap with flipY).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modules = process.env.KTX2_TOOLS ?? '/tmp/ktx2-tools/node_modules';
const req = createRequire(join(modules, 'noop.js'));
const sharp = (await import(pathToFileURL(req.resolve('sharp')).href)).default;
const { encodeToKTX2 } = await import(pathToFileURL(join(modules, 'ktx2-encoder/dist/node/index.js')).href);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const photo = join(root, 'src/assets/photo');
const out = join(root, 'public/surfaces');
const basisDir = join(root, 'node_modules/three/examples/jsm/libs/basis');

// The transcoder the game itself uses, to measure what the GPU will get back.
const basis = await new Function('require', '__dirname', `${readFileSync(join(basisDir, 'basis_transcoder.js'), 'utf8')}; return BASIS;`)(createRequire(import.meta.url), basisDir)({
  wasmBinary: readFileSync(join(basisDir, 'basis_transcoder.wasm')),
});
basis.initializeBasis();

function psnr(ktx2, rgba) {
  const file = new basis.KTX2File(ktx2);
  file.startTranscoding();
  const RGBA32 = 13;
  const dst = new Uint8Array(file.getImageTranscodedSizeInBytes(0, 0, 0, RGBA32));
  file.transcodeImage(dst, 0, 0, 0, RGBA32, 0, -1, -1);
  file.close();
  file.delete();
  let se = 0;
  for (let i = 0; i < rgba.length; i += 4) for (let c = 0; c < 3; c++) se += (dst[i + c] - rgba[i + c]) ** 2;
  const mse = se / ((rgba.length / 4) * 3);
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

/** Colour and ORM in ETC1S (small, ~34 dB), normals in UASTC (ETC1S bends them: 26 dB against 34). */
const MODE = { color: 'etc1s', normal: 'uastc', orm: 'etc1s' };

async function encode(path, map, mode = MODE[map]) {
  const { data, info } = await sharp(path).flip().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const srgb = map === 'color';
  const ktx2 = await encodeToKTX2(new Uint8Array(1), {
    isUASTC: mode === 'uastc',
    ...(mode === 'etc1s'
      ? { qualityLevel: Number(process.env.Q ?? 255), compressionLevel: 3 }
      : { uastcLDRQualityLevel: 2, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1 }),
    generateMipmap: true,
    isPerceptual: srgb,
    isSetKTX2SRGBTransferFunc: srgb,
    isNormalMap: map === 'normal',
    imageDecoder: async () => ({ data: rgba, width: info.width, height: info.height }),
  });
  return { ktx2, db: psnr(ktx2, rgba), size: info.width };
}

const args = process.argv.slice(2);
const bench = args.includes('--bench') ? args[args.indexOf('--bench') + 1] : null;
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : undefined;
const ids = bench ? [bench] : readdirSync(photo).filter((d) => !d.includes('.')).sort();
if (!bench) mkdirSync(out, { recursive: true });
let jpg = 0;
let total = 0;
for (const id of ids) {
  const row = [];
  for (const map of ['color', 'normal', 'orm']) {
    const src = join(photo, id, `${map}.jpg`);
    jpg += readFileSync(src).length;
    const r = await encode(src, map, mode);
    total += r.ktx2.length;
    if (!bench) writeFileSync(join(out, `${id}_${map}.ktx2`), r.ktx2);
    row.push(`${map} ${(r.ktx2.length / 1024).toFixed(0)} KiB ${r.db.toFixed(1)} dB`);
  }
  console.log(`${id.padEnd(13)} ${row.join(' · ')}`);
}
console.log(`${ids.length} surfaces (${mode ?? 'colour/orm ETC1S, normal UASTC'}): JPG ${(jpg / 1048576).toFixed(1)} MB -> KTX2 ${(total / 1048576).toFixed(1)} MB`);
