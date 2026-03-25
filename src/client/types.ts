export interface Workflow {
  id: number;
  name: string;
  nodes: string;
  edges: string;
  viewport: string;
  created_at: string;
  updated_at: string;
}

export interface Generation {
  id: number;
  workflow_id: number;
  node_id: string;
  prompt: string;
  model: string;
  image_url: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface PromptNodeData {
  label: string;
  text: string;
}

export interface GenerateNodeData {
  label: string;
  model: string;
  aspectRatio: string;
  imageSize: string;
  status: "idle" | "running" | "success" | "error";
  imageUrl?: string;
  error?: string;
}

export interface ImageInputNodeData {
  label: string;
  imageUrl: string;
}

export interface OutputNodeData {
  label: string;
  imageUrl?: string;
  text?: string;
}

export type FlowNodeData = PromptNodeData | GenerateNodeData | ImageInputNodeData | OutputNodeData;
