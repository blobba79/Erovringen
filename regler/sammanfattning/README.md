# Rule summaries

Own-words summaries of *Complete Annotated Rules v7.3* (Dec 2014), one file per part. Page refs `(s. N)` = PDF page. The PDF itself is not in git.

| Part | File | OKLART |
|---|---|---|
| Base game | [grundspel.md](grundspel.md) | 4 |
| The River | [river.md](river.md) | 5 |
| The Abbot | [abbot.md](abbot.md) | 3 |
| Inns & Cathedrals | [inns-cathedrals.md](inns-cathedrals.md) | 9 |
| Traders & Builders | [traders-builders.md](traders-builders.md) | 6 |
| The Princess & the Dragon | [princess-dragon.md](princess-dragon.md), [princess-dragon-dragon.md](princess-dragon-dragon.md) | 7 |
| The Flying Machines | [flying-machines.md](flying-machines.md) | 2 |
| The Ferries | [ferries.md](ferries.md) | 2 |
| The Gold Mines | [gold-mines.md](gold-mines.md) | 3 |
| Mage & Witch | [mage-witch.md](mage-witch.md) | 3 |
| Crop Circles II | [crop-circles-2.md](crop-circles-2.md) | 4 |

The summaries were written from extracted text only; pictures were not seen.

## How the OKLART points are resolved

**1. Tile layouts and symbols (picture-only in the PDF).** Which tile has a pennant, cloister, garden, inn, cathedral, goods, gold, lake, crop circle symbol, which is the start tile, per-tile layouts of every expansion. → Taken from the JCloisterZone tile data in phase 1; tile counts are then checked against the PDF by script.

**2. Interaction edge cases not stated in the PDF.** → JCloisterZone's engine is the reference (SPEC.md, Källor). Checked when each expansion module is built:
- Crop circles vs big follower, builder, pig; crop circle during the builder's double turn (crop-circles-2.md).
- Abbot: may it fly, enter a garden with a big follower, support a builder; abbot return when another figure is moved (fn 521) (abbot.md, inns-cathedrals.md, traders-builders.md, flying-machines.md).
- Builder triggered by ferry or flying-machine placement (traders-builders.md).
- Witch on unfinished features at game end; witch vs inn/cathedral (mage-witch.md, inns-cathedrals.md).
- Gold on a volcano tile, gold and abbot's cloister area (gold-mines.md, princess-dragon-dragon.md).
- Besieged city knight removal once or twice (traders-builders.md, fn 68).
- Trade goods majority when a player has 0 (traders-builders.md).
- I&C 50/100 tiles: score-track markers only (inns-cathedrals.md).

**3. Choices between rule versions → decided by the owner.** See the open questions in the phase 0 plan:
- Dragon moves before scoring (HiG/ZMG) or after (RGG).
- River set (River I 2001 or 2014 version), where the lake goes, what happens to the normal start tile.
- The crop circle tile packed with each mini (Flying Machines, Ferries, Gold Mines, Mage & Witch: "9 = 8 + 1 crop circle") is one of the six Crop Circles II tiles (s. 166). Proposal: each mini has its 8 own tiles; the six crop circle tiles belong to Crop Circles II only.
- Gold distribution: one piece at a time (HiG) or one per feature.
- River: forbid only the immediate U-turn, or also placements that make the river impossible to continue.
