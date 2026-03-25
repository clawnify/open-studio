import { Handle, Position } from "@xyflow/react";
import { useWorkflow } from "../../context";
import type { PromptNodeData } from "../../types";

interface Props { id: string; data: PromptNodeData; }

export function PromptNode({ id, data }: Props) {
  const { updateNodeData, deleteNode } = useWorkflow();
  return (
    <div class="flow-node">
      <div class="flex items-center gap-1.5 px-2.5 py-2 font-semibold text-[11px] uppercase tracking-wide border-b border-border-dim bg-violet-50 text-violet-600">
        <span class="text-sm">&#9998;</span>
        <span class="flex-1">{data.label}</span>
        <button class="node-delete bg-transparent border-none text-inherit text-base cursor-pointer opacity-0 px-0.5 leading-none transition-opacity hover:!opacity-100 hover:text-red-500" onClick={() => deleteNode(id)}>&times;</button>
      </div>
      <div class="p-2.5 flex flex-col gap-1.5">
        <textarea class="w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs p-1.5 resize-y outline-none transition-colors focus:border-accent" placeholder="Enter your prompt..." value={data.text || ""} onInput={(e) => updateNodeData(id, { text: (e.target as HTMLTextAreaElement).value })} rows={4} />
      </div>
      <Handle type="source" position={Position.Right} className="!bg-accent" />
    </div>
  );
}
