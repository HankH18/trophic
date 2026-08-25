/**
 * tools/harness/round-robin.ts — §10.5 mode (b).
 *
 * "type-chart round-robin — every line vs every line at equal level, flag any line with <35% or
 * >65% aggregate winrate."
 *
 * WHAT "EQUAL" MEANS HERE, stated because every one of these choices moves the numbers:
 *   · LEVEL — `balance.xp.levelCap`. Both sides get the same `(1 + levelCoefficient × level)`
 *     multiplier, so the level cannot tilt a matchup; what it decides is how many move slots are
 *     unlocked (`balance.moves.slotUnlockLevels`, 1/5/10/15). At the cap every line fields its
 *     complete four-move kit, which is the fullest test of the design.
 *   · AGE — the adult form for every ageing line (age multiplier 1.0, and the metamorphic ×1.15 has
 *     landed, which is where the shipped content puts a wild adult — bible §4). Ancients are always
 *     Elder and have no other form.
 *   · TRAITS — none. A ±10% roll is noise on a chart measurement.
 *   · PREDATION — ON, against the UNION of all twelve derived webs (no node is named, so
 *     core/battle.ts's oracle falls back to the union). bible §1 calls the web "a second, learnable
 *     type chart", and §10.5(b) is the test of the chart; leaving predation out would measure only
 *     half of it. This is the one place a pairing can be lopsided for a reason that is not the type
 *     chart, and the report calls those pairs out.
 *   · POLICY — BOTH sides use core/battle.ts's own enemy policy (argmax expected damage, ties to
 *     pool order). A mirror match is then decided by the numbers, not by two different AIs.
 *
 * Every ordered pair is run, both directions, because turn order breaks an exact Speed tie in the
 * player's favour — so A-as-player vs B is not identical to B-as-player vs A, and averaging the two
 * removes the seat advantage instead of hiding it.
 */

import { STAT_KEYS } from "../../core/types";
import type { BattleInput, SpeciesLine, StatKey, Stats } from "../../core/types";
import { mirrorPolicy, runBattle, STALLED } from "./arena";
import { seedFor, subsystemTags, type LoadedContent } from "./content";

export interface LineChartResult {
  lineId: string;
  formName: string;
  ancient: boolean;
  /** Aggregate over EVERY opponent, which is build-doc §10.5(b) read literally. */
  battles: number;
  wins: number;
  winRate: number;
  /** The same, restricted to non-Ancient opponents — the roster a player actually fights. */
  peerBattles: number;
  peerWins: number;
  peerWinRate: number;
  /** Outside `balance.harness.roundRobinMin/Max` on the literal (all-opponent) reading. */
  flagged: boolean;
  /** Outside the band on the peer-only reading. */
  peerFlagged: boolean;
  /** The line's shipped base stats — the content lever behind an outlier (data/species.json). */
  baseStats: Stats;
  /** hp × def × atk of the shipped base stats: a one-number stand-in for "how good is this animal". */
  statIndex: number;
  /** Worst and best individual matchups, for the report. */
  worst: Array<{ lineId: string; formName: string; winRate: number }>;
  best: Array<{ lineId: string; formName: string; winRate: number }>;
}

export interface RoundRobinResult {
  seedsPerOrderedPair: number;
  level: number;
  totalBattles: number;
  stalled: number;
  lines: LineChartResult[];
  band: [number, number];
  /**
   * Pearson correlations between a line's peer win rate and candidate explanations drawn from its
   * SHIPPED base stats, over the non-Ancient lines. Several are computed rather than one, because
   * the report has to distinguish "the type chart is lopsided" (a balance.json retune, INV-3) from
   * "these animals are simply built better" (a data/species.json content edit) — and picking one
   * index in advance would decide that question instead of measuring it.
   */
  statCorrelations: Array<{ label: string; r: number }>;
  statCorrelationSampleSize: number;
  /** Per-stat correlation with peer win rate — what one point in each stat is actually worth. */
  perStatCorrelation: Array<{ stat: StatKey; r: number; min: number; max: number }>;
  /**
   * True when every line's base stats sum to the same figure. `data/species.json` says they do
   * (`_statRule`), and it changes the whole reading of the table above: with a fixed budget the
   * round-robin is not measuring which animals got more points, it is measuring which ALLOCATION of
   * the same points wins — so a stat that correlates near zero is a stat the roster is wasting.
   */
  fixedStatBudget: number | null;
  /**
   * Fraction of ordered pairs whose win rate is exactly 0 or exactly 1 across every seed — i.e.
   * matchups the damage roll never decides. A high number means the roster is a rock-paper-scissors
   * lattice of hard counters rather than a field of close fights, which is a design fact worth
   * knowing before anyone tunes a multiplier.
   */
  decidedPairFraction: number;
  /** Pair winrates, keyed `${a}|${b}` = a's win rate against b over both seats. */
  pair: Map<string, number>;
}

/** Pearson r over paired samples. Returns 0 for a degenerate sample. */
function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i] ?? 0;
    sy += ys[i] ?? 0;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = (xs[i] ?? 0) - mx;
    const b = (ys[i] ?? 0) - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

const EXTREMES_LISTED = 3;

function specFor(line: SpeciesLine, uid: string, level: number): BattleInput["playerParty"][number] {
  return {
    uid,
    lineId: line.id,
    // Ancients never age and are permanently Elder (bible §4); everything else fights as an adult.
    age: line.ancient ? "E" : "A",
    level,
    traits: [],
  };
}

