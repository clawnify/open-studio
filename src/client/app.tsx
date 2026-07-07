import { ReactFlowProvider } from "@xyflow/react";
import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { WorkflowContext } from "./context";
import { useWorkflowState } from "./hooks/use-workflow";
import { WorkflowEditor } from "./components/workflow-editor";
import { WorkflowsList } from "./components/workflows-list";
import { QuickGenerate } from "./components/quick-generate";

function TopNav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-5 py-2.5 border-b-2 text-[13px] font-medium cursor-pointer transition-all ${
      isActive
        ? "text-foreground border-foreground"
        : "text-muted border-transparent hover:text-foreground"
    }`;
  return (
    <nav className="flex bg-surface border-b border-border px-3 shrink-0">
      <NavLink to="/generate" className={linkClass}>Generate</NavLink>
      <NavLink to="/workflows" className={linkClass}>Workflows</NavLink>
    </nav>
  );
}

export function App() {
  const state = useWorkflowState();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        Loading...
      </div>
    );
  }

  return (
    <WorkflowContext.Provider value={state}>
      <ReactFlowProvider>
        <BrowserRouter>
          <div className="flex flex-col h-full w-full">
            <TopNav />
            <div className="flex-1 min-h-0 flex flex-col">
              <Routes>
                <Route path="/" element={<Navigate to="/generate" replace />} />
                <Route path="/generate" element={<QuickGenerate />} />
                <Route path="/workflows" element={<WorkflowsList />} />
                <Route path="/workflows/:id" element={<WorkflowEditor />} />
                <Route path="*" element={<Navigate to="/generate" replace />} />
              </Routes>
            </div>
          </div>
        </BrowserRouter>
      </ReactFlowProvider>
    </WorkflowContext.Provider>
  );
}
