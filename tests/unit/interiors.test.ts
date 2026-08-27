/**
 * tests/unit/interiors.test.ts — the building interiors: the shipped blueprints, and the loader.
 *
 * TWO HALVES, AND THEY BIND DIFFERENTLY.
 *
 *   1. THE SHIPPED CORPUS. Assertions over `INTERIORS` — the four blueprints in `data/interiors/`.
 *      `core/interiors.ts` validates these at IMPORT time and throws on drift, so a broken blueprint
 *      takes this whole file red before a single `it` runs. That is the designed behaviour and it is
 *      why these assertions are written as restatements from the OUTSIDE: the plan is re-lexed
 *      through `game/collision.ts`'s `gridFromAscii`, and the dialogue ids are re-read from the
 *      shipped bytes of `data/dialogue.json`, so neither leans on the loader's own answer.
 *
 *   2. THE LOADER. Assertions that `validateInteriors` REFUSES — each one a deep clone of a real
 *      shipped blueprint with exactly one thing broken, run through the same public entry point the
 *      game uses. `the sound control` below asserts the unmutated clone passes, so every refusal
 *      here is evidence about the mutation and not about the clone. A refusal suite whose inputs
 *      were hand-built objects could pass while the real loader read nothing; these cannot.
 *
 * THE PARSER IS `game/collision.ts`'s, NOT A SECOND ONE. `core/interiors.ts` may not import `game/`
 * (the `no_phaser_in_core` gate walks core's import closure), so it declares "is this cell solid"
 * a second time as `planCellIsSolid`. A test file is under neither constraint, so `solidity` below
 * runs both over every shipped plan and over adversarial ones and pins them cell for cell. The day
 * the two lexers disagree is a red test here rather than a player walking through a trestle.
 *
 * NON-VACUITY. Every sweep in this file asserts what it found before it asserts anything about it.
 * A loop over an empty list passes, and this repo has shipped a fully green suite certifying an
 * absence before — 39 dialogue entries the player could not reach. `validateInteriors` refuses an
 * empty input for the same reason, and that refusal is tested.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { gridFromAscii, isBlocked } from "../../game/collision";
import { validateContent } from "../../core/schemas";
import type { Balance } from "../../core/types";
import {
  INTERIORS,
  InteriorValidationError,
  PLAN_ALPHABET,
  PLAN_DOOR,
  PLAN_FLOOR,
  PLAN_SERVICE,
  PLAN_SOLID,
  PLAN_SPEAKER,
  SHIPPED_INTERIOR_JSON,
  blueprintProblems,
  interiorById,
  interiorsOf,
  markerFor,
  planCellIsSolid,
  planCellsWith,
  planCharAt,
  planLines,
  planSize,
  validateInteriors,
} from "../../core/interiors";
import type { InteriorBlueprint } from "../../core/interiors";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const content = validateContent();
const balance: Balance = content.balance;

/** G11: the cell size is `balance.map.collisionCellPx`, never a literal. See the module header. */
const CELL_PX = balance.map.collisionCellPx;

/** The grid `game/collision.ts` makes of a plan — the mask the player will actually walk on. */
const gridOf = (bp: InteriorBlueprint) => gridFromAscii(bp.id, bp.plan, CELL_PX);

/* ── the shipped dialogue bytes, read independently of core/interiors.ts ─────
 * Deliberately `JSON.parse` of the file rather than `core/dialogue-schema.ts`'s parse or
 * `core/interiors.ts`'s `SERVICE_ENTRY_IDS`: an anchor target is a claim about what SHIPS, and a
 * check that reads the loader's own derived set can only ever agree with itself.
 * ─────────────────────────────────────────────────────────────────────────── */

interface RawDialogue {
  speakers: { id: string; home?: string }[];
  entries: { id: string; kind: string; speaker: string }[];
}

const DIALOGUE_RAW = JSON.parse(readFileSync(resolve(ROOT, "data/dialogue.json"), "utf8")) as RawDialogue;

const SHIPPED_SPEAKER_HOME = new Map(DIALOGUE_RAW.speakers.map((s) => [s.id, s.home]));
const SHIPPED_SERVICE_SPEAKER = new Map(
  DIALOGUE_RAW.entries.filter((e) => e.kind === "service").map((e) => [e.id, e.speaker]),
);

