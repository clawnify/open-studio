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
  run_id: number | null;
  created_at: string;
}

export interface WorkflowRun {
  id: number;
  workflow_id: number;
  snapshot: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface ModelOption {
  id: string;
  name: string;
  /** Which upstream the request is routed to. Used by the UI to decide which provider-specific options (e.g. OpenAI's `quality`) to show. */
  provider?: "openrouter" | "openai";
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
  /** Quality hint — currently only honored when routing to OpenAI direct. */
  quality?: "auto" | "low" | "medium" | "high";
  /**
   * Free-form text appended to the prompt at execute time as "Additional
   * feedback: …". Set by the Feedback flow when a user iterates on a past
   * generation from the Outputs section.
   */
  feedback?: string;
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

export interface UpscaleNodeData {
  label: string;
  upscaleFactor: number;
  outputFormat: "jpg" | "png" | "webp";
  status: "idle" | "running" | "success" | "error";
  imageUrl?: string;
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
  | RefineNodeData
  | UpscaleNodeData;
