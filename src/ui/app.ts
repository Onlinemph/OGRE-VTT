/**
 * The shell: panels, pointer and keyboard bindings, and the one-way loop
 *
 *     command → session.dispatch → subscribe → render(panels + map)
 *
 * The interface decides nothing. Every legality question — where a unit may go,
 * what a shot is worth, whether a ram is allowed — is asked of the engine
 * (`reachable`, `previewAttack`, `canRam`), and every change leaves as a
 * `Command`. Replace this file and the game is unchanged.
 */

import { type Hex, eq, label as hexLabel } from '@engine/hex.js';
import { terrainAt } from '@engine/map.js';
import { TERRAIN_LABELS } from '@engine/terrain.js';
import { OGRE_WEAPONS, movementForTreads, ogreType } from '@engine/ogres.js';
import { unitClass } from '@engine/units.js';
import { describeOdds, oddsChance } from '@engine/crt.js';
import {
  type AttackerRef,
  type GameState,
  type OgreUnit,
  type TargetRef,
  type Unit,
  type UnitId,
  PHASE_LABELS,
  activePlayer,
  isOgre,
  onBoard,
  unitsAt,
} from '@engine/types.js';
import { isFireable, movementAllowance, unitName } from '@engine/state.js';
import { reachable } from '@engine/movement.js';
import { canStillFire, previewAttack } from '@engine/combat.js';
import { canRam } from '@engine/ram.js';
import type { ReachHint, RenderView } from '@render/renderer.js';
import { EMPTY_VIEW } from '@render/renderer.js';
import { button, el, row, setChildren } from './dom.js';
import type { AppDeps, RendererPort, SessionPort } from './ports.js';

interface UiState {
  selected: UnitId | null;
  hover: Hex | null;
  attackers: AttackerRef[];
  target: TargetRef | null;
  showHexNumbers: boolean;
  helpOpen: boolean;
  pickerOpen: boolean;
}

