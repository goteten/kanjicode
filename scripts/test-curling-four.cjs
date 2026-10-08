const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'curling-four.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const noop = () => {};
const drawing = new Proxy({}, {get: (o,k) => o[k] ?? noop, set: (o,k,v) => (o[k]=v,true)});
const elements = new Map();
function element(id) {
 if (!elements.has(id)) elements.set(id, {
  value: ({position:320, angle:0, power:300, opponent:'human', 'ai-level':'5','red-ai-level':'5','blue-ai-level':'5'})[id] ?? '',
  style: {}, classList: {toggle:noop}, events: {},
  addEventListener(name, fn) { this.events[name] = fn; },
  getContext() { return drawing; },
  setAttribute(name,value) {this[name]=value;},
 });
 return elements.get(id);
}
const workers = [];
class MockWorker {
 constructor() { workers.push(this); this.terminated = false; }
 postMessage(data) { this.request = data; }
 terminate() { this.terminated = true; }
}
const context = vm.createContext({
 document: {getElementById:element}, window: {addEventListener:noop},
 requestAnimationFrame:noop, performance, console, Worker:MockWorker,
 Blob:class { constructor(parts) { this.parts = parts; } },
 URL: {createObjectURL: () => 'blob:test', revokeObjectURL:noop},
});
const run = code => vm.runInContext(code, context);
run(source);
const reset = () => {element('restart').events.click();element('opponent').value='human';element('start-game').events.click();};
const stone = (x,y,player) => ({x,y,player,vx:0,vy:0,entered:true});
function setStones(list) { context.fixture = list; run('stones=fixture.map(s=>({...s}));'); }
function animate(shot) {
 context.testShot = shot;
 run('launch(testShot);for(let n=0;n<2600&&moving;n++)physics(1/120);');
 assert.equal(run('moving'),false);
 return JSON.parse(run('JSON.stringify(stones)'));
}
// The simulation must leave its input untouched and reproduce the actual game,
// including wall bounces, collision chains, exits and non-snapped positions.
for (const fixture of [[], [stone(320,440,0)], [stone(260,380,0),stone(320,380,1),stone(380,380,0)]]) {
 for (const shot of [{x:320,angle:0,power:1400},{x:95,angle:Math.PI/3,power:1300},{x:540,angle:-.4,power:300}]) {
  reset(); setStones(fixture); context.testShot=shot;
  const before=JSON.stringify(fixture);
  const predicted=JSON.parse(run('JSON.stringify(simulateShot(stones,testShot,1))'));
  assert.equal(JSON.stringify(fixture),before);
  run('turn=1;');
  assert.deepEqual(animate(shot),predicted);
 }
}
assert.equal(run('simulateShot([], {x:320,angle:0,power:300},1,performance.now()-1)'),null);
reset(); setStones([stone(111,111,0),stone(154,154,1)]);
assert.equal(run('boardState()[1][1]'),2);
assert.equal(run('R*2'),run('GAP'));
// A nearby stone in the same square does not count unless it covers the dot.
setStones([stone(111,111,0)]);assert.equal(run('boardState()[1][1]'),0);
setStones([stone(110,140,0)]);assert.ok(run('boardState().flat().every(v=>v===0)'));
setStones([stone(110.01,140,0)]);assert.equal(run('boardState()[1][1]'),1);
setStones([stone(140,140,1)]);assert.equal(run('boardState()[1][1]'),2);
// Not covering a dot must not delete a stone at the end of a shot.
setStones([stone(111,111,0)]);run('finishShot()');assert.equal(run('stones.length'),1);
// Two touching stones on opposite sides cannot both own the shared dot.
setStones([stone(110,140,0),stone(170,140,1)]);assert.equal(run('boardState()[1][1]'),0);
// Moving a single stone off its dot breaks the line, even within the same cell.
setStones([stone(80,260,1),stone(140,260,1),stone(200,260,1),stone(260,260,1)]);
assert.ok(run('winningLines(boardState(),1).length')>0);
run('stones[1].x=169;stones[1].y=289;');assert.equal(run('winningLines(boardState(),1).length'),0);
// A strong shot must rebound from the lower wall rather than leave the board.
reset();
run('gameMotion=createShotState([], {x:320,angle:0,power:1400},0);');
let lowerBounces=0;
for(let n=0;n<2600&&!run('gameMotion.done');n++){
 const oldVy=run('gameMotion.stones[0].vy');
 run('stepPhysics(gameMotion,1/120)');
 if(oldVy>0&&run('gameMotion.stones[0].vy')<0)lowerBounces++;
}
assert.ok(lowerBounces>0);
assert.equal(run('settleStones(gameMotion.stones).length'),1);
assert.ok(run('gameMotion.stones[0].y<=BOTTOM-R'));
// Existing stones pushed toward the floor also survive.
run('gameMotion={stones:[{x:320,y:BOTTOM-R-1,vx:0,vy:500,player:0,entered:true}],time:0,done:false};stepPhysics(gameMotion,1/120);');
assert.equal(run('gameMotion.stones.length'),1);assert.ok(run('gameMotion.stones[0].vy')<0);
// Execute the exact generated worker program in its own global environment.
function workerSearch(fixture, shotCount, budgetMs) {
 let answer;
 const workerContext=vm.createContext({performance, self:{postMessage:data=>answer=data}});
 vm.runInContext(run('workerSource()'),workerContext);
 workerContext.self.onmessage({data:{stones:fixture,player:1,shots:shotCount,budgetMs}});
 return answer;
}
const winningFixture=[stone(200,440,1),stone(260,440,1),stone(320,440,1)];
const winning=workerSearch(winningFixture,5,2000);
assert.equal(winning.score,1e9);
assert.ok(winning.evaluated>0);
reset();setStones(winningFixture);context.testShot=winning.shot;
assert.equal(run('outcomeFor(simulateShot(stones,testShot,1),6).player'),1);
const openingFixture=[stone(320,380,0)];
const opening=workerSearch(openingFixture,1,2000);
assert.ok(opening.evaluated>1);
assert.ok(opening.elapsed>=1800 && opening.elapsed<2600, 'The complete search should stay close to the two-second budget');
assert.ok(opening.shot.x>=80&&opening.shot.x<=560);
assert.ok(opening.shot.power>=140&&opening.shot.power<=1400);
assert.ok(Math.abs(opening.shot.angle)<=65*Math.PI/180);
reset();setStones(openingFixture);context.testShot=opening.shot;
assert.equal(run('evaluatePosition(simulateShot(stones,testShot,1),1,2)'),opening.score);
// A threatening opponent line should be broken, not rewarded as extra stones.
const threatFixture=[stone(200,440,0),stone(260,440,0),stone(320,440,0)];
const defense=workerSearch(threatFixture,5,600);
context.threatFixture=threatFixture;context.defense=defense;
assert.ok(defense.score>run('evaluatePosition(threatFixture,1,5)')+5000);
assert.equal(run('outcomeFor(simulateShot(threatFixture,defense.shot,1),6)?.player'),undefined);
// Each difficulty uses its own budget and completes actual candidates.
element('restart').events.click();
for(const [index,budget] of [3,8,15,30,2000].entries()){
 element('ai-level').value=String(index+1);assert.equal(run('aiBudget()'),budget);
 const candidate=workerSearch(openingFixture,1,budget);
 if(budget>=30)assert.ok(candidate.evaluated>0,'Level '+(index+1)+' must simulate a complete candidate');
 assert.ok(candidate.elapsed<budget+300,'Level '+(index+1)+' budget exceeded');
}
element('ai-level').value='5';
// The initial screen gates launch, and match configuration stays locked.
element('restart').events.click();
assert.equal(run('gameStarted'),false);assert.equal(element('setup').hidden,false);assert.equal(element('game').hidden,true);
run('launch()');assert.equal(run('shots'),0);
element('opponent').value='ai';element('ai-level').value='4';element('start-game').events.click();
assert.equal(run('gameStarted'),true);assert.equal(element('setup').hidden,true);assert.equal(element('game').hidden,false);
assert.equal(element('opponent').disabled,true);assert.equal(element('ai-level').disabled,true);assert.equal(run('aiBudget()'),30);
assert.equal(element('intro').hidden,true);assert.equal(element('end-actions').hidden,true);assert.equal(html.includes('<aside>'),false);
run('result={draw:true,lines:[]};updateUI();');assert.equal(element('end-actions').hidden,false);
run('result=null;updateUI();');assert.equal(element('end-actions').hidden,true);
element('ai-level').value='1';element('ai-level').events.change();assert.equal(run('aiBudget()'),30);assert.equal(Number(element('ai-level').value),4);
element('opponent').value='human';element('opponent').events.change();assert.equal(run('opponentMode()'),'ai');
function prepareAI(){
 element('restart').events.click();element('opponent').value='ai';element('ai-level').value='5';element('start-game').events.click();
 setStones(openingFixture);run('turn=1;shots=1;history=[{stones:[],turn:0,shots:0}];startAI();');
}
prepareAI();assert.equal(run('aiThinking'),true);const pending=workers.at(-1);assert.equal(pending.request.budgetMs,2000);
run('launch()');assert.equal(run('shots'),1);
element('undo').events.click();assert.equal(pending.terminated,true);pending.onmessage({data:opening});assert.equal(run('shots'),0);assert.equal(run('moving'),false);
assert.equal(run('gameStarted'),true);assert.equal(run('aiBudget()'),2000);
prepareAI();element('position').value=365;element('angle').value=-12;element('power').value=620;
const current=workers.at(-1);current.onmessage({data:opening});assert.equal(current.terminated,true);assert.equal(run('moving'),true);
run('for(let n=0;n<2600&&moving;n++)physics(1/120);draw();');assert.equal(run('turn'),0);assert.equal(run('aiThinking'),false);
assert.equal(Number(element('position').value),365);assert.equal(Number(element('angle').value),-12);assert.equal(Number(element('power').value),620);
context.testShot=opening.shot;context.openingFixture=openingFixture;
assert.equal(run('JSON.stringify(stones)'),run('JSON.stringify(simulateShot(openingFixture,testShot,1))'));
element('undo').events.click();assert.equal(run('stones.length'),0);assert.equal(run('shots'),0);assert.equal(run('gameStarted'),true);
prepareAI();const lockedWorker=workers.at(-1);element('ai-level').value='2';element('ai-level').events.change();assert.equal(lockedWorker.terminated,false);assert.equal(run('aiBudget()'),2000);
element('restart').events.click();assert.equal(lockedWorker.terminated,true);lockedWorker.onmessage({data:opening});assert.equal(run('moving'),false);assert.equal(run('gameStarted'),false);
assert.equal(element('opponent').disabled,false);assert.equal(element('ai-level').disabled,false);
element('ai-level').value='2';element('start-game').events.click();assert.equal(run('aiBudget()'),8);
prepareAI();workers.at(-1).onerror();assert.equal(run('gameStarted'),false);assert.equal(run('aiThinking'),false);assert.match(element('setup-note').textContent,/起動できません/);
element('position').value=80;element('angle').value=65;element('power').value=1400;element('restart').events.click();
assert.equal(Number(element('position').value),320);assert.equal(Number(element('angle').value),0);assert.equal(Number(element('power').value),300);
reset();element('power').value=1400;assert.equal(run('settings().power'),470);
element('power-mode').events.click();assert.equal(run('settings().power'),1400);assert.equal(element('power-mode')['aria-pressed'],'true');
element('power-mode').events.click();assert.equal(run('settings().power'),470);assert.equal(Number(element('power').value),470);
element('power-mode').events.click();element('restart').events.click();assert.equal(run('powerMode'),false);
// Difficulty affects execution accuracy independently of search time.
context.aim={x:320,angle:0,power:500};
for(const [i,errors] of [[90,20,.45],[65,14,.32],[40,9,.22],[12,3,.06],[0,0,0]].entries()){
 context.level=i+1;
 const high=JSON.parse(run('JSON.stringify(inaccurateAIShot(aim,level,()=>1))'));
 const low=JSON.parse(run('JSON.stringify(inaccurateAIShot(aim,level,()=>0))'));
 assert.equal(high.x,320+errors[0]);assert.equal(low.x,320-errors[0]);
 assert.ok(Math.abs(high.angle-errors[1]*Math.PI/180)<1e-12);
 assert.equal(high.power,Math.round(500*(1+errors[2])));
 assert.equal(low.power,Math.round(500*(1-errors[2])));
 const centered=JSON.parse(run('JSON.stringify(inaccurateAIShot(aim,level,()=>.5))'));
 assert.deepEqual(centered,{x:320,angle:0,power:500});
}
context.edgeAim={x:80,angle:-65*Math.PI/180,power:140};
const bounded=JSON.parse(run('JSON.stringify(inaccurateAIShot(edgeAim,1,()=>0))'));assert.equal(bounded.x,80);assert.equal(bounded.power,140);assert.ok(bounded.angle>=-65*Math.PI/180);
// Aim preview ignores existing stones and follows the exact shared physics.
for(const shot of [{x:320,angle:0,power:300},{x:140,angle:.4,power:470},{x:520,angle:-.7,power:1400}]){
 context.previewShot=shot;
 const preview=JSON.parse(run('JSON.stringify(emptyRinkPreview(previewShot))'));
 const predicted=JSON.parse(run('JSON.stringify(simulateShot([],previewShot,0))'));
 if(!preview.hitWall&&predicted.length){assert.equal(preview.end.x,predicted[0].x);assert.equal(preview.end.y,predicted[0].y);}
 else if(preview.hitWall)assert.ok(preview.end.x===80||preview.end.x===560||preview.end.y===80||preview.end.y===670);
 for(let i=1;i<preview.points.length;i++){const a=preview.points[i-1],b=preview.points[i];assert.ok((b.x-a.x)*Math.sin(shot.angle)-(b.y-a.y)*Math.cos(shot.angle)>=-1e-8);}
 assert.ok(preview.points.length>2);
 assert.equal(run('emptyRinkPreview(previewShot)===emptyRinkPreview(previewShot)'),true);
 setStones([stone(320,400,1)]);assert.equal(run('emptyRinkPreview(previewShot).end.x'),preview.end.x);
}
reset();run('draw()');
// Launching starts fully inside the rink, even for the weakest angled shot.
assert.ok(run('createShotState([], {x:320,angle:0,power:140},0).stones[0].y+R<=BOTTOM'));
for(const angle of [-65,0,65]){
 context.weakAngle=angle*Math.PI/180;
 assert.ok(run('simulateShot([], {x:320,angle:weakAngle,power:140},0).every(s=>Math.abs(s.y-650)>=R*2)'));
}
context.floorShot={x:320,angle:0,power:140};
const lowPrediction=JSON.parse(run('JSON.stringify(emptyRinkPreview(floorShot))'));
assert.ok(lowPrediction.end.y>530&&lowPrediction.end.y<=670);
reset();run('draw()');
// The launch strip is cleared when the shot stops, before the next turn.
reset();context.removalShot={x:320,angle:0,power:30};
run('launch(removalShot)');assert.equal(run('fadingStones.length'),0);assert.equal(run('stones.length'),1);
run('for(let n=0;n<2600&&moving;n++)physics(1/120);draw();');
assert.equal(run('turn'),1);assert.equal(run('stones.length'),0);assert.equal(run('fadingStones.length'),1);
assert.equal(run('simulateShot([],removalShot,0).length'),0);
element('undo').events.click();assert.equal(run('turn'),0);assert.equal(run('stones.length'),0);assert.equal(run('fadingStones.length'),0);
setStones([stone(80,640,0),stone(560,640,1),stone(320,400,0)]);run('finishShot()');assert.equal(run('stones.length'),1);assert.equal(run('fadingStones.length'),2);
run('lastTime=0;for(let n=1;n<=60;n++)frame(n*16);');assert.equal(run('fadingStones.length'),0);
element('restart').events.click();assert.equal(run('fadingStones.length'),0);
reset();element('delicate-mode').events.click();assert.equal(run('delicateMode'),true);assert.equal(run('powerMode'),false);
element('power').value=20;assert.equal(run('settings().power'),30);element('power').value=400;assert.equal(run('settings().power'),260);
element('power-mode').events.click();assert.equal(run('delicateMode'),false);assert.equal(run('powerMode'),true);
element('delicate-mode').events.click();assert.equal(run('delicateMode'),true);assert.equal(run('powerMode'),false);
element('power').value=30;context.softShot={x:320,angle:0,power:30};assert.equal(run('simulateShot([],softShot,0).length'),0);
element('delicate-mode').events.click();assert.equal(Number(element('power').value),140);
element('delicate-mode').events.click();element('restart').events.click();assert.equal(run('delicateMode'),false);

