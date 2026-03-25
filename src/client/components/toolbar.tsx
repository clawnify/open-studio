import { useWorkflow } from "../context";

export function Toolbar() {
  const { activeWorkflow, saveWorkflow, executeWorkflow, executing } = useWorkflow();

  return (
    <div class="flex items-center justify-between px-4 py-2 bg-white border-b border-border-dim shrink-0">
      <div class="flex items-center gap-3">
        {activeWorkflow && (
          <span class="text-sm font-semibold text-gray-900">{activeWorkflow.name}</span>
        )}
      </div>
      <div class="flex items-center gap-2">
        <button
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-border-dim cursor-pointer transition-all bg-white text-gray-700 hover:bg-surface-card disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={saveWorkflow}
          disabled={!activeWorkflow}
        >
          Save
        </button>
        <button
          class="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer transition-all bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={executeWorkflow}
          disabled={!activeWorkflow || executing}
        >
          {executing ? (<><span class="spinner !border-white/30 !border-t-white" /> Running...</>) : "\u25B6 Execute"}
        </button>
      </div>
    </div>
  );
}
