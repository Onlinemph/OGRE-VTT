# Rules mapping

Where each printed rule is implemented, what is simplified, and what is not in
yet. Section numbers are from **Ogre, Sixth Edition, Revised** (rules version
6.3, August 2019).

The short version: **Sections 1–8 are implemented in full.** Sections 9–15 —
the train, Cruise Missiles, buildings beyond simple structure points, lasers,
most optional rules, and combat engineering — are not, and are listed at the
bottom.

---

## Values that need checking against your counters

This is the most useful thing on this page.

The rulebook prints most unit statistics on the counters rather than in a table,
so the rules _text_ only pins some of them down. Everything below is consistent
with every worked example in the rules and with the published unit summary, but
it is **not derivable from the rules text**, and it is all in one file —
`src/engine/units.ts` — so a correction is a one-line edit.

If you own the game, five minutes with the counter sheet settles all of it.

| Unit                                                        | Value                     | Used here                 | How much it matters                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Howitzer**                                                | defence                   | **1**                     | **High.** At D1 an Ogre secondary battery kills one at 3-1; at D3 it is only 1-1. This is the single most load-bearing unconfirmed number in the game.                                                                                      |
| Howitzer                                                    | range                     | 8                         | High — it decides whether a howitzer line can sit outside an Ogre's missile range (5).                                                                                                                                                      |
| Mobile Howitzer                                             | range, defence            | 6, 1                      | Medium.                                                                                                                                                                                                                                     |
| Missile Tank                                                | range, move               | 4, 2                      | Medium. Attack 3 _is_ forced by 7.13.1 and is not in doubt.                                                                                                                                                                                 |
| Heavy Tank                                                  | move                      | 3                         | Medium. Attack 4 / range 2 are the rulebook's own counter example (7.02), and D3 is stated in the 7.12 spillover example.                                                                                                                   |
| Light Tank                                                  | all four                  | 2/2 D2 M3                 | Medium.                                                                                                                                                                                                                                     |
| Light GEV                                                   | attack, range, move       | 1/2, 4-3                  | Low. D1 is forced by the Example of Play.                                                                                                                                                                                                   |
| GEV-PC                                                      | range, defence, move      | 2, D2, 3-2                | Low. Attack 1 is forced by the ram example in 6.07.3.                                                                                                                                                                                       |
| GEV                                                         | range                     | 2                         | Low. Movement 4-3, attack 2 and D2 are all confirmed by the rules text.                                                                                                                                                                     |
| Superheavy Tank                                             | defence                   | 5                         | Low. 5.11.2's example only proves it is 5 or 6 (a Howitzer's 6 is "1-to-1" against either).                                                                                                                                                 |
| Truck, Hovertruck                                           | move                      | 4, 4-3                    | Low — they are targets.                                                                                                                                                                                                                     |
| Missile Crawler, Crawler                                    | defence, move             | 2, 2                      | Low.                                                                                                                                                                                                                                        |
| Ogre Marks I, II, III, III-B, IV, VI, Fencer, Doppelsoldner | armament and tread counts | see `src/engine/ogres.ts` | **Medium for the Mark III**, which the first starting scenario uses. Its armament (1 main, 4 secondary, 8 AP, 2 missiles) matches the published record sheet; the tread count of 45 is the one number in real doubt (some sources give 48). |

Values that are **not** in doubt, because the rules text states or forces them:

- Every Ogre weapon's attack, range and defence — the Mark V's record sheet is
  reproduced in the rulebook: main battery 4/3 D4, secondary 3/2 D3,
  antipersonnel 1/1 D1, missile 6/5 D3, 60 tread units, Size 8, 25 armour units,
  movement starting at 3.
- The Ogre Ninja and the Ogre Vulcan, both given in full in 14.02 and 15.02.
- Infantry: 1 attack and 1 defence per squad, M2, 2 VP per squad, three squads
  to a counter, three squads equal to one armour unit.
