#!/usr/bin/env python3
"""
Registration-spike contour helper (Task 1.2). THROWAWAY.

For each photo in bench/spike-data/manifest.json, extract the object's silhouette with OpenCV
(grayscale → blur → Otsu → largest external contour → fill), crop to its bbox, and letterbox into
a 256×256 binary mask centered at ~0.9 fill — framed comparably to silhouette.ts renderMasks (own
-bbox, centered). Writes bench/spike-data/masks/<photo-stem>.u8 (256*256 bytes of 0/1) for the node
scorer. The whole point of the spike is to test whether THIS contour extraction yields a silhouette
whose IoU vs a rendered STL correlates with fidelity — so the heuristic is deliberately simple.

Run: uv run --with opencv-python-headless --with numpy python3 bench/registration_spike_contour.py
"""
import json
from pathlib import Path
import numpy as np
import cv2

SIZE = 256
FILL = 0.9
OUT = Path(__file__).resolve().parent / "spike-data"
masks_dir = OUT / "masks"
masks_dir.mkdir(parents=True, exist_ok=True)

manifest = json.loads((OUT / "manifest.json").read_text())
photos = sorted({m["photo"] for m in manifest})


def silhouette(path: str) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise RuntimeError(f"cannot read {path}")
    g = cv2.GaussianBlur(img, (5, 5), 0)
    # Otsu both ways; the object is the largest contour that isn't the whole frame / border.
    out = None
    best_area = 0
    for inv in (cv2.THRESH_BINARY, cv2.THRESH_BINARY_INV):
        _, th = cv2.threshold(g, 0, 255, inv + cv2.THRESH_OTSU)
        cnts, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            area = cv2.contourArea(c)
            x, y, w, h = cv2.boundingRect(c)
            frac = (w * h) / (img.shape[0] * img.shape[1])
            # reject the near-full-frame "background as object" contour
            if area > best_area and frac < 0.97 and w > 8 and h > 8:
                best_area = area
                m = np.zeros(img.shape, np.uint8)
                cv2.drawContours(m, [c], -1, 1, thickness=cv2.FILLED)
                out = (m, (x, y, w, h))
    if out is None:
        raise RuntimeError(f"no usable contour in {path}")
    m, (x, y, w, h) = out
    crop = m[y:y + h, x:x + w]
    # letterbox into SIZE*FILL, centered
    scale = (SIZE * FILL) / max(w, h)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    rs = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_NEAREST)
    canvas = np.zeros((SIZE, SIZE), np.uint8)
    ox, oy = (SIZE - nw) // 2, (SIZE - nh) // 2
    canvas[oy:oy + nh, ox:ox + nw] = rs
    return canvas


for p in photos:
    mask = silhouette(p)
    cover = float(mask.mean())
    (masks_dir / (Path(p).stem + ".u8")).write_bytes(mask.astype(np.uint8).tobytes())
    print(f"[contour] {Path(p).name}: silhouette coverage {cover*100:.1f}% → {Path(p).stem}.u8")

print(f"[contour] wrote {len(photos)} masks to {masks_dir}")
