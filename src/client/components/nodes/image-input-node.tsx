import { Handle, Position } from "@xyflow/react";
import { useRef, useCallback, type DragEvent } from "react";
import { useWorkflow } from "../../context";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import type { ImageInputNodeData } from "../../types";

interface Props { id: string; data: ImageInputNodeData; }

export function ImageInputNode({ id, data }: Props) {
  const { updateNodeData } = useWorkflow();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFile = useCallback(async (file: File) => {
    const form = new FormData(); form.append("file", file);
    try { const res = await fetch("/api/uploads", { method: "POST", body: form }); const json = await res.json() as { url?: string }; if (json.url) updateNodeData(id, { imageUrl: json.url }); } catch {}
  }, [id, updateNodeData]);

  return (
    <div className="flow-node relative">
      <NodeToolbar id={id} isInput={data.isInput} onToggleInput={(v) => updateNodeData(id, { isInput: v })} />
      <NodeHeader id={id} label={data.label} icon="&#128247;" bgClass="bg-blue-50" textClass="text-blue-600" />
      <div className="p-2.5 flex flex-col gap-1.5">
        <input className="w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs p-1.5 outline-none focus:border-accent" type="text" placeholder="Paste image URL..." value={data.imageUrl || ""} onChange={(e) => updateNodeData(id, { imageUrl: e.target.value })} />
        <div className="border border-dashed border-border-mid rounded p-2 text-center cursor-pointer transition-all min-h-[60px] flex items-center justify-center hover:border-accent hover:bg-accent-light" onDrop={(e: DragEvent) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer?.files?.[0]; if (f?.type.startsWith("image/")) uploadFile(f); }} onDragOver={(e: DragEvent) => { e.preventDefault(); e.stopPropagation(); }} onClick={() => fileRef.current?.click()}>
          {data.imageUrl ? <img className="block w-full max-h-[160px] object-cover rounded-sm" src={data.imageUrl} alt="Input" /> : <span className="text-[11px] text-gray-400">Drop image or click to upload</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) uploadFile(f); }} />
        {data.imageUrl && <button className="self-start bg-transparent border border-border-dim rounded text-gray-400 text-[11px] px-2 py-0.5 cursor-pointer transition-all hover:border-red-500 hover:text-red-500" onClick={() => updateNodeData(id, { imageUrl: "" })}>Clear</button>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-500" />
    </div>
  );
}
