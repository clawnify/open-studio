import { createContext, useContext } from "react";
import type { Workflow, ModelOption, Generation } from "./types";
import type { Node, Edge, Viewport } from "@xyflow/react";

export interface Features {
  openrouter: boolean;
  openai: boolean;
  fal: boolean;
}

export interface LeafResult {
  nodeId: string;
  label: string;
  type: string;
  imageUrl?: string;
  imageUrls?: string[];
  text?: string;
}

export interface WorkflowContextValue {
  // Workflow list
  workflows: Workflow[];
  activeWorkflow: Workflow | null;
  createWorkflow: () => Promise<void>;
  selectWorkflow: (id: number) => Promise<void>;
  deleteWorkflow: (id: number) => Promise<void>;
  renameWorkflow: (id: number, name: string) => Promise<void>;
  duplicateWorkflow: (id: number) => Promise<void>;

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
  runNode: (nodeId: string) => Promise<void>;
  executing: boolean;

  /** Outputs from the most recent execution — one entry per leaf node (no outgoing edges). */
  lastRunResults: LeafResult[];
  setLastRunResults: (r: LeafResult[]) => void;

  // Models
  models: ModelOption[];

  // Which providers/features are available based on configured env keys.
  features: Features;

  // Generations
  generations: Generation[];
  refreshGenerations: () => Promise<void>;
  /** Delete a generation row + its R2 blob (if owned). Optimistic. */
  deleteGeneration: (id: number) => Promise<void>;
  /** Load a workflow_runs snapshot into the canvas — does not auto-save. */
  loadRun: (runId: number) => Promise<void>;
  /**
   * Load a past run, apply feedback text to the named GenerateImage node, and
   * re-run only that node against the loaded snapshot. Used by the Outputs
   * section's Feedback flow.
   */
  runOutputFeedback: (runId: number, nodeId: string, feedback: string) => Promise<void>;

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
