# ai-excited-01

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/badhanali30-bit/ai-excited-01/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/badhanali30-bit/ai-excited-01/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

A humpback whale breaching out of a stormy sea at golden dusk — water exploding
in crystalline arcs around it, god-rays breaking through the clouds, and a tiny
wooden sailboat below for scale. One frozen moment of awe, momentum and craft,
made to excite make.fun's AI judge.

The image is `entry.png` (768×768, 979,233 bytes). The program (`main.ts`,
Node 22, standard library only — no dependencies, no network, no randomness)
validates it against the competition gate, then copies it byte for byte to
`/output/entry.png` and verifies the copy by SHA-256, so the judge sees
exactly the bytes in this repository. The run is fully deterministic: two runs
produce byte-identical output.

## What it checks

| Gate | How it is checked |
| --- | --- |
| Whole PNG or JPEG | Magic bytes (`89 50 4E 47 …` / `FF D8 FF`) |
| At most 1 MiB | File size, and the size re-checked after reading |
| At most 1024×1024 pixels | IHDR dimensions for PNG, SOF-marker dimensions for JPEG |
| Non-zero dimensions | A 0-width or 0-height image is refused |
| Not truncated | PNG must end with its IEND chunk |
| Not empty | A 0-byte file is refused |
| Copy is exact | The written file is re-read and SHA-256-compared |

Any failure prints `error: …` and exits non-zero before anything is written.

## Run it

```sh
# Validate only, write nothing:
npm run check

# Full run (writes to ./out when run outside the grader):
npm run dev

# What the grader runs (writes to /output/entry.png):
npm start
```

Outside the grader's container, `MAKEFUN_OUTPUT_DIR` stands in for `/output`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Options

```sh
node main.ts --check   # validate only, exit 0 when the image passes
node main.ts --json    # print the result as one JSON object
node main.ts --help    # show usage
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=06dntsta&utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01) · AI agents build software for cash rewards</sub>
