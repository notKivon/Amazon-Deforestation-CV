"""
128 px version of build_dataset.py (1.28 km tiles at 10 m) with borderline examples.

Same Sentinel-2 L2A SWIR composite (R=B11, G=B8A, B=B04), same 2025 dry-season scenes,
same NDMI 'cleared' rule and cloud/water masks. What changes:
  * tiles are 128 px, so each 20 km scene gives 16 x 16 = 256 tiles
  * labels use a majority rule instead of only keeping extreme tiles:
        forest      cleared fraction cf <= 0.30
        not_forest  cf >= 0.50
        (0.30 - 0.50 is skipped: no fair single label)
  * each class is filled from strata so the borderline is well represented:
        forest:     'pure'  cf <= 0.003      'edge' 0.003 < cf <= 0.30
        not_forest: 'edge'  0.50 <= cf < 0.75 'pure' cf >= 0.75
  * tiles listed in exclude_<mode>.json were removed after a visual check (green pasture /
    plantations that the NDMI rule wrongly counts as forest)

Usage:  python build_dataset_128.py [train|test] [out_dir]
  train -> the 11 original training regions
  test  -> the 10 original test regions + 9 hard-test regions (never used for training)
"""
import os, sys, json, random
import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter
import build_dataset as bd

MODE = sys.argv[1] if len(sys.argv) > 1 else "train"
OUT = sys.argv[2] if len(sys.argv) > 2 else f"dataset_128_{MODE}"
CHIP = 128
N = bd.SCENE_PX // CHIP
FOREST_MAX, NOTFOREST_MIN = 0.30, 0.50
Y20 = ("2020-06-01", "2020-08-31")

TRAIN_REGIONS = bd.REGIONS
TEST_REGIONS = [
    ("labrea_AM", -64.80, -7.26, bd.DRY_S), ("anapu_PA", -51.20, -3.47, bd.DRY_S),
    ("colniza_MT", -59.00, -9.40, bd.DRY_S), ("paragominas_PA", -47.35, -3.00, bd.DRY_S),
    ("porto_velho_RO", -63.60, -9.00, bd.DRY_S), ("serra_divisor_AC", -73.60, -7.40, bd.DRY_S),
    ("juruena_NP", -58.50, -8.80, bd.DRY_S), ("pico_neblina_AM", -66.00, 0.80, bd.DRY_N),
    ("terra_do_meio_PA", -53.80, -5.20, bd.DRY_S), ("abufari_AM", -63.00, -4.90, bd.DRY_S),
    ("humaita_AM", -63.02, -7.62, bd.DRY_S), ("machadinho_RO", -62.00, -9.40, bd.DRY_S),
    ("tailandia_PA", -48.95, -2.95, bd.DRY_S), ("itaituba_PA", -55.98, -4.95, bd.DRY_S),
    ("humaita_south_AM", -63.40, -8.05, bd.DRY_S), ("lavrado_RR", -60.80, 3.10, bd.DRY_N),
]
CFG = {
    "train": dict(regions=TRAIN_REGIONS, per_stratum=150, region_cap=30),
    "test":  dict(regions=TEST_REGIONS,  per_stratum=40,  region_cap=8),
}[MODE]

EXCLUDE = set()   # filled in after visual review; see exclude_<mode>.json
if os.path.exists(f"exclude_{MODE}.json"):
    EXCLUDE = set(json.load(open(f"exclude_{MODE}.json")))

def stratum(cf):
    if cf <= bd.NONDEF_MAX: return "forest", "pure"
    if cf <= FOREST_MAX:    return "forest", "edge"
    if cf < NOTFOREST_MIN:  return None, None
    if cf < 0.75:           return "not_forest", "edge"
    return "not_forest", "pure"

def main():
    random.seed(0)
    pools, stats = {}, {}
    for name, lon, lat, iv in CFG["regions"]:
        arr = bd.fetch(name, lon, lat, iv).astype(np.float32)
        b11, b8a, b04, scl = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
        ndmi = uniform_filter((b8a - b11) / np.maximum(b8a + b11, 1), size=5)
        cloud = np.isin(scl, [3, 8, 9, 10]) | (scl == 0)
        water = scl == 6
        cleared = (ndmi < bd.NDMI_CLEARED) & ~cloud & ~water
        rgb = bd.to_rgb(np.stack([b11, b8a, b04], -1))
        st = {}
        for r in range(N):
            for c in range(N):
                sl = (slice(r*CHIP, (r+1)*CHIP), slice(c*CHIP, (c+1)*CHIP))
                if cloud[sl].mean() > bd.CLOUD_MAX or water[sl].mean() > bd.WATER_MAX:
                    st["skipped"] = st.get("skipped", 0) + 1; continue
                cf = float(cleared[sl].mean())
                cls, sub = stratum(cf)
                fn = f"{name}_r{r:02d}c{c:02d}.png"
                if cls is None:
                    st["skipped"] = st.get("skipped", 0) + 1; continue
                pools.setdefault((cls, sub), []).append((name, fn, round(cf, 3), rgb[sl]))
                st[f"{cls}_{sub}"] = st.get(f"{cls}_{sub}", 0) + 1
        stats[name] = st
        print(name, st, flush=True)

    manifest = []
    for (cls, sub), pool in sorted(pools.items()):
        random.shuffle(pool)
        chosen, per_region = [], {}
        for item in pool:
            if per_region.get(item[0], 0) < CFG["region_cap"]:
                chosen.append(item); per_region[item[0]] = per_region.get(item[0], 0) + 1
            if len(chosen) == CFG["per_stratum"]: break
        # visual-review exclusions are applied after selection (no refill), so every
        # forest tile that remains has been looked at
        chosen = [i for i in chosen if i[1] not in EXCLUDE]
        os.makedirs(os.path.join(OUT, cls), exist_ok=True)
        for name, fn, cf, img in chosen:
            Image.fromarray(img).save(os.path.join(OUT, cls, fn))
            manifest.append({"class": cls, "stratum": sub, "file": fn, "region": name,
                             "cleared_fraction": cf})
        print(cls, sub, "saved", len(chosen), "of", len(pool), "candidates", dict(per_region))
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump({"rules": {"chip_px": CHIP, "forest_max_cf": FOREST_MAX,
                             "not_forest_min_cf": NOTFOREST_MIN, "excluded_by_eye": sorted(EXCLUDE)},
                   "stats": stats, "chips": manifest}, f, indent=1)

if __name__ == "__main__":
    main()
