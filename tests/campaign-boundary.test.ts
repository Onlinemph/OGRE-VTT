/**
 * The campaign boundary: the codec both apps must agree on, the scenario that
 * builds from an `OrderOfBattle`, and the reader that turns a finished battle
 * back into a `BattleResult`.
 */

import { describe, expect, it } from 'vitest';
import { destroyUnit } from '@engine/state.js';
import { type GameState, isOgre, onBoard } from '@engine/types.js';
import { decodeOrder, decodeResult, encodeOrder, encodeResult } from '@campaign/codec.js';
import { type BattleResult, type OrderOfBattle, orderOf } from '@campaign/orders.js';
import { readBattleResult } from '@campaign/result.js';
import { LANDING, MARK_III_ATTACK } from '@scenarios/index.js';

const ORDER: OrderOfBattle = {
  battleId: 'b3-mars-ground',
  seed: 77,
  scenarioId: 'landing',
  sides: [
    { player: 'paneuro', faction: 'Paneuropean Federation', forces: { MK3: 1, HVY: 2, INF: 7 } },
    { player: 'combine', faction: 'North American Combine', forces: { MSL: 3, GEV: 2, INF: 6 } },
  ],
  terms: { turnLimit: 9, site: 'mars' },
};

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

describe('the codec', () => {
  it('round-trips an order', () => {
    expect(decodeOrder(encodeOrder(ORDER))).toEqual(ORDER);
  });

  it('round-trips a result', () => {
    const result: BattleResult = {
      battleId: 'b3-mars-ground',
      winners: ['combine'],
      level: 'standard',
      survivors: { combine: { MSL: 1, INF: 4 }, paneuro: {} },
      victoryPoints: { combine: 120, paneuro: 30 },
      replay: { seed: 77, log: [{ type: 'endPhase', by: 'paneuro' }] },
    };
    expect(decodeResult(encodeResult(result))).toEqual(result);
  });

  it('survives whitespace around a pasted token', () => {
    expect(decodeOrder(`  ${encodeOrder(ORDER)}\n`)).toEqual(ORDER);
  });

  it('refuses a result pasted into the order box, and says which is which', () => {
    const result: BattleResult = {
      battleId: 'x',
      winners: [],
      level: 'marginal',
      survivors: {},
      victoryPoints: {},
      replay: { seed: 1, log: [] },
    };
    expect(() => decodeOrder(encodeResult(result))).toThrow(/battle result/);
    expect(() => decodeResult(encodeOrder(ORDER))).toThrow(/battle order/);
  });

  it('refuses garbage with a sentence rather than a stack trace', () => {
    expect(() => decodeOrder('not a token!')).toThrow(/not a campaign token/);
    expect(() => decodeOrder('AAAA')).toThrow(/not a campaign token/);
  });

  it('refuses an order with a missing side', () => {
    const bad = { ...ORDER, sides: [ORDER.sides[0]!] };
    expect(() => decodeOrder(encodeOrder(bad as OrderOfBattle))).toThrow(/two sides/);
  });
});

// ---------------------------------------------------------------------------
// The Landing, built from an order
// ---------------------------------------------------------------------------

const countFor = (state: GameState, player: string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const u of Object.values(state.units)) {
    if (u.owner !== player) continue;
    if (isOgre(u)) out[u.typeId] = (out[u.typeId] ?? 0) + 1;
    else if (u.classId === 'INF') out['INF'] = (out['INF'] ?? 0) + u.squads;
    else out[u.classId] = (out[u.classId] ?? 0) + 1;
  }
  return out;
};

describe('The Landing builds from an order of battle', () => {
  const state = LANDING.build({ seed: 5, order: ORDER });

  it('fields exactly the forces the order names', () => {
    expect(countFor(state, 'paneuro')).toEqual({ MK3: 1, HVY: 2, INF: 7 });
    // The command dome is issued by the scenario, not shipped by the campaign.
    expect(countFor(state, 'combine')).toEqual({ MSL: 3, GEV: 2, INF: 6, CP: 1 });
  });

  it('gives the invader the first move', () => {
    expect(state.playerOrder).toEqual(['paneuro', 'combine']);
    expect(state.activePlayerIndex).toBe(0);
  });

  it('carries the order and its terms in scenarioData', () => {
    expect(orderOf(state.scenarioData)).toEqual(ORDER);
    expect(state.scenarioData['turnLimit']).toBe(9);
  });

  it('refuses a unit this game does not field', () => {
    const bad: OrderOfBattle = {
      ...ORDER,
      sides: [{ ...ORDER.sides[0]!, forces: { destroyer: 2 } }, ORDER.sides[1]!],
    };
    expect(() => LANDING.build({ seed: 5, order: bad })).toThrow(/destroyer/);
  });

  it('contains the landing at the turn limit', () => {
    expect(LANDING.checkVictory(state)).toBeNull();
    const late = { ...state, turn: 10 };
    const v = LANDING.checkVictory(late);
    expect(v?.winners).toEqual(['combine']);
    expect(v?.level).toBe('marginal');
  });
});

// ---------------------------------------------------------------------------
// The result reader
// ---------------------------------------------------------------------------

describe('readBattleResult', () => {
  it('returns null while the battle is undecided', () => {
    const state = LANDING.build({ seed: 5, order: ORDER });
    expect(readBattleResult(state, [])).toBeNull();
  });

  it('throws for a game that was not built from an order', () => {
    const state = MARK_III_ATTACK.build({ seed: 5 });
    expect(() => readBattleResult(state, [])).toThrow(/order of battle/);
  });

  it('reports the winner, the survivors and the points of a finished battle', () => {
    let state = LANDING.build({ seed: 5, order: ORDER });

    // The garrison is wiped out to the last unit, credited to the invader.
    for (const u of Object.values(state.units)) {
      if (u.owner === 'combine') state = destroyUnit(state, u.id, 'the landing', 'paneuro');
    }
    expect(Object.values(state.units).some((u) => u.owner === 'combine' && onBoard(u))).toBe(false);

    const victory = LANDING.checkVictory(state);
    expect(victory?.winners).toEqual(['paneuro']);
    expect(victory?.level).toBe('complete');
    state = { ...state, victory };

    const log = [{ type: 'endPhase', by: 'paneuro' }];
    const result = readBattleResult(state, log);
    expect(result).not.toBeNull();
    expect(result!.battleId).toBe('b3-mars-ground');
    expect(result!.winners).toEqual(['paneuro']);
    expect(result!.level).toBe('complete');
    // The whole landing force walked away; the garrison left nothing.
    expect(result!.survivors['paneuro']).toEqual({ MK3: 1, HVY: 2, INF: 7 });
    expect(result!.survivors['combine']).toEqual({});
    expect(result!.victoryPoints['paneuro']).toBeGreaterThan(0);
    expect(result!.replay).toEqual({ seed: 77, log });
    // And the token round-trips, which is what the paste-back box relies on.
    expect(decodeResult(encodeResult(result!))).toEqual(result);
  });
});
