"""Downloads the scanned ground and building textures from Poly Haven (CC0) and
prepares them the way the game loads them: colour, normal (OpenGL convention)
and ORM (R = AO, G = roughness, B = metalness) as square JPEGs, with the real
size of one repeat in meta.json.

    python -I tools/fetch_textures.py            # 1024 px into src/assets/photo
    python -I tools/fetch_textures.py --size 512

Needs Pillow. The downloads are public-domain files; nothing here needs a key.
"""

import argparse
import io
import json
import pathlib
import urllib.request

from PIL import Image

# folder in the game -> Poly Haven asset id
SURFACES = {
    "meadow": "forrest_ground_01",
    "dry_grass": "leafy_grass",
    "dirt": "brown_mud_dry",
    "forest_floor": "forest_ground_04",
    "farm_soil": "farm_soil",
    "plaster": "medieval_wall_01",
    "beam": "dark_wooden_planks",
    "boards": "dark_planks",
    "thatch": "reed_roof_04",
    "tiles": "roof_09",
    "rubble": "castle_wall_slates",
    "ashlar": "rustic_stone_wall",
    "bark": "bark_brown_02",
    "leaves": "aerial_grass_rock",
}
MAPS = {"color": ("diff", 84), "normal": ("nor_gl", 90), "orm": ("arm", 82)}
BASE = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k"
API = "https://api.polyhaven.com/info"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "texture-fetch"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=1024, help="edge of the saved textures in pixels")
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent.parent / "src" / "assets" / "photo")
    args = parser.parse_args()
    if args.size <= 0 or args.size & (args.size - 1):
        raise SystemExit(f"--size '{args.size}' must be a power of two")
    for folder, asset in SURFACES.items():
        target = args.out / folder
        target.mkdir(parents=True, exist_ok=True)
        for name, (suffix, quality) in MAPS.items():
            image = Image.open(io.BytesIO(fetch(f"{BASE}/{asset}/{asset}_{suffix}_1k.jpg"))).convert("RGB")
            if image.width != image.height:
                raise SystemExit(f"{asset} {suffix} is {image.width}x{image.height}; expected a square")
            if image.width != args.size:
                image = image.resize((args.size, args.size), Image.LANCZOS)
            image.save(target / f"{name}.jpg", quality=quality, optimize=True)
        info = json.loads(fetch(f"{API}/{asset}"))
        # Poly Haven gives the scanned area in millimetres.
        dimensions = info.get("dimensions") or [2000, 2000]
        meta = {"source": f"https://polyhaven.com/a/{asset}", "size_m": round(dimensions[0] / 1000, 3)}
        (target / "meta.json").write_text(json.dumps(meta) + "\n")
        print(f"{folder}: {asset}, {meta['size_m']} m")


if __name__ == "__main__":
    main()
