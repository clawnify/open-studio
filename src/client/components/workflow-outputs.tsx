import { useState } from "react";
import { useWorkflow } from "../context";

export function WorkflowOutputs() {
  const { generations, activeWorkflow } = useWorkflow();
  const [selected, setSelected] = useState<string | null>(null);

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
              <button
                className="w-full aspect-square bg-surface-card border-none p-0 cursor-pointer overflow-hidden"
                onClick={() => gen.image_url && setSelected(gen.image_url)}
              >
                <img
                  src={gen.image_url}
                  alt={gen.prompt}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              <div className="aspect-square flex items-center justify-center text-red-500 text-xs px-3 text-center">
                <div>
                  <div className="font-semibold mb-1">Failed</div>
                  {gen.error && <div className="text-[10px] text-gray-400">{gen.error.slice(0, 80)}</div>}
                </div>
              </div>
            )}
            <div className="p-2.5 border-t border-border-dim">
              <p className="text-[11px] text-gray-700 line-clamp-2 leading-snug min-h-[28px]">{gen.prompt}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-gray-400 truncate">{gen.model.split("/").pop()}</span>
                <span className="text-[10px] text-gray-400 shrink-0 ml-2">{formatDate(gen.created_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center cursor-pointer"
          onClick={() => setSelected(null)}
        >
          <img
            className="max-w-[90vw] max-h-[90vh] object-contain cursor-default shadow-2xl"
            src={selected}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
