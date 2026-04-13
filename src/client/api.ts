export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: {} };
  if (body) {
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const text = await r.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(r.ok ? text : `${r.status}: ${text.slice(0, 200)}`);
  }
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data as T;
}
