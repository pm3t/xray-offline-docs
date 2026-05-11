import sys
import json
import uuid
import os
import cv2
import numpy as np

def analyze(image_path, output_dir, baseline_paths=None):
    try:
        # Load image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")

        H, W = img.shape[:2]

        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        if baseline_paths and len(baseline_paths) > 0:
            best_thresh = None
            valid_bgs = 0
            
            for path in baseline_paths:
                if os.path.exists(path):
                    bg_img = cv2.imread(path)
                    if bg_img is not None:
                        bg_gray = cv2.cvtColor(bg_img, cv2.COLOR_BGR2GRAY)
                        if bg_gray.shape != gray.shape:
                            bg_gray = cv2.resize(bg_gray, (W, H))
                        
                        diff = cv2.absdiff(gray, bg_gray)
                        _, thresh = cv2.threshold(diff, 35, 255, cv2.THRESH_BINARY)
                        
                        if best_thresh is None:
                            best_thresh = thresh
                        else:
                            best_thresh = cv2.bitwise_and(best_thresh, thresh)
                        valid_bgs += 1
            
            if valid_bgs > 0:
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
                closed = cv2.morphologyEx(best_thresh, cv2.MORPH_CLOSE, kernel)
            else:
                # Fallback if all bg images fail to load
                blurred = cv2.GaussianBlur(gray, (5, 5), 0)
                edges = cv2.Canny(blurred, 30, 150)
                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
                closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        else:
            # Fallback to standard Canny edge detection
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            edges = cv2.Canny(blurred, 30, 150)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
            closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        
        # Find contours
        contours, hierarchy = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        valid_bboxes = []
        MIN_AREA = W * H * 0.005  # 0.5% of total area
        MIN_DIM = min(W, H) * 0.03  # 3% of dimension

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            # Area calculated from bounding rect to capture full box size even if edges are incomplete
            area = w * h
            if area >= MIN_AREA and w >= MIN_DIM and h >= MIN_DIM:
                valid_bboxes.append((x, y, w, h))

        # Handle overlapping bounding boxes (Non-Maximum Suppression-like)
        # We group rectangles that heavily overlap.
        # This is simple: if one box is completely inside another, remove the inner one.
        final_bboxes = []
        for i, (x1, y1, w1, h1) in enumerate(valid_bboxes):
            is_inside = False
            for j, (x2, y2, w2, h2) in enumerate(valid_bboxes):
                if i != j:
                    if x1 >= x2 and y1 >= y2 and (x1+w1) <= (x2+w2) and (y1+h1) <= (y2+h2):
                        is_inside = True
                        break
            if not is_inside:
                final_bboxes.append((x1, y1, w1, h1))

        # Sort left-to-right
        final_bboxes.sort(key=lambda b: b[0])

        crop_urls = []
        crop_data = []
        PADDING = int(min(W, H) * 0.02)

        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        for (x, y, w, h) in final_bboxes:
            left = max(0, x - PADDING)
            top = max(0, y - PADDING)
            right = min(W, x + w + PADDING)
            bottom = min(H, y + h + PADDING)

            crop_img = img[top:bottom, left:right]

            filename = f"crop-{uuid.uuid4().hex}.png"
            out_path = os.path.join(output_dir, filename)
            cv2.imwrite(out_path, crop_img)
            
            # Since server.mjs serves UPLOADS_DIR at /uploads
            url = f"/uploads/{filename}"
            crop_urls.append(url)
            crop_data.append({
                "url": url,
                "bbox": {"x": left, "y": top, "w": right - left, "h": bottom - top}
            })

        print(json.dumps({
            "koliCount": len(crop_urls),
            "cropUrls": crop_urls,
            "cropData": crop_data,
            "success": True
        }))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Missing arguments: image_path output_dir [baseline_path1] [baseline_path2]..."}))
        sys.exit(1)
    
    img_path = sys.argv[1]
    out_dir = sys.argv[2]
    baseline_paths = sys.argv[3:] if len(sys.argv) > 3 else None
    
    analyze(img_path, out_dir, baseline_paths)