- The Superheavy's 6\*/3 split attack and its two 1/1 antipersonnel guns.
- The Light Artillery Drone: "Attack 2, Range 8, Defense 1, and Movement 0".
- The Command Post at defence 0, and 1 in a town.
- The Heavy Weapons Team's 3/4 one-shot missile and inherent 1/1.
- Every armour-unit cost and victory-point value (1.07, 1.08, 1.09, 13.03).
- The whole Size Table.

`tests/stats.test.ts` asserts both halves of this: that the confirmed values are
right, and that the unconfirmed ones are still _flagged_, so this table cannot
quietly go stale.

---

## Implemented

### 1 – Introduction and starting scenarios

| Rule                                                                   | Where                                                                       |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1.02 Objectives, 1.04 play balance                                     | `src/scenarios/ogreAttack.ts`                                               |
| 1.07 Unit costs (half, double, triple)                                 | `UnitClass.armorUnits` in `units.ts`; asserted in `tests/scenarios.test.ts` |
| 1.08 Victory points for losses                                         | `state.victoryValue`, awarded in `destroyUnit`                              |
| 1.09, 1.09.1 VP for Ogres and Ogre damage                              | `ogres.ts` (`vp`, `OgreWeaponSpec.vp`), `state.ogreDamageValue`             |
| Mark III Attack, Mark V Attack, and all six victory conditions of each | `src/scenarios/ogreAttack.ts`                                               |

### 2 – Maps

| Rule                                                      | Where                                           |
| --------------------------------------------------------- | ----------------------------------------------- |
| 2.01 Terrain types                                        | `terrain.ts`                                    |
| 2.01.2 Craters impassable to everything, fire passes over | `terrain.entryCost`                             |
| 2.01.7/8 Damaged town and forest, rubble                  | `terrain.baseTerrain`, `terrain.degradeTerrain` |
| 2.02.1 Ridges: only Ogres, Superheavies and infantry      | `terrain.sideCrossing`                          |
| 2.02.2 Streams                                            | `terrain.sideCrossing`                          |
| 2.03 Roads and railroads as links across hexsides         | `map.ts`                                        |
| Hex numbering (`1401`), and the North/Central/South lines | `hex.label`, `map.areaOf`                       |

The boards are **generated, not transcribed** (`mapdata.ts`). This repository
ships no scan or trace of a published map. See the note in that file if you
would rather play on the printed board.

### 3 – Units

| Rule                                                                    | Where                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| 3.01 Armour unit stats, the `*` split attack                            | `units.ts`                                       |
| 3.02 Infantry as squads; defence equals squad count; three to a counter | `units.ts`, `state.printedDefense`               |
| 3.02.1 Marines: water movement and doubled defence in water             | `state.defenseOf`                                |
| 3.02.2 Heavy Weapons Teams: one-shot 3/4 plus inherent 1/1              | `units.HEAVY_WEAPON`, `combat.ts`                |
| 3.03 Truck and Hovertruck at D0, D1 in town or under spillover          | `state.defenseOf`                                |
| 3.04.2 Ogre components, including internal missiles and racks           | `ogres.ts`, `types.OgreWeapon`                   |
| 3.04.2 Tread units and the movement track                               | `ogres.movementForTreads`                        |
| 3.05 Command Post at D0, strength 1 in an overrun                       | `units.ts`                                       |
| 3.05.2 Hardened CP: a D does nothing, a second D destroys               | `combat.applyToUnit`                             |
| 3.06 Buildings and structure points                                     | `types.Building`, `combat.resolveBuildingAttack` |

### 4 – Turn sequencing

