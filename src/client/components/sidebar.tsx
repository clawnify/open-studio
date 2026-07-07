import { type DragEvent } from "react";
import { Pencil, Wand2, Camera, Search, LayoutGrid, Scaling, type LucideIcon } from "lucide-react";
import { useWorkflow } from "../context";

interface NodeTypeEntry {
  type: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  /** Feature flag this node depends on; node is hidden when the flag is false. */
  requires?: "openrouter" | "fal" | "imageGen";
}

const NODE_TYPES: NodeTypeEntry[] = [
  { type: "prompt", icon: Pencil, label: "Prompt", desc: "Text prompt input" },
  { type: "generateImage", icon: Wand2, label: "Generate Image", desc: "AI image generation", requires: "imageGen" },
  { type: "imageInput", icon: Camera, label: "Image Input", desc: "Reference image URL" },
  { type: "analyze", icon: Search, label: "Analyze", desc: "Vision → text/JSON", requires: "openrouter" },
  { type: "refine", icon: LayoutGrid, label: "Refine", desc: "Tile-based image refinement", requires: "imageGen" },
  { type: "upscale", icon: Scaling, label: "Upscale", desc: "fal.ai SeedVR image upscaler", requires: "fal" },
];

export function Sidebar() {
  const { features } = useWorkflow();
  const imageGenAvailable = features.openrouter || features.openai;
  const visibleNodeTypes = NODE_TYPES.filter((nt) => {
    if (!nt.requires) return true;
    if (nt.requires === "openrouter") return features.openrouter;
    if (nt.requires === "fal") return features.fal;
    if (nt.requires === "imageGen") return imageGenAvailable;
    return true;
  });

  const onDragStart = (e: DragEvent, type: string) => { e.dataTransfer?.setData("application/reactflow", type); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; };

  return (
    <aside className="w-[260px] bg-surface border-r border-border flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Nodes</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <p className="text-muted text-[11px] mb-2">Drag onto the canvas</p>
        {visibleNodeTypes.map((nt) => {
          const Icon = nt.icon;
          return (
            <div key={nt.type} className="flex items-center gap-2.5 p-2.5 bg-surface-sunken border border-border rounded-md cursor-grab mb-1.5 transition-all hover:border-border-strong active:cursor-grabbing" draggable onDragStart={(e) => onDragStart(e, nt.type)}>
              <Icon className="size-4 w-7 shrink-0 text-muted" strokeWidth={2} />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-foreground">{nt.label}</span>
                <span className="text-[11px] text-muted">{nt.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
