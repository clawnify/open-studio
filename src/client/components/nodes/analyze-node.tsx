import { useEffect, useMemo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Search, Maximize2 } from "lucide-react";
import { useWorkflow } from "../../context";
import { api } from "../../api";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import { PillEditor } from "../pill-editor";
import type { AnalyzeNodeData, ModelOption } from "../../types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props { id: string; data: AnalyzeNodeData; }

export function AnalyzeNode({ id, data }: Props) {
  const { updateNodeData, nodes } = useWorkflow();
  const [analyzeModels, setAnalyzeModels] = useState<ModelOption[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");

  // Other prompt/analyze nodes are the valid reference targets — same set the
  // Prompt node uses.
  const referenceNodes = useMemo(
    () => nodes.filter((n) => (n.type === "prompt" || n.type === "analyze") && n.id !== id),
    [nodes, id],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api<ModelOption[]>("GET", "/api/analyze-models");
        if (alive) setAnalyzeModels(list);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const selectClass = "w-full bg-surface-sunken border border-border rounded-sm text-foreground text-xs py-1 px-2 outline-none cursor-pointer appearance-none focus:border-ring";
  const labelClass = "text-[10px] font-semibold text-muted uppercase tracking-wide";

  return (
    <div className={`group flow-node analyze-node status-${data.status} relative`}>
      <NodeToolbar id={id} canRerun />
      <NodeHeader id={id} label={data.label} icon={Search} />
      <div className="p-2.5 flex flex-col gap-1.5">
        <label className={labelClass}>Instruction</label>
        <div className="relative">
          <PillEditor
            value={data.prompt || ""}
            onChange={(text) => updateNodeData(id, { prompt: text })}
            referenceNodes={referenceNodes}
            placeholder="e.g. Extract clothing items as JSON: {items: [...]}, or: Describe the dominant color."
            style={{ minHeight: "64px", maxHeight: "200px" }}
          />
          <button
            className="node-hover-action nodrag absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[10px] font-medium text-muted hover:text-foreground bg-surface/90 border border-border rounded-sm px-1.5 py-0.5 cursor-pointer transition-colors"
            onClick={() => { setDraftPrompt(data.prompt || ""); setExpanded(true); }}
            title="Expand instruction editor"
          >
            <Maximize2 className="size-3" />
            Expand
          </button>
        </div>
        <label className={labelClass}>Model</label>
        <select
          className={selectClass}
          value={data.model}
          onChange={(e) => updateNodeData(id, { model: e.target.value })}
        >
          {analyzeModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          {analyzeModels.length === 0 && <option value={data.model}>{data.model}</option>}
        </select>
        <label className={labelClass}>Output Format</label>
        <select
          className={selectClass}
          value={data.outputFormat}
          onChange={(e) => updateNodeData(id, { outputFormat: e.target.value })}
        >
          <option value="text">Plain text</option>
          <option value="json">JSON</option>
        </select>
        {data.status === "running" && (
          <div className="flex items-center gap-1.5 text-[11px] p-1.5 rounded-sm bg-surface-sunken text-muted">
            <span className="spinner" /> Analyzing...
          </div>
        )}
        {data.status === "error" && (
          <div className="text-[11px] p-1.5 rounded-sm bg-danger-tint text-danger break-words">
            {data.error || "Analysis failed"}
          </div>
        )}
        {data.result && (
          <pre className="nowheel text-[11px] p-1.5 rounded-sm bg-surface-sunken border border-border text-muted max-h-[140px] overflow-y-auto whitespace-pre-wrap break-words">
            {data.result}
          </pre>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-border-strong" id="image" />
      <Handle type="source" position={Position.Right} className="!bg-ring" />

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{data.label || "Analyze"}</DialogTitle>
            <DialogDescription>
              Edit the instruction sent to the vision model. Output format: <code className="text-[11px]">{data.outputFormat}</code>. Reference other nodes with <code className="text-[11px]">{"{{node_id}}"}</code>.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full min-h-[280px] max-h-[60vh] resize-y bg-surface-sunken border border-border rounded-sm text-foreground text-sm p-3 outline-none focus:border-ring leading-relaxed"
            value={draftPrompt}
            autoFocus
            onChange={(e) => setDraftPrompt(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpanded(false)}>Cancel</Button>
            <Button onClick={() => { updateNodeData(id, { prompt: draftPrompt }); setExpanded(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
