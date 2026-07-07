import { Handle, Position } from "@xyflow/react";
import { Image as ImageIcon } from "lucide-react";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import type { OutputNodeData } from "../../types";

interface Props { id: string; data: OutputNodeData; }

export function OutputNode({ id, data }: Props) {
  return (
    <div className="flow-node relative">
      <NodeToolbar id={id} />
      <NodeHeader id={id} label={data.label} icon={ImageIcon} />
      <div className="p-2.5 flex flex-col gap-1.5">
        {data.imageUrl && <div className="nodrag rounded-sm overflow-hidden"><img className="nodrag block w-full max-h-[220px] object-cover" src={data.imageUrl} alt="Output" draggable={false} /></div>}
        {data.text && !data.imageUrl && <div className="text-[11px] text-muted p-2 bg-surface-sunken rounded-sm border border-border whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto">{data.text}</div>}
        {!data.imageUrl && !data.text && <div className="text-[11px] text-faint text-center py-4">Connect a source node</div>}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-border-strong" />
    </div>
  );
}
