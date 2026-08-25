/**
 * game/ui/BattleMenuPanel.ts — draws the rows `game/battle-input.ts` produces.
 *
 * It renders `MenuEntry[]` and highlights a cursor. It decides nothing: whether a row is greyed is
 * `MenuEntry.disabled`, which `battle-input.ts` got from `illegalActionReason` in `core/battle.ts`.
 * A widget that greyed a row on its own reasoning would be a second rulebook (build-doc §6 INV-3).
 *
 * ENGINE: `import type PhaserNS` only — the layout model below is a pure function and is tested.
 */

import type PhaserNS from "phaser";
import type { MenuEntry } from "../battle-input";
import { roleColor, roleHex, type UiSwatchRole } from "./Palette";

export interface MenuPanelStyle {
  x: number;
  y: number;
  width: number;
  rowHeight: number;
  padding: number;
  fontSize: string;
  /** Rows shown at once; the list scrolls to keep the cursor inside this window. */
  visibleRows: number;
}

export interface MenuRowRender {
  entry: MenuEntry;
  index: number;
  focused: boolean;
  /** Which palette role the label paints in — the greying, made explicit and testable. */
  labelRole: UiSwatchRole;
  y: number;
}

export interface MenuPanelModel {
  rows: MenuRowRender[];
  /** First entry index drawn — the scroll window's top. */
  firstIndex: number;
  /** Core's refusal for the focused row, or "" — shown under the panel, never as flavour text. */
  focusedReason: string;
}

/** Pure layout. Given the rows and the cursor, say exactly what is drawn where and in what colour. */
export function menuPanelModel(entries: readonly MenuEntry[], cursor: number, style: MenuPanelStyle): MenuPanelModel {
  const count = entries.length;
  const windowSize = Math.max(1, Math.min(style.visibleRows, count));
  const focused = count === 0 ? 0 : ((cursor % count) + count) % count;
  const firstIndex = Math.max(0, Math.min(focused - Math.floor((windowSize - 1) / 2), count - windowSize));
  const rows: MenuRowRender[] = [];
  for (let slot = 0; slot < windowSize; slot += 1) {
    const index = firstIndex + slot;
    const entry = entries[index];
    if (entry === undefined) continue;
    const isFocused = index === focused;
    rows.push({
      entry,
      index,
      focused: isFocused,
      labelRole: entry.disabled ? "border" : isFocused ? "accent" : "text",
      y: style.padding + slot * style.rowHeight,
    });
  }
  const focusedEntry = entries[focused];
  return { rows, firstIndex, focusedReason: focusedEntry?.reason ?? "" };
}

export class BattleMenuPanel {
  readonly root: PhaserNS.GameObjects.Container;
  private readonly plate: PhaserNS.GameObjects.Rectangle;
  private readonly cursor: PhaserNS.GameObjects.Rectangle;
  private readonly labels: PhaserNS.GameObjects.Text[] = [];
  private readonly details: PhaserNS.GameObjects.Text[] = [];
  private readonly style: MenuPanelStyle;
  private lastModel: MenuPanelModel = { rows: [], firstIndex: 0, focusedReason: "" };

  constructor(scene: PhaserNS.Scene, style: MenuPanelStyle) {
    this.style = style;
    const height = style.padding * 2 + style.rowHeight * style.visibleRows;
    this.plate = scene.add.rectangle(0, 0, style.width, height, roleColor("panel"));
    this.plate.setOrigin(0, 0);
    this.plate.setStrokeStyle(1, roleColor("border"));

    this.cursor = scene.add.rectangle(style.padding - 1, style.padding, style.width - style.padding * 2, style.rowHeight, roleColor("panelInner"));
    this.cursor.setOrigin(0, 0);

    const children: PhaserNS.GameObjects.GameObject[] = [this.plate, this.cursor];
    for (let slot = 0; slot < style.visibleRows; slot += 1) {
      const label = scene.add.text(style.padding + 3, style.padding + slot * style.rowHeight, "", {
        fontFamily: "monospace",
        fontSize: style.fontSize,
        color: roleHex("text"),
      });
      label.setOrigin(0, 0);
      const detail = scene.add.text(style.width - style.padding - 3, style.padding + slot * style.rowHeight, "", {
        fontFamily: "monospace",
        fontSize: style.fontSize,
        color: roleHex("textMuted"),
      });
      detail.setOrigin(1, 0);
      this.labels.push(label);
      this.details.push(detail);
      children.push(label, detail);
    }
    this.root = scene.add.container(style.x, style.y, children);
  }

  /** Redraw from the current rows and cursor. Pure model in, Phaser objects updated. */
  render(entries: readonly MenuEntry[], cursor: number): MenuPanelModel {
    const model = menuPanelModel(entries, cursor, this.style);
    this.lastModel = model;
    for (let slot = 0; slot < this.labels.length; slot += 1) {
      const row = model.rows[slot];
      const label = this.labels[slot];
      const detail = this.details[slot];
      if (label === undefined || detail === undefined) continue;
      if (row === undefined) {
        label.setText("");
        detail.setText("");
        continue;
      }
      label.setText(row.entry.label);
      label.setColor(roleHex(row.labelRole));
      detail.setText(row.entry.detail);
      detail.setColor(roleHex(row.entry.disabled ? "border" : "textMuted"));
      if (row.focused) this.cursor.setY(row.y);
    }
    this.cursor.setVisible(model.rows.length > 0);
    return model;
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  /** The model last drawn — the assertion surface for a screenshot or an integration test. */
  model(): MenuPanelModel {
    return this.lastModel;
  }
}
