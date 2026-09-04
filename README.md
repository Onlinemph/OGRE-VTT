# Ogre VTT — moved

**This game now lives in
[Triplanetary-VTT](https://github.com/onlinemph/Triplanetary-VTT).** Play it at
**<https://onlinemph.github.io/Triplanetary-VTT/>** and choose **Ogre** on the
start menu; this repository's page forwards there, carrying a `?battle=` link
with it.

The whole engine, renderer, scenario table and AI moved under `src/ogre/`
there, byte for byte, and the combined app has everything this one had plus
what it never did:

- a **battle builder** — any forces, either board or a fresh one generated from
  a seed, and command-post, breakthrough or attrition terms;
- **online tables** for Ogre, on the same Supabase project the space game uses,
  either refereed or the paste-one-SQL-file kind;
- the **war** that joins the two games, which hands a landing to Ogre and takes
  the result back on its own.

## Why this repository is now one page

Keeping the same engine in two repositories meant every rules change was two
edits, done by hand, with nothing to catch a missed one. That drift had already
started — the AI tuner in this repository was writing its learned weights to a
path that only existed in the other one — so the copy stopped being free.

Nothing is lost. The history is here, and every document below has a current
version over there.

## Where the writing went

| Was here                | Is now                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `docs/ARCHITECTURE.md`  | [docs/OGRE-ARCHITECTURE.md](https://github.com/onlinemph/Triplanetary-VTT/blob/main/docs/OGRE-ARCHITECTURE.md)         |
| `docs/RULES-MAPPING.md` | [docs/OGRE-RULES-MAPPING.md](https://github.com/onlinemph/Triplanetary-VTT/blob/main/docs/OGRE-RULES-MAPPING.md)       |
| `docs/CAMPAIGN.md`      | [docs/OGRE-HANDOFF.md](https://github.com/onlinemph/Triplanetary-VTT/blob/main/docs/OGRE-HANDOFF.md)                   |
| `docs/MULTIPLAYER.md`   | [docs/MULTIPLAYER.md](https://github.com/onlinemph/Triplanetary-VTT/blob/main/docs/MULTIPLAYER.md), and the hidden-information half in `OGRE-HANDOFF.md` |
| `docs/AI.md`            | [docs/AI.md](https://github.com/onlinemph/Triplanetary-VTT/blob/main/docs/AI.md)                                       |

The copies left in `docs/` here are the versions as they stood when the game
moved, kept for anything that links to them. They are not maintained.

## A battle you had saved

Saved battles live in the browser, under this page's address, and a browser
does not share storage between two addresses. A game left unfinished here
cannot be picked up over there — start it again, or finish it by loading this
page's history from git and running it locally.

## Attribution

**Ogre** is a registered trademark of Steve Jackson Games Incorporated. Ogre is
copyright © 1977–2019 by Steve Jackson Games Incorporated. This was an
**unofficial, fan-made** virtual tabletop, not affiliated with, endorsed by, or
sponsored by Steve Jackson Games, and the same is true of its new home.

No copyrighted artwork, map images, counters or rules text was ever shipped
here. The game is in print and worth owning: <https://ogre.sjgames.com>.

## Licence

The code is offered under the MIT licence. That covers **the source only**: it
grants no rights in the _Ogre_ game, its rules, its trademarks or its artwork,
which remain the property of Steve Jackson Games Incorporated.
