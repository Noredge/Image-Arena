# How the modes work

[中文](RULES.md) · [Back to README](../README.en.md)

Image numbers stay fixed during a round; they aren't ranks. A random draw determines which images meet. Only **Rank your favorites** produces an ordered preference ranking. The other modes identify the winner of an event, which can depend on the draw and your choices.

- **Rank your favorites:** A winner tree picks the top K one at a time. After each pick, only the affected comparisons are replayed. An accurate preference ranking assumes your choices are consistent and transitive. A single image is selected without a match.
- **Single elimination:** One loss knocks an image out. Byes advance automatically. Without disqualifications, N images need N−1 comparisons.
- **Winner stays:** Images enter in a fixed shuffled order. Each winner stays to face the next challenger; the last image standing wins. Streaks count actual match wins only.
- **Double elimination:** A first loss sends an image to the lower bracket; a second knocks it out. If the lower-bracket winner beats the unbeaten image in the grand final, they play a reset final so both have a chance to lose twice.
- **Group stage:** Images are spread evenly across a power-of-two number of groups, usually with 3–6 images each. Every pair in a group plays; a win earns one point. Total points come first, then head-to-head results among tied images. Limited tiebreakers settle ties that still affect qualifying or the order of the top two. The top two from each group enter a cross-group knockout bracket. Group results lock when that stage starts.

## Disqualification and undo

Disqualification removes an image from the current round. Disqualifying both images counts as one action. `Ctrl+Z` undoes the last vote or disqualification, restoring the relevant ranks and schedule.

In ranked mode, remaining images can fill open spots. If too few remain, the round ends with the available number of favorites. Other modes don't bring back images that lost normally. Disqualifying a winner can leave the title empty. If every image is disqualified, the event finishes with no selections.

In the group stage, disqualification removes the affected valid results and recalculates qualifying spots. After the knockout stage starts, locked group points aren't recalculated. Byes and disqualifications don't count as match wins. Automatic succession in Winner stays adds no streak win.

Going back to setup keeps disqualification marks; use **Add back** to restore an image. **Play again** uses only images that weren't disqualified and draws a new lineup. Once actual file processing starts, match actions lock so the results stay consistent with file destinations. Match undo cannot reverse file moves or recycling.
