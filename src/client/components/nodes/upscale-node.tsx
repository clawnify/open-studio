import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Scaling, Download, Trash2 } from "lucide-react";
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
  const selectClass = "w-full bg-surface-sunken border border-border rounded-sm text-foreground text-xs py-1 px-2 outline-none cursor-pointer appearance-none focus:border-ring";
  const labelClass = "text-[10px] font-semibold text-muted uppercase tracking-wide";

  return (
    <div className={`group flow-node upscale-node status-${data.status} relative`}>
      <NodeToolbar id={id} canRerun />
      <NodeHeader id={id} label={data.label} icon={Scaling} />
      <div className="p-2.5 flex flex-col gap-1.5">
        <label className={labelClass}>Upscale Factor</label>
        <select className={selectClass} value={String(data.upscaleFactor)} onChange={(e) => updateNodeData(id, { upscaleFactor: Number(e.target.value) })}>
          {[2, 3, 4].map((f) => <option key={f} value={String(f)}>{f}×</option>)}
        </select>
        <label className={labelClass}>Output Format</label>
        <select className={selectClass} value={data.outputFormat} onChange={(e) => updateNodeData(id, { outputFormat: (e.target as HTMLSelectElement).value })}>
          {["jpg", "png", "webp"].map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
        </select>
        {data.status === "running" && (
          <div className="flex items-center gap-1.5 text-[11px] p-1.5 rounded-sm bg-surface-sunken text-muted">
            <span className="spinner" /> Upscaling...
          </div>
        )}
        {data.status === "error" && (
          <div className="text-[11px] p-1.5 rounded-sm bg-danger-tint text-danger break-words">{data.error || "Upscale failed"}</div>
        )}
        {data.imageUrl && (
          <div className="nodrag relative rounded-sm overflow-hidden border border-border mt-1">
            <img
              className="nodrag block w-full max-h-[200px] object-cover cursor-zoom-in"
              src={data.imageUrl}
              alt="Upscaled"
              draggable={false}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
            />
            <div className="node-hover-action nodrag absolute bottom-1.5 right-1.5 flex gap-1">
              <button
                className="inline-flex items-center justify-center text-white bg-black/60 hover:bg-black/80 border-none rounded-sm p-1 cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (data.imageUrl) downloadImage(data.imageUrl, `${data.label || id}.${data.outputFormat || "png"}`); }}
                title="Download upscaled image"
              >
                <Download size={12} />
              </button>
              <button
                className="inline-flex items-center justify-center text-white bg-danger hover:bg-danger-hover border-none rounded-sm p-1 cursor-pointer"
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
      <Handle type="target" position={Position.Left} className="!bg-border-strong" id="image" />
      <Handle type="source" position={Position.Right} className="!bg-ring" />
      <ImageLightbox
        src={lightbox && data.imageUrl ? data.imageUrl : null}
        filename={`${data.label || id}.${data.outputFormat || "png"}`}
        onClose={() => setLightbox(false)}
      />
    </div>
  );
}
