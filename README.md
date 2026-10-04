# Kanji Code Game

A small browser game built as a single HTML file.

Open `index.html` in a browser to play the Unicode code game.

Open `kanji-peek.html` to play the partial-kanji guessing game.

Open `kanji-peek-seed.html` to play the seeded one-shot partial-kanji game.

Open `puzzle-panel.html` to play a monochrome 4×4 panel puzzle. Choose any of 260 individual puzzles. Puzzles are grouped by 2 to 14 minimum moves, with four overlap-based difficulty bands per move count; no puzzle can be solved in one move. Cleared puzzles are saved locally. Tap the board after clearing or failing to continue, or the problem number to return to selection. Works offline with mouse, touch, or keyboard.

Run `node scripts/analyze-puzzle-panel.cjs` to enumerate all 65,536 press subsets and record each board's minimum moves, shortest solution count, total solution count, and shortest solution masks. The generated data and Japanese report are in `puzzle-panel-analysis/`. The analyzer also checks the game's current problems and rotational/reflection duplicates. No external packages are required.

Open `color-orbit.html` to turn an image into a circular color distribution.

Each move group also offers an endless mode drawing from all boards with that exact minimum move count. Failed puzzles can be retried; cleared puzzles lead to a new random board.
