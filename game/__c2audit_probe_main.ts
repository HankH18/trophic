/** THROWAWAY AUDIT PROBE (C2 verifier) — delete after the run. */
import Phaser from "phaser";
import { OverworldScene } from "./scenes/OverworldScene";
import { validateContent } from "../core/schemas";
import { newSave, openStreams } from "../core/save";
import { applyCatch, fromNodeState, toNodeState } from "../core/ecosim";
import { encounterTable } from "./encounters";
import type { Encounter } from "./encounters";

const out: string[] = [];
const log = (...a: unknown[]) => {
  out.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
};

declare global {
  interface Window {
    __done?: boolean;
    __out?: string;
  }
}

const errors: string[] = [];
window.addEventListener("error", (e) => errors.push("window.error: " + e.message));
window.addEventListener("unhandledrejection", (e) => errors.push("unhandledrejection: " + String(e.reason)));

const TARGET = "pyrelisk-line";
const PREDATOR = "stonewing-line";
const NODE = "r4";

function keyEvent(type: string, keyCode: number, code: string): KeyboardEvent {
  const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, code });
  Object.defineProperty(ev, "keyCode", { get: () => keyCode });
  Object.defineProperty(ev, "which", { get: () => keyCode });
  return ev;
}

async function run(): Promise<void> {
  const content = validateContent();
  const balance = content.balance;
  const save = newSave({ seed: 4242, currentNode: NODE, nodes: content.nodes }, balance);
  const streams = openStreams(save, balance);

  let encounters = 0;
  const met: Record<string, number> = {};
  const clockEvents: string[] = [];
  let catches = 0;

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: balance.map.virtualWidth,
    height: balance.map.virtualHeight,
    parent: "game",
    banner: false,
    scene: [],
  });

  await new Promise<void>((res) => game.events.once(Phaser.Core.Events.READY, () => res()));

  const scene = game.scene.add(
    "Overworld",
    OverworldScene,
    true,
    {
      content,
      save,
      streams,
      startNode: NODE,
      hooks: {
        onEncounter: (e: Encounter, s: OverworldScene) => {
          encounters += 1;
          met[e.lineId] = (met[e.lineId] ?? 0) + 1;
          if (e.lineId === TARGET) {
            // THE REAL CATCH PATH: core/ecosim.applyCatch on the live node, written back to the save.
            const file = content.nodes.find((n) => n.id === e.nodeId)!;
            const live = fromNodeState(file, s.save.nodeStates[e.nodeId]!);
            const after = applyCatch(live, e.lineId, balance);
            s.save = {
              ...s.save,
              nodeStates: { ...s.save.nodeStates, [e.nodeId]: toNodeState(after) },
            };
            catches += 1;
          }
        },
        onClockEvents: (evs: Array<{ t: string }>) => {
          for (const ev of evs) clockEvents.push(ev.t);
          return false; // let the scene run its own defaults, as it would standalone
        },
      },
    },
  ) as OverworldScene;

  // wait for create()
  for (let i = 0; i < 200 && !scene.mapView; i++) await new Promise((r) => setTimeout(r, 20));
  log("scene created:", !!scene.mapView, "collision:", scene.collision.source, scene.collision.note);
  log("start tile:", JSON.stringify(scene.movement.tile), "grid", scene.collision.grid.cols + "x" + scene.collision.grid.rows);

  // Take manual control of the frame loop.
  game.loop.stop();

  const before = { ...scene.save.nodeStates[NODE]!.populations[TARGET]! };
  log("BEFORE:", TARGET, "count =", before.count);
  log(
    "BEFORE table:",
    JSON.stringify(encounterTable(scene.forayContext()).map((e) => [e.lineId, e.weight, e.active])),
  );

  // Hold a direction; flip it at the border so we keep stepping.
  const dirs: Array<[number, string]> = [
    [39, "ArrowRight"],
    [37, "ArrowLeft"],
  ];
  let t = 0;
  const DT = 200; // > msPerTile (160) so each update lands at least one step
  let di = 0;
  window.dispatchEvent(keyEvent("keydown", dirs[0]![0], dirs[0]![1]));

  const predTrace: string[] = [];
  const seenAt: Record<number, number> = {};
  let firstZeroStep = -1;
  let stepsAfterZero = 0;
  let metAfterZero = 0;

  for (let i = 0; i < 3000; i++) {
    // reverse direction every 40 steps so we bounce inside the border
    if (i > 0 && i % 40 === 0) {
      window.dispatchEvent(keyEvent("keyup", dirs[di]![0], dirs[di]![1]));
      di = 1 - di;
      window.dispatchEvent(keyEvent("keydown", dirs[di]![0], dirs[di]![1]));
    }
    t += DT;
    scene.update(t, DT);

    if (i % 250 === 0) {
      const tbl = encounterTable(scene.forayContext());
      predTrace.push(
        `i=${i} y${scene.save.year}t${scene.save.tick} ${TARGET}=${tbl.find((e) => e.lineId === TARGET)!.weight} ${PREDATOR}=${tbl.find((e) => e.lineId === PREDATOR)!.weight} metPred=${met[PREDATOR] ?? 0}`,
      );
    }
    const c = scene.save.nodeStates[NODE]!.populations[TARGET]!.count;
    seenAt[i] = c;
    if (c === 0 && firstZeroStep < 0) {
      firstZeroStep = i;
      metAfterZero = met[TARGET] ?? 0;
    }
    if (firstZeroStep >= 0) stepsAfterZero += 1;
  }

  window.dispatchEvent(keyEvent("keyup", dirs[di]![0], dirs[di]![1]));

  const afterCount = scene.save.nodeStates[NODE]!.populations[TARGET]!.count;
  log("AFTER:", TARGET, "count =", afterCount, "catches =", catches);
  log("steps taken:", scene.movement.stepsTaken, "encounters:", encounters);
  log("met:", JSON.stringify(met));
  log("first update index at which count hit 0:", firstZeroStep, "updates after that:", stepsAfterZero);
  log(
    "TARGET encounters BEFORE zero:",
    metAfterZero,
    "TARGET encounters AFTER zero:",
    (met[TARGET] ?? 0) - metAfterZero,
  );
  log(
    "AFTER table:",
    JSON.stringify(encounterTable(scene.forayContext()).map((e) => [e.lineId, e.weight, e.active])),
  );
  log("PREDATOR TRACE:\n" + predTrace.join("\n"));
  log("clock events seen by hook:", JSON.stringify(clockEvents));
  log("save year/tick:", scene.save.year, scene.save.tick);
  const acts: Record<string, number> = {};
  for (const e of scene.save.actionLog) acts[e.action.t] = (acts[e.action.t] ?? 0) + 1;
  log("action log:", JSON.stringify(acts));
  log("hearthollow now:", JSON.stringify(scene.save.nodeStates[NODE]!.populations));
  
  log("errors:", JSON.stringify(errors));
}

run()
  .catch((e) => {
    log("FATAL:", String(e && (e as Error).stack ? (e as Error).stack : e));
  })
  .finally(() => {
    window.__out = out.join("\n");
    window.__done = true;
    const pre = document.createElement("pre");
    pre.id = "out";
    pre.textContent = window.__out;
    document.body.appendChild(pre);
  });
