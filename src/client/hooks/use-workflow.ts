import { useState, useEffect, useCallback, useRef, useMemo } from "preact/hooks";
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

export function useWorkflowState(): WorkflowContextValue {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState([]);
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
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
      });
      setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? wf : w)));
      setActiveWorkflow(wf);
    } catch (e) {
      setError(String(e));
    }
  }, [nodes, edges]);

  // ── Workflow execution engine ──────────────────────────────────

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

      edges.forEach((e) => {
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
        adjList.get(e.source)?.push(e.target);
      });

      const queue: string[] = [];
      inDegree.forEach((deg, id) => {
        if (deg === 0) queue.push(id);
      });

      const sorted: string[] = [];
      while (queue.length > 0) {
        const id = queue.shift()!;
        sorted.push(id);
        for (const next of adjList.get(id) || []) {
          const newDeg = (inDegree.get(next) || 1) - 1;
          inDegree.set(next, newDeg);
          if (newDeg === 0) queue.push(next);
        }
      }

      // Execute nodes in order, passing data through edges
      const outputs = new Map<string, { text?: string; imageUrl?: string }>();

      for (const nodeId of sorted) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;

        // Gather inputs from connected source nodes
        const incoming = edges.filter((e) => e.target === nodeId);
        let inputText = "";
        const inputImages: string[] = [];
        for (const edge of incoming) {
          const out = outputs.get(edge.source);
          if (out?.text) inputText += (inputText ? "\n" : "") + out.text;
          if (out?.imageUrl) inputImages.push(out.imageUrl);
        }

        const data = node.data as Record<string, unknown>;

        switch (node.type) {
          case "prompt": {
            let text = (data.text as string) || "";
            // Resolve {{nodeId}} references to other prompt nodes' text
            text = text.replace(/\{\{(.+?)\}\}/g, (_match, refId: string) => {
              const ref = nodeMap.get(refId.trim());
              if (!ref) return _match;
              const refData = ref.data as Record<string, unknown>;
              return (refData.text as string) || "";
            });
            outputs.set(nodeId, { text });
            break;
          }
          case "imageInput": {
            outputs.set(nodeId, { imageUrl: (data.imageUrl as string) || "" });
            break;
          }
          case "generateImage": {
            const prompt = inputText || "A beautiful image";
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

              updateNodeData(nodeId, { status: "success", imageUrl });
              outputs.set(nodeId, { imageUrl, text: prompt });

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
              outputs.set(nodeId, { text: prompt });

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
      }

      // Auto-save after execution
      await saveWorkflow();

      // Refresh generations
      if (activeIdRef.current) {
        const gens = await api<Generation[]>("GET", `/api/generations/${activeIdRef.current}`);
        setGenerations(gens);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setExecuting(false);
    }
  }, [nodes, edges, executing, updateNodeData, saveWorkflow]);

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
    executing,
    models,
    generations,
    isAgent,
    loading,
    error,
    clearError,
  };
}
