import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { initDB, query, get, run } from "./db.js";
import { initUploads, putUpload, getUpload, readUploadAsBase64DataUrl } from "./uploads.js";

type Env = { Bindings: { DB: D1Database; UPLOADS: R2Bucket; OPENROUTER_API_KEY: string } };

const app = new OpenAPIHono<Env>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || String(err) }, 500);
});

let schemaApplied = false;

app.use("*", async (c, next) => {
  initDB(c.env.DB);
  initUploads(c.env.UPLOADS);
  if (!schemaApplied) {
    await c.env.DB.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'Untitled Workflow',
        nodes TEXT NOT NULL DEFAULT '[]',
        edges TEXT NOT NULL DEFAULT '[]',
        viewport TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL DEFAULT 0,
        node_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model TEXT NOT NULL,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_generations_workflow ON generations(workflow_id);
    `);
    schemaApplied = true;
  }
  await next();
});

// ── Schemas ──────────────────────────────────────────────────────────

const WorkflowSchema = z.object({
  id: z.number(),
  name: z.string(),
  nodes: z.string(),
  edges: z.string(),
  viewport: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const ErrorSchema = z.object({ error: z.string() });

// ── List workflows ───────────────────────────────────────────────────

const listWorkflows = createRoute({
  method: "get",
  path: "/api/workflows",
  responses: { 200: { content: { "application/json": { schema: z.array(WorkflowSchema) } }, description: "OK" } },
});

app.openapi(listWorkflows, async (c) => {
  const rows = await query<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows ORDER BY updated_at DESC");
  return c.json(rows, 200);
});

// ── Get workflow ─────────────────────────────────────────────────────

const getWorkflow = createRoute({
  method: "get",
  path: "/api/workflows/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: WorkflowSchema } }, description: "OK" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

app.openapi(getWorkflow, async (c) => {
  const { id } = c.req.valid("param");
  const row = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row, 200);
});

// ── Create workflow ──────────────────────────────────────────────────

const createWorkflow = createRoute({
  method: "post",
  path: "/api/workflows",
  request: {
    body: { content: { "application/json": { schema: z.object({ name: z.string().optional() }) } } },
  },
  responses: { 200: { content: { "application/json": { schema: WorkflowSchema } }, description: "OK" } },
});

app.openapi(createWorkflow, async (c) => {
  const { name } = c.req.valid("json");
  const result = await run(
    "INSERT INTO workflows (name) VALUES (?)",
    [name || "Untitled Workflow"],
  );
  const row = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", [result.lastInsertRowid]);
  return c.json(row!, 200);
});

// ── Update workflow ──────────────────────────────────────────────────

const updateWorkflow = createRoute({
  method: "put",
  path: "/api/workflows/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().optional(),
            nodes: z.string().optional(),
            edges: z.string().optional(),
            viewport: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { "application/json": { schema: WorkflowSchema } }, description: "OK" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

app.openapi(updateWorkflow, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const existing = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);

  await run(
    `UPDATE workflows SET name = ?, nodes = ?, edges = ?, viewport = ?, updated_at = datetime('now') WHERE id = ?`,
    [body.name ?? existing.name, body.nodes ?? existing.nodes, body.edges ?? existing.edges, body.viewport ?? existing.viewport, id],
  );
  const row = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", [id]);
  return c.json(row!, 200);
});

// ── Delete workflow ──────────────────────────────────────────────────

const deleteWorkflow = createRoute({
  method: "delete",
  path: "/api/workflows/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: z.object({ ok: z.boolean() }) } }, description: "OK" },
  },
});

app.openapi(deleteWorkflow, async (c) => {
  const { id } = c.req.valid("param");
  await run("DELETE FROM workflows WHERE id = ?", [id]);
  return c.json({ ok: true }, 200);
});

// ── File uploads ─────────────────────────────────────────────────────

app.post("/api/uploads", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!file || typeof file === "string") {
    return c.json({ error: "No file provided" }, 400);
  }

  const ext = file.name?.split(".").pop()?.toLowerCase() || "png";
  const allowed = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
  if (!allowed.has(ext)) {
    return c.json({ error: "Unsupported file type" }, 400);
  }

  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const data = await file.arrayBuffer();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : "image/png";
  const url = await putUpload(filename, data, mime);

  return c.json({ url }, 200);
});

app.get("/api/uploads/:filename", async (c) => {
  const { filename } = c.req.param();
  const result = await getUpload(filename);
  if (!result) return c.json({ error: "Not found" }, 404);

  return new Response(result.data, {
    headers: { "Content-Type": result.contentType, "Cache-Control": "public, max-age=31536000" },
  });
});

// ── Image generation (OpenRouter proxy) ──────────────────────────────

const IMAGE_ONLY_MODELS = new Set([
  "black-forest-labs/flux.2-max",
  "black-forest-labs/flux.2-klein-4b",
  "sourceful/riverflow-v2-fast",
  "bytedance-seed/seedream-4.5",
]);

const generateImage = createRoute({
  method: "post",
  path: "/api/generate",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            prompt: z.string(),
            model: z.string().default("google/gemini-3.1-flash-image-preview"),
            aspect_ratio: z.string().default("1:1"),
            image_size: z.string().default("1K"),
            input_images: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            images: z.array(z.object({ url: z.string() })),
            text: z.string().optional(),
          }),
        },
      },
      description: "OK",
    },
    500: { content: { "application/json": { schema: ErrorSchema } }, description: "Error" },
  },
});

app.openapi(generateImage, async (c) => {
  const { prompt, model, aspect_ratio, image_size, input_images } = c.req.valid("json");
  const apiKey = c.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return c.json({ error: "OPENROUTER_API_KEY env variable not set" }, 500);
  }

  try {
    const modalities = IMAGE_ONLY_MODELS.has(model) ? ["image"] : ["image", "text"];

    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    if (input_images?.length) {
      for (const imgUrl of input_images) {
        let url = imgUrl;
        if (imgUrl.startsWith("/api/uploads/")) {
          const filename = imgUrl.replace("/api/uploads/", "");
          const dataUrl = await readUploadAsBase64DataUrl(filename);
          if (dataUrl) url = dataUrl;
        }
        content.push({ type: "image_url", image_url: { url } });
      }
    }
    content.push({ type: "text", text: prompt });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://openclaw.app",
        "X-Title": "Flow Studio",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        modalities,
        image_config: { aspect_ratio, image_size },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return c.json({ error: `OpenRouter error: ${err}` }, 500);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          images?: Array<{ image_url: { url: string } }>;
        };
      }>;
    };

    const message = data.choices?.[0]?.message;

    const images: Array<{ url: string }> = [];
    for (const img of message?.images || []) {
      const remoteUrl = img.image_url.url;
      try {
        let data: ArrayBuffer;
        if (remoteUrl.startsWith("data:")) {
          const base64 = remoteUrl.split(",")[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          data = bytes.buffer;
        } else {
          const imgRes = await fetch(remoteUrl);
          data = await imgRes.arrayBuffer();
        }
        const filename = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        const url = await putUpload(filename, data, "image/png");
        images.push({ url });
      } catch {
        images.push({ url: remoteUrl });
      }
    }

    return c.json({ images, text: message?.content || undefined }, 200);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ── List available models ────────────────────────────────────────────

const listModels = createRoute({
  method: "get",
  path: "/api/models",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(z.object({ id: z.string(), name: z.string() })),
        },
      },
      description: "OK",
    },
  },
});

app.openapi(listModels, async (c) => {
  const models = [
    { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image" },
    { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro Image" },
    { id: "openai/gpt-image-1", name: "GPT Image 1" },
    { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini" },
    { id: "openai/gpt-5-image", name: "GPT-5 Image" },
    { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image" },
    { id: "bytedance-seed/seedream-4.5", name: "SeedDream 4.5" },
    { id: "black-forest-labs/flux.2-max", name: "FLUX.2 Max" },
    { id: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 Klein 4B" },
    { id: "sourceful/riverflow-v2-fast", name: "Riverflow v2 Fast" },
  ];
  return c.json(models, 200);
});

// ── Generations history ──────────────────────────────────────────────

const GenerationSchema = z.object({
  id: z.number(),
  workflow_id: z.number(),
  node_id: z.string(),
  prompt: z.string(),
  model: z.string(),
  image_url: z.string().nullable(),
  status: z.string(),
  error: z.string().nullable(),
  created_at: z.string(),
});

const listGenerations = createRoute({
  method: "get",
  path: "/api/generations/{workflowId}",
  request: { params: z.object({ workflowId: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: z.array(GenerationSchema) } }, description: "OK" },
  },
});

app.openapi(listGenerations, async (c) => {
  const { workflowId } = c.req.valid("param");
  const rows = await query<z.infer<typeof GenerationSchema>>(
    "SELECT * FROM generations WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 50",
    [workflowId],
  );
  return c.json(rows, 200);
});

const saveGeneration = createRoute({
  method: "post",
  path: "/api/generations",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            workflow_id: z.number(),
            node_id: z.string(),
            prompt: z.string(),
            model: z.string(),
            image_url: z.string().nullable(),
            status: z.string(),
            error: z.string().nullable().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { "application/json": { schema: GenerationSchema } }, description: "OK" },
  },
});

app.openapi(saveGeneration, async (c) => {
  const body = c.req.valid("json");
  const result = await run(
    "INSERT INTO generations (workflow_id, node_id, prompt, model, image_url, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [body.workflow_id, body.node_id, body.prompt, body.model, body.image_url, body.status, body.error ?? null],
  );
  const row = await get<z.infer<typeof GenerationSchema>>("SELECT * FROM generations WHERE id = ?", [result.lastInsertRowid]);
  return c.json(row!, 200);
});

// ── Suggest node name ────────────────────────────────────────────────

app.post("/api/suggest-name", async (c) => {
  const { text, existingLabels } = await c.req.json<{ text: string; existingLabels?: string[] }>();
  if (!text?.trim()) return c.json({ name: "" }, 200);
  const apiKey = c.env.OPENROUTER_API_KEY;
  if (!apiKey) return c.json({ name: "" }, 200);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite-preview",
        messages: [
          { role: "system", content: `You extract a short 1-2 word title from text, using the broadest general category. Examples: "dog" → "Animal", "rose" → "Flower", "Ferrari" → "Car", "Paris at night" → "Location", "Tokyo street" → "Location", "a red sports car on a mountain" → "Vehicle", "sunset over ocean" → "Landscape". Always prefer the broadest category (Animal, Vehicle, Location, Landscape, Person, Food, Object, Building). If the text has no subject at all, return {"name":""}. Do NOT duplicate any of these existing labels: [${(existingLabels || []).join(", ")}]. Respond with JSON {"name":"..."} only.` },
          { role: "user", content: text.slice(0, 500) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 30,
      }),
    });
    if (!response.ok) return c.json({ name: "" }, 200);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    try {
      const parsed = JSON.parse(raw) as { name?: string };
      return c.json({ name: (parsed.name || "").slice(0, 40) }, 200);
    } catch {
      return c.json({ name: "" }, 200);
    }
  } catch {
    return c.json({ name: "" }, 200);
  }
});

// ── Public workflow list (with input schema) ─────────────────────────

app.get("/api/v1/workflows", async (c) => {
  const rows = await query<{ id: number; name: string; nodes: string; created_at: string; updated_at: string }>(
    "SELECT id, name, nodes, created_at, updated_at FROM workflows ORDER BY updated_at DESC",
  );

  const workflows = rows.map((wf) => {
    const nodes = JSON.parse(wf.nodes) as Array<{ id: string; type: string; data: Record<string, unknown> }>;
    const inputs = nodes
      .filter((n) => (n.type === "prompt" || n.type === "imageInput") && n.data.isInput)
      .map((n) => ({
        node_id: n.id,
        type: n.type === "prompt" ? "text" as const : "image_url" as const,
        label: (n.data.label as string) || n.id,
      }));
    return { id: wf.id, name: wf.name, inputs, created_at: wf.created_at, updated_at: wf.updated_at };
  });

  return c.json(workflows, 200);
});

// ── Execute workflow ──────────────────────────────────────────────────

app.post("/api/v1/workflows/:id/execute", async (c) => {
  const { id } = c.req.param();
  const apiKey = c.env.OPENROUTER_API_KEY;
  if (!apiKey) return c.json({ error: "OPENROUTER_API_KEY not set" }, 500);

  const wf = await get<{ id: number; nodes: string; edges: string }>(
    "SELECT id, nodes, edges FROM workflows WHERE id = ?", [id],
  );
  if (!wf) return c.json({ error: "Workflow not found" }, 404);

  const body = await c.req.json<{ inputs?: Record<string, string> }>().catch(() => ({ inputs: {} }));
  const inputOverrides = body.inputs || {};

  const nodes = JSON.parse(wf.nodes) as Array<{ id: string; type: string; data: Record<string, unknown> }>;
  const edges = JSON.parse(wf.edges) as Array<{ source: string; target: string }>;

  // Apply input overrides to isInput nodes
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const [nodeId, value] of Object.entries(inputOverrides)) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    if (node.type === "prompt" && node.data.isInput) {
      node.data.text = value;
    } else if (node.type === "imageInput" && node.data.isInput) {
      node.data.imageUrl = value;
    }
  }

  // Topological sort
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  nodes.forEach((n) => { inDegree.set(n.id, 0); adjList.set(n.id, []); });
  edges.forEach((e) => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    adjList.get(e.source)?.push(e.target);
  });

  const queue: string[] = [];
  inDegree.forEach((deg, nid) => { if (deg === 0) queue.push(nid); });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const nid = queue.shift()!;
    sorted.push(nid);
    for (const next of adjList.get(nid) || []) {
      const newDeg = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  // Execute nodes in topological order
  const outputs = new Map<string, { text?: string; imageUrl?: string }>();
  const results: Array<{ node_id: string; type: string; label: string; output: Record<string, unknown> }> = [];

  for (const nodeId of sorted) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const incoming = edges.filter((e) => e.target === nodeId);
    let inputText = "";
    const inputImages: string[] = [];
    for (const edge of incoming) {
      const out = outputs.get(edge.source);
      if (out?.text) inputText += (inputText ? "\n" : "") + out.text;
      if (out?.imageUrl) inputImages.push(out.imageUrl);
    }

    switch (node.type) {
      case "prompt": {
        let text = (node.data.text as string) || "";
        text = text.replace(/\{\{(.+?)\}\}/g, (_match, refId: string) => {
          const ref = nodeMap.get(refId.trim());
          return ref ? ((ref.data.text as string) || "") : _match;
        });
        outputs.set(nodeId, { text });
        results.push({ node_id: nodeId, type: "prompt", label: (node.data.label as string) || nodeId, output: { text } });
        break;
      }
      case "imageInput": {
        const imageUrl = (node.data.imageUrl as string) || "";
        outputs.set(nodeId, { imageUrl });
        results.push({ node_id: nodeId, type: "imageInput", label: (node.data.label as string) || nodeId, output: { imageUrl } });
        break;
      }
      case "generateImage": {
        const prompt = inputText || "A beautiful image";
        const model = (node.data.model as string) || "google/gemini-3.1-flash-image-preview";
        const aspectRatio = (node.data.aspectRatio as string) || "1:1";
        const imageSize = (node.data.imageSize as string) || "1K";

        const modalities = IMAGE_ONLY_MODELS.has(model) ? ["image"] : ["image", "text"];
        const msgContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        for (const imgUrl of inputImages) {
          let url = imgUrl;
          if (imgUrl.startsWith("/api/uploads/")) {
            const dataUrl = await readUploadAsBase64DataUrl(imgUrl.replace("/api/uploads/", ""));
            if (dataUrl) url = dataUrl;
          }
          msgContent.push({ type: "image_url", image_url: { url } });
        }
        msgContent.push({ type: "text", text: prompt });

        try {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://openclaw.app",
              "X-Title": "Flow Studio",
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: msgContent }],
              modalities,
              image_config: { aspect_ratio: aspectRatio, image_size: imageSize },
            }),
          });

          if (!response.ok) {
            const err = await response.text();
            results.push({ node_id: nodeId, type: "generateImage", label: (node.data.label as string) || nodeId, output: { error: `OpenRouter error: ${err}` } });
            outputs.set(nodeId, { text: prompt });
            continue;
          }

          const genData = (await response.json()) as {
            choices?: Array<{ message?: { content?: string; images?: Array<{ image_url: { url: string } }> } }>;
          };
          const message = genData.choices?.[0]?.message;

          let imageUrl = "";
          for (const img of message?.images || []) {
            const remoteUrl = img.image_url.url;
            try {
              let imgData: ArrayBuffer;
              if (remoteUrl.startsWith("data:")) {
                const b64 = remoteUrl.split(",")[1];
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                imgData = bytes.buffer;
              } else {
                imgData = await (await fetch(remoteUrl)).arrayBuffer();
              }
              const fname = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
              imageUrl = await putUpload(fname, imgData, "image/png");
            } catch {
              imageUrl = remoteUrl;
            }
            break; // take first image
          }

          outputs.set(nodeId, { imageUrl, text: prompt });
          results.push({ node_id: nodeId, type: "generateImage", label: (node.data.label as string) || nodeId, output: { imageUrl, text: message?.content || undefined } });

          // Save generation
          await run(
            "INSERT INTO generations (workflow_id, node_id, prompt, model, image_url, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [wf.id, nodeId, prompt, model, imageUrl || null, "success", null],
          );
        } catch (err) {
          outputs.set(nodeId, { text: prompt });
          results.push({ node_id: nodeId, type: "generateImage", label: (node.data.label as string) || nodeId, output: { error: String(err) } });
          await run(
            "INSERT INTO generations (workflow_id, node_id, prompt, model, image_url, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [wf.id, nodeId, prompt, model, null, "error", String(err)],
          );
        }
        break;
      }
      case "output": {
        const lastImage = inputImages[inputImages.length - 1] || "";
        outputs.set(nodeId, { imageUrl: lastImage, text: inputText });
        results.push({ node_id: nodeId, type: "output", label: (node.data.label as string) || nodeId, output: { imageUrl: lastImage || undefined, text: inputText || undefined } });
        break;
      }
    }
  }

  // Return output nodes as the primary result
  const outputNodes = results.filter((r) => r.type === "output");
  return c.json({
    workflow_id: wf.id,
    outputs: outputNodes.map((r) => r.output),
    all_nodes: results,
  }, 200);
});

// ── OpenAPI doc ──────────────────────────────────────────────────────

app.doc("/openapi.json", { openapi: "3.0.0", info: { title: "Flow Studio API", version: "3.0.0" } });

export default app;
