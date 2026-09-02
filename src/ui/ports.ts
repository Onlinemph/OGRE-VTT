/**
 * The seams between the interface and everything it drives.
 *
 * The shell never imports the session, the renderer or the scenario table
 * directly: `src/main.ts` wires the concrete implementations to these
 * structural ports. Two reasons. It keeps the panels testable against a
 * hand-written stub, and it means the shell is written against a contract of
 * its own — if a signature drifts, one adapter in `main.ts` absorbs it instead
 * of thirty call sites.
 */

import type { Command, CommandResult } from '@engine/commands.js';
import type { Hex, Point } from '@engine/hex.js';
import type { GameMap } from '@engine/map.js';
import type { GameOptions, GameState } from '@engine/types.js';
import type { BattleResult, OrderOfBattle } from '@campaign/orders.js';
import type { RenderView } from '@render/renderer.js';
import type { Inset } from '@render/camera.js';

export type { RenderView };

/** The subset of `GameSession` the interface uses. */
export interface SessionPort {
  /** Always the current state; re-read it after every dispatch. */
  readonly state: GameState;
  readonly map: GameMap;
  readonly canUndo: boolean;
  /**
   * The accepted commands so far. The shell never replays it; it exists so a
   * campaign battle's result can carry its own replay.
   */
  readonly log: readonly Command[];
  dispatch(cmd: Command): CommandResult;
  /** Fires after any state change. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
  undo(): void;
  /** Replace the log and recompute from the start: how a save is resumed. */
  replay(commands: readonly Command[]): void;
}

export interface RendererPort {
  render(state: GameState, view: RenderView): void;
  /** Client-space pixels (relative to the canvas) to a hex. */
  screenToHex(x: number, y: number): Hex;
  /** The inverse, in CSS pixels — used to pin DOM overlays to hexes. */
  hexToScreen(h: Hex): Point;
  panBy(dx: number, dy: number): void;
  /** `factor` > 1 zooms in, anchored on the given client-space point. */
  zoomAt(x: number, y: number, factor: number): void;
  fitMap(): void;
  focusOn(h: Hex): void;
  /** Re-read the canvas' CSS size and device pixel ratio. */
  resize(): void;
  /** Screen edges hidden behind floating panels, in CSS pixels. */
  setViewInset(inset: Inset): void;
}

export interface ScenarioDescriptor {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly briefing: string;
  readonly victoryConditions: readonly string[];
  readonly map: GameMap;
}

export interface ScenarioBuildArgs {
  readonly seed: number;
  readonly options?: Partial<GameOptions>;
  /** A campaign order of battle, for the scenario that builds from one. */
  readonly order?: OrderOfBattle;
  /** Open with the deployment step, so the players can rearrange the setup. */
  readonly setup?: boolean;
}

/** Where an unfinished battle is kept between visits — the browser, in practice. */
export interface StoragePort {
  load(): string | null;
  save(text: string): void;
  clear(): void;
}

// ---------------------------------------------------------------------------
// The campaign hand-off
// ---------------------------------------------------------------------------

/**
 * This app's half of the campaign that lives in the companion Triplanetary
 * app: enough glue to fight a landing an order token describes, and to hand
 * its result back the way the order came. Decoding, reading and encoding all
 * live in `main.ts` with the campaign codec; the shell never learns them
 * concretely.
 */
export interface BattleGlue {
  /** The result of a finished order-built battle, or null while undecided. */
  resultFor(state: GameState, log: readonly Command[]): BattleResult | null;
  /** The pasteable token the result travels back as. */
  resultToken(result: BattleResult): string;
}

export interface AppDeps {
  readonly root: HTMLElement;
  readonly scenarios: readonly ScenarioDescriptor[];
  buildScenario(id: string, args: ScenarioBuildArgs): GameState;
  createSession(scenarioId: string, state: GameState): SessionPort;
  createRenderer(canvas: HTMLCanvasElement, map: GameMap): RendererPort;
  /** Seed source for new games. Injected so the shell stays deterministic in tests. */
  randomSeed(): number;
  /** The campaign hand-off — see `BattleGlue`. */
  readonly battle: BattleGlue;
  /** Where the war itself lives: the Triplanetary app, war room included. */
  readonly campaignUrl: string;
  /** A ground battle off the address bar (`?battle=…`), already decoded. */
  readonly openingBattle?: OrderOfBattle | null;
  /** Why a `?battle=` token on the address bar could not be honoured. */
  readonly openingBattleError?: string | null;
  /** Autosave for the battle in progress; absent means nothing is saved. */
  readonly storage?: StoragePort;
}