// Spectator mode forces both players to level 5 and runs automatically.
element('restart').events.click();element('opponent').value='watch';element('ai-level').value='1';element('opponent').events.change();
assert.equal(element('ai-level-label').hidden,true);element('start-game').events.click();
assert.equal(run('activeAILevel()'),5);assert.equal(run('aiBudget()'),2000);assert.equal(run('aiThinking'),true);
assert.equal(element('launch-controls').hidden,true);assert.equal(element('stop-watch').hidden,false);
const redWorker=workers.at(-1);assert.equal(redWorker.request.player,0);assert.equal(redWorker.request.budgetMs,2000);
run('launch()');assert.equal(run('shots'),0);
const watchReply={shot:{x:320,angle:0,power:300},elapsed:2000,evaluated:10};
redWorker.onmessage({data:watchReply});run('for(let n=0;n<2600&&moving;n++)physics(1/120);');
assert.equal(run('turn'),1);assert.equal(run('aiThinking'),true);const blueWorker=workers.at(-1);assert.equal(blueWorker.request.player,1);
blueWorker.onmessage({data:watchReply});run('for(let n=0;n<2600&&moving;n++)physics(1/120);');assert.equal(run('turn'),0);assert.equal(run('aiThinking'),true);
const nextRed=workers.at(-1);element('stop-watch').events.click();assert.equal(nextRed.terminated,true);assert.equal(run('gameStarted'),false);
nextRed.onmessage({data:watchReply});assert.equal(run('shots'),0);assert.equal(run('moving'),false);
// Spectators can independently set and lock the two AI levels.
element('restart').events.click();element('opponent').value='watch';element('red-ai-level').value='2';element('blue-ai-level').value='4';element('start-game').events.click();
assert.equal(run('activeAILevel()'),2);assert.equal(workers.at(-1).request.budgetMs,8);
assert.equal(element('red-ai-level').disabled,true);assert.equal(element('blue-ai-level').disabled,true);
element('red-ai-level').value='5';element('red-ai-level').events.change();assert.equal(run('activeAILevel()'),2);
workers.at(-1).onmessage({data:watchReply});run('for(let n=0;n<2600&&moving;n++)physics(1/120);');
assert.equal(run('turn'),1);assert.equal(run('activeAILevel()'),4);assert.equal(workers.at(-1).request.budgetMs,30);
element('stop-watch').events.click();assert.equal(run('gameStarted'),false);
reset();assert.equal(element('match-levels').hidden,true);
prepareAI();assert.equal(element('match-levels').hidden,false);assert.equal(element('red-level-display').hidden,true);assert.equal(element('blue-level-display').textContent,'青 AI Lv.5');
element('restart').events.click();element('opponent').value='watch';element('red-ai-level').value='2';element('blue-ai-level').value='4';element('start-game').events.click();
assert.equal(element('red-level-display').textContent,'赤 AI Lv.2');assert.equal(element('blue-level-display').textContent,'青 AI Lv.4');assert.equal(element('red-level-display').hidden,false);
element('stop-watch').events.click();assert.equal(element('match-levels').hidden,true);
console.log('PASS: exact shared simulation, immutable inputs, canceled candidates, strict dot coverage, generated worker, winning shot, search deadline/parameters, stale-response cancellation, AI launch, paired undo, reset/mode switch and worker failure.');
console.log('Opening search:',opening.evaluated,'candidates in',Math.round(opening.elapsed),'ms.');
