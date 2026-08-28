/**
 * The campaign engine: the conversion table, the strategic loop, and a whole
 * operation round-tripped through the real Landing scenario.
 */

import { describe, expect, it } from 'vitest';
import { destroyUnit } from '@engine/state.js';
import { armourUnitsOf, lotsOf, splitByLots } from '@campaign/convert.js';
import { VICTORY_PRODUCTION } from '@campaign/data.js';
import {
  type CampaignCommand,
  type CampaignState,
  applyCampaignCommand,
  createCampaign,
} from '@campaign/engine.js';
import type { BattleResult } from '@campaign/orders.js';
import { readBattleResult } from '@campaign/result.js';
import { CampaignSession } from '@campaign/session.js';
import { LANDING } from '@scenarios/index.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const run = (state: CampaignState, cmd: CampaignCommand): CampaignState => {
  const step = applyCampaignCommand(state, cmd);
  expect(step.result).toEqual({ ok: true });
  return step.state;
};

const refuse = (state: CampaignState, cmd: CampaignCommand): string => {
  const step = applyCampaignCommand(state, cmd);
  expect(step.result.ok).toBe(false);
  expect(step.state).toBe(state);
  return step.result.ok ? '' : step.result.reason;
};

// ---------------------------------------------------------------------------
// The conversion table
// ---------------------------------------------------------------------------

describe('the conversion table', () => {
  const force = { MK3: 1, HVY: 2, INF: 7 };

  it('prices a force in armour units the way 1.07 does', () => {
    expect(armourUnitsOf(force)).toBeCloseTo(17 + 2 + 7 / 3, 5);
  });

  it('needs one lot per armour unit, infantry three squads to the lot', () => {
    // 17 for the cybertank, 1 each for the tanks, ceil(7/3) = 3 for the squads.
    expect(lotsOf(force)).toBe(22);
  });

  it('loads heaviest first, whole units only', () => {
    // Five lots: the Mark III (17 lots) cannot fit, both tanks and all seven
    // squads can.
    expect(splitByLots(force, 5)).toEqual({
      loaded: { HVY: 2, INF: 7 },
      remainder: { MK3: 1 },
      lotsUsed: 5,
    });
    // Twenty lots: the cybertank and the tanks ride, and one lot of squads.
    expect(splitByLots(force, 20)).toEqual({
      loaded: { MK3: 1, HVY: 2, INF: 3 },
      remainder: { INF: 4 },
      lotsUsed: 20,
    });
  });

  it('conserves the force across a split', () => {
    for (const budget of [0, 1, 3, 10, 22, 40]) {
      const split = splitByLots(force, budget);
      const total = (id: string): number => (split.loaded[id] ?? 0) + (split.remainder[id] ?? 0);
      expect(total('MK3')).toBe(1);
      expect(total('HVY')).toBe(2);
      expect(total('INF')).toBe(7);
    }
  });

  it('refuses a unit outside the catalogue', () => {
    expect(() => armourUnitsOf({ destroyer: 1 })).toThrow(/catalogue/);
  });
});

// ---------------------------------------------------------------------------
// The strategic loop
// ---------------------------------------------------------------------------

