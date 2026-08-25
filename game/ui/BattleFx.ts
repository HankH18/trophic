/**
 * game/ui/BattleFx.ts — the tween vocabulary the battle screen plays a `ViewStep` with.
 *
 * Damage numbers, effectiveness flashes, the lunge, the hit shake, the status pulse, the faint fade,
 * the snare arc and its shakes, the catch burst, the level-up flash. Each function takes a target
 * and a NUMBER THAT CAME OUT OF THE EVENT LOG; none of them computes a gameplay value. The shake
 * count in `snareShake` is `snareThrown.shakes` from core/battle.ts, not a roll made here.
 *
 * ENGINE: `import type PhaserNS` only, so the pure helpers (`damageNumberText`,
 * `effectivenessRole`) are importable in a node test.
 */

import type PhaserNS from "phaser";
import type { EffectivenessBand } from "../../core/types";
import { roleColor, roleHex, type UiSwatchRole } from "./Palette";

/* ────────────────────────────────────────────────────────────────────────────
 * Pure helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/** "−14" / "+9". Sign is direction; the magnitude is whatever the log said. */
export function damageNumberText(amount: number, direction: "down" | "up"): string {
  return `${direction === "down" ? "−" : "+"}${String(Math.abs(amount))}`;
}

/** Which palette role an effectiveness band flashes in. Colour only — no multiplier is implied. */
export function effectivenessRole(band: EffectivenessBand, crit: boolean): UiSwatchRole {
  if (crit) return "accent";
  if (band === "super") return "hot";
  if (band === "resisted") return "cool";
  return "text";
}

/* ────────────────────────────────────────────────────────────────────────────
 * Tweens. All timings are presentation milliseconds (see game/battle-view.ts's
 * VIEW_TIMING note) — never gameplay constants.
 * ──────────────────────────────────────────────────────────────────────────── */

const FLOAT_RISE_PX = 18;
const LUNGE_PX = 10;
const SHAKE_PX = 3;

interface Positioned {
  x: number;
  y: number;
}

function positionOf(target: PhaserNS.GameObjects.GameObject): Positioned {
  const p = target as unknown as Partial<Positioned>;
  return { x: p.x ?? 0, y: p.y ?? 0 };
}

/** A number that floats up off a combatant and fades. Returns it so a caller can await/destroy it. */
export function floatingNumber(
  scene: PhaserNS.Scene,
  target: PhaserNS.GameObjects.GameObject,
  text: string,
  role: UiSwatchRole,
  duration: number,
): PhaserNS.GameObjects.Text {
  const at = positionOf(target);
  const label = scene.add.text(at.x, at.y, text, {
    fontFamily: "monospace",
    fontSize: "12px",
    color: roleHex(role),
  });
  label.setOrigin(0.5, 0.5);
  label.setShadow(1, 1, roleHex("void"), 0, true, true);
  scene.tweens.add({
    targets: label,
    y: at.y - FLOAT_RISE_PX,
    alpha: 0,
    duration,
    onComplete: () => {
      label.destroy();
    },
  });
  return label;
}

/** The attacker leans toward its target and comes back. `dir` is +1 to the right, −1 to the left. */
export function lunge(
  scene: PhaserNS.Scene,
  target: PhaserNS.GameObjects.GameObject,
  dir: number,
  duration: number,
): void {
  const at = positionOf(target);
  scene.tweens.add({
    targets: target,
    x: at.x + LUNGE_PX * dir,
    duration: Math.max(1, Math.floor(duration / 2)),
    yoyo: true,
  });
}

/** The struck combatant jitters. Amplitude is fixed; the log's `amount` drives the NUMBER, not this. */
export function hitShake(scene: PhaserNS.Scene, target: PhaserNS.GameObjects.GameObject, duration: number): void {
  const at = positionOf(target);
  scene.tweens.add({
    targets: target,
    x: at.x + SHAKE_PX,
    duration: Math.max(1, Math.floor(duration / 6)),
    yoyo: true,
    repeat: 2,
    onComplete: () => {
      if (!alive(target)) return;
      (target as unknown as Positioned).x = at.x;
    },
  });
}

/**
 * A game object Phaser has destroyed loses its `scene` back-reference. Every DEFERRED callback in
 * this file checks it: a combatant panel can be rebuilt (and its sprite destroyed) between a
 * tween's start and its resolution, and writing to a dead object is how the HP tween produced a
 * `TypeError` inside Phaser's tween loop.
 */
function alive(target: PhaserNS.GameObjects.GameObject): boolean {
  return (target as unknown as { scene?: unknown }).scene !== undefined;
}

/** A short full-screen-free tint pulse on one combatant — the effectiveness feedback. */
export function flash(
  scene: PhaserNS.Scene,
  target: PhaserNS.GameObjects.GameObject,
  role: UiSwatchRole,
  duration: number,
): void {
  const tintable = target as unknown as Partial<{ setTint(color: number): unknown; clearTint(): unknown }>;
  if (typeof tintable.setTint !== "function") return;
  tintable.setTint(roleColor(role));
  scene.time.delayedCall(Math.max(1, Math.floor(duration / 2)), () => {
    if (!alive(target)) return;
    tintable.clearTint?.();
  });
}

