/**
 * A scenario is data plus two pure functions.
 *
 * `build(opts)` turns a seed into a starting `GameState`; `checkVictory(state)`
 * reads a state and says whether anyone has won. Both are pure, so a scenario
 * plus a seed plus a command log is a complete, replayable game.
 */

import type { GameMap } from '@engine/map.js';
import type { GameOptions, GameState, VictoryState } from '@engine/types.js';

export interface ScenarioBuildOptions {
  readonly seed: number;
  readonly options?: Partial<GameOptions>;
}

export interface ScenarioDef {
  readonly id: string;
  readonly name: string;
  readonly mapId: string;
  readonly players: number;
  /** One line for the picker. */
  readonly blurb: string;
  /** The full briefing, shown in the help panel. */
  readonly briefing: string;
  /** Victory conditions, in the order the rulebook lists them. */
  readonly victoryConditions: readonly string[];
  readonly map: GameMap;
  build(opts: ScenarioBuildOptions): GameState;
  checkVictory(state: GameState): VictoryState | null;
}
