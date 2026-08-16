# Ogre VTT

A rules-accurate virtual tabletop for **Ogre**, the game of a cybernetic
supertank grinding its way through an armour battalion to reach a command post.

The engine is a faithful implementation of the Sixth Edition rules: the printed
combat results table, the odds ladder that rounds in the defender's favour,
terrain tables written per running gear rather than per hex, tread units that
come off one attack at a time, and the two things about an Ogre that make it an
Ogre — you cannot shoot _it_, only its weapons or its treads; and a "disabled"
result does nothing to it at all.

> **Unofficial fan project.** See [Attribution](#attribution) — you should own a
> copy of the game.

![The cratered map during a Mark III Attack: an Ogre Mark III selected on the
south edge with its record sheet open — 45 tread units, one main battery, four
secondaries, two missiles and eight antipersonnel guns — and the three hexes it
can reach picked out in green around it.](docs/screenshot.png)

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Pick a scenario and press **Take the field**. Everything else:

```bash
npm test         # vitest, once
npm run test:watch
npm run typecheck
npm run build    # typecheck + production bundle into dist/
npm run preview  # serve the built bundle
npm run lint
npm run format
```

Node 20 or newer. No account, no server, no network required — the whole game
runs in the tab.

### Publishing to GitHub Pages

Publishing is opt-in, so nothing deploys — and no failure e-mails arrive — until
you ask for it. Two ways to ask:

- **Once:** Actions → _Deploy to GitHub Pages_ → **Run workflow**.
- **On every push to the default branch:** set a repository variable
  `PUBLISH_PAGES` to `true` (Settings → Secrets and variables → Actions →
  Variables).

The workflow enables Pages itself on its first run, so there is no settings
switch to forget. If your organisation blocks that, set Settings → Pages → Build
and deployment → **Source** to **GitHub Actions** by hand.

That Source setting is the one that catches people out. Left on _"Deploy from a
branch"_, Pages serves the repository as-is — which looks like it worked and did
not. The root `index.html` is Vite's development entry, and its only script tag
points at `/src/main.ts`; no browser can execute TypeScript, so the page loads,
`#root` stays empty, and you get a blank screen with nothing in the console to
explain it. Only the built `dist/` is servable, and only Actions produces it.

---

## How to play

An Ogre is not a counter with three numbers on it — it is a record sheet, and
the whole game is about taking it apart. The single most important rule:

> **You never attack an Ogre. You attack one of its weapons, or its treads.**

Attack a weapon and an X destroys it while a D does nothing. Attack the treads
and the odds table is bypassed entirely: one unit at a time, always 1 to 1, and
a roll of 5 or 6 costs the Ogre tread units equal to your attack strength — so a
Heavy Tank that connects takes four treads off. In a town, only a 6 does it.

Treads are speed, not health. Two thirds gone and a Mark V drops from three
hexes a turn to two; a third left and it is down to one; none at all and it sits
there and shoots until you finish it. An Ogre is destroyed only when every
fireable weapon _and_ every tread unit is gone.

A player-turn runs four phases:

| Phase                   | What happens                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Recovery**            | Units disabled before the last enemy turn come back automatically. Units bogged down in swamp, rubble or forest roll to get free. |
| **Movement**            | Move, ram, or drive over infantry. Ramming interrupts movement and resolves at once.                                              |
| **Fire**                | Every unit and every Ogre weapon may fire once. Any number may combine on a single target — except the treads.                    |
| **GEV second movement** | GEV-type units move again after combat. There is no second fire phase.                                                            |

Things worth knowing early:

- **Craters are impassable to everything**, an Ogre included. Fire passes over
  them. On the orange map they are the only terrain, and they are the whole
  puzzle.
- **Odds round in the defender's favour.** Three against two is a 1-1, not
  anything better. Five to one or better is an automatic kill with no die at
  all; worse than one to two is nothing.
- **Ramming is how an Ogre clears a path** — a Heavy Tank in the way is disabled
  on a 1-3 and flattened on a 4-6 — and it costs tread units every time.
- **Infantry are the Ogre's real problem.** They cannot be rammed, they are
  cheap, and adjacent squads chip treads away one attack at a time. The Ogre's
  answer is its antipersonnel guns, and driving over them.
- **Heavy armour and swamp do not mix.** A Heavy Tank that enters swamp may be
  stuck there for the rest of the game.

The in-game **Help** panel carries the same reference, and
[docs/RULES-MAPPING.md](docs/RULES-MAPPING.md) says where each printed rule is
implemented if you want to check the fine print.

### Playing with other people

Hot seat works out of the box: pass the keyboard. The session layer already
speaks in commands rather than state, so several tabs of one browser over
`BroadcastChannel` and a relay across machines are wiring rather than design —
see [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).

---

## Design principles

**The engine is a pure function.** `applyCommand(state, command, map)` returns a
new state. No DOM, no clock, no `Math.random` — every die comes from a seeded
generator carried inside the game state. That single constraint buys undo,
save/load, replay, deterministic tests and networked play with no extra
machinery: a game _is_ its scenario seed plus an ordered list of commands.

**The rulebook is the specification.** Where a rule is subtle, the phrase is
quoted in a comment beside the code that implements it. Where the rules are
ambiguous, the interpretation is written down rather than silently chosen. Every
statistic says where it came from, and the handful that no published table
covers are _flagged as such_ — see
[Sources, and what is still unconfirmed](docs/RULES-MAPPING.md#sources-and-what-is-still-unconfirmed).
Tests keep both halves honest: the Combat Results Table, the Size Table, the
Terrain Effects Table and all twelve Ogre record sheets are asserted card by
card, so a typo fails the build.

**Terrain is organised by running gear, not by hex.** Section 5.08 is five
tables stacked on top of each other, because a swamp that slows a Heavy Tank
strands it and a GEV skims a stream but has to stop at one. `terrain.ts` is
shaped like the rulebook rather than like a lookup table.

**Nothing is drawn that could be generated.** The map, the counters and the
Ogre's damage bar all come from the same data the rules use. There is no image
asset to load, which is also why this project ships no copyrighted artwork.

**The interface decides nothing.** Every legality question is asked of the
engine; every change leaves as a command. The shell is replaceable and the game
is not.

---

## Project layout

```
src/
  engine/      the rules — pure, no I/O, no DOM
    hex.ts terrain.ts map.ts mapdata.ts     the board
    units.ts ogres.ts crt.ts                the printed tables
    types.ts commands.ts state.ts rng.ts    the state contract and its helpers
    movement.ts combat.ts ram.ts            the phase rules
    reducer.ts                              the one entry point
  scenarios/   the starting scenarios, as pure builders + victory checks
  net/         GameSession (command log, undo, save) and the transports
  render/      canvas map: ground, counters, overlays. Generated, not drawn.
  ui/          panels, input, and the one-way command loop
  main.ts      the only file that wires the concrete pieces together
docs/          ARCHITECTURE.md, RULES-MAPPING.md, MULTIPLAYER.md, CAMPAIGN.md
tests/         rules tests, run by vitest
```

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) if you intend to change
anything.

---

## Testing

```bash
npm test
```

The tests that earn their keep are the ones that replay the rulebook's own
worked examples: the odds in 7.10 and 7.13.1, the spillover example in 7.12, the
Superheavy example in 5.11.2, the Example of Play's whole exchange of fire, and
both ramming examples in 6.04 and 6.05. Because the engine is pure, every one of
them is hermetic and reproducible — a failing test can be replayed exactly.

---

## Attribution

**Ogre** is a registered trademark of Steve Jackson Games Incorporated. Ogre is
copyright © 1977–2019 by Steve Jackson Games Incorporated. This project is an
**unofficial, fan-made** virtual tabletop. It is not affiliated with, endorsed
by, or sponsored by Steve Jackson Games.

This repository ships **no copyrighted artwork, map images, counters or rules
text**. The boards are original reconstructions generated from a seed in
`src/engine/mapdata.ts`; the counters are drawn at runtime from unit statistics.
The rulebook itself is not included and not reproduced here — only short phrases
quoted in source comments where they explain a decision, as technical citation.

**You should own a copy of the game.** The rules, the maps and the counters are
worth having, the game is in print, and this tabletop is a companion to it
rather than a replacement:

- <https://ogre.sjgames.com>

If you represent Steve Jackson Games and would like something here changed or
removed, please open an issue.

---

## Licence

The code in this repository is offered under the MIT licence — add a `LICENSE`
file with the MIT text before publishing, so the grant is formal rather than a
sentence in a README. Whatever licence the code carries covers **the source
only**: it grants no rights in the _Ogre_ game, its rules, its trademarks or its
artwork, which remain the property of Steve Jackson Games Incorporated.
