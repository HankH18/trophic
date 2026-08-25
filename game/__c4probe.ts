/* TEMPORARY C4 repair probe — deleted before the lane reports. Drives the real LedgerScene. */
import Phaser from "phaser";
import { validateContent } from "@core/schemas";
import { newSave, openStreams } from "@core/save";
import { createRng } from "@core/rng";
import { stepRegionStates } from "@core/ecosim";
import { seasonAt } from "@core/clock";
import type { NodeState, Season } from "@core/types";
import { LedgerScene, type LedgerSceneData } from "./scenes/LedgerScene";
import { ledgerHistory } from "./ledger-history";
import { registry } from "./registry";

const content = validateContent();
const balance = content.balance;
registry.reset();
registry.setContent(content);

let save = newSave({ seed: 12, currentNode: "r2", nodes: content.nodes }, balance);
registry.startSession({ slot: 1, save, streams: openStreams(save, balance) });

// Three real season steps, adopted exactly the way the overworld adopts them.
const rng = createRng(12);
const seasons = balance.clock.seasonOrder as Season[];
for (let i = 0; i < 3; i += 1) {
  const states = stepRegionStates(content.nodes, save.nodeStates, seasons[i % 4] as Season, rng).states;
  save = { ...save, tick: (i + 1) * balance.clock.ticksPerSeason, nodeStates: states };
  registry.setSave(save);
}
// …and the player catches this node's migrant out (the case the audit measured).
const live = JSON.parse(JSON.stringify(save.nodeStates)) as Record<string, NodeState>;
(live["r2"]?.populations["reedrick-line"] as { count: number }).count = 0;
save = { ...save, nodeStates: live };
registry.setSave(save);

const season = seasonAt(save.tick, balance);
const data = (mode: "numbers" | "web"): LedgerSceneData => ({
  content,
  states: () => registry.save().nodeStates,
  histories: ledgerHistory.histories(),
  year: save.year,
  season,
  startNodeId: "r2",
  mode,
});

function mount(id: string, mode: "numbers" | "web"): void {
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: id,
    width: balance.map.virtualWidth,
    height: balance.map.virtualHeight,
    backgroundColor: "#14140f",
    scene: [],
    scale: { mode: Phaser.Scale.NONE, zoom: 2 },
  });
  game.events.once("ready", () => {
    game.scene.add(LedgerScene.KEY, LedgerScene, false);
    game.scene.start(LedgerScene.KEY, data(mode));
    window.setTimeout(() => {
      const scene = game.scene.getScene(LedgerScene.KEY) as Phaser.Scene;
      const texts: Array<{ text: string; x: number; y: number; w: number; h: number }> = [];
      scene.children.list.forEach((obj) => {
        const each = (o: Phaser.GameObjects.GameObject): void => {
          if (o instanceof Phaser.GameObjects.Text) {
            const b = o.getBounds();
            texts.push({ text: o.text, x: b.x, y: b.y, w: b.width, h: b.height });
          } else if (o instanceof Phaser.GameObjects.Container) {
            o.list.forEach(each);
          }
        };
        each(obj);
      });
      const store = (window as unknown as Record<string, unknown>)["__c4"] as Record<string, unknown> | undefined;
      const out = store ?? {};
      out[mode] = texts;
      (window as unknown as Record<string, unknown>)["__c4"] = out;
    }, 300);
  });
}
mount("numbers", "numbers");
mount("web", "web");
