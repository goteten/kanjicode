# Kanji Code Game

A small browser game built as a single HTML file.

Open `index.html` in a browser to play the Unicode code game.

Open `kanji-peek.html` to play the partial-kanji guessing game.

Open `kanji-peek-seed.html` to play the seeded one-shot partial-kanji game.

Open `puzzle-panel.html` to play a monochrome 4×4 panel puzzle. Choose any of 260 individual puzzles. Puzzles are grouped by 2 to 14 minimum moves, with four overlap-based difficulty bands per move count; no puzzle can be solved in one move. Cleared puzzles are saved locally. Tap the board after clearing or failing to continue, or the problem number to return to selection. Works offline with mouse, touch, or keyboard.

Run `node scripts/analyze-puzzle-panel.cjs` to enumerate all 65,536 press subsets and record each board's minimum moves, shortest solution count, total solution count, and shortest solution masks. The generated data and Japanese report are in `puzzle-panel-analysis/`. The analyzer also checks the game's current problems and rotational/reflection duplicates. No external packages are required.

Open `color-orbit.html` to turn an image into a circular color distribution.

Each move group also offers an endless mode drawing from all boards with that exact minimum move count. Failed puzzles can be retried; cleared puzzles lead to a new random board.

Open `puzzle-panel-all.html` for all 6,748 boards requiring exactly 3, 4, or 5 moves (560 / 1,820 / 4,368). Rotations and reflections are included. Choose a move count to see every problem as a numbered button; solve it to enable Next, with Previous below it. Completion is saved separately.

Open `curling-four.html` for a curling four-in-a-row game against the blue AI (default), or choose local two-player mode. Choose the opponent and AI level on the opening screen; these settings stay fixed until you restart. During play, the rink, launch-position slider and a Power Mode toggle are displayed. A dotted trajectory and a ghost stone show the path on an empty rink up to its stopping point or first wall contact; rebounds are omitted from the preview. Drag the stone back and release to throw (or use arrow keys and Enter on the focused rink), with gentle normal throws (up to 470) or Power Mode (up to 1400). The hatched launch zone marks where a stone's center would overlap the next stone at launch; overlapping stones fade out and are removed when throwing, using the same rule for AI predictions. The launch area is inside the rink; stones rebound from all four walls and stay in play, including gentle throws that stop below the grid. Stones stay at their physical positions; a grid point counts only when its grid-point center lies strictly inside a stone's circular footprint. Nearby stones and edge-only contact do not count. Connect four intersections horizontally, vertically, or diagonally after the stones stop. Stones have a diameter of one grid spacing. Unoccupied stones remain on the rink and can still collide. Works offline with mouse, touch, or launch controls.

The AI simulates each candidate shot to rest using the same physics as actual play, then scores wins, threats, and line-building opportunities. It searches launch position, angle, and power with five selectable levels (3 / 8 / 15 / 30 / 2,000 ms search budgets), using grid-targeted seeds and simulated annealing in a Web Worker. After a match, undo in AI mode returns to your previous turn; restart opens the opponent selection screen. Lower levels also have random execution error in position, angle, and power after choosing a shot. Level 3 varies by up to 40 pixels, 9 degrees, and 22% power; level 5 has no execution error. No network or external packages are required.

Run `node scripts/test-curling-four.cjs` to verify prediction/playback agreement, AI winning and defensive shots, the search deadline, five difficulty budgets, the opening screen and locked match settings, and cancellation on undo or reset.
