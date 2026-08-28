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
import type { CampaignCommand, CampaignState } from '@campaign/engine.js';
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
}

// ---------------------------------------------------------------------------
// The campaign
// ---------------------------------------------------------------------------

/** A running campaign: state to read, orders to give, changes to hear about. */
export interface CampaignHandle {
  readonly state: CampaignState;
  readonly canUndo: boolean;
  dispatch(cmd: CampaignCommand): { readonly ok: boolean; readonly reason?: string };
  subscribe(fn: () => void): () => void;
  undo(): void;
}

/**
 * Everything the campaign screen needs from the world: the saved war, and the
 * codec glue for the two hand-offs. `main.ts` implements it with
 * `CampaignSession`, `localStorage` and the campaign codec; the shell never
 * learns any of those concretely.
 */
export interface CampaignDeps {
  /** The saved war, if one is running. Stable across calls. */
  current(): CampaignHandle | null;
  /** Start a fresh war, replacing any saved one. */
  start(seed: number): CampaignHandle;
  /** Burn the ledger. */
  abandon(): void;
  /** The pasteable token a battle order travels as. */
  orderToken(order: OrderOfBattle): string;
  /** The link that opens a space battle in the Triplanetary app. */
  triplanetaryUrl(order: OrderOfBattle): string;
  /** Parse a pasted result token. Throws with a sentence worth showing. */
  parseResult(text: string): BattleResult;
  /** The result of a finished in-app battle, or null while it is undecided. */
  resultFor(state: GameState, log: readonly Command[]): BattleResult | null;
  /** The pasteable token for a result, for battles fought over a URL. */
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
  /** The campaign layer — see `CampaignDeps`. */
  readonly campaign: CampaignDeps;
  /** A ground battle off the address bar (`?battle=…`), already decoded. */
  readonly openingBattle?: OrderOfBattle | null;
  /** Why a `?battle=` token on the address bar could not be honoured. */
  readonly openingBattleError?: string | null;
}
