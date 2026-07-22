import { createApp, createRoute, z, OpenAPIHono } from "@clawnify/app";
import { query, get, run } from "./db.js";
import { initUploads, putUpload, getUpload, deleteUpload, readUploadAsBase64DataUrl } from "./uploads.js";

type Env = { Bindings: { DB: D1Database; UPLOADS: R2Bucket; OPENROUTER_API_KEY: string; FAL_API_KEY: string; OPENAI_API_KEY?: string; ANTHROPIC_API_KEY?: string } };

const app = createApp<Env>({
  title: "Open Studio",
  version: "1.0.0",
  description: "Node-based AI image workflow studio — generate, analyze, refine, and upscale images.",
});
// Public sub-app — every route here MUST be registered with publicApp.openapi(...)
// so it shows up in /api/v1/openapi.json. Internal routes stay on `app` and are
// excluded from the public spec by virtue of living in a different app instance.
const publicApp = new OpenAPIHono<Env>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || String(err) }, 500);
});

// D1 initDB is baked into createApp — only uploads need per-request init here.
app.use("*", async (c, next) => {
  initUploads(c.env.UPLOADS);
  await next();
});

// One-shot, additive-only schema bootstrap. Only called from routes that
// need the newer tables/columns (workflow_runs, generations.run_id), so a
// hang here can't take down /api/workflows etc. Every statement is
// CREATE IF NOT EXISTS or ALTER TABLE ADD COLUMN with per-statement
// try/catch and a 3s timeout — never drops or rewrites data, safe to re-run.
let schemaReady: Promise<void> | null = null;
function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return schemaReady;
  const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("schema statement timed out")), ms)),
  ]);
  schemaReady = (async () => {
    const statements: string[] = [
      `CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        snapshot TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id)`,
      `ALTER TABLE generations ADD COLUMN run_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_generations_run ON generations(run_id)`,
    ];
    for (const sql of statements) {
      try {
        await withTimeout(db.prepare(sql).run(), 3000);
      } catch {
        // Already applied, or transient — skip. We retry next isolate.
      }
    }
  })();
  // If the whole thing throws somehow, reset so the next request can retry.
  schemaReady.catch(() => { schemaReady = null; });
  return schemaReady;
}

// ── Schemas ──────────────────────────────────────────────────────────

const WorkflowSchema = z.object({
  id: z.string(),
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
  const id = crypto.randomUUID();
  await run(
    "INSERT INTO workflows (id, name) VALUES (?, ?)",
    [id, name || "Untitled Workflow"],
  );
  const row = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", [id]);
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

// ── Duplicate workflow ───────────────────────────────────────────────

const duplicateWorkflow = createRoute({
  method: "post",
  path: "/api/workflows/{id}/duplicate",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: WorkflowSchema } }, description: "OK" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

app.openapi(duplicateWorkflow, async (c) => {
  const { id } = c.req.valid("param");
  const existing = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);

  // Strip runtime/output fields so the duplicate starts fresh — same logic
  // as the client's stripRuntimeOutputs but mirrored here for the server path.
  const runtimeFields: Record<string, readonly string[]> = {
    generateImage: ["status", "imageUrl", "error", "lastPrompt"],
    analyze: ["status", "result", "error"],
    output: ["imageUrl", "text"],
    refine: ["status", "imageUrls", "error", "lastSourceUrl"],
    upscale: ["status", "imageUrl", "error"],
  };
  let cleanedNodes = existing.nodes;
  try {
    const parsed = JSON.parse(existing.nodes) as Array<{ type?: string; data?: Record<string, unknown> }>;
    for (const n of parsed) {
      const fields = runtimeFields[n.type || ""];
      if (!fields || !n.data) continue;
      for (const f of fields) delete n.data[f];
    }
    cleanedNodes = JSON.stringify(parsed);
  } catch {
    // If parsing fails, fall back to the raw nodes string — duplicate still works.
  }

  const newId = crypto.randomUUID();
  await run(
    "INSERT INTO workflows (id, name, nodes, edges, viewport) VALUES (?, ?, ?, ?, ?)",
    [newId, `${existing.name} (Copy)`, cleanedNodes, existing.edges, existing.viewport],
  );
  const row = await get<z.infer<typeof WorkflowSchema>>("SELECT * FROM workflows WHERE id = ?", [newId]);
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

// Explicit allowlist of models that get routed to OpenAI's REST API directly
// (when OPENAI_API_KEY is set). The `openai/` prefix alone is NOT enough since
// OpenRouter also uses it (e.g. openai/gpt-image-1 lives there).
const OPENAI_DIRECT_MODELS = new Set([
  "openai/gpt-image-2",
  "openai/gpt-image-2-2026-04-21",
]);

// fal.ai text-to-image models routed directly to fal.run (when FAL_API_KEY is
// set). All entries share the FLUX input schema (prompt + image_size enum +
// num_images + output_format) so a single request builder covers them — adding
// another FLUX-schema model is one line here. These are text-to-image only;
// image editing (reference images) stays on the Gemini/OpenAI paths.
const FAL_IMAGE_MODELS = new Map<string, string>([
  ["fal-ai/flux/schnell", "FLUX.1 [schnell] (fal)"],
  ["fal-ai/flux/dev", "FLUX.1 [dev] (fal)"],
  ["fal-ai/flux-pro/v1.1", "FLUX1.1 [pro] (fal)"],
]);

/** Map an aspect ratio to fal.ai's named `image_size` enum (always valid). */
function falImageSize(aspectRatio: string): string {
  const [aw, ah] = aspectRatio.split(":").map(Number);
  if (!aw || !ah) return "square_hd";
  const ratio = aw / ah;
  if (ratio > 1.5) return "landscape_16_9";
  if (ratio > 1.05) return "landscape_4_3";
  if (ratio < 0.67) return "portrait_16_9";
  if (ratio < 0.95) return "portrait_4_3";
  return "square_hd";
}

/**
 * Map an aspect ratio to one of the four sizes `/v1/images/edits` accepts —
 * the edits endpoint only allows: `auto`, `1024x1024`, `1536x1024`, `1024x1536`.
 * Unlike `openaiSize()` which produces arbitrary resolutions for the
 * generations endpoint, this picks the closest standard portrait/landscape/
 * square based on the ratio.
 */
function openaiEditSize(aspectRatio: string): "auto" | "1024x1024" | "1536x1024" | "1024x1536" {
  const [aw, ah] = aspectRatio.split(":").map(Number);
  if (!aw || !ah) return "1024x1024";
  const ratio = aw / ah;
  if (ratio > 1.15) return "1536x1024";
  if (ratio < 0.87) return "1024x1536";
  return "1024x1024";
}

// gpt-image-2 isn't currently supported on /v1/images/edits — when the user
// selects it but provides input images (so we route through edits), fall back
// to the latest edit-capable model.
const OPENAI_EDIT_FALLBACK = "gpt-image-1.5";
const OPENAI_EDIT_SUPPORTED = new Set([
  "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini", "chatgpt-image-latest",
]);

/**
 * Map our (aspect_ratio, image_size) tuple to an OpenAI-supported `size`.
 * Pins the shorter edge to a tier-specific resolution and scales the longer
 * edge per the ratio, then clamps to OpenAI's 3840-px max and rounds to 16-px
 * multiples (their image-gen requirement).
 */
function openaiSize(aspectRatio: string, imageSize: string): string {
  const [aw, ah] = aspectRatio.split(":").map(Number);
  if (!aw || !ah) return "1024x1024";
  const ratio = aw / ah;

  const shortEdgeByTier: Record<string, number> = {
    "0.5K": 768,
    "1K": 1024,
    "2K": 1536,
    "4K": 2160,
  };
  const shortPx = shortEdgeByTier[imageSize] || 1024;

  let w: number, h: number;
  if (ratio >= 1) { h = shortPx; w = Math.round(h * ratio); }
  else { w = shortPx; h = Math.round(w / ratio); }

  // Clamp the longer edge to OpenAI's max (3840px), keeping the ratio.
  if (w > 3840) { h = Math.round((h * 3840) / w); w = 3840; }
  if (h > 3840) { w = Math.round((w * 3840) / h); h = 3840; }

  // Round to 16-px multiples per OpenAI's constraint.
  w = Math.max(16, Math.round(w / 16) * 16);
  h = Math.max(16, Math.round(h / 16) * 16);

  return `${w}x${h}`;
}

/**
 * Retry transient 5xx + 429 from upstream providers (OpenAI's own Cloudflare
 * edge returns 520 fairly often under load — same backoff strategy as our
 * `fetchWithRetry` for OpenRouter).
 */
async function fetchWith5xxRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  let delay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    const isRetryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
    if (!isRetryable || attempt === maxRetries) return res;
    const retryAfter = res.headers.get("retry-after");
    const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 10000) : delay;
    await new Promise((r) => setTimeout(r, waitMs));
    delay = Math.min(delay * 2, 10000);
  }
  return fetch(url, init); // unreachable
}

