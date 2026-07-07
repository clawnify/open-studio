import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useWorkflow } from "../context";
import { WorkflowCanvas } from "./workflow-canvas";
import { WorkflowOutputs } from "./workflow-outputs";
import { Sidebar } from "./sidebar";
import { Toolbar } from "./toolbar";
import { ErrorBanner } from "./error-banner";

/**
 * Editor route (/workflows/:id). The URL is the source of truth for which
 * workflow is active — this syncs the id into the shared workflow state.
 */
export function WorkflowEditor() {
  const { id } = useParams();
  const wid = id ?? "";
  const { workflows, activeWorkflow, selectWorkflow } = useWorkflow();
  const [workflowView, setWorkflowView] = useState<"canvas" | "outputs">("canvas");

  useEffect(() => {
    if (wid && activeWorkflow?.id !== wid && workflows.some((w) => w.id === wid)) {
      selectWorkflow(wid);
    }
  }, [wid, workflows, activeWorkflow?.id, selectWorkflow]);

  // Workflows are fully loaded before this route renders (App gates on loading).
  const exists = workflows.some((w) => w.id === wid);

  if (!exists) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center text-center max-w-sm px-6">
          <h2 className="text-base font-semibold mb-1 text-foreground">Workflow not found</h2>
          <p className="text-[13px] text-muted mb-4">It may have been deleted, or the link is out of date.</p>
          <Link
            to="/workflows"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm text-xs font-semibold bg-surface border border-border text-foreground hover:bg-surface-sunken transition-all"
          >
            Back to workflows
          </Link>
        </div>
      </div>
    );
  }

  if (activeWorkflow?.id !== wid) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        Loading workflow…
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar workflowView={workflowView} onWorkflowViewChange={setWorkflowView} />
        <ErrorBanner />
        {workflowView === "canvas" ? <WorkflowCanvas /> : <WorkflowOutputs onLoaded={() => setWorkflowView("canvas")} />}
      </div>
    </div>
  );
}