/* ── cloning and mutation, for the loader half ───────────────────────────── */

const clone = (bp: InteriorBlueprint): InteriorBlueprint => JSON.parse(JSON.stringify(bp)) as InteriorBlueprint;

/** A deep copy of a real shipped blueprint with `mutate` applied. The input is never hand-built. */
function broken(id: string, mutate: (bp: InteriorBlueprint) => void): InteriorBlueprint {
  const bp = interiorById(id);
  if (bp === null) throw new Error(`the sabotage kit points at "${id}", which is not a shipped interior`);
  const copy = clone(bp);
  mutate(copy);
  return copy;
}

/** The problems `validateInteriors` reports for one input, as one joined string. Throws if it passes. */
function refusal(...raw: unknown[]): string {
  try {
    validateInteriors(raw);
  } catch (err) {
    expect(err, "the loader threw something that is not an InteriorValidationError").toBeInstanceOf(
      InteriorValidationError,
    );
    return (err as InteriorValidationError).problems.join("\n");
  }
  throw new Error("the loader ACCEPTED this input — the refusal it is supposed to make did not happen");
}

/** Replace one character of a plan, keeping every line's length. */
function withCell(plan: string, col: number, row: number, ch: string): string {
  const lines = planLines(plan);
  const line = lines[row];
  if (line === undefined) throw new Error(`row ${String(row)} is off the plan`);
  lines[row] = line.slice(0, col) + ch + line.slice(col + 1);
  return lines.join("\n");
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. THE SHIPPED CORPUS
 * ══════════════════════════════════════════════════════════════════════════ */

/** The four the model ships, named here so a blueprint quietly dropped from the list is red. */
const EXPECTED_IDS = ["hearthollow-inn", "hearthollow-supply", "brackwater-inn", "brackwater-supply"];

describe("the shipped set — what is actually loaded, before anything is asserted about it", () => {
  it("is not empty, and is exactly the four blueprints data/interiors/ holds", () => {
    expect(INTERIORS.length, "no interiors loaded — every sweep below would pass by looking at nothing").toBeGreaterThan(0);
    expect([...INTERIORS].map((bp) => bp.id).sort()).toEqual([...EXPECTED_IDS].sort());
    expect(SHIPPED_INTERIOR_JSON.length).toBe(INTERIORS.length);
  });

  it("covers both towns of the walkable slice, and each town's inn and shop", () => {
    // Hearthollow → R1 → Brackwater → R2 is the never-cut slice; an interior model that only
    // covered one of its two towns would pass every per-blueprint sweep below.
    expect(interiorsOf("hearthollow").map((bp) => bp.id)).toEqual(["hearthollow-inn", "hearthollow-supply"]);
    expect(interiorsOf("brackwater").map((bp) => bp.id)).toEqual(["brackwater-inn", "brackwater-supply"]);
    expect(interiorsOf("bowerdeep")).toEqual([]);
  });

  it("no interior id collides with a node id — an interior is not a node", () => {
    const nodeIds = new Set(content.nodes.map((n) => n.id));
    expect(nodeIds.size).toBeGreaterThan(0);
    for (const bp of INTERIORS) {
      expect(nodeIds.has(bp.id), `${bp.id} is also a node id`).toBe(false);
      expect(nodeIds.has(bp.parentNode), `${bp.id}.parentNode "${bp.parentNode}" is not a node`).toBe(true);
    }
  });

  it("carries no ecology — G3: a floor plan never names a population or a weight", () => {
    for (const bp of INTERIORS) {
      const keys = Object.keys(bp as unknown as Record<string, unknown>);
      for (const banned of ["populations", "spawnTables", "encounters", "floraStock", "mapAsset", "adjacency"]) {
        expect(keys, `${bp.id} carries "${banned}" — ecology lives on the node (G3)`).not.toContain(banned);
      }
    }
  });
});

describe("_room describes the plan the file actually draws", () => {
  // `blueprintProblems` only checks that the two numbers OCCUR in the sentence. This reads them out
  // of the sentence in position and compares them, because the art lane builds to the sentence: a
  // `_room` that says 13 while the plan draws 12 is a room drawn to the wrong size.
  const ROOM_DIMS = /(\d+) cells wide by (\d+) cells tall/;

  it("every blueprint opens _room with its real width and height", () => {
    expect(INTERIORS.length).toBeGreaterThan(0);
    for (const bp of INTERIORS) {
      const m = ROOM_DIMS.exec(bp._room);
      expect(m, `${bp.id}: _room does not open with "<w> cells wide by <h> cells tall"`).not.toBeNull();
      const { cols, rows } = planSize(bp.plan);
      expect([Number((m as RegExpExecArray)[1]), Number((m as RegExpExecArray)[2])], `${bp.id}: _room vs plan`).toEqual([
        cols,
        rows,
      ]);
      expect(cols, `${bp.id}: a room with no width`).toBeGreaterThan(0);
      expect(rows, `${bp.id}: a room with no height`).toBeGreaterThan(0);
    }
  });

  it("the plan's rows are all the same length — a ragged plan leaks walkable cells", () => {
    for (const bp of INTERIORS) {
      const { cols } = planSize(bp.plan);
      for (const [row, line] of planLines(bp.plan).entries()) {
        expect(line.length, `${bp.id}: row ${String(row)}`).toBe(cols);
      }
    }
  });

  it("every character drawn is in the plan alphabet, and the legend explains each one", () => {
    for (const bp of INTERIORS) {
      const used = new Set(planLines(bp.plan).join("").split(""));
      expect(used.size, `${bp.id}: the plan uses no characters at all`).toBeGreaterThan(0);
      for (const ch of used) {
        expect(PLAN_ALPHABET, `${bp.id}: "${ch}" is not in the alphabet`).toContain(ch);
        expect(Object.keys(bp._legend), `${bp.id}: "${ch}" is drawn but not in the legend`).toContain(ch);
      }
      for (const ch of Object.keys(bp._legend)) {
        expect(used.has(ch), `${bp.id}: the legend explains "${ch}" but the plan never draws it`).toBe(true);
      }
    }
  });
});

describe("solidity — core/interiors.ts's answer IS game/collision.ts's answer", () => {
  it("cell for cell across every shipped plan", () => {
    let compared = 0;
    let solids = 0;
    for (const bp of INTERIORS) {
      const grid = gridOf(bp);
      const { cols, rows } = planSize(bp.plan);
      expect([grid.cols, grid.rows], `${bp.id}: gridFromAscii read a different extent`).toEqual([cols, rows]);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const mine = planCellIsSolid(bp.plan, col, row);
          expect(mine, `${bp.id} (${String(col)},${String(row)})`).toBe(isBlocked(grid, col, row));
          compared += 1;
          if (mine) solids += 1;
        }
      }
    }
    // Without these the loop above proves nothing: zero cells compared, or a plan of all floor,
    // both read as green.
    expect(compared, "no cells were compared").toBeGreaterThan(0);
    expect(solids, "no shipped plan has a single solid cell").toBeGreaterThan(0);
    expect(compared - solids, "no shipped plan has a single walkable cell").toBeGreaterThan(0);
  });

  it("cell for cell across adversarial plans the shipped set does not contain", () => {
    const adversarial = [
      "#",
      ".",
      "####\n#..#\n####",
      "#.#\n.@.\n#S#",
      "#..#\n.##.\n....\n####",
      "  #.#  \n\n  .D.  \n", // padding and a blank line — both lexers trim and drop
      PLAN_ALPHABET.join(""),
      `${PLAN_SOLID}${PLAN_FLOOR}${PLAN_DOOR}\n${PLAN_SPEAKER}${PLAN_SERVICE}${PLAN_SOLID}`,
    ];
    let compared = 0;
    for (const plan of adversarial) {
      const grid = gridFromAscii("adversarial", plan, CELL_PX);
      const { cols, rows } = planSize(plan);
      expect([grid.cols, grid.rows], JSON.stringify(plan)).toEqual([cols, rows]);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          expect(planCellIsSolid(plan, col, row), `${JSON.stringify(plan)} (${String(col)},${String(row)})`).toBe(
            isBlocked(grid, col, row),
          );
          compared += 1;
        }
      }
    }
    expect(compared, "the adversarial sweep compared nothing").toBeGreaterThan(0);
  });

  it("the door, speaker and service markers are WALKABLE to the real parser", () => {
    // The load-bearing property of the whole model: `gridFromAscii` blocks "#" and nothing else, so
    // the second pass can put D/@/S on the picture without making them geometry. If a future change
    // to game/collision.ts starts blocking them, every anchor in the game becomes unreachable.
    const grid = gridFromAscii("markers", `${PLAN_SOLID}${PLAN_FLOOR}${PLAN_DOOR}${PLAN_SPEAKER}${PLAN_SERVICE}`, CELL_PX);
    expect(isBlocked(grid, 0, 0), "# must be blocked").toBe(true);
    for (const [i, ch] of [PLAN_FLOOR, PLAN_DOOR, PLAN_SPEAKER, PLAN_SERVICE].entries()) {
      expect(isBlocked(grid, i + 1, 0), `"${ch}" must be walkable`).toBe(false);
    }
  });
});