/**
 * OpenAI's edge returns Cloudflare HTML error pages on 5xx — surfacing those
 * verbatim into our error messages is noisy. Detect HTML responses and
 * collapse them to a human-readable "Upstream 502 Bad Gateway" line.
 */
function summarizeUpstreamError(status: number, body: string): string {
  const looksLikeHtml = /<!doctype html>|<html\b/i.test(body.slice(0, 200));
  if (looksLikeHtml) {
    const statusNames: Record<number, string> = {
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
      504: "Gateway Timeout",
      520: "Web Server Returned an Unknown Error",
      521: "Web Server Is Down",
      522: "Connection Timed Out",
      524: "A Timeout Occurred",
    };
    return `${status} ${statusNames[status] || "Upstream Error"} — retried but upstream still failing`;
  }
  return `status ${status}: ${body.slice(0, 400)}`;
}

/** Resolve any image reference our client might pass (/api/uploads/*, data URL, or absolute URL) to a Blob. */
async function resolveImageToBlob(url: string): Promise<Blob> {
  if (url.startsWith("/api/uploads/")) {
    const filename = url.replace("/api/uploads/", "");
    const result = await getUpload(filename);
    if (!result) throw new Error(`Upload not found: ${filename}`);
    return new Blob([result.data], { type: result.contentType || "image/png" });
  }
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) throw new Error("Invalid data URL");
    const [, mime, b64] = match;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${url.slice(0, 80)}`);
  return await res.blob();
}

/** Parse OpenAI image-generation response → save each returned image to R2. */
async function uploadOpenAIImages(data: { data?: Array<{ b64_json?: string; url?: string }> }): Promise<Array<{ url: string }>> {
  const images: Array<{ url: string }> = [];
  for (const img of data.data || []) {
    let imgData: ArrayBuffer | null = null;
    if (img.b64_json) {
      const bin = atob(img.b64_json);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      imgData = bytes.buffer;
    } else if (img.url) {
      try {
        imgData = await (await fetch(img.url)).arrayBuffer();
      } catch {}
    }
    if (!imgData) continue;
    const filename = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    const url = await putUpload(filename, imgData, "image/png");
    images.push({ url });
  }
  return images;
}

const OPENAI_PROMPT_MAX_CHARS = 32000;

function assertPromptLength(prompt: string) {
  if (prompt.length > OPENAI_PROMPT_MAX_CHARS) {
    throw new Error(
      `Prompt is ${prompt.length} characters, exceeds OpenAI's ${OPENAI_PROMPT_MAX_CHARS}-character limit for GPT image models. Shorten the prompt or break the chain.`,
    );
  }
}

/** Call OpenAI's image generation endpoint and return uploaded image URLs. */
async function generateImageOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: string,
  imageSize: string,
  quality?: "auto" | "low" | "medium" | "high",
): Promise<{ images: Array<{ url: string }> }> {
  assertPromptLength(prompt);
  const size = openaiSize(aspectRatio, imageSize);
  const body: Record<string, unknown> = { model, prompt, size };
  if (quality) body.quality = quality;
  const res = await fetchWith5xxRetry("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI error: ${summarizeUpstreamError(res.status, rawText)}`);
  }
  let data: { data?: Array<{ b64_json?: string; url?: string }> };
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`OpenAI returned non-JSON (status ${res.status}): ${rawText.slice(0, 400)}`);
  }
  return { images: await uploadOpenAIImages(data) };
}

/** Encode a Blob as a base64 data URL for inclusion in OpenAI's JSON `images` array. */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

