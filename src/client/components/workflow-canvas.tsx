import { useCallback, useMemo, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useWorkflow } from "../context";
import { PromptNode } from "./nodes/prompt-node";
import { GenerateNode } from "./nodes/generate-node";
import { ImageInputNode } from "./nodes/image-input-node";
import { OutputNode } from "./nodes/output-node";
import { AnalyzeNode } from "./nodes/analyze-node";
import { RefineNode } from "./nodes/refine-node";
import { UpscaleNode } from "./nodes/upscale-node";

export function WorkflowCanvas() {
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect, activeWorkflow, addNode,
  } = useWorkflow();

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      prompt: PromptNode as any,
      generateImage: GenerateNode as any,
      imageInput: ImageInputNode as any,
      output: OutputNode as any,
      analyze: AnalyzeNode as any,
      refine: RefineNode as any,
      upscale: UpscaleNode as any,
    }),
    []
  );

  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer?.getData("application/reactflow");
      if (!type) return;
      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      addNode(type, position);
    },
    [addNode, screenToFlowPosition]
  );

  if (!activeWorkflow) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <h2 className="text-xl font-bold mb-2 text-slate-200">No workflow selected</h2>
          <p className="text-[13px] text-slate-500">Create a workflow to get started building AI image generation pipelines.</p>
        </div>
      </div>
    );
  }

  // When a node is selected, emphasize:
  //   - any edge touching it (incoming or outgoing) — thicker stroke
  //   - source nodes feeding into it — bigger output (right) handle
  // We compute decorated copies with extra className/style; selection state
  // and event handlers continue to work against the original arrays.
  const { decoratedNodes, decoratedEdges } = useMemo(() => {
    const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedIds.size === 0) return { decoratedNodes: nodes, decoratedEdges: edges };

    const sourcesOfSelection = new Set<string>();
    for (const e of edges) {
      if (selectedIds.has(e.target)) sourcesOfSelection.add(e.source);
    }

    const dn = nodes.map((n) =>
      sourcesOfSelection.has(n.id)
        ? { ...n, className: `${n.className || ""} flow-node-feeding-selection`.trim() }
        : n,
    );
    // Two passes so highlighted edges render on top of overlapping non-highlighted
    // ones: xyflow draws edges in array order, so we partition then concat with
    // touching edges last. zIndex on the edge would also work but only relative
    // to siblings in the same edge layer — order is the simpler guarantee.
    const others: typeof edges = [];
    const highlighted: typeof edges = [];
    for (const e of edges) {
      if (!selectedIds.has(e.target) && !selectedIds.has(e.source)) {
        others.push(e);
      } else {
        highlighted.push({
          ...e,
          style: { ...e.style, strokeWidth: 3.5 },
          className: `${e.className || ""} flow-edge-touching-selection`.trim(),
          zIndex: 1000,
        });
      }
    }
    const de = [...others, ...highlighted];
    return { decoratedNodes: dn, decoratedEdges: de };
  }, [nodes, edges]);

  return (
    <div className="flex-1 relative" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={decoratedNodes}
        edges={decoratedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{ animated: true, type: "smoothstep" }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background gap={16} size={1} />
        <Controls />

      </ReactFlow>
    </div>
  );
}
