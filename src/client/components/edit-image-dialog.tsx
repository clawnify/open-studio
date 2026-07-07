import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "../api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceUrl: string;
  /** Called with the new image URL when the edit succeeds. */
  onResult?: (newImageUrl: string) => void;
}

/**
 * Mask-based inpainting dialog. User paints areas they want regenerated; we
 * export the painted regions as transparent pixels in a same-size PNG mask
 * (OpenAI's convention: transparent = editable, opaque = preserve) and POST to
 * /api/edit-image which forwards to OpenAI's /v1/images/edits.
 */
export function EditImageDialog({ open, onOpenChange, sourceUrl, onResult }: Props) {
  const [prompt, setPrompt] = useState("");
  const [brushSize, setBrushSize] = useState(40);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Load source image and initialise both canvases (display + hidden mask).
  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setError(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      const dc = displayCanvasRef.current;
      const mc = maskCanvasRef.current;
      if (!dc || !mc) return;
      dc.width = mc.width = img.naturalWidth;
      dc.height = mc.height = img.naturalHeight;
      const dctx = dc.getContext("2d");
      const mctx = mc.getContext("2d");
      if (!dctx || !mctx) return;
      dctx.clearRect(0, 0, dc.width, dc.height);
      dctx.drawImage(img, 0, 0);
      // Start with the mask fully opaque (everything preserved). Painting
      // punches alpha=0 holes into it.
      mctx.globalCompositeOperation = "source-over";
      mctx.fillStyle = "rgba(0, 0, 0, 1)";
      mctx.fillRect(0, 0, mc.width, mc.height);
    };
    img.onerror = () => setError(`Could not load source image: ${sourceUrl.slice(0, 80)}`);
    img.src = sourceUrl;
  }, [open, sourceUrl]);

  const getCanvasPos = (clientX: number, clientY: number) => {
    const dc = displayCanvasRef.current;
    if (!dc) return null;
    const rect = dc.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * dc.width,
      y: ((clientY - rect.top) / rect.height) * dc.height,
    };
  };

  const paintStroke = (x: number, y: number) => {
    const dc = displayCanvasRef.current;
    const mc = maskCanvasRef.current;
    if (!dc || !mc) return;
    const dctx = dc.getContext("2d");
    const mctx = mc.getContext("2d");
    if (!dctx || !mctx) return;

    const drawCircle = (ctx: CanvasRenderingContext2D, fill: string, comp: GlobalCompositeOperation) => {
      ctx.save();
      ctx.globalCompositeOperation = comp;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, brushSize, 0, Math.PI * 2);
      ctx.fill();
      // Smooth strokes: connect to the previous point with a line of the same width.
      if (lastPointRef.current) {
        ctx.strokeStyle = fill;
        ctx.lineWidth = brushSize * 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    // Visible: semi-transparent red overlay on top of the image.
    drawCircle(dctx, "rgba(239, 68, 68, 0.45)", "source-over");
    // Mask: punch alpha=0 holes (these are the areas the model will fill).
    drawCircle(mctx, "rgba(0, 0, 0, 1)", "destination-out");

    lastPointRef.current = { x, y };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drawingRef.current = true;
    lastPointRef.current = null;
    const p = getCanvasPos(e.clientX, e.clientY);
    if (p) paintStroke(p.x, p.y);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = getCanvasPos(e.clientX, e.clientY);
    if (p) paintStroke(p.x, p.y);
  };
  const onPointerUp = () => { drawingRef.current = false; lastPointRef.current = null; };

  const clearMask = () => {
    if (!imageRef.current) return;
    const dc = displayCanvasRef.current;
    const mc = maskCanvasRef.current;
    if (!dc || !mc) return;
    const dctx = dc.getContext("2d");
    const mctx = mc.getContext("2d");
    if (!dctx || !mctx) return;
    dctx.clearRect(0, 0, dc.width, dc.height);
    dctx.drawImage(imageRef.current, 0, 0);
    mctx.globalCompositeOperation = "source-over";
    mctx.fillStyle = "rgba(0, 0, 0, 1)";
    mctx.fillRect(0, 0, mc.width, mc.height);
  };

  const submit = async () => {
    if (!prompt.trim() || !maskCanvasRef.current) return;
    setError(null);
    setSubmitting(true);
    try {
      const maskDataUrl = maskCanvasRef.current.toDataURL("image/png");
      const result = await api<{ url: string }>(
        "POST",
        "/api/edit-image",
        { image_url: sourceUrl, mask_data_url: maskDataUrl, prompt },
      );
      onResult?.(result.url);
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit image</DialogTitle>
          <DialogDescription>
            Paint the areas you want regenerated, then describe what should appear there. Uses OpenAI gpt-image-2; the mask is interpreted as guidance, not a hard cutout.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="relative border border-border rounded-md overflow-hidden bg-surface-sunken">
            <canvas
              ref={displayCanvasRef}
              className="block max-w-full max-h-[60vh] mx-auto cursor-crosshair touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            <canvas ref={maskCanvasRef} className="hidden" />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <label className="flex items-center gap-1.5">
              Brush:
              <input type="range" min={5} max={120} value={brushSize} onChange={(e) => setBrushSize(Number((e.target as HTMLInputElement).value))} />
              <span className="text-muted">{brushSize}px</span>
            </label>
            <Button type="button" variant="outline" size="sm" onClick={clearMask}>Clear</Button>
          </div>
          <textarea
            className="w-full bg-surface-sunken border border-border rounded-sm text-foreground text-sm p-3 outline-none focus:border-ring"
            rows={2}
            placeholder="What should appear in the painted area? e.g. 'a sleeping orange cat'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {error && <div className="text-[12px] p-2 rounded-sm bg-danger-tint text-danger break-words">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!prompt.trim() || submitting}>
            {submitting ? "Editing..." : "Apply edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
