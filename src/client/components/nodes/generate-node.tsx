import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Download, Copy, Check, Trash2 } from "lucide-react";
import { useWorkflow } from "../../context";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import { downloadImage } from "../../download";
import { ImageLightbox } from "../image-lightbox";
import type { GenerateNodeData } from "../../types";

interface Props { id: string; data: GenerateNodeData; }

export function GenerateNode({ id, data }: Props) {
  const { updateNodeData, models } = useWorkflow();
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const selectClass = "w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs py-1 px-2 outline-none cursor-pointer appearance-none focus:border-accent";

  const copyPrompt = async (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
    if (!data.lastPrompt) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(data.lastPrompt);
      ok = true;
    } catch {
      // Fallback for browsers/contexts where clipboard API is blocked.
      const ta = document.createElement("textarea");
      ta.value = data.lastPrompt;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <div className={`group flow-node generate-node status-${data.status} relative`}>
      <NodeToolbar id={id} canRerun />
      <NodeHeader id={id} label={data.label} icon="&#9881;" bgClass="bg-emerald-50" textClass="text-emerald-600" />
      <div className="p-2.5 flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Model</label>
        <select className={selectClass} value={data.model} onChange={(e) => updateNodeData(id, { model: (e.target as HTMLSelectElement).value })}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Aspect Ratio</label>
        <select className={selectClass} value={(data as any).aspectRatio || "1:1"} onChange={(e) => updateNodeData(id, { aspectRatio: (e.target as HTMLSelectElement).value })}>
          {["1:1","3:2","2:3","16:9","9:16","4:3","3:4","4:5","5:4","21:9"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Resolution</label>
        <select className={selectClass} value={(data as any).imageSize || "1K"} onChange={(e) => updateNodeData(id, { imageSize: (e.target as HTMLSelectElement).value })}>
          {["0.5K","1K","2K","4K"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {models.find((m) => m.id === data.model)?.provider === "openai" && (
          <>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Quality (OpenAI only)</label>
            <select className={selectClass} value={data.quality || "auto"} onChange={(e) => updateNodeData(id, { quality: (e.target as HTMLSelectElement).value })}>
              {["auto", "low", "medium", "high"].map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </>
        )}
        {data.status === "running" && <div className="flex items-center gap-1.5 text-[11px] p-1.5 rounded bg-blue-50 text-accent"><span className="spinner" /> Generating...</div>}
        {data.status === "error" && <div className="text-[11px] p-1.5 rounded bg-red-50 text-red-500 break-words">{data.error || "Generation failed"}</div>}
        {data.imageUrl && (
          <div className="nodrag relative rounded overflow-hidden border border-border-dim mt-1">
            <img
              className="nodrag block w-full max-h-[180px] object-cover cursor-zoom-in"
              src={data.imageUrl}
              alt="Generated"
              draggable={false}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
            />
            <div className="nodrag absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="inline-flex items-center justify-center text-white bg-black/60 hover:bg-black/80 border-none rounded p-1 cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (data.imageUrl) downloadImage(data.imageUrl, `${data.label || id}.png`); }}
                title="Download image"
              >
                <Download size={12} />
              </button>
              {data.lastPrompt && (
                <button
                  className="inline-flex items-center justify-center text-white bg-black/60 hover:bg-black/80 border-none rounded p-1 cursor-pointer"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={copyPrompt}
                  title="Copy prompt sent to model"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              )}
              <button
                className="inline-flex items-center justify-center text-white bg-red-600/80 hover:bg-red-600 border-none rounded p-1 cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); updateNodeData(id, { imageUrl: "", status: "idle", error: undefined, lastPrompt: undefined }); }}
                title="Clear this image from the node (does not delete history in Outputs)"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-accent" id="prompt" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
      <ImageLightbox
        src={lightbox && data.imageUrl ? data.imageUrl : null}
        filename={`${data.label || id}.png`}
        prompt={data.lastPrompt}
        onClose={() => setLightbox(false)}
      />
    </div>
  );
}
