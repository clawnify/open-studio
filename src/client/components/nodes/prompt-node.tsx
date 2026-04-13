import { useState, useRef, useCallback, useEffect, useMemo } from "preact/hooks";
import { Handle, Position } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import { useWorkflow } from "../../context";
import { api } from "../../api";
import { NodeHeader } from "./node-header";
import { NodeToolbar } from "./node-toolbar";
import type { PromptNodeData } from "../../types";

interface Props { id: string; data: PromptNodeData; }

const ZWS = "\u200B";

/** Build a lookup from node ID → label for all prompt nodes */
function buildNodeMap(nodes: Node[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of nodes) {
    if (n.type === "prompt") {
      map.set(n.id, (n.data as Record<string, unknown>).label as string);
    }
  }
  return map;
}

/** Convert raw text with {{nodeId}} into HTML with pill spans showing labels */
function textToHtml(text: string, nodeMap: Map<string, string>): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\{\{(.+?)\}\}/g, (_m, nodeId) => {
      const label = nodeMap.get(nodeId);
      if (!label) {
        // Node doesn't exist — show as gray detached pill
        return `${ZWS}<span class="prompt-pill prompt-pill--detached" contenteditable="false" data-node-id="${nodeId.replace(/"/g, '&quot;')}">${nodeId}</span>${ZWS}`;
      }
      return `${ZWS}<span class="prompt-pill" contenteditable="false" data-node-id="${nodeId.replace(/"/g, '&quot;')}">${label}</span>${ZWS}`;
    })
    .replace(/\n/g, "<br>");
}