| Rule                                                   | Where                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| 4.02 The five steps of a player-turn                   | `reducer.advancePhase`                                       |
| 4.02.1(a) Automatic recovery from combat disablement   | `movement.runRecovery`                                       |
| 4.02.1(b) Die roll to recover from terrain disablement | `movement.runRecovery`                                       |
| 4.02.3 The disable check, after everything has moved   | `movement.resolvePendingHazards`                             |
| 4.03/4.04 Multi-player and multi-side ordering         | `reducer.startNextPlayerTurn` (turn order is the scenario's) |

### 5 – Movement

| Rule                                                                  | Where                                             |
| --------------------------------------------------------------------- | ------------------------------------------------- |
| 5.02 Stacking, per side, with infantry at one third                   | `movement.hexLoad`                                |
| 5.02.3 Splitting and combining infantry counters                      | `reducer.doSplit`, `doCombine`                    |
| 5.03 Moving through friendly units, and through unarmed enemies       | `movement.stepInfo`                               |
| 5.05 GEV double movement                                              | `state.movementAllowance`, `reducer.advancePhase` |
| 5.06 Ogre movement points from the tread track                        | `state.movementAllowance`                         |
| 5.07.1 The road bonus, as a property of the whole phase               | `movement.planPath`                               |
| 5.07.3 Rail: terrain ignored by all, bonus only for GEVs and infantry | `movement.bonusEligibleFor`                       |
| 5.08.1–5.08.5 The five terrain tables                                 | `terrain.entryCost`                               |
| 5.09 The minimum move                                                 | `movement.planPath`                               |
| 5.11 Infantry riding vehicles, mount/dismount sequencing              | `movement.canMount`, `canDismount`                |
| 5.12 Leaving the map                                                  | `movement.applyMove`, `Unit.offMap`               |

### 6 – Ramming

| Rule                                                                         | Where                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 6.01.1 Two ordinary rams a turn, or one Ogre                                 | `ram.canRam`                                                     |
| 6.02 Ogre rams armour: 1-3 disabled, 4-6 destroyed; immobile units flattened | `ram.ramArmorWithOgre`                                           |
| 6.02 Tread cost: 2 for a Heavy Tank or MHWZ, 3 for a Superheavy, 1 otherwise | `ogres.ogreRamsArmorSelfLoss`                                    |
| 6.02.1 Riders share the die roll, and dismount if they live                  | `ram.resolveRiders`                                              |
| 6.03 Ramming a CP costs treads equal to its defence — zero, normally         | `ram.ramCommandPost`                                             |
| 6.04 Movement recalculated mid-turn after tread loss                         | `state.movementAllowance`, tested against the rulebook's example |
| 6.05 Ogre versus Ogre, and the Size Table dice                               | `ram.ramOgreWithOgre`, `ogres.SIZE_TABLE`                        |
| 6.06 Driving over infantry — not a ram, and not against the limit            | `movement.stepInfo`, `reducer.doReduceInfantry`                  |
| 6.07.2 Conventional armour rams an Ogre and dies                             | `ram.ramOgreWithArmor`                                           |
| 6.07.3 GEV rams at twice its attack strength, and is destroyed               | `ram.ramUnitWithGev`                                             |
| 6.08 Fighting in the same hex                                                | falls out of range being hex distance                            |

### 7 – Combat

| Rule                                                                        | Where                                         |
| --------------------------------------------------------------------------- | --------------------------------------------- |
| 7.02 Attack strength and range; no line of sight                            | `hex.distance`, `combat.previewAttack`        |
| 7.05 One attack per unit and per Ogre weapon per turn                       | `combat.spentReason`                          |
| 7.05.1 AP weapons: infantry and D0 only, once per counter per phase         | `combat.previewAttack`                        |
| 7.05.2/7.05.3 Missiles are one-shot; racks fire one internal missile a turn | `state.isFireable`                            |
| 7.06 Combining attacks — except on treads                                   | `combat.previewAttack`                        |
| 7.07.1 Infantry splitting fire between targets                              | `AttackerRef.squads`                          |
| 7.10 The odds ladder, 5-1 automatic, worse than 1-2 nothing                 | `crt.oddsFor`                                 |
| 7.11 NE / D / X, and D not affecting Ogres or the train                     | `crt.applyToTarget`, `combat.applyToUnit`     |
| 7.12 Spillover fire, at half strength and one step down                     | `combat.applySpillover`                       |
| 7.13.1 Attacks on Ogre weapons                                              | `combat.previewAttack`                        |
| 7.13.2 Attacks on treads: one unit, always 1-1, strength in tread units     | `combat.resolveTreadAttack`                   |
| 7.13.3 An Ogre dies only with every weapon and every tread gone             | `state.ogreIsDestroyed`                       |
| 7.14 Terrain effects on combat, including treads in town                    | `terrain.defenseMultiplier`, `treadHitRollIn` |

### 11 – Buildings (partial)

Structure points, damage at twice attack strength, and the halving in town or
forest (11.03, 11.04.1) are implemented. Overrun and ram damage to buildings are
not, because overrun combat is not.

### 13 – Optional rules (partial)

13.01 damage to terrain — hexes at defence 4, degrading to rubble, cutting
roads — is implemented behind `GameOptions.terrainDamage`.

---

## Interpretations

Two places where the rules are silent or ambiguous, and the reading chosen is
written down rather than quietly assumed.

**A town doubles an Ogre's weapon defences.** 7.14.2 doubles "the defense
strength of all other units" in a town, and an Ogre's components are the only
defence strengths an Ogre has. Treads get their own town provision (destroyed
only on a 6), which reads as a separate rule _because_ treads are not resolved
on the odds ladder — not as an exemption for the rest of the machine.
Implemented in `state.ogreWeaponDefense`.

**Stacking limits are per side.** 5.02.2 says "up to five vehicles on each side
may occupy any hex". Taking that literally is what lets an Ogre stand in the hex
with the infantry it has just driven over (6.06) and the tank it disabled by
ramming (6.08), both of which the rules describe happening. Implemented in
`movement.hexLoad`.

**The disable check is rolled at the end of the movement phase**, per step 3 of
4.02, not on entry — so a player commits every unit's move before learning which
of them bogged down. The exception in step 2(a), for units that trigger a ram,
is not implemented separately because ramming does not currently roll for
terrain first.

---

## Not implemented yet

Each of these is a self-contained addition; none of them require changing the
engine's shape.

| Section                     | What is missing                                                                     | Notes                                                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **8 – Overrun combat**      | The whole section                                                                   | The two starting scenarios use the ramming rules (1.01), and the rules say to pick one or the other, never both (6.00). `GameOptions.overrunCombat` exists and currently rejects ram commands; the fire-round machinery is the next thing to build. |
| **9 – The train**           | All of it                                                                           | Needs a two-hex unit with a speed marker.                                                                                                                                                                                                           |
| **10 – Cruise missiles**    | All of it                                                                           | Interception, fratricide and the shockwave table.                                                                                                                                                                                                   |
| **11 – Buildings**          | Overrun and ram damage, combat-engineer bonuses                                     | Structure points themselves are in.                                                                                                                                                                                                                 |
| **12 – Lasers**             | All of it                                                                           | The only rule in the game with line of sight.                                                                                                                                                                                                       |
| **13 – Optional rules**     | Mines, camouflage, dummies, bridge destruction, Superheavy record sheets (13.07)    | Terrain damage (13.01) is in.                                                                                                                                                                                                                       |
| **14 – Advanced units**     | The Ninja's −1 to be hit and its combined-fire restriction; LAD deployment sequence | Both units' statistics are in.                                                                                                                                                                                                                      |
| **15 – Combat engineering** | All of it                                                                           | Entrenchments, mine handling, Vulcan tasks.                                                                                                                                                                                                         |
| Setup                       | An interactive deployment phase                                                     | Scenarios currently deploy a _legal_ force from the seed — reroll the seed for a different battle plan — and the defence may reposition normally on its first turn.                                                                                 |

---

## Reporting a rules bug

Bug reports about rules accuracy are the most valuable kind. Cite the section
and the phrase, and say what the implementation does instead. If you are adding
a rule, quote the rulebook in a comment at the implementation site and add the
row here.
