# OpenClaw Flow App: The Open-Source Higgsfield Alternative for SaaS

A visual AI image generation studio with a justified gallery and node-based workflow editor. Part of the [OpenClaw](https://github.com/openclaw/openclaw) ecosystem. Zero cloud dependencies — runs locally with SQLite.

Built with **Preact + Tailwind CSS + Hono + SQLite**. Ships with a dual-mode UI: a quick generation view (prompt → gallery) and a node-based workflow editor for building reusable pipelines.

## What Is It?

Clawnify Flow App is a production-ready AI image generation studio designed for the OpenClaw community. Think of it as an open-source Higgsfield alternative — a visual image generation tool you can self-host, customize, and embed in any SaaS product.

Unlike Higgsfield or Node Banana, this runs entirely on your own infrastructure. Bring your own OpenRouter API key, generate images with models like Gemini, FLUX, GPT Image, and more — all stored locally with no vendor lock-in.

## Features

- **Quick Generate** — Higgsfield-style prompt bar with model, aspect ratio, resolution, and batch count selectors
- **Justified gallery** — generated images displayed in a pixel-perfect justified layout preserving aspect ratios
- **Image-to-image** — drag a generated image or upload a file as source for the next generation
- **Node-based workflows** — React Flow editor for building reusable multi-step generation pipelines
- **10+ models** — Gemini 3.1 Flash, Gemini 3 Pro, GPT Image 1, FLUX.2 Max, SeedDream 4.5, and more via OpenRouter
- **Local file uploads** — reference images stored locally, served via the API
- **Generation history** — all generations persisted to SQLite with prompt, model, and image
- **Dual-mode UI** — human-optimized + AI-agent-optimized (`?agent=true`)
- **Lightbox** — click any image to view full-size
- **Drag-to-reuse** — drag generated images into the prompt bar to use as input for the next generation

## Quickstart

```bash
git clone https://github.com/clawnify/flow-app.git
cd flow-app
cp .env.example .env
# Add your OpenRouter API key to .env
pnpm install
pnpm run dev
```

Open `http://localhost:5177` in your browser. Data persists in `data.db`, uploads in `uploads/`.

### Agent Mode (for OpenClaw / Browser-Use)

Append `?agent=true` to the URL:

```
http://localhost:5177/?agent=true
```

This activates an agent-friendly UI with:
- Explicit delete buttons always visible (no hover-to-reveal)
- Large click targets for reliable browser automation
- All controls accessible without drag interactions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Preact, TypeScript, Tailwind CSS v4, Vite |
| **Node Editor** | React Flow (@xyflow/react) via Preact compat |
| **Backend** | Hono, Node.js |
| **Database** | SQLite (better-sqlite3) |
| **AI** | OpenRouter API (chat completions + image generation) |

### Prerequisites

- Node.js 20+
- pnpm (or npm/yarn)
- [OpenRouter API key](https://openrouter.ai/keys)

## Architecture

```
src/
  server/
    schema.sql  — SQLite schema (workflows, generations)
    db.ts       — SQLite wrapper
    index.ts    — Hono REST API (workflows, generations, uploads, generate proxy)
    dev.ts      — Dev server with .env loading
  client/
    app.tsx           — Root component with Generate/Workflows tab switch
    context.tsx       — Preact context for workflow state
    hooks/use-workflow.ts — Workflow + flow state management + execution engine
    components/
      quick-generate.tsx  — Higgsfield-style generation view with justified gallery
      workflow-canvas.tsx — React Flow canvas wrapper
      sidebar.tsx         — Workflow list + node palette + history
      toolbar.tsx         — Workflow name + save/execute buttons
      nodes/
        prompt-node.tsx       — Text prompt input node
        generate-node.tsx     — AI image generation node
        image-input-node.tsx  — Reference image upload node
        output-node.tsx       — Result display node
```

### Data Model

```sql
workflows   (id, name, nodes JSON, edges JSON, viewport JSON, created_at, updated_at)
generations (id, workflow_id, node_id, prompt, model, image_url, status, error, created_at)
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflows` | List all workflows |
| POST | `/api/workflows` | Create a workflow |
| GET | `/api/workflows/:id` | Get a workflow |
| PUT | `/api/workflows/:id` | Update a workflow |
| DELETE | `/api/workflows/:id` | Delete a workflow |
| POST | `/api/generate` | Generate image via OpenRouter |
| GET | `/api/models` | List available image models |
| GET | `/api/generations/:workflowId` | List generations for a workflow |
| POST | `/api/generations` | Save a generation record |
| POST | `/api/uploads` | Upload an image file |
| GET | `/api/uploads/:filename` | Serve an uploaded image |

## How Clawnify Uses This

[Clawnify](https://clawnify.com) uses this template as a starting point when AI agents request an image generation app via the App Builder. The `db.ts` file is swapped with a Cloudflare D1 adapter, uploads are routed to R2, the code is bundled, and deployed to Workers for Platforms. The rest of the app stays identical.

## Community & Contributions

This project is part of the [OpenClaw](https://github.com/openclaw/openclaw) ecosystem. Contributions are welcome — open an issue or submit a PR.

## License

MIT
