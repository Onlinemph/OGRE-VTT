/**
 * The only file that wires the concrete pieces together.
 *
 * `createApp` is written against the ports in `ui/ports.ts`; this is where
 * they meet `GameSession`, `MapRenderer`, the scenario table, and the
 * campaign codec. It is also the only file that reads the environment or the
 * address bar.
 */

/// <reference types="vite/client" />

import './styles.css';

import { GameSession } from '@net/session.js';
import { MapRenderer } from '@render/renderer.js';
import { SCENARIOS, scenarioById } from '@scenarios/index.js';
import { decodeOrder, encodeResult } from '@campaign/codec.js';
import { type OrderOfBattle, orderOf } from '@campaign/orders.js';
import { readBattleResult } from '@campaign/result.js';
import { createApp } from '@ui/app.js';
import type { BattleGlue, RendererPort, SessionPort } from '@ui/ports.js';

const root = document.getElementById('root');
if (!root) throw new Error('no #root to mount on');

/**
 * A seed from the URL makes a battle shareable — and, when two browser tabs
 * are linked over BroadcastChannel, it is what makes them the same game.
 */
const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const scenarioParam = params.get('scenario');

// ---------------------------------------------------------------------------
// The campaign hand-off
// ---------------------------------------------------------------------------

/**
 * Where the campaign lives: the companion Triplanetary app, whose war room
 * launches the battles and reads the results back. This app is the ground
 * half — a landing arrives here as a `?battle=` token and its result leaves
 * the same way. Overridable at build time for forks and local hacking.
 */
const CAMPAIGN_URL =
  (import.meta.env.VITE_TRIPLANETARY_URL as string | undefined)?.trim() ||
  'https://onlinemph.github.io/Triplanetary-VTT/';

/** The one battle this browser remembers between visits. */
const SAVE_KEY = 'ogre-battle-v1';

const battleGlue: BattleGlue = {
  resultFor: (state, log) => (orderOf(state.scenarioData) ? readBattleResult(state, log) : null),
  resultToken: (result) => encodeResult(result),
};

/**
 * A `?battle=` token is a ground battle sent from the campaign's war room. A
 * token for a scenario this app does not play (a contested transfer, say,
 * pasted at the wrong app) gets told which app it wanted.
 */
const battleParam = params.get('battle');
let openingBattle: OrderOfBattle | null = null;
let openingBattleError: string | null = null;
if (battleParam !== null && battleParam !== '') {
  try {
    const order = decodeOrder(battleParam);
    if (scenarioById(order.scenarioId)) openingBattle = order;
    else {
      openingBattleError =
        order.scenarioId === 'contested-transfer'
          ? 'That order is a space battle — open it in the Triplanetary app.'
          : `That order is for "${order.scenarioId}", which this app does not play.`;
    }
  } catch (err) {
    openingBattleError = err instanceof Error ? err.message : 'the battle token does not decode';
  }
}

// ---------------------------------------------------------------------------
// The app
// ---------------------------------------------------------------------------

createApp({
  root,
  scenarios: SCENARIOS,

  buildScenario: (id, args) => {
    const scenario = scenarioById(id) ?? SCENARIOS[0]!;
    return scenario.build({
      seed: args.seed,
      options: args.options,
      order: args.order,
      setup: args.setup,
    });
  },

  createSession: (scenarioId, state): SessionPort => {
    const scenario = scenarioById(scenarioId) ?? SCENARIOS[0]!;
    const session = new GameSession(state, scenario.map, {
      victoryCheck: scenario.checkVictory,
    });
    // A deliberate hook, not a leak. It is the session, so everything still
    // goes through `applyCommand` and nothing here can make an illegal move —
    // but it makes a rules argument settleable from the browser console, and
    // it is what the screenshot scripts drive. `session.serialise()` in the
    // console is a complete, replayable bug report.
    (window as unknown as { ogre?: unknown }).ogre = { session, scenario };
    return session;
  },

  createRenderer: (canvas, map): RendererPort => new MapRenderer(canvas, map),

  randomSeed: () =>
    Number.isFinite(seedParam) && seedParam > 0
      ? seedParam >>> 0
      : // The shell may read the clock; the engine may not.
        (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,

  battle: battleGlue,
  campaignUrl: CAMPAIGN_URL,
  storage: {
    load: () => {
      try {
        return localStorage.getItem(SAVE_KEY);
      } catch {
        return null;
      }
    },
    save: (text) => {
      try {
        localStorage.setItem(SAVE_KEY, text);
      } catch {
        // Storage blocked: the battle simply is not saved.
      }
    },
    clear: () => {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        // Nothing to clear.
      }
    },
  },
  openingBattle,
  openingBattleError,
});

if (scenarioParam) {
  // Nothing to do beyond letting the picker default to it; the shell reads the
  // list itself. Kept explicit so the parameter is not silently ignored.
  const found = scenarioById(scenarioParam);
  if (!found) console.warn(`unknown scenario "${scenarioParam}"`);
}
