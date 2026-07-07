import { useEffect, useState } from "react";
import { Download, Trash2, RotateCcw, MessageSquare, Copy, Check } from "lucide-react";
import { useWorkflow } from "../context";
import { FeedbackDialog } from "./feedback-dialog";
import { ImageLightbox } from "./image-lightbox";
import { downloadImage } from "../download";
import type { Generation } from "../types";

interface Props {
  onLoaded?: () => void;
}

export function WorkflowOutputs({ onLoaded }: Props = {}) {
  const { generations, activeWorkflow, refreshGenerations, loadRun, deleteGeneration } = useWorkflow();
  const [selected, setSelected] = useState<Generation | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<Generation | null>(null);

  const loadIntoCanvas = async (runId: number) => {
    await loadRun(runId);
    onLoaded?.();
  };

  // Refresh on view open / workflow switch so the grid is always current
  // without forcing the user to reload the page.
  useEffect(() => {
    refreshGenerations();
  }, [refreshGenerations, activeWorkflow?.id]);

  const copyPrompt = async (id: number, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
    } catch {}
  };

  if (!activeWorkflow) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Select a workflow to see its outputs.
      </div>
    );
  }

  if (generations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No generations yet for this workflow. Run it to produce outputs.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-surface-secondary p-4">
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {generations.map((gen) => (
          <div
            key={gen.id}
            className={`relative bg-white rounded-lg border overflow-hidden transition-all group ${
              gen.status === "error" ? "border-red-200" : "border-border-dim hover:border-accent"
            }`}
          >
            {gen.image_url ? (
              <div className="relative group">
                <button
                  className="w-full aspect-square bg-surface-card border-none p-0 cursor-pointer overflow-hidden"
                  onClick={() => gen.image_url && setSelected(gen)}
                >
                  <img
                    src={gen.image_url}
                    alt={gen.prompt}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="inline-flex items-center justify-center text-white bg-black/60 hover:bg-black/80 border-none rounded p-1 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); if (gen.image_url) downloadImage(gen.image_url, `${gen.node_id}-${gen.id}.png`); }}
                    title="Download image"
                  >
                    <Download size={12} />
                  </button>
                  {gen.run_id && (
                    <>
                      <button
                        className="inline-flex items-center justify-center text-white bg-black/60 hover:bg-black/80 border-none rounded p-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); loadIntoCanvas(gen.run_id!); }}
                        title="Load the workflow state from this run into the canvas"
                      >
                        <RotateCcw size={12} />
                      </button>
                      <button
                        className="inline-flex items-center justify-center text-white bg-black/60 hover:bg-black/80 border-none rounded p-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setFeedbackTarget(gen); }}
                        title="Iterate on this output by adding prompt feedback and re-running"
                      >
                        <MessageSquare size={12} />
                      </button>
                    </>
                  )}
                  <button
                    className="inline-flex items-center justify-center text-white bg-red-600/80 hover:bg-red-600 border-none rounded p-1 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); if (confirm("Delete this image? This cannot be undone.")) deleteGeneration(gen.id); }}
                    title="Delete this output"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative aspect-square flex items-center justify-center text-red-500 text-xs px-3 text-center">
                <div>
                  <div className="font-semibold mb-1">Failed</div>
                  {gen.error && <div className="text-[10px] text-gray-400">{gen.error.slice(0, 80)}</div>}
                </div>
                <button
                  className="absolute top-1.5 right-1.5 inline-flex items-center justify-center text-white bg-red-600/80 hover:bg-red-600 border-none rounded p-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); if (confirm("Delete this entry? This cannot be undone.")) deleteGeneration(gen.id); }}
                  title="Delete this entry"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
            <div className="p-2.5 border-t border-border-dim">
              <p className="text-[11px] text-gray-700 line-clamp-2 leading-snug min-h-[28px]">{gen.prompt}</p>
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <span className="text-[10px] text-gray-400 truncate">{gen.model.split("/").pop()}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-gray-400">{formatDate(gen.created_at)}</span>
                  <button
                    className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-accent border border-border-dim rounded px-1.5 py-0.5 cursor-pointer transition-colors bg-white"
                    onClick={() => copyPrompt(gen.id, gen.prompt)}
                    title="Copy prompt"
                  >
                    {copiedId === gen.id ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ImageLightbox
        src={selected?.image_url || null}
        filename={selected ? `${selected.node_id}-${selected.id}.png` : undefined}
        prompt={selected?.prompt}
        onClose={() => setSelected(null)}
      />

      <FeedbackDialog
        open={feedbackTarget !== null}
        onOpenChange={(o) => { if (!o) setFeedbackTarget(null); }}
        generation={feedbackTarget}
        onSubmitted={() => { setFeedbackTarget(null); onLoaded?.(); }}
      />
    </div>
  );
}

function formatDate(s: string): string {
  const d = new Date(s.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return s;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}
