import os

import cv2
import numpy as np


def crop_bottom_bar(img: np.ndarray, bg_threshold: int = 145, white_threshold: int = 200) -> np.ndarray:
    """
    Remove the grey UI bar that appears at the bottom of scanner images.

    Uses a two-phase upward scan from the bottom:
      1. Skip any white border rows (mean > white_threshold).
      2. Continue upward while rows are in the grey bar range (mean < bg_threshold).
    Crops just above the topmost grey-bar row found.

    The grey bar in raw_xray.png has per-row means of ~103–127 (rows 552–631);
    scan content background sits at ~161.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    row_means = gray.mean(axis=1)
    h = img.shape[0]
    crop_row = h

    y = h - 1
    # Phase 1: skip white border rows at the very bottom
    while y >= 0 and row_means[y] > white_threshold:
        y -= 1

    # Phase 2: scan upward through grey bar rows (mean < bg_threshold)
    while y >= 0 and row_means[y] < bg_threshold:
        crop_row = y
        y -= 1

    return img[:crop_row, :]


def find_foreground_rect(
    gray: np.ndarray, bg_threshold: int = 145, step: int = 4
) -> tuple[int, int, int, int]:
    """
    Find the largest axis-aligned rectangle whose 4 corners all land on
    background pixels (gray > bg_threshold).

    Sweeps all (top, bottom) row pairs at `step`-pixel intervals. For each
    pair the widest left/right column span where both row pixels are also
    background is measured; the combination with the greatest area is kept.

    Returns (x1, y1, x2, y2).
    Background in X-ray scans is ~161 gray (sampled from sample_1.png).
    """
    h, w = gray.shape
    bg = gray > bg_threshold  # bool array

    best_area = 0
    best_rect = (0, 0, w - 1, h - 1)

    row_indices = np.arange(0, h, step)
    for ti, t in enumerate(row_indices):
        for b in row_indices[ti + 1:]:
            # Columns where BOTH the top and bottom row are background
            valid = np.where(bg[t, :] & bg[b, :])[0]
            if len(valid) < 2:
                continue
            l, r = int(valid[0]), int(valid[-1])
            area = (b - t) * (r - l)
            if area > best_area:
                best_area = area
                best_rect = (l, t, r, b)

    return best_rect


def detect_packages(
    image_path: str,
    min_area: int = 1000,
    blur_ksize: int = 5,
    padding: int = 10,
    bg_threshold: int = 145
) -> tuple[list, np.ndarray]:
    """
    Detect packages in an X-ray image.
    Returns: (list of cropped ROIs, annotated image)
    """
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Cannot load: {image_path}")

    # --- Step 1: remove grey UI bar at the bottom ---
    img = crop_bottom_bar(img)

    gray    = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # --- Preprocessing: rectangular ROI whose 4 corners are background ---
    rx1, ry1, rx2, ry2 = find_foreground_rect(gray, bg_threshold)

    fg_mask = np.zeros(gray.shape, dtype=np.uint8)
    fg_mask[ry1:ry2, rx1:rx2] = 255

    blurred = cv2.GaussianBlur(gray, (blur_ksize, blur_ksize), 0)

    clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(blurred)

    _, thresh = cv2.threshold(
        enhanced, 0, 255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    kernel = np.ones((5,5), np.uint8)
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    # Apply foreground mask so only non-white-background regions are considered
    cleaned = cv2.bitwise_and(cleaned, cleaned, mask=fg_mask)

    contours, _ = cv2.findContours(
        cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    annotated = img[ry1:ry2, rx1:rx2].copy()

    crops = []

    for i, cnt in enumerate(contours):
        if cv2.contourArea(cnt) < min_area:
            continue

        x, y, w, h = cv2.boundingRect(cnt)

        # Add padding, clamp to image bounds
        x1 = max(0, x - padding)
        y1 = max(0, y - padding)
        x2 = min(img.shape[1], x + w + padding)
        y2 = min(img.shape[0], y + h + padding)

        crop = img[y1:y2, x1:x2]
        crops.append(crop)

        # Offset coordinates into the cropped annotated frame
        ax1, ay1 = x1 - rx1, y1 - ry1
        ax2, ay2 = x2 - rx1, y2 - ry1
        cv2.rectangle(annotated, (ax1, ay1), (ax2, ay2), (0,255,0), 2)
        cv2.putText(annotated, f"pkg {i+1}", (ax1, ay1-8),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2)

    return crops, annotated


def main():
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)

    crops, annotated = detect_packages("data/raw_xray.png", min_area=2000)

    print(f"Detected {len(crops)} packages")
    cv2.imwrite(os.path.join(output_dir, "annotated.png"), annotated)

    for i, crop in enumerate(crops):
        cv2.imwrite(os.path.join(output_dir, f"package_{i+1}.png"), crop)

if __name__ == "__main__":
    main()