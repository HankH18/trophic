/**
 * tools/collision-editor/main.ts — draw a node's collision mask, and export one the whole repo agrees about.
 *
 * ══ WHY THIS EXISTS ══
 * build-doc §5 lists the collision editor as a second Vite target; `npm run collision` pointed at a
 * config that did not exist and the directory was empty. That was not just a missing tool. Two
 * modules had each declared themselves the authority on the mask encoding — `game/collision.ts`
 * ("dark blocks; a transparent pixel is unpainted, therefore walkable") and
 * `tools/overlay-diff/mask.ts` ("white and opaque ⇒ walkable; black **or any transparent pixel** ⇒
 * blocked") — and both headers said the collision editor would have to match them. With no editor,
 * nothing arbitrated, and an alpha-background mask read as an open field to the game and as a
 * completely blocked map to the Hard Req 5 / G4 acceptance gate, which then refused every year
 * variant.
 *
 * THE ARBITRATION, and this file is what makes it true rather than asserted: the editor exports
 * **fully opaque** black-and-white PNGs at `balance.map.mapNativePx`. On a fully opaque raster the
 * two readers agree cell-for-cell (proved over random rasters in tests/unit/collision.test.ts), so a
 * mask this tool produced can only ever be read one way. `game/collision.ts` refuses anything else
 * at load and says why.
 *
 * ══ WHAT IT SAMPLES WITH ══
 * `game/collision.ts`, imported verbatim — `sampleMask`, `readMask`, `debugOverlayRects`,
 * `chooseSpawnTile`, `gridToAscii`. An editor with its own sampler is a tool for drawing masks that
 * are wrong in a way you cannot see: what you paint here is what `tileWalkable` will answer at
 * runtime, because it is the same function.
 *
 * NUMBERS (G11): `balance.map` for every dimension; nothing here is a gameplay constant. The two
 * literals are the 8-bit channel maximum and a display scale, both facts about a canvas.
 * CONTENT (G2): nodes come from `validateContent()`; no node id or map path is written here.
 */

import { validateContent } from '@core/schemas';
import type { Balance, CollisionGrid, NodeFile } from '@core/types';
import {
  blockedCount,
  chooseSpawnTile,
  cloneGrid,
  debugOverlayRects,
  emptyGrid,
  gridConsistencyProblem,
  gridDimensions,
  gridToAscii,
  isBlocked,
  readMask,
  setBlocked,
  worldSizePx,
  type CellPolicy,
  type MaskHealth,
  type MaskPolarity,
} from '@game/collision';
import { realAssetUrl } from '@game/placeholder';

/** Fully opaque. The whole point of the export — see the header. */
const OPAQUE = 255;
/** The mask is drawn at cell resolution and scaled up for the eye; a fact about the screen. */
const DISPLAY_PX = 12;

interface EditorState {
  balance: Balance;
  nodes: NodeFile[];
  node: NodeFile;
  grid: CollisionGrid;
  /** Undo stack of whole grids. Small (cols × rows bits), so a copy per stroke is cheap. */
  history: CollisionGrid[];
  polarity: MaskPolarity;
  policy: CellPolicy;
  /** Verdict on the last mask IMPORTED, if any. Null while the grid is hand-drawn. */
  imported: MaskHealth | null;
  mapImage: HTMLImageElement | null;
  mapPathTried: string;
  painting: null | { blocked: boolean };
}

