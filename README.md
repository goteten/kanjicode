# Kanji Code Game

A small browser game built as a single HTML file.

Open `index.html` in a browser to play the Unicode code game.

Open `kanji-peek.html` to play the partial-kanji guessing game.

Open `kanji-peek-seed.html` to play the seeded one-shot partial-kanji game.

Open `puzzle-panel.html` to play a monochrome 4×4 panel puzzle. Choose one of 20 fixed courses and clear five puzzles to complete it. Courses are grouped by 2 to 6 minimum moves, with four overlap-based difficulty bands per move count; no puzzle can be solved in one move. Cleared courses are saved locally. Tap the board after clearing or failing to continue, or the course number to return to selection. Works offline with mouse, touch, or keyboard.

Run `node scripts/analyze-puzzle-panel.cjs` to enumerate all 65,536 press subsets and record each board's minimum moves, shortest solution count, total solution count, and shortest solution masks. The generated data and Japanese report are in `puzzle-panel-analysis/`. The analyzer also checks the game's current 100 problems and rotational/reflection duplicates. No external packages are required.