describe('the campaign engine', () => {
  it('is deterministic for a seed', () => {
    expect(JSON.stringify(createCampaign(9))).toBe(JSON.stringify(createCampaign(9)));
  });

  it('spends production on ships and ground forces, and refuses overspend', () => {
    let state = createCampaign(1);
    const before = state.sides.combine.production;
    state = run(state, { type: 'buyShips', by: 'combine', ship: 'transport', count: 2 });
    state = run(state, { type: 'buyGround', by: 'combine', unit: 'INF', count: 6 });
    expect(state.sides.combine.production).toBe(before - 2 * 3 - 6);
    expect(state.sides.combine.fleet['transport']).toBe(4);
    expect(state.sides.combine.ground['INF']).toBe(12);
    expect(refuse(state, { type: 'buyGround', by: 'combine', unit: 'MK5', count: 9 })).toMatch(
      /costs/,
    );
    expect(refuse(state, { type: 'buyShips', by: 'combine', ship: 'yacht', count: 1 })).toMatch(
      /hull/,
    );
  });

  it('moves garrisons only onto held sites, only from the pool', () => {
    let state = createCampaign(1);
    state = run(state, { type: 'garrison', by: 'combine', site: 'luna', unit: 'HVY', count: 1 });
    expect(state.sites['luna']!.garrison['HVY']).toBe(3);
    expect(state.sides.combine.ground['HVY']).toBe(1);
    expect(
      refuse(state, { type: 'garrison', by: 'combine', site: 'mars', unit: 'HVY', count: 1 }),
    ).toMatch(/hold/);
    expect(
      refuse(state, { type: 'garrison', by: 'combine', site: 'luna', unit: 'HVY', count: 5 }),
    ).toMatch(/short/);
  });

  it('takes an empty neutral site with an unopposed landing', () => {
    let state = createCampaign(1);
    state = run(state, {
      type: 'launchOffensive',
      by: 'combine',
      site: 'mercury',
      fleet: { transport: 1 },
      cargo: { INF: 3 },
    });
    expect(state.pending).toBeNull();
    expect(state.sites['mercury']!.holder).toBe('combine');
    expect(state.sites['mercury']!.garrison).toEqual({ INF: 3 });
    // The convoy came home.
    expect(state.sides.combine.fleet['transport']).toBe(2);
    // And the window is spent for the turn.
    expect(
      refuse(state, {
        type: 'launchOffensive',
        by: 'combine',
        site: 'ceres',
        fleet: { transport: 1 },
        cargo: { INF: 3 },
      }),
    ).toMatch(/per side per turn/);
  });

  it('refuses a convoy that cannot lift its cargo', () => {
    const state = createCampaign(1);
    expect(
      refuse(state, {
        type: 'launchOffensive',
        by: 'combine',
        site: 'mercury',
        fleet: { corvette: 1 },
        cargo: { INF: 3 },
      }),
    ).toMatch(/lifts 0 lots/);
  });

  it('pays held production at consolidation', () => {
    let state = createCampaign(1);
    const before = state.sides.combine.production;
    state = run(state, { type: 'endTurn' });
    // Combine opens holding Luna (6) and Venus (9).
    expect(state.sides.combine.production).toBe(before + 15);
    expect(state.turn).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// A contested transfer, stage by stage
// ---------------------------------------------------------------------------

const launchAtMars = (state: CampaignState): CampaignState =>
  run(state, {
    type: 'launchOffensive',
    by: 'combine',
    site: 'mars',
    fleet: { transport: 2, corvette: 2 },
    cargo: { HVY: 2, INF: 6 },
  });

describe('a contested transfer', () => {
  it('waits on the defender, who may come out or stand down', () => {
    let state = createCampaign(4);
    state = launchAtMars(state);
    expect(state.pending?.stage).toBe('intercept');
    expect(refuse(state, { type: 'intercept', by: 'combine', fleet: { corvette: 1 } })).toMatch(
      /holder/,
    );
    expect(refuse(state, { type: 'endTurn' })).toMatch(/report its result/);

    state = run(state, { type: 'intercept', by: 'paneuro', fleet: { corvette: 2 } });
    expect(state.pending?.stage).toBe('space');
    const order = state.pending!.order!;
    expect(order.scenarioId).toBe('contested-transfer');
    expect(order.sides[0]).toEqual({
      player: 'combine',
      faction: 'North American Combine',
      // Two tanks are two lots; six squads are two more.
      forces: { transport: 2, corvette: 2, freight: 4 },
    });
    expect(order.sides[1]!.forces).toEqual({ corvette: 2 });
    expect(order.terms['target']).toBe('mars');
    expect(state.sides.paneuro.fleet['corvette']).toBeUndefined();
  });

  it('lands what the space battle delivered, returns what turned back, sinks the rest', () => {
    let state = createCampaign(4);
    state = launchAtMars(state);
    state = run(state, { type: 'intercept', by: 'paneuro', fleet: { corvette: 2 } });
    const order = state.pending!.order!;

    // The convoy lost a transport: two of four lots delivered, one still
    // aboard the surviving transport, one on the bottom.
    const result: BattleResult = {
      battleId: order.battleId,
      winners: ['paneuro'],
      level: 'standard',
      survivors: {
        combine: { transport: 1, corvette: 2, freight: 3 },
        paneuro: { corvette: 1 },
      },
      victoryPoints: { combine: 2, paneuro: 0 },
      replay: { seed: order.seed, log: [] },
    };
    expect(
      refuse(state, {
        type: 'reportBattle',
        result: { ...result, battleId: 'wrong' },
      }),
    ).toMatch(/waiting on/);

    state = run(state, { type: 'reportBattle', result });

    // Hulls went home on both sides.
    expect(state.sides.combine.fleet).toMatchObject({ transport: 1, corvette: 2 });
    // One corvette of the two committed limps home to a pool where the
    // transports never left.
    expect(state.sides.paneuro.fleet).toEqual({ transport: 2, corvette: 1 });
    // Two lots ashore, heaviest first: both tanks. One lot turned back: three
    // squads. One lot of squads went down with the transport.
    expect(state.pending?.stage).toBe('ground');
    expect(state.pending?.landed).toEqual({ HVY: 2 });
    expect(state.sides.combine.ground['INF']).toBe(3);

    const ground = state.pending!.order!;
    expect(ground.scenarioId).toBe('landing');
    expect(ground.sides[0]!.forces).toEqual({ HVY: 2 });
    expect(ground.sides[1]!.forces).toEqual(state.sites['mars']!.garrison);
  });

  it('round-trips the ground battle through the real Landing scenario', () => {
    let state = createCampaign(4);
    state = launchAtMars(state);
    state = run(state, { type: 'stand', by: 'paneuro' });
    expect(state.pending?.stage).toBe('ground');
    const order = state.pending!.order!;

    // Fight it in the actual engine: build the scenario from the order and
    // let the invader wipe the garrison out.
    let battle = LANDING.build({ seed: order.seed, order });
    for (const u of Object.values(battle.units)) {
      if (u.owner === 'paneuro') battle = destroyUnit(battle, u.id, 'the landing', 'combine');
    }
    battle = { ...battle, victory: LANDING.checkVictory(battle) };
    const result = readBattleResult(battle, [])!;
    expect(result.battleId).toBe(order.battleId);

    state = run(state, { type: 'reportBattle', result });
    expect(state.pending).toBeNull();
    expect(state.sites['mars']!.holder).toBe('combine');
    // The survivors are the garrison now, in the same vocabulary they shipped in.
    expect(state.sites['mars']!.garrison).toEqual({ HVY: 2, INF: 6 });
  });

  it('writes off a defeated landing and keeps the defence in place', () => {
    let state = createCampaign(4);
    state = launchAtMars(state);
    state = run(state, { type: 'stand', by: 'paneuro' });
    const order = state.pending!.order!;

    let battle = LANDING.build({ seed: order.seed, order });
    for (const u of Object.values(battle.units)) {
      if (u.owner === 'combine') battle = destroyUnit(battle, u.id, 'the garrison', 'paneuro');
    }
    battle = { ...battle, victory: LANDING.checkVictory(battle) };
    const result = readBattleResult(battle, [])!;

    state = run(state, { type: 'reportBattle', result });
    expect(state.sites['mars']!.holder).toBe('paneuro');
    expect(state.sites['mars']!.garrison).toEqual(order.sides[1]!.forces);
  });
});

// ---------------------------------------------------------------------------
// The victory line, and the session
// ---------------------------------------------------------------------------

describe('winning the war', () => {
  it('calls the war at two thirds of the production', () => {
    let state = createCampaign(2);
    // Combine opens on 15 of 45. Mercury, Ceres, Io and Ganymede are empty and
    // neutral; garrisoning them lifts the hold to exactly the victory line.
    state = run(state, { type: 'buyGround', by: 'combine', unit: 'INF', count: 6 });
    for (const site of ['mercury', 'ceres', 'io', 'ganymede']) {
      state = run(state, {
        type: 'launchOffensive',
        by: 'combine',
        site,
        fleet: { transport: 1 },
        cargo: { INF: 3 },
      });
      expect(state.sites[site]!.holder).toBe('combine');
      state = run(state, { type: 'endTurn' });
    }
    expect(state.victory?.winner).toBe('combine');
    expect(state.victory?.level).toBe('standard');
    expect(refuse(state, { type: 'endTurn' })).toMatch(/over/);
  });

  it('needs the full two thirds', () => {
    const state = createCampaign(2);
    expect(VICTORY_PRODUCTION).toBe(30);
    expect(state.victory).toBeNull();
  });
});

describe('the campaign session', () => {
  it('replays a save to the same state, command for command', () => {
    const session = new CampaignSession(7);
    session.dispatch({ type: 'buyGround', by: 'combine', unit: 'INF', count: 3 });
    session.dispatch({
      type: 'launchOffensive',
      by: 'combine',
      site: 'mercury',
      fleet: { transport: 1 },
      cargo: { INF: 3 },
    });
    session.dispatch({ type: 'endTurn' });

    const restored = CampaignSession.deserialise(session.serialise());
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(session.state));
    expect(restored.log).toEqual(session.log);
  });

  it('undoes by replaying the log without its last entry', () => {
    const session = new CampaignSession(7);
    session.dispatch({ type: 'buyGround', by: 'combine', unit: 'INF', count: 3 });
    const before = JSON.stringify(session.state);
    session.dispatch({ type: 'endTurn' });
    session.undo();
    expect(JSON.stringify(session.state)).toBe(before);
  });

  it('refuses a file that is not a campaign', () => {
    expect(() => CampaignSession.deserialise('{"format":"other"}')).toThrow(/not a saved campaign/);
  });
});
