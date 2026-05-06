import { Handle, Position } from "@xyflow/react";
import { useWorkflow } from "../../context";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import type { GenerateNodeData } from "../../types";

interface Props { id: string; data: GenerateNodeData; }

export function GenerateNode({ id, data }: Props) {
  const { updateNodeData, models } = useWorkflow();
  const selectClass = "w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs py-1 px-2 outline-none cursor-pointer appearance-none focus:border-accent";
  return (
    <div className={`flow-node generate-node status-${data.status} relative`}>
      <NodeToolbar id={id} />
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
        {data.status === "running" && <div className="flex items-center gap-1.5 text-[11px] p-1.5 rounded bg-blue-50 text-accent"><span className="spinner" /> Generating...</div>}
        {data.status === "error" && <div className="text-[11px] p-1.5 rounded bg-red-50 text-red-500 break-words">{data.error || "Generation failed"}</div>}
        {data.imageUrl && <div className="rounded overflow-hidden border border-border-dim mt-1"><img className="block w-full max-h-[180px] object-cover" src={data.imageUrl} alt="Generated" /></div>}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-accent" id="prompt" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </div>
  );
}
