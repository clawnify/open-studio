import { Handle, Position } from "@xyflow/react";
import { useWorkflow } from "../../context";
import { NodeHeader } from "./node-header";
import type { OutputNodeData } from "../../types";

interface Props { id: string; data: OutputNodeData; }

export function OutputNode({ id, data }: Props) {
  return (
    <div class="flow-node">
      <NodeHeader id={id} label={data.label} icon="&#127912;" bgClass="bg-amber-50" textClass="text-amber-600" />
      <div class="p-2.5 flex flex-col gap-1.5">
        {data.imageUrl && <div class="rounded overflow-hidden"><img class="block w-full max-h-[220px] object-cover" src={data.imageUrl} alt="Output" /></div>}
        {data.text && !data.imageUrl && <div class="text-[11px] text-gray-500 p-2 bg-surface-card rounded border border-border-dim whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">{data.text}</div>}
        {!data.imageUrl && !data.text && <div class="text-[11px] text-gray-400 text-center py-4">Connect a source node</div>}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
    </div>
  );
}
