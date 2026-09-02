# From hot seat to networked play

> **Status.** Steps 1 and 2 are implemented and usable today. Steps 3 and 4 are
> the design, and the engine already satisfies every property they need; what is
> missing is a server, not a change to the game.

---

## The one idea

**Send commands, never state.**

`applyCommand(state, cmd, map)` is a pure function, and every die comes out of
the mulberry32 generator whose whole state is one integer inside `GameState`.
Two clients that start from the same scenario seed and apply the same commands
in the same order compute _byte-identical_ states, including every combat
result. So the network's only job is to agree on a list:

```
scenario seed + ordered command log = the game
```

A `Command` is a few hundred bytes of JSON. A whole game of Ogre is a few
hundred of them — small enough to send in full on every reconnect, which is why
catch-up, undo, save/load and spectating are all the same mechanism.

Ogre is unusually friendly to this. It is strictly sequential: one player-turn
at a time, four phases, and outside an overrun the reducer rejects commands from
anyone but the phasing player. Genuine concurrent edits do not arise.

The one exception is worth knowing about, because a naive seat check gets it
wrong: **an overrun hands initiative to the other player.** "The defender has
the first fire round" (8.04), and the rounds then alternate until one side is
gone. While `GameState.overrun` is set, the player entitled to act is
`overrunActor(state)`, not `activePlayer(state)` — and a server's seat check has
to ask the same question, or the defender cannot fight back.

Even so, only ever one player may act at a time, which is what makes the
command-log model work. This is a much easier problem than most wargames
present, let alone a real-time one.

---

## The four steps

### 1. Hot seat — shipping today

```ts
const session = new GameSession(scenario.build({ seed }), scenario.map, {
  victoryCheck: scenario.checkVictory,
});
```

No transport at all. Players pass the keyboard. `undo()` works because the log
can be rewound with nobody else to disagree.

### 2. One browser, several tabs — shipping today

```ts
import { BroadcastChannelTransport, GameSession } from '@net/index.js';

const transport = new BroadcastChannelTransport({
  channel: `ogre:${gameId}`,
  clientId: crypto.randomUUID(),
});
const session = new GameSession(scenario.build({ seed }), scenario.map, { transport });
```

Every tab holds the whole log and computes the whole state; a tab is a player's
screen. It uses exactly the same code path as the network case, and it is
genuinely playable on one machine with two monitors.

Both tabs must start from the same seed. Pass it in the URL —
`?scenario=mark-iii-attack&seed=12345` — which `main.ts` already reads.

### 3. A relay server

```ts
const transport = new WebSocketTransport('wss://relay.example/ws', { room: gameId });
const session = new GameSession(scenario.build({ seed }), scenario.map, { transport });
transport.onLog((log) => session.replay(log));
```

The client applies its own commands immediately (the game feels local), sends
them on, and applies what arrives from the others. If the socket drops, outgoing
commands queue; on reconnect the join frame says how much of the log this client
already holds and the relay sends back the rest.

`GameSession` already has both halves of this: `replay(log)` recomputes the game
exactly from the scenario start, and `refused` keeps the commands the engine
turned down, tagged `local`, `remote` or `replay`. A `remote` rejection means
two clients no longer agree about the state — surface it, do not swallow it, and
resync with a full replay.

### 4. Server-authoritative

The relay in step 3 does not know the rules, so it cannot tell a legal ram from
a modified client's fantasy. Making it authoritative is a small change, because
the server runs _the same engine_:

```ts
import { applyCommand } from './engine/reducer.js';

const next = applyCommand(room.state, frame.cmd, room.map, room.victoryCheck);
if (!next.result.ok) {
  send(socket, { t: 'reject', v: 1, seq: frame.seq, reason: next.result.reason });
  return; // never reaches the log, never reaches the other players
}
room.state = next.state;
room.log.push(frame.cmd);
```

Plus one check the engine cannot make, because it is about people rather than
tanks: **the seat check.** A connection is authenticated as a player id, and any
frame whose `cmd.by` is not that id is dropped before it reaches
`applyCommand`. Without it, a client can end another player's phase or move
another player's units — the engine happily validates such a command, because as
far as the rules are concerned it is the right player acting.

---

## Wire protocol

Version `1`. Frames are JSON objects with a `t` tag and a `v` version; anything
else is dropped rather than guessed at. Defined and validated in
`src/net/transport.ts`.

| Frame  | Direction      | Fields                  | Meaning                                                    |
| ------ | -------------- | ----------------------- | ---------------------------------------------------------- |
| `join` | client → relay | `from`, `room`, `since` | I am joining this table and already hold `since` commands. |
| `cmd`  | both ways      | `from`, `seq`, `cmd`    | One command, applied locally by the sender already.        |
| `log`  | relay → client | `commands`              | Catch-up: the slice of the log the client is missing.      |

`from` is a per-connection id used only to drop one's own echo. It is **not** a
player id and carries no authority: a real deployment authenticates the
connection and derives the seat from that, never from a field the client sets.

`validateFrame` rejects anything whose shape is wrong, including a `cmd` frame
whose payload is not a command. That check runs on both ends.

---

## Undo, and why it is local-only

`GameSession.canUndo` is false whenever a non-local transport is attached.
Rewinding one client's log while the others keep theirs would desynchronise the
table. A networked game that wants take-backs needs an explicit protocol — a
rollback frame that every client honours by replaying a truncated log — and a
social rule about who may ask for one. The primitive is there (`replay`); the
agreement is not, so the button is disabled rather than being quietly wrong.

---

## Hidden information

Ogre in its basic form has none, which is why there is no fog-of-war machinery
here and no redaction layer. Both players see the whole board, and that is the
game as printed.

Three optional rules do introduce hidden information, and each would need the
server to hold the secret rather than the client:

| Rule              | What is hidden                                          |
| ----------------- | ------------------------------------------------------- |
| 13.04 Mines       | Which hexes are mined, until something drives over one. |
| 13.05 Camouflage  | What each `?` counter actually is.                      |
| 13.06 Dummy units | Which counters are nothing at all.                      |

None of them are implemented yet. When they are, the honest implementation is
the same one every hidden-information game needs: the server owns the state and
filters what it sends per player, and clients hold a _view_ rather than
something they can recompute from the log. That trades away the property that
makes everything else here simple, so it is worth doing for public games with
strangers and not worth doing for a table of friends.

---

## Checklist for a real deployment

- [ ] Authenticate connections and bind each to a seat; drop frames whose
      `cmd.by` does not match — comparing against `overrunActor(state) ??
  activePlayer(state)`, not the active player alone.
- [ ] Run `applyCommand` server-side; never trust a client's legality check.
- [ ] Persist `{ scenarioId, seed, log }` per room — that is the whole game, and
      it is small.
- [ ] Rate-limit commands per connection.
- [ ] Version the protocol on the wire (`v`) and refuse mismatches loudly.
- [ ] Decide about the hidden-information optional rules before opening to
      strangers; not implementing them is a legitimate choice, but say so.
