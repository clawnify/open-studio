import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { WorkflowContext } from "./context";
import { useWorkflowState } from "./hooks/use-workflow";
import { WorkflowCanvas } from "./components/workflow-canvas";
import { Sidebar } from "./components/sidebar";
import { Toolbar } from "./components/toolbar";
import { ErrorBanner } from "./components/error-banner";
import { QuickGenerate } from "./components/quick-generate";

type View = "generate" | "workflows";

export function App() {
  const state = useWorkflowState();
  const [view, setView] = useState<View>("generate");

  if (state.loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-base">
        Loading...
      </div>
    );
  }

  return (
    <WorkflowContext.Provider value={state}>
      <ReactFlowProvider>
        <div className="flex flex-col h-full w-full">
          <nav className="flex bg-white border-b border-border-dim px-3 shrink-0">
            <button
              className={`px-5 py-2.5 bg-transparent border-none border-b-2 text-[13px] font-medium cursor-pointer transition-all ${
                view === "generate"
                  ? "text-accent border-accent"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
              onClick={() => setView("generate")}
            >
              Generate
            </button>
            <button
              className={`px-5 py-2.5 bg-transparent border-none border-b-2 text-[13px] font-medium cursor-pointer transition-all ${
                view === "workflows"
                  ? "text-accent border-accent"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
              onClick={() => setView("workflows")}
            >
              Workflows
            </button>
          </nav>

          {view === "generate" ? (
            <QuickGenerate />
          ) : (
            <div className="flex flex-1 min-h-0">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0">
                <Toolbar />
                <ErrorBanner />
                <WorkflowCanvas />
              </div>
            </div>
          )}
        </div>
      </ReactFlowProvider>
    </WorkflowContext.Provider>
  );
}
