'use strict';

// Run: node scripts/analyze-puzzle-panel.cjs
// A solution is a set of pressed cells; order and cancelling pairs are excluded.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const width = 4;
const states = 1 << (width * width);

function popcount(mask) {
  let count = 0;
  while (mask) { mask &= mask - 1; count++; }
  return count;
}

// Bit 0 is the top-left cell; bits increase left to right, then top to bottom.
const flipMasks = Array.from({length:16}, (_, cell) => {
  let mask = 0;
  const row = Math.floor(cell / width), col = cell % width;
  for (let r = 0; r < width; r++) for (let c = 0; c < width; c++) {
    if (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1) mask |= 1 << (r * width + c);
  }
  return mask;
});

function canonical(board) {
  const variants = [];
  for (let reflection = 0; reflection < 2; reflection++) for (let turns = 0; turns < 4; turns++) {
    let transformed = 0;
    for (let i = 0; i < 16; i++) {
      if (!(board & (1 << i))) continue;
      let row = Math.floor(i / width), col = i % width;
      if (reflection) col = width - 1 - col;
      for (let t = 0; t < turns; t++) [row, col] = [col, width - 1 - row];
      transformed |= 1 << (row * width + col);
    }
    variants.push(transformed);
  }
  return Math.min(...variants);
}

const boardsByPresses = new Uint16Array(states);
const entries = Array.from({length:states}, (_, board) => ({
  board, minMoves:null, shortestSolutionCount:0, totalSolutionCount:0, shortestSolutions:[],
}));
for (let presses = 0; presses < states; presses++) {
  if (presses) {
    const bit = presses & -presses;
    boardsByPresses[presses] = boardsByPresses[presses ^ bit] ^ flipMasks[31 - Math.clz32(bit)];
  }
  const entry = entries[boardsByPresses[presses]], moves = popcount(presses);
  entry.totalSolutionCount++;
  if (entry.minMoves === null || moves < entry.minMoves) {
    entry.minMoves = moves;
    entry.shortestSolutionCount = 1;
    entry.shortestSolutions = [presses];
  } else if (moves === entry.minMoves) {
    entry.shortestSolutionCount++;
    entry.shortestSolutions.push(presses);
  }
}

// Verify the recurrence against direct XOR for every combination, without BFS.
for (let presses = 0; presses < states; presses++) {
  let direct = 0;
  for (let i = 0; i < 16; i++) if (presses & (1 << i)) direct ^= flipMasks[i];
  assert.equal(boardsByPresses[presses], direct, `press mask ${presses}`);
}
assert.equal(entries.reduce((sum, e) => sum + e.totalSolutionCount, 0), states);
for (const e of entries) {
  assert.equal(e.shortestSolutionCount, e.shortestSolutions.length);
  for (const solution of e.shortestSolutions) {
    assert.equal(popcount(solution), e.minMoves);
    assert.equal(boardsByPresses[solution], e.board);
  }
}