/** Call OpenAI's image edits endpoint with one or more reference images. */
async function editImageOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  inputImages: string[],
  aspectRatio: string,
  _imageSize: string,
  quality?: "auto" | "low" | "medium" | "high",
): Promise<{ images: Array<{ url: string }> }> {
  assertPromptLength(prompt);
  // gpt-image-2 isn't on the edits enum — substitute the latest supported model.
  const editModel = OPENAI_EDIT_SUPPORTED.has(model) ? model : OPENAI_EDIT_FALLBACK;
  const size = openaiEditSize(aspectRatio);

  // Resolve each input to a data URL for the JSON-based `images` array.
  const images = await Promise.all(
    inputImages.map(async (url) => ({ image_url: await blobToDataUrl(await resolveImageToBlob(url)) })),
  );

  const body: Record<string, unknown> = {
    model: editModel,
    prompt,
    images,
    size,
  };
  if (quality) body.quality = quality;

  const res = await fetchWith5xxRetry("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI edit error: ${summarizeUpstreamError(res.status, rawText)}`);
  }
  let data: { data?: Array<{ b64_json?: string; url?: string }> };
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`OpenAI returned non-JSON (status ${res.status}): ${rawText.slice(0, 400)}`);
  }
  return { images: await uploadOpenAIImages(data) };
}

/** Call a fal.ai FLUX-schema text-to-image model and re-host results in R2. */
async function generateImageFal(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: string,
): Promise<{ images: Array<{ url: string }> }> {
  const res = await fetchWith5xxRetry(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: falImageSize(aspectRatio),
      num_images: 1,
      output_format: "png",
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`fal.ai error: ${summarizeUpstreamError(res.status, rawText)}`);
  }
  let data: { images?: Array<{ url?: string }> };
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`fal.ai returned non-JSON (status ${res.status}): ${rawText.slice(0, 400)}`);
  }

  // Download + re-host each returned image in R2 so URLs are stable + same-origin.
  const images: Array<{ url: string }> = [];
  for (const img of data.images || []) {
    if (!img.url) continue;
    try {
      const imgData = await (await fetch(img.url)).arrayBuffer();
      const filename = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      images.push({ url: await putUpload(filename, imgData, "image/png") });
    } catch {
      images.push({ url: img.url });
    }
  }
  return { images };
}

/** Call OpenRouter's chat-completions image path and re-host results in R2. */
async function generateImageOpenRouter(
  apiKey: string,
  params: { model: string; prompt: string; aspect_ratio: string; image_size: string; input_images?: string[] },
  opts?: { onRateLimit?: () => void },
): Promise<{ images: Array<{ url: string }>; text?: string }> {
  const { model, prompt, aspect_ratio, image_size, input_images } = params;
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

  // Content-level retry: OpenRouter occasionally returns 200 OK with an HTML
  // Cloudflare error page (or wraps one inside message.content). fetchWithRetry
  // only retries on 5xx, so this outer loop re-fires on HTML/unparseable bodies.
  const MAX_CONTENT_ATTEMPTS = 3;
  let lastError: Error | null = null;
  let data: {
    choices?: Array<{ message?: { content?: string; images?: Array<{ image_url: { url: string } }> } }>;
  } | null = null;
  for (let attempt = 0; attempt < MAX_CONTENT_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://clawnify.com",
          "X-Title": "Clawnify",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          modalities,
          image_config: { aspect_ratio, image_size },
        }),
      }, { onRateLimit: opts?.onRateLimit });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter error: ${summarizeUpstreamError(response.status, err)}`);
      }

      const rawText = await response.text();
      if (looksLikeHtml(rawText)) {
        throw new Error("OpenRouter returned an HTML page instead of JSON — retrying.");
      }
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`OpenRouter returned non-JSON (status ${response.status}, ${rawText.length} bytes): ${rawText.slice(0, 400)}`);
      }
      const innerContent = data?.choices?.[0]?.message?.content || "";
      if (looksLikeHtml(innerContent)) {
        throw new Error("Model content was an HTML page — retrying.");
      }
      break; // success
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      data = null;
      if (attempt < MAX_CONTENT_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  if (!data) {
    throw lastError || new Error("OpenRouter generate failed after retries");
  }

  const message = data.choices?.[0]?.message;
  const images: Array<{ url: string }> = [];
  for (const img of message?.images || []) {
    const remoteUrl = img.image_url.url;
    try {
      let bytesBuf: ArrayBuffer;
      if (remoteUrl.startsWith("data:")) {
        const base64 = remoteUrl.split(",")[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        bytesBuf = bytes.buffer;
      } else {
        bytesBuf = await (await fetch(remoteUrl)).arrayBuffer();
      }
      const filename = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
      images.push({ url: await putUpload(filename, bytesBuf, "image/png") });
    } catch {
      images.push({ url: remoteUrl });
    }
  }
  return { images, text: message?.content || undefined };
}

/**
 * Single image-generation dispatcher shared by the per-node `/api/generate`
 * route and the v1 batch executor, so provider routing lives in exactly one
 * place. Order: OpenAI-direct allowlist → fal.ai text-to-image → OpenRouter
 * (the default for every other model). Throws on missing keys / unsupported
 * combinations so callers surface a clear error.
 */
async function routeImageGeneration(
  env: Env["Bindings"],
  params: {
    model: string;
    prompt: string;
    aspect_ratio: string;
    image_size: string;
    quality?: "auto" | "low" | "medium" | "high";
    input_images?: string[];
  },
  opts?: { onRateLimit?: () => void },
): Promise<{ images: Array<{ url: string }>; text?: string }> {
  const { model, prompt, aspect_ratio, image_size, quality, input_images } = params;

  if (OPENAI_DIRECT_MODELS.has(model)) {
    if (!env.OPENAI_API_KEY) {
      throw new Error(`Model ${model} requires OPENAI_API_KEY to be configured in the app's environment. Set it in the Clawnify dashboard, or pick a different model.`);
    }
    const openaiModel = model.replace(/^openai\//, "");
    return input_images && input_images.length > 0
      ? await editImageOpenAI(env.OPENAI_API_KEY, openaiModel, prompt, input_images, aspect_ratio, image_size, quality)
      : await generateImageOpenAI(env.OPENAI_API_KEY, openaiModel, prompt, aspect_ratio, image_size, quality);
  }

  if (FAL_IMAGE_MODELS.has(model)) {
    if (!env.FAL_API_KEY) {
      throw new Error(`Model ${model} requires FAL_API_KEY to be configured in the app's environment. Set it in the Clawnify dashboard, or pick a different model.`);
    }
    if (input_images && input_images.length > 0) {
      throw new Error(`${FAL_IMAGE_MODELS.get(model)} is text-to-image only — remove the reference image, or use a Gemini / GPT Image model for image editing.`);
    }
    return await generateImageFal(env.FAL_API_KEY, model, prompt, aspect_ratio);
  }

  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY env variable not set");
  }
  return await generateImageOpenRouter(
    env.OPENROUTER_API_KEY,
    { model, prompt, aspect_ratio, image_size, input_images },
    opts,
  );
}

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
            quality: z.enum(["auto", "low", "medium", "high"]).optional(),
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
  const { prompt, model, aspect_ratio, image_size, quality, input_images } = c.req.valid("json");
  try {
    const result = await routeImageGeneration(c.env, {
      model, prompt, aspect_ratio, image_size, quality, input_images,
    });
    return c.json(result, 200);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
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
          schema: z.array(z.object({
            id: z.string(),
            name: z.string(),
            provider: z.enum(["openrouter", "openai", "fal"]).optional(),
          })),
        },
      },
      description: "OK",
    },
  },
});

