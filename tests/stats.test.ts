/**
 * Unit and Ogre statistics, checked against the numbers the rules text pins
 * down — the reproduced Mark V record sheet, the Size Table, 13.03 and 1.09,
 * and the odds quoted in 7.13.1 and the Example of Play.
 *
 * Where a value is only on a printed counter it is flagged `unconfirmed` in
 * `units.ts`; this file asserts that those flags exist, so the list in
 * docs/RULES-MAPPING.md cannot silently go stale.
 */

import { describe, expect, it } from 'vitest';
import { oddsFor } from '@engine/crt.js';
import { OGRE_TYPES, OGRE_WEAPONS, movementForTreads, ogreType } from '@engine/ogres.js';
import { UNIT_CLASSES, unitClass } from '@engine/units.js';

const column = (a: number, d: number): string => {
  const odds = oddsFor(a, d);
  return odds.kind === 'column' ? odds.column : odds.kind;
};

describe('Ogre weapons (Mark V record sheet, reproduced in the rules)', () => {
  it('has the printed attack, range and defence', () => {
    expect(OGRE_WEAPONS.main).toMatchObject({ attack: 4, range: 3, defense: 4 });
    expect(OGRE_WEAPONS.secondary).toMatchObject({ attack: 3, range: 2, defense: 3 });
    expect(OGRE_WEAPONS.ap).toMatchObject({ attack: 1, range: 1, defense: 1 });
    expect(OGRE_WEAPONS.missile).toMatchObject({ attack: 6, range: 5, defense: 3 });
  });

  it('gives the Mark V its printed inventory', () => {
    const mk5 = ogreType('MK5');
    expect(mk5.weapons).toEqual({ main: 2, secondary: 6, ap: 12, missile: 6 });
    expect(mk5.treads).toBe(60);
    expect(mk5.baseMove).toBe(3);
    expect(mk5.size).toBe(8);
    expect(mk5.armorUnits).toBe(25);
    expect(mk5.vp).toBe(150);
  });

  // "The Ninja carries a main battery and two secondary batteries. It has a
  // single missile rack and four internal missiles; two more missiles are
  // mounted externally. It has eight AP batteries. A Ninja starts with a move
  // of 4 and 40 tread units." (14.02)
  it('gives the Ninja its stated inventory', () => {
    const ninja = ogreType('NINJA');
    expect(ninja.weapons).toEqual({ main: 1, secondary: 2, ap: 8, missile: 2, missileRack: 1 });
    expect(ninja.internalMissiles).toBe(4);
    expect(ninja.baseMove).toBe(4);
    expect(ninja.treads).toBe(40);
  });

  // "all it has are two secondary batteries and six AP guns" ... "It starts
  // with a move of 4 hexes. It has 48 tread units." ... "Each arm ... has D2."
  it('gives the Vulcan its stated inventory', () => {
    const vulcan = ogreType('VULCAN');
    expect(vulcan.weapons).toEqual({ arm: 2, secondary: 2, ap: 6 });
    expect(vulcan.treads).toBe(48);
    expect(vulcan.baseMove).toBe(4);
    expect(OGRE_WEAPONS.arm.defense).toBe(2);
  });
});

describe('the tread track (3.04.2, 6.04)', () => {
  // "when a Mark V is reduced to 40 tread units, its movement is reduced from
  // 3 to 2" — and 6.04's example puts the boundary at 41.
  it('drops the Mark V from 3 to 2 at exactly 40 treads', () => {
    const mk5 = ogreType('MK5');
    expect(movementForTreads(mk5, 60)).toBe(3);
    expect(movementForTreads(mk5, 41)).toBe(3);
    expect(movementForTreads(mk5, 40)).toBe(2);
    expect(movementForTreads(mk5, 21)).toBe(2);
    expect(movementForTreads(mk5, 20)).toBe(1);
    expect(movementForTreads(mk5, 1)).toBe(1);
  });

  // "When the Ogre's tread units are all gone, the Ogre can no longer move at
  // all. It can still fire at anything within range."
  it('immobilises an Ogre with no treads left', () => {
    expect(movementForTreads(ogreType('MK5'), 0)).toBe(0);
    expect(movementForTreads(ogreType('MK3'), 0)).toBe(0);
  });

  it('gives a Mark IV a four-step track for its four movement points', () => {
    const mk4 = ogreType('MK4');
    expect(movementForTreads(mk4, mk4.treads)).toBe(4);
    expect(movementForTreads(mk4, 1)).toBe(1);
  });
});

