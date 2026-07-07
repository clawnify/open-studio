import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Node } from "@xyflow/react";

const ZWS = "​";

/** Build a lookup from referenceable node ID → label. Callers filter the input array. */
function buildLabelMap(nodes: Node[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of nodes) {
    map.set(n.id, ((n.data as Record<string, unknown>).label as string) || n.id);
  }
  return map;
}

/** Render `{{nodeId}}` tokens as readable pill spans with the label. */
function textToHtml(text: string, labelMap: Map<string, string>): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\{\{(.+?)\}\}/g, (_m, nodeId) => {
      const label = labelMap.get(nodeId);
      const detached = !label ? " prompt-pill--detached" : "";
      const display = label || nodeId;
      return `${ZWS}<span class="prompt-pill${detached}" contenteditable="false" data-node-id="${nodeId.replace(/"/g, "&quot;")}">${display}</span>${ZWS}`;
    })
    .replace(/\n/g, "<br>");
}

/** Walk the contenteditable's DOM and reconstruct the raw text with `{{nodeId}}` tokens. */
function domToText(el: HTMLElement): string {
  let result = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += (node.textContent || "").replace(/​/g, "");
    } else if (node instanceof HTMLElement) {
      if (node.classList.contains("prompt-pill")) {
        const nodeId = node.getAttribute("data-node-id");
        result += nodeId ? `{{${nodeId}}}` : node.textContent || "";
      } else if (node.tagName === "BR") {
        result += "\n";
      } else if (node.tagName === "DIV") {
        if (result.length > 0 && !result.endsWith("\n")) result += "\n";
        result += domToText(node);
      } else {
        result += domToText(node);
      }
    }
  }
  return result;
}

/** Caret offset measured in the same coordinate system as `domToText` (so `{{id}}` counts as its literal length). */
function caretDomTextOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const target = range.startContainer;
  const targetOffset = range.startOffset;

  let count = 0;
  let done = false;

  function visit(node: globalThis.Node, isRoot = false) {
    if (done) return;
    if (node === target) {
      if (node.nodeType === globalThis.Node.TEXT_NODE) {
        count += (node.textContent || "").slice(0, targetOffset).replace(/​/g, "").length;
      } else {
        const kids = Array.from(node.childNodes);
        for (let i = 0; i < targetOffset && i < kids.length; i++) {
          visit(kids[i]);
          if (done) return;
        }
      }
      done = true;
      return;
    }
    if (node.nodeType === globalThis.Node.TEXT_NODE) {
      count += (node.textContent || "").replace(/​/g, "").length;
      return;
    }
    if (node instanceof HTMLElement) {
      if (node.classList.contains("prompt-pill")) {
        const nodeId = node.getAttribute("data-node-id") || "";
        count += `{{${nodeId}}}`.length;
        return;
      }
      if (node.tagName === "BR") {
        count += 1;
        return;
      }
      if (node.tagName === "DIV" && !isRoot) {
        if (count > 0) count += 1;
      }
      for (const child of node.childNodes) {
        visit(child);
        if (done) return;
      }
    }
  }

  visit(el, true);
  return count;
}

/** Restore caret to a domToText-coordinate offset. */
function restoreCaretPos(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  let remaining = offset;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
  let node: globalThis.Node | null;

  while ((node = walker.nextNode())) {
    if (node.nodeType === globalThis.Node.TEXT_NODE) {
      const len = (node.textContent || "").length;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      remaining -= len;
    } else if (node instanceof HTMLElement && node.classList.contains("prompt-pill")) {
      const nodeId = node.getAttribute("data-node-id") || "";
      const pillTextLen = `{{${nodeId}}}`.length;
      if (remaining <= pillTextLen) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      remaining -= pillTextLen;
      walker.nextNode();
    }
  }

  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** Nodes that can be referenced via the slash menu — caller filters out self / non-referenceable types. */
  referenceNodes: Node[];
  placeholder?: string;
  className?: string;
  /** Inline style overrides — most useful for minHeight/maxHeight. */
  style?: React.CSSProperties;
  onBlur?: () => void;
  /** When true, autofocus on mount. */
  autoFocus?: boolean;
}

/**
 * Contenteditable editor used by Prompt + Analyze nodes. Renders `{{nodeId}}`
 * tokens as readable pill chips, supports `/` to open a reference picker, and
 * preserves caret position across re-renders.
 */
