"""
Build a 2-class Teachable Machine dataset (deforestation / non_deforestation)
from Sentinel-2 L2A SWIR composites (R=B11, G=B8A, B=B04) via the CDSE Process API.

Each region is fetched once as a ~20 km scene (bands + scene classification),
cut into 256 px chips (2.56 km at 10 m), and pre-sorted with a spectral rule:
  cleared pixel = NDMI (B8A-B11)/(B8A+B11) below a threshold (not water/cloud)
  deforestation      -> cleared fraction >= DEF_MIN
  non_deforestation  -> cleared fraction <= NONDEF_MAX
Chips with cloud/shadow above CLOUD_MAX are discarded.
The rule is a pre-sort only; review the chips by eye before training.
"""
import os, sys, json, random
import numpy as np
from scipy.ndimage import uniform_filter
from PIL import Image
from sentinelhub import (SHConfig, SentinelHubRequest, DataCollection, MimeType,
                         MosaickingOrder, BBox, CRS)

OUT = sys.argv[1] if len(sys.argv) > 1 else "dataset"
CACHE = "scenes"
CHIP = 256
SCENE_PX = 2048              # 20.48 km at 10 m -> 8 x 8 = 64 chips per region
GAIN = 2.5
NDMI_CLEARED = float(os.environ.get("NDMI_CLEARED", "0.05"))
DEF_MIN, NONDEF_MAX, CLOUD_MAX, WATER_MAX = 0.35, 0.003, 0.01, 0.15
PER_CLASS = 100
MAX_PER_REGION = 18          # keeps each class spread across locations

# (name, centre lon, centre lat, time interval)
DRY_S = ("2025-06-01", "2025-07-31")   # southern dry season, before peak fire smoke
DRY_N = ("2025-08-01", "2025-11-30")   # northern Amazon is drier later
REGIONS = [
    ("novo_progresso_PA",   -55.40, -7.13, DRY_S),
    ("castelo_de_sonhos_PA",-55.09, -8.31, DRY_S),
    ("sao_felix_xingu_PA",  -52.15, -6.75, DRY_S),
    ("uruara_PA",           -53.74, -3.72, DRY_S),
    ("apui_AM",             -59.89, -7.20, DRY_S),
    ("buritis_RO",          -63.83, -10.21, DRY_S),
    ("rio_branco_AC",       -67.50, -9.90, DRY_S),
    ("jau_NP_AM",           -62.30, -2.20, DRY_N),
    ("medio_jurua_AM",      -67.50, -5.50, DRY_S),
    ("tumucumaque_AP",      -53.50,  1.50, DRY_N),
    ("amazonia_NP_PA",      -56.60, -4.50, DRY_S),
]

config = SHConfig()
config.sh_client_id = os.environ["CDSE_CLIENT_ID"]
config.sh_client_secret = os.environ["CDSE_CLIENT_SECRET"]
config.sh_base_url = "https://sh.dataspace.copernicus.eu"
config.sh_token_url = ("https://identity.dataspace.copernicus.eu/auth/realms/CDSE/"
                       "protocol/openid-connect/token")
S2 = DataCollection.SENTINEL2_L2A.define_from("s2l2a", service_url=config.sh_base_url)

EVAL = """
//VERSION=3
function setup() {
  return { input: ["B11","B8A","B04","SCL"], output: { bands: 4, sampleType: "UINT16" } };
}
function evaluatePixel(s) {
  return [s.B11*10000, s.B8A*10000, s.B04*10000, s.SCL];
}
"""

def scene_bbox(lon, lat):
    # half-width in degrees for SCENE_PX * 10 m
    half_m = SCENE_PX * 10 / 2
    dlat = half_m / 111320
    dlon = half_m / (111320 * np.cos(np.radians(lat)))
    return BBox([lon - dlon, lat - dlat, lon + dlon, lat + dlat], crs=CRS.WGS84)

def fetch(name, lon, lat, interval):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{name}.npy")
    if os.path.exists(path):
        return np.load(path)
    req = SentinelHubRequest(
        evalscript=EVAL,
        input_data=[SentinelHubRequest.input_data(
            data_collection=S2, time_interval=interval,
            mosaicking_order=MosaickingOrder.LEAST_CC, maxcc=0.3)],
        responses=[SentinelHubRequest.output_response("default", MimeType.TIFF)],
        bbox=scene_bbox(lon, lat), size=(SCENE_PX, SCENE_PX), config=config)
    arr = req.get_data()[0]
    np.save(path, arr)
    return arr

def to_rgb(refl):
    return np.clip(GAIN * refl / 10000 * 255, 0, 255).astype(np.uint8)

def main():
    random.seed(0)
    pools = {"deforestation": [], "non_deforestation": []}
    stats = {}
    for name, lon, lat, interval in REGIONS:
        arr = fetch(name, lon, lat, interval).astype(np.float32)
        b11, b8a, b04, scl = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
        ndmi = uniform_filter((b8a - b11) / np.maximum(b8a + b11, 1), size=5)  # 50 m smoothing
        cloud = np.isin(scl, [3, 8, 9, 10]) | (scl == 0)
        water = scl == 6
        cleared = (ndmi < NDMI_CLEARED) & ~cloud & ~water
        rgb = to_rgb(np.stack([b11, b8a, b04], -1))
        n = SCENE_PX // CHIP
        counts = {"deforestation": 0, "non_deforestation": 0, "skipped": 0}
        for r in range(n):
            for c in range(n):
                sl = (slice(r*CHIP, (r+1)*CHIP), slice(c*CHIP, (c+1)*CHIP))
                cf, wf, clf = cloud[sl].mean(), water[sl].mean(), cleared[sl].mean()
                if cf > CLOUD_MAX or wf > WATER_MAX:
                    counts["skipped"] += 1; continue
                cls = ("deforestation" if clf >= DEF_MIN else
                       "non_deforestation" if clf <= NONDEF_MAX else None)
                if cls is None:
                    counts["skipped"] += 1; continue
                pools[cls].append((name, r, c, round(float(clf), 3), rgb[sl]))
                counts[cls] += 1
        stats[name] = counts
        print(name, counts, flush=True)

    manifest = []
    for cls, pool in pools.items():
        random.shuffle(pool)
        chosen, per_region = [], {}
        for item in pool:                       # first pass: respect region cap
            if per_region.get(item[0], 0) < MAX_PER_REGION:
                chosen.append(item); per_region[item[0]] = per_region.get(item[0], 0) + 1
            if len(chosen) == PER_CLASS: break
        if len(chosen) < PER_CLASS:             # top up if a cap left us short
            rest = [i for i in pool if i not in chosen]
            chosen += rest[:PER_CLASS - len(chosen)]
        os.makedirs(os.path.join(OUT, cls), exist_ok=True)
        for name, r, c, clf, img in chosen:
            fn = f"{name}_r{r}c{c}.png"
            Image.fromarray(img).save(os.path.join(OUT, cls, fn))
            manifest.append({"class": cls, "file": fn, "region": name,
                             "cleared_fraction": clf})
        print(cls, "saved", len(chosen), "of", len(pool), "candidates")
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump({"stats": stats, "chips": manifest}, f, indent=1)

if __name__ == "__main__":
    main()