describe("walls and floor", () => {
  it("a wall cell is blocked and a floor cell is not, in every shipped room", () => {
    for (const bp of INTERIORS) {
      const grid = gridOf(bp);
      // (0,0) is the north-west corner of the outside wall in every plan in the set.
      expect(planCharAt(bp.plan, 0, 0), `${bp.id}: (0,0) is not a wall`).toBe(PLAN_SOLID);
      expect(isBlocked(grid, 0, 0), `${bp.id}: the corner wall is walkable`).toBe(true);
      // The arrival cell is open floor in every plan in the set.
      expect(planCharAt(bp.plan, bp.arrival.col, bp.arrival.row), `${bp.id}: arrival is not floor`).toBe(PLAN_FLOOR);
      expect(isBlocked(grid, bp.arrival.col, bp.arrival.row), `${bp.id}: the arrival floor is blocked`).toBe(false);
    }
  });

  it("the room is enclosed — every perimeter cell is solid except the one doorway", () => {
    // Not checked by the loader. A hole in an outside wall is a room the player walks out of the
    // side of, into a scene that has nothing there.
    for (const bp of INTERIORS) {
      const { cols, rows } = planSize(bp.plan);
      const holes: string[] = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const onEdge = row === 0 || col === 0 || row === rows - 1 || col === cols - 1;
          if (!onEdge) continue;
          const ch = planCharAt(bp.plan, col, row);
          if (ch !== PLAN_SOLID && ch !== PLAN_DOOR) holes.push(`(${String(col)},${String(row)})="${String(ch)}"`);
        }
      }
      expect(holes, `${bp.id}: the outside wall is open at ${holes.join(" ")}`).toEqual([]);
    }
  });
});

