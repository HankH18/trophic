/**
 * tools/overlay-diff/config.ts — the tool's numbers come from data/balance.json, always.
 *
 * G11: no gameplay constant is a literal in code. `balance.overlayDiff` carries every number §8.2
 * names — iouThreshold, sobelThreshold, dilatePx, the denoise ladder, the regen cap, and now the
 * drift footprint — and `balance.map` carries the collision grid. So the tool owns no constants of
 * its own, and retuning the gate is an edit to balance.json (INV-3), not to this directory.
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
 * The largest walkable-mask drift a year variant may carry — diff.ts's criterion (2) size limit,
 * in collision cells. Read from `balance.overlayDiff.driftFootprintCells`.
 *
 * ⚠ IT USED TO BE DERIVED HERE, and that was the defect. The old body was
 * `ceil(map.playerSpriteW / map.collisionCellPx) × ceil(map.playerSpriteH / map.collisionCellPx)` —
 * the player's own footprint, which is the right FLOOR and was defensible as "not a new tunable".
 * But it made the §9.5 acceptance criterion the one number in the gate that INV-3 could not reach:
 * every sibling (`iouThreshold`, `sobelThreshold`, `dilatePx`, the denoise ladder, the regen cap) is
 * a balance key, and loosening this one after a supervised run meant editing this file. The shipped
 * value was the derived one (2 × 3) when it moved, so the move changed no verdict.
 *
 * The floor survives as a law rather than as arithmetic: `tests/unit/balance-inv3.test.ts` requires
 * the configured footprint to be at least the player's, because a tolerance smaller than the player
 * accepts a variant that can strand him.
 *
 * ⚠ THE SHIPPED VALUE IS NO LONGER THE DERIVATION, AND THAT IS THE KEY DOING ITS JOB. The owner
 * ruled the player one block tall, `balance.map.playerSpriteH` went 48 → 32, and the division now
 * reads 2 × 2 while the configured tolerance stays 2 × 3 — above the floor, which is where a
 * tolerance is allowed to sit. It was NOT lowered to follow the sprite, deliberately: the 25 (map,
 * position) verdicts published in `tools/artverify/published-measurements.json` as
 * `overlayDiff32pxResidual` were characterised at 2 × 3, its `measuredWith` block pins that pair,
 * and 20 of the 25 pairs are unmeasurable in a clean clone. Tightening the gate here would retire
 * that characterisation with nothing able to replace it off this disk. A supervised §9.5 run that
 * wants the tolerance moved may still move it — in balance.json, and republishing the table with it.
 */
export function driftFootprint(balance?: Balance): CellFootprint {
  const cells = (balance ?? validateContent().balance).overlayDiff.driftFootprintCells;
  return { cols: cells.cols, rows: cells.rows };
}

/**
 * The player's own footprint in collision cells — the FLOOR {@link driftFootprint} must not go
 * under. Exported so the binding test asks this file rather than restating the division.
 */
export function playerFootprintCells(balance?: Balance): CellFootprint {
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
