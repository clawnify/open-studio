import { useState } from "react";
import { Play } from "lucide-react";
import { useWorkflow } from "../context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  workflowView: "canvas" | "outputs";
  onWorkflowViewChange: (v: "canvas" | "outputs") => void;
}

export function Toolbar({ workflowView, onWorkflowViewChange }: Props) {
  const { activeWorkflow, saveWorkflow, executeWorkflow, executing, lastRunResults } = useWorkflow();
  const [showResults, setShowResults] = useState(false);

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
      active ? "bg-surface-sunken text-foreground" : "bg-transparent text-muted hover:text-foreground"
    }`;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        {activeWorkflow && (
          <span className="text-sm font-semibold text-foreground">{activeWorkflow.name}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="inline-flex border border-border rounded-sm overflow-hidden">
          <button className={tabClass(workflowView === "canvas")} onClick={() => onWorkflowViewChange("canvas")}>
            Canvas
          </button>
          <button className={tabClass(workflowView === "outputs")} onClick={() => onWorkflowViewChange("outputs")}>
            Outputs
          </button>
        </div>
        <button
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm text-xs font-semibold border border-border cursor-pointer transition-all bg-surface text-foreground hover:bg-surface-sunken disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={saveWorkflow}
          disabled={!activeWorkflow}
        >
          Save
        </button>
        <button
          className="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-sm text-xs font-semibold border-none cursor-pointer transition-all bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={executeWorkflow}
          disabled={!activeWorkflow || executing}
        >
          {executing ? (<><span className="spinner !border-white/30 !border-t-white" /> Running...</>) : (<><Play className="size-3.5" /> Execute</>)}
        </button>
        {lastRunResults.length > 0 && (
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold border border-border cursor-pointer bg-surface text-foreground hover:bg-surface-sunken"
            onClick={() => setShowResults(true)}
            title="Reopen the most recent run's results"
          >
            Last run ({lastRunResults.length})
          </button>
        )}
      </div>

      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Last run · {lastRunResults.length} output{lastRunResults.length === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {lastRunResults.map((r) => (
              <div key={r.nodeId} className="border border-border rounded-md p-3 bg-surface-sunken">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">{r.label}</span>
                  <span className="text-[10px] text-muted uppercase tracking-wide">{r.type}</span>
                </div>
                {r.imageUrl && (
                  <img className="block w-full rounded-sm border border-border mb-2" src={r.imageUrl} alt={r.label} />
                )}
                {r.imageUrls && r.imageUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 mb-2">
                    {r.imageUrls.map((u, i) => (
                      <img key={i} className="block w-full aspect-square object-cover rounded-sm border border-border" src={u} alt={`${r.label} ${i + 1}`} />
                    ))}
                  </div>
                )}
                {r.text && (
                  <pre className="text-[11px] p-2 rounded-sm bg-surface border border-border text-muted max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">{r.text}</pre>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
