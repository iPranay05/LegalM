import { BoundingBox } from "./types";

// Normalizes the two bbox shapes the backend can return (legacy [x0,y0,x1,y1]
// array or {x_min,y_min,x_max,y_max} object; both may be normalized 0-1 or
// raw pixels) into a 0-1 rect so it can be drawn as a percentage-based overlay
// regardless of the on-screen image size. Mirrors the logic in
// web/app/scans/[scanId]/page.tsx's drawBboxOverlays, minus the canvas.
export function normalizedRect(bbox: BoundingBox["bbox"], imgW?: number, imgH?: number) {
  if (!bbox) return null;
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;

  if (Array.isArray(bbox) && bbox.length === 4) {
    [x0, y0, x1, y1] = bbox;
  } else if (typeof bbox === "object") {
    x0 = Number((bbox as any).x_min ?? 0);
    y0 = Number((bbox as any).y_min ?? 0);
    x1 = Number((bbox as any).x_max ?? 0);
    y1 = Number((bbox as any).y_max ?? 0);
  } else {
    return null;
  }

  // Already normalized (0-1)?
  if (x1 <= 1.0 && y1 <= 1.0) {
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  }
  // Raw pixel coordinates — need image dimensions to normalize.
  if (imgW && imgH) {
    return { left: x0 / imgW, top: y0 / imgH, width: (x1 - x0) / imgW, height: (y1 - y0) / imgH };
  }
  return null;
}

export function confidenceColor(confidence?: number) {
  const c = confidence != null ? (confidence > 1 ? confidence / 100 : confidence) : 0;
  if (c >= 0.7) return "#10b981";
  if (c >= 0.4) return "#f59e0b";
  return "#ef4444";
}
