/**
 * The campaign screen — the shell that "can hold all three, and hand off
 * between them" (docs/CAMPAIGN.md, step 5).
 *
 * One sheet, rendered from `CampaignState` on every change, the same way the
 * battle panels render from `GameState`. It decides nothing: every order
 * leaves as a `CampaignCommand` through the handle, and a refusal comes back
 * as a toast in the campaign engine's own words.
 *
 * The two hand-offs look different on purpose. A **ground battle** is this
 * app's own game, so the primary verb is "fight it here" and the result flows
 * back without a copy-paste in sight. A **space battle** belongs to the
 * Triplanetary app, so it travels as a token: a link opens the battle over
 * there, and the result token comes home through a paste box. Both battles
 * also offer the token route, because the other player may be on another
 * machine entirely — the token *is* the protocol, and the buttons are just
 * conveniences over it.
 */

import { type Force, describeForce, forceIsEmpty, lotsOf } from '@campaign/convert.js';
import {
  type CampaignSideId,
  CAMPAIGN_SIDES,
  GROUND_CATALOGUE,
  SHIP_CATALOGUE,
  SITES,
  TOTAL_PRODUCTION,
  VICTORY_PRODUCTION,
  shipEntry,
  siteDef,
} from '@campaign/data.js';
import type { CampaignState, PendingOperation } from '@campaign/engine.js';
import type { OrderOfBattle } from '@campaign/orders.js';
import { button, el, row, setChildren } from './dom.js';
import type { CampaignDeps, CampaignHandle } from './ports.js';

export interface CampaignScreenHooks {
  close(): void;
  /** Start the pending ground battle in this app. */
  fight(order: OrderOfBattle): void;
  say(text: string, bad?: boolean): void;
  redraw(): void;
  newSeed(): number;
}

export interface CampaignScreen {
  render(modal: HTMLElement): void;
  /** Forget half-built composers (called when the sheet closes). */
  reset(): void;
}

