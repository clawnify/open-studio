import { Handle, Position } from "@xyflow/react";
import { useWorkflow } from "../../context";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import type { UpscaleNodeData } from "../../types";

interface Props { id: string; data: UpscaleNodeData; }

export function UpscaleNode({ id, data }: Props) {
  const { updateNodeData } = useWorkflow();
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
            <img className="block w-full max-h-[200px] object-cover" src={data.imageUrl} alt="Upscaled" />
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" id="image" />
      <Handle type="source" position={Position.Right} className="!bg-sky-500" />
    </div>
  );
}