// ── Features (which providers are active based on env keys) ──────────

app.get("/api/features", (c) => {
  return c.json({
    openrouter: !!c.env.OPENROUTER_API_KEY,
    openai: !!c.env.OPENAI_API_KEY,
    fal: !!c.env.FAL_API_KEY,
    anthropic: !!c.env.ANTHROPIC_API_KEY,
  }, 200);
});

app.openapi(listModels, async (c) => {
  const hasOpenRouter = !!c.env.OPENROUTER_API_KEY;
  const hasOpenAI = !!c.env.OPENAI_API_KEY;
  const hasFal = !!c.env.FAL_API_KEY;
  const baseModels: Array<{ id: string; name: string }> = [
    { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image" },
    { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro Image" },
    { id: "openai/gpt-image-2-2026-04-21", name: "GPT Image 2 (2026-04-21 snapshot)" },
    { id: "openai/gpt-image-2", name: "GPT Image 2 (OpenAI direct)" },
    { id: "openai/gpt-image-1", name: "GPT Image 1" },
    { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini" },
    { id: "openai/gpt-5-image", name: "GPT-5 Image" },
    { id: "openai/gpt-5.4-image-2", name: "GPT-5.4 Image 2" },
    { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image" },
    { id: "bytedance-seed/seedream-4.5", name: "SeedDream 4.5" },
    { id: "black-forest-labs/flux.2-max", name: "FLUX.2 Max" },
    { id: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 Klein 4B" },
    { id: "sourceful/riverflow-v2-fast", name: "Riverflow v2 Fast" },
  ];
  const models = baseModels
    .map((m) => ({
      ...m,
      provider: (OPENAI_DIRECT_MODELS.has(m.id) ? "openai" : "openrouter") as "openai" | "openrouter" | "fal",
    }))
    .filter((m) => (m.provider === "openai" ? hasOpenAI : hasOpenRouter));
  const falModels = hasFal
    ? Array.from(FAL_IMAGE_MODELS.entries()).map(([id, name]) => ({ id, name, provider: "fal" as const }))
    : [];
  return c.json([...models, ...falModels], 200);
});

// ── Analyze (vision → text/JSON) ─────────────────────────────────────

// Curated OpenRouter vision aliases (the aggregator stays curated — live-listing
// its ~300 models would be noise). Direct providers with their own key are
// listed live from their catalog API instead (see listAnthropicModels).
const ANALYZE_MODELS = [
  { id: "~google/gemini-flash-latest", name: "Gemini Flash (latest)" },
  { id: "~google/gemini-pro-latest", name: "Gemini Pro (latest)" },
  { id: "~openai/gpt-mini-latest", name: "GPT Mini (latest)" },
  { id: "~openai/gpt-latest", name: "GPT (latest)" },
] as const;

/**
 * List Claude models live from Anthropic's own catalog API — the same pattern
 * the Clawnify dashboard's model picker uses (server-side so the key never
 * reaches the browser). Normalizes to the shared {id, name, provider} shape.
 */
async function listAnthropicModels(
  apiKey: string,
): Promise<Array<{ id: string; name: string; provider: "anthropic" }>> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
    return (data.data || []).map((m) => ({
      id: m.id,
      name: m.display_name || m.id,
      provider: "anthropic" as const,
    }));
  } catch {
    return [];
  }
}

/** Prefer a balanced Claude for prompt refinement; fall back to the first model. */
function pickRefineClaude(models: Array<{ id: string }>): string | null {
  if (models.length === 0) return null;
  const pref = ["sonnet", "haiku", "opus"];
  for (const tier of pref) {
    const hit = models.find((m) => m.id.toLowerCase().includes(tier));
    if (hit) return hit.id;
  }
  return models[0].id;
}

app.get("/api/analyze-models", async (c) => {
  const models: Array<{ id: string; name: string; provider: "openrouter" | "anthropic" }> = [
    ...ANALYZE_MODELS.map((m) => ({ ...m, provider: "openrouter" as const })),
  ];
  if (c.env.ANTHROPIC_API_KEY) {
    models.push(...(await listAnthropicModels(c.env.ANTHROPIC_API_KEY)));
  }
  return c.json(models, 200);
});

/**
 * Retry-on-429 wrapper. Honors `Retry-After` header (seconds) when present;
 * otherwise uses exponential backoff capped at 10s. The optional
 * `onRateLimit` callback is invoked the first time we see a 429 so callers
 * (e.g. the v1 execute handler) can shrink their concurrency limit live.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { maxRetries?: number; onRateLimit?: () => void } = {},
): Promise<Response> {
  const { maxRetries = 4, onRateLimit } = opts;
  let delay = 1000;
  let signaled = false;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt === maxRetries) return res;
    if (!signaled && onRateLimit) { onRateLimit(); signaled = true; }
    const retryAfter = res.headers.get("retry-after");
    const waitMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 10000) : delay;
    await new Promise((r) => setTimeout(r, waitMs));
    delay = Math.min(delay * 2, 10000);
  }
  return fetch(url, init); // unreachable, makes TS happy
}

/**
 * Adaptive concurrency limiter. Starts at `initialMax` slots; `shrink()` reduces
 * the slot count by 1 (floor of 1) for every subsequent acquire, useful when a
 * downstream upstream (OpenRouter) signals 429.
 */
function createLimiter(initialMax: number) {
  let max = initialMax;
  let active = 0;
  const queue: Array<() => void> = [];
  const tryNext = () => {
    while (active < max && queue.length > 0) {
      const w = queue.shift()!;
      active++;
      w();
    }
  };
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const exec = () => {
          fn().then(resolve, reject).finally(() => { active--; tryNext(); });
        };
        if (active < max) { active++; exec(); }
        else queue.push(exec);
      });
    },
    shrink() { if (max > 1) max--; },
    get max() { return max; },
  };
}

