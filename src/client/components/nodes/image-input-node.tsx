import { Handle, Position } from "@xyflow/react";
import { useRef, useCallback } from "preact/hooks";
import { useWorkflow } from "../../context";
import type { ImageInputNodeData } from "../../types";

interface Props { id: string; data: ImageInputNodeData; }

export function ImageInputNode({ id, data }: Props) {
  const { updateNodeData, deleteNode } = useWorkflow();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFile = useCallback(async (file: File) => {
    const form = new FormData(); form.append("file", file);
    try { const res = await fetch("/api/uploads", { method: "POST", body: form }); const json = await res.json() as { url?: string }; if (json.url) updateNodeData(id, { imageUrl: json.url }); } catch {}
  }, [id, updateNodeData]);

  return (
    <div class="flow-node">
      <div class="flex items-center gap-1.5 px-2.5 py-2 font-semibold text-[11px] uppercase tracking-wide border-b border-border-dim bg-blue-50 text-blue-600">
        <span class="text-sm">&#128247;</span>
        <span class="flex-1">{data.label}</span>
        <button class="node-delete bg-transparent border-none text-inherit text-base cursor-pointer opacity-0 px-0.5 leading-none transition-opacity hover:!opacity-100 hover:text-red-500" onClick={() => deleteNode(id)}>&times;</button>
      </div>
      <div class="p-2.5 flex flex-col gap-1.5">
        <input class="w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs p-1.5 outline-none focus:border-accent" type="text" placeholder="Paste image URL..." value={data.imageUrl || ""} onInput={(e) => updateNodeData(id, { imageUrl: (e.target as HTMLInputElement).value })} />
        <div class="border border-dashed border-border-mid rounded p-2 text-center cursor-pointer transition-all min-h-[60px] flex items-center justify-center hover:border-accent hover:bg-accent-light" onDrop={(e: DragEvent) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer?.files?.[0]; if (f?.type.startsWith("image/")) uploadFile(f); }} onDragOver={(e: DragEvent) => { e.preventDefault(); e.stopPropagation(); }} onClick={() => fileRef.current?.click()}>
          {data.imageUrl ? <img class="block w-full max-h-[160px] object-cover rounded-sm" src={data.imageUrl} alt="Input" /> : <span class="text-[11px] text-gray-400">Drop image or click to upload</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" class="hidden" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) uploadFile(f); }} />
        {data.imageUrl && <button class="self-start bg-transparent border border-border-dim rounded text-gray-400 text-[11px] px-2 py-0.5 cursor-pointer transition-all hover:border-red-500 hover:text-red-500" onClick={() => updateNodeData(id, { imageUrl: "" })}>Clear</button>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </div>
  );
}
