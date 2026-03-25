import { useCallback, useMemo } from "preact/hooks";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useWorkflow } from "../context";
import { PromptNode } from "./nodes/prompt-node";
import { GenerateNode } from "./nodes/generate-node";
import { ImageInputNode } from "./nodes/image-input-node";
import { OutputNode } from "./nodes/output-node";

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
    }),
    []
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer?.getData("application/reactflow");
      if (!type) return;
      const bounds = (e.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
      if (!bounds) return;
      addNode(type, { x: e.clientX - bounds.left - 100, y: e.clientY - bounds.top - 20 });
    },
    [addNode]
  );

  if (!activeWorkflow) {
    return (
      <div class="flex-1 flex items-center justify-center">
        <div class="text-center text-slate-400">
          <h2 class="text-xl font-bold mb-2 text-slate-200">No workflow selected</h2>
          <p class="text-[13px] text-slate-500">Create a workflow to get started building AI image generation pipelines.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="flex-1 relative" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{ animated: true, type: "smoothstep" }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable style={{ background: "#1e1e2e" }} />
      </ReactFlow>
    </div>
  );
}
