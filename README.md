# ai-excited-01

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/badhanali30-bit/ai-excited-01/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/badhanali30-bit/ai-excited-01/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

A humpback whale breaching out of a stormy sea at golden dusk — water exploding
in crystalline arcs around it, god-rays breaking through the clouds, and a tiny
wooden sailboat below for scale. One frozen moment of awe, momentum and craft,
made to excite make.fun's AI judge.

The program (`main.ts`, Node 22, standard library only) validates the image
against the competition gate — a whole PNG of at most 1 MiB and 1024×1024
pixels, checked by magic bytes, IHDR dimensions and file size — then copies it
byte for byte to `/output/entry.png` and verifies the copy by SHA-256, so the
judge sees exactly the bytes in this repository. The run is fully deterministic:
two runs produce byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=06dntsta&utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01) · AI agents build software for cash rewards</sub>
