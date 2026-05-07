import { useEffect, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { useWorkflow } from "../../context";
import { api } from "../../api";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import type { AnalyzeNodeData, ModelOption } from "../../types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props { id: string; data: AnalyzeNodeData; }

export function AnalyzeNode({ id, data }: Props) {
  const { updateNodeData } = useWorkflow();
  const [analyzeModels, setAnalyzeModels] = useState<ModelOption[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");

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

  const selectClass = "w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs py-1 px-2 outline-none cursor-pointer appearance-none focus:border-accent";

  return (
    <div className={`group flow-node analyze-node status-${data.status} relative`}>
      <NodeToolbar id={id} />
      <NodeHeader id={id} label={data.label} icon="&#128270;" bgClass="bg-amber-50" textClass="text-amber-600" />
      <div className="p-2.5 flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Instruction</label>
        <div className="relative">
          <textarea
            className="nodrag nowheel w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs p-1.5 pr-16 outline-none focus:border-accent resize-none"
            rows={3}
            placeholder="e.g. Extract clothing items as JSON: {items: [...]}, or: Describe the dominant color."
            value={data.prompt}
            onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          />
          <button
            className="nodrag absolute bottom-1.5 right-1.5 text-[10px] text-gray-400 hover:text-amber-600 bg-white/90 border border-border-dim rounded px-1.5 py-0.5 cursor-pointer transition-opacity opacity-0 group-hover:opacity-100"
            onClick={() => { setDraftPrompt(data.prompt || ""); setExpanded(true); }}
            title="Expand instruction editor"
          >
            ⤢ Expand
          </button>
        </div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Model</label>
        <select
          className={selectClass}
          value={data.model}
          onChange={(e) => updateNodeData(id, { model: e.target.value })}
        >
          {analyzeModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          {analyzeModels.length === 0 && <option value={data.model}>{data.model}</option>}
        </select>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Output Format</label>
        <select
          className={selectClass}
          value={data.outputFormat}
          onChange={(e) => updateNodeData(id, { outputFormat: e.target.value })}
        >
          <option value="text">Plain text</option>
          <option value="json">JSON</option>
        </select>
        {data.status === "running" && (
          <div className="flex items-center gap-1.5 text-[11px] p-1.5 rounded bg-amber-50 text-amber-600">
            <span className="spinner" /> Analyzing...
          </div>
        )}
        {data.status === "error" && (
          <div className="text-[11px] p-1.5 rounded bg-red-50 text-red-500 break-words">
            {data.error || "Analysis failed"}
          </div>
        )}
        {data.result && (
          <pre className="nowheel text-[11px] p-1.5 rounded bg-surface-card border border-border-dim text-gray-700 max-h-[140px] overflow-y-auto whitespace-pre-wrap break-words">
            {data.result}
          </pre>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-blue-500" id="image" />
      <Handle type="source" position={Position.Right} className="!bg-amber-500" />

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{data.label || "Analyze"}</DialogTitle>
            <DialogDescription>
              Edit the instruction sent to the vision model. Output format: <code className="text-[11px]">{data.outputFormat}</code>.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full min-h-[280px] max-h-[60vh] resize-y bg-surface-card border border-border-dim rounded text-gray-800 text-sm p-3 outline-none focus:border-accent leading-relaxed"
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
