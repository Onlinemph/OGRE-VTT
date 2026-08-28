/**
 * The campaign's own tables: the map of objectives, the procurement lists, and
 * the victory line.
 *
 * The fiction is the one docs/CAMPAIGN.md picked because Ogre's own preface
 * supplies it: the Last War is fought over resources, and the resources are
 * not all on Earth. Terra is deliberately *not* an objective — the ground war
 * there is the stalemate both sides are trying to break — so the campaign is
 * fought over the off-world sites, every one of which is a body on the
 * Triplanetary chart, because a site the space game cannot fly to is a site
 * the campaign cannot contest.
 *
 * Prices are in production points (PP). The scale is one PP per MCr 3⅓ of
 * Triplanetary shipping and 3 PP per Ogre armour unit — chosen so that both
 * catalogues land on whole numbers (an infantry squad, a third of an armour
 * unit, is exactly 1 PP) and so that a cybertank and a frigate cost the same
 * order of magnitude, which is the campaign's actual claim: fleets and ground
 * forces compete for the same industry. The ship prices are the Triplanetary
 * ship table's MCr column; the campaign owns this copy of them, as
 * docs/CAMPAIGN.md says it must — neither game engine knows it exists.
 */

import { OGRE_TYPES, type OgreTypeId } from '@engine/ogres.js';
import { UNIT_CLASSES, type UnitClassId } from '@engine/units.js';

export type CampaignSideId = 'combine' | 'paneuro';

export interface CampaignSideDef {
  readonly id: CampaignSideId;
  readonly name: string;
  readonly faction: string;
  readonly color: string;
}

export const CAMPAIGN_SIDES: Readonly<Record<CampaignSideId, CampaignSideDef>> = {
  combine: {
    id: 'combine',
    name: 'Combine',
    faction: 'North American Combine',
    color: '#d94f4f',
  },
  paneuro: {
    id: 'paneuro',
    name: 'Paneurope',
    faction: 'Paneuropean Federation',
    color: '#5b9bd5',
  },
};

export const otherSide = (side: CampaignSideId): CampaignSideId =>
  side === 'combine' ? 'paneuro' : 'combine';

// ---------------------------------------------------------------------------
// The map of objectives
// ---------------------------------------------------------------------------

export interface SiteDef {
  /** Also the body id on the Triplanetary chart — that identity is the join. */
  readonly id: string;
  readonly name: string;
  /** Production points per campaign turn, to whoever holds it. */
  readonly production: number;
}

/** Each side's opening hold, and the garrison already dug in there. */
export interface OpeningHold {
  readonly holder: CampaignSideId;
  readonly garrison: Readonly<Record<string, number>>;
}

export const SITES: readonly SiteDef[] = [
  { id: 'luna', name: 'Luna', production: 6 },
  { id: 'venus', name: 'Venus', production: 9 },
  { id: 'mars', name: 'Mars', production: 9 },
  { id: 'mercury', name: 'Mercury', production: 3 },
  { id: 'ceres', name: 'Ceres', production: 6 },
  { id: 'io', name: 'Io', production: 3 },
  { id: 'ganymede', name: 'Ganymede', production: 3 },
  { id: 'callisto', name: 'Callisto', production: 6 },
];

export const siteDef = (id: string): SiteDef | undefined => SITES.find((s) => s.id === id);

/**
 * The opening position: each side holds an inner-system prize and an outpost,
 * with the Belt and the small moons unclaimed and worth going for.
 */
export const OPENING_HOLDS: Readonly<Record<string, OpeningHold>> = {
  luna: { holder: 'combine', garrison: { INF: 6, HVY: 2 } },
  venus: { holder: 'combine', garrison: { INF: 9, MSL: 2 } },
  mars: { holder: 'paneuro', garrison: { INF: 9, HVY: 2 } },
  callisto: { holder: 'paneuro', garrison: { INF: 6, GEV: 2 } },
};

/** Total production on the map — the pie the war is over. */
export const TOTAL_PRODUCTION = SITES.reduce((n, s) => n + s.production, 0);

/**
 * The victory line: hold two thirds of the map's production at the end of a
 * consolidation and the other side's war economy cannot recover. Holding
 * every site is a complete victory.
 */
export const VICTORY_PRODUCTION = Math.ceil((TOTAL_PRODUCTION * 2) / 3);

/** What each side starts the war with, beyond its garrisons. */
export const OPENING_PRODUCTION = 30;
export const OPENING_FLEET: Readonly<Record<string, number>> = { transport: 2, corvette: 2 };
export const OPENING_GROUND: Readonly<Record<string, number>> = { INF: 6, HVY: 2 };

// ---------------------------------------------------------------------------
// Procurement: ships
// ---------------------------------------------------------------------------

export interface ShipEntry {
  /** A `ShipClass` id on the Triplanetary side; a plain string here. */
  readonly id: string;
  readonly name: string;
  readonly pp: number;
  /** Cargo lots this hull can lift — see convert.ts for what a lot is. */
  readonly lots: number;
}

/**
 * The hulls the campaign will buy, priced from the Triplanetary ship table
 * (MCr 10 → 3 PP) with cargo capacity restated in lots (10 tons each).
 */
export const SHIP_CATALOGUE: readonly ShipEntry[] = [
  { id: 'transport', name: 'Transport', pp: 3, lots: 5 },
  { id: 'tanker', name: 'Tanker', pp: 3, lots: 0 },
  { id: 'corvette', name: 'Corvette', pp: 12, lots: 0 },
  { id: 'corsair', name: 'Corsair', pp: 24, lots: 1 },
  { id: 'frigate', name: 'Frigate', pp: 45, lots: 4 },
  { id: 'dreadnaught', name: 'Dreadnaught', pp: 180, lots: 5 },
];

export const shipEntry = (id: string): ShipEntry | undefined =>
  SHIP_CATALOGUE.find((s) => s.id === id);

// ---------------------------------------------------------------------------
// Procurement: ground forces
// ---------------------------------------------------------------------------

export interface GroundEntry {
  /** A `UnitClassId` or `OgreTypeId` — the vocabulary The Landing speaks. */
  readonly id: string;
  readonly name: string;
  readonly pp: number;
  /** Armour units apiece (1.07); infantry are counted per squad. */
  readonly armorUnits: number;
}

const unit = (id: UnitClassId): GroundEntry => ({
  id,
  name: id === 'INF' ? 'Infantry squad' : UNIT_CLASSES[id].name,
  pp: Math.round(UNIT_CLASSES[id].armorUnits * 3),
  armorUnits: UNIT_CLASSES[id].armorUnits,
});

const ogre = (id: OgreTypeId): GroundEntry => ({
  id,
  name: OGRE_TYPES[id].name,
  pp: OGRE_TYPES[id].armorUnits * 3,
  armorUnits: OGRE_TYPES[id].armorUnits,
});

/**
 * What the ground factories sell. The set is restricted to units whose armour
 * cost triples to a whole number of PP, which happens to be the classic mix;
 * the two cybertanks are the ones the starting scenarios field.
 */
export const GROUND_CATALOGUE: readonly GroundEntry[] = [
  unit('INF'),
  unit('HVY'),
  unit('MSL'),
  unit('GEV'),
  unit('HWZ'),
  unit('SHVY'),
  ogre('MK3'),
  ogre('MK5'),
];

export const groundEntry = (id: string): GroundEntry | undefined =>
  GROUND_CATALOGUE.find((g) => g.id === id);
