import './dungeon.css';
import { DUNGEONS, BOONS, createRun, startBattle, takeTurn, chooseBoon, advanceRoom, getIntent } from './dungeon-data.js';
import { createDungeonScene } from './dungeon-scene.js';

const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const glyph = {attack:'✦', skill:'ϟ', guard:'◇', heal:'✚', power:'✦', vitality:'♡', ward:'◇'};

/** Owns a temporary expedition. Only a completed run can update the island save. */
export function initDungeonUI({ host, getPartner, getProgress, onClaim, onOpen, onClose }) {
  const overlay = document.createElement('section');
  overlay.className = 'dungeon-overlay';
  overlay.setAttribute('aria-label', '던전 원정');
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="dungeon-lobby" aria-label="던전 선택">
      <div class="dungeon-lobby-top"><div><span class="dungeon-eyebrow">THE EXPEDITION JOURNAL</span><h2>섬 아래, 새로운 모험.</h2><p>당신이 만든 친구와 오래된 문 너머로.</p></div><button class="dungeon-iconbutton" data-dungeon-close aria-label="원정 로비 닫기">×</button></div>
      <div class="dungeon-lobby-body"><div class="dungeon-feature"><div class="dungeon-art" aria-hidden="true"><span class="portal-star">✦</span><div class="portal-arch"><div class="portal-core"></div></div><i class="portal-step"></i></div><div class="dungeon-feature-copy"><span class="dungeon-eyebrow" id="dungeon-preview-eyebrow"></span><h3 id="dungeon-preview-title"></h3><p id="dungeon-preview-description"></p><div class="dungeon-rewards" id="dungeon-preview-rewards"></div></div></div><div class="dungeon-list" aria-label="탐험할 던전"></div></div>
      <div class="dungeon-launchbar"><div><span class="dungeon-eyebrow">YOUR PARTNER</span><strong id="dungeon-launch-partner"></strong><small>새로고침하거나 만들기·컬렉션으로 이동하면 원정은 끝나요. 기존 친구와 섬 기록은 유지돼요.</small></div><button class="dungeon-primary" id="dungeon-start">원정 출발 <span>↗</span></button></div>
    </section>
    <section class="dungeon-game" hidden aria-label="진행 중인 던전">
      <div class="dungeon-stage" tabindex="0" aria-label="던전 3D 화면. WASD 이동, E 상호작용"></div>
      <div class="dungeon-hud"><div class="dungeon-heading"><span class="dungeon-eyebrow" id="dungeon-depth">DUNGEON EXPEDITION</span><h2 id="dungeon-title"></h2><div class="dungeon-room-track" id="dungeon-room-track"></div></div><div class="dungeon-hud-actions"><button class="dungeon-iconbutton" id="dungeon-help" aria-label="던전 조작 안내">?</button><button class="dungeon-iconbutton" id="dungeon-pause" aria-label="원정 일시 정지">Ⅱ</button><button class="dungeon-button" id="dungeon-return">귀환 ↗</button></div></div>
      <aside class="dungeon-objective"><span class="dungeon-objective-label">이번 방의 목표</span><strong class="dungeon-objective-text" id="dungeon-objective"></strong><p id="dungeon-objective-tip"></p></aside>
      <div class="dungeon-playerbar"><div class="dungeon-player-name"><span id="dungeon-partner-name"></span><strong id="dungeon-health-label"></strong></div><div class="dungeon-health-track" role="meter" aria-label="파트너 체력" aria-valuemin="0"><span id="dungeon-health-fill"></span></div><div class="dungeon-resources"><span id="dungeon-energy"></span><span id="dungeon-potions"></span></div><small id="dungeon-boon-summary">강화 효과는 이번 원정에만 적용돼요.</small></div>
      <div class="dungeon-encounter" hidden><span id="dungeon-nearby"></span><button class="dungeon-primary" id="dungeon-interact"><kbd>E</kbd> <span></span></button></div>
      <div class="dungeon-controls"><span>WASD 이동 · Shift 달리기 · Space 점프</span><span>E 상호작용 · Esc 일시 정지</span></div>
      <div class="dungeon-touch"><div class="dungeon-pad"><button data-dungeon-direction="up" aria-label="던전 앞으로 이동">↑</button><button data-dungeon-direction="left" aria-label="던전 왼쪽 이동">←</button><button data-dungeon-direction="down" aria-label="던전 뒤로 이동">↓</button><button data-dungeon-direction="right" aria-label="던전 오른쪽 이동">→</button></div><button class="dungeon-jump" id="dungeon-jump" aria-label="던전 점프">↟</button></div>
      <section class="dungeon-battle" hidden aria-label="턴 전투"><div class="dungeon-battle-heading"><span class="dungeon-eyebrow">ENCOUNTER</span><strong id="dungeon-enemy-name"></strong><span id="dungeon-enemy-hp"></span></div><div class="dungeon-health-track enemy"><span id="dungeon-enemy-fill"></span></div><div class="dungeon-intent" id="dungeon-intent"></div><div class="dungeon-battle-actions"><button data-battle-action="attack"><strong>✦ 기본 공격 <kbd>J</kbd></strong><small>기력 +1</small></button><button data-battle-action="skill"><strong>ϟ 속성 기술 <kbd>K</kbd></strong><small>기력 2 사용</small></button><button data-battle-action="guard"><strong>◇ 방어 <kbd>L</kbd></strong><small>피해 감소 · 기력 +1</small></button><button data-battle-action="heal"><strong>✚ 회복 <kbd>H</kbd></strong><small>체력 +40 · 물약 1개</small></button></div><p class="dungeon-log" id="dungeon-battle-log" role="status" aria-live="polite"></p><small class="dungeon-battle-hint">선택할 때만 턴이 흘러요. 강한 공격이 예고되면 방어!</small></section>
    </section>
    <div class="dungeon-choice-overlay" hidden><div class="dungeon-sheet" tabindex="-1"></div></div>
    <div class="dungeon-toast" role="status" hidden></div>`;
  host.appendChild(overlay);
  const $ = selector => overlay.querySelector(selector);
  const cleanups = [];
  const listen = (target, event, handler, options) => { target.addEventListener(event, handler, options); cleanups.push(() => target.removeEventListener(event, handler, options)); };
  let selected = DUNGEONS[0].id;
  let opened = false;
  let scene = null;
  let run = null;
  let nearest = null;
  let paused = false;
  let sheetMode = null;
  let previousFocus = null;
  let keys = new Set();
  let touch = { x:0, z:0 };
  let toastTimer;
  let resultClaim = null;
  let sheetFocusKey = '';
  let lastNearestKey = '';

  const currentDungeon = () => DUNGEONS.find(d => d.id === (run?.dungeonId || selected)) || DUNGEONS[0];
  function toast(text) { $('.dungeon-toast').textContent = text; $('.dungeon-toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('.dungeon-toast').hidden = true, 3500); }
  function clearInput() { keys.clear();touch={x:0,z:0};scene?.setInput({x:0,z:0,run:false}); }
  function syncActivity() { scene?.setActive(opened && !!run && !paused && !document.hidden); if(!opened||paused||sheetMode||run?.status!=='exploring')clearInput(); }
  function updateInput() {
    if (!opened || paused || sheetMode || run?.status !== 'exploring') return clearInput();
    scene?.setInput({x:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+touch.x,z:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'))+touch.z,run:keys.has('ShiftLeft')||keys.has('ShiftRight')});
  }
  function renderLobby() {
    const dungeon=DUNGEONS.find(d=>d.id===selected) || DUNGEONS[0];
    const cleared=getProgress().dungeons?.cleared || [];
    overlay.style.setProperty('--dungeon-accent',dungeon.accent || dungeon.color);
    $('#dungeon-preview-eyebrow').textContent=dungeon.subtitle || 'THREE ROOMS · ONE NEW FRIEND';
    $('#dungeon-preview-title').textContent=dungeon.name;
    $('#dungeon-preview-description').textContent=dungeon.description;
    $('#dungeon-preview-rewards').innerHTML=cleared.includes(dungeon.id)?'<span class="dungeon-reward">✓ 최초 원정 완료</span><span class="dungeon-reward">재도전 · 추가 영구 보상 없음</span>':'<span class="dungeon-reward">✦ '+dungeon.reward.exp+' EXP</span><span class="dungeon-reward">◉ 볼 +'+dungeon.reward.balls+'</span><span class="dungeon-reward">♡ '+escape(dungeon.guardian.name)+'</span>';
    $('.dungeon-list').innerHTML=DUNGEONS.map((d,i)=>'<button class="dungeon-choice '+(d.id===selected?'selected':'')+'" data-dungeon-select="'+d.id+'" aria-pressed="'+(d.id===selected)+'" style="--choice-accent:'+(d.accent||d.color)+'"><span class="dungeon-number">0'+(i+1)+'</span><span><strong>'+escape(d.name)+'</strong><p>'+escape(d.subtitle || d.description)+'</p></span><span class="dungeon-tag">'+(cleared.includes(d.id)?'✓ 완료':escape(d.difficulty))+'</span></button>').join('');
    $('#dungeon-launch-partner').textContent=getPartner().name;
    $('.dungeon-list').querySelectorAll('[data-dungeon-select]').forEach(button=>button.onclick=()=>{selected=button.dataset.dungeonSelect;renderLobby();$('[data-dungeon-select="'+selected+'"]').focus();});
  }
  function showSheet(mode, html) {
    clearInput();sheetMode=mode;
    $('.dungeon-choice-overlay').hidden=false;
    $('.dungeon-sheet').innerHTML=html;
    if(sheetFocusKey!==mode){sheetFocusKey=mode;($('.dungeon-sheet button') || $('.dungeon-sheet')).focus({preventScroll:true});}
  }
  function hideSheet() { sheetMode=null;sheetFocusKey='';$('.dungeon-choice-overlay').hidden=true;syncActivity(); }
  function updateNearest(value) {
    nearest=value;
    const key=[value?.kind,value?.id,run?.status,paused,sheetMode].join(':');
    if(key===lastNearestKey)return;
    lastNearestKey=key;
    const encounter=$('.dungeon-encounter');
    if(!run||run.status!=='exploring'||paused||sheetMode||!value){encounter.hidden=true;return;}
    const content={enemy:[currentDungeon().rooms[run.roomIndex].enemy.name,'도전하기'],gate:['다음 방으로 가는 문','다음 방으로'],exit:['섬으로 이어지는 입구','섬으로 귀환']}[value.kind];
    if(!content){encounter.hidden=true;return;}
    $('#dungeon-nearby').textContent=content[0];$('#dungeon-interact span').textContent=content[1];encounter.hidden=false;
  }
  function renderRun() {
    if(!run)return;
    const dungeon=currentDungeon();
    scene?.setRunState(run);
    $('#dungeon-title').textContent=dungeon.name;
    $('#dungeon-depth').textContent='ROOM '+(run.roomIndex+1)+' / 3 · '+dungeon.rooms[run.roomIndex].name;
    $('#dungeon-room-track').innerHTML=dungeon.rooms.map((room,index)=>'<span class="'+(run.roomCleared.includes(index)?'done':index===run.roomIndex?'current':'')+'">'+(run.roomCleared.includes(index)?'✓':index+1)+' '+escape(room.name)+'</span>').join('');
    $('#dungeon-partner-name').textContent=run.partner.name;
    $('#dungeon-health-label').textContent=run.hp+' / '+run.maxHp;
    $('#dungeon-health-fill').style.width=Math.max(0,run.hp/run.maxHp*100)+'%';
    const meter=$('.dungeon-playerbar [role="meter"]');meter.setAttribute('aria-valuenow',run.hp);meter.setAttribute('aria-valuemax',run.maxHp);
    $('#dungeon-energy').textContent='기력 '+ '◆'.repeat(run.energy)+'◇'.repeat(Math.max(0,3-run.energy));
    $('#dungeon-potions').textContent='✚ 회복약 '+run.potions;
    $('#dungeon-boon-summary').textContent=run.boons.length?run.boons.map(id=>BOONS.find(b=>b.id===id)?.name || id).join(' · '):'강화 효과는 이번 원정에만 적용돼요.';
    const cleared=run.roomCleared.includes(run.roomIndex);
    $('#dungeon-objective').textContent=cleared?'열린 문으로 이동하세요':dungeon.rooms[run.roomIndex].enemy.name+'에게 도전';
    $('#dungeon-objective-tip').textContent=cleared?'북쪽 문에 다가가 E를 누르세요.':'앞으로 이동해 친구에게 가까이 다가가세요.';
    $('.dungeon-battle').hidden=run.status!=='battle';
    $('.dungeon-touch').hidden=run.status!=='exploring'||paused||!!sheetMode;
    $('.dungeon-controls').hidden=run.status!=='exploring';
    $('.dungeon-objective').hidden=run.status==='battle';
    if(run.status==='battle') {
      const battle=run.battle;
      $('#dungeon-enemy-name').textContent=battle.enemy.name;
      $('#dungeon-enemy-hp').textContent=battle.enemyHp+' / '+battle.enemyMaxHp;
      $('#dungeon-enemy-fill').style.width=Math.max(0,battle.enemyHp/battle.enemyMaxHp*100)+'%';
      const intent=getIntent(run);
      $('#dungeon-intent').className='dungeon-intent '+intent.kind;
      $('#dungeon-intent').innerHTML='<span>다음 행동</span><strong>'+escape(intent.name)+'</strong><small>'+escape(intent.description)+(intent.damage?' · 예상 피해 '+intent.damage:'')+'</small>';
      $('[data-battle-action="skill"]').disabled=run.energy<2;
      $('[data-battle-action="heal"]').disabled=run.potions<1 || run.hp>=run.maxHp;
      $('#dungeon-battle-log').textContent=(run.log || []).slice(-2).join(' ');
    }
    if(run.status==='boon') {
      showSheet('boon-'+run.roomIndex,'<span class="dungeon-eyebrow">ROOM CLEARED · CHOOSE YOUR BLESSING</span><h2>조금 더 강해질 시간.</h2><p>이번 원정에 함께할 힘을 하나 골라주세요.</p><div class="dungeon-boons">'+BOONS.filter(b=>!run.boons.includes(b.id)).map(b=>'<button class="dungeon-boon" data-boon="'+b.id+'"><span>'+glyph[b.id]+'</span><strong>'+escape(b.name)+'</strong><p>'+escape(b.description)+'</p><small>이 힘을 선택 →</small></button>').join('')+'</div>');
      $('.dungeon-sheet').querySelectorAll('[data-boon]').forEach(button=>button.onclick=()=>{run=chooseBoon(run,button.dataset.boon);hideSheet();renderRun();$('.dungeon-stage').focus({preventScroll:true});});
    } else if(run.status==='cleared') {
      if(!resultClaim)resultClaim=onClaim(run);
      renderResult();
    } else if(run.status==='failed') {
      showSheet('failed','<span class="dungeon-result-icon">♡</span><span class="dungeon-eyebrow">EVERY ADVENTURE COUNTS</span><h2>잠깐 숨을 고를까요?</h2><p>친구와 함께 무사히 돌아왔어요. 기존 도감과 섬 기록은 그대로예요.</p><div class="dungeon-result-stats"><span>도달한 방 <strong>'+(run.roomIndex+1)+' / 3</strong></span><span>전투 턴 <strong>'+run.turns+'</strong></span></div><div class="dungeon-result-actions"><button class="dungeon-primary" id="dungeon-retry">다시 도전</button><button class="dungeon-button" data-result-lobby>다른 던전 선택</button><button class="dungeon-button" data-dungeon-close>섬으로 돌아가기</button></div>');
      $('#dungeon-retry').onclick=launch;
      bindResultActions();
    }
    syncActivity();lastNearestKey='';updateNearest(nearest);
  }
  function renderResult() {
    const dungeon=currentDungeon();
    const success=resultClaim?.claimed;
    const repeat=resultClaim?.reason==='already-claimed';
    const reason=success?'새로운 친구가 탐험 도감에 등록됐어요.':repeat?'이미 최초 보상을 받은 던전이에요. 다시 한 번 멋지게 해냈어요!':resultClaim?.reason==='capacity'?'도감이 가득 차 보상을 받지 못했어요. 최초 보상은 아직 남아 있어요.':'보상을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해주세요.';
    showSheet('cleared','<span class="dungeon-result-icon">✦</span><span class="dungeon-eyebrow">EXPEDITION COMPLETE</span><h2>'+escape(dungeon.name)+' 완료!</h2><p>'+reason+'</p><div class="dungeon-result-stats"><span>완료한 방 <strong>3 / 3</strong></span><span>전투 턴 <strong>'+run.turns+'</strong></span><span>남은 체력 <strong>'+run.hp+'</strong></span></div>'+(success?'<div class="dungeon-rewards"><span class="dungeon-reward">♡ '+escape(dungeon.guardian.name)+'</span><span class="dungeon-reward">+'+dungeon.reward.exp+' EXP</span><span class="dungeon-reward">몬스터볼 +'+dungeon.reward.balls+'</span></div>':'')+'<div class="dungeon-result-actions">'+(!success&&!repeat?'<button class="dungeon-primary" id="dungeon-claim-again">보상 저장 다시 시도</button>':'')+'<button class="dungeon-primary" data-dungeon-close>섬으로 돌아가기 ↗</button><button class="dungeon-button" data-result-lobby>다음 원정 준비</button></div>');
    const retry=$('#dungeon-claim-again');if(retry)retry.onclick=()=>{resultClaim=onClaim(run);renderResult();};
    bindResultActions();
  }
  function bindResultActions() { $('.dungeon-sheet').querySelectorAll('[data-dungeon-close]').forEach(b=>b.onclick=close);$('.dungeon-sheet').querySelectorAll('[data-result-lobby]').forEach(b=>b.onclick=backToLobby); }
  function launch() {
    clearInput();scene?.dispose();scene=null;paused=false;resultClaim=null;nearest=null;hideSheet();
    run=createRun(selected,getPartner());
    $('.dungeon-lobby').hidden=true;$('.dungeon-game').hidden=false;
    overlay.style.setProperty('--dungeon-accent',currentDungeon().accent || currentDungeon().color);
    try {
      scene=createDungeonScene($('.dungeon-stage'),{partner:run.partner,dungeon:currentDungeon(),onUpdate:snapshot=>{if(opened && run)updateNearest(snapshot.nearest);},onInteract:interact});
      renderRun();$('.dungeon-stage').focus({preventScroll:true});
    } catch(error) {
      console.error('Dungeon renderer failed:',error);scene?.dispose();scene=null;run=null;
      showSheet('error','<h2>던전을 열지 못했어요.</h2><p>WebGL을 지원하는 브라우저에서 다시 시도해주세요.</p><button class="dungeon-primary" data-dungeon-close>섬으로 돌아가기</button>');bindResultActions();
    }
  }
  function backToLobby() { clearInput();scene?.dispose();scene=null;run=null;paused=false;resultClaim=null;hideSheet();$('.dungeon-lobby').hidden=false;$('.dungeon-game').hidden=true;renderLobby();$('.dungeon-lobby').scrollTop=0;$('#dungeon-start').focus({preventScroll:true}); }
  function interact() {
    if(!opened||paused||sheetMode||run?.status!=='exploring'||!nearest)return;
    if(nearest.kind==='enemy') {run=startBattle(run);clearInput();renderRun();$('[data-battle-action="attack"]').focus({preventScroll:true});}
    else if(nearest.kind==='gate') {run=advanceRoom(run);nearest=null;scene?.pulse('clear');renderRun();$('.dungeon-stage').focus({preventScroll:true});}
    else if(nearest.kind==='exit')confirmReturn();
  }
  function battleAction(action) {
    if(!opened||paused||sheetMode||run?.status!=='battle')return;
    const previousHP=run.hp;
    const turns=run.turns;
    run=takeTurn(run,action);
    if(run.turns!==turns){scene?.pulse(run.status==='cleared' || run.status==='boon'?'clear':run.hp<previousHP?'damage':'attack');renderRun();}
  }
  function pause(mode='pause') {
    if(!run||!opened||sheetMode && !['pause','help','return'].includes(sheetMode))return;
    paused=true;clearInput();syncActivity();
    const heading=mode==='help'?'함께 공략해봐요.':mode==='return'?'이번 원정을 마칠까요?':'잠깐 쉬어가요.';
    const copy=mode==='help'?'WASD / 방향키로 이동하고 가까이에서 E를 눌러요. 전투는 J 공격, K 속성 기술, L 방어, H 회복이에요. 기력은 공격·방어로 채울 수 있어요. 적이 힘을 모으면 다음 강타에 대비하세요.':mode==='return'?'현재 원정의 방 진행과 강화는 초기화돼요. 이미 모은 친구와 섬 기록은 유지돼요.':'준비되면 모험을 이어가세요.';
    showSheet(mode,'<span class="dungeon-eyebrow">TAKE YOUR TIME</span><h2>'+heading+'</h2><p>'+copy+'</p><div class="dungeon-result-actions"><button class="dungeon-primary" id="dungeon-resume">계속 탐험하기</button>'+(mode==='return'?'<button class="dungeon-button" data-dungeon-close>원정을 마치고 귀환</button>':'')+'</div>');
    $('#dungeon-resume').onclick=resume;bindResultActions();
  }
  function resume() {paused=false;hideSheet();renderRun();$('.dungeon-stage').focus({preventScroll:true});}
  function confirmReturn() {if(run && !['cleared','failed'].includes(run.status))pause('return');else close();}
  function open() {if(opened)return;opened=true;previousFocus=document.activeElement;onOpen();overlay.hidden=false;backToLobby();}
  function close() {if(!opened)return;opened=false;clearInput();scene?.dispose();scene=null;run=null;paused=false;hideSheet();overlay.hidden=true;clearTimeout(toastTimer);$('.dungeon-toast').hidden=true;onClose();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}

  $('[data-dungeon-close]').onclick=close;
  $('#dungeon-start').onclick=launch;
  $('#dungeon-interact').onclick=interact;
  $('#dungeon-pause').onclick=()=>pause();
  $('#dungeon-help').onclick=()=>pause('help');
  $('#dungeon-return').onclick=confirmReturn;
  $('#dungeon-jump').onclick=()=>{if(run?.status==='exploring'&&!sheetMode)scene?.jump();};
  overlay.querySelectorAll('[data-battle-action]').forEach(button=>button.onclick=()=>battleAction(button.dataset.battleAction));
  overlay.querySelectorAll('[data-dungeon-direction]').forEach(button=>{
    const directions={up:{x:0,z:-1},down:{x:0,z:1},left:{x:-1,z:0},right:{x:1,z:0}};
    listen(button,'pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);touch=directions[button.dataset.dungeonDirection];updateInput();});
    ['pointerup','pointercancel','lostpointercapture'].forEach(event=>listen(button,event,()=>{touch={x:0,z:0};updateInput();}));
  });
  listen(window,'keydown',event=>{
    if(!opened||event.ctrlKey||event.metaKey||event.altKey||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
    if(event.code==='Escape'){event.preventDefault();if(!run)close();else if(paused)resume();else pause();return;}
    if(event.code==='Tab') {
      const scope=sheetMode?$('.dungeon-sheet'):overlay;
      const controls=[...scope.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(el=>el.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(first && (event.shiftKey && (document.activeElement===first || !scope.contains(document.activeElement)))){event.preventDefault();last.focus();}
      else if(last && !event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      return;
    }
    if(!run||paused||sheetMode)return;
    if(run.status==='battle') {
      const action={KeyJ:'attack',KeyK:'skill',KeyL:'guard',KeyH:'heal',Digit1:'attack',Digit2:'skill',Digit3:'guard',Digit4:'heal'}[event.code];
      if(action){event.preventDefault();if(!event.repeat)battleAction(action);}return;
    }
    if(run.status!=='exploring')return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(event.code)){event.preventDefault();keys.add(event.code);updateInput();}
    if(event.repeat)return;
    if(event.code==='KeyE'){event.preventDefault();interact();}
    if(event.code==='Space' && event.target.tagName!=='BUTTON'){event.preventDefault();scene?.jump();}
  });
  listen(window,'keyup',event=>{keys.delete(event.code);if(opened)updateInput();});
  listen(window,'blur',clearInput);
  listen(document,'visibilitychange',()=>{clearInput();syncActivity();});
  return {open,close,isOpen:()=>opened,dispose(){close();cleanups.forEach(fn=>fn());clearTimeout(toastTimer);overlay.remove();}};
}
