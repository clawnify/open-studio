/**
 * Trigger a browser download for an image URL. Fetches as a blob so the
 * `download` filename actually sticks even when the URL is cross-origin (the
 * `<a download>` attribute is silently ignored without same-origin or CORS).
 * If the fetch is blocked (CORS, network), falls back to opening the image in
 * a new tab so the user can right-click → save manually.
 */
export async function downloadImage(url: string, filename?: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename || inferFilename(url, blob.type);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function inferFilename(url: string, mime?: string): string {
  let base = "image";
  try {
    const u = new URL(url, window.location.origin);
    const last = u.pathname.split("/").pop();
    if (last) base = last.replace(/\.[^.]+$/, "") || "image";
    if (last && /\.(png|jpe?g|webp|gif|avif)$/i.test(last)) return last;
  } catch {}
  const ext = mime?.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return `${base}.${ext}`;
}