export const createCampaignScreen = (
  deps: CampaignDeps,
  hooks: CampaignScreenHooks,
): CampaignScreen => {
  // --- Composer state: half-built orders that have not been given yet ------
  let activeSide: CampaignSideId = 'combine';
  let garrisonSite: string | null = null;
  let attack: {
    site: string;
    fleet: Record<string, number>;
    cargo: Record<string, number>;
  } | null = null;
  let interceptFleet: Record<string, number> = {};
  let pasteValue = '';
  let confirmAbandon = false;

  const reset = (): void => {
    garrisonSite = null;
    attack = null;
    interceptFleet = {};
    pasteValue = '';
    confirmAbandon = false;
  };

  const give = (
    handle: CampaignHandle,
    cmd: Parameters<CampaignHandle['dispatch']>[0],
  ): boolean => {
    const result = handle.dispatch(cmd);
    if (!result.ok) hooks.say(result.reason ?? 'The campaign refused that.', true);
    hooks.redraw();
    return result.ok;
  };

  const copy = (text: string): void => {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      hooks.say('Select the token and copy it by hand.', true);
      return;
    }
    clipboard.writeText(text).then(
      () => hooks.say('Copied.'),
      () => hooks.say('Select the token and copy it by hand.', true),
    );
  };

  const tokenBox = (value: string): HTMLTextAreaElement => {
    const box = el('textarea', { class: 'battle-token' });
    box.value = value;
    box.readOnly = true;
    box.rows = 3;
    box.addEventListener('focus', () => box.select());
    return box;
  };

  const pasteBox = (): HTMLTextAreaElement => {
    const box = el('textarea', { class: 'battle-token' });
    box.value = pasteValue;
    box.rows = 3;
    box.placeholder = 'Paste the battle result token here';
    box.addEventListener('input', () => {
      pasteValue = box.value;
    });
    return box;
  };

  const shipName = (id: string): string => shipEntry(id)?.name ?? id;

  const describeFleet = (fleet: Force): string => {
    const parts = Object.entries(fleet)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => `${shipName(id)} ×${n}`);
    return parts.length > 0 ? parts.join(', ') : 'nothing';
  };

  // --- Steppers: the +/- lines the composers are made of -------------------

  const stepper = (
    label: string,
    inPool: number,
    value: number,
    set: (n: number) => void,
  ): HTMLElement =>
    el(
      'div',
      { class: `gunline ${value > 0 ? 'on' : ''}`.trim() },
      el(
        'div',
        { class: 'gun-id' },
        el('span', { class: 'gun-name' }, label),
        el('span', { class: 'gun-stat' }, `${inPool} in the pool`),
      ),
      el(
        'div',
        { class: 'stepper' },
        button('−', () => set(value - 1), { class: 'step', disabled: value === 0 }),
        el('span', { class: 'count' }, `${value}`),
        button('+', () => set(value + 1), { class: 'step', disabled: value >= inPool }),
      ),
    );

  const forceSteppers = (
    pool: Force,
    chosen: Record<string, number>,
    label: (id: string) => string,
  ): HTMLElement[] =>
    Object.entries(pool)
      .filter(([, n]) => n > 0)
      .map(([id, n]) =>
        stepper(label(id), n, chosen[id] ?? 0, (value) => {
          chosen[id] = Math.max(0, Math.min(n, value));
          if (chosen[id] === 0) delete chosen[id];
          hooks.redraw();
        }),
      );

  // --- Cards ----------------------------------------------------------------

  const sideCard = (state: CampaignState, id: CampaignSideId): HTMLElement => {
    const def = CAMPAIGN_SIDES[id];
    const side = state.sides[id];
    const active = id === activeSide;

    const buys: HTMLElement[] = [];
    if (active && !state.victory) {
      buys.push(
        el(
          'div',
          { class: 'chips' },
          ...SHIP_CATALOGUE.map((s) =>
            button(
              `${s.name} ${s.pp}`,
              () => give(handleOrBust(), { type: 'buyShips', by: id, ship: s.id, count: 1 }),
              {
                class: 'chip',
                disabled: s.pp > side.production,
                title: s.lots > 0 ? `Lifts ${s.lots} lots` : 'No hold',
              },
            ),
          ),
        ),
        el(
          'div',
          { class: 'chips' },
          ...GROUND_CATALOGUE.map((g) =>
            button(
              `${g.name} ${g.pp}`,
              () => give(handleOrBust(), { type: 'buyGround', by: id, unit: g.id, count: 1 }),
              {
                class: 'chip',
                disabled: g.pp > side.production,
              },
            ),
          ),
        ),
      );
    }

    return el(
      'section',
      { class: `card campaign-side ${active ? 'on' : ''}`.trim() },
      el(
        'div',
        { class: 'card-head', style: `--accent:${def.color}` },
        el('span', { class: 'swatch' }),
        el('strong', {}, def.faction),
        el('span', { class: 'dim' }, `${side.production} PP`),
      ),
      row('Fleet', describeFleet(side.fleet)),
      row('Ground pool', describeForce(side.ground)),
      ...buys,
    );
  };

  const siteRows = (state: CampaignState): HTMLElement[] =>
    SITES.map((def) => {
      const site = state.sites[def.id]!;
      const holder = site.holder ? CAMPAIGN_SIDES[site.holder] : null;
      const actions: HTMLElement[] = [];
      if (!state.victory && !state.pending) {
        if (site.holder === activeSide) {
          actions.push(
            button(
              'Reinforce',
              () => {
                garrisonSite = garrisonSite === def.id ? null : def.id;
                attack = null;
                hooks.redraw();
              },
              { class: 'chip' },
            ),
          );
        } else {
          actions.push(
            button(
              'Invade',
              () => {
                attack = attack?.site === def.id ? null : { site: def.id, fleet: {}, cargo: {} };
                garrisonSite = null;
                hooks.redraw();
              },
              { class: 'chip' },
            ),
          );
        }
      }
      return el(
        'div',
        { class: 'campaign-site' },
        el(
          'div',
          { class: 'campaign-site-name' },
          el('strong', {}, def.name),
          el('span', { class: 'dim' }, `${def.production} PP/turn`),
        ),
        el(
          'div',
          { class: 'campaign-site-hold' },
          holder
            ? el('span', { class: 'holder', style: `--accent:${holder.color}` }, holder.name)
            : el('span', { class: 'dim' }, 'unclaimed'),
          el(
            'span',
            { class: 'dim' },
            forceIsEmpty(site.garrison) ? 'no garrison' : describeForce(site.garrison),
          ),
        ),
        el('div', { class: 'campaign-site-actions' }, ...actions),
      );
    });

  const garrisonComposer = (state: CampaignState): HTMLElement | null => {
    if (!garrisonSite) return null;
    const site = state.sites[garrisonSite];
    if (!site || site.holder !== activeSide) {
      garrisonSite = null;
      return null;
    }
    const pool = state.sides[activeSide].ground;
    return el(
      'section',
      { class: 'card' },
      el(
        'div',
        { class: 'card-head' },
        el('strong', {}, `Reinforce ${siteDef(garrisonSite)?.name ?? garrisonSite}`),
      ),
      el(
        'p',
        { class: 'note' },
        'Shipping between friendly ports is below the campaign’s resolution: only contested transfers are fought.',
      ),
      row('Garrison', describeForce(site.garrison)),
      ...Object.entries(pool)
        .filter(([, n]) => n > 0)
        .map(([id, n]) =>
          button(`Send 1 ${id} (${n} in the pool)`, () =>
            give(handleOrBust(), {
              type: 'garrison',
              by: activeSide,
              site: garrisonSite!,
              unit: id,
              count: 1,
            }),
          ),
        ),
      button(
        'Done',
        () => {
          garrisonSite = null;
          hooks.redraw();
        },
        { class: 'primary' },
      ),
    );
  };

  const attackComposer = (state: CampaignState): HTMLElement | null => {
    if (!attack) return null;
    const composing = attack;
    const side = state.sides[activeSide];
    const lift = Object.entries(composing.fleet).reduce(
      (n, [id, count]) => n + (shipEntry(id)?.lots ?? 0) * count,
      0,
    );
    const need = lotsOf(composing.cargo);
    return el(
      'section',
      { class: 'card' },
      el(
        'div',
        { class: 'card-head' },
        el('strong', {}, `Invade ${siteDef(composing.site)?.name ?? composing.site}`),
      ),
      el('h3', {}, 'The convoy'),
      ...forceSteppers(side.fleet, composing.fleet, shipName),
      el('h3', {}, 'The landing force'),
      ...forceSteppers(side.ground, composing.cargo, (id) => id),
      row('Lift', `${lift} lots for ${need} needed`, lift < need ? 'warn' : ''),
      el(
        'div',
        { class: 'sheet-actions' },
        button(
          'Launch the offensive',
          () => {
            if (
              give(handleOrBust(), {
                type: 'launchOffensive',
                by: activeSide,
                site: composing.site,
                fleet: { ...composing.fleet },
                cargo: { ...composing.cargo },
              })
            ) {
              attack = null;
            }
          },
          { class: 'primary' },
        ),
        button('Never mind', () => {
          attack = null;
          hooks.redraw();
        }),
      ),
    );
  };

  const pendingCard = (state: CampaignState, pending: PendingOperation): HTMLElement => {
    const siteName = siteDef(pending.site)?.name ?? pending.site;
    const attacker = CAMPAIGN_SIDES[pending.attacker];
    const kids: HTMLElement[] = [];

    if (pending.stage === 'intercept') {
      const defenderId = state.sites[pending.site]!.holder!;
      const defender = CAMPAIGN_SIDES[defenderId];
      kids.push(
        el(
          'p',
          { class: 'note' },
          `${attacker.faction} is inbound for ${siteName} with ${describeForce(pending.cargo)} aboard. ` +
            `The decision is ${defender.faction}'s: come out to meet it, or let it land.`,
        ),
        ...forceSteppers(state.sides[defenderId].fleet, interceptFleet, shipName),
        el(
          'div',
          { class: 'sheet-actions' },
          button(
            'Intercept',
            () => {
              if (
                give(handleOrBust(), {
                  type: 'intercept',
                  by: defenderId,
                  fleet: { ...interceptFleet },
                })
              ) {
                interceptFleet = {};
              }
            },
            { class: 'primary' },
          ),
          button('Let it pass', () => give(handleOrBust(), { type: 'stand', by: defenderId })),
        ),
      );
    } else {
      const order = pending.order!;
      const inThisApp = pending.stage === 'ground';
      kids.push(
        el(
          'p',
          { class: 'note' },
          inThisApp
            ? `The landing on ${siteName} is a battle for this app: ${describeForce(pending.landed ?? {})} ` +
                `against the garrison. Fight it here, or carry the order token to another machine.`
            : `The convoy action off ${siteName} is a battle for the Triplanetary app. ` +
                `Open it there — or copy the order token to whoever flies it — and paste the result back.`,
        ),
      );
      if (inThisApp) {
        kids.push(button('Fight it here', () => hooks.fight(order), { class: 'primary' }));
      } else {
        const url = deps.triplanetaryUrl(order);
        const link = el('a', { class: 'btn primary' }, 'Open in Triplanetary');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        kids.push(link);
      }
      const token = deps.orderToken(order);
      kids.push(
        el('h3', {}, 'The order'),
        tokenBox(token),
        button('Copy the order', () => copy(token)),
        el('h3', {}, 'The result'),
        pasteBox(),
        button(
          'Report the result',
          () => {
            try {
              const result = deps.parseResult(pasteValue);
              if (give(handleOrBust(), { type: 'reportBattle', result })) pasteValue = '';
            } catch (err) {
              hooks.say(err instanceof Error ? err.message : 'that token does not parse', true);
            }
          },
          { class: 'primary' },
        ),
      );
    }

    return el(
      'section',
      { class: 'card' },
      el(
        'div',
        { class: 'card-head' },
        el(
          'strong',
          {},
          pending.stage === 'ground' ? `The landing on ${siteName}` : `The transfer to ${siteName}`,
        ),
      ),
      ...kids,
    );
  };

  const logCard = (state: CampaignState): HTMLElement =>
    el(
      'section',
      { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, 'The ledger')),
      el(
        'ol',
        { class: 'log campaign-log' },
        ...state.log
          .slice(-12)
          .reverse()
          .map((entry) =>
            el(
              'li',
              { class: `log-${entry.severity}` },
              el('span', { class: 'log-turn' }, `T${entry.turn}`),
              entry.text,
            ),
          ),
      ),
    );

  // --- The sheet ------------------------------------------------------------

  let current: CampaignHandle | null = null;
  const handleOrBust = (): CampaignHandle => {
    if (!current) throw new Error('no campaign is running');
    return current;
  };

  const introSheet = (): HTMLElement =>
    el(
      'div',
      { class: 'sheet wide' },
      el('h1', {}, 'Two games, one war'),
      el(
        'p',
        { class: 'lede' },
        'Triplanetary decides who gets to the ground; Ogre decides what happens when they land. ' +
          'The campaign holds the map of objectives, launches the battles, and reads the results back.',
      ),
      el(
        'p',
        {},
        `Two thirds of the off-world production (${VICTORY_PRODUCTION} of ${TOTAL_PRODUCTION} PP) wins the war. ` +
          'Ground battles are fought here; contested transfers open in the Triplanetary app and come home as a pasted token. ' +
          'The campaign saves itself in this browser after every order.',
      ),
      el(
        'div',
        { class: 'sheet-actions' },
        button(
          'Begin the war',
          () => {
            deps.start(hooks.newSeed());
            reset();
            hooks.redraw();
          },
          { class: 'primary' },
        ),
        button('Back', () => hooks.close()),
      ),
    );

  const render = (modal: HTMLElement): void => {
    current = deps.current();
    modal.className = 'modal';
    if (!current) {
      setChildren(modal, introSheet());
      return;
    }
    const state = current.state;

    const sideChips = el(
      'div',
      { class: 'chips' },
      ...(['combine', 'paneuro'] as const).map((id) =>
        button(
          `Playing: ${CAMPAIGN_SIDES[id].name}`,
          () => {
            activeSide = id;
            garrisonSite = null;
            attack = null;
            hooks.redraw();
          },
          { class: activeSide === id ? 'chip on' : 'chip' },
        ),
      ),
    );

    setChildren(
      modal,
      el(
        'div',
        { class: 'sheet wide campaign' },
        el('h1', {}, 'Two games, one war'),
        el(
          'p',
          { class: 'lede' },
          state.victory
            ? state.victory.reason
            : `Turn ${state.turn}. Hold ${VICTORY_PRODUCTION} of ${TOTAL_PRODUCTION} PP of production to win. ` +
                'Hot seat: pick whose orders you are giving, then pass the keyboard.',
        ),
        sideChips,
        el(
          'div',
          { class: 'campaign-sides' },
          sideCard(state, 'combine'),
          sideCard(state, 'paneuro'),
        ),
        el(
          'section',
          { class: 'card' },
          el('div', { class: 'card-head' }, el('strong', {}, 'The map of objectives')),
          ...siteRows(state),
        ),
        garrisonComposer(state),
        attackComposer(state),
        state.pending ? pendingCard(state, state.pending) : null,
        logCard(state),
        el(
          'div',
          { class: 'sheet-actions' },
          button('End the turn', () => give(handleOrBust(), { type: 'endTurn' }), {
            class: 'primary',
            disabled: !!state.pending || !!state.victory,
            title: state.pending ? 'A battle is being fought' : '',
          }),
          button(
            'Undo',
            () => {
              handleOrBust().undo();
              hooks.redraw();
            },
            { disabled: !current.canUndo },
          ),
          button('Close', () => hooks.close()),
          button(
            confirmAbandon ? 'Really abandon the war?' : 'Abandon the war',
            () => {
              if (!confirmAbandon) {
                confirmAbandon = true;
                hooks.redraw();
                return;
              }
              deps.abandon();
              reset();
              hooks.redraw();
            },
            { class: 'danger' },
          ),
        ),
      ),
    );
  };

  return { render, reset };
};