export function runRoundRobin(loaded: LoadedContent, seedsPerOrderedPair: number): RoundRobinResult {
  const balance = loaded.balance;
  const tags = subsystemTags(balance);
  const level = balance.xp.levelCap;
  const lines = [...loaded.content.species];
  const policy = mirrorPolicy();
  const band: [number, number] = [balance.harness.roundRobinMin, balance.harness.roundRobinMax];

  // wins[a][b] = battles a won against b, over both seats.
  const wins = new Map<string, Map<string, number>>();
  const plays = new Map<string, Map<string, number>>();
  const bump = (table: Map<string, Map<string, number>>, a: string, b: string, n: number): void => {
    let row = table.get(a);
    if (!row) {
      row = new Map();
      table.set(a, row);
    }
    row.set(b, (row.get(b) ?? 0) + n);
  };

  let totalBattles = 0;
  let stalled = 0;

  for (const attacker of lines) {
    for (const defender of lines) {
      if (attacker.id === defender.id) continue;
      for (let i = 0; i < seedsPerOrderedPair; i++) {
        const seed = seedFor(balance, i);
        const input: BattleInput = {
          seed,
          kind: "trainer",
          playerParty: [specFor(attacker, "p0", level)],
          enemyParty: [specFor(defender, "e0", level)],
        };
        const result = runBattle(input, loaded.battle, policy, tags.battle);
        totalBattles += 1;
        bump(plays, attacker.id, defender.id, 1);
        bump(plays, defender.id, attacker.id, 1);
        if (result.outcome === "win") {
          bump(wins, attacker.id, defender.id, 1);
        } else if (result.outcome === "loss") {
          bump(wins, defender.id, attacker.id, 1);
        } else {
          // A stall is a draw: neither side gets the win, and it is counted and reported.
          stalled += 1;
        }
      }
    }
  }

  const isAncient = new Map(lines.map((l) => [l.id, l.ancient]));
  const nameOf = (id: string): string => {
    const line = loaded.species.byId.get(id);
    if (!line) return id;
    return line.formNames[line.ancient ? "E" : "A"];
  };

  const pair = new Map<string, number>();
  let decided = 0;
  let pairCount = 0;
  const results: LineChartResult[] = lines.map((line) => {
    let battles = 0;
    let won = 0;
    let peerBattles = 0;
    let peerWins = 0;
    const perOpponent: Array<{ lineId: string; formName: string; winRate: number }> = [];
    for (const other of lines) {
      if (other.id === line.id) continue;
      const n = plays.get(line.id)?.get(other.id) ?? 0;
      const w = wins.get(line.id)?.get(other.id) ?? 0;
      if (n === 0) continue;
      battles += n;
      won += w;
      pair.set(`${line.id}|${other.id}`, w / n);
      pairCount += 1;
      if (w === 0 || w === n) decided += 1;
      perOpponent.push({ lineId: other.id, formName: nameOf(other.id), winRate: w / n });
      if (!isAncient.get(other.id)) {
        peerBattles += n;
        peerWins += w;
      }
    }
    const winRate = battles === 0 ? 0 : won / battles;
    const peerWinRate = peerBattles === 0 ? 0 : peerWins / peerBattles;
    perOpponent.sort((a, b) => a.winRate - b.winRate || a.lineId.localeCompare(b.lineId));
    return {
      lineId: line.id,
      formName: nameOf(line.id),
      ancient: line.ancient,
      battles,
      wins: won,
      winRate,
      peerBattles,
      peerWins,
      peerWinRate,
      flagged: winRate < band[0] || winRate > band[1],
      peerFlagged: peerWinRate < band[0] || peerWinRate > band[1],
      baseStats: { ...line.baseStats },
      statIndex: line.baseStats.hp * line.baseStats.def * line.baseStats.atk,
      worst: perOpponent.slice(0, EXTREMES_LISTED),
      best: perOpponent.slice(-EXTREMES_LISTED).reverse(),
    };
  });

  results.sort((a, b) => b.winRate - a.winRate || a.lineId.localeCompare(b.lineId));
  const peers = results.filter((r) => !r.ancient);
  const y = peers.map((p) => p.peerWinRate);
  const totals = peers.map((p) => STAT_KEYS.reduce((t, k) => t + p.baseStats[k], 0));
  const fixedStatBudget = totals.every((t) => t === totals[0]) ? (totals[0] ?? null) : null;
  const perStatCorrelation = STAT_KEYS.map((stat) => {
    const values = peers.map((p) => p.baseStats[stat]);
    return {
      stat,
      r: pearson(values, y),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }).sort((a, b2) => b2.r - a.r);
  const statCorrelations = [
    { label: "Speed", r: pearson(peers.map((p) => p.baseStats.spd), y) },
    { label: "Attack", r: pearson(peers.map((p) => p.baseStats.atk), y) },
    { label: "log(HP × Defense) — bulk", r: pearson(peers.map((p) => Math.log(p.baseStats.hp * p.baseStats.def)), y) },
    { label: "log(HP × Defense × Attack)", r: pearson(peers.map((p) => Math.log(p.statIndex)), y) },
    { label: "Attack ÷ Defense", r: pearson(peers.map((p) => p.baseStats.atk / p.baseStats.def), y) },
    { label: "base-stat total", r: pearson(peers.map((p) => STAT_KEYS.reduce((t, k) => t + p.baseStats[k], 0)), y) },
  ].sort((a, b2) => Math.abs(b2.r) - Math.abs(a.r));
  return {
    seedsPerOrderedPair,
    level,
    totalBattles,
    stalled,
    lines: results,
    band,
    statCorrelations,
    statCorrelationSampleSize: peers.length,
    perStatCorrelation,
    fixedStatBudget,
    decidedPairFraction: decided / Math.max(1, pairCount),
    pair,
  };
}
