/**
 * game/scenes/BattleScene.ts — lane C3 (build-doc §15): "battle scene as event-log renderer".
 *
 * WHAT THIS SCENE IS
 * ──────────────────
 * An orchestrator and nothing else. It:
 *   1. calls `startBattle` / `step` in `core/battle.ts` — the pure reducer;
 *   2. hands the returned `events[]` to `game/battle-view.ts`, which compiles them into an ordered
 *      list of visual steps;
 *   3. plays those steps with the tweens in `game/ui/BattleFx.ts`;
 *   4. re-reads every absolute (HP, level, status, stat mods) off the returned `BattleState`.
 *
 * WHAT THIS SCENE IS NOT
 * ──────────────────────
 * There is **no damage math, no type chart, no catch probability, no turn order and no XP curve in
 * this file**. Search it: the only core functions it calls are `startBattle`, `step`,
 * `caughtIndividual` (the §7.4 catch hand-off REPORTER — it mutates nothing) and, through
 * `game/battle-input.ts`, `illegalActionReason`. Every number the player sees came out of the event
 * log or off the state. That is build-doc §7.4's bet and locked decision L11's whole point: the same
 * reducer runs headless in the balance harness, in vitest, and here, and the scene cannot make the
 * game disagree with the tests because it does not know any of the rules.
 *
 * THE CATCH HAND-OFF (Hard Req 2)
 * ───────────────────────────────
 * A successful catch ends the battle with `outcome:"caught"`. This scene does NOT decrement the
 * node's population — `core/battle.ts` deliberately never touches node state (G3: one writer for the
 * single source of truth). It reports `caughtIndividual(state, ctx)` through `onFinished`, and the
 * overworld/ledger lane applies it. See LANE-A-STATUS §6.1.
 *
 * ART (build-doc §9.7, gate B0)
 * ─────────────────────────────
 * The 150 battle sprites are UNBUILT. Every combatant draws through `CombatantPanel`
 * (game/ui/BattleHud.ts), whose only image call is `placeholderImage` from `game/placeholder.ts` —
 * the ONE stand-in helper the whole game shares. It uses the real texture when it is loaded and
 * otherwise a flat, labelled box naming the exact asset key that is still missing. No unrelated
 * trial image is ever stretched into a slot it was not generated for.
 *
 * WHAT THE SCENE READS WHILE A TURN IS PLAYING
 * ────────────────────────────────────────────
 * Only the STEP. `BattleView.push(events, stateAfter)` advances the view's snapshot to the end of
 * the whole reducer step before a single step has been drawn, so a scene that asks the view "what
 * is the HP now?" mid-playback is reading the future: the player's bar emptied on their own buff,
 * two steps before the blow was drawn. Every step carries `playerAt`/`enemyAt` — the display state
 * as of that step — and `paintPanels` reads those. `this.view.snapshot` is read in exactly two
 * places, both of them after the queue has drained.
 *
 * COPY (G7 / Hard Req 8)
 * ──────────────────────
 * Every line printed here comes from `ViewStep.caption`, which is identifiers and numbers. There is
 * no moralizing copy about catching anywhere in the battle screen, and KO is FAINT ONLY — no word
 * from the death family appears in any string in this lane. `illegalActionReason`'s strings are NOT
 * printed: core/types.ts calls that field "a diagnostic, not player-facing copy", and a greyed row
 * is the player-facing answer. The strings stay reachable through `lastRefusal()` for debugging.
 *
 * CONSTANTS (G11)
 * ───────────────
 * The virtual screen comes from `balance.map`; every box on it comes from
 * `game/ui/BattleLayout.ts`, which is engine-free and asserted DISJOINT by the lane's tests. The
 * rest of the numbers here are animation milliseconds — presentation, not gameplay. No gameplay
 * constant is written in this file.
 */

import Phaser from "phaser";

import { caughtIndividual, startBattle, step, type BattleContext, type CaughtIndividual, type RngSource } from "../../core/battle";
import type { BattleAction, BattleInput as BattleInputSpec, BattleState, TypeName } from "../../core/types";

