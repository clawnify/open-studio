import { Handle, Position } from "@xyflow/react";
import { useWorkflow } from "../../context";
import type { GenerateNodeData } from "../../types";

interface Props { id: string; data: GenerateNodeData; }

export function GenerateNode({ id, data }: Props) {
  const { updateNodeData, deleteNode, models } = useWorkflow();
  const selectClass = "w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs py-1 px-2 outline-none cursor-pointer appearance-none focus:border-accent";
  return (
    <div class={`flow-node generate-node status-${data.status}`}>
      <div class="flex items-center gap-1.5 px-2.5 py-2 font-semibold text-[11px] uppercase tracking-wide border-b border-border-dim bg-emerald-50 text-emerald-600">
        <span class="text-sm">&#9881;</span>
        <span class="flex-1">{data.label}</span>
        <button class="node-delete bg-transparent border-none text-inherit text-base cursor-pointer opacity-0 px-0.5 leading-none transition-opacity hover:!opacity-100 hover:text-red-500" onClick={() => deleteNode(id)}>&times;</button>
      </div>
      <div class="p-2.5 flex flex-col gap-1.5">
        <label class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Model</label>
        <select class={selectClass} value={data.model} onChange={(e) => updateNodeData(id, { model: (e.target as HTMLSelectElement).value })}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Aspect Ratio</label>
        <select class={selectClass} value={(data as any).aspectRatio || "1:1"} onChange={(e) => updateNodeData(id, { aspectRatio: (e.target as HTMLSelectElement).value })}>
          {["1:1","3:2","2:3","16:9","9:16","4:3","3:4","4:5","5:4","21:9"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Resolution</label>
        <select class={selectClass} value={(data as any).imageSize || "1K"} onChange={(e) => updateNodeData(id, { imageSize: (e.target as HTMLSelectElement).value })}>
          {["0.5K","1K","2K","4K"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {data.status === "running" && <div class="flex items-center gap-1.5 text-[11px] p-1.5 rounded bg-blue-50 text-accent"><span class="spinner" /> Generating...</div>}
        {data.status === "error" && <div class="text-[11px] p-1.5 rounded bg-red-50 text-red-500 break-words">{data.error || "Generation failed"}</div>}
        {data.imageUrl && <div class="rounded overflow-hidden border border-border-dim mt-1"><img class="block w-full max-h-[180px] object-cover" src={data.imageUrl} alt="Generated" /></div>}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-accent" id="prompt" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </div>
  );
}
