import './world.css';
import { initDungeonUI } from './dungeon-ui.js';
import { createWorldScene } from './world-scene.js';
import { PRESETS, TYPES, normalizeConfig } from './data.js';
import { REGIONS, LANDMARKS, BERRY_NODES, WORLD_BOUNDS, WORLD_KEY, buildSpawns, loadProgress, saveProgress, registerCatch, discoverAt, visitLandmark, collectBerry, getLevel, getQuests, claimDungeonReward } from './world-data.js';

const safe = (text) => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16M15 5v16"/>',
  leaf:'<path d="M20 4C5 1 1 14 7 18s15-2 13-14Z"/><path d="m5 21 10-10"/>',
  book:'<path d="M12 6C8 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-6-1-10 2Zm0 0v15"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  flag:'<path d="M5 21V3m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4m0-15.6-1.4 1.4M5.6 18.4l-1.4 1.4"/>',
  expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  play:'<path d="m8 4 12 8-12 8Z"/>',
  home:'<path d="m3 10 9-7 9 7v11H3Zm6 11v-8h6v8"/>',
  star:'<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/>',
  jump:'<path d="M12 21V3m-6 6 6-6 6 6M4 21h16"/>',
};
const icon = name => '<svg class="world-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.star) + '</svg>';
const ball = '<span class="poke-ball" aria-hidden="true"></span>';
const badge = config => '<span class="creature-token" style="--creature:' + config.color + ';--detail:' + config.accent + '"><span></span></span>';

