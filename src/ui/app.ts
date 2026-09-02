/**
 * The shell: the scenario picker, and the battle view mounted under it.
 *
 * The game itself is `battle.ts` — the same view the companion Triplanetary
 * app embeds. What lives here is the standalone app's chrome: choosing a
 * scenario and the seats, the seed, a `?battle=` token off the address bar,
 * and the one battle this browser keeps between visits. Replace this file
 * and the game is unchanged.
 */

import type { OrderOfBattle } from '@campaign/orders.js';
import type { Command } from '@engine/commands.js';
import { createOgreBattle, type OgreBattle, type OgreBattleSource } from './battle.js';
import { button, el, setChildren } from './dom.js';
import type { AppDeps } from './ports.js';

/** What the browser remembers: enough to rebuild the board and replay the log. */
interface BattleSave {
  readonly v: 1;
  readonly source: OgreBattleSource;
  readonly ai: readonly string[];
  readonly setup: boolean;
  readonly log: readonly unknown[];
  readonly name: string;
  readonly turn: number;
}

export const createApp = (deps: AppDeps): void => {
  const { root } = deps;

  let scenarioId = deps.scenarios[0]!.id;
  let seed = deps.randomSeed();
  /** The seat the computer plays, by index in the turn order; null is hot seat. */
  let computer: number | null = null;
  let battle: OgreBattle | null = null;

  const scenario = (): (typeof deps.scenarios)[number] =>
    deps.scenarios.find((s) => s.id === scenarioId) ?? deps.scenarios[0]!;

  // ---------------------------------------------------------------------
  // The save
  // ---------------------------------------------------------------------

  const readSave = (): BattleSave | null => {
    const raw = deps.storage?.load() ?? null;
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as BattleSave;
      return parsed && parsed.v === 1 && Array.isArray(parsed.log) ? parsed : null;
    } catch {
      return null;
    }
  };

  const progressOf =
    (source: OgreBattleSource, ai: readonly string[], setup: boolean) =>
    (log: readonly Command[], info: { scenarioName: string; turn: number; finished: boolean }) => {
      if (!deps.storage) return;
      if (info.finished) {
        deps.storage.clear();
        return;
      }
      const save: BattleSave = {
        v: 1,
        source,
        ai,
        setup,
        log,
        name: info.scenarioName,
        turn: info.turn,
      };
      deps.storage.save(JSON.stringify(save));
    };

  // ---------------------------------------------------------------------
  // Mounting a battle
  // ---------------------------------------------------------------------

  const mount = (
    source: OgreBattleSource,
    ai: readonly string[],
    resume: BattleSave | null = null,
  ): void => {
    battle?.destroy();
    const setup = resume ? resume.setup : true;
    battle = createOgreBattle({
      host: root,
      deps,
      battle: source,
      ai,
      setup,
      ...(resume ? { resume: resume.log as readonly Command[] } : {}),
      onProgress: progressOf(source, ai, setup),
      onExit: () => {
        battle?.destroy();
        battle = null;
        renderPicker();
      },
    });
  };

  const startGame = (): void => {
    const def = scenario();
    // The seat the picker chose is an index into the turn order; the built
    // board says whose id that is.
    const built = deps.buildScenario(def.id, { seed });
    const seat = computer !== null ? built.playerOrder[computer] : undefined;
    mount({ kind: 'scenario', id: def.id, seed }, seat !== undefined ? [seat] : []);
  };

  /**
   * Start a battle that arrived from the campaign — which lives in the
   * companion Triplanetary app — as a `?battle=` token. The order decides the
   * scenario, the seed and both forces; the shell's only job is to build it
   * and put the board up.
   */
  const startBattle = (order: OrderOfBattle): void => {
    try {
      deps.buildScenario(order.scenarioId, { seed: order.seed, order });
    } catch (err) {
      renderPicker(err instanceof Error ? err.message : 'that order does not build');
      return;
    }
    scenarioId = order.scenarioId;
    mount({ kind: 'order', order }, []);
  };

  // ---------------------------------------------------------------------
  // The picker
  // ---------------------------------------------------------------------

  /** Who sits where: hot seat, or you in one seat and the computer in the other. */
  const seatChoices = (
    sides: readonly string[],
  ): { label: string; title: string; computer: number | null }[] => {
    const [first, second] = sides;
    const a = first ?? 'the first seat';
    const b = second ?? 'the second seat';
    return [
      { label: 'Hot seat', title: 'Both seats at this keyboard', computer: null },
      { label: `Play ${a}`, title: `The computer plays ${b}`, computer: 1 },
      { label: `Play ${b}`, title: `The computer plays ${a}`, computer: 0 },
    ];
  };

  /** The door to the war room, which lives in the companion app. */
  const campaignLink = (): HTMLAnchorElement => {
    const link = el('a', { class: 'btn chip on' }, 'Open the war room (Triplanetary)');
    link.href = deps.campaignUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  };

  const renderPicker = (complaint: string | null = null): void => {
    const def = scenario();
    const built = deps.buildScenario(def.id, { seed: 1 });
    const sides = built.playerOrder.map((p) => built.players[p]?.name ?? p);
    const saved = readSave();

    const modal = el('div', { class: 'modal' });
    setChildren(
      modal,
      el(
        'div',
        { class: 'sheet wide' },
        el('h1', {}, 'Ogre'),
        el(
          'p',
          { class: 'lede' },
          'A cybernetic supertank against an armour battalion and the command post it is guarding.',
        ),
        complaint ? el('p', { class: 'empty bad' }, complaint) : null,
        saved
          ? el(
              'div',
              { class: 'chips' },
              el('span', { class: 'dim' }, `Battle in progress: ${saved.name}, turn ${saved.turn}`),
              button(
                'Resume',
                () => mount(saved.source, saved.ai, saved),
                { class: 'chip on' },
              ),
              button(
                'Discard',
                () => {
                  deps.storage?.clear();
                  renderPicker();
                },
                { class: 'chip' },
              ),
            )
          : null,
        el(
          'div',
          { class: 'scenario-list' },
          ...deps.scenarios.map((s) =>
            el(
              'button',
              {
                class: `scenario ${s.id === scenarioId ? 'on' : ''}`.trim(),
                onClick: () => {
                  scenarioId = s.id;
                  renderPicker();
                },
              },
              el('strong', {}, s.name),
              el('span', { class: 'dim' }, s.blurb),
            ),
          ),
        ),
        el('h3', {}, 'Seats'),
        el(
          'div',
          { class: 'chips' },
          ...seatChoices(sides).map((choice) =>
            button(
              choice.label,
              () => {
                computer = choice.computer;
                renderPicker();
              },
              { class: computer === choice.computer ? 'chip on' : 'chip', title: choice.title },
            ),
          ),
        ),
        el('h3', {}, 'Two games, one war'),
        el(
          'p',
          {},
          'This game is linked with its companion, Triplanetary-VTT: a campaign over the ' +
            'inner system where the space game decides who gets to the ground and this one ' +
            'decides what happens when they land. The war room lives in the Triplanetary ' +
            'app — its landings arrive here as battle tokens, and The Landing and The Assault ' +
            'below are the scenarios they build.',
        ),
        el('div', { class: 'chips' }, campaignLink()),
        el('h3', {}, 'Briefing'),
        ...def.briefing.split('\n\n').map((p) => el('p', {}, p)),
        el('h3', {}, 'Victory'),
        el('ul', { class: 'victory' }, ...def.victoryConditions.map((c) => el('li', {}, c))),
        el(
          'div',
          { class: 'sheet-actions' },
          el(
            'label',
            { class: 'seed' },
            'Seed',
            el('input', {
              type: 'number',
              value: String(seed),
              onChange: (event) => {
                const v = Number((event.target as HTMLInputElement).value);
                if (Number.isFinite(v)) seed = v >>> 0;
              },
            }),
          ),
          button('Reroll', () => {
            seed = deps.randomSeed();
            renderPicker();
          }),
          button('Take the field', () => startGame(), { class: 'primary' }),
        ),
      ),
    );
    setChildren(root, modal);
  };

  // Kick off. A `?battle=` token on the address bar is an instruction — the
  // campaign sent somebody here to fight — so it outranks the picker; a token
  // that would not decode still gets a sentence, because a dead parameter
  // wants an explanation.
  if (deps.openingBattle) {
    startBattle(deps.openingBattle);
  } else {
    renderPicker(
      deps.openingBattleError != null && deps.openingBattleError !== ''
        ? deps.openingBattleError
        : null,
    );
  }
};
