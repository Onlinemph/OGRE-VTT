/**
 * The only file that wires the concrete pieces together.
 *
 * `createApp` is written against the ports in `ui/ports.ts`; this is where they
 * meet `GameSession`, `MapRenderer`, the scenario table — and now the campaign:
 * `CampaignSession`, the codec, and the `localStorage` slot the war saves
 * itself into. It is also the only file that reads the environment or the
 * address bar.
 */

/// <reference types="vite/client" />

import './styles.css';

import { GameSession } from '@net/session.js';
import { MapRenderer } from '@render/renderer.js';
import { SCENARIOS, scenarioById } from '@scenarios/index.js';
import { decodeOrder, decodeResult, encodeOrder, encodeResult } from '@campaign/codec.js';
import { type OrderOfBattle, orderOf } from '@campaign/orders.js';
import { readBattleResult } from '@campaign/result.js';
import { CampaignSession } from '@campaign/session.js';
import { createApp } from '@ui/app.js';
import type { CampaignDeps, CampaignHandle, RendererPort, SessionPort } from '@ui/ports.js';

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
// The campaign
// ---------------------------------------------------------------------------

/**
 * Where the deployed Triplanetary app lives, for the "Open in Triplanetary"
 * link on a space battle. Overridable at build time for forks and local
 * hacking; the token in the link works against any copy of the app.
 */
const TRIPLANETARY_URL =
  (import.meta.env.VITE_TRIPLANETARY_URL as string | undefined)?.trim() ||
  'https://onlinemph.github.io/Triplanetary-VTT/';

const CAMPAIGN_KEY = 'ogre-campaign-v1';

let campaign: CampaignSession | null = null;
let campaignLoaded = false;

/** Save after every accepted order. A campaign file is a seed and a log. */
const persist = (session: CampaignSession): void => {
  if (session !== campaign) return; // an abandoned war must not resurrect itself
  try {
    localStorage.setItem(CAMPAIGN_KEY, session.serialise());
  } catch {
    // Storage full or blocked; the war still runs, it just will not survive
    // the tab. The screen says the campaign saves itself, so warn once.
    console.warn('the campaign could not be saved to localStorage');
  }
};

const adopt = (session: CampaignSession): CampaignSession => {
  session.subscribe(() => persist(session));
  persist(session);
  return session;
};

const loadCampaign = (): CampaignSession | null => {
  if (campaignLoaded) return campaign;
  campaignLoaded = true;
  try {
    const raw = localStorage.getItem(CAMPAIGN_KEY);
    campaign = raw == null ? null : adopt(CampaignSession.deserialise(raw));
  } catch (err) {
    console.warn('the saved campaign would not load', err);
    campaign = null;
  }
  return campaign;
};

const handleOf = (session: CampaignSession): CampaignHandle => ({
  get state() {
    return session.state;
  },
  get canUndo() {
    return session.canUndo;
  },
  dispatch: (cmd) => session.dispatch(cmd),
  subscribe: (fn) => session.subscribe(fn),
  undo: () => session.undo(),
});

const campaignDeps: CampaignDeps = {
  current: () => {
    const session = loadCampaign();
    return session ? handleOf(session) : null;
  },
  start: (seed) => {
    campaignLoaded = true;
    campaign = adopt(new CampaignSession(seed));
    return handleOf(campaign);
  },
  abandon: () => {
    campaignLoaded = true;
    campaign = null;
    try {
      localStorage.removeItem(CAMPAIGN_KEY);
    } catch {
      // Nothing to do: with storage blocked there was nothing saved either.
    }
  },
  orderToken: (order) => encodeOrder(order),
  triplanetaryUrl: (order) => {
    const url = new URL(TRIPLANETARY_URL);
    url.searchParams.set('battle', encodeOrder(order));
    return url.toString();
  },
  parseResult: (text) => decodeResult(text),
  resultFor: (state, log) => (orderOf(state.scenarioData) ? readBattleResult(state, log) : null),
  resultToken: (result) => encodeResult(result),
};

/**
 * A `?battle=` token is a ground battle sent from a campaign — usually on
 * another machine, since the campaign on *this* machine starts its battles
 * with a button. A token for a scenario this app does not play (a contested
 * transfer, say, pasted at the wrong app) gets told which app it wanted.
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
    return scenario.build({ seed: args.seed, options: args.options, order: args.order });
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

  campaign: campaignDeps,
  openingBattle,
  openingBattleError,
});

if (scenarioParam) {
  // Nothing to do beyond letting the picker default to it; the shell reads the
  // list itself. Kept explicit so the parameter is not silently ignored.
  const found = scenarioById(scenarioParam);
  if (!found) console.warn(`unknown scenario "${scenarioParam}"`);
}