describe("anchors", () => {
  it("there are some, and each stands on a cell the real parser calls WALKABLE", () => {
    let anchors = 0;
    for (const bp of INTERIORS) {
      const grid = gridOf(bp);
      expect(bp.anchors.length, `${bp.id} has no anchors`).toBeGreaterThan(0);
      for (const a of bp.anchors) {
        expect(
          isBlocked(grid, a.col, a.row),
          `${bp.id}.${a.id} stands on a blocked cell — the player could never reach it`,
        ).toBe(false);
        anchors += 1;
      }
    }
    expect(anchors, "no anchors were checked").toBeGreaterThan(EXPECTED_IDS.length);
  });

  it("each stands on the marker its kind requires, and no two share a cell", () => {
    for (const bp of INTERIORS) {
      const seen = new Set<string>();
      for (const a of bp.anchors) {
        expect(planCharAt(bp.plan, a.col, a.row), `${bp.id}.${a.id} (${String(a.col)},${String(a.row)})`).toBe(
          markerFor(a.kind),
        );
        const key = `${String(a.col)},${String(a.row)}`;
        expect(seen.has(key), `${bp.id}: two anchors on (${key})`).toBe(false);
        seen.add(key);
      }
      // Every marker drawn must be claimed by an anchor, or the room draws a person nobody stands on.
      for (const kind of ["speaker", "service"] as const) {
        const drawn = planCellsWith(bp.plan, markerFor(kind)).length;
        const claimed = bp.anchors.filter((a) => a.kind === kind).length;
        expect(claimed, `${bp.id}: ${String(drawn)} "${markerFor(kind)}" cells drawn, ${String(claimed)} claimed`).toBe(drawn);
      }
    }
  });

  it("every target is a dialogue id that SHIPS — an anchor names content, it never authors it", () => {
    let services = 0;
    let speakers = 0;
    for (const bp of INTERIORS) {
      for (const a of bp.anchors) {
        if (a.kind === "service") {
          const speaker = SHIPPED_SERVICE_SPEAKER.get(a.target);
          expect(
            speaker,
            `${bp.id}.${a.id}: "${a.target}" is not a shipped kind:"service" entry in data/dialogue.json`,
          ).toBeDefined();
          expect(SHIPPED_SPEAKER_HOME.get(speaker as string), `${bp.id}.${a.id}: spoken by an out-of-town speaker`).toBe(
            bp.parentNode,
          );
          services += 1;
        } else {
          expect(
            SHIPPED_SPEAKER_HOME.has(a.target),
            `${bp.id}.${a.id}: "${a.target}" is not a shipped speaker in data/dialogue.json`,
          ).toBe(true);
          expect(SHIPPED_SPEAKER_HOME.get(a.target), `${bp.id}.${a.id}: homed to another town`).toBe(bp.parentNode);
          speakers += 1;
        }
      }
    }
    // Both branches must have actually run, or one of them is untested.
    expect(services, "no service anchor was checked").toBeGreaterThan(0);
    expect(speakers, "no speaker anchor was checked").toBeGreaterThan(0);
    expect(SHIPPED_SERVICE_SPEAKER.size, "the dialogue read found no service entries").toBeGreaterThan(0);
  });

  it("every service anchor faces something to transact across — a counter, a trestle, or a person", () => {
    const step = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const;
    let checked = 0;
    let acrossFixture = 0;
    for (const bp of INTERIORS) {
      for (const a of bp.anchors) {
        if (a.kind !== "service") continue;
        const [dCol, dRow] = step[a.faces];
        const facing = planCharAt(bp.plan, a.col + dCol, a.row + dRow);
        expect([PLAN_SOLID, PLAN_SPEAKER], `${bp.id}.${a.id} faces ${a.faces} at "${String(facing)}"`).toContain(facing);
        checked += 1;
        if (facing === PLAN_SOLID) acrossFixture += 1;
      }
    }
    expect(checked, "no service anchor was checked").toBeGreaterThan(0);
    // Both arrangements ship: three shops/inns transact face to face, Brackwater's shop across the
    // trestle. If the fixture branch ever stops being exercised the rule above is half untested.
    expect(acrossFixture, "no shipped service transacts across a fixture").toBeGreaterThan(0);
    expect(checked - acrossFixture, "no shipped service transacts face to face").toBeGreaterThan(0);
  });
});