export function PillEditor({ value, onChange, referenceNodes, placeholder, className, style, onBlur, autoFocus }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuFilter, setMenuFilter] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const slashPosRef = useRef<number | null>(null);
  const suppressSyncRef = useRef(false);

  const labelMap = useMemo(() => buildLabelMap(referenceNodes), [referenceNodes]);

  const filtered = referenceNodes.filter((n) => {
    const label = (n.data as Record<string, unknown>).label as string;
    return !menuFilter || (label || "").toLowerCase().includes(menuFilter.toLowerCase());
  });

  useEffect(() => {
    if (showMenu) setMenuIndex(0);
  }, [showMenu, menuFilter]);

  // Initial render of pills from text.
  useEffect(() => {
    const el = editorRef.current;
    if (el && value) el.innerHTML = textToHtml(value, labelMap);
    if (autoFocus) el?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value sync (e.g. workflow load).
  useEffect(() => {
    if (suppressSyncRef.current) {
      suppressSyncRef.current = false;
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    const current = domToText(el);
    if (current !== (value || "")) {
      el.innerHTML = textToHtml(value || "", labelMap);
    }
  }, [value, labelMap]);

  // Only re-paint pills when the referenced labels themselves change.
  const referencedLabelsKey = useMemo(() => {
    const text = value || "";
    const ids = Array.from(text.matchAll(/\{\{(.+?)\}\}/g)).map((m) => m[1]);
    return ids.map((rid) => `${rid}:${labelMap.get(rid) ?? ""}`).join("|");
  }, [value, labelMap]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!/\{\{.+?\}\}/.test(value || "")) return;
    el.innerHTML = textToHtml(value || "", labelMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referencedLabelsKey]);

  const insertReference = useCallback((nodeId: string) => {
    const el = editorRef.current;
    if (!el) return;

    const text = domToText(el);
    const slashPos = slashPosRef.current;
    if (slashPos === null) return;
    const slashIdx = slashPos - 1;
    if (slashIdx < 0 || text[slashIdx] !== "/") return;

    const before = text.slice(0, slashIdx);
    const after = text.slice(slashPos + menuFilter.length);
    const ref = `{{${nodeId}}}`;
    const newText = before + ref + after;

    suppressSyncRef.current = true;
    onChange(newText);
    el.innerHTML = textToHtml(newText, labelMap);

    setShowMenu(false);
    setMenuFilter("");
    slashPosRef.current = null;

    requestAnimationFrame(() => {
      el.focus();
      restoreCaretPos(el, before.length + ref.length);
    });
  }, [onChange, labelMap, menuFilter]);

  const onInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = domToText(el);
    suppressSyncRef.current = true;
    onChange(text);

    if (showMenu && slashPosRef.current !== null) {
      const caretPos = caretDomTextOffset(el);
      const typed = text.slice(slashPosRef.current, Math.max(caretPos, slashPosRef.current));
      if (typed.length > 30 || (typed.includes(" ") && typed.length > 15)) {
        setShowMenu(false);
        slashPosRef.current = null;
      } else {
        setMenuFilter(typed);
      }
    }
  }, [onChange, showMenu]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();

    if (!showMenu && e.key === "/" && referenceNodes.length > 0) {
      const el = editorRef.current;
      if (!el) return;
      slashPosRef.current = caretDomTextOffset(el) + 1;
      setShowMenu(true);
      setMenuFilter("");
      return;
    }

    if (showMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered.length > 0) {
          e.preventDefault();
          insertReference(filtered[menuIndex].id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowMenu(false);
        slashPosRef.current = null;
      } else if (e.key === "Backspace") {
        const el = editorRef.current;
        if (el && slashPosRef.current !== null) {
          const caretPos = caretDomTextOffset(el);
          if (caretPos <= slashPosRef.current - 1) {
            setShowMenu(false);
            slashPosRef.current = null;
          }
        }
      }
    }
  }, [showMenu, filtered, menuIndex, referenceNodes.length, insertReference]);

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        className={className ?? "prompt-editor nodrag nowheel w-full bg-surface-sunken border border-border rounded-sm text-foreground text-xs p-1.5 outline-none transition-colors focus:border-ring"}
        style={{ minHeight: "64px", maxHeight: "240px", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", ...style }}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onBlur={() => { setTimeout(() => setShowMenu(false), 200); onBlur?.(); }}
        data-placeholder={referenceNodes.length > 0 ? (placeholder ?? "Type / to reference another node...") : (placeholder ?? "Enter your prompt...")}
      />
      {showMenu && filtered.length > 0 && (
        <div className="nodrag absolute left-0 right-0 top-full mt-0.5 bg-surface border border-border rounded-md z-50 overflow-hidden">
          <div className="px-2 py-1 text-[10px] text-muted uppercase tracking-wide border-b border-border">Insert reference</div>
          {filtered.map((n, i) => {
            const label = (n.data as Record<string, unknown>).label as string;
            const nd = n.data as Record<string, unknown>;
            const preview = ((nd.text as string) || (nd.prompt as string) || (nd.result as string) || "").trim();
            const typeBadge = n.type === "analyze" ? "Analyze" : "Prompt";
            return (
              <button
                key={n.id}
                className={`nodrag w-full text-left px-2 py-1.5 border-none cursor-pointer text-xs flex flex-col gap-0.5 ${
                  i === menuIndex ? "bg-surface-sunken text-foreground" : "bg-transparent text-muted hover:bg-surface-sunken"
                }`}
                onMouseDown={(e) => { e.preventDefault(); insertReference(n.id); }}
              >
                <span className="font-semibold flex items-center gap-1.5">
                  {label}
                  <span className="text-[9px] uppercase tracking-wide text-faint font-medium">{typeBadge}</span>
                </span>
                {preview && <span className="text-[10px] text-faint truncate">{preview.slice(0, 50)}{preview.length > 50 ? "..." : ""}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
