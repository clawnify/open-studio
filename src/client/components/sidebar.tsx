import { useState } from "preact/hooks";
import { useWorkflow } from "../context";

const NODE_TYPES = [
  { type: "prompt", icon: "\u270E", label: "Prompt", desc: "Text prompt input" },
  { type: "generateImage", icon: "\u2699", label: "Generate Image", desc: "AI image generation" },
  { type: "imageInput", icon: "\uD83D\uDCF7", label: "Image Input", desc: "Reference image URL" },
  { type: "output", icon: "\uD83C\uDFA8", label: "Output", desc: "Display results" },
];

export function Sidebar() {
  const { workflows, activeWorkflow, createWorkflow, selectWorkflow, deleteWorkflow, renameWorkflow, generations } = useWorkflow();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [tab, setTab] = useState<"workflows" | "nodes" | "history">("nodes");

  const startRename = (id: number, name: string) => { setEditingId(id); setEditName(name); };
  const finishRename = async () => { if (editingId && editName.trim()) await renameWorkflow(editingId, editName.trim()); setEditingId(null); };
  const onDragStart = (e: DragEvent, type: string) => { e.dataTransfer?.setData("application/reactflow", type); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; };

  const tabClass = (t: string) =>
    `flex-1 py-2 px-1 bg-transparent border-none text-xs font-medium cursor-pointer border-b-2 transition-all ${
      tab === t ? "text-accent border-accent" : "text-gray-400 border-transparent hover:text-gray-600"
    }`;

  return (
    <aside class="w-[260px] bg-white border-r border-border-dim flex flex-col shrink-0">
      <div class="flex border-b border-border-dim">
        <button class={tabClass("nodes")} onClick={() => setTab("nodes")}>Nodes</button>
        <button class={tabClass("workflows")} onClick={() => setTab("workflows")}>Workflows</button>
        <button class={tabClass("history")} onClick={() => setTab("history")}>History</button>
      </div>
      <div class="flex-1 overflow-y-auto p-3">
        {tab === "nodes" && (
          <div>
            <p class="text-gray-400 text-[11px] mb-2">Drag nodes onto the canvas</p>
            {NODE_TYPES.map((nt) => (
              <div key={nt.type} class="flex items-center gap-2.5 p-2.5 bg-surface-card border border-border-dim rounded-lg cursor-grab mb-1.5 transition-all hover:border-accent hover:bg-accent-light active:cursor-grabbing" draggable onDragStart={(e) => onDragStart(e as DragEvent, nt.type)}>
                <span class="text-lg w-7 text-center">{nt.icon}</span>
                <div class="flex flex-col">
                  <span class="text-xs font-semibold text-gray-800">{nt.label}</span>
                  <span class="text-[11px] text-gray-400">{nt.desc}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "workflows" && (
          <div class="flex flex-col gap-1.5">
            <button class="w-full flex justify-center items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer bg-accent text-white hover:bg-accent-hover mb-2" onClick={createWorkflow}>+ New Workflow</button>
            {workflows.map((wf) => (
              <div key={wf.id} class={`flex items-center px-2.5 py-2 rounded-lg border transition-all group ${activeWorkflow?.id === wf.id ? "border-accent bg-accent-light" : "border-border-dim bg-surface-card"}`}>
                {editingId === wf.id ? (
                  <input class="flex-1 bg-white border border-accent rounded text-gray-900 text-xs px-1.5 py-0.5 outline-none" value={editName} onInput={(e) => setEditName((e.target as HTMLInputElement).value)} onBlur={finishRename} onKeyDown={(e) => { if (e.key === "Enter") finishRename(); if (e.key === "Escape") setEditingId(null); }} autoFocus />
                ) : (
                  <span class="flex-1 cursor-pointer text-xs font-medium truncate text-gray-700" onClick={() => selectWorkflow(wf.id)} onDblClick={() => startRename(wf.id, wf.name)}>{wf.name}</span>
                )}
                <button class="workflow-delete bg-transparent border-none text-gray-400 text-base cursor-pointer px-1 leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500" onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id); }}>&times;</button>
              </div>
            ))}
            {workflows.length === 0 && <p class="text-gray-400 text-[11px] text-center py-4">No workflows yet</p>}
          </div>
        )}
        {tab === "history" && (
          <div class="flex flex-col gap-2">
            {generations.length === 0 && <p class="text-gray-400 text-[11px] text-center py-4">No generations yet.</p>}
            {generations.map((gen) => (
              <div key={gen.id} class="bg-surface-card border border-border-dim rounded-lg p-2">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-[11px] font-semibold text-gray-500">{gen.model.split("/").pop()}</span>
                  <span class={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase ${gen.status === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>{gen.status}</span>
                </div>
                <p class="text-[11px] text-gray-400 mb-1.5">{gen.prompt.slice(0, 80)}{gen.prompt.length > 80 ? "..." : ""}</p>
                {gen.image_url && <img class="w-full rounded-lg object-cover max-h-[120px]" src={gen.image_url} alt="Generated" />}
                {gen.error && <p class="text-[11px] text-red-500">{gen.error}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
