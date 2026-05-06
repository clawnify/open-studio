import { Handle, Position } from "@xyflow/react";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import type { OutputNodeData } from "../../types";

interface Props { id: string; data: OutputNodeData; }

export function OutputNode({ id, data }: Props) {
  return (
    <div className="flow-node relative">
      <NodeToolbar id={id} />
      <NodeHeader id={id} label={data.label} icon="&#127912;" bgClass="bg-amber-50" textClass="text-amber-600" />
      <div className="p-2.5 flex flex-col gap-1.5">
        {data.imageUrl && <div className="rounded overflow-hidden"><img className="block w-full max-h-[220px] object-cover" src={data.imageUrl} alt="Output" /></div>}
        {data.text && !data.imageUrl && <div className="text-[11px] text-gray-500 p-2 bg-surface-card rounded border border-border-dim whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">{data.text}</div>}
        {!data.imageUrl && !data.text && <div className="text-[11px] text-gray-400 text-center py-4">Connect a source node</div>}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
    </div>
  );
}
