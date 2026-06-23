#!/usr/bin/env python3
"""
Registration-spike data prep (Task 1.2). THROWAWAY — assembles a small labelled set to test
whether silhouette-IoU between a candidate STL's rendered pose and a real photo's contour
correlates with fidelity. NOT wired into any gate.

Source: ThingiPrint (HF, apache-2.0) = real photos of 3D-printed objects keyed by Thingi10K
file_id; Thingi10K (pip `thingi10k`, npz variant) = the matching meshes. We build:
  - N "good" pairs:  (real photo of object X, the STL of object X)        label=good
  - N "bad"  pairs:  (real photo of object X, the STL of a DIFFERENT obj) label=bad
A faithful IoU metric must rank good > bad. Output: bench/spike-data/{photos,stls,manifest.json}.

Run:  uv run --with huggingface_hub --with thingi10k --with numpy python3 bench/registration_spike_prep.py
"""
import json, struct, os
from pathlib import Path
import numpy as np
from huggingface_hub import HfApi, hf_hub_download
import thingi10k

N = 12
OUT = Path(__file__).resolve().parent / "spike-data"
(OUT / "photos").mkdir(parents=True, exist_ok=True)
(OUT / "stls").mkdir(parents=True, exist_ok=True)

print("[prep] init thingi10k (npz, cached) …")
thingi10k.init(variant="npz", cache_dir="/tmp/t10k-cache")

api = HfApi()
files = api.list_repo_files("fanismathioulakis/thingiprint", repo_type="dataset")
# ThingiPrint/<split>/<file_id>/NN.jpg → collect (file_id -> first photo path)
photos: dict[int, str] = {}
for f in files:
    parts = f.split("/")
    if len(parts) == 4 and parts[0] == "ThingiPrint" and parts[3].lower().endswith((".jpg", ".jpeg", ".png")):
        try:
            fid = int(parts[2])
        except ValueError:
            continue
        photos.setdefault(fid, f)  # first photo for that id
print(f"[prep] ThingiPrint has photos for {len(photos)} object ids")


def write_binary_stl(path: Path, V: np.ndarray, F: np.ndarray) -> None:
    V = np.asarray(V, dtype=np.float64)
    F = np.asarray(F, dtype=np.int64)
    tris = V[F]                                   # (n,3,3)
    n = tris.shape[0]
    e1 = tris[:, 1] - tris[:, 0]
    e2 = tris[:, 2] - tris[:, 0]
    nrm = np.cross(e1, e2)
    ln = np.linalg.norm(nrm, axis=1, keepdims=True)
    nrm = np.divide(nrm, ln, out=np.zeros_like(nrm), where=ln > 0)
    with open(path, "wb") as fh:
        fh.write(b"\x00" * 80)
        fh.write(struct.pack("<I", n))
        for i in range(n):
            fh.write(struct.pack("<3f", *nrm[i]))
            for v in tris[i]:
                fh.write(struct.pack("<3f", *v))
            fh.write(struct.pack("<H", 0))


# Pick N DISTINCT-shape objects (dedupe by name). Consecutive ThingiPrint ids are often parts of
# the SAME multi-part "thing" (near-duplicate shapes); one object per distinct name makes the good
# set span categories so the cross-category bad pairing actually measures shape mismatch.
def norm_name(s: str) -> str:
    return " ".join(str(s).lower().split()[:3])

chosen = []
seen_names = set()
for fid in sorted(photos):
    if len(chosen) >= N:
        break
    ds = thingi10k.dataset(file_id=fid)
    if len(ds) == 0:
        continue
    rec = ds[0]
    nm = norm_name(rec.get("name", ""))
    if not nm or nm in seen_names:
        continue
    try:
        V, F = thingi10k.load_file(rec["file_path"])
    except Exception as e:
        print(f"[prep] skip {fid}: load failed ({e})")
        continue
    if len(V) == 0 or len(F) == 0:
        continue
    seen_names.add(nm)
    stl_path = OUT / "stls" / f"{fid}.stl"
    write_binary_stl(stl_path, V, F)
    photo_local = hf_hub_download("fanismathioulakis/thingiprint", photos[fid], repo_type="dataset")
    photo_path = OUT / "photos" / f"{fid}.jpg"
    photo_path.write_bytes(Path(photo_local).read_bytes())
    chosen.append({"id": fid, "name": rec.get("name", "").strip(), "license": rec.get("license", ""),
                   "photo": str(photo_path), "stl": str(stl_path), "tris": int(len(F))})
    print(f"[prep] {fid}: {rec.get('name','').strip()!r}  V={len(V)} F={len(F)}  ({rec.get('license','')})")

assert len(chosen) >= 4, f"need >=4 matched pairs, got {len(chosen)}"

# good pairs: photo_i ↔ its own stl ; bad pairs: photo_i ↔ a DIFFERENT-CATEGORY object's stl.
# (Pairing across categories is essential — a "bad" pair against a near-duplicate object would
#  legitimately score high and confound the separation the spike measures.)
manifest = []
for i, c in enumerate(chosen):
    manifest.append({"photo": c["photo"], "stl": c["stl"], "label": "good",
                     "object": c["id"], "stl_of": c["id"], "name": c["name"]})
    wrong = next((chosen[(i + off) % len(chosen)] for off in range(1, len(chosen))
                  if norm_name(chosen[(i + off) % len(chosen)]["name"]) != norm_name(c["name"])),
                 chosen[(i + 1) % len(chosen)])
    manifest.append({"photo": c["photo"], "stl": wrong["stl"], "label": "bad",
                     "object": c["id"], "stl_of": wrong["id"], "name": f'{c["name"]} vs {wrong["name"]}'})

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
ng = sum(1 for m in manifest if m["label"] == "good")
nb = len(manifest) - ng
print(f"[prep] wrote {OUT/'manifest.json'} — {len(manifest)} items ({ng} good / {nb} bad) from {len(chosen)} objects")