describe("arrival — the player lands one step through the door they walked in by", () => {
  it("every plan draws exactly one doorway", () => {
    for (const bp of INTERIORS) {
      expect(planCellsWith(bp.plan, PLAN_DOOR).length, `${bp.id}`).toBe(1);
    }
  });

  it("arrival is walkable, is not the doorway itself, and is orthogonally adjacent to it", () => {
    let checked = 0;
    for (const bp of INTERIORS) {
      const grid = gridOf(bp);
      const door = planCellsWith(bp.plan, PLAN_DOOR)[0] as { col: number; row: number };
      expect(isBlocked(grid, bp.arrival.col, bp.arrival.row), `${bp.id}: arrival is blocked`).toBe(false);
      expect([bp.arrival.col, bp.arrival.row], `${bp.id}: arrival IS the doorway — the player bounces straight out`).not.toEqual(
        [door.col, door.row],
      );
      const steps = Math.abs(bp.arrival.col - door.col) + Math.abs(bp.arrival.row - door.row);
      expect(steps, `${bp.id}: arrival is ${String(steps)} cells from the doorway`).toBe(1);
      checked += 1;
    }
    expect(checked).toBe(INTERIORS.length);
  });

  it("the door's facing agrees with the wall the plan cuts D into", () => {
    // `InteriorDoor.facing` is the compass direction the player approaches from, and the header
    // states it agrees with the wall. A south-wall door with facing "north" is a building whose
    // exterior and interior disagree about which side you walk in on.
    for (const bp of INTERIORS) {
      const size = planSize(bp.plan);
      const door = planCellsWith(bp.plan, PLAN_DOOR)[0] as { col: number; row: number };
      const wall =
        door.row === 0
          ? "north"
          : door.row === size.rows - 1
            ? "south"
            : door.col === 0
              ? "west"
              : door.col === size.cols - 1
                ? "east"
                : "interior";
      expect(wall, `${bp.id}: the doorway is not cut into an outside wall`).not.toBe("interior");
      expect(wall, `${bp.id}: door.facing is "${bp.door.facing}" but D is in the ${wall} wall`).toBe(bp.door.facing);
    }
  });

  it("the door stands somewhere inside its parent town's painted map", () => {
    const native = balance.map.mapNativePx;
    for (const bp of INTERIORS) {
      expect(bp.door.x, `${bp.id}: door.x off the ${String(native)}-square map`).toBeLessThan(native);
      expect(bp.door.y, `${bp.id}: door.y off the ${String(native)}-square map`).toBeLessThan(native);
    }
  });
});

