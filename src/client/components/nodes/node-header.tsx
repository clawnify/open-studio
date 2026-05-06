import { useState, useRef, useEffect } from "react";
import { useWorkflow } from "../../context";

interface Props {
  id: string;
  label: string;
  icon: string;
  bgClass: string;
  textClass: string;
}

export function NodeHeader({ id, label, icon, bgClass, textClass }: Props) {
  const { updateNodeData, deleteNode } = useWorkflow();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== label) {
      updateNodeData(id, { label: trimmed });
    }
    setEditing(false);
  };

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-2 font-semibold text-[11px] uppercase tracking-wide border-b border-border-dim ${bgClass} ${textClass}`}>
      <span className="text-sm">{icon}</span>
      {editing ? (
        <input
          ref={inputRef}
          className="nodrag flex-1 bg-white border border-accent rounded text-gray-900 text-[11px] font-semibold px-1 py-0 outline-none uppercase"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span
          className="flex-1 cursor-text truncate"
          onDoubleClick={() => { setEditValue(label); setEditing(true); }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
