/**
 * Comfy Cloud client (build-doc §9.1).
 *
 * IMPORTANT ARCHITECTURAL CONSTRAINT, discovered live and logged as B-D8:
 * Comfy Cloud does NOT implement local ComfyUI's `GET /api/history/{id}`. Job outputs are
 * delivered ONLY over the WebSocket, in the `executed` message, while the job runs. A job can
 * finish in ~3s, so the socket must be OPEN BEFORE the job is submitted or the output is lost
 * with no way to recover it (the job still bills). Every call here connects first, then submits.
 *
 * `GET /api/job/{id}/status` exists and is authoritative for terminal state, but carries no outputs.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export interface ComfyImage { filename: string; subfolder?: string; type?: string }
export type NodeOutputs = Record<string, { images?: ComfyImage[] }>;
export interface Graph { [nodeId: string]: { inputs: Record<string, unknown>; class_type: string } }

export interface ComfyEnv { host: string; key: string; maxConcurrency: number }

export async function loadEnv(path = '.env'): Promise<ComfyEnv> {
  const raw = await readFile(path, 'utf8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  const host = env.COMFY_HOST ?? env.COMFY_BASE_URL;
  const key = env.COMFY_CLOUD_API_KEY ?? env.COMFY_API_KEY;
  if (!host || !key) throw new Error('.env missing COMFY_HOST / COMFY_CLOUD_API_KEY');
  return { host, key, maxConcurrency: Number(env.COMFY_MAX_CONCURRENCY ?? 1) };
}

export class ComfyError extends Error {}

export class ComfyClient {
  constructor(private env: ComfyEnv) {}

  private headers(json = true): Record<string, string> {
    return json
      ? { 'X-API-Key': this.env.key, 'Content-Type': 'application/json' }
      : { 'X-API-Key': this.env.key };
  }

  /** Connect the socket, submit, and collect this job's outputs. Socket opens first — see the note above. */
  async run(graph: Graph, opts: { timeoutMs?: number; onProgress?: (v: number, max: number) => void } = {}): Promise<NodeOutputs> {
    const timeoutMs = opts.timeoutMs ?? 300_000;
    const clientId = randomUUID();
    const ws = new WebSocket(
      `${this.env.host.replace(/^https/, 'wss')}/ws?clientId=${clientId}&token=${encodeURIComponent(this.env.key)}`,
    );

    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new ComfyError('WebSocket open timed out')), 30_000);
      ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(t); rej(new ComfyError('WebSocket failed to open')); }, { once: true });
    });

    try {
      const sub = await fetch(`${this.env.host}/api/prompt`, {
        method: 'POST', headers: this.headers(),
        body: JSON.stringify({ prompt: graph, client_id: clientId }),
      });
      const body = await sub.text();
      if (!sub.ok) throw new ComfyError(`POST /api/prompt -> ${sub.status}: ${body.slice(0, 500)}`);
      const promptId = (JSON.parse(body) as { prompt_id: string }).prompt_id;

      return await new Promise<NodeOutputs>((resolve, reject) => {
        const outputs: NodeOutputs = {};
        const timer = setTimeout(() => reject(new ComfyError(`job ${promptId} exceeded ${timeoutMs}ms`)), timeoutMs);
        const done = (fn: () => void) => { clearTimeout(timer); fn(); };

        ws.addEventListener('message', (ev: MessageEvent) => {
          if (typeof ev.data !== 'string') return;          // binary frames are previews
          const { type, data } = JSON.parse(ev.data) as { type: string; data?: Record<string, any> };
          const d = data ?? {};
          if (d.prompt_id && d.prompt_id !== promptId) return;
          if (type === 'progress' && opts.onProgress) opts.onProgress(d.value, d.max);
          else if (type === 'executed' && d.output) outputs[d.node] = d.output;
          else if (type === 'execution_success') done(() => resolve(outputs));
          else if (type === 'execution_error') done(() => reject(new ComfyError(d.exception_message ?? 'execution error')));
          else if (type === 'execution_interrupted') done(() => reject(new ComfyError('execution interrupted')));
        });
      });
    } finally {
      ws.close();
    }
  }

  async download(img: ComfyImage): Promise<Buffer> {
    const q = new URLSearchParams({
      filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output',
    });
    const r = await fetch(`${this.env.host}/api/view?${q}`, { headers: this.headers(false) });
    if (!r.ok) throw new ComfyError(`GET /api/view -> ${r.status} for ${img.filename}`);
    return Buffer.from(await r.arrayBuffer());
  }

  async saveAll(outputs: NodeOutputs, destFor: (img: ComfyImage, i: number) => string): Promise<string[]> {
    const written: string[] = [];
    let i = 0;
    for (const nodeOut of Object.values(outputs)) {
      for (const img of nodeOut.images ?? []) {
        const dest = destFor(img, i++);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, await this.download(img));
        written.push(dest);
      }
    }
    return written;
  }

  async credits(): Promise<number | null> {
    for (const p of ['/api/customers/credit', '/api/credit', '/api/user/credit']) {
      const r = await fetch(`${this.env.host}${p}`, { headers: this.headers(false) });
      if (!r.ok) continue;
      const txt = await r.text();
      const m = txt.match(/-?\d+(\.\d+)?/);
      if (m) return Number(m[0]);
    }
    return null;
  }
}

/** Inject a prompt + seed into a copy of the base graph. Never mutates the base (G5 seed discipline). */
export function injectGraph(base: Graph, o: { positive?: string; seed?: number; negative?: string }): Graph {
  const g: Graph = JSON.parse(JSON.stringify(base));
  const byClass = (c: string) => Object.entries(g).filter(([, n]) => n.class_type === c);
  const encoders = byClass('CLIPTextEncode');
  const ks = byClass('KSampler')[0];
  if (!ks) throw new ComfyError('base graph has no KSampler');
  const negRef = (ks[1].inputs as any).negative?.[0];
  const posRef = (ks[1].inputs as any).positive?.[0];
  for (const [id, node] of encoders) {
    if (o.positive !== undefined && id === posRef) node.inputs.text = o.positive;
    if (o.negative !== undefined && id === negRef) node.inputs.text = o.negative;
  }
  if (o.seed !== undefined) ks[1].inputs.seed = o.seed;
  return g;
}