describe("the citations — G2's discipline is that every feature and every gap is written down", () => {
  it("every blueprint names its sources and its silences, and every quoted speaker ships", () => {
    for (const bp of INTERIORS) {
      expect(bp._featureSource.length, `${bp.id}: _featureSource is a stub`).toBeGreaterThan(0);
      expect(bp._canonSilent.length, `${bp.id}: _canonSilent is empty — nothing is fully specified`).toBeGreaterThan(0);
      for (const a of bp.anchors) {
        expect(bp._featureSource, `${bp.id}: _featureSource never mentions ${a.target}`).toContain(a.target);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. THE LOADER — every input below is a real shipped blueprint with ONE thing broken
 * ══════════════════════════════════════════════════════════════════════════ */

describe("validateInteriors — the sound control", () => {
  it("accepts the shipped corpus, and accepts an unmutated clone of each blueprint", () => {
    expect(validateInteriors(SHIPPED_INTERIOR_JSON).map((bp) => bp.id).sort()).toEqual([...EXPECTED_IDS].sort());
    for (const bp of INTERIORS) {
      // If this ever fails, every refusal below is evidence about the CLONE, not about the mutation.
      expect(blueprintProblems(clone(bp)), `${bp.id}: a clean clone is already refused`).toEqual([]);
      expect(validateInteriors([clone(bp)]).length).toBe(1);
    }
  });
});

describe("validateInteriors — refuses the vacuous case", () => {
  it("an empty interior set is a broken load, not an empty game", () => {
    // The one refusal that is not about a malformed file. A loader that returns [] for "found
    // nothing" reports success for an absence, which is the exact shape of a green suite over
    // content nobody can reach.
    expect(refusal()).toMatch(/no interiors were loaded at all/);
    expect(() => validateInteriors([])).toThrow(InteriorValidationError);
  });
});

describe("validateInteriors — refuses a malformed plan, loudly", () => {
  it("a ragged plan (a short row pads out as walkable)", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      const lines = planLines(bp.plan);
      lines[1] = (lines[1] as string).slice(0, -1);
      bp.plan = lines.join("\n");
    });
    expect(refusal(bad)).toMatch(/ragged plans leak walkable cells/);
  });

  it("a character outside the plan alphabet", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      bp.plan = withCell(bp.plan, 5, 4, "~");
    });
    expect(refusal(bad)).toMatch(/is "~", which is not in the plan alphabet/);
  });

  it("an empty plan", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      bp.plan = "   \n\n  ";
    });
    expect(refusal(bad)).toMatch(/the plan is empty/);
  });

  it("two doorways, and none", () => {
    const two = broken("hearthollow-inn", (bp) => {
      bp.plan = withCell(bp.plan, 0, 4, PLAN_DOOR);
    });
    expect(refusal(two)).toMatch(/draws 2 "D" cells/);
    const none = broken("hearthollow-inn", (bp) => {
      const door = planCellsWith(bp.plan, PLAN_DOOR)[0] as { col: number; row: number };
      bp.plan = withCell(bp.plan, door.col, door.row, PLAN_SOLID);
    });
    expect(refusal(none)).toMatch(/draws 0 "D" cells/);
  });

  it("a _room whose stated size has drifted from the drawing", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      bp._room = "A wide low room. The doorway is in the south wall.";
    });
    const problems = refusal(bad);
    expect(problems).toMatch(/_room never says 13/);
    expect(problems).toMatch(/_room never says 8/);
  });

  it("a legend that has drifted from the picture, in either direction", () => {
    const missing = broken("hearthollow-inn", (bp) => {
      delete bp._legend[PLAN_SPEAKER];
    });
    expect(refusal(missing)).toMatch(/the plan uses "@" but the legend does not explain it/);
    const extra = broken("hearthollow-inn", (bp) => {
      bp._legend["%"] = "a character nothing draws";
    });
    expect(refusal(extra)).toMatch(/the legend explains "%" but the plan never uses it/);
  });

  it("an arrival cell that is solid, off the plan, or away from the door", () => {
    const solid = broken("hearthollow-inn", (bp) => {
      bp.arrival = { col: 0, row: 0 };
    });
    expect(refusal(solid)).toMatch(/is solid — the player would stand inside geometry/);

    const off = broken("hearthollow-inn", (bp) => {
      const { cols, rows } = planSize(bp.plan);
      bp.arrival = { col: cols, row: rows };
    });
    expect(refusal(off)).toMatch(/is off a 13x8 plan/);

    const adrift = broken("hearthollow-inn", (bp) => {
      // Still walkable, still on the plan — and three cells from the threshold.
      bp.arrival = { col: 3, row: 4 };
    });
    expect(refusal(adrift)).toMatch(/cells from the doorway/);

    const onDoor = broken("hearthollow-inn", (bp) => {
      bp.arrival = planCellsWith(bp.plan, PLAN_DOOR)[0] as { col: number; row: number };
    });
    expect(refusal(onDoor)).toMatch(/cells from the doorway/);
  });
});

