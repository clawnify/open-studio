import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Download, Trash2 } from "lucide-react";
import { useWorkflow } from "../../context";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import { downloadImage } from "../../download";
import { ImageLightbox } from "../image-lightbox";
import type { UpscaleNodeData } from "../../types";

interface Props { id: string; data: UpscaleNodeData; }

export function UpscaleNode({ id, data }: Props) {
  const { updateNodeData } = useWorkflow();
  const [lightbox, setLightbox] = useState(false);
  const selectClass = "w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs py-1 px-2 outline-none cursor-pointer appearance-none focus:border-accent";

  return (
    <div className={`group flow-node upscale-node status-${data.status} relative`}>
      <NodeToolbar id={id} canRerun />
      <NodeHeader id={id} label={data.label} icon="&#10138;" bgClass="bg-sky-50" textClass="text-sky-600" />
      <div className="p-2.5 flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Upscale Factor</label>
        <select className={selectClass} value={String(data.upscaleFactor)} onChange={(e) => updateNodeData(id, { upscaleFactor: Number(e.target.value) })}>
          {[2, 3, 4].map((f) => <option key={f} value={String(f)}>{f}×</option>)}
        </select>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Output Format</label>
        <select className={selectClass} value={data.outputFormat} onChange={(e) => updateNodeData(id, { outputFormat: (e.target as HTMLSelectElement).value })}>
          {["jpg", "png", "webp"].map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
        </select>
        {data.status === "running" && (
          <div className="flex items-center gap-1.5 text-[11px] p-1.5 rounded bg-sky-50 text-sky-600">
            <span className="spinner" /> Upscaling...
          </div>
        )}
        {data.status === "error" && (
          <div className="text-[11px] p-1.5 rounded bg-red-50 text-red-500 break-words">{data.error || "Upscale failed"}</div>
        )}
        {data.imageUrl && (
          <div className="nodrag relative rounded overflow-hidden border border-border-dim mt-1">
            <img
              className="nodrag block w-full max-h-[200px] object-cover cursor-zoom-in"
              src={data.imageUrl}
              alt="Upscaled"
              draggable={false}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
            />
            <div className="nodrag absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="inline-flex items-center justify-center text-white bg-black/60 hover:bg-black/80 border-none rounded p-1 cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (data.imageUrl) downloadImage(data.imageUrl, `${data.label || id}.${data.outputFormat || "png"}`); }}
                title="Download upscaled image"
              >
                <Download size={12} />
              </button>
              <button
                className="inline-flex items-center justify-center text-white bg-red-600/80 hover:bg-red-600 border-none rounded p-1 cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); updateNodeData(id, { imageUrl: "", status: "idle", error: undefined }); }}
                title="Clear this image from the node"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" id="image" />
      <Handle type="source" position={Position.Right} className="!bg-sky-500" />
      <ImageLightbox
        src={lightbox && data.imageUrl ? data.imageUrl : null}
        filename={`${data.label || id}.${data.outputFormat || "png"}`}
        onClose={() => setLightbox(false)}
      />
    </div>
  );
}