/**
 * Detect HTML in a response body (Cloudflare error pages occasionally come
 * back wrapped in a successful-looking JSON envelope from OpenRouter — and
 * sometimes show up as the model's literal content). We treat those as
 * transient and retry.
 */
function looksLikeHtml(text: string): boolean {
  return /^\s*<!doctype html>|^\s*<html\b/i.test(text);
}

async function runAnalyze(
  apiKey: string,
  prompt: string,
  model: string,
  inputImages: string[],
  outputFormat: "json" | "text",
  onRateLimit?: () => void,
): Promise<{ result: string }> {
  const msgContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  for (const imgUrl of inputImages) {
    let url = imgUrl;
    if (imgUrl.startsWith("/api/uploads/")) {
      const dataUrl = await readUploadAsBase64DataUrl(imgUrl.replace("/api/uploads/", ""));
      if (dataUrl) url = dataUrl;
    }
    msgContent.push({ type: "image_url", image_url: { url } });
  }
  const fullPrompt = outputFormat === "json"
    ? `${prompt}\n\nRespond with a single valid JSON object only — no prose, no markdown fences.`
    : prompt;
  msgContent.push({ type: "text", text: fullPrompt });

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: msgContent }],
  };
  if (outputFormat === "json") body.response_format = { type: "json_object" };

  // Content-level retry: OpenRouter occasionally returns a 200 OK with an
  // HTML Cloudflare error page (either as the body or wrapped in the JSON
  // envelope as message.content). fetchWithRetry only retries on 5xx status,
  // so we wrap with an extra loop that re-fires when the content is HTML.
  const MAX_CONTENT_ATTEMPTS = 3;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_CONTENT_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://clawnify.com",
          "X-Title": "Clawnify",
        },
        body: JSON.stringify(body),
      }, { onRateLimit });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter error: ${summarizeUpstreamError(response.status, err)}`);
      }
      const rawText = await response.text();
      if (looksLikeHtml(rawText)) {
        throw new Error("OpenRouter returned an HTML page instead of JSON — retrying.");
      }
      let data: { choices?: Array<{ message?: { content?: string } }> };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`OpenRouter returned non-JSON (status ${response.status}, ${rawText.length} bytes): ${rawText.slice(0, 400)}`);
      }
      let text = data.choices?.[0]?.message?.content?.trim() || "";
      if (looksLikeHtml(text)) {
        throw new Error("Model content was an HTML page — retrying.");
      }
      if (outputFormat === "json") {
        text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      }
      return { result: text };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_CONTENT_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError || new Error("Unknown error in runAnalyze");
}

/** Vision analyze via Anthropic's Messages API (direct, not through OpenRouter). */
async function runAnalyzeAnthropic(
  apiKey: string,
  prompt: string,
  model: string,
  inputImages: string[],
  outputFormat: "json" | "text",
): Promise<{ result: string }> {
  const content: Array<Record<string, unknown>> = [];
  for (const imgUrl of inputImages) {
    let dataUrl: string | null = null;
    if (imgUrl.startsWith("/api/uploads/")) {
      dataUrl = await readUploadAsBase64DataUrl(imgUrl.replace("/api/uploads/", ""));
    } else if (imgUrl.startsWith("data:")) {
      dataUrl = imgUrl;
    }
    if (dataUrl) {
      const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (m) {
        content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
        continue;
      }
    }
    // Public URL — let Anthropic fetch it directly.
    content.push({ type: "image", source: { type: "url", url: imgUrl } });
  }
  const fullPrompt = outputFormat === "json"
    ? `${prompt}\n\nRespond with a single valid JSON object only — no prose, no markdown fences.`
    : prompt;
  content.push({ type: "text", text: fullPrompt });

  const res = await fetchWith5xxRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: "user", content }] }),
  });
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic error: ${summarizeUpstreamError(res.status, rawText)}`);
  }
  let data: { content?: Array<{ type: string; text?: string }> };
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Anthropic returned non-JSON (status ${res.status}): ${rawText.slice(0, 400)}`);
  }
  let text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("")
    .trim();
  if (outputFormat === "json") {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return { result: text };
}

/**
 * Analyze dispatcher shared by /api/analyze and the v1 executor. Claude model
 * ids (they all start with "claude") route to Anthropic's Messages API when an
 * Anthropic key is configured; every other id goes through OpenRouter.
 */
async function routeAnalyze(
  env: Env["Bindings"],
  params: { prompt: string; model: string; inputImages: string[]; outputFormat: "json" | "text" },
  opts?: { onRateLimit?: () => void },
): Promise<{ result: string }> {
  const { prompt, model, inputImages, outputFormat } = params;
  if (model.startsWith("claude")) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(`Model ${model} requires ANTHROPIC_API_KEY to be configured. Set it in the Clawnify dashboard, or pick a different model.`);
    }
    return await runAnalyzeAnthropic(env.ANTHROPIC_API_KEY, prompt, model, inputImages, outputFormat);
  }
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }
  return await runAnalyze(env.OPENROUTER_API_KEY, prompt, model, inputImages, outputFormat, opts?.onRateLimit);
}

app.post("/api/analyze", async (c) => {
  const { prompt, model, input_images, output_format } = await c.req.json<{
    prompt: string;
    model: string;
    input_images?: string[];
    output_format?: "json" | "text";
  }>();
  if (!prompt) return c.json({ error: "prompt is required" }, 400);
  if (!input_images || input_images.length === 0) {
    return c.json({ error: "at least one input image is required" }, 400);
  }

  try {
    const out = await routeAnalyze(c.env, {
      prompt,
      model,
      inputImages: input_images,
      outputFormat: output_format || "text",
    });
    return c.json(out, 200);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ── Inpaint / mask edit (OpenAI gpt-image-2) ─────────────────────────

app.post("/api/edit-image", async (c) => {
  const apiKey = c.env.OPENAI_API_KEY;
  if (!apiKey) return c.json({ error: "OPENAI_API_KEY not set" }, 500);

  const { image_url, mask_data_url, prompt, model = OPENAI_EDIT_FALLBACK, quality } = await c.req.json<{
    image_url: string;
    mask_data_url: string;
    prompt: string;
    model?: string;
    quality?: "auto" | "low" | "medium" | "high";
  }>();
  if (!image_url || !mask_data_url || !prompt) {
    return c.json({ error: "image_url, mask_data_url and prompt are required" }, 400);
  }
  if (prompt.length > OPENAI_PROMPT_MAX_CHARS) {
    return c.json({
      error: `Prompt is ${prompt.length} characters, exceeds OpenAI's ${OPENAI_PROMPT_MAX_CHARS}-character limit.`,
    }, 400);
  }

  try {
    const editModel = OPENAI_EDIT_SUPPORTED.has(model) ? model : OPENAI_EDIT_FALLBACK;
    const imageDataUrl = await blobToDataUrl(await resolveImageToBlob(image_url));
    const maskDataUrl = await blobToDataUrl(await resolveImageToBlob(mask_data_url));

    const body: Record<string, unknown> = {
      model: editModel,
      prompt,
      images: [{ image_url: imageDataUrl }],
      mask: { image_url: maskDataUrl },
    };
    if (quality) body.quality = quality;

    const res = await fetchWith5xxRetry("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    if (!res.ok) {
      return c.json({ error: `OpenAI edit error: ${summarizeUpstreamError(res.status, rawText)}` }, 500);
    }
    let data: { data?: Array<{ b64_json?: string; url?: string }> };
    try {
      data = JSON.parse(rawText);
    } catch {
      return c.json({ error: `OpenAI returned non-JSON: ${rawText.slice(0, 400)}` }, 500);
    }
    const images = await uploadOpenAIImages(data);
    if (images.length === 0) return c.json({ error: "No image returned" }, 500);
    return c.json({ url: images[0].url }, 200);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ── Upscale (fal.ai SeedVR) ──────────────────────────────────────────

app.post("/api/upscale", async (c) => {
  const apiKey = c.env.FAL_API_KEY;
  if (!apiKey) return c.json({ error: "FAL_API_KEY not set" }, 500);

  const { image_url, upscale_factor, output_format } = await c.req.json<{
    image_url: string;
    upscale_factor?: number;
    output_format?: "jpg" | "png" | "webp";
  }>();
  if (!image_url) return c.json({ error: "image_url is required" }, 400);

  // Resolve /api/uploads/* to a base64 data URL so fal.ai can fetch it.
  let inputUrl = image_url;
  if (image_url.startsWith("/api/uploads/")) {
    const filename = image_url.replace("/api/uploads/", "");
    const dataUrl = await readUploadAsBase64DataUrl(filename);
    if (dataUrl) inputUrl = dataUrl;
  }

  const fmt = output_format || "jpg";

  try {
    const res = await fetch("https://fal.run/fal-ai/seedvr/upscale/image", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: inputUrl,
        upscale_mode: "factor",
        upscale_factor: upscale_factor ?? 2,
        output_format: fmt,
      }),
    });

    const rawText = await res.text();
    if (!res.ok) {
      return c.json({ error: `fal.ai error (status ${res.status}): ${rawText.slice(0, 400)}` }, 500);
    }
    let data: { image?: { url: string } };
    try {
      data = JSON.parse(rawText);
    } catch {
      return c.json({ error: `fal.ai returned non-JSON: ${rawText.slice(0, 400)}` }, 500);
    }
    const remoteUrl = data.image?.url;
    if (!remoteUrl) return c.json({ error: "fal.ai response missing image url" }, 500);

    try {
      const imgRes = await fetch(remoteUrl);
      const imgData = await imgRes.arrayBuffer();
      const mime = fmt === "png" ? "image/png" : fmt === "webp" ? "image/webp" : "image/jpeg";
      const filename = `upscale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fmt}`;
      const url = await putUpload(filename, imgData, mime);
      return c.json({ url }, 200);
    } catch {
      return c.json({ url: remoteUrl }, 200);
    }
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ── Workflow runs (snapshots of canvas state per execute) ───────────

const WorkflowRunSchema = z.object({
  id: z.string(),
  workflow_id: z.string(),
  snapshot: z.string().nullable(),
  status: z.string(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

app.post("/api/runs", async (c) => {
  await ensureSchema(c.env.DB);
  const { workflow_id } = await c.req.json<{ workflow_id: string }>();
  if (!workflow_id) return c.json({ error: "workflow_id required" }, 400);
  const runId = crypto.randomUUID();
  await run("INSERT INTO workflow_runs (id, workflow_id) VALUES (?, ?)", [runId, workflow_id]);
  const row = await get<z.infer<typeof WorkflowRunSchema>>("SELECT * FROM workflow_runs WHERE id = ?", [runId]);
  return c.json(row!, 200);
});

app.put("/api/runs/:id", async (c) => {
  await ensureSchema(c.env.DB);
  const id = c.req.param("id");
  const { snapshot, status } = await c.req.json<{ snapshot?: string; status?: string }>();
  const existing = await get<z.infer<typeof WorkflowRunSchema>>("SELECT * FROM workflow_runs WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Run not found" }, 404);
  await run(
    "UPDATE workflow_runs SET snapshot = ?, status = ?, completed_at = datetime('now') WHERE id = ?",
    [snapshot ?? existing.snapshot, status ?? existing.status, id],
  );
  // Trim to last 100 per workflow.
  await run(
    "DELETE FROM workflow_runs WHERE workflow_id = ? AND id NOT IN (SELECT id FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 100)",
    [existing.workflow_id, existing.workflow_id],
  );
  const row = await get<z.infer<typeof WorkflowRunSchema>>("SELECT * FROM workflow_runs WHERE id = ?", [id]);
  return c.json(row!, 200);
});

app.get("/api/runs/:id", async (c) => {
  await ensureSchema(c.env.DB);
  const id = c.req.param("id");
  const row = await get<z.infer<typeof WorkflowRunSchema>>("SELECT * FROM workflow_runs WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row, 200);
});

app.get("/api/runs/workflow/:workflowId", async (c) => {
  await ensureSchema(c.env.DB);
  const workflowId = c.req.param("workflowId");
  const rows = await query<z.infer<typeof WorkflowRunSchema>>(
    "SELECT id, workflow_id, status, created_at, completed_at, NULL as snapshot FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 100",
    [workflowId],
  );
  return c.json(rows, 200);
});

// ── Generations history ──────────────────────────────────────────────

const GenerationSchema = z.object({
  id: z.string(),
  workflow_id: z.string(),
  node_id: z.string(),
  prompt: z.string(),
  model: z.string(),
  image_url: z.string().nullable(),
  status: z.string(),
  error: z.string().nullable(),
  run_id: z.string().nullable().optional(),
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
            workflow_id: z.string(),
            node_id: z.string(),
            prompt: z.string(),
            model: z.string(),
            image_url: z.string().nullable(),
            status: z.string(),
            error: z.string().nullable().optional(),
            run_id: z.string().nullable().optional(),
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
  await ensureSchema(c.env.DB);
  const body = c.req.valid("json");
  const id = crypto.randomUUID();
  await run(
    "INSERT INTO generations (id, workflow_id, node_id, prompt, model, image_url, status, error, run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, body.workflow_id, body.node_id, body.prompt, body.model, body.image_url, body.status, body.error ?? null, body.run_id ?? null],
  );
  const row = await get<z.infer<typeof GenerationSchema>>("SELECT * FROM generations WHERE id = ?", [id]);
  return c.json(row!, 200);
});

app.delete("/api/generations/:id", async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Bad id" }, 400);
  const row = await get<{ image_url: string | null }>("SELECT image_url FROM generations WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  // Drop the R2 blob if it's ours (external URLs are left alone — they may be
  // shared by other rows or owned by the provider).
  if (row.image_url && row.image_url.startsWith("/api/uploads/")) {
    try { await deleteUpload(row.image_url.replace("/api/uploads/", "")); } catch {}
  }
  await run("DELETE FROM generations WHERE id = ?", [id]);
  return c.json({ ok: true }, 200);
});

// ── Suggest node name ────────────────────────────────────────────────

app.post("/api/suggest-name", async (c) => {
  const { text, existingLabels } = await c.req.json<{ text: string; existingLabels?: string[] }>();
  if (!text?.trim()) return c.json({ name: "" }, 200);
  const apiKey = c.env.OPENROUTER_API_KEY;
  if (!apiKey) return c.json({ name: "" }, 200);

  try {
    const response = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
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

// ── Refine prompt (text model — prefers Claude when configured) ──────

const REFINE_SYSTEM =
  "You are a prompt engineer for text-to-image models. Rewrite the user's prompt to be vivid, specific, and well structured — subject, style, lighting, composition, and key details — while preserving their original intent. Return ONLY the improved prompt as plain text: no preamble, no quotes, no markdown.";

app.post("/api/refine-prompt", async (c) => {
  const { text, instruction } = await c.req.json<{ text: string; instruction?: string }>();
  if (!text?.trim()) return c.json({ prompt: "" }, 200);
  const userMsg = instruction?.trim() ? `${text}\n\nAdditional instruction: ${instruction.trim()}` : text;

  try {
    // Prefer Claude when an Anthropic key is set — chosen live from its catalog.
    if (c.env.ANTHROPIC_API_KEY) {
      const model = pickRefineClaude(await listAnthropicModels(c.env.ANTHROPIC_API_KEY));
      if (model) {
        const res = await fetchWith5xxRetry("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": c.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 600,
            system: REFINE_SYSTEM,
            messages: [{ role: "user", content: userMsg }],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
          const prompt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();
          if (prompt) return c.json({ prompt, model }, 200);
        }
      }
    }

    // Fallback: OpenRouter text model.
    if (c.env.OPENROUTER_API_KEY) {
      const response = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://clawnify.com",
          "X-Title": "Clawnify",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite-preview",
          messages: [
            { role: "system", content: REFINE_SYSTEM },
            { role: "user", content: userMsg },
          ],
          max_tokens: 600,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const prompt = data.choices?.[0]?.message?.content?.trim() || "";
        if (prompt) return c.json({ prompt, model: "google/gemini-3.1-flash-lite-preview" }, 200);
      }
    }

    return c.json({ prompt: "", error: "No text model is configured for prompt refinement." }, 200);
  } catch (err) {
    return c.json({ prompt: "", error: err instanceof Error ? err.message : String(err) }, 200);
  }
});

// ── Public API (v1) ──────────────────────────────────────────────────

const PublicInputSchema = z.object({
  node_id: z.string(),
  type: z.enum(["text", "image_url"]),
  label: z.string(),
});

const PublicWorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  inputs: z.array(PublicInputSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

const ExecuteResultSchema = z.object({
  workflow_id: z.string(),
  outputs: z.array(z.record(z.unknown())),
  all_nodes: z.array(z.object({
    node_id: z.string(),
    type: z.string(),
    label: z.string(),
    output: z.record(z.unknown()),
  })),
});

const listPublicWorkflows = createRoute({
  method: "get",
  path: "/api/v1/workflows",
  tags: ["workflows"],
  summary: "List workflows with their input schema",
  responses: {
    200: { content: { "application/json": { schema: z.array(PublicWorkflowSchema) } }, description: "OK" },
  },
});

publicApp.openapi(listPublicWorkflows, async (c) => {
  const rows = await query<{ id: string; name: string; nodes: string; created_at: string; updated_at: string }>(
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

const executeWorkflow = createRoute({
  method: "post",
  path: "/api/v1/workflows/{id}/execute",
  tags: ["workflows"],
  summary: "Run a workflow with the given input overrides",
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            inputs: z.record(z.string()).optional().openapi({
              description: "Map of input node_id → value (text or image URL).",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { "application/json": { schema: ExecuteResultSchema } }, description: "OK" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Workflow not found" },
    500: { content: { "application/json": { schema: ErrorSchema } }, description: "Server error" },
  },
});

publicApp.openapi(executeWorkflow, async (c) => {
  const { id } = c.req.valid("param");
  // Per-node routing (routeImageGeneration / routeAnalyze) validates the key
  // each model actually needs, so no blanket OpenRouter-key guard here — a
  // Claude-only or fal-only workflow must still run.

  const wf = await get<{ id: string; nodes: string; edges: string }>(
    "SELECT id, nodes, edges FROM workflows WHERE id = ?", [id],
  );
  if (!wf) return c.json({ error: "Workflow not found" }, 404);

  const body = c.req.valid("json");
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

  // Real edges + virtual edges from {{nodeId}} pill references inside prompt text.
  const allDeps: Array<{ source: string; target: string }> = edges.map((e) => ({ source: e.source, target: e.target }));
  for (const n of nodes) {
    // Both prompt and analyze nodes can carry {{nodeId}} pill references.
    let text = "";
    if (n.type === "prompt") text = (n.data.text as string) || "";
    else if (n.type === "analyze") text = (n.data.prompt as string) || "";
    else continue;
    const matches = text.match(/\{\{(.+?)\}\}/g) || [];
    for (const m of matches) {
      const refId = m.slice(2, -2).trim();
      if (refId === n.id || !nodeMap.has(refId)) continue;
      if (allDeps.some((d) => d.source === refId && d.target === n.id)) continue;
      allDeps.push({ source: refId, target: n.id });
    }
  }
  allDeps.forEach((e) => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    adjList.get(e.source)?.push(e.target);
  });

  // Group nodes into topological *levels* — every node at a level depends only
  // on previous levels, so they're safe to execute in parallel.
  const levels: string[][] = [];
  let frontier: string[] = [];
  inDegree.forEach((deg, nid) => { if (deg === 0) frontier.push(nid); });
  while (frontier.length > 0) {
    levels.push(frontier);
    const next: string[] = [];
    for (const nid of frontier) {
      for (const child of adjList.get(nid) || []) {
        const newDeg = (inDegree.get(child) || 1) - 1;
        inDegree.set(child, newDeg);
        if (newDeg === 0) next.push(child);
      }
    }
    frontier = next;
  }

  const outputs = new Map<string, { text?: string; promptText?: string; imageUrl?: string }>();
  const results: Array<{ node_id: string; type: string; label: string; output: Record<string, unknown> }> = [];

  // Adaptive concurrency: starts at 8, shrinks by 1 on every 429 we observe.
  const limiter = createLimiter(8);

  const executeNode = async (nodeId: string) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const incoming = edges.filter((e) => e.target === nodeId);
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

    switch (node.type) {
      case "prompt": {
        let text = (node.data.text as string) || "";
        text = text.replace(/\{\{(.+?)\}\}/g, (_match, refId: string) => {
          const ref = nodeMap.get(refId.trim());
          if (!ref) return _match;
          return (ref.data.text as string) || (ref.data.result as string) || "";
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
        const prompt = inputText || inputPromptText || "A beautiful image";
        const model = (node.data.model as string) || "google/gemini-3.1-flash-image-preview";
        const aspectRatio = (node.data.aspectRatio as string) || "1:1";
        const imageSize = (node.data.imageSize as string) || "1K";

        try {
          const result = await routeImageGeneration(
            c.env,
            { model, prompt, aspect_ratio: aspectRatio, image_size: imageSize, input_images: inputImages },
            { onRateLimit: () => limiter.shrink() },
          );
          const imageUrl = result.images[0]?.url || "";
          outputs.set(nodeId, { imageUrl, text: result.text, promptText: prompt });
          results.push({ node_id: nodeId, type: "generateImage", label: (node.data.label as string) || nodeId, output: { imageUrl, text: result.text } });

          // Save generation
          await run(
            "INSERT INTO generations (id, workflow_id, node_id, prompt, model, image_url, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [crypto.randomUUID(), wf.id, nodeId, prompt, model, imageUrl || null, "success", null],
          );
        } catch (err) {
          outputs.set(nodeId, { promptText: prompt });
          results.push({ node_id: nodeId, type: "generateImage", label: (node.data.label as string) || nodeId, output: { error: String(err) } });
          await run(
            "INSERT INTO generations (id, workflow_id, node_id, prompt, model, image_url, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [crypto.randomUUID(), wf.id, nodeId, prompt, model, null, "error", String(err)],
          );
        }
        break;
      }
      case "analyze": {
        // Same {{nodeId}} resolution as the prompt case so analyze
        // instructions can reference upstream prompts/analyzes.
        const rawAnalyzePrompt = (node.data.prompt as string) || "";
        const resolvedAnalyzePrompt = rawAnalyzePrompt.replace(/\{\{(.+?)\}\}/g, (_match, refId: string) => {
          const cleanId = refId.trim();
          const resolved = outputs.get(cleanId);
          if (resolved?.text) return resolved.text;
          const ref = nodeMap.get(cleanId);
          if (!ref) return _match;
          const refData = ref.data as Record<string, unknown>;
          return (refData.text as string) || (refData.result as string) || "";
        });
        const analyzePrompt = resolvedAnalyzePrompt || inputText || inputPromptText || "Describe this image.";
        const analyzeModel = (node.data.model as string) || "~google/gemini-flash-latest";
        const outputFormat = ((node.data.outputFormat as string) === "json" ? "json" : "text") as "json" | "text";
        if (inputImages.length === 0) {
          results.push({ node_id: nodeId, type: "analyze", label: (node.data.label as string) || nodeId, output: { error: "No input image" } });
          break;
        }
        try {
          const out = await routeAnalyze(
            c.env,
            { prompt: analyzePrompt, model: analyzeModel, inputImages, outputFormat },
            { onRateLimit: () => limiter.shrink() },
          );
          outputs.set(nodeId, { text: out.result });
          results.push({ node_id: nodeId, type: "analyze", label: (node.data.label as string) || nodeId, output: { text: out.result, format: outputFormat } });
        } catch (err) {
          results.push({ node_id: nodeId, type: "analyze", label: (node.data.label as string) || nodeId, output: { error: String(err) } });
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
  };

  for (const level of levels) {
    await Promise.allSettled(level.map((nid) => limiter.run(() => executeNode(nid))));
  }

  // Treat any node with no outgoing edges as a workflow output (leaf). This
  // makes the dedicated Output node optional — wiring up to a leaf is the
  // implicit "this is what I want back" signal.
  const hasOutgoing = new Set(edges.map((e) => e.source));
  const leafResults = results.filter((r) => !hasOutgoing.has(r.node_id));
  return c.json({
    workflow_id: wf.id,
    outputs: leafResults.map((r) => ({ node_id: r.node_id, label: r.label, type: r.type, ...r.output })),
    all_nodes: results,
  }, 200);
});

// ── OpenAPI doc + mount public sub-app ───────────────────────────────

const publicSpec = {
  openapi: "3.0.0" as const,
  info: { title: "Open Studio API", version: "1.0.0" },
};

publicApp.doc("/openapi.json", publicSpec);

// Mirror the public spec at root /openapi.json so dashboards using the
// conventional path find it. Internal routes are still excluded because the
// document is generated from publicApp, not app.
app.get("/openapi.json", (c) => c.json(publicApp.getOpenAPIDocument(publicSpec)));

// Mount at root: publicApp's routes already carry their full /api/v1/... path,
// so paths in the spec match real URLs (no `servers` indirection needed).
app.route("/", publicApp);

export default app;