/** KO is FAINT ONLY (Hard Req 8): the sprite sinks and fades. Nothing dies in a TROPHIC battle. */
export function faintFade(scene: PhaserNS.Scene, target: PhaserNS.GameObjects.GameObject, duration: number): void {
  const at = positionOf(target);
  scene.tweens.add({
    targets: target,
    y: at.y + FLOAT_RISE_PX,
    alpha: 0,
    duration,
  });
}

/** How far a fleeing combatant travels off the field before it is gone, in pixels. */
const FLEE_DASH_PX = 96;

/**
 * A successful escape: the combatant BOLTS sideways off the field and fades as it goes.
 *
 * Deliberately not {@link faintFade}. The first cut animated a flee with the KO tween, so "you got
 * away" and "your creature is down" were the same picture — and Hard Req 8 makes faint the only KO
 * vocabulary, which is worth nothing if a non-KO borrows it. `dir` is +1 to the right, −1 to the
 * left, so each side exits its own way.
 */
export function fleeDash(
  scene: PhaserNS.Scene,
  target: PhaserNS.GameObjects.GameObject,
  dir: number,
  duration: number,
): void {
  const at = positionOf(target);
  scene.tweens.add({
    targets: target,
    x: at.x + FLEE_DASH_PX * (dir < 0 ? -1 : 1),
    alpha: 0,
    duration,
  });
}

/**
 * The snare's arc and its shakes.
 *
 * `shakes` is `snareThrown.shakes` — core/battle.ts drew each one against `p^(1/shakes)` and the
 * view only counts them out. `caught` decides whether the last beat settles or springs open.
 */
export function snareShake(
  scene: PhaserNS.Scene,
  target: PhaserNS.GameObjects.GameObject,
  shakes: number,
  caught: boolean,
  perShakeMs: number,
): void {
  const at = positionOf(target);
  if (shakes > 0) {
    scene.tweens.add({
      targets: target,
      angle: SHAKE_PX * 2,
      duration: Math.max(1, Math.floor(perShakeMs / 2)),
      yoyo: true,
      repeat: Math.max(0, shakes - 1),
      onComplete: () => {
        if (!alive(target)) return;
        (target as unknown as { angle: number }).angle = 0;
      },
    });
  }
  if (caught) return;
  scene.tweens.add({
    targets: target,
    x: at.x,
    alpha: 1,
    delay: perShakeMs * Math.max(1, shakes),
    duration: Math.max(1, perShakeMs),
  });
}

const BURST_PX = 8;
const BURST_SCALE = 6;

/** The catch settle — a bright pulse where the target was. */
export function catchBurst(
  scene: PhaserNS.Scene,
  target: PhaserNS.GameObjects.GameObject,
  duration: number,
): void {
  const at = positionOf(target);
  const ring = scene.add.rectangle(at.x, at.y, BURST_PX, BURST_PX, roleColor("accent"));
  scene.tweens.add({
    targets: ring,
    scaleX: BURST_SCALE,
    scaleY: BURST_SCALE,
    alpha: 0,
    duration,
    onComplete: () => {
      ring.destroy();
    },
  });
}

/**
 * A caught creature leaves the field: it is drawn INTO the snare — scaled down toward the burst —
 * and its card fades with it.
 *
 * WAS MISSING ENTIRELY. `case "caught"` played `catchBurst` and nothing else, so the final frame of
 * a successful catch said "Caught" over the caught creature still standing at full opacity beside a
 * full-HP card. Measured against the other two terminal beats in the same harness: faint left the
 * sprite at alpha 0, flee at alpha 0, catch at alpha 1 — the only outcome that left its subject
 * fielded.
 *
 * Deliberately NOT `faintFade` (Hard Req 8 reserves the sink-and-fade for a KO) and not `fleeDash`
 * (that is an escape). Three terminal beats, three pictures: a KO sinks, an escape bolts sideways,
 * a catch is drawn in.
 */
export function catchSettle(
  scene: PhaserNS.Scene,
  target: PhaserNS.GameObjects.GameObject,
  card: PhaserNS.GameObjects.GameObject,
  duration: number,
): void {
  scene.tweens.add({ targets: target, scaleX: 0, scaleY: 0, alpha: 0, duration });
  scene.tweens.add({ targets: card, alpha: 0, duration });
}

/** Level-up: a rising label. The level itself came from the log. */
export function levelUpFlash(
  scene: PhaserNS.Scene,
  target: PhaserNS.GameObjects.GameObject,
  level: number,
  duration: number,
): void {
  floatingNumber(scene, target, `Lv ${String(level)}`, "good", duration);
}
