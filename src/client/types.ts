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
  isInput?: boolean;
}

export interface GenerateNodeData {
  label: string;
  model: string;
  aspectRatio: string;
  imageSize: string;
  status: "idle" | "running" | "success" | "error";
  imageUrl?: string;
  error?: string;
  lastPrompt?: string;
}

export interface ImageInputNodeData {
  label: string;
  imageUrl: string;
  isInput?: boolean;
}

export interface OutputNodeData {
  label: string;
  imageUrl?: string;
  text?: string;
}

export interface AnalyzeNodeData {
  label: string;
  prompt: string;
  model: string;
  outputFormat: "json" | "text";
  status: "idle" | "running" | "success" | "error";
  result?: string;
  error?: string;
}

export interface RefineNodeData {
  label: string;
  tilePrompts: string[];
  tileEnabled: boolean[];
  grid: { rows: number; cols: number };
  model: string;
  /** Output resolution per tile. Smaller keeps downstream payloads under model limits. */
  tileImageSize: string;
  status: "idle" | "running" | "success" | "error";
  imageUrls?: string[];
  error?: string;
  lastSourceUrl?: string;
}

export type FlowNodeData =
  | PromptNodeData
  | GenerateNodeData
  | ImageInputNodeData
  | OutputNodeData
  | AnalyzeNodeData
  | RefineNodeData;
