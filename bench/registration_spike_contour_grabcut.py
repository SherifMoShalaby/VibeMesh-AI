#!/usr/bin/env python3
"""
Registration-spike contour helper — GrabCut variant (Task 1.2). THROWAWAY robustness check.

Re-extracts the photo silhouettes with OpenCV GrabCut (foreground/background segmentation seeded by
a center rectangle) instead of Otsu, to test whether the spike's FAIL verdict is a property of the
METRIC or merely of cheap thresholding. Overwrites bench/spike-data/masks/*.u8 so the same node
scorer re-runs on the better masks. (rembg's numba dep won't build on Python 3.13; GrabCut needs no
extra deps and is a strong classical segmenter.)

Run: uv run --with opencv-python-headless --with numpy python3 bench/registration_spike_contour_grabcut.py
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
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError(f"cannot read {path}")
    H, W = img.shape[:2]
    s = 512 / max(H, W)
    if s < 1:
        img = cv2.resize(img, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    H, W = img.shape[:2]
    mask = np.zeros((H, W), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    mx = int(W * 0.06); my = int(H * 0.06)
    rect = (mx, my, W - 2 * mx, H - 2 * my)
    try:
        cv2.grabCut(img, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    except Exception:
        return np.zeros((SIZE, SIZE), np.uint8)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return np.zeros((SIZE, SIZE), np.uint8)
    c = max(cnts, key=cv2.contourArea)
    m = np.zeros((H, W), np.uint8)
    cv2.drawContours(m, [c], -1, 1, thickness=cv2.FILLED)
    x, y, w, h = cv2.boundingRect(c)
    crop = m[y:y + h, x:x + w]
    scale = (SIZE * FILL) / max(w, h)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    rs = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_NEAREST)
    canvas = np.zeros((SIZE, SIZE), np.uint8)
    ox, oy = (SIZE - nw) // 2, (SIZE - nh) // 2
    canvas[oy:oy + nh, ox:ox + nw] = rs
    return canvas


for p in photos:
    mask = silhouette(p)
    (masks_dir / (Path(p).stem + ".u8")).write_bytes(mask.astype(np.uint8).tobytes())
    print(f"[grabcut] {Path(p).name}: coverage {float(mask.mean())*100:.1f}%")
print(f"[grabcut] wrote {len(photos)} masks")
