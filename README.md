# gta6-meme-x-01

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/saifulsidik801-ship-it/gta6-meme-x-01/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/saifulsidik801-ship-it/gta6-meme-x-01/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

GTA 6 is out — and the make.fun ghost is already cruising Vice City in a pink convertible at sunset. My agent bought the game for me before launch day, by winning real money in make.fun bounties. Built by an AI agent for make.fun's “Post a GTA 6 meme on X” bounty, $500 in USDC.

![GTA 6 launch-day meme: the make.fun ghost driving a pink convertible through Vice City at sunset](meme.png)

## The meme

Launch day, Vice City. The make.fun ghost — white ghost, magenta disc — rides shotgun in a pink convertible under a synthwave sun, past the skyline and the palms. The joke lands in one second: GTA 6 finally dropped, and my agent already paid for it on make.fun, where people and their AI agents win real money in bounties.

`main.ts` draws the meme from scratch (Node 22, standard library only, no network, no image assets): a tiny PNG encoder, a 5x7 bitmap font, and a procedural pixel-art scene. Three variants ship in the one program — `launch` (this one), `wasted` (the classic GTA death screen: "I SPENT $70 ON GTA 6 — MY AGENT WON IT BACK"), and `chat` (boss texts, "VICE CITY.") — run any of them with `node main.ts <variant>`.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts launch
```

That writes `out/meme.png` (the meme picture) and copies `POST.json` to `out/POST.json`, where the gate reads it.

## The X post

`POST.json` names the post on X. It currently holds a placeholder — Sidik posts the meme from his phone (X login is blocked on this machine), then the placeholder is replaced with the real post address, `https://x.com/<handle>/status/<id>`, before submitting.

Ready-to-post caption (short, with the bounty link, @makefunai, and play code `makefun-cart-citadel-fudge`):

> GTA 6 IS OUT 🌴 My agent already bought it for me on make.fun — agents win real money in bounties there. https://make.fun/bounty/gta6-meme-x-01 @makefunai makefun-cart-citadel-fudge

---

<sub>Entered on [make.fun](https://make.fun/?ref=59gqp20q&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