describe("validateInteriors — refuses a bad anchor, loudly", () => {
  it("an anchor off the plan", () => {
    const bad = broken("brackwater-supply", (bp) => {
      (bp.anchors[0] as { col: number }).col = 99;
    });
    expect(refusal(bad)).toMatch(/is off a 12x8 plan/);
  });

  it("an anchor standing on a solid cell", () => {
    const bad = broken("brackwater-supply", (bp) => {
      // The trestle. Solid, and not the "@" a speaker anchor requires — both complaints fire.
      const a = bp.anchors.find((x) => x.kind === "speaker") as { col: number; row: number };
      a.col = 4;
      a.row = 3;
    });
    const problems = refusal(bad);
    expect(problems).toMatch(/is solid — an anchor must stand on a walkable cell/);
    expect(problems).toMatch(/not the "@" its speaker kind requires/);
  });

  it("an anchor standing on the wrong marker", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      const a = bp.anchors.find((x) => x.kind === "service") as { col: number; row: number };
      a.col = 1;
      a.row = 2; // Aldis's "@" cell, not an "S"
    });
    expect(refusal(bad)).toMatch(/holds "@", not the "S" its service kind requires/);
  });

  it("two anchors on one cell", () => {
    // A second anchor on the service tile: same cell, different id, everything else valid — so the
    // shared cell is the only thing left for the loader to complain about.
    const bad = broken("hearthollow-inn", (bp) => {
      const rest = bp.anchors.find((x) => x.kind === "service");
      bp.anchors.push({ ...(rest as (typeof bp.anchors)[number]), id: "rest-again" });
    });
    expect(refusal(bad)).toMatch(/two anchors share cell \(1,3\)/);
  });

  it("a duplicate anchor id", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      (bp.anchors[1] as { id: string }).id = (bp.anchors[0] as { id: string }).id;
    });
    expect(refusal(bad)).toMatch(/duplicate anchor id/);
  });

  it("a service target that does not ship — an anchor names dialogue, it never authors it", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      (bp.anchors.find((a) => a.kind === "service") as { target: string }).target = "innkeeper-hearthollow.bath";
    });
    expect(refusal(bad)).toMatch(/is not a shipped kind:"service" dialogue entry/);
  });

  it("a service target that ships but belongs to another town", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      (bp.anchors.find((a) => a.kind === "service") as { target: string }).target = "innkeeper-brackwater.rest";
    });
    expect(refusal(bad)).toMatch(/is spoken by someone homed to "brackwater", not "hearthollow"/);
  });

  it("a speaker target that does not ship, and one homed to another town", () => {
    const invented = broken("hearthollow-inn", (bp) => {
      (bp.anchors.find((a) => a.kind === "speaker") as { target: string }).target = "innkeeper-hearthollow-stableboy";
    });
    expect(refusal(invented)).toMatch(/is not a shipped dialogue speaker/);

    const elsewhere = broken("hearthollow-inn", (bp) => {
      (bp.anchors.find((a) => a.kind === "speaker") as { target: string }).target = "innkeeper-brackwater";
    });
    expect(refusal(elsewhere)).toMatch(/is homed to "brackwater", not "hearthollow"/);
  });

  it("a service anchor facing open floor — a service with nothing to transact with", () => {
    const bad = broken("brackwater-supply", (bp) => {
      (bp.anchors.find((a) => a.kind === "service") as { faces: string }).faces = "south";
    });
    expect(refusal(bad)).toMatch(/a service is transacted across a counter \("#"\) or with a person \("@"\)/);
  });
});

