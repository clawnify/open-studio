import { useState, type DragEvent } from "react";
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
    <aside className="w-[260px] bg-white border-r border-border-dim flex flex-col shrink-0">
      <div className="flex border-b border-border-dim">
        <button className={tabClass("nodes")} onClick={() => setTab("nodes")}>Nodes</button>
        <button className={tabClass("workflows")} onClick={() => setTab("workflows")}>Workflows</button>
        <button className={tabClass("history")} onClick={() => setTab("history")}>History</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "nodes" && (
          <div>
            <p className="text-gray-400 text-[11px] mb-2">Drag nodes onto the canvas</p>
            {NODE_TYPES.map((nt) => (
              <div key={nt.type} className="flex items-center gap-2.5 p-2.5 bg-surface-card border border-border-dim rounded-lg cursor-grab mb-1.5 transition-all hover:border-accent hover:bg-accent-light active:cursor-grabbing" draggable onDragStart={(e) => onDragStart(e, nt.type)}>
                <span className="text-lg w-7 text-center">{nt.icon}</span>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-800">{nt.label}</span>
                  <span className="text-[11px] text-gray-400">{nt.desc}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "workflows" && (
          <div className="flex flex-col gap-1.5">
            <button className="w-full flex justify-center items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer bg-accent text-white hover:bg-accent-hover mb-2" onClick={createWorkflow}>+ New Workflow</button>
            {workflows.map((wf) => (
              <div key={wf.id} className={`flex items-center px-2.5 py-2 rounded-lg border transition-all group ${activeWorkflow?.id === wf.id ? "border-accent bg-accent-light" : "border-border-dim bg-surface-card"}`}>
                {editingId === wf.id ? (
                  <input className="flex-1 bg-white border border-accent rounded text-gray-900 text-xs px-1.5 py-0.5 outline-none" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={finishRename} onKeyDown={(e) => { if (e.key === "Enter") finishRename(); if (e.key === "Escape") setEditingId(null); }} autoFocus />
                ) : (
                  <span className="flex-1 cursor-pointer text-xs font-medium truncate text-gray-700" onClick={() => selectWorkflow(wf.id)} onDoubleClick={() => startRename(wf.id, wf.name)}>{wf.name}</span>
                )}
                <button className="workflow-delete bg-transparent border-none text-gray-400 text-base cursor-pointer px-1 leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500" onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id); }}>&times;</button>
              </div>
            ))}
            {workflows.length === 0 && <p className="text-gray-400 text-[11px] text-center py-4">No workflows yet</p>}
          </div>
        )}
        {tab === "history" && (
          <div className="flex flex-col gap-2">
            {generations.length === 0 && <p className="text-gray-400 text-[11px] text-center py-4">No generations yet.</p>}
            {generations.map((gen) => (
              <div key={gen.id} className="bg-surface-card border border-border-dim rounded-lg p-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-semibold text-gray-500">{gen.model.split("/").pop()}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase ${gen.status === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>{gen.status}</span>
                </div>
                <p className="text-[11px] text-gray-400 mb-1.5">{gen.prompt.slice(0, 80)}{gen.prompt.length > 80 ? "..." : ""}</p>
                {gen.image_url && <img className="w-full rounded-lg object-cover max-h-[120px]" src={gen.image_url} alt="Generated" />}
                {gen.error && <p className="text-[11px] text-red-500">{gen.error}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