import { BattleView, VIEW_TIMING, type BattleViewNames, type BattlerView, type ViewStep } from "../battle-view";
import { BattleInput, applyKey, type BattleKey } from "../battle-input";
import { BattleMessageBox } from "../ui/BattleMessageBox";
import { BattleMenuPanel } from "../ui/BattleMenuPanel";
import { CombatantPanel } from "../ui/BattleHud";
import { battleScreenLayout, type BattleScreenLayout } from "../ui/BattleLayout";
import { catchBurst, damageNumberText, effectivenessRole, faintFade, flash, fleeDash, floatingNumber, hitShake, levelUpFlash, lunge, snareShake } from "../ui/BattleFx";
import { roleColor } from "../ui/Palette";

export const BATTLE_SCENE_KEY = "Battle";

/** What C1/C2 hands the scene when it launches a fight. */
export interface BattleSceneData {
  /** `makeBattleContext(content, predationOracleFromWebs([web]))` — built by the caller. */
  ctx: BattleContext;
  /** build-doc §7.4 `BattleInput`: seed, kind, parties, nodeId, bag. */
  input: BattleInputSpec;
  /** core/rng.ts's seeded battle stream. There is no other randomness (G11 / §8.1). */
  rng: RngSource;
  /**
   * `OwnedCreature.projectedRetirementYear` per player uid, resolved by the caller from
   * core/lifecycle.ts. Shown on the player's card — bible §4 puts it on every creature card, and the
   * battle screen is where it is read most.
   */
  projectedRetirementYears?: Record<string, number>;
  /**
   * Called once, when the reducer reports an outcome. `caught` is `caughtIndividual`'s report; the
   * CALLER applies the node-population decrement (Hard Req 2 / G3).
   */
  onFinished?: (result: { state: BattleState; caught: CaughtIndividual | null }) => void;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The scene. Every box on screen comes from `game/ui/BattleLayout.ts` — engine-free,
 * so a node test can assert the panels are disjoint. They were not: the menu and the
 * player's card overlapped by 9px and the card, re-added on every swap, drew on top of
 * the menu's first row, which is where the cursor starts.
 * ──────────────────────────────────────────────────────────────────────────── */

export class BattleScene extends Phaser.Scene {
  private ctx!: BattleContext;
  private rng!: RngSource;
  private state!: BattleState;
  private view!: BattleView;
  private menuInput!: BattleInput;
  private layout!: BattleScreenLayout;
  private retirementYears: Record<string, number> = {};
  /** Core's last refusal string. A DIAGNOSTIC — never printed (core/types.ts), kept for debugging. */
  private refusal = "";
  private onFinished?: (result: { state: BattleState; caught: CaughtIndividual | null }) => void;

  private message!: BattleMessageBox;
  private menu!: BattleMenuPanel;
  private playerPanel?: CombatantPanel;
  private enemyPanel?: CombatantPanel;

  private playing = false;
  private finished = false;

  constructor() {
    super(BATTLE_SCENE_KEY);
  }

  init(data: BattleSceneData): void {
    this.ctx = data.ctx;
    this.rng = data.rng;
    this.retirementYears = data.projectedRetirementYears ?? {};
    if (data.onFinished !== undefined) this.onFinished = data.onFinished;

    // The reducer opens the battle. Its events are the first thing the view plays.
    const started = startBattle(data.input, this.ctx);
    this.state = started.state;
    this.view = new BattleView(this.state, this.namesFromContent());
    this.view.push(started.events, this.state);
    this.menuInput = new BattleInput();
    this.playing = false;
    this.finished = false;
  }

