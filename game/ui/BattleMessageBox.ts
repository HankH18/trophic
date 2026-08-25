/**
 * game/ui/BattleMessageBox.ts — the narration line at the foot of the battle screen.
 *
 * It prints `ViewStep.caption` and NOTHING ELSE. Every caption was composed in
 * `game/battle-view.ts` out of the event log's own numbers, so this widget cannot invent a line, and
 * a beat that never reached the log can never be narrated here — which is the point of the §7.4
 * renderer contract.
 *
 * G7: identifiers and numbers only. There is no moralizing copy about catching anywhere in the
 * battle screen, and KO is FAINT ONLY (Hard Req 8) — no word from the death family is printed.
 *
 * A `diagnostic` step (core's `actionRejected` reason string) is drawn muted and framed differently,
 * because core/types.ts calls that string "a diagnostic, not player-facing copy".
 */

import type PhaserNS from "phaser";
import { roleColor, roleHex } from "./Palette";

export interface MessageBoxStyle {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: string;
  padding: number;
}

export class BattleMessageBox {
  readonly root: PhaserNS.GameObjects.Container;
  private readonly label: PhaserNS.GameObjects.Text;
  private current = "";

  constructor(scene: PhaserNS.Scene, style: MessageBoxStyle) {
    const plate = scene.add.rectangle(0, 0, style.width, style.height, roleColor("panel"));
    plate.setOrigin(0, 0);
    plate.setStrokeStyle(1, roleColor("border"));

    this.label = scene.add.text(style.padding, style.padding, "", {
      fontFamily: "monospace",
      fontSize: style.fontSize,
      color: roleHex("text"),
      wordWrap: { width: style.width - style.padding * 2 },
    });
    this.label.setOrigin(0, 0);

    this.root = scene.add.container(style.x, style.y, [plate, this.label]);
  }

  /** Show a caption. `diagnostic` mutes it — a refusal is not narration. */
  say(caption: string, diagnostic = false): void {
    this.current = caption;
    this.label.setText(caption);
    this.label.setColor(roleHex(diagnostic ? "textMuted" : "text"));
  }

  clear(): void {
    this.say("");
  }

  /** What is on screen right now — what a screenshot test or the demo capture reads. */
  text(): string {
    return this.current;
  }
}