/** Extract plain text from the contenteditable DOM, storing {{nodeId}} */
function domToText(el: HTMLElement): string {
  let result = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += (node.textContent || "").replace(/\u200B/g, "");
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

function saveCaretPos(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(el);
  range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return range.toString().length;
}

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

export function PromptNode({ id, data }: Props) {
  const { updateNodeData, deleteNode, nodes } = useWorkflow();
  const [showMenu, setShowMenu] = useState(false);
  const [menuFilter, setMenuFilter] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const slashPosRef = useRef<number | null>(null);
  const suppressSyncRef = useRef(false);
  const autoNameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNamedText = useRef("");

  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);
  const nodeMapRef = useRef(nodeMap);
  nodeMapRef.current = nodeMap;
  const promptNodes = nodes.filter((n) => n.type === "prompt" && n.id !== id);

  // Refs for auto-name so the debounced callback always reads fresh values
  const dataRef = useRef(data);
  dataRef.current = data;
  const updateNodeDataRef = useRef(updateNodeData);
  updateNodeDataRef.current = updateNodeData;

  const runAutoName = useCallback(async () => {
    const currentData = dataRef.current;
    const map = nodeMapRef.current;
    if (!/^Prompt \d+$/.test(currentData.label)) return;

    const displayText = (currentData.text || "").replace(/\{\{(.+?)\}\}/g, (_m, refId) => {
      const label = map.get(refId);
      return label ? `{{${label}}}` : `{{${refId}}}`;
    }).trim();
    if (!displayText || displayText.length < 3) return;
    if (displayText === lastNamedText.current) return;

    try {
      const existingLabels = Array.from(nodeMapRef.current.values()).filter((l) => !/^Prompt \d+$/.test(l));
      const { name } = await api<{ name: string }>("POST", "/api/suggest-name", { text: displayText, existingLabels });
      if (name) {
        lastNamedText.current = displayText;
        updateNodeDataRef.current(id, { label: name });
      }
    } catch { /* ignore */ }
  }, [id]);

  const triggerAutoName = useCallback(() => {
    if (autoNameTimer.current) clearTimeout(autoNameTimer.current);
    autoNameTimer.current = setTimeout(runAutoName, 2000);
  }, [runAutoName]);

  const flushAutoName = useCallback(() => {
    if (autoNameTimer.current) clearTimeout(autoNameTimer.current);
    runAutoName();
  }, [runAutoName]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (autoNameTimer.current) clearTimeout(autoNameTimer.current); }, []);

  const filtered = promptNodes.filter((n) => {
    const label = (n.data as Record<string, unknown>).label as string;
    return !menuFilter || label.toLowerCase().includes(menuFilter.toLowerCase());
  });

  useEffect(() => {
    if (showMenu) setMenuIndex(0);
  }, [showMenu, menuFilter]);

  // Initial render
  useEffect(() => {
    const el = editorRef.current;
    if (el && data.text) {
      el.innerHTML = textToHtml(data.text, nodeMap);
    }
  }, []);

  // Sync from external data changes (e.g. undo, load)
  useEffect(() => {
    if (suppressSyncRef.current) {
      suppressSyncRef.current = false;
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    const current = domToText(el);
    if (current !== (data.text || "")) {
      el.innerHTML = textToHtml(data.text || "", nodeMap);
    }
  }, [data.text]);

  // Re-render pills when labels change (nodeMap updated)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (/\{\{.+?\}\}/.test(data.text || "")) {
      el.innerHTML = textToHtml(data.text || "", nodeMap);
    }
  }, [nodeMap]);

  const insertReference = useCallback((nodeId: string) => {
    const el = editorRef.current;
    if (!el) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const text = domToText(el);
    const caretPos = saveCaretPos(el);
    const slashIdx = text.lastIndexOf("/", caretPos - 1);
    if (slashIdx === -1) return;

    const before = text.slice(0, slashIdx);
    const after = text.slice(caretPos);
    const ref = `{{${nodeId}}}`;
    const newText = before + ref + after;

    suppressSyncRef.current = true;
    updateNodeData(id, { text: newText });
    el.innerHTML = textToHtml(newText, nodeMap);

    setShowMenu(false);
    setMenuFilter("");
    slashPosRef.current = null;

    requestAnimationFrame(() => {
      el.focus();
      restoreCaretPos(el, before.length + ref.length);
    });
  }, [id, updateNodeData, nodeMap]);

  const onInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = domToText(el);
    suppressSyncRef.current = true;
    updateNodeData(id, { text });

    if (showMenu && slashPosRef.current !== null) {
      const caretPos = saveCaretPos(el);
      const typed = text.slice(slashPosRef.current, caretPos);
      if (typed.length > 30 || (typed.includes(" ") && typed.length > 15)) {
        setShowMenu(false);
        slashPosRef.current = null;
      } else {
        setMenuFilter(typed);
      }
    }
  }, [id, updateNodeData, showMenu, triggerAutoName]);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    e.stopPropagation();

    if (!showMenu && e.key === "/" && promptNodes.length > 0) {
      const el = editorRef.current;
      if (!el) return;
      slashPosRef.current = saveCaretPos(el) + 1;
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
          const caretPos = saveCaretPos(el);
          if (caretPos <= slashPosRef.current - 1) {
            setShowMenu(false);
            slashPosRef.current = null;
          }
        }
      }
    }
  }, [showMenu, filtered, menuIndex, promptNodes.length, insertReference]);

  return (
    <div class="flow-node relative">
      <NodeToolbar id={id} isInput={data.isInput} onToggleInput={(v) => updateNodeData(id, { isInput: v })} />
      <NodeHeader id={id} label={data.label} icon="&#9998;" bgClass="bg-violet-50" textClass="text-violet-600" />
      <div class="p-2.5 flex flex-col gap-1.5 relative">
        <div
          ref={editorRef}
          contentEditable
          class="prompt-editor nodrag nowheel w-full bg-surface-card border border-border-dim rounded text-gray-800 text-xs p-1.5 outline-none transition-colors focus:border-accent"
          style={{ minHeight: "64px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onBlur={() => { setTimeout(() => setShowMenu(false), 200); flushAutoName(); }}
          data-placeholder={promptNodes.length > 0 ? "Type / to reference another prompt..." : "Enter your prompt..."}
        />
        {showMenu && filtered.length > 0 && (
          <div class="absolute left-2.5 right-2.5 top-full mt-0.5 bg-white border border-border-dim rounded-lg shadow-lg z-50 overflow-hidden">
            <div class="px-2 py-1 text-[10px] text-gray-400 uppercase tracking-wide border-b border-border-dim">Insert reference</div>
            {filtered.map((n, i) => {
              const label = (n.data as Record<string, unknown>).label as string;
              const text = (n.data as Record<string, unknown>).text as string;
              return (
                <button
                  key={n.id}
                  class={`w-full text-left px-2 py-1.5 border-none cursor-pointer text-xs flex flex-col gap-0.5 ${
                    i === menuIndex ? "bg-accent-light text-accent" : "bg-transparent text-gray-700 hover:bg-surface-card"
                  }`}
                  onMouseDown={(e) => { e.preventDefault(); insertReference(n.id); }}
                >
                  <span class="font-semibold">{label}</span>
                  {text && <span class="text-[10px] text-gray-400 truncate">{text.slice(0, 50)}{text.length > 50 ? "..." : ""}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />
      <Handle type="source" position={Position.Right} className="!bg-accent" />
    </div>
  );
}