  create(): void {
    const map = this.ctx.balance.map;
    this.layout = battleScreenLayout(map.virtualWidth, map.virtualHeight);

    const backdrop = this.add.rectangle(0, 0, this.layout.width, this.layout.height, roleColor("void"));
    backdrop.setOrigin(0, 0);

    this.message = new BattleMessageBox(this, {
      x: this.layout.message.x,
      y: this.layout.message.y,
      width: this.layout.message.w,
      height: this.layout.message.h,
      fontSize: this.layout.messageFontSize,
      padding: this.layout.messagePadding,
    });

    this.menu = new BattleMenuPanel(this, {
      x: this.layout.menu.x,
      y: this.layout.menu.y,
      width: this.layout.menu.w,
      ...this.layout.menuMetrics,
    });
    this.menu.setVisible(false);

    // The opening `battleOpen` step rebuilds these from its own carried pair a beat later; building
    // them here means the screen is never empty, and `CombatantPanel.destroy()` makes the rebuild
    // cost two objects rather than leaking them.
    this.rebuildPanels(this.viewOf(this.view.snapshot.activePlayerUid), this.viewOf(this.view.snapshot.activeEnemyUid));
    this.bindKeys();
    this.pump();
  }

  /* ── content lookups. Names, not rules. ─────────────────────────────────── */

  private namesFromContent(): BattleViewNames {
    const moves = this.ctx.moves;
    return {
      move: (moveId: string): string | undefined => moves.get(moveId)?.name,
      moveType: (moveId: string): TypeName | null | undefined => moves.get(moveId)?.type,
      // `item` is deliberately absent: data/ carries no item-name table, and the view's `itemLabel`
      // typesets the id rather than coining a name (G2). `opponent` is absent because `BattleInput`
      // carries no trainer identity — see the blocker in docs/DEVIATIONS-lane-c3.md. Supplying the
      // enemy's first creature as "the opponent" is what made the gym beat open "Gym battle: Nibbin".
    };
  }

  /* ── panels ─────────────────────────────────────────────────────────────── */

  private viewOf(uid: string): BattlerView | undefined {
    return this.view.snapshot.battlers[uid];
  }

  /**
   * Rebuild both combatant panels for an explicitly given pair.
   *
   * The pair comes from the STEP being played, not from the post-step state: a faint-and-replace
   * happens mid-step, so reading the state here would field the replacement before the blow that
   * knocked its predecessor out had been drawn.
   *
   * `destroy()`, not `root.destroy()`. The panel owns a sprite the container never held, and
   * destroying only the container left the old sprite on screen at full opacity — a KO'd creature
   * still standing beside a 0-HP card, and one more orphan on the display list per switch (twenty
   * images for two combatants over the shipped gym fight).
   */
  private rebuildPanels(player: BattlerView | null | undefined, enemy: BattlerView | null | undefined): void {
    this.playerPanel?.destroy();
    this.enemyPanel?.destroy();
    this.playerPanel = undefined;
    this.enemyPanel = undefined;

    if (player !== undefined && player !== null) {
      this.playerPanel = new CombatantPanel(this, {
        x: this.layout.playerSprite.x,
        y: this.layout.playerSprite.y,
        cardX: this.layout.playerCard.x,
        cardY: this.layout.playerCard.y,
        view: player,
        ...(this.retirementYears[player.uid] === undefined
          ? {}
          : { projectedRetirementYear: this.retirementYears[player.uid] }),
      });
    }

    if (enemy !== undefined && enemy !== null) {
      this.enemyPanel = new CombatantPanel(this, {
        x: this.layout.enemySprite.x,
        y: this.layout.enemySprite.y,
        cardX: this.layout.enemyCard.x,
        cardY: this.layout.enemyCard.y,
        view: enemy,
      });
    }
  }

  /**
   * Paint both cards from the display state THIS STEP carries.
   *
   * Never from `this.view.snapshot`: `push(events, stateAfter)` has already advanced it to the end
   * of the whole reducer step, so a mid-turn read paints numbers from a future the player has not
   * been shown yet. Reproduced: a self-buff step painted the player at 0 HP, two steps before the
   * blow that emptied them was drawn.
   */
  private paintPanels(at: ViewStep): void {
    if (at.playerAt !== null) this.playerPanel?.update(at.playerAt, this.retirementYears[at.playerAt.uid]);
    if (at.enemyAt !== null) this.enemyPanel?.update(at.enemyAt);
  }

