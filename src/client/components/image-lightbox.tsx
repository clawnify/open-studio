import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Copy, Check, X } from "lucide-react";
import { downloadImage } from "../download";

interface Props {
  src: string | null;
  filename?: string;
  prompt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, filename, prompt, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!src) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [src, onClose]);

  useEffect(() => { if (!src) setCopied(false); }, [src]);

  const copyPrompt = async () => {
    if (!prompt) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(prompt);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = prompt;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  if (!src || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center cursor-pointer"
      onClick={onClose}
    >
      <img
        className="max-w-[90vw] max-h-[90vh] object-contain cursor-default shadow-md"
        src={src}
        alt="Full size"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      <button
        className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-xs text-white bg-black/70 hover:bg-black/90 border-none rounded-sm px-3 py-1.5 cursor-pointer"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close (Esc)"
      >
        <X size={14} /> Close
      </button>
      <div className="absolute top-4 right-4 flex gap-2">
        {prompt && (
          <button
            className="inline-flex items-center gap-1.5 text-xs text-white bg-black/70 hover:bg-black/90 border-none rounded-sm px-3 py-1.5 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); copyPrompt(); }}
            title="Copy prompt"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy prompt"}
          </button>
        )}
        <button
          className="inline-flex items-center gap-1.5 text-xs text-white bg-black/70 hover:bg-black/90 border-none rounded-sm px-3 py-1.5 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); downloadImage(src, filename); }}
          title="Download image"
        >
          <Download size={14} /> Download
        </button>
      </div>
      {prompt && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[80vw] text-[11px] text-white/90 bg-black/70 rounded-sm px-3 py-1.5 max-h-[20vh] overflow-y-auto whitespace-pre-wrap break-words cursor-default" onClick={(e) => e.stopPropagation()}>
          {prompt}
        </div>
      )}
    </div>,
    document.body,
  );
}
