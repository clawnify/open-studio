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

  return (
    <div className="flex-1 relative" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