  /** Re-read the absolutes onto both cards. Only legal once the queue has drained. */
  private refreshPanels(): void {
    const snapshot = this.view.snapshot;
    const player = this.viewOf(snapshot.activePlayerUid);
    if (player !== undefined) {
      this.playerPanel?.update(player, this.retirementYears[player.uid]);
    }
    const enemy = this.viewOf(snapshot.activeEnemyUid);
    if (enemy !== undefined) this.enemyPanel?.update(enemy);
  }

  /**
   * Which panel a uid is drawn on, AS OF the step being played. Every `ViewStep` carries the pair
   * that was fielded when its event was logged, so a mid-turn replacement never steals the
   * animation of the blow that caused it.
   */
  private panelFor(uid: string, at: ViewStep): CombatantPanel | undefined {
    if (uid === at.activePlayerUid) return this.playerPanel;
    if (uid === at.activeEnemyUid) return this.enemyPanel;
    return undefined;
  }

  /* ── playback ───────────────────────────────────────────────────────────── */

  /** Play queued steps one at a time; when the queue drains, hand control back to the player. */
  private pump(): void {
    if (this.playing) return;
    const next = this.view.next();
    if (next === undefined) {
      this.onQueueEmpty();
      return;
    }
    this.playing = true;
    this.perform(next);
    this.time.delayedCall(next.hold, () => {
      this.playing = false;
      this.pump();
    });
  }

  private onQueueEmpty(): void {
    this.refreshPanels();
    if (this.state.outcome !== null) {
      if (this.finished) return;
      this.finished = true;
      this.menu.setVisible(false);
      this.onFinished?.({ state: this.state, caught: caughtIndividual(this.state, this.ctx) });
      return;
    }
    this.openMenu();
  }

  /**
   * One visual step. Every branch reads its numbers off the step — which read them off the log.
   * A `default`-free exhaustive switch means a new event kind cannot be silently dropped: adding one
   * to `ViewStep` fails this switch at compile time.
   */
  private perform(stepToPlay: ViewStep): void {
    this.message.say(stepToPlay.caption, stepToPlay.kind === "rejected");

    // Both cards read the state THIS step carries, before the step's own animation runs. An
    // hp-bearing step then overrides its target's HP with the tween's start value, below.
    if (stepToPlay.kind !== "battleOpen" && stepToPlay.kind !== "swap") this.paintPanels(stepToPlay);

    switch (stepToPlay.kind) {
      case "battleOpen":
        this.rebuildPanels(stepToPlay.playerAt, stepToPlay.enemyAt);
        return;

      case "turnBanner":
        return;

      case "attack": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel === undefined) return;
        const dir = stepToPlay.uid === stepToPlay.activePlayerUid ? 1 : -1;
        floatingNumber(this, panel.sprite, stepToPlay.moveName, "text", stepToPlay.hold);
        // `lunge` moves the sprite; nothing about the move's power or type is consulted here, and
        // nothing about its TARGET either — the log does not carry one (see game/battle-view.ts).
        lunge(this, panel.sprite, dir, stepToPlay.hold);
        return;
      }

