import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Workflow, ModelOption, Generation } from "./types";
import type { Node, Edge, Viewport } from "@xyflow/react";

export interface WorkflowContextValue {
  // Workflow list
  workflows: Workflow[];
  activeWorkflow: Workflow | null;
  createWorkflow: () => Promise<void>;
  selectWorkflow: (id: number) => Promise<void>;
  deleteWorkflow: (id: number) => Promise<void>;
  renameWorkflow: (id: number, name: string) => Promise<void>;

  // Flow state
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: any) => void;
  addNode: (type: string, position?: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, data: Partial<any>) => void;
  deleteNode: (nodeId: string) => void;
  saveWorkflow: () => Promise<void>;

  // Execution
  executeWorkflow: () => Promise<void>;
  executing: boolean;

  // Models
  models: ModelOption[];

  // Generations
  generations: Generation[];

  // Agent mode
  isAgent: boolean;

  // State
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

export const WorkflowContext = createContext<WorkflowContextValue>(null!);

export function useWorkflow() {
  return useContext(WorkflowContext);
}
