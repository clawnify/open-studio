import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
import { useWorkflow } from "../../context";
import { api } from "../../api";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import { PillEditor } from "../pill-editor";
import type { PromptNodeData } from "../../types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props { id: string; data: PromptNodeData; selected?: boolean; }

export function PromptNode({ id, data, selected }: Props) {
  const { updateNodeData, nodes } = useWorkflow();
  const [expanded, setExpanded] = useState(false);
  const [draftText, setDraftText] = useState("");
  const autoNameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNamedText = useRef("");

  // Other prompt/analyze nodes are the valid reference targets.
  const referenceNodes = useMemo(
    () => nodes.filter((n) => (n.type === "prompt" || n.type === "analyze") && n.id !== id),
    [nodes, id],
  );

  // Refs for auto-name so the debounced callback always reads fresh values.
  const dataRef = useRef(data);
  dataRef.current = data;
  const updateNodeDataRef = useRef(updateNodeData);
  updateNodeDataRef.current = updateNodeData;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const runAutoName = useCallback(async () => {
    const currentData = dataRef.current;
    if (!/^Prompt \d+$/.test(currentData.label)) return;

    const labelMap = new Map<string, string>();
    for (const n of nodesRef.current) {
      if (n.type === "prompt" || n.type === "analyze") {
        labelMap.set(n.id, (n.data as Record<string, unknown>).label as string);
      }
    }
    const displayText = (currentData.text || "").replace(/\{\{(.+?)\}\}/g, (_m, refId) => {
      const label = labelMap.get(refId);
      return label ? `{{${label}}}` : `{{${refId}}}`;
    }).trim();
    if (!displayText || displayText.length < 3) return;
    if (displayText === lastNamedText.current) return;

    try {
      const existingLabels = Array.from(labelMap.values()).filter((l) => !/^Prompt \d+$/.test(l));
      const { name } = await api<{ name: string }>("POST", "/api/suggest-name", { text: displayText, existingLabels });
      if (name) {
        lastNamedText.current = displayText;
        updateNodeDataRef.current(id, { label: name });
      }
    } catch { /* ignore */ }
  }, [id]);

  const triggerAutoName = useCallback(() => {
    if (autoNameTimer.current) clearTimeout(autoNameTimer.current);
    autoNameTimer.current = setTimeout(runAutoName, 2000);
  }, [runAutoName]);

  const flushAutoName = useCallback(() => {
    if (autoNameTimer.current) clearTimeout(autoNameTimer.current);
    runAutoName();
  }, [runAutoName]);

  useEffect(() => () => { if (autoNameTimer.current) clearTimeout(autoNameTimer.current); }, []);

  const onChange = useCallback((text: string) => {
    updateNodeData(id, { text });
    triggerAutoName();
  }, [id, updateNodeData, triggerAutoName]);

  return (
    <div className="group flow-node relative flex flex-col" style={{ width: "100%", height: "100%", maxWidth: "none" }}>
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={120}
        maxWidth={600}
        maxHeight={600}
        lineClassName="!border-accent"
        handleClassName="!bg-accent !border-white"
      />
      <NodeToolbar id={id} isInput={data.isInput} onToggleInput={(v) => updateNodeData(id, { isInput: v })} />
      <NodeHeader id={id} label={data.label} icon="&#9998;" bgClass="bg-violet-50" textClass="text-violet-600" />
      <div className="p-2.5 flex flex-col gap-1.5 relative">
        <div className="relative">
          <PillEditor
            value={data.text || ""}
            onChange={onChange}
            referenceNodes={referenceNodes}
            onBlur={flushAutoName}
            style={{ minHeight: "64px", maxHeight: "240px" }}
          />
          <button
            className="nodrag absolute bottom-1.5 right-1.5 text-[10px] text-gray-400 hover:text-accent bg-white/90 border border-border-dim rounded px-1.5 py-0.5 cursor-pointer transition-opacity opacity-0 group-hover:opacity-100"
            onClick={() => { setDraftText(data.text || ""); setExpanded(true); }}
            title="Expand editor"
          >
            ⤢ Expand
          </button>
        </div>
      </div>
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />
      <Handle type="source" position={Position.Right} className="!bg-accent" />

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{data.label || "Prompt"}</DialogTitle>
            <DialogDescription>
              Reference other nodes with <code className="text-[11px]">{"{{node_id}}"}</code>. Use the inline editor to insert references via <code className="text-[11px]">/</code>.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full min-h-[280px] max-h-[60vh] resize-y bg-surface-card border border-border-dim rounded text-gray-800 text-sm p-3 outline-none focus:border-accent leading-relaxed"
            value={draftText}
            autoFocus
            onChange={(e) => setDraftText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpanded(false)}>Cancel</Button>
            <Button onClick={() => { updateNodeData(id, { text: draftText }); setExpanded(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
