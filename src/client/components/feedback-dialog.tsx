import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkflow } from "../context";
import { api } from "../api";
import type { Generation, WorkflowRun } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The generation we're iterating on. Must have a `run_id` (i.e. produced by an executeWorkflow that wrote a snapshot). */
  generation: Generation | null;
  /** Called after the new run kicks off (lets the caller switch views, refresh, etc.). */
  onSubmitted?: () => void;
}

interface SnapshotNode { id: string; type?: string; data?: Record<string, unknown> }
interface SnapshotEdge { source: string; target: string }
interface SnapshotShape { nodes: SnapshotNode[]; edges: SnapshotEdge[] }

/**
 * Per-output iteration dialog. Loads the source run's snapshot into the canvas,
 * adds the user's feedback text to the GenerateImage node that produced this
 * generation, then re-runs only that node so they get a tweaked image without
 * paying for the whole upstream chain again. Same upstream input images get
 * resent automatically (read from the snapshot).
 */
export function FeedbackDialog({ open, onOpenChange, generation, onSubmitted }: Props) {
  const { runOutputFeedback, executing } = useWorkflow();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [referenceLabels, setReferenceLabels] = useState<string[]>([]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFeedback("");
    setError(null);
    setReferenceImages([]);
    setReferenceLabels([]);
    if (!generation?.run_id) return;

    let alive = true;
    setLoadingSnapshot(true);
    (async () => {
      try {
        const run = await api<WorkflowRun>("GET", `/api/runs/${generation.run_id}`);
        if (!alive) return;
        if (!run.snapshot) return;
        const snap = JSON.parse(run.snapshot) as SnapshotShape;
        const incoming = snap.edges.filter((e) => e.target === generation.node_id);
        const imgs: string[] = [];
        const labels: string[] = [];
        for (const edge of incoming) {
          const src = snap.nodes.find((n) => n.id === edge.source);
          if (!src) continue;
          const d = (src.data || {}) as Record<string, unknown>;
          const label = (d.label as string) || src.id;
          if (typeof d.imageUrl === "string" && d.imageUrl) {
            imgs.push(d.imageUrl);
            labels.push(label);
          }
          if (Array.isArray(d.imageUrls)) {
            for (const u of d.imageUrls as string[]) {
              imgs.push(u);
              labels.push(label);
            }
          }
        }
        setReferenceImages(imgs);
        setReferenceLabels(labels);
      } catch {
        // Non-fatal — the dialog still works without showing inputs.
      } finally {
        if (alive) setLoadingSnapshot(false);
      }
    })();
    return () => { alive = false; };
  }, [open, generation?.run_id, generation?.node_id]);

  const canSubmit = !!generation && !!generation.run_id && feedback.trim().length > 0 && !executing;

  const submit = async () => {
    if (!generation || !generation.run_id) return;
    setError(null);
    try {
      await runOutputFeedback(generation.run_id, generation.node_id, feedback.trim());
      onSubmitted?.();
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Iterate on this output</DialogTitle>
          <DialogDescription>
            Loads the workflow state from when this image was generated, applies your feedback to the prompt, and re-runs only the image step using the same reference images. The original run stays untouched.
          </DialogDescription>
        </DialogHeader>
        {generation && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top-left: original prompt */}
            <div className="flex flex-col">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Original prompt</div>
              <pre className="flex-1 text-[11px] p-2 rounded-md bg-surface-sunken border border-border text-muted max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">{generation.prompt}</pre>
            </div>

            {/* Top-right: reference inputs */}
            <div className="flex flex-col">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">
                Reference inputs (will be resent)
                {loadingSnapshot && <span className="ml-2 text-faint normal-case">loading…</span>}
              </div>
              {referenceImages.length > 0 ? (
                <div className="flex flex-wrap gap-2 p-2 rounded-md bg-surface-sunken border border-border min-h-[100px]">
                  {referenceImages.map((url, idx) => (
                    <div key={idx} className="shrink-0 flex flex-col items-center gap-1">
                      <img src={url} alt={referenceLabels[idx]} className="block w-20 h-20 object-cover rounded-md border border-border bg-surface-sunken" />
                      <span className="text-[9px] text-muted truncate max-w-[80px]" title={referenceLabels[idx]}>{referenceLabels[idx]}</span>
                    </div>
                  ))}
                </div>
              ) : !loadingSnapshot ? (
                <div className="flex-1 text-[11px] text-faint italic flex items-center justify-center p-3 rounded-md bg-surface-sunken border border-dashed border-border">
                  No upstream images — the generate step ran from text-only inputs.
                </div>
              ) : null}
            </div>

            {/* Bottom-left: feedback textarea */}
            <div className="flex flex-col">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Your feedback</div>
              <textarea
                className="flex-1 min-h-[180px] w-full bg-surface-sunken border border-border rounded-sm text-foreground text-sm p-3 outline-none focus:border-ring resize-none"
                placeholder="What would you like to change? e.g. 'make the jacket navy', 'remove the logo on the chest'"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                autoFocus
              />
            </div>

            {/* Bottom-right: generated image */}
            <div className="flex flex-col">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Generated output</div>
              {generation.image_url ? (
                <img src={generation.image_url} alt={generation.prompt} className="block w-full max-h-[260px] object-contain rounded-md border border-border bg-surface-sunken" />
              ) : (
                <div className="flex-1 text-[11px] text-faint italic flex items-center justify-center p-3 rounded-md bg-surface-sunken border border-dashed border-border">No image.</div>
              )}
            </div>

            {!generation.run_id && (
              <div className="md:col-span-2 text-[11px] p-2 rounded-sm bg-warning-tint text-warning">
                This generation predates run snapshots — load not possible. Re-run the workflow from the canvas to create a new snapshot you can iterate on.
              </div>
            )}
            {error && <div className="md:col-span-2 text-[12px] p-2 rounded-sm bg-danger-tint text-danger break-words">{error}</div>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executing}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {executing ? "Running..." : "Apply & rerun"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