      case "evade": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel !== undefined) flash(this, panel.sprite, "cool", stepToPlay.hold);
        return;
      }

      case "hit": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel === undefined) return;
        hitShake(this, panel.sprite, stepToPlay.hold);
        flash(this, panel.sprite, effectivenessRole(stepToPlay.effectiveness, stepToPlay.crit), stepToPlay.hold);
        floatingNumber(
          this,
          panel.sprite,
          damageNumberText(stepToPlay.amount, "down"),
          effectivenessRole(stepToPlay.effectiveness, stepToPlay.crit),
          stepToPlay.hold,
        );
        this.tweenHp(panel, stepToPlay.hpFrom, stepToPlay.hpTo, stepToPlay.maxHp, stepToPlay.hold);
        return;
      }

      case "heal": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel === undefined) return;
        floatingNumber(this, panel.sprite, damageNumberText(stepToPlay.amount, "up"), "good", stepToPlay.hold);
        this.tweenHp(panel, stepToPlay.hpFrom, stepToPlay.hpTo, stepToPlay.maxHp, stepToPlay.hold);
        return;
      }

      case "statusApply":
      case "statusSkip":
      case "statusClear": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel !== undefined) flash(this, panel.sprite, "status", stepToPlay.hold);
        return;
      }

      case "statusTick": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel === undefined) return;
        floatingNumber(this, panel.sprite, damageNumberText(stepToPlay.amount, "down"), "status", stepToPlay.hold);
        this.tweenHp(panel, stepToPlay.hpFrom, stepToPlay.hpTo, stepToPlay.maxHp, stepToPlay.hold);
        return;
      }

      case "statMod":
        return;

      case "faint": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel !== undefined) faintFade(this, panel.sprite, stepToPlay.hold);
        return;
      }

      case "swap":
        this.rebuildPanels(stepToPlay.playerAt, stepToPlay.enemyAt);
        return;

      case "item":
        return;

      case "snareThrow": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel === undefined) return;
        // The shake count is the log's, drawn by core/battle.ts. The scene only counts it out.
        snareShake(this, panel.sprite, stepToPlay.shakes, stepToPlay.caught, VIEW_TIMING.shake);
        return;
      }

      case "caught": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel !== undefined) catchBurst(this, panel.sprite, stepToPlay.hold);
        return;
      }

      case "flee": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel === undefined || !stepToPlay.success) return;
        // NOT `faintFade`. Hard Req 8 makes the sink-and-fade the KO's vocabulary and nothing
        // else's; escaping and being knocked out must not look identical. The fleeing side bolts
        // the way it faces.
        fleeDash(this, panel.sprite, stepToPlay.uid === stepToPlay.activePlayerUid ? -1 : 1, stepToPlay.hold);
        return;
      }

      case "xp":
        return;

      case "levelUp": {
        const panel = this.panelFor(stepToPlay.uid, stepToPlay);
        if (panel !== undefined) levelUpFlash(this, panel.sprite, stepToPlay.level, stepToPlay.hold);
        // The card was already painted from this step's carried state, which has the new level from
        // the log and the new max HP re-read off BattleState. `resyncRequired` still stands for the
        // matching curHp rise, which is core's rule and lands at the end-of-step resync.
        return;
      }

      case "lure":
      case "rejected":
        return;

      case "battleClose":
        this.menu.setVisible(false);
        return;
    }
  }

  /**
   * Slide the card from the HP it had to the HP the log says it has.
   *
   * The tween carries the HP VALUE, not a pixel width, so the bar and the printed number are the
   * same animation and cannot disagree. Both endpoints come off the step: `hpFrom` is the log's own
   * starting value. The first cut seeded the tween with the bar's FULL width and animated to the
   * end value, so a wounded creature's bar refilled to 100% at the start of every blow and drained
   * again, and a heal played as the bar collapsing from full. `hpFrom` was on the step all along
   * and the scene never read it.
   *
   * The tween is handed to the panel so that destroying the panel cancels it: an `onUpdate` closure
   * outlives its target, and Phaser's tween loop threw a `TypeError` writing to a destroyed
   * rectangle the moment a rebuild landed mid-tween.
   */
  private tweenHp(panel: CombatantPanel, hpFrom: number, hpTo: number, maxHp: number, duration: number): void {
    panel.setHp(hpFrom, maxHp);
    const holder = { hp: hpFrom };
    const tween = this.tweens.add({
      targets: holder,
      hp: hpTo,
      duration,
      onUpdate: () => {
        if (panel.destroyed) return;
        panel.setHp(Math.round(holder.hp), maxHp);
      },
      onComplete: () => {
        if (panel.destroyed) return;
        panel.setHp(hpTo, maxHp);
      },
    });
    panel.ownHpTween(tween);
  }

  /* ── input ──────────────────────────────────────────────────────────────── */

  private openMenu(): void {
    this.menu.setVisible(true);
    this.renderMenu();
  }

  /**
   * Draw the menu.
   *
   * The focused row's `reason` is core's `illegalActionReason` string, and core/types.ts says of it:
   * "it is a diagnostic, not player-facing copy (G7)". So it is NOT printed. The first cut pushed it
   * into the narration line — the player read `the active battler has fainted — only a switch is
   * accepted` and `"salve" is not a battle medicine (balance.medicine)` as if they were the story of
   * the fight — and, with no `else` branch, the line then stayed up while the cursor sat on
   * perfectly legal rows and even after the pane changed. The player-facing answer is the greyed
   * row, which `BattleMenuPanel` already paints; the string is kept for {@link lastRefusal}.
   */
  private renderMenu(): void {
    const model = this.menu.render(this.menuInput.entries(this.state, this.ctx), this.menuInput.cursor);
    this.refusal = model.focusedReason;
  }

  private bindKeys(): void {
    const keyboard = this.keyboard();
    if (keyboard === undefined) return;
    const bind = (event: string, key: BattleKey): void => {
      keyboard.on(event, () => {
        this.handleKey(key);
      });
    };
    bind("keydown-UP", "up");
    bind("keydown-DOWN", "down");
    bind("keydown-Z", "confirm");
    bind("keydown-ENTER", "confirm");
    bind("keydown-X", "cancel");
    bind("keydown-ESC", "cancel");
  }

  /** `Scene.input.keyboard` is nullable (headless / no-input builds). */
  private keyboard(): Phaser.Input.Keyboard.KeyboardPlugin | undefined {
    return this.input.keyboard ?? undefined;
  }

  private handleKey(key: BattleKey): void {
    if (this.playing || this.finished || this.state.outcome !== null) return;
    if (this.view.pending > 0) return;
    const result = applyKey(this.menuInput, key, this.state, this.ctx);
    if (result.blocked !== undefined) {
      // Core's own refusal string is a DIAGNOSTIC, not copy (core/types.ts) — recorded, not printed.
      this.refusal = result.blocked;
      this.renderMenu();
      return;
    }
    if (result.action === undefined) {
      this.renderMenu();
      return;
    }
    this.commit(result.action);
  }

  /**
   * Hand one action to the reducer and play what comes back.
   *
   * This is the entire game-logic surface of the scene: `step(...)` in, `events[]` out, and every
   * absolute re-read from the returned state.
   */
  commit(action: BattleAction): void {
    this.menu.setVisible(false);
    const result = step(this.state, action, this.rng, this.ctx);
    this.state = result.state;
    this.view.push(result.events, this.state);
    this.menuInput.reset();
    this.pump();
  }

  /* ── read-only surface for integration tests and the demo capture ───────── */

  /** Every visual step this scene has played, in order. */
  playedSteps(): readonly ViewStep[] {
    return this.view.played;
  }

  /** The live reducer state. Read-only by contract — mutate it and the tests stop meaning anything. */
  battleState(): BattleState {
    return this.state;
  }

  /** The line currently in the message box. */
  currentMessage(): string {
    return this.message.text();
  }

  /**
   * Core's last refusal string, for debugging and for tests. It is never drawn: core/types.ts calls
   * `actionRejected.reason` "a diagnostic, not player-facing copy".
   */
  lastRefusal(): string {
    return this.refusal;
  }

  /** The two live combatant panels, for tests that count what is actually on the display list. */
  panels(): { player?: CombatantPanel; enemy?: CombatantPanel } {
    return {
      ...(this.playerPanel === undefined ? {} : { player: this.playerPanel }),
      ...(this.enemyPanel === undefined ? {} : { enemy: this.enemyPanel }),
    };
  }
}