export function initWorldUI({ getDraft, getCollection, onEdit }) {
  const section = document.createElement('section');
  section.id = 'world-view';
  section.setAttribute('aria-label', '포켓몬 오픈월드 탐험');
  section.innerHTML = '<div class="world-intro"><div><span class="section-kicker">A WORLD OF YOUR OWN</span><h1>작은 친구와, 더 넓은 세상으로.</h1><p>발길 닿는 곳마다 새로운 만남이 기다려요.</p></div><div class="world-intro-actions"><span class="world-save-state"><span></span><span id="world-save-label">탐험 기록 자동 저장</span></span><button class="world-button light" id="world-help">' + icon('compass') + '탐험 가이드</button></div></div>' +
    '<div class="world-shell" id="world-shell"><div id="world-canvas" aria-label="이동하며 포켓몬을 발견하고 포획하는 3D 오픈월드" tabindex="0"></div>' +
    '<div class="world-top"><div class="location-card"><span class="location-emblem">' + icon('compass') + '</span><div><span class="world-eyebrow">SERENE ISLAND</span><h2 id="world-region">새싹 초원</h2></div><span class="weather">' + icon('sun') + '맑음</span></div><div class="world-top-actions"><span class="ball-counter" title="포획에 사용하는 몬스터볼">' + ball + '<strong id="world-balls">12</strong></span><button class="world-square" id="world-pause" aria-label="탐험 일시 정지" title="일시 정지">' + icon('pause') + '</button><button class="world-square" id="world-expand" aria-label="탐험 화면 확대" title="화면 확대">' + icon('expand') + '</button></div></div>' +
    '<aside class="world-quests"><div class="quest-title"><span>' + icon('flag') + '오늘의 탐험</span><span id="quest-completed">0 / 4</span></div><div id="world-quest-list"></div><p class="quest-footnote">서두르지 않아도 괜찮아요.</p></aside>' +
    '<button class="minimap-card" id="world-map-button" aria-label="섬 전체 지도 열기"><span class="map-north">N</span><canvas id="world-minimap" width="260" height="260" aria-label="현재 위치와 주변 포켓몬 미니맵"></canvas><span>' + icon('map') + '섬 지도 <kbd>M</kbd></span></button>' +
    '<div class="discovery-banner" id="discovery-banner" role="status"><span>NEW DISCOVERY</span><strong></strong></div>' +
    '<div class="world-encounter" id="world-encounter" hidden><span class="encounter-symbol">' + ball + '</span><div><small id="encounter-kind">야생 포켓몬 발견</small><strong id="encounter-name"></strong></div><button id="world-interact" class="world-button green"><kbd>E</kbd><span id="encounter-action">다가가기</span></button></div>' +
    '<div class="world-bottom"><button class="partner-card" id="world-partner-button"><span id="partner-avatar"></span><span><small>MY PARTNER</small><strong id="world-partner-name"></strong><span class="partner-level"><span id="world-level">Lv. 1</span><span class="xp-track"><span id="world-xp"></span></span></span></span>' + icon('chevron') + '</button><div class="keyboard-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동</span><span><kbd>Shift</kbd> 달리기</span><span><kbd>Space</kbd> 점프</span><span>드래그로 시점 회전</span></div><button class="dex-button" id="world-dex-button">' + icon('book') + '<span>탐험 도감 <strong id="world-caught-count">0</strong></span><kbd>B</kbd></button></div>' +
    '<div class="mobile-controls"><div class="direction-pad" aria-label="이동 방향"><button data-direction="up" aria-label="앞으로 이동">↑</button><button data-direction="left" aria-label="왼쪽 이동">←</button><button data-direction="down" aria-label="뒤로 이동">↓</button><button data-direction="right" aria-label="오른쪽 이동">→</button></div><div class="mobile-actions"><button id="mobile-run" aria-label="달리기" aria-pressed="false">달리기</button><button id="mobile-jump" aria-label="점프">' + icon('jump') + '</button></div></div>' +
    '<div class="world-pause-overlay" id="world-paused" hidden><div>' + icon('pause') + '<h2>잠깐 쉬어가요.</h2><p>친구들이 기다리고 있어요.</p><button class="world-button green" id="world-resume">' + icon('play') + '탐험 계속하기</button></div></div>' +
    '<div class="world-loading" id="world-loading"><span class="loading-orbit">' + ball + '</span><p>우리의 섬을 준비하고 있어요…</p></div></div>' +
    '<div class="world-statusbar"><span>' + icon('leaf') + '<span id="world-bottom-tip">풀숲 사이 작은 친구에게 다가가 보세요. E 키로 말을 걸 수 있어요.</span></span><span><span class="live-dot"></span>나만의 오픈월드 · 싱글 플레이</span></div>';
  document.querySelector('main').prepend(section);
  const $ = selector => section.querySelector(selector);
  const shell = $('#world-shell');
  let progress = loadProgress();
  let spawns = buildSpawns(getCollection());
  let world = null;
  let dungeonUI = null;
  let active = false;
  let paused = false;
  let currentNearest = null;
  let currentPosition = { ...progress.position };
  let heading = 0;
  let partner = normalizeConfig(getDraft());
  let partnerId = progress.partnerId;
  let keys = new Set();
  let touchDirection = { x: 0, z: 0 };
  let mobileRun = false;
  let saveTimer = null;
  let saveWarning = false;
  let announcementTimer;
  let capture = null;
  let captureFrame;
  let disposed = false;
  let previousRegion = '';
  let dirty = false;
  const dialogs = [];
  const cleanups = [];
  const listen = (target, event, handler, options) => { target.addEventListener(event, handler, options); cleanups.push(() => target.removeEventListener(event, handler, options)); };
  const dungeonButton = document.createElement('button');
  dungeonButton.className = 'world-button green world-dungeon-cta';
  dungeonButton.id = 'world-dungeon-button';
  dungeonButton.innerHTML = icon('star') + '던전 원정 <span id="dungeon-clear-count">0 / 3</span>';
  $('.world-intro-actions').prepend(dungeonButton);
  dungeonButton.onclick = () => dungeonUI?.open();

  function notify(text) {
    const target = document.getElementById('toast');
    target.textContent = text;
    target.classList.add('visible');
    clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => target.classList.remove('visible'), 4000);
  }
  function persist() {
    if (!dirty) return;
    try { progress = saveProgress({ ...progress, position: currentPosition, partnerId }); $('#world-save-label').textContent = '탐험 기록 자동 저장'; saveWarning = false; dirty = false; }
    catch { $('#world-save-label').textContent = '저장 공간을 확인해주세요'; if (!saveWarning) { notify('현재 브라우저에 탐험을 저장할 수 없어요. 저장 공간 설정을 확인해주세요.'); saveWarning = true; } }
  }
  function updateHUD() {
    $('#world-balls').textContent = progress.balls;
    $('#world-caught-count').textContent = progress.caught.length;
    $('#dungeon-clear-count').textContent = (progress.dungeons?.cleared.length || 0) + ' / 3';
    $('#world-partner-name').textContent = partner.name;
    $('#partner-avatar').innerHTML = badge(partner);
    const level = getLevel(progress.exp);
    $('#world-level').textContent = 'Lv. ' + level.level;
    $('#world-xp').style.width = Math.min(100, level.current / level.required * 100) + '%';
    const quests = getQuests(progress);
    $('#quest-completed').textContent = quests.filter(q => q.complete).length + ' / ' + quests.length;
    $('#world-quest-list').innerHTML = quests.map(q => '<div class="world-quest ' + (q.complete ? 'complete' : '') + '"><span class="quest-check">' + (q.complete ? icon('check') : '') + '</span><div><strong>' + safe(q.title) + '</strong><span class="quest-progress"><span style="width:' + Math.min(100, q.current / q.target * 100) + '%"></span></span></div><small>' + q.current + '/' + q.target + '</small></div>').join('');
  }
  function partnerOptions() {
    return [{ id: 'draft', config: normalizeConfig(getDraft()), label: '지금 만들고 있는 친구' }, ...getCollection().map(item => ({ id: item.id, config: item.config, label: '내가 만든 포켓몬' })), ...progress.caught.map(item => ({ id: 'caught:' + item.spawnId, config: item.config, label: '탐험에서 만난 친구' }))];
  }
  function resolvePartner() {
    partner = normalizeConfig(partnerOptions().find(item => item.id === partnerId)?.config || getDraft());
    if (!partnerOptions().some(item => item.id === partnerId)) partnerId = 'draft';
  }
  resolvePartner();

  function drawMap(canvas, large = false) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvas.width;
    const scale = size / 158;
    const project = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#bbd9d5'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#9ab879';
    ctx.beginPath();
    ctx.moveTo(...project(-42,-62)); ctx.bezierCurveTo(...project(-80,-45),...project(-67,37),...project(-42,56)); ctx.bezierCurveTo(...project(-17,79),...project(64,61),...project(66,18)); ctx.bezierCurveTo(...project(80,-35),...project(25,-80),...project(-42,-62)); ctx.fill();
    for (const region of REGIONS) {
      const [x,z] = project(region.x,region.z);
      ctx.beginPath(); ctx.fillStyle = region.color + '99'; ctx.ellipse(x,z,region.radius * scale*.83,region.radius*scale*.75,0,0,Math.PI*2); ctx.fill();
    }
    ctx.lineWidth = 3.5 * size/260; ctx.strokeStyle = '#e8d9b4'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(...project(0,32)); ctx.lineTo(...project(0,8)); ctx.lineTo(...project(-30,-8)); ctx.moveTo(...project(0,8)); ctx.lineTo(...project(34,0)); ctx.moveTo(...project(0,8)); ctx.lineTo(...project(0,-40)); ctx.stroke();
    ctx.fillStyle = '#83bbc8'; ctx.beginPath(); ctx.ellipse(...project(34,7),11*scale,8*scale,0,0,Math.PI*2); ctx.fill();
    for (const spawn of spawns) {
      if (progress.caught.some(c => c.spawnId === spawn.id)) continue;
      if (!large && Math.hypot(spawn.x-currentPosition.x,spawn.z-currentPosition.z)>24) continue;
      ctx.beginPath(); ctx.fillStyle = spawn.custom ? '#f8e8a1' : '#fffbe9'; ctx.arc(...project(spawn.x,spawn.z),large?4:3,0,Math.PI*2); ctx.fill();
    }
    for (const landmark of LANDMARKS) {
      const [x,y] = project(landmark.x,landmark.z);
      ctx.fillStyle = progress.landmarks.includes(landmark.id) ? '#fff7d8' : '#567352';
      ctx.fillRect(x-3,y-3,6,6);
      if (large) { ctx.font = '600 ' + size/38 + 'px sans-serif'; ctx.fillStyle = '#324d40'; ctx.textAlign='center'; ctx.fillText(landmark.name,x,y-11); }
    }
    ctx.save();ctx.translate(...project(currentPosition.x,currentPosition.z));ctx.rotate(-heading);
    ctx.shadowColor='#355a4b66';ctx.shadowBlur=6;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,large?9:7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#385a45';ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(-4,-4);ctx.lineTo(4,-4);ctx.closePath();ctx.fill();ctx.restore();
  }

  function updateNearest(nearest) {
    currentNearest = nearest;
    const card = $('#world-encounter');
    if (!nearest || paused || capture || anyDialog()) { card.hidden = true; return; }
    let title = '';
    let kind = '';
    let action = '';
    if (nearest.kind === 'wild') {
      const spawn = spawns.find(s => s.id === nearest.id);
      if (!spawn || progress.caught.some(c => c.spawnId === spawn.id)) { card.hidden=true;return; }
      title = spawn.config.name; kind = spawn.custom ? '내가 만든 포켓몬 발견!' : '야생 포켓몬 · Lv. ' + spawn.level; action = '포획하기';
    } else if (nearest.kind === 'berry') { title='반짝 열매';kind='몬스터볼 3개 + 경험치';action='줍기'; }
    else { const landmark=LANDMARKS.find(l=>l.id===nearest.id);if(!landmark){card.hidden=true;return;}title=landmark.name;kind=landmark.kind==='camp'?'몬스터볼을 보충하고 쉬어가요':landmark.kind==='ruins'?'세 던전으로 이어지는 오래된 문':'섬의 새로운 장소';action=landmark.kind==='camp'?'휴식하기':landmark.kind==='ruins'?'던전 입장':'발견하기'; }
    $('#encounter-name').textContent=title;$('#encounter-kind').textContent=kind;$('#encounter-action').textContent=action;
    card.hidden=false;
  }
  function onUpdate(snapshot) {
    if (Math.hypot(snapshot.position.x-currentPosition.x,snapshot.position.z-currentPosition.z)>.001) dirty=true;
    currentPosition={...snapshot.position};heading=snapshot.heading || 0;
    const next=discoverAt(progress,currentPosition);
    const found=next.discovered.find(id=>!progress.discovered.includes(id));
    progress=next;
    const region=REGIONS.find(r=>r.id===snapshot.regionId) || REGIONS[0];
    if (previousRegion!==region.id) { previousRegion=region.id;$('#world-region').textContent=region.name; }
    if(found) {
      const label=REGIONS.find(r=>r.id===found)?.name || region.name;
      $('#discovery-banner strong').textContent=label;$('#discovery-banner').classList.add('show');
      setTimeout(()=>{if(!disposed)$('#discovery-banner').classList.remove('show');},3500);
      dirty=true;updateHUD();persist();
    }
    updateNearest(snapshot.nearest);
    drawMap($('#world-minimap'));
  }
  function remainingSpawns() { return spawns.filter(s=>!progress.caught.some(c=>c.spawnId===s.id)); }
  function ensureWorld() {
    if(world || disposed)return;
    try {
      world=createWorldScene($('#world-canvas'),{partner,position:currentPosition,spawns:remainingSpawns(),landmarks:LANDMARKS,berries:BERRY_NODES.filter(b=>!progress.berries.includes(b.id)),onUpdate,onInteract:interact});
      $('#world-loading').hidden=true;
      syncActivity();
    } catch(error) {
      console.error('World renderer failed:',error);
      $('#world-loading').innerHTML='<div class="world-error">'+icon('compass')+'<h2>섬을 열지 못했어요.</h2><p>WebGL을 지원하는 최신 브라우저에서 하드웨어 가속을 켜고 다시 시도해주세요.</p><button class="world-button green" id="retry-world">다시 시도</button></div>';
      $('#retry-world').onclick=()=>location.reload();
    }
  }
  function anyDialog() { return dialogs.some(dialog=>dialog.open) || !!document.querySelector('dialog[open]'); }
  function clearInput() { keys.clear();touchDirection={x:0,z:0};world?.setInput({x:0,z:0,run:false}); }
  function syncActivity() {
    const running=active&&!paused&&!anyDialog()&&!dungeonUI?.isOpen()&&!document.hidden;
    world?.setActive(running);
    if(!running)clearInput();
    $('#world-paused').hidden=!paused;
    $('#world-pause').setAttribute('aria-label',paused?'탐험 계속하기':'탐험 일시 정지');
    $('#world-pause').innerHTML=icon(paused?'play':'pause');
  }
  function updateInput() {
    if(!active||paused||anyDialog()||dungeonUI?.isOpen())return clearInput();
    const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+touchDirection.x;
    const z=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'))+touchDirection.z;
    world?.setInput({x,z,run:mobileRun||keys.has('ShiftLeft')||keys.has('ShiftRight')});
  }
  function makeDialog(id,content) {
    const dialog=document.createElement('dialog');dialog.className='world-modal';dialog.id=id;
    dialog.innerHTML='<button class="world-square world-modal-close" aria-label="닫기">'+icon('close')+'</button>'+content;
    shell.appendChild(dialog);dialogs.push(dialog);
    const title=dialog.querySelector('h2');if(title){if(!title.id)title.id=id+'-title';dialog.setAttribute('aria-labelledby',title.id);}
    dialog.querySelector('.world-modal-close').onclick=()=>dialog.close();
    listen(dialog,'close',()=>{if(dialog===captureDialog)stopCapture();syncActivity();$('#world-canvas').focus({preventScroll:true});});
    listen(dialog,'click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    return dialog;
  }
  function openDialog(dialog) { clearInput();dialog.showModal();syncActivity();$('#world-encounter').hidden=true; }

  const guide=makeDialog('world-guide','<span class="modal-emblem">'+icon('compass')+'</span><div class="world-eyebrow">YOUR FIRST ADVENTURE</div><h2>우리의 섬에 오신 걸 환영해요.</h2><p class="world-modal-lead">나만의 포켓몬과 함께, 발길 닿는 곳으로.</p><div class="world-guide-grid"><div><span>01</span><h3>자유롭게 걸어보세요</h3><p>WASD / 방향키로 이동하고 Shift로 달려요. Space는 점프, 드래그는 시점 회전이에요.</p></div><div><span>02</span><h3>새로운 친구를 만나요</h3><p>가까이에서 E를 누르고, 포획 바늘이 초록 구간에 들어올 때 볼을 던져보세요.</p></div><div><span>03</span><h3>당신만의 섬을 채워요</h3><p>만들어 저장한 포켓몬도 야생에 나타나요. 열매와 캠프에서 볼을 보충하고 도감을 완성해보세요.</p></div></div><button class="world-button green full-width" id="guide-start">모험을 시작할게요'+icon('arrow')+'</button>');
  guide.querySelector('#guide-start').onclick=()=>guide.close();
  const partnerDialog=makeDialog('world-partners','<div class="world-eyebrow">BETTER TOGETHER</div><h2>누구와 함께 떠날까요?</h2><p class="world-modal-lead">직접 만든 친구도, 탐험에서 만난 친구도 좋아요.</p><div id="world-partner-list" class="partner-list"></div>');
  function openPartners() {
    const items=partnerOptions();
    partnerDialog.querySelector('#world-partner-list').innerHTML=items.map((item,index)=>'<button class="partner-option '+(item.id===partnerId?'selected':'')+'" data-partner-index="'+index+'">'+badge(item.config)+'<span><strong>'+safe(item.config.name)+'</strong><small>'+item.label+'</small></span>'+icon(item.id===partnerId?'check':'arrow')+'</button>').join('');
    partnerDialog.querySelectorAll('[data-partner-index]').forEach(button=>button.onclick=()=>{const item=items[Number(button.dataset.partnerIndex)];usePartner(item.config,item.id);partnerDialog.close();notify(item.config.name+'와 함께 탐험해요.');});
    openDialog(partnerDialog);
  }
  const mapDialog=makeDialog('world-map','<div class="world-eyebrow">SERENE ISLAND · FIELD MAP</div><h2>어디로 가볼까요?</h2><p class="world-modal-lead">흰 점은 야생 포켓몬, 네모는 방문할 장소예요.</p><canvas id="world-large-map" width="540" height="540" aria-label="전체 섬 지도"></canvas><div class="map-legend"><span><i></i>현재 위치</span><span><i></i>야생 포켓몬</span><span><i></i>탐험 장소</span></div><div id="world-fast-travel"></div>');
  function openMap() {
    drawMap(mapDialog.querySelector('canvas'),true);
    mapDialog.querySelector('#world-fast-travel').innerHTML='<span class="field-label">발견한 장소로 이동</span><div class="fast-travel-options">'+LANDMARKS.map(l=>'<button data-travel="'+l.id+'" '+(!progress.landmarks.includes(l.id)&&l.kind!=='camp'?'disabled':'')+'>'+icon(l.kind==='camp'?'home':'flag')+safe(l.name)+'</button>').join('')+'</div>';
    mapDialog.querySelectorAll('[data-travel]').forEach(button=>button.onclick=()=>{const landmark=LANDMARKS.find(l=>l.id===button.dataset.travel);if(!landmark)return;currentPosition={x:landmark.x+3,z:landmark.z+3};world?.setPosition(currentPosition);progress=discoverAt(progress,currentPosition);dirty=true;mapDialog.close();persist();notify(landmark.name+'에 도착했어요.');});
    const expedition=document.createElement('button');expedition.className='world-button green full-width';expedition.textContent='✦ 던전 원정 준비';expedition.onclick=()=>{mapDialog.close();dungeonUI?.open();};mapDialog.querySelector('#world-fast-travel').appendChild(expedition);
    openDialog(mapDialog);
  }
  const dexDialog=makeDialog('world-dex','<div class="world-eyebrow">OUR LITTLE ENCOUNTERS</div><h2>탐험 도감</h2><p class="world-modal-lead" id="dex-description"></p><div class="dex-tabs"><button data-dex-tab="caught" class="selected">만난 친구</button><button data-dex-tab="all">발견할 친구</button></div><div class="dex-grid" id="dex-grid"></div>');
  let dexTab='caught';
  function renderDex() {
    dexDialog.querySelector('#dex-description').textContent=progress.caught.length+'명의 친구 · '+progress.discovered.length+' / '+REGIONS.length+'개 지역 탐험';
    const items=dexTab==='caught'?progress.caught.map(c=>({id:c.spawnId,config:c.config,regionId:c.regionId,level:c.level,caught:true})):spawns.map(s=>({...s,caught:progress.caught.some(c=>c.spawnId===s.id)}));
    dexDialog.querySelector('#dex-grid').innerHTML=items.length?items.map((item,index)=>'<article class="dex-card '+(!item.caught?'undiscovered':'')+'">'+badge(item.config)+'<small>'+ (item.caught?'함께한 친구':'미발견 · '+safe(REGIONS.find(r=>r.id===item.regionId)?.name||'섬 어딘가'))+'</small><h3>'+safe(item.config.name)+'</h3><span class="dex-type">'+TYPES[item.config.type].symbol+' '+TYPES[item.config.type].label+' · Lv. '+(item.level||1)+'</span>'+(item.caught?'<button data-dex-partner="'+index+'">함께 탐험'+icon('arrow')+'</button><button class="dex-edit" data-dex-edit="'+index+'">연구소에서 꾸미기</button>':'<p>섬을 탐험하며 만나보세요.</p>')+'</article>').join(''):'<div class="dex-empty">'+icon('book')+'<h3>첫 만남을 기다리고 있어요.</h3><p>풀숲의 친구에게 다가가 E 키로 포획해보세요.</p></div>';
    dexDialog.querySelectorAll('[data-dex-partner]').forEach(button=>button.onclick=()=>{const item=items[Number(button.dataset.dexPartner)];usePartner(item.config,'caught:'+item.id);dexDialog.close();notify(item.config.name+'와 함께 출발!');});
    dexDialog.querySelectorAll('[data-dex-edit]').forEach(button=>button.onclick=()=>{const item=items[Number(button.dataset.dexEdit)];dexDialog.close();onEdit(item.config);});
  }
  dexDialog.querySelectorAll('[data-dex-tab]').forEach(button=>button.onclick=()=>{dexTab=button.dataset.dexTab;dexDialog.querySelectorAll('[data-dex-tab]').forEach(b=>b.classList.toggle('selected',b===button));renderDex();});
  function openDex(){renderDex();openDialog(dexDialog);}
  const captureDialog=makeDialog('world-capture','<div class="world-eyebrow" id="capture-eyebrow">A NEW FRIEND IS NEARBY</div><div id="capture-avatar"></div><h2 id="capture-name"></h2><p class="world-modal-lead" id="capture-description">바늘이 초록 구간에 들어오면 볼을 던져보세요.</p><div id="capture-game"><div class="capture-meter" aria-label="포획 타이밍 바"><span class="capture-zone"></span><span class="capture-needle" id="capture-needle"></span></div><div class="capture-meter-labels"><span>천천히 집중해서</span><strong>초록 구간을 노려요</strong></div><button class="world-button green full-width" id="throw-ball">'+ball+'볼 던지기 <kbd>Space</kbd></button><p class="capture-forgiving">실패해도 괜찮아요. 성공했을 때만 볼 1개를 사용해요.</p><button class="capture-accessible" id="gentle-catch">천천히 친해지기 · 타이밍 없이 포획</button></div><div id="capture-success" hidden><span class="capture-reward">+35 EXP · 도감에 등록했어요</span><button class="world-button green full-width" id="capture-continue">계속 탐험하기'+icon('arrow')+'</button></div>');
  function stopCapture(){cancelAnimationFrame(captureFrame);capture=null;}
  function openCapture(spawn) {
    if(progress.balls<1){notify('몬스터볼이 없어요. 열매를 줍거나 캠프에서 휴식해보세요.');return;}
    capture={spawn,start:performance.now(),value:0,complete:false};
    captureDialog.querySelector('#capture-name').textContent=spawn.config.name;
    captureDialog.querySelector('#capture-avatar').innerHTML=badge(spawn.config);
    captureDialog.querySelector('#capture-avatar').classList.remove('caught');
    captureDialog.querySelector('#capture-description').textContent='바늘이 초록 구간에 들어오면 볼을 던져보세요.';
    captureDialog.querySelector('#capture-eyebrow').textContent=spawn.custom?'YOUR CREATION, A NEW ENCOUNTER':'A NEW FRIEND IS NEARBY';
    captureDialog.querySelector('#capture-game').hidden=false;captureDialog.querySelector('#capture-success').hidden=true;
    openDialog(captureDialog);
    captureDialog.querySelector('#throw-ball').focus();
    const animate=now=>{if(!capture||capture.complete||disposed)return;capture.value=(Math.sin((now-capture.start)/670-Math.PI/2)+1)/2;captureDialog.querySelector('#capture-needle').style.left=(capture.value*100)+'%';captureFrame=requestAnimationFrame(animate);};
    captureFrame=requestAnimationFrame(animate);
  }
  function completeCapture(gentle=false) {
    if(!capture||capture.complete)return;
    if(!gentle&&(capture.value<.34||capture.value>.66)){captureDialog.querySelector('#capture-description').textContent='조금만 더! 바늘이 초록 구간에 들어올 때 다시 던져보세요.';return;}
    const before=progress.caught.length;
    const next=registerCatch(progress,capture.spawn);
    if(next.caught.length===before){notify('이미 만난 친구이거나 몬스터볼이 부족해요.');captureDialog.close();return;}
    progress=next;capture.complete=true;cancelAnimationFrame(captureFrame);
    world?.removeSpawn(capture.spawn.id);currentNearest=null;
    captureDialog.querySelector('#capture-eyebrow').textContent='NICE TO MEET YOU!';
    captureDialog.querySelector('#capture-description').textContent=capture.spawn.config.name+'와 친구가 되었어요!';
    captureDialog.querySelector('#capture-game').hidden=true;captureDialog.querySelector('#capture-success').hidden=false;
    captureDialog.querySelector('#capture-avatar').classList.add('caught');
    dirty=true;updateHUD();persist();
    captureDialog.querySelector('#capture-continue').focus();
  }
  captureDialog.querySelector('#throw-ball').onclick=()=>completeCapture();
  captureDialog.querySelector('#gentle-catch').onclick=()=>completeCapture(true);
  captureDialog.querySelector('#capture-continue').onclick=()=>captureDialog.close();
  listen(captureDialog,'keydown',event=>{if(event.code==='Space'&&event.target.tagName!=='BUTTON'){event.preventDefault();completeCapture();}});
  function interact() {
    if(!active||paused||anyDialog()||dungeonUI?.isOpen()||!currentNearest)return;
    const nearest=currentNearest;
    if(nearest.kind==='wild'){const spawn=spawns.find(s=>s.id===nearest.id);if(spawn)openCapture(spawn);}
    else if(nearest.kind==='berry'){const before=progress.berries.length;progress=collectBerry(progress,nearest.id);if(progress.berries.length>before){world?.removeBerry(nearest.id);notify('반짝 열매를 주웠어요! 몬스터볼 +3 · 경험치 +10');dirty=true;updateHUD();persist();}}
    else if(nearest.kind==='landmark'){const landmark=LANDMARKS.find(l=>l.id===nearest.id);if(!landmark)return;const fresh=!progress.landmarks.includes(landmark.id);progress=visitLandmark(progress,landmark.id);notify(landmark.kind==='camp'?'캠프에서 쉬었어요. 몬스터볼을 보충했습니다.':fresh?landmark.name+' 발견! 경험치 +30 · 몬스터볼 +4':'이미 발견한 장소예요. 다음 모험을 떠나볼까요?');dirty=true;updateHUD();persist();if(landmark.kind==='ruins')dungeonUI?.open();}
  }
  $('#world-interact').onclick=interact;
  $('#world-help').onclick=()=>openDialog(guide);
  $('#world-partner-button').onclick=openPartners;
  $('#world-map-button').onclick=openMap;
  $('#world-dex-button').onclick=openDex;
  $('#world-pause').onclick=()=>{paused=!paused;syncActivity();};
  $('#world-resume').onclick=()=>{paused=false;syncActivity();};
  $('#world-expand').onclick=()=>{shell.classList.toggle('expanded');$('#world-expand').setAttribute('aria-label',shell.classList.contains('expanded')?'탐험 화면 축소':'탐험 화면 확대');};
  $('#mobile-run').onclick=()=>{mobileRun=!mobileRun;$('#mobile-run').setAttribute('aria-pressed',mobileRun);updateInput();};
  $('#mobile-jump').onclick=()=>world?.jump();
  section.querySelectorAll('[data-direction]').forEach(button=>{
    const directions={up:{x:0,z:-1},down:{x:0,z:1},left:{x:-1,z:0},right:{x:1,z:0}};
    listen(button,'pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);touchDirection=directions[button.dataset.direction];updateInput();});
    for(const eventName of ['pointerup','pointercancel','lostpointercapture'])listen(button,eventName,()=>{touchDirection={x:0,z:0};updateInput();});
  });
  listen(window,'keydown',event=>{
    if(!active||dungeonUI?.isOpen()||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(anyDialog())return;
    if(event.code==='Escape'){event.preventDefault();if(shell.classList.contains('expanded'))shell.classList.remove('expanded');else{paused=!paused;syncActivity();}return;}
    if(paused)return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(event.code)){event.preventDefault();keys.add(event.code);updateInput();}
    if(event.repeat)return;
    if(event.code==='Space'){event.preventDefault();world?.jump();}
    if(event.code==='KeyE'){event.preventDefault();interact();}
    if(event.code==='KeyM'){event.preventDefault();openMap();}
    if(event.code==='KeyB'){event.preventDefault();openDex();}
  });
  listen(window,'keyup',event=>{keys.delete(event.code);if(active)updateInput();});
  listen(window,'blur',clearInput);
  listen(document,'visibilitychange',()=>{clearInput();syncActivity();if(document.hidden)persist();});
  // Existing studio dialogs also stop movement, including the global help dialog.
  const dialogObserver=new MutationObserver(()=>syncActivity());
  document.querySelectorAll('dialog').forEach(dialog=>dialogObserver.observe(dialog,{attributes:true,attributeFilter:['open']}));
  listen(window,'pagehide',persist);
  listen(window,'storage',event=>{
    if(event.key===WORLD_KEY || event.key===null) {
      clearInput();
      if(dungeonUI?.isOpen()){dungeonUI.close();notify('다른 탭의 모험 기록을 불러왔어요. 원정은 다시 출발할 수 있어요.');}
      if(captureDialog.open)captureDialog.close();
      progress=loadProgress();currentPosition={...progress.position};partnerId=progress.partnerId;dirty=false;
      resolvePartner();world?.setPosition(currentPosition);world?.setPartner(partner);world?.setSpawns(remainingSpawns());
      progress.berries.forEach(id=>world?.removeBerry(id));
      updateHUD();
    }
    if(event.key==='pokemon-lab.collection.v1'||event.key===null)syncCollection();
  });
  function syncCollection() {
    spawns=buildSpawns(getCollection());
    world?.setSpawns(remainingSpawns());
    resolvePartner();world?.setPartner(partner);updateHUD();
  }
  function usePartner(value,id='draft') {
    partner=normalizeConfig(value);partnerId=id;progress.partnerId=id;
    dirty=true;world?.setPartner(partner);updateHUD();persist();
  }
  function activate() {
    active=true;section.hidden=false;document.body.classList.add('world-mode');
    spawns=buildSpawns(getCollection());resolvePartner();
    ensureWorld();
    world?.setSpawns(remainingSpawns());world?.setPartner(partner);
    updateHUD();syncActivity();
    if(!saveTimer)saveTimer=setInterval(()=>{if(active&&!disposed&&!document.hidden)persist();},2500);
  }
  function deactivate() {
    active=false;dungeonUI?.close();clearInput();syncActivity();persist();section.hidden=true;shell.classList.remove('expanded');document.body.classList.remove('world-mode');
  }
  dungeonUI=initDungeonUI({host:shell,getPartner:()=>({...partner}),getProgress:()=>progress,
    onOpen:()=>{clearInput();persist();syncActivity();$('#world-encounter').hidden=true;[...shell.children].forEach(child=>{if(!child.classList.contains('dungeon-overlay'))child.inert=true;});$('#world-help').disabled=true;dungeonButton.disabled=true;},
    onClose:()=>{[...shell.children].forEach(child=>child.inert=false);$('#world-help').disabled=false;dungeonButton.disabled=false;syncActivity();updateHUD();},
    onClaim:run=>{
      const result=claimDungeonReward(progress,run);
      if(!result.claimed)return result;
      try {progress=saveProgress({...result.progress,position:currentPosition,partnerId});dirty=false;updateHUD();return {...result,progress};}
      catch {return {progress,claimed:false,reason:'storage'};}
    }
  });
  updateHUD();
  return {activate,deactivate,syncCollection,usePartner,openGuide:()=>{if(dungeonUI?.isOpen())return;openDialog(guide);},dispose(){disposed=true;active=false;dungeonUI?.dispose();clearInput();persist();world?.dispose();clearInterval(saveTimer);clearTimeout(announcementTimer);cancelAnimationFrame(captureFrame);dialogObserver.disconnect();cleanups.forEach(fn=>fn());dialogs.forEach(d=>d.remove());section.remove();}};
}
