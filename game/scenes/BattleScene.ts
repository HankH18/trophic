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
 * overworld/survey lane applies it. See LANE-A-STATUS §6.1.
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
 * Every line printed here comes from `ViewStep.caption`, which is identifiers and numbers, or from
 * `menuContextLine` (game/battle-input.ts), which is the armed snare tier and nothing else. There is
 * no moralizing copy about catching anywhere in the battle screen, and KO is FAINT ONLY — no word
 * from the death family appears in any string in this lane.
 *
 * `illegalActionReason`'s strings are NOT printed: core/types.ts calls that field "a diagnostic, not
 * player-facing copy", and a greyed row is the player-facing answer. This claim used to be FALSE —
 * `perform` said every caption unconditionally and the compiler had made the refusal's caption the
 * reason string, so the diagnostic went to the screen and `lastRefusal()` stayed empty, exactly
 * inverting the design described here. The refusal now has no caption to print, `perform` records it
 * instead of saying it, and `BattleMessageBox.say` no longer takes the "diagnostic" flag that muted
 * rather than refused. The strings stay reachable through `lastRefusal()` for debugging.
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
import { BattleInput, applyKey, menuContextLine, type BattleKey } from "../battle-input";
import { BattleMessageBox } from "../ui/BattleMessageBox";
import { BattleMenuPanel } from "../ui/BattleMenuPanel";
import { CombatantPanel, type CardExtras } from "../ui/BattleHud";
import { battleScreenLayout, type BattleScreenLayout } from "../ui/BattleLayout";
import { catchBurst, catchSettle, damageNumberText, effectivenessRole, faintFade, flash, fleeDash, floatingNumber, hitShake, levelUpFlash, lunge, snareShake } from "../ui/BattleFx";
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
   *
   * REQUIRED, and it used to be optional. This scene deliberately routes nowhere — it does not know
   * whether the fight was launched over a paused overworld, from a menu, or by the demo capture, and
   * a `scene.start` guessed here would be C3 deciding C1's navigation. But "the scene does not route"
   * plus "the callback is optional" adds up to a screen a caller can leave the player stranded on:
   * once the reducer reports an outcome nothing on screen changes, `handleKey` returns early, and
   * the scene never stops itself. Making the seam mandatory is the structural fix — a caller cannot
   * forget what the type will not let it omit. `game/scenes/OverworldScene.ts` supplies it and does
   * `scene.stop(battle)` + `scene.resume()` there.
   */
  onFinished: (result: { state: BattleState; caught: CaughtIndividual | null }) => void;
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
  /**
   * Core's last refusal string. A DIAGNOSTIC — never printed (core/types.ts), kept for debugging.
   *
   * "LAST", so it is only ever written with a NON-EMPTY reason. The first cut assigned
   * `model.focusedReason` on every menu render, which is `""` whenever the cursor sits on a legal
   * row — so a refusal the reducer had just produced was wiped by the menu re-opening one beat
   * later, and the accessor read empty at exactly the moment something had been refused.
   */
  private refusal = "";
  /** How many `ViewStep`s `perform` has drawn. Read-only; the integration tests step on this. */
  private performed = 0;
  private onFinished!: (result: { state: BattleState; caught: CaughtIndividual | null }) => void;
  /** The lure move's display name, derived from content. "" when content declares no such move. */
  private lureLabel = "";

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
    this.onFinished = data.onFinished;
    this.lureLabel = this.lureMoveName();

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
    this.rebuildPanels(
      this.viewOf(this.view.snapshot.activePlayerUid),
      this.viewOf(this.view.snapshot.activeEnemyUid),
      this.view.snapshot.lureActive,
    );
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

  /**
   * The lure move's name, for the card's persistent Lure chip.
   *
   * DERIVED, not written: the lure is the move whose effect is `{kind:"catchOdds"}` (core/types.ts
   * `MoveEffect`), so the id and the display word both come out of `data/moves.json` and no move
   * name is typed into `game/` (build-doc §8.3 / G2). Content with no such move yields "" and the
   * card draws no chip, rather than this file coining a word for a mechanic that is not there.
   */
  private lureMoveName(): string {
    for (const move of this.ctx.moves.values()) {
      if (move.effects.some((effect) => effect.kind === "catchOdds")) return move.name;
    }
    return "";
  }

  /** What the enemy card needs beyond the battler: the lure chip. `ViewStep` carries the flag. */
  private enemyExtras(lureActive: boolean): CardExtras {
    return { lureActive, lureLabel: this.lureLabel };
  }

  /** What the player card needs beyond the battler: bible §4's projected retirement year. */
  private playerExtras(uid: string): CardExtras {
    const year = this.retirementYears[uid];
    return year === undefined ? {} : { projectedRetirementYear: year };
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
  private rebuildPanels(
    player: BattlerView | null | undefined,
    enemy: BattlerView | null | undefined,
    lureActive: boolean,
  ): void {
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
        ...this.playerExtras(player.uid),
      });
    }

    if (enemy !== undefined && enemy !== null) {
      this.enemyPanel = new CombatantPanel(this, {
        x: this.layout.enemySprite.x,
        y: this.layout.enemySprite.y,
        cardX: this.layout.enemyCard.x,
        cardY: this.layout.enemyCard.y,
        view: enemy,
        ...this.enemyExtras(lureActive),
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
    if (at.playerAt !== null) this.playerPanel?.update(at.playerAt, this.playerExtras(at.playerAt.uid));
    // `at.lureActive`, not `this.state.lureActive`: the step's own carried flag, for exactly the
    // reason `playerAt`/`enemyAt` are carried — the state has already moved to the end of the turn.
    if (at.enemyAt !== null) this.enemyPanel?.update(at.enemyAt, this.enemyExtras(at.lureActive));
  }

  /** Re-read the absolutes onto both cards. Only legal once the queue has drained. */
  private refreshPanels(): void {
    const snapshot = this.view.snapshot;
    const player = this.viewOf(snapshot.activePlayerUid);
    if (player !== undefined) {
      this.playerPanel?.update(player, this.playerExtras(player.uid));
    }
    const enemy = this.viewOf(snapshot.activeEnemyUid);
    if (enemy !== undefined) this.enemyPanel?.update(enemy, this.enemyExtras(snapshot.lureActive));
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
      this.onFinished({ state: this.state, caught: caughtIndividual(this.state, this.ctx) });
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
    this.performed += 1;

    // THE ONE STRING THAT NEVER REACHES THE MESSAGE BOX.
    //
    // This line used to be `this.message.say(caption, kind === "rejected")` — unconditional, with a
    // flag that MUTED a refusal instead of refusing it — and `game/battle-view.ts` set the rejected
    // step's caption to `illegalActionReason`'s string. So core's diagnostic ("only a wild creature
    // can be snared") was printed as the story of the fight while `lastRefusal()` stayed empty: the
    // design this file's header describes was exactly inverted. The refusal is now RECORDED and the
    // narration line is left alone; `BattleMessageBox.say` no longer has a second argument to pass.
    if (stepToPlay.kind === "rejected") this.noteRefusal(stepToPlay.reason);
    else this.message.say(stepToPlay.caption);

    // Both cards read the state THIS step carries, before the step's own animation runs. An
    // hp-bearing step then overrides its target's HP with the tween's start value, below.
    if (stepToPlay.kind !== "battleOpen" && stepToPlay.kind !== "swap") this.paintPanels(stepToPlay);

    switch (stepToPlay.kind) {
      case "battleOpen":
        this.rebuildPanels(stepToPlay.playerAt, stepToPlay.enemyAt, stepToPlay.lureActive);
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
        this.rebuildPanels(stepToPlay.playerAt, stepToPlay.enemyAt, stepToPlay.lureActive);
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
        if (panel === undefined) return;
        catchBurst(this, panel.sprite, stepToPlay.hold);
        // …and the creature LEAVES THE FIELD. `catchBurst` alone left the caught animal standing at
        // full opacity beside a full-HP card under the word "Caught" — the only terminal beat that
        // did not remove its subject (faint and flee both end at alpha 0). `catchSettle` is its own
        // picture: drawn in, not sunk (Hard Req 8 keeps the sink for a KO) and not bolting sideways.
        catchSettle(this, panel.sprite, panel.root, stepToPlay.hold);
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

      case "lure": {
        // The PERSISTENT readout is the enemy card's Lure chip, already repainted by `paintPanels`
        // above from this step's own `lureActive`. This is just the beat that draws the eye to it:
        // before the chip existed the lure's entire on-screen life was this 260ms caption, in the
        // one mechanic bible §3 keeps up for the rest of the battle.
        const panel = this.panelFor(stepToPlay.activeEnemyUid, stepToPlay);
        if (panel !== undefined) flash(this, panel.sprite, "accent", stepToPlay.hold);
        return;
      }

      case "rejected":
        // Recorded at the top of `perform`, drawn nowhere. core/types.ts: a diagnostic, not copy.
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
   * Re-purpose the narration line for the menu that is now on top of it.
   *
   * WAS NEVER CALLED. `openMenu` made the panel visible and never touched the message box, so the
   * player chose their next action under the PREVIOUS turn's damage line — and, walking root →
   * Snare → Weighted → baits, nothing on screen ever said WHICH tier had been armed, in the pane
   * `game/battle-input.ts` calls the largest lever the player has on catch odds. `menuContextLine`
   * is that missing sentence; every other pane clears the line instead of leaving stale arithmetic
   * under a menu it no longer describes. (`BattleMessageBox.clear()` existed and had no caller.)
   */
  private sayMenuContext(): void {
    this.message.say(menuContextLine(this.menuInput));
  }

  /**
   * Draw the menu.
   *
   * The focused row's `reason` is core's `illegalActionReason` string, and core/types.ts says of it:
   * "it is a diagnostic, not player-facing copy (G7)". So it is NOT printed — here or anywhere. The
   * first cut pushed it into the narration line, and the SECOND cut only moved the leak: it stopped
   * printing it from this method and went on printing it from `perform`, because
   * `game/battle-view.ts` had made the refusal's CAPTION the reason string. Both holes are closed at
   * the source — the caption is now `""` — and this method records the string for {@link lastRefusal}
   * and repaints the menu. The player-facing answer is the greyed row, which `BattleMenuPanel`
   * paints; the narration line says what pane the cursor is in, or nothing.
   */
  private renderMenu(): void {
    const model = this.menu.render(this.menuInput.entries(this.state, this.ctx), this.menuInput.cursor);
    this.noteRefusal(model.focusedReason);
    this.sayMenuContext();
  }

  /** Record a refusal, if there is one. Never clears — see {@link refusal}. */
  private noteRefusal(reason: string): void {
    if (reason !== "") this.refusal = reason;
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
      this.noteRefusal(result.blocked);
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

  /**
   * How many of {@link playedSteps} have actually been DRAWN.
   *
   * The suite used to derive this by counting writes to the message label, on the grounds that
   * `perform` says exactly one caption per step. That stopped being true the moment a step could
   * decline to narrate (a refusal) or something other than a step could write (the menu's context
   * line), and a heuristic that silently miscounts turns a mid-animation assertion into an assertion
   * about the wrong frame. The scene knows the number; it says it.
   */
  performedCount(): number {
    return this.performed;
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
