import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import { api } from "../api";
import type { Workflow, ModelOption, Generation } from "../types";
import type { WorkflowContextValue } from "../context";

let nodeIdCounter = 0;
function nextNodeId() {
  return `node_${++nodeIdCounter}_${Date.now()}`;
}

const MAX_HISTORY = 50;

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

/** Drop runtime/output fields so saved workflow contains only user-authored config. */
const RUNTIME_FIELDS_BY_TYPE: Record<string, readonly string[]> = {
  generateImage: ["status", "imageUrl", "error", "lastPrompt"],
  analyze: ["status", "result", "error"],
  output: ["imageUrl", "text"],
  refine: ["status", "imageUrl", "error", "lastSourceUrl"],
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${src} (${e})`));
    img.src = src;
  });
}

async function splitImage(src: string, rows: number, cols: number): Promise<string[]> {
  const img = await loadImage(src);
  const tileW = Math.floor(img.naturalWidth / cols);
  const tileH = Math.floor(img.naturalHeight / rows);
  const tiles: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const canvas = document.createElement("canvas");
      canvas.width = tileW;
      canvas.height = tileH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");
      ctx.drawImage(img, c * tileW, r * tileH, tileW, tileH, 0, 0, tileW, tileH);
      tiles.push(canvas.toDataURL("image/png"));
    }
  }
  return tiles;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), type, quality);
  });
}

/**
 * PNG when it fits under `maxBytes`; otherwise JPEG with descending quality,
 * then 25%-per-pass downscale. Ensures the merged image stays small enough to
 * be used as a source for downstream nodes (model upload limits).
 */
async function canvasToCappedBlob(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  const png = await canvasToBlob(canvas, "image/png");
  if (png.size <= maxBytes) return png;

  let work = canvas;
  let quality = 0.92;
  for (let attempt = 0; attempt < 6; attempt++) {
    const blob = await canvasToBlob(work, "image/jpeg", quality);
    if (blob.size <= maxBytes) return blob;
    if (quality > 0.6) { quality -= 0.1; continue; }
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.floor(work.width * 0.75));
    scaled.height = Math.max(1, Math.floor(work.height * 0.75));
    const ctx = scaled.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(work, 0, 0, scaled.width, scaled.height);
    work = scaled;
    quality = 0.85;
  }
  return canvasToBlob(work, "image/jpeg", 0.7);
}

const REFINE_MERGED_MAX_BYTES = 15 * 1024 * 1024;

async function stitchTiles(srcs: string[], rows: number, cols: number): Promise<Blob> {
  const imgs = await Promise.all(srcs.map(loadImage));
  // Use the largest dimensions seen across tiles (model output sizes can drift slightly)
  const tileW = Math.max(...imgs.map((i) => i.naturalWidth));
  const tileH = Math.max(...imgs.map((i) => i.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = tileW * cols;
  canvas.height = tileH * rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      ctx.drawImage(imgs[idx], c * tileW, r * tileH, tileW, tileH);
    }
  }
  return canvasToCappedBlob(canvas, REFINE_MERGED_MAX_BYTES);
}

async function uploadBlob(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", new File([blob], `refine_${Date.now()}.png`, { type: "image/png" }));
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  const data = (await res.json()) as { url: string };
  return data.url;
}

function stripRuntimeOutputs(node: Node): Node {
  const fields = RUNTIME_FIELDS_BY_TYPE[node.type || ""];
  if (!fields) return node;
  const data = { ...(node.data as Record<string, unknown>) };
  for (const f of fields) delete data[f];
  return { ...node, data } as Node;
}

export function useWorkflowState(): WorkflowContextValue {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [executing, setExecuting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeIdRef = useRef<number | null>(null);

  // ── Undo / Redo ──────────────────────────────────────────────────
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const nodesRef = useRef<Node[]>(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef<Edge[]>(edges);
  edgesRef.current = edges;
  const isUndoRedoRef = useRef(false);

  const pushHistory = useCallback(() => {
    if (isUndoRedoRef.current) return;
    undoStack.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    isUndoRedoRef.current = true;
    setNodes(entry.nodes);
    setEdges(entry.edges);
    requestAnimationFrame(() => { isUndoRedoRef.current = false; });
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    isUndoRedoRef.current = true;
    setNodes(entry.nodes);
    setEdges(entry.edges);
    requestAnimationFrame(() => { isUndoRedoRef.current = false; });
  }, [setNodes, setEdges]);

  // Wrap change handlers to snapshot before structural changes
  const onNodesChange = useCallback((changes: any) => {
    const hasStructural = changes.some((c: any) => c.type === "remove" || c.type === "add");
    if (hasStructural) pushHistory();
    onNodesChangeBase(changes);
  }, [onNodesChangeBase, pushHistory]);

  const onEdgesChange = useCallback((changes: any) => {
    const hasStructural = changes.some((c: any) => c.type === "remove" || c.type === "add");
    if (hasStructural) pushHistory();
    onEdgesChangeBase(changes);
  }, [onEdgesChangeBase, pushHistory]);

  // Keyboard shortcut: Cmd+Z / Cmd+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const isAgent = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("agent") || params.get("mode") === "agent";
  }, []);

  useEffect(() => {
    if (isAgent) document.documentElement.setAttribute("data-agent", "");
  }, [isAgent]);

  // Load models + workflows on mount
  useEffect(() => {
    (async () => {
      try {
        const [wf, m] = await Promise.all([
          api<Workflow[]>("GET", "/api/workflows"),
          api<ModelOption[]>("GET", "/api/models"),
        ]);
        setModels(m);
        setWorkflows(wf);
        if (wf.length > 0) {
          await loadWorkflow(wf[0]);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadWorkflow = useCallback(async (wf: Workflow) => {
    setActiveWorkflow(wf);
    activeIdRef.current = wf.id;
    try {
      const parsed = JSON.parse(wf.nodes) as Node[];
      const parsedEdges = JSON.parse(wf.edges) as Edge[];
      setNodes(parsed);
      setEdges(parsedEdges);
      const gens = await api<Generation[]>("GET", `/api/generations/${wf.id}`);
      setGenerations(gens);
    } catch {
      setNodes([]);
      setEdges([]);
      setGenerations([]);
    }
  }, [setNodes, setEdges]);

  const createWorkflow = useCallback(async () => {
    try {
      const wf = await api<Workflow>("POST", "/api/workflows", {});
      setWorkflows((prev) => [wf, ...prev]);
      await loadWorkflow(wf);
    } catch (e) {
      setError(String(e));
    }
  }, [loadWorkflow]);

  const selectWorkflow = useCallback(async (id: number) => {
    const wf = workflows.find((w) => w.id === id);
    if (wf) await loadWorkflow(wf);
  }, [workflows, loadWorkflow]);

  const deleteWorkflow = useCallback(async (id: number) => {
    try {
      await api("DELETE", `/api/workflows/${id}`);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      if (activeIdRef.current === id) {
        setActiveWorkflow(null);
        setNodes([]);
        setEdges([]);
        setGenerations([]);
        activeIdRef.current = null;
      }
    } catch (e) {
      setError(String(e));
    }
  }, [setNodes, setEdges]);

  const renameWorkflow = useCallback(async (id: number, name: string) => {
    try {
      const wf = await api<Workflow>("PUT", `/api/workflows/${id}`, { name });
      setWorkflows((prev) => prev.map((w) => (w.id === id ? wf : w)));
      if (activeIdRef.current === id) setActiveWorkflow(wf);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    pushHistory();
    setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
  }, [setEdges, pushHistory]);

  const addNode = useCallback((type: string, position?: { x: number; y: number }) => {
    pushHistory();
    const pos = position || { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 };
    const id = nextNodeId();

    setNodes((nds) => {
      let data: Record<string, unknown>;
      switch (type) {
        case "prompt": {
          const existingLabels = new Set(nds.filter((n) => n.type === "prompt").map((n) => (n.data as Record<string, unknown>).label));
          let num = 1;
          while (existingLabels.has(`Prompt ${num}`)) num++;
          data = { label: `Prompt ${num}`, text: "" };
          break;
        }
        case "generateImage":
          data = { label: "Generate Image", model: "google/gemini-3.1-flash-image-preview", aspectRatio: "1:1", imageSize: "1K", status: "idle" };
          break;
        case "imageInput":
          data = { label: "Image Input", imageUrl: "" };
          break;
        case "analyze":
          data = { label: "Analyze", prompt: "Describe what you see.", model: "~google/gemini-flash-latest", outputFormat: "text", status: "idle" };
          break;
        case "refine":
          data = {
            label: "Refine",
            tilePrompts: ["", "", "", ""],
            tileEnabled: [true, true, true, true],
            grid: { rows: 2, cols: 2 },
            model: "google/gemini-3.1-flash-image-preview",
            status: "idle",
          };
          break;
        case "output":
          data = { label: "Output", imageUrl: "", text: "" };
          break;
        default:
          data = { label: type };
      }
      return [...nds, { id, type, position: pos, data } as Node];
    });
  }, [setNodes]);

  const updateNodeData = useCallback((nodeId: string, data: Partial<Record<string, unknown>>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
    );
  }, [setNodes, pushHistory]);

  const deleteNode = useCallback((nodeId: string) => {
    pushHistory();
    setNodes((nds) => {
      // Find the label of the node being deleted
      const deletedNode = nds.find((n) => n.id === nodeId);
      const deletedLabel = deletedNode ? ((deletedNode.data as Record<string, unknown>).label as string) || nodeId : nodeId;

      // Remove the node, and replace {{nodeId}} references in other prompt nodes with [Label]
      const pattern = new RegExp(`\\{\\{${nodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}\\}`, "g");
      return nds
        .filter((n) => n.id !== nodeId)
        .map((n) => {
          if (n.type !== "prompt") return n;
          const text = (n.data as Record<string, unknown>).text as string;
          if (!text || !pattern.test(text)) return n;
          pattern.lastIndex = 0;
          return { ...n, data: { ...n.data, text: text.replace(pattern, `[${deletedLabel}]`) } };
        });
    });
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges, pushHistory]);

  const saveWorkflow = useCallback(async () => {
    if (!activeIdRef.current) return;
    try {
      const wf = await api<Workflow>("PUT", `/api/workflows/${activeIdRef.current}`, {
        nodes: JSON.stringify(nodes.map(stripRuntimeOutputs)),
        edges: JSON.stringify(edges),
      });
      setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? wf : w)));
      setActiveWorkflow(wf);
    } catch (e) {
      setError(String(e));
    }
  }, [nodes, edges]);

  // ── Workflow execution engine ──────────────────────────────────

  type ExecOutputs = Map<string, { text?: string; promptText?: string; imageUrl?: string }>;

  const executeNode = useCallback(async (
    nodeId: string,
    nodeMap: Map<string, Node>,
    allEdges: Edge[],
    outputs: ExecOutputs,
  ) => {
        const node = nodeMap.get(nodeId);
        if (!node) return;

        // Gather inputs from connected source nodes
        const incoming = allEdges.filter((e) => e.target === nodeId);
        let inputText = "";
        let inputPromptText = "";
        const inputImages: string[] = [];
        for (const edge of incoming) {
          const out = outputs.get(edge.source);
          if (out?.text) inputText += (inputText ? "\n" : "") + out.text;
          if (out?.promptText && !out.text) {
            inputPromptText += (inputPromptText ? "\n" : "") + out.promptText;
          }
          if (out?.imageUrl) inputImages.push(out.imageUrl);
        }

        const data = node.data as Record<string, unknown>;

        switch (node.type) {
          case "prompt": {
            let text = (data.text as string) || "";
            // Resolve {{nodeId}} references — fall back to `result` (analyze nodes)
            text = text.replace(/\{\{(.+?)\}\}/g, (_match, refId: string) => {
              const ref = nodeMap.get(refId.trim());
              if (!ref) return _match;
              const refData = ref.data as Record<string, unknown>;
              return (refData.text as string) || (refData.result as string) || "";
            });
            outputs.set(nodeId, { text });
            break;
          }
          case "imageInput": {
            outputs.set(nodeId, { imageUrl: (data.imageUrl as string) || "" });
            break;
          }
          case "generateImage": {
            const prompt = inputText || inputPromptText || "A beautiful image";
            const model = (data.model as string) || "google/gemini-3.1-flash-image-preview";
            const aspectRatio = (data.aspectRatio as string) || "1:1";
            const imageSize = (data.imageSize as string) || "1K";

            updateNodeData(nodeId, { status: "running", error: undefined, imageUrl: undefined });

            try {
              const result = await api<{ images: Array<{ url: string }>; text?: string }>(
                "POST",
                "/api/generate",
                { prompt, model, aspect_ratio: aspectRatio, image_size: imageSize, input_images: inputImages.length ? inputImages : undefined }
              );

              const img = result.images[0];
              const imageUrl = img?.url || "";

              updateNodeData(nodeId, { status: "success", imageUrl, lastPrompt: prompt });
              outputs.set(nodeId, { imageUrl, text: result.text, promptText: prompt });

              // Save generation
              await api("POST", "/api/generations", {
                workflow_id: activeIdRef.current,
                node_id: nodeId,
                prompt,
                model,
                image_url: img?.url || null,
                status: "success",
              });
            } catch (e) {
              const errMsg = String(e);
              updateNodeData(nodeId, { status: "error", error: errMsg });
              outputs.set(nodeId, { promptText: prompt });

              await api("POST", "/api/generations", {
                workflow_id: activeIdRef.current,
                node_id: nodeId,
                prompt,
                model,
                image_url: null,
                status: "error",
                error: errMsg,
              });
            }
            break;
          }
          case "analyze": {
            const analyzePrompt = (data.prompt as string) || inputText || inputPromptText || "Describe this image.";
            const analyzeModel = (data.model as string) || "google/gemini-2.5-flash";
            const outputFormat = ((data.outputFormat as string) === "json" ? "json" : "text") as "json" | "text";
            if (inputImages.length === 0) {
              updateNodeData(nodeId, { status: "error", error: "No input image" });
              outputs.set(nodeId, { text: "" });
              break;
            }
            updateNodeData(nodeId, { status: "running", error: undefined });
            try {
              const out = await api<{ result: string }>(
                "POST",
                "/api/analyze",
                { prompt: analyzePrompt, model: analyzeModel, input_images: inputImages, output_format: outputFormat },
              );
              updateNodeData(nodeId, { status: "success", result: out.result });
              outputs.set(nodeId, { text: out.result });
            } catch (e) {
              const errMsg = String(e);
              updateNodeData(nodeId, { status: "error", error: errMsg });
              outputs.set(nodeId, { text: "" });
            }
            break;
          }
          case "refine": {
            const grid = (data.grid as { rows: number; cols: number }) || { rows: 2, cols: 2 };
            const tileCount = grid.rows * grid.cols;
            const tilePrompts = ((data.tilePrompts as string[]) || []).slice(0, tileCount);
            while (tilePrompts.length < tileCount) tilePrompts.push("");
            const tileEnabled = ((data.tileEnabled as boolean[]) || []).slice(0, tileCount);
            while (tileEnabled.length < tileCount) tileEnabled.push(true);
            const refineModel = (data.model as string) || "google/gemini-3.1-flash-image-preview";

            // Source handle ("source"): the GenerateImage node whose output we split into tiles.
            // Context handle ("context"): any other node — text gets prepended, images become extra references.
            const sourceEdges = incoming.filter((e) => (e as { targetHandle?: string }).targetHandle === "source");
            const contextEdges = incoming.filter((e) => (e as { targetHandle?: string }).targetHandle === "context");

            const sourceEdge = sourceEdges.find((e) => nodeMap.get(e.source)?.type === "generateImage");
            const sourceNode = sourceEdge ? nodeMap.get(sourceEdge.source) : undefined;
            const sourceUrl = sourceEdge ? outputs.get(sourceEdge.source)?.imageUrl : undefined;
            if (!sourceNode || !sourceUrl) {
              updateNodeData(nodeId, { status: "error", error: "Connect a Generate Image to the 'image' input." });
              outputs.set(nodeId, {});
              break;
            }
            const sourceData = sourceNode.data as Record<string, unknown>;
            const aspectRatio = (sourceData.aspectRatio as string) || "1:1";
            const tileSize = (sourceData.imageSize as string) || "1K";

            // Gather context: text from prompt/analyze nodes, images from imageInput/generateImage/refine.
            const contextTextParts: string[] = [];
            const contextImages: string[] = [];
            for (const edge of contextEdges) {
              const out = outputs.get(edge.source);
              if (!out) continue;
              if (out.text) contextTextParts.push(out.text);
              else if (out.promptText) contextTextParts.push(out.promptText);
              if (out.imageUrl) contextImages.push(out.imageUrl);
            }
            const contextText = contextTextParts.join("\n");

            updateNodeData(nodeId, { status: "running", error: undefined, imageUrl: undefined, lastSourceUrl: sourceUrl });

            try {
              const tiles = await splitImage(sourceUrl, grid.rows, grid.cols);
              const resultTiles = await Promise.all(
                tiles.map(async (tileDataUrl, idx) => {
                  if (!tileEnabled[idx]) return tileDataUrl;
                  const parts = [contextText.trim(), tilePrompts[idx].trim()].filter(Boolean);
                  const prompt = parts.length ? parts.join("\n") : "Refine this image region while keeping it visually consistent with the surrounding context.";
                  const result = await api<{ images: Array<{ url: string }> }>(
                    "POST",
                    "/api/generate",
                    {
                      prompt,
                      model: refineModel,
                      aspect_ratio: aspectRatio,
                      image_size: tileSize,
                      input_images: [tileDataUrl, ...contextImages],
                    },
                  );
                  const url = result.images[0]?.url;
                  if (!url) throw new Error(`Tile ${idx + 1} returned no image`);
                  return url;
                }),
              );
              const stitched = await stitchTiles(resultTiles, grid.rows, grid.cols);
              const finalUrl = await uploadBlob(stitched);
              updateNodeData(nodeId, { status: "success", imageUrl: finalUrl });
              outputs.set(nodeId, { imageUrl: finalUrl });
            } catch (e) {
              const errMsg = String(e);
              updateNodeData(nodeId, { status: "error", error: errMsg });
              outputs.set(nodeId, {});
            }
            break;
          }
          case "output": {
            const lastImage = inputImages[inputImages.length - 1] || "";
            updateNodeData(nodeId, {
              imageUrl: lastImage || undefined,
              text: inputText || undefined,
            });
            outputs.set(nodeId, { imageUrl: lastImage, text: inputText });
            break;
          }
        }
  }, [updateNodeData]);

  const executeWorkflow = useCallback(async () => {
    if (!activeIdRef.current || executing) return;
    setExecuting(true);
    setError(null);

    try {
      // Topological sort
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const inDegree = new Map<string, number>();
      const adjList = new Map<string, string[]>();

      nodes.forEach((n) => {
        inDegree.set(n.id, 0);
        adjList.set(n.id, []);
      });

      // Real edges + virtual edges from {{nodeId}} pill references inside prompt text.
      const allDeps: Array<{ source: string; target: string }> = edges.map((e) => ({ source: e.source, target: e.target }));
      for (const n of nodes) {
        if (n.type !== "prompt") continue;
        const text = ((n.data as Record<string, unknown>).text as string) || "";
        for (const m of text.matchAll(/\{\{(.+?)\}\}/g)) {
          const refId = m[1].trim();
          if (refId === n.id || !nodeMap.has(refId)) continue;
          if (allDeps.some((d) => d.source === refId && d.target === n.id)) continue;
          allDeps.push({ source: refId, target: n.id });
        }
      }
      allDeps.forEach((e) => {
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
        adjList.get(e.source)?.push(e.target);
      });

      const levels: string[][] = [];
      let frontier: string[] = [];
      inDegree.forEach((deg, id) => { if (deg === 0) frontier.push(id); });
      while (frontier.length > 0) {
        levels.push(frontier);
        const next: string[] = [];
        for (const id of frontier) {
          for (const child of adjList.get(id) || []) {
            const newDeg = (inDegree.get(child) || 1) - 1;
            inDegree.set(child, newDeg);
            if (newDeg === 0) next.push(child);
          }
        }
        frontier = next;
      }

      const outputs: ExecOutputs = new Map();
      for (const level of levels) {
        await Promise.allSettled(level.map((nid) => executeNode(nid, nodeMap, edges, outputs)));
      }

      await saveWorkflow();

      if (activeIdRef.current) {
        const gens = await api<Generation[]>("GET", `/api/generations/${activeIdRef.current}`);
        setGenerations(gens);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setExecuting(false);
    }
  }, [nodes, edges, executing, executeNode, saveWorkflow]);

  /**
   * Run a single node, reusing upstream nodes' previously-stored runtime
   * outputs as inputs. Useful for tweaking config (model, prompts) without
   * paying for the whole upstream chain again.
   */
  const runNode = useCallback(async (nodeId: string) => {
    if (!activeIdRef.current || executing) return;
    setExecuting(true);
    setError(null);

    try {
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const target = nodeMap.get(nodeId);
      if (!target) return;

      // Snapshot upstream outputs from each source node's persisted runtime data.
      const outputs: ExecOutputs = new Map();
      const incoming = edges.filter((e) => e.target === nodeId);
      for (const edge of incoming) {
        const src = nodeMap.get(edge.source);
        if (!src) continue;
        const d = src.data as Record<string, unknown>;
        const out: { text?: string; promptText?: string; imageUrl?: string } = {};
        const txt = (d.text as string) || (d.result as string);
        if (txt) out.text = txt;
        const img = d.imageUrl as string;
        if (img) out.imageUrl = img;
        const lastPrompt = d.lastPrompt as string;
        if (lastPrompt && !out.text) out.promptText = lastPrompt;
        outputs.set(edge.source, out);
      }

      await executeNode(nodeId, nodeMap, edges, outputs);

      if (activeIdRef.current) {
        const gens = await api<Generation[]>("GET", `/api/generations/${activeIdRef.current}`);
        setGenerations(gens);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setExecuting(false);
    }
  }, [nodes, edges, executing, executeNode]);

  const clearError = useCallback(() => setError(null), []);

  return {
    workflows,
    activeWorkflow,
    createWorkflow,
    selectWorkflow,
    deleteWorkflow,
    renameWorkflow,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNodeData,
    deleteNode,
    saveWorkflow,
    executeWorkflow,
    runNode,
    executing,
    models,
    generations,
    isAgent,
    loading,
    error,
    clearError,
  };
}