describe('conventional units', () => {
  // "A Missile Tank could fire on a gun from the secondary battery at 1-1, a
  // missile at 1-1, an AP gun at 3-1, or a main battery at 1-2. A Howitzer
  // could attack a secondary at 2-1." (7.13.1)
  it('reproduces the odds quoted in 7.13.1', () => {
    const msl = unitClass('MSL').attack;
    expect(column(msl, OGRE_WEAPONS.secondary.defense)).toBe('1-1');
    expect(column(msl, OGRE_WEAPONS.missile.defense)).toBe('1-1');
    expect(column(msl, OGRE_WEAPONS.ap.defense)).toBe('3-1');
    expect(column(msl, OGRE_WEAPONS.main.defense)).toBe('1-2');
    expect(column(unitClass('HWZ').attack, OGRE_WEAPONS.secondary.defense)).toBe('2-1');
  });

  // From the Example of Play, both directions.
  it('reproduces the Example of Play', () => {
    const main = OGRE_WEAPONS.main.attack;
    const secondary = OGRE_WEAPONS.secondary.attack;
    const ap = OGRE_WEAPONS.ap.attack;

    expect(column(main, unitClass('LGEV').defense)).toBe('4-1');
    expect(column(secondary, unitClass('HVY').defense)).toBe('1-1');
    expect(column(secondary, unitClass('GEV').defense)).toBe('1-1');
    expect(column(ap * 3, 3)).toBe('1-1'); // 3 AP on a 3-squad counter
    expect(column(ap * 2, 1)).toBe('2-1'); // 2 AP on a single squad
    expect(column(secondary * 2, unitClass('GEV').defense)).toBe('3-1');
    expect(column(main, unitClass('GEV').defense)).toBe('2-1');
    expect(oddsFor(secondary * 2 + main, unitClass('GEV').defense).kind).toBe('auto');

    expect(column(unitClass('HVY').attack, OGRE_WEAPONS.main.defense)).toBe('1-1');
    expect(column(unitClass('MSL').attack, OGRE_WEAPONS.secondary.defense)).toBe('1-1');
    expect(column(unitClass('GEV').attack, OGRE_WEAPONS.main.defense)).toBe('1-2');
    expect(column(unitClass('HWZ').attack, OGRE_WEAPONS.secondary.defense)).toBe('2-1');
  });

  // "A Howitzer fires on a Superheavy Tank carrying two squads of infantry ...
  // The attack is a 3-to-1 on the two infantry ... but only a 1-to-1 on the
  // Superheavy." (5.11.2)
  it('reproduces the Superheavy example in 5.11.2', () => {
    expect(column(unitClass('HWZ').attack, 2)).toBe('3-1');
    expect(column(unitClass('HWZ').attack, unitClass('SHVY').defense)).toBe('1-1');
  });

  // "the Superheavy Tank (6*/3) may attack with two separate 3/3 attacks" (7.02)
  it('gives the Superheavy a splittable 6/3 and two AP', () => {
    const shvy = unitClass('SHVY');
    expect(shvy.attack).toBe(6);
    expect(shvy.range).toBe(3);
    expect(shvy.splitAttack).toBe(true);
    expect(shvy.ap).toBe(2);
  });

  // "It has Attack 2, Range 8, Defense 1, and Movement 0." (14.01)
  it('gives the Light Artillery Drone its stated line', () => {
    expect(unitClass('LAD')).toMatchObject({ attack: 2, range: 8, defense: 1, move: 0 });
  });

  // "A basic CP has a defense of 0, and will be destroyed by any attack." (3.05)
  it('leaves the command post at defence zero', () => {
    expect(unitClass('CP').defense).toBe(0);
    expect(oddsFor(1, 0).kind).toBe('auto');
  });

  it('prices the roster the way 1.07 and 1.08 do', () => {
    expect(unitClass('LT').armorUnits).toBe(0.5);
    expect(unitClass('LGEV').armorUnits).toBe(0.5);
    expect(unitClass('HWZ').armorUnits).toBe(2);
    expect(unitClass('MHWZ').armorUnits).toBe(2);
    expect(unitClass('SHVY').armorUnits).toBe(2);
    expect(unitClass('MCRL').armorUnits).toBe(3);
    expect(unitClass('INF').vp).toBe(2);
    expect(unitClass('MAR').vp).toBe(4);
    expect(unitClass('HVY').vp).toBe(6);
    expect(unitClass('HWZ').vp).toBe(12);
  });

  // "A regular GEV has a movement of 4-3." (5.05)
  it('gives the GEV two movement phases', () => {
    expect(unitClass('GEV').move).toBe(4);
    expect(unitClass('GEV').secondMove).toBe(3);
  });
});

describe('provenance', () => {
  it('flags every statistic that is only on a printed counter', () => {
    // Values the rules text pins down must NOT be flagged, or the list in
    // docs/RULES-MAPPING.md is telling players to check something settled.
    expect(UNIT_CLASSES.INF.unconfirmed).toBeUndefined();
    expect(UNIT_CLASSES.LAD.unconfirmed).toEqual(['vp']);
    expect(UNIT_CLASSES.GEV.unconfirmed).toEqual(['range']);

    // The Howitzer's defence is the single most load-bearing unconfirmed value
    // in the game: it decides whether an Ogre secondary kills one at 3-1 or
    // merely 1-1.
    expect(UNIT_CLASSES.HWZ.unconfirmed).toContain('defense');
  });

  it('marks the Ogres whose armament is not in the rules text', () => {
    expect(OGRE_TYPES.MK5.armamentUnconfirmed).toBeUndefined();
    expect(OGRE_TYPES.NINJA.armamentUnconfirmed).toBeUndefined();
    expect(OGRE_TYPES.VULCAN.armamentUnconfirmed).toBeUndefined();
    expect(OGRE_TYPES.MK3.armamentUnconfirmed).toBe(true);
  });

  it('every class carries a provenance note', () => {
    for (const cls of Object.values(UNIT_CLASSES)) {
      expect(cls.note.length).toBeGreaterThan(20);
    }
  });
});
