import { Handle, Position } from "@xyflow/react";
import { useWorkflow } from "../../context";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import type { RefineNodeData } from "../../types";

interface Props { id: string; data: RefineNodeData; }

export function RefineNode({ id, data }: Props) {
  const { updateNodeData, models, nodes, edges } = useWorkflow();

  const sourceConnected = edges.some((e) => e.target === id && (e as { targetHandle?: string }).targetHandle === "source");
  const contextConnected = edges.some((e) => e.target === id && (e as { targetHandle?: string }).targetHandle === "context");

  const grid = data.grid || { rows: 2, cols: 2 };

  const selectClass = "w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs py-1 px-2 outline-none cursor-pointer appearance-none focus:border-accent";

  return (
    <div className={`group flow-node refine-node status-${data.status} relative`} style={{ width: 280 }}>
      <NodeToolbar id={id} canRerun />
      <NodeHeader id={id} label={data.label} icon="&#9783;" bgClass="bg-fuchsia-50" textClass="text-fuchsia-600" />
      <div className="p-2.5 flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Model</label>
        <select className={selectClass} value={data.model} onChange={(e) => updateNodeData(id, { model: e.target.value })}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Tile Resolution</label>
        <select
          className={selectClass}
          value={data.tileImageSize || "1K"}
          onChange={(e) => updateNodeData(id, { tileImageSize: e.target.value })}
        >
          {["0.5K", "1K", "2K", "4K"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <p className="text-[10px] text-gray-400">Splits the source into {grid.rows}×{grid.cols} tiles, refines each, and outputs them as separate images. Connect to a Generate node to use all {grid.rows * grid.cols} as inputs. Keep ≤1K when chaining to another generate (model upload limit ~30MB).</p>

        {data.status === "running" && (
          <div className="flex items-center gap-1.5 text-[11px] p-1.5 rounded bg-fuchsia-50 text-fuchsia-600">
            <span className="spinner" /> Refining...
          </div>
        )}
        {data.status === "error" && (
          <div className="text-[11px] p-1.5 rounded bg-red-50 text-red-500 break-words">{data.error || "Refine failed"}</div>
        )}
        {data.status === "success" && data.imageUrls && data.imageUrls.length > 0 && (
          <div className="text-[11px] p-1.5 rounded bg-emerald-50 text-emerald-600">
            ✓ {data.imageUrls.length} tile{data.imageUrls.length === 1 ? "" : "s"} ready
          </div>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-emerald-500"
        id="source"
        style={{ top: "30%" }}
        isValidConnection={(conn) => {
          const src = nodes.find((n) => n.id === conn.source);
          return src?.type === "generateImage";
        }}
      />
      {!sourceConnected && (
        <span className="absolute text-[9px] font-semibold text-emerald-600 uppercase tracking-wide pointer-events-none" style={{ top: "calc(30% - 6px)", right: "calc(100% + 6px)" }}>image</span>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-blue-500"
        id="context"
        style={{ top: "70%" }}
      />
      {!contextConnected && (
        <span className="absolute text-[9px] font-semibold text-blue-600 uppercase tracking-wide pointer-events-none" style={{ top: "calc(70% - 6px)", right: "calc(100% + 6px)" }}>context</span>
      )}
      <Handle type="source" position={Position.Right} className="!bg-fuchsia-500" />
    </div>
  );
}
