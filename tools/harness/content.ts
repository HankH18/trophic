/**
 * tools/harness/content.ts — load the content the harness measures.
 *
 * build-doc §6 INV-3, named test `ext_retune`: "Retuning balance touches balance.json only …
 * (harness runs with an overridden file)". That is this file's whole job. `--balance <path>`
 * swaps the balance member of the shipped bundle and re-runs the SAME `validateBundle` the game
 * boots with, so a retune reaches every module without a code change anywhere.
 *
 * The RAW parsed file travels alongside the validated `Balance` on purpose. `zBalance` parses with
 * `z.object`, which STRIPS keys it does not declare, so a constant merged into balance.json whose
 * schema has not caught up would be absent from the validated object and the harness's retune would
 * be silently ignored — the exact failure INV-3 exists to prevent. core/ecosim.ts's `makeContext`
 * takes the raw file as its last argument for this reason; the harness passes it.
 *
 * Guardrail G11: no gameplay constant appears here. Guardrail G3/§8.3: the food webs handed to the
 * battle engine come from `core/foodweb.ts` and nowhere else.
 */

import { readFileSync } from "node:fs";
import { makeBattleContext, predationOracleFromWebs, type BattleContext } from "../../core/battle";
import { deriveFoodWeb, indexSpecies, toEcoNode, type EcoNode, type SpeciesIndex } from "../../core/foodweb";
import { derivePresence, ecoConstants, makeContext, type SimContext } from "../../core/ecosim";
import { shippedBundle, validateBundle } from "../../core/schemas";
import type { Balance, Content, FoodWeb, GymLeader, NodeFile } from "../../core/types";

export interface LoadedContent {
  /** Every data/*.json, validated exactly as the game boots it. */
  content: Content;
  balance: Balance;
  /** The balance file as parsed, before zod — the INV-3 precedence path core/ecosim.ts reads. */
  rawBalance: unknown;
  /** Absolute path of the overriding balance file, or null when the shipped one is in use. */
  balancePath: string | null;
  species: SpeciesIndex;
  nodes: readonly NodeFile[];
  /** The shipped node files as sim nodes — build-doc §7.2: "Sim initial state = the file as shipped". */
  ecoNodes: EcoNode[];
  /** One derived web per node (core/foodweb.ts is their only source — G3). */
  webs: FoodWeb[];
  /** The reducer context every battle in this harness run uses. */
  battle: BattleContext;
  /** The sim context, presence derived over the whole shipped region. */
  sim: SimContext;
  gyms: readonly GymLeader[];
}

/**
 * Load the content, optionally against an overridden balance file.
 *
 * Nothing else about the bundle changes: species, moves, gyms, palette and every node file are the
 * shipped ones, so a difference between two harness runs is a difference in balance.json and
 * nothing else.
 */
export function loadContent(balancePath?: string | null): LoadedContent {
  if (!balancePath) return loadContentFromRaw(shippedBundle().balance, null);
  return loadContentFromRaw(JSON.parse(readFileSync(balancePath, "utf8")) as unknown, balancePath);
}

/**
 * The same load, from a balance object already in memory.
 *
 * This is what makes the report's suggested deltas MEASURED rather than guessed: a candidate retune
 * can be applied to a copy of the balance file and re-run through the identical pipeline, with no
 * code change anywhere — which is exactly the claim `ext_retune` (build-doc §6 INV-3) makes.
 */
export function loadContentFromRaw(rawBalance: unknown, balancePath: string | null): LoadedContent {
  const bundle = shippedBundle();
  bundle.balance = rawBalance;

  const content = validateBundle(bundle);
  const balance = content.balance;
  const species = indexSpecies([...content.species]);
  const ecoNodes = content.nodes.map((file) => toEcoNode(file));
  const webs = ecoNodes.map((node) => deriveFoodWeb(node, species, balance));

  const battle = makeBattleContext(
    { species: content.species, moves: content.moves, balance },
    predationOracleFromWebs(webs),
  );

  const eco = ecoConstants(balance, rawBalance);
  const sim = makeContext(species, balance, derivePresence(ecoNodes, species, balance, eco, rawBalance), rawBalance);

  return {
    content,
    balance,
    rawBalance,
    balancePath,
    species,
    nodes: content.nodes,
    ecoNodes,
    webs,
    battle,
    sim,
    gyms: content.gyms,
  };
}

/**
 * The per-subsystem RNG tags, read from `balance.rng.subsystemTags` (build-doc §8.1: "seeds derived
 * from save seed + subsystem tag"). Named here rather than written as literals so that retuning the
 * list in balance.json cannot leave the harness drawing on a stream nothing else uses.
 */
export interface SubsystemTags {
  battle: string;
  sim: string;
  encounter: string;
}

export function subsystemTags(balance: Balance): SubsystemTags {
  const tags = balance.rng.subsystemTags;
  const [battle, sim, encounter] = tags;
  if (battle === undefined || sim === undefined || encounter === undefined) {
    throw new Error(
      `tools/harness: balance.rng.subsystemTags carries ${tags.length} tags; build-doc §8.1 names ` +
        "one stream per subsystem (battle, sim, encounters) and the harness draws on all three",
    );
  }
  return { battle, sim, encounter };
}

/** Seed number `i` of a run, anchored on `balance.rng.defaultSeed` so a report is reproducible. */
export function seedFor(balance: Balance, i: number): number {
  return balance.rng.defaultSeed + i;
}