describe("validateInteriors — refuses a malformed FILE, loudly", () => {
  it("a missing required field", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      delete (bp as unknown as Record<string, unknown>)["_canonSilent"];
    });
    expect(refusal(bad)).toMatch(/_canonSilent/);
  });

  it("an unknown field — the schema is strict, so a typo'd key is refused, not ignored", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      (bp as unknown as Record<string, unknown>)["populations"] = { nibbin: 40 };
    });
    expect(refusal(bad)).toMatch(/populations/);
  });

  it("a blueprint with no anchors at all — a room nothing in it can be talked to", () => {
    const bad = broken("hearthollow-inn", (bp) => {
      bp.anchors = [];
    });
    expect(refusal(bad)).toMatch(/anchors/);
  });

  it("a non-object, and a null", () => {
    expect(refusal("hearthollow-inn")).toMatch(/interior #0/);
    expect(refusal(null)).toMatch(/interior #0/);
  });

  it("two blueprints with the same id", () => {
    const first = interiorById("hearthollow-inn") as InteriorBlueprint;
    expect(refusal(clone(first), clone(first))).toMatch(/duplicate interior id/);
  });

  it("names EVERY problem it found, not just the first", () => {
    // A loader that threw on the first complaint would make a broken file a game of whack-a-mole.
    const bad = broken("hearthollow-inn", (bp) => {
      bp.plan = withCell(bp.plan, 5, 4, "~");
      bp.arrival = { col: 0, row: 0 };
      (bp.anchors[0] as { target: string }).target = "nobody-at-all";
    });
    const problems = refusal(bad);
    expect(problems).toMatch(/not in the plan alphabet/);
    expect(problems).toMatch(/is solid/);
    expect(problems).toMatch(/is not a shipped dialogue speaker/);
  });

  it("the thrown error carries the problems as data, and says how many", () => {
    let caught: InteriorValidationError | null = null;
    try {
      validateInteriors([broken("hearthollow-inn", (bp) => (bp.arrival = { col: 0, row: 0 }))]);
    } catch (err) {
      caught = err as InteriorValidationError;
    }
    expect(caught, "the loader did not throw").not.toBeNull();
    expect((caught as InteriorValidationError).name).toBe("InteriorValidationError");
    expect((caught as InteriorValidationError).problems.length).toBeGreaterThan(0);
    expect((caught as InteriorValidationError).message).toMatch(/data\/interiors: \d+ problem\(s\)/);
  });
});

describe("lookups do not invent a default", () => {
  it("interiorById returns null for an unknown id rather than a placeholder", () => {
    expect(interiorById("hearthollow-inn")?.id).toBe("hearthollow-inn");
    expect(interiorById("hearthollow-forge")).toBeNull();
  });

  it("interiorsOf returns an empty list for a town with none authored", () => {
    expect(interiorsOf("cindershelf")).toEqual([]);
    expect(interiorsOf("hearthollow").length).toBeGreaterThan(0);
  });
});
