import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Copy, Trash2 } from "lucide-react";
import { useWorkflow } from "../context";
import type { Workflow } from "../types";

function nodeCount(wf: Workflow): number {
  try {
    return (JSON.parse(wf.nodes) as unknown[]).length;
  } catch {
    return 0;
  }
}

/** SQLite datetime('now') is UTC without a zone — treat it as UTC, then relativize. */
function relativeTime(iso: string): string {
  const t = new Date(iso.includes("Z") ? iso : iso.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function WorkflowsList() {
  const { workflows, createWorkflow, deleteWorkflow, duplicateWorkflow, renameWorkflow } = useWorkflow();
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const open = (id: string) => navigate(`/workflows/${id}`);

  const create = async () => {
    const wf = await createWorkflow();
    if (wf) navigate(`/workflows/${wf.id}`);
  };

  const startRename = (wf: Workflow) => { setEditingId(wf.id); setEditName(wf.name); };
  const commitRename = async () => {
    if (editingId && editName.trim()) await renameWorkflow(editingId, editName.trim());
    setEditingId(null);
  };

  const totalNodes = workflows.reduce((sum, wf) => sum + nodeCount(wf), 0);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <div className="max-w-[1200px] mx-auto w-full px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Workflows</h1>
          <button
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm text-xs font-semibold border-none cursor-pointer transition-all bg-primary text-on-primary hover:bg-primary-hover"
            onClick={create}
          >
            <Plus className="size-3.5" /> New Workflow
          </button>
        </div>

        {workflows.length === 0 ? (
          <div className="flex flex-col items-center text-center py-24">
            <p className="text-sm text-foreground font-medium mb-1">No workflows yet</p>
            <p className="text-[13px] text-muted mb-4">Create your first to start building AI image-generation pipelines.</p>
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm text-xs font-semibold border-none cursor-pointer transition-all bg-primary text-on-primary hover:bg-primary-hover"
              onClick={create}
            >
              <Plus className="size-3.5" /> New Workflow
            </button>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                All workflows · {workflows.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-sunken">
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-semibold">Name</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Nodes</th>
                    <th className="px-4 py-2.5 font-semibold">Updated</th>
                    <th className="px-4 py-2.5 font-semibold w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((wf) => (
                    <tr
                      key={wf.id}
                      className="group border-t border-border hover:bg-surface-sunken cursor-pointer transition-colors"
                      onClick={() => editingId !== wf.id && open(wf.id)}
                    >
                      <td className="px-4 py-2.5">
                        {editingId === wf.id ? (
                          <input
                            className="bg-surface border border-ring rounded-sm text-foreground text-[13px] px-1.5 py-0.5 outline-none w-full max-w-xs"
                            value={editName}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                        ) : (
                          <span
                            className="text-[13px] font-medium text-foreground"
                            onDoubleClick={(e) => { e.stopPropagation(); startRename(wf); }}
                            title="Double-click to rename"
                          >
                            {wf.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-muted">{nodeCount(wf)}</td>
                      <td className="px-4 py-2.5 text-[13px] text-muted">{relativeTime(wf.updated_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="node-hover-action flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="p-1 rounded-sm text-faint hover:text-foreground hover:bg-surface cursor-pointer transition-colors"
                            title="Duplicate"
                            onClick={(e) => { e.stopPropagation(); duplicateWorkflow(wf.id); }}
                          >
                            <Copy className="size-3.5" />
                          </button>
                          <button
                            className="p-1 rounded-sm text-faint hover:text-danger hover:bg-danger-tint cursor-pointer transition-colors"
                            title="Delete"
                            onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id); }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-border text-[11px] text-muted">
              {workflows.length} workflow{workflows.length === 1 ? "" : "s"} · {totalNodes} node{totalNodes === 1 ? "" : "s"} total
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
