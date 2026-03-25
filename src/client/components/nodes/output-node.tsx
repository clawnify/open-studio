import { Handle, Position } from "@xyflow/react";
import { useWorkflow } from "../../context";
import type { OutputNodeData } from "../../types";

interface Props { id: string; data: OutputNodeData; }

export function OutputNode({ id, data }: Props) {
  const { deleteNode } = useWorkflow();
  return (
    <div class="flow-node">
      <div class="flex items-center gap-1.5 px-2.5 py-2 font-semibold text-[11px] uppercase tracking-wide border-b border-border-dim bg-amber-50 text-amber-600">
        <span class="text-sm">&#127912;</span>
        <span class="flex-1">{data.label}</span>
        <button class="node-delete bg-transparent border-none text-inherit text-base cursor-pointer opacity-0 px-0.5 leading-none transition-opacity hover:!opacity-100 hover:text-red-500" onClick={() => deleteNode(id)}>&times;</button>
      </div>
      <div class="p-2.5 flex flex-col gap-1.5">
        {data.imageUrl && <div class="rounded overflow-hidden border border-border-dim"><img class="block w-full max-h-[220px] object-cover" src={data.imageUrl} alt="Output" /></div>}
        {data.text && !data.imageUrl && <div class="text-[11px] text-gray-500 p-2 bg-surface-card rounded border border-border-dim whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">{data.text}</div>}
        {!data.imageUrl && !data.text && <div class="text-[11px] text-gray-400 text-center py-4">Connect a source node</div>}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
    </div>
  );
}
