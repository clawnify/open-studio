import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { query, get, run } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, "..", "..", "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const app = new OpenAPIHono();

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
  const row = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", id);
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
    name || "Untitled Workflow"
  );
  const row = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", result.lastInsertRowid);
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
  const existing = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", id);
  if (!existing) return c.json({ error: "Not found" }, 404);

  await run(
    `UPDATE workflows SET name = ?, nodes = ?, edges = ?, viewport = ?, updated_at = datetime('now') WHERE id = ?`,
    body.name ?? existing.name,
    body.nodes ?? existing.nodes,
    body.edges ?? existing.edges,
    body.viewport ?? existing.viewport,
    id
  );
  const row = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", id);
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
  await run("DELETE FROM workflows WHERE id = ?", id);
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
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(join(UPLOADS_DIR, filename), buffer);

  return c.json({ url: `/api/uploads/${filename}` }, 200);
});

app.get("/api/uploads/:filename", async (c) => {
  const { filename } = c.req.param();
  // Sanitize filename to prevent directory traversal
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = join(UPLOADS_DIR, safe);

  if (!existsSync(filePath)) {
    return c.json({ error: "Not found" }, 404);
  }

  const { readFileSync } = await import("fs");
  const data = readFileSync(filePath);
  const ext = safe.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };

  return new Response(data, {
    headers: { "Content-Type": mimeMap[ext || "png"] || "application/octet-stream", "Cache-Control": "public, max-age=31536000" },
  });
});

// ── Image generation (OpenRouter proxy) ──────────────────────────────

// Image-only models (no text output)
// Models that only output images (no text), use modalities: ["image"]
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
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return c.json({ error: "OPENROUTER_API_KEY env variable not set" }, 500);
  }

  try {
    const modalities = IMAGE_ONLY_MODELS.has(model) ? ["image"] : ["image", "text"];

    // Build message content: text + optional input images
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    if (input_images?.length) {
      for (const imgUrl of input_images) {
        let url = imgUrl;
        // Convert local uploads to base64 data URLs
        if (imgUrl.startsWith("/api/uploads/")) {
          const filename = imgUrl.replace("/api/uploads/", "").replace(/[^a-zA-Z0-9._-]/g, "");
          const filePath = join(UPLOADS_DIR, filename);
          if (existsSync(filePath)) {
            const { readFileSync } = await import("fs");
            const buf = readFileSync(filePath);
            const ext = filename.split(".").pop()?.toLowerCase() || "png";
            const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/png";
            url = `data:${mime};base64,${buf.toString("base64")}`;
          }
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

    // Download images locally so they persist
    const images: Array<{ url: string }> = [];
    for (const img of message?.images || []) {
      const remoteUrl = img.image_url.url;
      try {
        let buffer: Buffer;
        if (remoteUrl.startsWith("data:")) {
          // base64 data URL
          const base64 = remoteUrl.split(",")[1];
          buffer = Buffer.from(base64, "base64");
        } else {
          const imgRes = await fetch(remoteUrl);
          buffer = Buffer.from(await imgRes.arrayBuffer());
        }
        const filename = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        writeFileSync(join(UPLOADS_DIR, filename), buffer);
        images.push({ url: `/api/uploads/${filename}` });
      } catch {
        // Fallback to remote URL if download fails
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
    workflowId
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
    body.workflow_id,
    body.node_id,
    body.prompt,
    body.model,
    body.image_url,
    body.status,
    body.error ?? null
  );
  const row = await get<z.infer<typeof GenerationSchema>>("SELECT * FROM generations WHERE id = ?", result.lastInsertRowid);
  return c.json(row!, 200);
});

// ── OpenAPI doc ──────────────────────────────────────────────────────

app.doc("/openapi.json", { openapi: "3.0.0", info: { title: "Flow Studio API", version: "3.0.0" } });

export default app;
