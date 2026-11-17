// Gathers Marchland's ready assets into one folder and a zip, for starting another game from them:
//
//   node tools/pack-assets.mjs            → asset-pack-out/marchland-assets/ and marchland-assets.zip
//
// models/   every baked model and animation the game loads (public/soldiers, people, props, buildings)
// textures/ the scanned CC0 surfaces (src/assets/photo)
// loader/   a three.js module that puts each format on screen (asset-pack/loader)
// example/  one page with every asset, offline (three.js r186 copied into vendor/)
// tools/    the Blender scripts that made the models, to bake new ones the same way
// docs/     the playbook, the asset list and the Blender notes
// README.md, FORMATS.md, CREDITS.md (every author and licence; read before publishing anything)

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'asset-pack-out');
const out = join(outRoot, 'marchland-assets');
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copy = (from, to) => {
  const target = join(out, to);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(root, from), target, { recursive: true });
};

for (const dir of ['soldiers', 'people', 'props', 'buildings']) copy(`public/${dir}`, `models/${dir}`);
copy('src/assets/photo', 'textures');
copy('asset-pack/loader', 'loader');
copy('asset-pack/example', 'example');
copy('asset-pack/README.md', 'README.md');
copy('asset-pack/FORMATS.md', 'FORMATS.md');
for (const f of ['PLAYBOOK.md', 'ASSETS.md', 'BLENDER.md']) copy(`docs/${f}`, `docs/${f}`);
for (const f of readdirSync(join(root, 'tools/blender'))) if (f.endsWith('.py')) copy(`tools/blender/${f}`, `tools/blender/${f}`);
for (const f of [
  'build/three.webgpu.js',
  'build/three.tsl.js',
  'build/three.core.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js',
  'LICENSE',
]) copy(`node_modules/three/${f}`, `vendor/three/${f}`);

// Every credit in one file, with the licence notes that matter when the assets leave this project.
const credits = [
  '# Credits and licences',
  '',
  'Read before publishing a game made with these files. **CC0**: free, no credit needed. **CC BY 4.0**: free,',
  'commercial use too, but the author must be credited in the game (a credits screen) as written below.',
  '**Mixamo** (Adobe): the motion of the soldiers and townsfolk (and the Mixamo characters Erika Archer and',
  'Paladin J Nordstrom) is baked into these files. Adobe allows it in your own games, commercial ones',
  'included, but not passed on as an asset collection of its own: do not publish this pack, or its',
  'models folder, as a download for others; ship it only inside a game.',
  '',
];
for (const dir of ['soldiers', 'people', 'props', 'buildings']) {
  credits.push(`## models/${dir}`, '', readFileSync(join(root, `public/${dir}/CREDITS.md`), 'utf8').replace(/^# .*\n/, '').trim(), '');
}
credits.push('## textures', '', readFileSync(join(root, 'src/assets/photo/LICENSE.md'), 'utf8').replace(/^# .*\n/, '').trim(), '');
credits.push('## vendor/three', '', 'three.js r186, MIT licence (vendor/three/LICENSE).', '');
writeFileSync(join(out, 'CREDITS.md'), credits.join('\n'));

const size = (dir) => readdirSync(dir).reduce((s, f) => {
  const p = join(dir, f);
  return s + (statSync(p).isDirectory() ? size(p) : statSync(p).size);
}, 0);
execFileSync('zip', ['-qr9', 'marchland-assets.zip', 'marchland-assets'], { cwd: outRoot });
const zip = join(outRoot, 'marchland-assets.zip');
console.log(`pack: ${(size(out) / 1e6).toFixed(1)} MB in ${out}; zip ${(statSync(zip).size / 1e6).toFixed(1)} MB${existsSync(zip) ? '' : ' (missing)'}`);
