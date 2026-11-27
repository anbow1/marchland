// Marchland's service worker, written into dist/sw.js by the build (tools/pwa/plugin.ts), which fills in
// every file of the game and a revision of each. It keeps the whole game on the device for offline play.
// A new version installs into a cache of its own: files whose revision has not changed are copied over
// from the old cache, only the changed ones are downloaded. It takes over when every window of the old
// version is closed (the next start of the game), or at once when the page asks ('take-over').

const VERSION = 'c80bc3139989';
const FILES = {"assets/basis_transcoder-VXdx5NbI.wasm":"cdc7dfe89378","assets/basis_transcoder-o4Hde_L7.js":"25247a30572a","assets/index-BtsjNQn9.css":"0a0da22d1c0b","assets/index-CEK_brzZ.js":"50d88226ec58","buildings/CREDITS.md":"83a1be69c6ea","buildings/armourer_1.glb":"7e1501268419","buildings/armourer_2.glb":"daea6a78c0cf","buildings/armourer_3.glb":"3def3857bdde","buildings/bakery_1.glb":"1e6defd18f2b","buildings/bakery_2.glb":"632c0aef630a","buildings/bakery_3.glb":"1c1b142cbbb3","buildings/barracks_1.glb":"eef47a752a8c","buildings/barracks_2.glb":"256351bf6d68","buildings/barracks_3.glb":"d5573e9b2d7f","buildings/butcher_1.glb":"1094b6a284f0","buildings/butcher_2.glb":"70f02c949cc2","buildings/butcher_3.glb":"496ef3aca102","buildings/cathedral_1.glb":"bced40eed3aa","buildings/cathedral_2.glb":"a6a5c03da5bb","buildings/cathedral_3.glb":"ff13bd9f873a","buildings/farm_1.glb":"55b5e3f9fc2c","buildings/farm_2.glb":"b19012c3d353","buildings/farm_3.glb":"02f0dd6251f6","buildings/fisher_1.glb":"0ab56e16605e","buildings/fisher_2.glb":"abe4492f5281","buildings/fisher_3.glb":"046f82332a12","buildings/fletcher_1.glb":"e0582e321e70","buildings/fletcher_2.glb":"ebd5a3745a96","buildings/fletcher_3.glb":"30a2464cad43","buildings/fortress_1.glb":"302c9a336d5e","buildings/gate.glb":"581dbd8e49ac","buildings/house_1.glb":"3a229f100c15","buildings/house_2.glb":"6bd55fdcab67","buildings/house_3.glb":"f9617c20cef8","buildings/index.json":"ec29f32fcafe","buildings/ironMine_1.glb":"0d24252b1433","buildings/ironMine_2.glb":"9e410819ab91","buildings/ironMine_3.glb":"3ee3669a9de5","buildings/keep_1.glb":"6a43b63b0307","buildings/pigFarm_1.glb":"87c07b8a53ac","buildings/pigFarm_2.glb":"067b759dad57","buildings/pigFarm_3.glb":"2b6c90b3148e","buildings/quarry_1.glb":"c0e207f3baa6","buildings/quarry_2.glb":"086744f28cf0","buildings/quarry_3.glb":"49f06979f820","buildings/smelter_1.glb":"b83e972872ee","buildings/smelter_2.glb":"543a64f76c6d","buildings/smelter_3.glb":"755497a16d07","buildings/smithy_1.glb":"3003361e4706","buildings/smithy_2.glb":"238f801b30b0","buildings/smithy_3.glb":"37ff746586f6","buildings/stable_1.glb":"483b6877b121","buildings/stable_2.glb":"d20a346532f7","buildings/stable_3.glb":"b33743f4fc4c","buildings/tannery_1.glb":"b26e16a85fcb","buildings/tannery_2.glb":"49a60502b3aa","buildings/tannery_3.glb":"84bb35e804b8","buildings/tower_1.glb":"6fbe86bc342b","buildings/tower_2.glb":"5d991ab13fa5","buildings/tower_3.glb":"043b33503258","buildings/vineyard_1.glb":"a68598f218e3","buildings/vineyard_2.glb":"7dcc5dd575b6","buildings/vineyard_3.glb":"6d3879adb669","buildings/wall.glb":"fedf89abfae9","buildings/windmill_1.glb":"ea9910e51cd7","buildings/windmill_2.glb":"1ee1236212bf","buildings/windmill_3.glb":"109d6d022855","buildings/winery_1.glb":"0f9a4c1c0a09","buildings/winery_2.glb":"5c7ea6b22f69","buildings/winery_3.glb":"c0fdfa6df896","buildings/woodcutter_1.glb":"d85356d2018a","buildings/woodcutter_2.glb":"4750ec06aaa3","buildings/woodcutter_3.glb":"efc31ee7abff","icons/apple-touch-icon.png":"1b06135a071e","icons/favicon-32.png":"fb57d9c9d249","icons/icon-192.png":"c9ab19d1ebba","icons/icon-256.png":"93c79b979a97","icons/icon-512.png":"6eb1c12ad054","index.html":"db7e69364695","manifest.webmanifest":"40d1c64fd551","people/CREDITS.md":"5353cd9890e3","people/smith.json":"752d63e18b0f","people/townsman-beard.json":"9fbf0dc1f0ca","people/townsman-linen.json":"541e86df68ec","people/townsman-wool.json":"1f520555e117","people/townsman.json":"1aa8e03851e9","people/townswoman-dress.json":"e13f75874b77","people/townswoman-worker.json":"b7e0faab54d0","people/townswoman.json":"28187a3542a4","props/CREDITS.md":"7a1f876eb963","props/cannon.json":"f000320fbf94","props/culverin.json":"5c3cb34fec50","props/falconet.json":"12d5ea435982","props/fieldgun.json":"4bb60b93d88d","props/goods/arrows.json":"3507586000bc","props/goods/barrel.json":"823bf9b830b4","props/goods/bread.json":"caa0c352c015","props/goods/crate.json":"1dda25fe119b","props/goods/lumber.json":"7263c49bd504","props/goods/meat.json":"c4a07f2a507b","props/goods/sack.json":"80f923a52137","props/goods/stone.json":"fcfd87523ee1","props/handcart.json":"2c7e2c941057","props/horsegun.json":"03e34ac33f51","props/mortar.json":"605582f15212","props/pig.json":"8dc9200c02ab","props/wagon.json":"b01aa9771c07","soldiers/CREDITS.md":"7c74f331ef44","soldiers/archer.json":"e9a6bc178436","soldiers/artilleryman.json":"46d6358ae1c7","soldiers/crossbowman.json":"7c16e90cee98","soldiers/cuirassier_rider.json":"e41571e79ec3","soldiers/dragoon_rider.json":"cb71264bf66e","soldiers/halberdier.json":"91edfea19d7d","soldiers/horse.json":"9844fda144ac","soldiers/hussar_rider.json":"3ca21bd2dc7a","soldiers/knight.json":"afbac501f7a7","soldiers/knight_rider.json":"b79461b9caa0","soldiers/lineman.json":"1adbac7f6610","soldiers/militia.json":"989bc3804dee","soldiers/musketeer.json":"c867dcf423bc","soldiers/pikeman.json":"3b2fa70568da","soldiers/rider.json":"6e09f8eea160","soldiers/rifleman.json":"b1f6dbbe5013","soldiers/swordsman.json":"238298049463","soldiers/warhorse.json":"a43a9f459aac","sounds/CREDITS.md":"0787d863354c","sounds/impact_metal_light_000.mp3":"65a996501e07","sounds/impact_metal_light_001.mp3":"901e54ca630b","sounds/impact_metal_medium_000.mp3":"18f8dab965f1","sounds/impact_metal_medium_001.mp3":"71d354a48a21","sounds/impact_metal_medium_002.mp3":"5582b767e414","sounds/impact_mining_000.mp3":"3759df0093f7","sounds/impact_mining_001.mp3":"07cced8e3a1e","sounds/impact_mining_002.mp3":"b92854b9472f","sounds/impact_plate_heavy_000.mp3":"196c2fff9752","sounds/impact_plate_medium_000.mp3":"fef35c459bdb","sounds/impact_plate_medium_001.mp3":"b4172a169526","sounds/impact_punch_heavy_000.mp3":"e8d9b6701710","sounds/impact_punch_medium_000.mp3":"3cf3b752b96b","sounds/impact_punch_medium_001.mp3":"80387c8af520","sounds/impact_soft_heavy_000.mp3":"8ccb78b11702","sounds/impact_soft_heavy_001.mp3":"b2529c926737","sounds/impact_soft_medium_000.mp3":"ec1232f01b88","sounds/impact_soft_medium_001.mp3":"568628db19a9","sounds/rpg_chop.mp3":"2facb3ebae4b","sounds/rpg_knife_slice.mp3":"e85f4b616491","sounds/rpg_knife_slice_2.mp3":"d9de31007359","sounds/rpg_metal_click.mp3":"16df29c6b302","sounds/rpg_metal_latch.mp3":"dda73f05b8b9","surfaces/ashlar_color.ktx2":"bbb31181b90b","surfaces/ashlar_normal.ktx2":"e55f9c0f7ef5","surfaces/ashlar_orm.ktx2":"ea0d821aae87","surfaces/bark_color.ktx2":"1d5460249105","surfaces/bark_normal.ktx2":"547ab0b99714","surfaces/bark_orm.ktx2":"ec2fca8ad852","surfaces/beam_color.ktx2":"bcc0b05a8f27","surfaces/beam_normal.ktx2":"4d05b35aa29d","surfaces/beam_orm.ktx2":"6a356a7e0856","surfaces/boards_color.ktx2":"29c1cf4b5d71","surfaces/boards_normal.ktx2":"63b22740ef6f","surfaces/boards_orm.ktx2":"6c56a6d6cb54","surfaces/dirt_color.ktx2":"8dab32ee70da","surfaces/dirt_normal.ktx2":"fcd0df7ebc08","surfaces/dirt_orm.ktx2":"c73df2c4c18d","surfaces/dry_grass_color.ktx2":"43b5834a3f1e","surfaces/dry_grass_normal.ktx2":"a379329e771a","surfaces/dry_grass_orm.ktx2":"13c0acfe0d55","surfaces/farm_soil_color.ktx2":"7bf7b3d9e5f1","surfaces/farm_soil_normal.ktx2":"1f6572d69f3c","surfaces/farm_soil_orm.ktx2":"50b507ad728e","surfaces/forest_floor_color.ktx2":"15e4e681d1cd","surfaces/forest_floor_normal.ktx2":"fc0ba2ed986a","surfaces/forest_floor_orm.ktx2":"46cabaf3aae3","surfaces/leaves_color.ktx2":"e9995911ce4e","surfaces/leaves_normal.ktx2":"b6580f7fd09d","surfaces/leaves_orm.ktx2":"2dc508f8c6c3","surfaces/meadow_color.ktx2":"fbc84c92e7b6","surfaces/meadow_normal.ktx2":"dd5f42141efd","surfaces/meadow_orm.ktx2":"b08f0c0fb2a8","surfaces/mud_color.ktx2":"1df12e4dfde9","surfaces/mud_normal.ktx2":"7592a954966f","surfaces/mud_orm.ktx2":"e10a08fdffdc","surfaces/pasture_color.ktx2":"df884209f7c8","surfaces/pasture_normal.ktx2":"a1df98d54daf","surfaces/pasture_orm.ktx2":"caf90e1d7fa2","surfaces/plaster_color.ktx2":"ba13e18fc0d6","surfaces/plaster_normal.ktx2":"4baf47902b9c","surfaces/plaster_orm.ktx2":"a5c209b7c85c","surfaces/rock_color.ktx2":"c6c911534591","surfaces/rock_normal.ktx2":"737ff335f6d5","surfaces/rock_orm.ktx2":"9c1418878de3","surfaces/rubble_color.ktx2":"992e05d42a08","surfaces/rubble_normal.ktx2":"f712d46588f8","surfaces/rubble_orm.ktx2":"4b23c7731031","surfaces/shingles_color.ktx2":"dbd06f1046c1","surfaces/shingles_normal.ktx2":"c4f45865b046","surfaces/shingles_orm.ktx2":"74bc9c6818f1","surfaces/thatch_color.ktx2":"cbdcc93e2c77","surfaces/thatch_normal.ktx2":"e32fa337234b","surfaces/thatch_orm.ktx2":"df76e6ffbae1","surfaces/tiles_color.ktx2":"dc60b3ceed8b","surfaces/tiles_normal.ktx2":"6cca5678ecdc","surfaces/tiles_orm.ktx2":"961c827e202d"};
const CACHE = 'marchland-' + VERSION;
const REVISIONS = 'revisions.json';
const urlOf = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const older = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith('marchland-') || name === CACHE) continue;
        const old = await caches.open(name);
        const listed = await old.match(urlOf(REVISIONS));
        older.push({ cache: old, revisions: listed ? await listed.json() : {} });
      }
      const entries = Object.entries(FILES);
      let next = 0;
      const one = async () => {
        while (next < entries.length) {
          const [path, revision] = entries[next++];
          const url = urlOf(path);
          let response;
          for (const old of older) {
            if (old.revisions[path] !== revision) continue;
            response = await old.cache.match(url, { ignoreVary: true });
            if (response) break;
          }
          if (!response) {
            response = await fetch(url, { cache: 'reload' });
            if (!response.ok) throw new Error(`${path}: ${response.status}`);
          }
          await cache.put(url, response);
        }
      };
      // Six downloads at a time.
      await Promise.all(Array.from({ length: 6 }, one));
      await cache.put(urlOf(REVISIONS), new Response(JSON.stringify(FILES), { headers: { 'Content-Type': 'application/json' } }));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith('marchland-') && name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'take-over') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = request.mode === 'navigate' ? urlOf('index.html') : request;
      // Whatever the request's headers: a module script asks with an Origin the stored copy's Vary would refuse.
      const kept = await cache.match(key, { ignoreSearch: true, ignoreVary: true });
      return kept ?? fetch(request);
    })(),
  );
});