function fatal(message: string): void {
  const stage = document.getElementById('stage');
  if (stage) stage.innerHTML = `<div id="fatal">${escapeHtml(message)}</div>`;
  console.error(`[collision-editor] ${message}`);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Boot
 * ──────────────────────────────────────────────────────────────────────────── */

function boot(): void {
  let content;
  try {
    content = validateContent();
  } catch (err) {
    fatal(`data/ failed validation, so there is nothing to draw a mask over:\n\n${String(err)}`);
    return;
  }

  const balance = content.balance;
  const consistency = gridConsistencyProblem(balance);
  if (consistency) console.warn(`[collision-editor] ${consistency}`);

  const first = content.nodes[0];
  if (!first) {
    fatal('data/nodes/ is empty — there is no node to draw a mask for.');
    return;
  }

  const state: EditorState = {
    balance,
    nodes: [...content.nodes],
    node: first,
    grid: emptyGrid(first.id, gridDimensions(balance)),
    history: [],
    polarity: 'dark-blocks',
    policy: 'majority',
    imported: null,
    mapImage: null,
    mapPathTried: first.mapAsset,
    painting: null,
  };

  const stage = document.getElementById('stage');
  const side = document.getElementById('side');
  if (!stage || !side) {
    fatal('the editor page is missing #stage or #side');
    return;
  }

  const canvas = document.createElement('canvas');
  stage.innerHTML = '';
  stage.appendChild(canvas);

  const render = (): void => {
    draw(canvas, state);
    side.innerHTML = panelHtml(state);
    wirePanel(side, state, render, canvas);
  };

  wireCanvas(canvas, state, render);
  void selectNode(state, first.id).then(render);
  render();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Node selection
 * ──────────────────────────────────────────────────────────────────────────── */

async function selectNode(state: EditorState, id: string): Promise<void> {
  const node = state.nodes.find((n) => n.id === id);
  if (!node) return;
  state.node = node;
  state.grid = emptyGrid(node.id, gridDimensions(state.balance));
  state.history = [];
  state.imported = null;
  state.mapPathTried = node.mapAsset;
  state.mapImage = await loadMapImage(node.mapAsset);
}

/**
 * The painting the mask is drawn over, or null when that art is unbuilt.
 *
 * `realAssetUrl` is `game/placeholder.ts`'s BUILD-time census of `assets/final/` — the same one the
 * game uses, so this tool cannot think an asset exists that the game does not. When it returns null
 * the canvas draws a labelled placeholder instead of stretching some other image into the slot: an
 * editor that faked the art would produce masks drawn against a picture nobody will ever see.
 */
async function loadMapImage(path: string): Promise<HTMLImageElement | null> {
  const url = realAssetUrl(path);
  if (url === null) return null;
  return await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = (): void => {
      resolve(img);
    };
    img.onerror = (): void => {
      resolve(null);
    };
    img.src = url;
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Drawing
 * ──────────────────────────────────────────────────────────────────────────── */

function draw(canvas: HTMLCanvasElement, state: EditorState): void {
  const { grid } = state;
  const w = grid.cols * DISPLAY_PX;
  const h = grid.rows * DISPLAY_PX;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${String(w)}px`;
  canvas.style.height = `${String(h)}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  if (state.mapImage) {
    ctx.drawImage(state.mapImage, 0, 0, w, h);
  } else {
    // The one honest stand-in: a flat field with the asset id on it, never another lane's art.
    ctx.fillStyle = '#1b2416';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3d4a33';
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillText(`PLACEHOLDER — ${state.mapPathTried} not built`, 12, 24);
  }

  // Blocked cells, through the SAME geometry the debug overlay in the game uses.
  const world = worldSizePx(state.balance);
  const sx = w / world.width;
  const sy = h / world.height;
  ctx.fillStyle = 'rgba(255, 90, 74, 0.55)';
  for (const rect of debugOverlayRects(grid, state.balance)) {
    ctx.fillRect(rect.x * sx, rect.y * sy, rect.w * sx, rect.h * sy);
  }

  // The lattice, so a cell boundary is where the eye thinks it is.
  ctx.strokeStyle = 'rgba(232, 240, 224, 0.10)';
  ctx.lineWidth = 1;
  for (let col = 0; col <= grid.cols; col += 1) {
    ctx.beginPath();
    ctx.moveTo(col * DISPLAY_PX + 0.5, 0);
    ctx.lineTo(col * DISPLAY_PX + 0.5, h);
    ctx.stroke();
  }
  for (let row = 0; row <= grid.rows; row += 1) {
    ctx.beginPath();
    ctx.moveTo(0, row * DISPLAY_PX + 0.5);
    ctx.lineTo(w, row * DISPLAY_PX + 0.5);
    ctx.stroke();
  }

  // Where the player would actually spawn on this mask, live while you paint.
  const spawn = chooseSpawnTile(grid, state.balance);
  const tileToCell = state.balance.map.tileStepPx / (grid.cellPx * state.balance.map.mapRenderScale);
  ctx.strokeStyle = spawn.problem === null ? '#9fd67a' : '#ff8b7a';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    spawn.tile.col * tileToCell * DISPLAY_PX,
    spawn.tile.row * tileToCell * DISPLAY_PX,
    tileToCell * DISPLAY_PX,
    tileToCell * DISPLAY_PX,
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Painting
 * ──────────────────────────────────────────────────────────────────────────── */

function cellAt(canvas: HTMLCanvasElement, event: MouseEvent, grid: CollisionGrid): { col: number; row: number } {
  const box = canvas.getBoundingClientRect();
  const col = Math.floor(((event.clientX - box.left) / box.width) * grid.cols);
  const row = Math.floor(((event.clientY - box.top) / box.height) * grid.rows);
  return { col, row };
}

function wireCanvas(canvas: HTMLCanvasElement, state: EditorState, render: () => void): void {
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  canvas.addEventListener('mousedown', (event) => {
    state.history.push(cloneGrid(state.grid));
    // Left paints walls; right (or shift) clears them. Both are one gesture, undoable as one.
    const blocked = event.button !== 2 && !event.shiftKey;
    state.painting = { blocked };
    const { col, row } = cellAt(canvas, event, state.grid);
    setBlocked(state.grid, col, row, blocked);
    state.imported = null;
    render();
  });
  canvas.addEventListener('mousemove', (event) => {
    if (!state.painting) return;
    const { col, row } = cellAt(canvas, event, state.grid);
    if (isBlocked(state.grid, col, row) === state.painting.blocked) return;
    setBlocked(state.grid, col, row, state.painting.blocked);
    render();
  });
  const stop = (): void => {
    state.painting = null;
  };
  canvas.addEventListener('mouseup', stop);
  canvas.addEventListener('mouseleave', stop);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Export — the fully opaque 1-bit PNG the contract asks for
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The grid as a mask raster at `balance.map.mapNativePx`: black where blocked, white where walkable,
 * **alpha 255 everywhere**.
 *
 * Exported (not inlined into the download handler) so a test can assert the bytes: round-tripping
 * this through `readMask` must reproduce the grid it came from, and the raster must contain no
 * transparent pixel at all.
 */
export function maskRasterFrom(grid: CollisionGrid, balance: Balance): ImageData {
  const side = balance.map.mapNativePx;
  const image = new ImageData(side, side);
  for (let y = 0; y < side; y += 1) {
    const row = Math.min(grid.rows - 1, Math.floor((y * grid.rows) / side));
    for (let x = 0; x < side; x += 1) {
      const col = Math.min(grid.cols - 1, Math.floor((x * grid.cols) / side));
      const ink = isBlocked(grid, col, row) ? 0 : OPAQUE;
      const at = (y * side + x) * 4;
      image.data[at] = ink;
      image.data[at + 1] = ink;
      image.data[at + 2] = ink;
      image.data[at + 3] = OPAQUE;
    }
  }
  return image;
}

function download(state: EditorState): void {
  const image = maskRasterFrom(state.grid, state.balance);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(image, 0, 0);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // The node's own declared mask path is the filename, so the file lands where the node JSON
    // already says it is (G2: the path is data, not a name invented here).
    a.download = state.node.collisionMask.split('/').pop() ?? `${state.node.id}-mask.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

/* ────────────────────────────────────────────────────────────────────────────
 * Import — read a mask back through the runtime's own reader
 * ──────────────────────────────────────────────────────────────────────────── */

async function importMask(state: EditorState, file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.onload = (): void => {
        resolve(i);
      };
      i.onerror = (): void => {
        resolve(null);
      };
      i.src = url;
    });
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // The RUNTIME's reader, not a second one: what this shows is what the game will play.
    const reading = readMask(state.node.id, { width: pixels.width, height: pixels.height, data: pixels.data, channels: 4 }, state.balance, {
      polarity: state.polarity,
      policy: state.policy,
    });
    state.history.push(cloneGrid(state.grid));
    state.grid = reading.grid;
    state.imported = reading.health;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The panel
 * ──────────────────────────────────────────────────────────────────────────── */

function panelHtml(state: EditorState): string {
  const { grid, balance } = state;
  const blocked = blockedCount(grid);
  const cells = grid.cols * grid.rows;
  const spawn = chooseSpawnTile(grid, balance);
  const health = state.imported;

  const options = state.nodes
    .map((n) => `<option value="${n.id}"${n.id === state.node.id ? ' selected' : ''}>${n.id} — ${escapeHtml(n.name)}</option>`)
    .join('');

  const problems =
    health && health.problems.length > 0
      ? `<ul>${health.problems.map((p) => `<li class="${health.usable ? 'warn' : 'bad'}">${escapeHtml(p)}</li>`).join('')}</ul>`
      : '<p class="dim">no imported mask</p>';

  return `
    <h1>collision editor</h1>
    <p class="dim">one mask per node, all six years (Hard Req 5). Exported fully opaque; dark blocks.</p>

    <h2>node</h2>
    <div class="row"><select id="node">${options}</select></div>
    <p class="dim">map ${escapeHtml(state.mapPathTried)}${state.mapImage ? '' : ' <span class="warn">(unbuilt — placeholder)</span>'}</p>
    <p class="dim">mask ${escapeHtml(state.node.collisionMask)}</p>

    <h2>grid</h2>
    <p>${String(grid.cols)}×${String(grid.rows)} cells · <span class="num">${String(blocked)}</span> blocked · <span class="num">${String(cells - blocked)}</span> walkable</p>
    <p>${spawn.problem === null ? `spawn <span class="num">${String(spawn.tile.col)},${String(spawn.tile.row)}</span>` : `<span class="bad">${escapeHtml(spawn.problem)}</span>`}</p>

    <h2>paint</h2>
    <p class="dim">left-drag blocks · right-drag or shift-drag clears</p>
    <div class="row">
      <button id="undo">undo</button>
      <button id="clear">clear</button>
      <button id="border">border wall</button>
      <button id="fill">fill all</button>
    </div>

    <h2>import</h2>
    <div class="row">
      <label>polarity
        <select id="polarity">
          <option value="dark-blocks"${state.polarity === 'dark-blocks' ? ' selected' : ''}>dark-blocks</option>
          <option value="light-blocks"${state.polarity === 'light-blocks' ? ' selected' : ''}>light-blocks</option>
        </select>
      </label>
      <label>cells
        <select id="policy">
          <option value="majority"${state.policy === 'majority' ? ' selected' : ''}>majority</option>
          <option value="any"${state.policy === 'any' ? ' selected' : ''}>any</option>
        </select>
      </label>
    </div>
    <div class="row"><input type="file" id="file" accept="image/png,image/*" /></div>
    <p>${health ? (health.usable ? '<span class="num">usable</span>' : '<span class="bad">REFUSED by game/collision.ts</span>') : ''}</p>
    ${problems}

    <h2>export</h2>
    <div class="row"><button id="save">download ${escapeHtml(state.node.collisionMask.split('/').pop() ?? 'mask.png')}</button></div>
    <p class="dim">${String(balance.map.mapNativePx)}×${String(balance.map.mapNativePx)}, opaque, black = blocked</p>

    <h2>ascii</h2>
    <pre id="ascii">${escapeHtml(gridToAscii(grid))}</pre>
  `;
}

function wirePanel(side: HTMLElement, state: EditorState, render: () => void, _canvas: HTMLCanvasElement): void {
  const on = (id: string, event: string, run: (e: Event) => void): void => {
    side.querySelector(`#${id}`)?.addEventListener(event, run);
  };

  on('node', 'change', (e) => {
    const id = (e.target as HTMLSelectElement).value;
    void selectNode(state, id).then(render);
  });
  on('polarity', 'change', (e) => {
    state.polarity = (e.target as HTMLSelectElement).value as MaskPolarity;
  });
  on('policy', 'change', (e) => {
    state.policy = (e.target as HTMLSelectElement).value as CellPolicy;
  });
  on('undo', 'click', () => {
    const previous = state.history.pop();
    if (previous) state.grid = previous;
    render();
  });
  on('clear', 'click', () => {
    state.history.push(cloneGrid(state.grid));
    state.grid = emptyGrid(state.node.id, gridDimensions(state.balance));
    state.imported = null;
    render();
  });
  on('fill', 'click', () => {
    state.history.push(cloneGrid(state.grid));
    for (let row = 0; row < state.grid.rows; row += 1) {
      for (let col = 0; col < state.grid.cols; col += 1) setBlocked(state.grid, col, row, true);
    }
    state.imported = null;
    render();
  });
  on('border', 'click', () => {
    state.history.push(cloneGrid(state.grid));
    for (let col = 0; col < state.grid.cols; col += 1) {
      setBlocked(state.grid, col, 0, true);
      setBlocked(state.grid, col, state.grid.rows - 1, true);
    }
    for (let row = 0; row < state.grid.rows; row += 1) {
      setBlocked(state.grid, 0, row, true);
      setBlocked(state.grid, state.grid.cols - 1, row, true);
    }
    state.imported = null;
    render();
  });
  on('save', 'click', () => {
    download(state);
  });
  on('file', 'change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void importMask(state, file).then(render);
  });
}

boot();