export const createApp = (deps: AppDeps): void => {
  const { root } = deps;

  let session: SessionPort | null = null;
  let renderer: RendererPort | null = null;
  let scenarioId = deps.scenarios[0]!.id;
  let seed = deps.randomSeed();
  let unsubscribe: (() => void) | null = null;

  const ui: UiState = {
    selected: null,
    hover: null,
    attackers: [],
    target: null,
    showHexNumbers: false,
    helpOpen: false,
    pickerOpen: true,
  };

  // ---------------------------------------------------------------------
  // Chrome
  // ---------------------------------------------------------------------

  const canvas = el('canvas', { class: 'map' });
  const topbar = el('header', { class: 'topbar' });
  const ordersPanel = el('aside', { class: 'panel orders' });
  const logPanel = el('aside', { class: 'panel logbook' });
  const modal = el('div', { class: 'modal hidden' });
  const toast = el('div', { class: 'toast hidden' });

  setChildren(
    root,
    el('div', { class: 'shell' }, topbar, canvas, ordersPanel, logPanel, toast),
    modal,
  );

  let toastTimer = 0;
  const say = (text: string, bad = false): void => {
    toast.textContent = text;
    toast.className = `toast ${bad ? 'bad' : ''}`.trim();
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 3200);
  };

  const scenario = (): (typeof deps.scenarios)[number] =>
    deps.scenarios.find((s) => s.id === scenarioId) ?? deps.scenarios[0]!;

  // ---------------------------------------------------------------------
  // New game
  // ---------------------------------------------------------------------

  const startGame = (): void => {
    unsubscribe?.();
    const def = scenario();
    const state = deps.buildScenario(def.id, { seed });
    session = deps.createSession(def.id, state);
    renderer = deps.createRenderer(canvas, def.map);
    ui.selected = null;
    ui.attackers = [];
    ui.target = null;
    unsubscribe = session.subscribe(() => draw());
    resize();
    draw();
  };

  // ---------------------------------------------------------------------
  // Derived reads
  // ---------------------------------------------------------------------

  const me = (): string => (session ? activePlayer(session.state) : '');

  const selectedUnit = (): Unit | null => {
    if (!session || !ui.selected) return null;
    const u = session.state.units[ui.selected];
    return u && onBoard(u) ? u : null;
  };

  const reachHints = (): ReachHint[] => {
    const s = session;
    const u = selectedUnit();
    if (!s || !u || u.owner !== me()) return [];
    if (s.state.phase !== 'movement' && s.state.phase !== 'gevMovement') return [];
    return reachable(s.state, s.map, u).map((r) => ({
      hex: r.hex,
      cost: r.cost,
      hazard: r.hazard,
    }));
  };

  const ramHints = (): Hex[] => {
    const s = session;
    const u = selectedUnit();
    if (!s || !u || u.owner !== me()) return [];
    if (s.state.phase !== 'movement' && s.state.phase !== 'gevMovement') return [];
    const out: Hex[] = [];
    for (const other of Object.values(s.state.units)) {
      if (!onBoard(other) || other.owner === u.owner) continue;
      if (out.some((h) => eq(h, other.pos))) continue;
      if (canRam(s.state, s.map, u, other.pos).ok) out.push(other.pos);
    }
    return out;
  };

  const pathTo = (h: Hex): Hex[] | null => {
    const s = session;
    const u = selectedUnit();
    if (!s || !u) return null;
    const found = reachable(s.state, s.map, u).find((r) => eq(r.hex, h));
    return found ? [...found.path] : null;
  };

  // ---------------------------------------------------------------------
  // Pointer
  // ---------------------------------------------------------------------

  let dragging = false;
  let dragMoved = false;
  let lastPointer = { x: 0, y: 0 };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 1 || event.button === 2 || event.shiftKey) {
      dragging = true;
      dragMoved = false;
      lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (dragging && renderer) {
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
      lastPointer = { x: event.clientX, y: event.clientY };
      renderer.panBy(dx, dy);
      draw();
      return;
    }
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    const h = renderer.screenToHex(event.clientX - rect.left, event.clientY - rect.top);
    if (!ui.hover || !eq(ui.hover, h)) {
      ui.hover = h;
      draw();
    }
  });

  canvas.addEventListener('pointerup', (event) => {
    if (dragging) {
      dragging = false;
      canvas.releasePointerCapture(event.pointerId);
      if (dragMoved) return;
    }
    if (event.button !== 0) return;
    if (!renderer || !session) return;
    const rect = canvas.getBoundingClientRect();
    onClickHex(renderer.screenToHex(event.clientX - rect.left, event.clientY - rect.top));
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!renderer) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      renderer.zoomAt(
        event.clientX - rect.left,
        event.clientY - rect.top,
        event.deltaY < 0 ? 1.12 : 1 / 1.12,
      );
      draw();
    },
    { passive: false },
  );

  const onClickHex = (h: Hex): void => {
    const s = session;
    if (!s) return;
    const here = unitsAt(s.state, h);
    const mine = here.filter((u) => u.owner === me());
    const theirs = here.filter((u) => u.owner !== me());
    const phase = s.state.phase;

    if (phase === 'fire') {
      if (mine.length > 0 && (!ui.selected || !mine.some((u) => u.id === ui.selected))) {
        ui.selected = mine[0]!.id;
        ui.target = null;
        ui.attackers = defaultAttackers(mine[0]!);
        draw();
        return;
      }
      if (theirs.length > 0) {
        const t = theirs[0]!;
        ui.target = isOgre(t) ? { kind: 'ogreTreads', unit: t.id } : { kind: 'unit', unit: t.id };
        draw();
        return;
      }
      return;
    }

    // Movement phases.
    const selected = selectedUnit();
    if (selected && selected.owner === me()) {
      if (ramHints().some((r) => eq(r, h))) {
        dispatch({ type: 'ram', by: me(), unit: selected.id, target: h });
        return;
      }
      const path = pathTo(h);
      if (path && path.length > 0) {
        dispatch({ type: 'moveUnit', by: me(), unit: selected.id, path });
        return;
      }
    }
    if (mine.length > 0) {
      const current = mine.findIndex((u) => u.id === ui.selected);
      ui.selected = mine[(current + 1) % mine.length]!.id;
    } else if (here.length > 0) {
      ui.selected = here[0]!.id;
    } else {
      ui.selected = null;
    }
    draw();
  };

  const defaultAttackers = (u: Unit): AttackerRef[] => {
    if (!isOgre(u)) return [{ unit: u.id }];
    return [];
  };

  const dispatch = (cmd: Parameters<SessionPort['dispatch']>[0]): void => {
    const s = session;
    if (!s) return;
    const result = s.dispatch(cmd);
    if (!result.ok) say(result.reason, true);
    draw();
  };

  // ---------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    switch (event.key) {
      case ' ':
        event.preventDefault();
        endPhase();
        break;
      case 'u':
        session?.undo();
        draw();
        break;
      case 'h':
        ui.helpOpen = !ui.helpOpen;
        draw();
        break;
      case 'n':
        ui.pickerOpen = true;
        draw();
        break;
      case '#':
        ui.showHexNumbers = !ui.showHexNumbers;
        draw();
        break;
      case 'f':
        renderer?.fitMap();
        draw();
        break;
      case 'Escape':
        ui.selected = null;
        ui.target = null;
        ui.attackers = [];
        ui.helpOpen = false;
        draw();
        break;
      default:
        break;
    }
  });

  const endPhase = (): void => {
    if (!session) return;
    ui.attackers = [];
    ui.target = null;
    dispatch({ type: 'endPhase', by: me() });
  };

  window.addEventListener('resize', () => {
    resize();
    draw();
  });

  const resize = (): void => {
    renderer?.resize();
    renderer?.setViewInset({ top: 56, right: 300, bottom: 0, left: 300 });
  };

  // ---------------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------------

  const draw = (): void => {
    if (!session || !renderer) {
      renderPicker();
      return;
    }
    const state = session.state;
    const view: RenderView = {
      ...EMPTY_VIEW,
      selected: ui.selected,
      hover: ui.hover,
      reachable: reachHints(),
      ramTargets: ramHints(),
      fireTargets: state.phase === 'fire' ? fireTargets(state) : [],
      attackers: ui.attackers.map((a) => a.unit),
      focus: [],
      showHexNumbers: ui.showHexNumbers,
      viewer: me(),
    };
    renderer.render(state, view);
    renderTopbar(state);
    renderOrders(state);
    renderLog(state);
    renderModal(state);
  };

  const fireTargets = (state: GameState): UnitId[] => {
    const shooters = ui.attackers.length > 0 ? ui.attackers : shootersFromSelection();
    if (shooters.length === 0) return [];
    const out: UnitId[] = [];
    for (const t of Object.values(state.units)) {
      if (!onBoard(t) || t.owner === me()) continue;
      const target: TargetRef = isOgre(t)
        ? { kind: 'ogreTreads', unit: t.id }
        : { kind: 'unit', unit: t.id };
      if (previewAttack(state, session!.map, shooters, target).ok) out.push(t.id);
    }
    return out;
  };

  const shootersFromSelection = (): AttackerRef[] => {
    const u = selectedUnit();
    if (!u || u.owner !== me()) return [];
    if (isOgre(u)) return [];
    return canStillFire(session!.state, u) ? [{ unit: u.id }] : [];
  };

  // ---------------------------------------------------------------------
  // Topbar
  // ---------------------------------------------------------------------

  const renderTopbar = (state: GameState): void => {
    const player = state.players[activePlayer(state)]!;
    setChildren(
      topbar,
      el(
        'div',
        { class: 'brand' },
        el('span', { class: 'brand-mark' }, 'OGRE'),
        el('span', { class: 'brand-sub' }, scenario().name),
      ),
      el(
        'div',
        { class: 'turnline' },
        el('span', { class: 'turn' }, `Turn ${state.turn}`),
        el('span', { class: 'player', style: `--accent:${player.color}` }, player.name),
        el('span', { class: 'phase' }, PHASE_LABELS[state.phase]),
      ),
      el(
        'div',
        { class: 'controls' },
        button('End phase ␣', endPhase, { class: 'primary' }),
        button(
          'Undo',
          () => {
            session?.undo();
            draw();
          },
          { disabled: !session?.canUndo, title: 'Local games only' },
        ),
        button('Fit', () => {
          renderer?.fitMap();
          draw();
        }),
        button('Help', () => {
          ui.helpOpen = true;
          draw();
        }),
        button('New', () => {
          ui.pickerOpen = true;
          draw();
        }),
      ),
    );
  };

  // ---------------------------------------------------------------------
  // Orders panel
  // ---------------------------------------------------------------------

  const renderOrders = (state: GameState): void => {
    const u = selectedUnit();
    const blocks: HTMLElement[] = [];

    blocks.push(
      el(
        'div',
        { class: 'panel-head' },
        el('h2', {}, state.phase === 'fire' ? 'Fire' : 'Orders'),
        el('span', { class: 'hint' }, phaseHint(state)),
      ),
    );

    if (!u) {
      blocks.push(el('p', { class: 'empty' }, 'Click a counter to select it.'));
    } else {
      blocks.push(unitCard(state, u));
      if (isOgre(u)) blocks.push(ogreSheet(u));
      if (state.phase === 'fire' && u.owner === me()) blocks.push(firePanel(state, u));
      if ((state.phase === 'movement' || state.phase === 'gevMovement') && u.owner === me()) {
        blocks.push(movePanel(state, u));
      }
    }

    const hexInfo = hexCard(state);
    if (hexInfo) blocks.push(hexInfo);
    setChildren(ordersPanel, ...blocks);
  };

  const phaseHint = (state: GameState): string => {
    switch (state.phase) {
      case 'recovery':
        return 'Disabled units come back; press space.';
      case 'movement':
        return 'Move, ram, or drive over infantry.';
      case 'fire':
        return 'Pick guns, then a target.';
      case 'gevMovement':
        return 'GEVs move a second time.';
    }
  };

  const unitCard = (state: GameState, u: Unit): HTMLElement => {
    const owner = state.players[u.owner]!;
    const rows: HTMLElement[] = [];
    if (isOgre(u)) {
      const type = ogreType(u.typeId);
      rows.push(row('Treads', `${u.treads} / ${type.treads}`));
      rows.push(row('Movement', `${movementForTreads(type, u.treads)} (base ${type.baseMove})`));
      rows.push(row('Size', String(type.size)));
    } else {
      const cls = unitClass(u.classId);
      if (cls.attack > 0) {
        rows.push(
          row(
            'Attack / range',
            `${cls.attack * (cls.kind === 'infantry' ? u.squads : 1)}${cls.splitAttack ? '*' : ''} / ${cls.range}`,
          ),
        );
      }
      rows.push(row('Defence', String(cls.defense * (cls.kind === 'infantry' ? u.squads : 1))));
      rows.push(
        row(
          'Movement',
          cls.secondMove != null ? `${cls.move}-${cls.secondMove}` : String(cls.move),
        ),
      );
      if (cls.kind === 'infantry') rows.push(row('Squads', String(u.squads)));
      if (u.disabled !== 'none')
        rows.push(row('Status', u.disabled === 'combat' ? 'Disabled' : 'Bogged down', 'warn'));
      if (u.stuck) rows.push(row('Status', 'Stuck for the game', 'bad'));
    }
    rows.push(row('Hex', hexLabel(u.pos)));

    return el(
      'section',
      { class: 'card' },
      el(
        'div',
        { class: 'card-head', style: `--accent:${owner.color}` },
        el('span', { class: 'swatch' }),
        el('strong', {}, unitName(u)),
        el('span', { class: 'dim' }, owner.name),
      ),
      ...rows,
    );
  };

  const ogreSheet = (u: OgreUnit): HTMLElement => {
    const groups: HTMLElement[] = [];
    const kinds = ['main', 'secondary', 'missileRack', 'missile', 'arm', 'ap'] as const;
    for (const kind of kinds) {
      const all = u.weapons.filter((w) => w.kind === kind);
      if (all.length === 0) continue;
      const spec = OGRE_WEAPONS[kind];
      const pips = all.map((w) =>
        el('span', {
          class:
            `pip ${w.destroyed ? 'gone' : w.fired && kind === 'missile' ? 'spent' : w.fired ? 'used' : ''}`.trim(),
          title: w.destroyed ? 'destroyed' : w.fired ? 'fired this turn' : 'ready',
        }),
      );
      groups.push(
        el(
          'div',
          { class: 'weapon-row' },
          el('span', { class: 'weapon-name' }, spec.name),
          el('span', { class: 'weapon-stat' }, `${spec.attack}/${spec.range} D${spec.defense}`),
          el('span', { class: 'pips' }, ...pips),
        ),
      );
    }
    if (u.internalMissiles > 0) {
      groups.push(row('Internal missiles', String(u.internalMissiles)));
    }
    return el(
      'section',
      { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, 'Record sheet')),
      ...groups,
      el(
        'p',
        { class: 'note' },
        'An Ogre is destroyed only when every fireable weapon and every tread unit is gone.',
      ),
    );
  };

  const movePanel = (state: GameState, u: Unit): HTMLElement => {
    const allowance = movementAllowance(u, state.phase);
    const spent = u.moveUsed;
    const rams = ramHints();
    const infantryHere = unitsAt(state, u.pos).filter(
      (o) => o.owner !== u.owner && o.kind === 'unit' && unitClass(o.classId).kind === 'infantry',
    );

    return el(
      'section',
      { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, 'Movement')),
      row('Points', `${Math.max(0, allowance - spent)} of ${allowance} left`),
      u.movementEnded ? row('Stopped', 'this unit has ended its move', 'warn') : null,
      rams.length > 0
        ? el(
            'p',
            { class: 'note ram' },
            `${rams.length} hex${rams.length === 1 ? '' : 'es'} may be rammed — the dashed ones.`,
          )
        : null,
      ...infantryHere.map((inf) =>
        button(`Grind ${unitName(inf)}`, () =>
          dispatch({ type: 'reduceInfantry', by: me(), unit: u.id, target: inf.id }),
        ),
      ),
    );
  };

  // ---------------------------------------------------------------------
  // Fire
  // ---------------------------------------------------------------------

  const firePanel = (state: GameState, u: Unit): HTMLElement => {
    const kids: HTMLElement[] = [];

    if (isOgre(u)) {
      // A Mark V has twenty-six weapons. Listing them one per checkbox is
      // accurate and unusable, so the panel groups them by kind and asks how
      // many of each to commit — which is also how a player thinks about it
      // ("both secondaries on the GEV").
      kids.push(
        el('p', { class: 'note' }, 'Choose how many of each gun to fire, then click a target.'),
      );
      const kinds = ['main', 'secondary', 'missileRack', 'missile', 'arm', 'ap'] as const;
      for (const kind of kinds) {
        const ready = u.weapons.filter((w) => w.kind === kind && isFireable(u, w) && !w.fired);
        if (ready.length === 0) continue;
        const spec = OGRE_WEAPONS[kind];
        const chosen = ui.attackers.filter((a) => ready.some((w) => w.id === a.weapon)).length;

        const setCount = (n: number): void => {
          const clamped = Math.max(0, Math.min(ready.length, n));
          const others = ui.attackers.filter((a) => !ready.some((w) => w.id === a.weapon));
          ui.attackers = [
            ...others,
            ...ready.slice(0, clamped).map((w) => ({ unit: u.id, weapon: w.id })),
          ];
          draw();
        };

        kids.push(
          el(
            'div',
            { class: `gunline ${chosen > 0 ? 'on' : ''}`.trim() },
            el(
              'div',
              { class: 'gun-id' },
              el('span', { class: 'gun-name' }, spec.name),
              el('span', { class: 'gun-stat' }, `${spec.attack}/${spec.range}`),
            ),
            el(
              'div',
              { class: 'stepper' },
              button('−', () => setCount(chosen - 1), {
                class: 'step',
                disabled: chosen === 0,
              }),
              el('span', { class: 'count' }, `${chosen} of ${ready.length}`),
              button('+', () => setCount(chosen + 1), {
                class: 'step',
                disabled: chosen >= ready.length,
              }),
              button('All', () => setCount(ready.length), { class: 'step wide' }),
            ),
          ),
        );
      }
      const total = ui.attackers.reduce((n, a) => {
        const w = u.weapons.find((x) => x.id === a.weapon);
        return n + (w ? OGRE_WEAPONS[w.kind].attack : 0);
      }, 0);
      if (total > 0) kids.push(row('Combined strength', String(total)));
    } else if (canStillFire(state, u)) {
      const on = ui.attackers.some((a) => a.unit === u.id);
      kids.push(
        button(on ? 'Remove from the attack' : 'Add to the attack', () => {
          ui.attackers = on
            ? ui.attackers.filter((a) => a.unit !== u.id)
            : [...ui.attackers, { unit: u.id }];
          draw();
        }),
      );
    } else {
      kids.push(el('p', { class: 'empty' }, 'This unit has already fired this turn.'));
    }

    if (ui.attackers.length > 0) {
      kids.push(
        el(
          'div',
          { class: 'queue' },
          `${ui.attackers.length} gun${ui.attackers.length === 1 ? '' : 's'} queued`,
          button(
            'Clear',
            () => {
              ui.attackers = [];
              draw();
            },
            { class: 'link' },
          ),
        ),
      );
    }

    const target = ui.target;
    if (target && ui.attackers.length > 0) {
      const targetUnit =
        target.kind === 'terrain' || target.kind === 'building' ? null : state.units[target.unit];
      if (targetUnit && isOgre(targetUnit)) {
        kids.push(el('h3', {}, `Aim at ${unitName(targetUnit)}`));
        kids.push(targetChoice(targetUnit));
      }
      kids.push(shotCard(state, target));
    } else if (ui.attackers.length > 0) {
      kids.push(el('p', { class: 'empty' }, 'Now click an enemy counter.'));
    }

    return el(
      'section',
      { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, 'Attack')),
      ...kids,
    );
  };

  /**
   * "Any unit firing on an Ogre must specify the target it is attacking: either
   * one specific weapon or the Ogre's tread units." (7.13)
   */
  const targetChoice = (ogre: OgreUnit): HTMLElement => {
    const options: HTMLElement[] = [
      button(
        'Treads',
        () => {
          ui.target = { kind: 'ogreTreads', unit: ogre.id };
          draw();
        },
        {
          class: ui.target?.kind === 'ogreTreads' ? 'chip on' : 'chip',
        },
      ),
    ];
    const seen = new Set<string>();
    for (const w of ogre.weapons) {
      if (w.destroyed) continue;
      const spec = OGRE_WEAPONS[w.kind];
      const tag = `${spec.abbr}`;
      const first = !seen.has(tag);
      seen.add(tag);
      if (!first) continue;
      const remaining = ogre.weapons.filter((x) => x.kind === w.kind && !x.destroyed).length;
      options.push(
        button(
          `${spec.abbr} ×${remaining} (D${spec.defense})`,
          () => {
            const next = ogre.weapons.find((x) => x.kind === w.kind && !x.destroyed);
            if (next) ui.target = { kind: 'ogreWeapon', unit: ogre.id, weapon: next.id };
            draw();
          },
          {
            class: aimedAt(ogre, w.kind) ? 'chip on' : 'chip',
          },
        ),
      );
    }
    return el('div', { class: 'chips' }, ...options);
  };

  /** True when the current target is one of this Ogre's weapons of that kind. */
  const aimedAt = (ogre: OgreUnit, kind: string): boolean => {
    const t = ui.target;
    if (!t || t.kind !== 'ogreWeapon' || t.unit !== ogre.id) return false;
    return ogre.weapons.find((w) => w.id === t.weapon)?.kind === kind;
  };

  const shotCard = (state: GameState, target: TargetRef): HTMLElement => {
    const preview = previewAttack(state, session!.map, ui.attackers, target);
    if (!preview.ok) {
      return el('p', { class: 'empty bad' }, preview.reason ?? 'not a legal shot');
    }
    const chance = oddsChance(preview.odds);
    return el(
      'div',
      { class: 'shot' },
      row('Odds', preview.treadAttack ? '1 to 1 (treads)' : describeOdds(preview.odds)),
      row('Strength', `${preview.attackStrength} against ${preview.defenseStrength}`),
      preview.treadAttack
        ? row(
            'On a hit',
            `${preview.attackStrength} tread units, on a ${preview.treadHitOn === 6 ? '6' : '5 or 6'}`,
          )
        : row(
            'Chance',
            `${chance.x}/6 destroyed · ${chance.d}/6 disabled · ${chance.ne}/6 nothing`,
          ),
      button(
        'Fire',
        () => {
          dispatch({ type: 'attack', by: me(), attackers: ui.attackers, target });
          ui.attackers = [];
          ui.target = null;
        },
        { class: 'primary' },
      ),
    );
  };

  const hexCard = (state: GameState): HTMLElement | null => {
    if (!ui.hover || !session) return null;
    const terrain = terrainAt(session.map, ui.hover, state.terrainOverrides);
    const here = unitsAt(state, ui.hover);
    return el(
      'section',
      { class: 'card thin' },
      row('Hex', hexLabel(ui.hover)),
      row('Terrain', TERRAIN_LABELS[terrain]),
      here.length > 0 ? row('Holds', here.map(unitName).join(', ')) : null,
    );
  };

  // ---------------------------------------------------------------------
  // Log
  // ---------------------------------------------------------------------

  const renderLog = (state: GameState): void => {
    const entries = state.log.slice(-90).reverse();
    setChildren(
      logPanel,
      el(
        'div',
        { class: 'panel-head' },
        el('h2', {}, 'Battle log'),
        el('span', { class: 'hint' }, `${state.log.length} entries`),
      ),
      el(
        'ol',
        { class: 'log' },
        ...entries.map((entry) =>
          el(
            'li',
            {
              class: `log-${entry.severity}`,
              onPointerEnter: () => {
                if (entry.focus?.[0]) {
                  ui.hover = entry.focus[0];
                  draw();
                }
              },
            },
            el('span', { class: 'log-turn' }, `T${entry.turn}`),
            entry.text,
          ),
        ),
      ),
    );
  };

  // ---------------------------------------------------------------------
  // Modals
  // ---------------------------------------------------------------------

  const renderModal = (state: GameState): void => {
    if (state.victory) {
      renderVictory(state);
      return;
    }
    if (ui.pickerOpen) {
      renderPicker();
      return;
    }
    if (ui.helpOpen) {
      renderHelp();
      return;
    }
    modal.className = 'modal hidden';
  };

  const renderVictory = (state: GameState): void => {
    const v = state.victory!;
    const names = v.winners.map((w) => state.players[w]?.name ?? w).join(' and ');
    modal.className = 'modal';
    setChildren(
      modal,
      el(
        'div',
        { class: 'sheet' },
        el('h1', {}, `${names} win`),
        el('p', { class: 'lede' }, v.reason),
        el('p', { class: 'dim' }, `A ${v.level} victory.`),
        el(
          'div',
          { class: 'sheet-actions' },
          button(
            'New game',
            () => {
              ui.pickerOpen = true;
              draw();
            },
            { class: 'primary' },
          ),
        ),
      ),
    );
  };

  const renderPicker = (): void => {
    modal.className = 'modal';
    const def = scenario();
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
                  draw();
                },
              },
              el('strong', {}, s.name),
              el('span', { class: 'dim' }, s.blurb),
            ),
          ),
        ),
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
            draw();
          }),
          button(
            'Take the field',
            () => {
              ui.pickerOpen = false;
              startGame();
            },
            { class: 'primary' },
          ),
        ),
      ),
    );
  };

  const renderHelp = (): void => {
    modal.className = 'modal';
    setChildren(
      modal,
      el(
        'div',
        { class: 'sheet wide' },
        el('h1', {}, 'How this plays'),
        el('h3', {}, 'The turn'),
        el(
          'ol',
          { class: 'steps' },
          el(
            'li',
            {},
            el('strong', {}, 'Recovery. '),
            'Units disabled before the last enemy turn come back. Units bogged down in swamp, rubble or forest roll to get free.',
          ),
          el(
            'li',
            {},
            el('strong', {}, 'Movement. '),
            'Move, ram, or drive over infantry. Ramming interrupts movement and resolves at once.',
          ),
          el(
            'li',
            {},
            el('strong', {}, 'Fire. '),
            'Every unit and every Ogre weapon may fire once. Any number may combine on one target.',
          ),
          el(
            'li',
            {},
            el('strong', {}, 'GEV second movement. '),
            'GEV-type units move again after combat. There is no second fire phase.',
          ),
        ),
        el('h3', {}, 'Shooting an Ogre'),
        el(
          'p',
          {},
          'An Ogre is never one target. Name a weapon, and an X destroys it — a D does nothing at all. ' +
            'Or name the treads, which ignore the odds table entirely: one unit at a time, always 1 to 1, ' +
            'and a 5 or 6 costs the Ogre tread units equal to your attack strength. In a town, only a 6.',
        ),
        el('h3', {}, 'Things that catch people out'),
        el(
          'ul',
          {},
          el(
            'li',
            {},
            'Craters are impassable to everything, an Ogre included. Fire passes over them.',
          ),
          el(
            'li',
            {},
            'A heavy tracked unit that enters swamp may be stuck there for the rest of the game.',
          ),
          el(
            'li',
            {},
            'A GEV that enters forest, swamp, rubble or town stops dead and forfeits its second move.',
          ),
          el(
            'li',
            {},
            'Odds round in the defender’s favour. 5 to 1 is automatic; worse than 1 to 2 does nothing.',
          ),
          el(
            'li',
            {},
            'Ramming is how an Ogre clears a path — and it costs tread units every time.',
          ),
        ),
        el('h3', {}, 'Keys'),
        el(
          'ul',
          { class: 'keys' },
          el('li', {}, el('kbd', {}, 'space'), ' end phase'),
          el('li', {}, el('kbd', {}, 'u'), ' undo'),
          el('li', {}, el('kbd', {}, 'f'), ' fit the map'),
          el('li', {}, el('kbd', {}, '#'), ' hex numbers'),
          el('li', {}, el('kbd', {}, 'esc'), ' clear the selection'),
          el('li', {}, el('kbd', {}, 'shift'), ' + drag to pan, wheel to zoom'),
        ),
        el(
          'div',
          { class: 'sheet-actions' },
          button(
            'Back to the battle',
            () => {
              ui.helpOpen = false;
              draw();
            },
            { class: 'primary' },
          ),
        ),
      ),
    );
  };

  // Kick off with the picker.
  draw();
};
