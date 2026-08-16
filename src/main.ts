/**
 * The only file that wires the concrete pieces together.
 *
 * `createApp` is written against the ports in `ui/ports.ts`; this is where they
 * meet `GameSession`, `MapRenderer` and the scenario table.
 */

import './styles.css';

import { GameSession } from '@net/session.js';
import { MapRenderer } from '@render/renderer.js';
import { SCENARIOS, scenarioById } from '@scenarios/index.js';
import { createApp } from '@ui/app.js';
import type { RendererPort, SessionPort } from '@ui/ports.js';

const root = document.getElementById('root');
if (!root) throw new Error('no #root to mount on');

/**
 * A seed from the URL makes a battle shareable — and, when two browser tabs
 * are linked over BroadcastChannel, it is what makes them the same game.
 */
const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const scenarioParam = params.get('scenario');

createApp({
  root,
  scenarios: SCENARIOS,

  buildScenario: (id, args) => {
    const scenario = scenarioById(id) ?? SCENARIOS[0]!;
    return scenario.build({ seed: args.seed, options: args.options });
  },

  createSession: (scenarioId, state): SessionPort => {
    const scenario = scenarioById(scenarioId) ?? SCENARIOS[0]!;
    return new GameSession(state, scenario.map, { victoryCheck: scenario.checkVictory });
  },

  createRenderer: (canvas, map): RendererPort => new MapRenderer(canvas, map),

  randomSeed: () =>
    Number.isFinite(seedParam) && seedParam > 0
      ? seedParam >>> 0
      : // The shell may read the clock; the engine may not.
        (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
});

if (scenarioParam) {
  // Nothing to do beyond letting the picker default to it; the shell reads the
  // list itself. Kept explicit so the parameter is not silently ignored.
  const found = scenarioById(scenarioParam);
  if (!found) console.warn(`unknown scenario "${scenarioParam}"`);
}
