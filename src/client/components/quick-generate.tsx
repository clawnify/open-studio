import { useState, useCallback, useRef, useEffect, useMemo, type DragEvent, type KeyboardEvent } from "react";
import { useWorkflow } from "../context";
import { api } from "../api";
import type { Generation } from "../types";

const ASPECT_RATIOS = ["1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "21:9"];
const IMAGE_SIZES = ["0.5K", "1K", "2K", "4K"];
const ITEMS_PER_ROW = 4;
const GAP = 2;

function parseAspectRatio(ar: string): number {
  const [w, h] = ar.split(":").map(Number);
  return w && h ? w / h : 1;
}

interface RowItem {
  gen?: Generation;
  loading?: boolean;
  ratio: number;
}

function buildRows(items: RowItem[]): RowItem[][] {
  const rows: RowItem[][] = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_ROW) {
    rows.push(items.slice(i, i + ITEMS_PER_ROW));
  }
  return rows;
}

function JustifiedRow({ items, containerWidth, onSelect, onDragStart, onUseAsSource }: {
  items: RowItem[];
  containerWidth: number;
  onSelect: (url: string) => void;
  onDragStart: (e: DragEvent, url: string) => void;
  onUseAsSource: (url: string) => void;
}) {
  const totalGap = GAP * (items.length - 1);
  const usableWidth = containerWidth - totalGap;
  const totalRatio = items.reduce((sum, it) => sum + it.ratio, 0);
  // Cap height so incomplete rows don't blow up
  const maxHeight = (containerWidth - GAP * (ITEMS_PER_ROW - 1)) / (ITEMS_PER_ROW * 1); // assume 1:1 as baseline
  const rowHeight = Math.min(usableWidth / totalRatio, maxHeight);

  return (
    <div className="flex" style={{ gap: `${GAP}px` }}>
      {items.map((item, i) => {
        const width = item.ratio * rowHeight;
        if (item.loading) {
          return (
            <div key={`loading-${i}`} className="relative overflow-hidden bg-surface-card shrink-0" style={{ width: `${width}px`, height: `${rowHeight}px` }}>
              <div className="w-full h-full bg-[length:200%_100%] animate-[pulse-shimmer_1.5s_ease-in-out_infinite]" style={{ backgroundImage: "linear-gradient(110deg, #f1f3f4 30%, #e8eaed 50%, #f1f3f4 70%)" }} />
              <div className="absolute top-3 left-3">
                <span className="px-2.5 py-1 bg-white/80 text-accent text-xs font-semibold backdrop-blur-sm flex items-center gap-1.5 shadow-sm">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  Generating
                </span>
              </div>
            </div>
          );
        }
        const gen = item.gen!;
        return (
          <div
            key={gen.id}
            className={`relative overflow-hidden bg-surface-card cursor-pointer transition-all group shrink-0 ${
              gen.status === "error" ? "ring-1 ring-red-500" : ""
            }`}
            style={{ width: `${width}px`, height: `${rowHeight}px` }}
            onClick={() => gen.image_url && onSelect(gen.image_url)}
            draggable={!!gen.image_url}
            onDragStart={(e: DragEvent) => gen.image_url && onDragStart(e, gen.image_url)}
          >
            {gen.image_url ? (
              <img className="block w-full h-full object-cover" src={gen.image_url} alt={gen.prompt} loading="lazy" />
            ) : (
              <div className="h-full flex items-center justify-center text-center text-red-500 text-xs p-6">
                <div>
                  <span>Failed</span>
                  {gen.error && <small className="block mt-1 text-gray-400 text-[10px]">{gen.error.slice(0, 60)}</small>}
                </div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 pt-8 px-3 pb-3 bg-gradient-to-t from-black/60 to-transparent flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[11px] text-white leading-snug">{gen.prompt.slice(0, 80)}{gen.prompt.length > 80 ? "..." : ""}</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-white/60">{gen.model.split("/").pop()}</span>
                <button
                  className="text-[10px] text-white/80 bg-white/15 hover:bg-white/25 border-none px-2 py-0.5 cursor-pointer transition-colors"
                  onClick={(e) => { e.stopPropagation(); if (gen.image_url) onUseAsSource(gen.image_url); }}
                >
                  Use as source
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function QuickGenerate() {
  const { models } = useWorkflow();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("google/gemini-3.1-flash-image-preview");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("1K");
  const [imageCount, setImageCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [barDragOver, setBarDragOver] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [imageDims, setImageDims] = useState<Record<number, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Measure container
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Detect image aspect ratios
  useEffect(() => {
    for (const gen of generations) {
      if (!gen.image_url || imageDims[gen.id]) continue;
      const img = new Image();
      img.onload = () => {
        setImageDims((prev) => ({ ...prev, [gen.id]: img.naturalWidth / img.naturalHeight }));
      };
      img.src = gen.image_url;
    }
  }, [generations, imageDims]);

  useEffect(() => {
    (async () => {
      try {
        const gens = await api<Generation[]>("GET", "/api/generations/0");
        setGenerations(gens);
      } catch {}
    })();
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const json = await res.json() as { url?: string };
      if (json.url) setAttachments((prev) => [...prev, json.url!]);
    } catch (e) { console.error("Upload failed:", e); }
  }, []);

  const addImageAsAttachment = useCallback((url: string) => {
    setAttachments((prev) => prev.includes(url) ? prev : [...prev, url]);
  }, []);

  const generate = useCallback(async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setPendingCount(imageCount);
    setError(null);
    try {
      for (let i = 0; i < imageCount; i++) {
        const result = await api<{ images: Array<{ url: string }>; text?: string }>(
          "POST", "/api/generate",
          { prompt, model, aspect_ratio: aspectRatio, image_size: imageSize, input_images: attachments.length ? attachments : undefined }
        );
        const img = result.images[0];
        const imageUrl = img?.url || "";
        const gen = await api<Generation>("POST", "/api/generations", {
          workflow_id: 0, node_id: "quick", prompt, model,
          image_url: imageUrl || null, status: imageUrl ? "success" : "error",
          error: imageUrl ? null : "No image returned",
        });
        setGenerations((prev) => [gen, ...prev]);
        setPendingCount((c) => c - 1);
      }
    } catch (e) { setError(String(e)); } finally { setGenerating(false); setPendingCount(0); }
  }, [prompt, model, aspectRatio, imageSize, imageCount, attachments, generating]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); }
  }, [generate]);

  const onBarDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setBarDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file?.type.startsWith("image/")) { uploadFile(file); return; }
    const url = e.dataTransfer?.getData("text/plain");
    if (url) addImageAsAttachment(url);
  }, [uploadFile, addImageAsAttachment]);

  const handleDragStart = useCallback((e: DragEvent, url: string) => {
    e.dataTransfer?.setData("text/plain", url);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
    // Draw small drag preview from the already-loaded image in the card
    const sourceImg = (e.target as HTMLElement).closest("[draggable]")?.querySelector("img");
    if (sourceImg && e.dataTransfer) {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const r = 10;
      const b = 2;
      // Draw rounded border
      ctx.fillStyle = "#4285f4";
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, r);
      ctx.fill();
      // Clip rounded interior and draw image
      ctx.beginPath();
      ctx.roundRect(b, b, size - b * 2, size - b * 2, r - b);
      ctx.clip();
      const s = Math.min(sourceImg.naturalWidth, sourceImg.naturalHeight);
      const sx = (sourceImg.naturalWidth - s) / 2;
      const sy = (sourceImg.naturalHeight - s) / 2;
      ctx.drawImage(sourceImg, sx, sy, s, s, b, b, size - b * 2, size - b * 2);

      const preview = new Image();
      preview.src = canvas.toDataURL();
      preview.style.cssText = "position:absolute;top:-9999px;";
      document.body.appendChild(preview);
      e.dataTransfer.setDragImage(preview, 32, 32);
      requestAnimationFrame(() => document.body.removeChild(preview));
    }
  }, []);

  // Build justified rows
  const pendingRatio = parseAspectRatio(aspectRatio);
  const rows = useMemo(() => {
    const items: RowItem[] = [];
    // Pending loaders first
    for (let i = 0; i < pendingCount; i++) {
      items.push({ loading: true, ratio: pendingRatio });
    }
    // Then generations
    for (const gen of generations) {
      const ratio = imageDims[gen.id] || (gen.status === "error" ? 1 : 0);
      if (ratio === 0) continue; // still loading dimensions, skip
      items.push({ gen, ratio });
    }
    return buildRows(items);
  }, [pendingCount, pendingRatio, generations, imageDims]);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-surface-secondary">
      {/* Image grid */}
      <div className="flex-1 overflow-y-auto" ref={gridRef}>
        {generations.length === 0 && !generating && (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-400 text-base">Describe the scene you imagine</p>
          </div>
        )}
        {containerWidth > 0 && (
          <div className="flex flex-col" style={{ gap: `${GAP}px` }}>
            {rows.map((row, i) => (
              <JustifiedRow
                key={i}
                items={row}
                containerWidth={containerWidth}
                onSelect={setSelectedImage}
                onDragStart={handleDragStart}
                onUseAsSource={addImageAsAttachment}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-t border-red-200 text-red-600 text-xs shrink-0">
          <span>{error}</span>
          <button className="bg-transparent border-none text-red-400 text-lg cursor-pointer" onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* Bottom bar */}
      <div
        className={`shrink-0 mx-auto mb-4 w-full max-w-3xl rounded-xl border-2 bg-white shadow-lg transition-colors ${
          barDragOver ? "border-accent bg-accent-light" : "border-border-dim"
        }`}
        onDragOver={(e) => { e.preventDefault(); setBarDragOver(true); }}
        onDragLeave={() => setBarDragOver(false)}
        onDrop={onBarDrop}
      >
        <div className="p-4 pb-3">
          {attachments.length > 0 && (
            <div className="flex gap-2 mb-3">
              {attachments.map((url, i) => (
                <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden border border-border-dim group/att">
                  <img className="w-full h-full object-cover" src={url} alt="attachment" />
                  <button
                    className="absolute inset-0 bg-black/40 text-white border-none text-sm cursor-pointer opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center"
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                className="w-12 h-12 rounded-lg bg-surface-card border border-border-dim text-gray-400 text-xl cursor-pointer flex items-center justify-center transition-all hover:bg-surface-hover hover:text-gray-600"
                onClick={() => fileRef.current?.click()}
              >
                +
              </button>
            </div>
          )}
          <textarea
            className="w-full bg-transparent text-gray-900 text-sm leading-relaxed resize-none outline-none min-h-[24px] max-h-[120px] placeholder:text-gray-400 border-none p-0"
            placeholder="Describe the scene you imagine"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
          />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <select className="h-8 bg-surface-card border border-border-dim rounded-full text-gray-700 text-xs font-medium px-3 cursor-pointer outline-none appearance-none transition-all hover:bg-surface-hover max-w-[180px]" value={model} onChange={(e) => setModel((e.target as HTMLSelectElement).value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select className="h-8 bg-surface-card border border-border-dim rounded-full text-gray-700 text-xs font-medium px-3 cursor-pointer outline-none appearance-none transition-all hover:bg-surface-hover" value={aspectRatio} onChange={(e) => setAspectRatio((e.target as HTMLSelectElement).value)}>
              {ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="h-8 bg-surface-card border border-border-dim rounded-full text-gray-700 text-xs font-medium px-3 cursor-pointer outline-none appearance-none transition-all hover:bg-surface-hover" value={imageSize} onChange={(e) => setImageSize((e.target as HTMLSelectElement).value)}>
              {IMAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex items-center h-8 border border-border-dim rounded-full overflow-hidden">
              <button className="w-7 h-full bg-surface-card border-none text-gray-600 text-sm cursor-pointer flex items-center justify-center transition-colors hover:bg-surface-hover" onClick={() => setImageCount(Math.max(1, imageCount - 1))}>-</button>
              <span className="w-7 text-center text-xs font-semibold text-gray-700">{imageCount}</span>
              <button className="w-7 h-full bg-surface-card border-none text-gray-600 text-sm cursor-pointer flex items-center justify-center transition-colors hover:bg-surface-hover" onClick={() => setImageCount(Math.min(8, imageCount + 1))}>+</button>
            </div>
            {attachments.length === 0 && (
              <button className="h-8 px-3 bg-surface-card border border-border-dim rounded-full text-gray-500 text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all hover:bg-surface-hover" onClick={() => fileRef.current?.click()}>+ Source</button>
            )}
          </div>
          <button
            className="h-10 px-6 rounded-xl bg-generate text-white text-sm font-bold border-none cursor-pointer shrink-0 flex items-center gap-1.5 transition-all hover:bg-generate-hover disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            onClick={generate}
            disabled={generating || !prompt.trim()}
          >
            {generating ? <span className="spinner !border-white/30 !border-t-white" /> : <>Generate{imageCount > 1 ? ` \u2728 ${imageCount}` : ""}</>}
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) uploadFile(f); }} />

      {selectedImage && (
        <div className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center cursor-pointer" onClick={() => setSelectedImage(null)}>
          <img className="max-w-[90vw] max-h-[90vh] object-contain cursor-default shadow-2xl" src={selectedImage} alt="Full size" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
