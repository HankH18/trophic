/**
 * tools/overlay-diff/config.ts — the tool's numbers come from data/balance.json, always.
 *
 * G11: no gameplay constant is a literal in code. `balance.overlayDiff` already carries every
 * number §8.2 names — iouThreshold, sobelThreshold, dilatePx, the denoise ladder, the regen cap —
 * and `balance.map` carries the collision grid. So the tool owns no constants of its own, and
 * retuning the gate is an edit to balance.json (INV-3), not to this directory.
 *
 * `validateContent()` is used rather than a bare JSON read so the tool sees exactly the balance the
 * game sees, schema-validated, and fails loudly on a malformed file instead of quietly reading
 * `undefined` as a threshold of NaN — which compares false against everything and would silently
 * reject every variant ever generated.
 */
import { validateContent } from '../../core/schemas.ts';
import type { Balance } from '../../core/types.ts';
import type { CellGrid } from './mask.ts';
import type { CellFootprint, OverlayDiffConfig } from './diff.ts';

export function overlayDiffConfig(balance?: Balance): OverlayDiffConfig {
  const b = balance ?? validateContent().balance;
  return {
    iouThreshold: b.overlayDiff.iouThreshold,
    sobelThreshold: b.overlayDiff.sobelThreshold,
    dilatePx: b.overlayDiff.dilatePx,
    driftFootprint: driftFootprint(b),
  };
}

/**
 * The player's own footprint, in collision cells — diff.ts's criterion (2) size limit.
 *
 * `balance.map` already carries every number: the sprite is `playerSpriteW × playerSpriteH` and the
 * mask is sampled on a `collisionCellPx` grid, so the footprint is a division and not a new tunable
 * (G11). It is rounded UP: a sprite that straddles part of a cell occupies that cell.
 */
export function driftFootprint(balance?: Balance): CellFootprint {
  const m = (balance ?? validateContent().balance).map;
  return {
    cols: Math.max(1, Math.ceil(m.playerSpriteW / m.collisionCellPx)),
    rows: Math.max(1, Math.ceil(m.playerSpriteH / m.collisionCellPx)),
  };
}

export function collisionGrid(balance?: Balance): CellGrid {
  const b = balance ?? validateContent().balance;
  return { cols: b.map.collisionCols, rows: b.map.collisionRows };
}

export function denoiseLadder(balance?: Balance): {
  denoiseStart: number;
  denoiseStep: number;
  denoiseFloor: number;
  maxRegenAttempts: number;
} {
  const b = balance ?? validateContent().balance;
  return {
    denoiseStart: b.overlayDiff.denoiseStart,
    denoiseStep: b.overlayDiff.denoiseStep,
    denoiseFloor: b.overlayDiff.denoiseFloor,
    maxRegenAttempts: b.overlayDiff.maxRegenAttempts,
  };
}