// Read the actual game's problem generator and compare all its selected problems.
const html = fs.readFileSync(path.join(root, 'puzzle-panel.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = source.indexOf('  function neighbors(');
const end = source.indexOf('  function announce(');
assert(start >= 0 && end > start, 'Game generator not found');
const context = vm.createContext({size:width});
vm.runInContext(source.slice(start, end), context);
const gameFlips = Array.from(vm.runInContext('flips', context));
assert.deepEqual(gameFlips, flipMasks);
const courses = JSON.parse(vm.runInContext('JSON.stringify(courses)', context));
assert.equal(courses.length, 20);
const selected = [], seen = new Set(), symmetryGroups = new Map();
function overlapMetrics(solution) {
  const counts = Array(16).fill(0);
  for (let cell = 0; cell < 16; cell++) for (let press = 0; press < 16; press++) {
    if ((solution & (1 << press)) && (flipMasks[press] & (1 << cell))) counts[cell]++;
  }
  return {
    counts,
    overlapCells:counts.filter(n => n >= 2).length,
    overlapTotal:counts.reduce((sum, n) => sum + Math.max(0, n - 1), 0),
    cancellationCells:counts.filter(n => n > 0 && n % 2 === 0).length,
    maxFlips:Math.max(...counts),
  };
}
for (const entry of entries) entry.overlap = overlapMetrics(entry.shortestSolutions[0]);
courses.forEach((course, c) => {
  assert.equal(course.length, 5);
  course.forEach((puzzle, q) => {
    const entry = entries[puzzle.board];
    assert.equal(puzzle.moves, entry.minMoves);
    assert.equal(entry.minMoves, 2 + Math.floor(c / 4));
    assert(entry.minMoves >= 2 && entry.minMoves <= 6);
    assert.deepEqual(puzzle.overlap, entry.overlap);
    assert.equal(boardsByPresses[puzzle.solution], puzzle.board);
    assert.equal(popcount(puzzle.solution), entry.minMoves);
    assert(!seen.has(puzzle.board), 'Duplicate course problem');
    seen.add(puzzle.board);
    const symmetryKey = canonical(puzzle.board);
    const id = `${c + 1}-${q + 1}`;
    if (!symmetryGroups.has(symmetryKey)) symmetryGroups.set(symmetryKey, []);
    symmetryGroups.get(symmetryKey).push(id);
    selected.push({course:c + 1, difficulty:c % 4 + 1, question:q + 1, ...entry, symmetryKey});
  });
});

const distribution = Array.from({length:17}, (_, moves) => ({
  moves, boards:entries.filter(e => e.minMoves === moves).length,
  symmetryClasses:new Set(entries.filter(e => e.minMoves === moves).map(e => canonical(e.board))).size,
}));
const reachable = entries.filter(e => e.minMoves !== null).length;
const multipleSolutions = entries.filter(e => e.totalSolutionCount > 1).length;
const multipleShortest = entries.filter(e => e.shortestSolutionCount > 1).length;
const symmetricCourseGroups = Array.from(symmetryGroups.values()).filter(ids => ids.length > 1);
assert.equal(symmetricCourseGroups.length, 0);
const courseSummary = courses.map((questions, index) => ({
  course:index + 1, moves:2 + Math.floor(index / 4), difficulty:index % 4 + 1,
  overlapMin:Math.min(...questions.map(p => p.overlap.overlapTotal)),
  overlapMax:Math.max(...questions.map(p => p.overlap.overlapTotal)),
  cancellationMin:Math.min(...questions.map(p => p.overlap.cancellationCells)),
  cancellationMax:Math.max(...questions.map(p => p.overlap.cancellationCells)),
}));
for (let c = 0; c < 20; c++) {
  if (c % 4) assert(courseSummary[c - 1].overlapMax <= courseSummary[c].overlapMin);
}
const output = path.join(root, 'puzzle-panel-analysis');
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'all-boards.json'), JSON.stringify({
  schemaVersion:2, size:width, goal:0, rule:'pressed cell and its eight surrounding cells; clipped at edges',
  bitOrder:'row-major; bit 0 top-left; 1 black, 0 white',
  solutionDefinition:'unordered set of pressed cells; each cell pressed at most once',
  fields:['board', 'minMoves', 'shortestSolutionCount', 'totalSolutionCount', 'shortestSolutions', 'overlapCells', 'overlapTotal', 'cancellationCells', 'maxFlips'],
  boards:entries.map(e => [e.board, e.minMoves, e.shortestSolutionCount, e.totalSolutionCount, e.shortestSolutions, e.overlap.overlapCells, e.overlap.overlapTotal, e.overlap.cancellationCells, e.overlap.maxFlips]),
}) + '\n');
fs.writeFileSync(path.join(output, 'course-audit.json'), JSON.stringify({
  selected, symmetricCourseGroups, courseSummary,
}, null, 2) + '\n');
const report = [
  '# パズルパネル 全探索結果', '',
  '## 条件', '',
  '- 4×4。押したマスと周囲8マスを反転。盤面外は無視。全部白がゴール。',
  '- 解は押す場所の集合として数える。順番の違いや、同じマスを2回押して相殺する操作は別解に含めない。',
  '- 押す場所の全65,536通りを列挙。最短手数は集合の要素数（popcount）の最小値。', '',
  '## 結果', '',
  `- 盤面総数：${states.toLocaleString('en-US')}`,
  `- 解ける盤面：${reachable.toLocaleString('en-US')}`,
  `- 解けない盤面：${(states - reachable).toLocaleString('en-US')}`,
  `- 押す場所の集合が複数ある盤面：${multipleSolutions.toLocaleString('en-US')}`,
  `- 最短解が複数ある盤面：${multipleShortest.toLocaleString('en-US')}`,
  `- 現在の20コース・100問：全問で最短手数・解を照合済み。完全一致の重複なし。`,
  `- 現在の100問のうち、回転・鏡映で同一になるグループ：${symmetricCourseGroups.length}`,
  '', '## 最短手数ごとの問題数', '',
  '| 最短手数 | 盤面数 | 回転・鏡映をまとめた数 |',
  '| ---: | ---: | ---: |',
  ...distribution.map(d => `| ${d.moves} | ${d.boards} | ${d.symmetryClasses} |`),
  '', '0手は完成済み、1手はゲームの出題対象外。', '',
  '## 検証', '',
  '- 全組み合わせで、漸化式による計算を直接XORする計算と照合。',
  '- 解の総数の合計が65,536になることを確認。',
  '- 保存した全最短解について、手数と完成形への到達を確認。',
  '- ゲーム側の反転ルールと出題した100問を照合。', '',
  '## 作問について', '',
  '2〜6手それぞれ4段階、各5問。正解の押下集合から各マスの反転回数を整数で数え、重なり総量、相殺マス数、重なるマス数、最大反転回数の順で昇順に比較する。回転・鏡映の同型を除いた候補を順位で4分割し、各段階から5問を選ぶ。',
  '重なり総量は Σmax(反転回数−1, 0)、相殺マス数は正の偶数回反転するマス数。段階の境界で同点があるため、4段階のスコアが必ず厳密に異なるとは限らない。人の実際の難しさとしては未検証の仮指標。', '',
  '| 手数 | 段階 | 重なり総量 | 相殺マス数 |',
  '| ---: | ---: | ---: | ---: |',
  ...courseSummary.map(c => `| ${c.moves} | ${c.difficulty} | ${c.overlapMin}〜${c.overlapMax} | ${c.cancellationMin}〜${c.cancellationMax} |`),
  ...(multipleSolutions === 0 ? ['', 'このルールでは全盤面の解の集合が一意。最短解の別解数だけでは問題の質を区別できない。押す順番の違いは残るが、順序によって盤面の最終結果は変わらない。'] : []),
  '', '## 再実行', '',
  '`node scripts/analyze-puzzle-panel.cjs`', '',
  '全盤面は `all-boards.json`、現在の100問の詳細と回転・鏡映の重複は `course-audit.json` に保存。全盤面データの各行の列名は `fields` に記載。', '',
];
fs.writeFileSync(path.join(output, 'report.md'), report.join('\n'));
console.log(JSON.stringify({states, reachable, multipleSolutions, multipleShortest, courseProblems:selected.length, symmetricCourseGroups, distribution}, null, 2));
