import './style.css';
import { createIcons, ArrowUpRight, ArrowRight, Smile, Sparkles, Maximize, Minimize, MousePointer2, Rotate3d, Minus, Plus, Scan, Camera, Undo2, RotateCcw, Pencil, Palette, Shapes, SlidersHorizontal, ChevronDown, Shuffle, BookmarkPlus, Lightbulb, Box, HardDrive, X, PackageOpen, Image as ImageIcon, Download, FileJson, Upload, Check, Trash2, Heart, TriangleAlert } from 'lucide';
import { createScene } from './scene.js';
import { initWorldUI } from './world-ui.js';
import { DEFAULT_CONFIG, PRESETS, PALETTES, TYPES, randomConfig, normalizeConfig, loadCollection, saveCollection, loadDraft, saveDraft } from './data.js';

const icons = { ArrowUpRight, ArrowRight, Smile, Sparkles, Maximize, Minimize, MousePointer2, Rotate3d, Minus, Plus, Scan, Camera, Undo2, RotateCcw, Pencil, Palette, Shapes, SlidersHorizontal, ChevronDown, Shuffle, BookmarkPlus, Lightbulb, Box, HardDrive, X, PackageOpen, Image: ImageIcon, Download, FileJson, Upload, Check, Trash2, Heart, TriangleAlert };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const refreshIcons = () => createIcons({ icons, attrs: { 'aria-hidden': 'true' } });
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name) => '<i data-lucide="' + name + '"></i>';
let config = loadDraft();
let collection = loadCollection();
let currentId = null;
let selectedPreset = PRESETS.find((p) => p.config.type === config.type)?.id || 'pikachu';
let history = [];
let scene = null;
let spinning = false;
let background = '#e2ede6';
let toastTimer;
let draftTimer;
let exportBusy = false;
let editRevision = 0;
let exploration = null;

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3700);
}

function persistDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      saveDraft(config);
      $('#draft-status').textContent = '작업 내용이 이 브라우저에 자동 저장돼요';
    } catch {
      $('#draft-status').textContent = '자동 저장이 꺼져 있어요. 프로젝트 파일로 저장해주세요.';
    }
  }, 300);
}

function pushHistory() {
  history.push({ config: { ...config }, currentId, selectedPreset });
  if (history.length > 40) history.shift();
  $('#undo').disabled = false;
}

function applyConfig(next, options = {}) {
  editRevision++;
  if (options.history !== false) pushHistory();
  config = normalizeConfig({ ...config, ...next });
  scene?.setName(config.name);
  if (options.newCreature) currentId = null;
  if (options.render !== false) scene?.update(config);
  updateControls();
  persistDraft();
}

function updateControls() {
  if (document.activeElement !== $('#pokemon-name')) $('#pokemon-name').value = config.name;
  $('#name-count').textContent = Array.from($('#pokemon-name').value).length + '/16';
  $('#model-name').textContent = config.name;
  $('#canvas-type').innerHTML = '<b>' + TYPES[config.type].symbol + '</b> ' + TYPES[config.type].label + ' 타입';
  $('#model-id').textContent = 'YOUR VERY OWN · No. ' + String(PRESETS.findIndex((p) => p.id === selectedPreset) + 1).padStart(3, '0');
  for (const button of $$('#type-options button')) {
    const active = button.dataset.type === config.type;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', active);
    button.style.background = active ? TYPES[config.type].color + '24' : '';
    button.style.borderColor = active ? TYPES[config.type].color + '88' : '';
    button.style.color = active ? '#546044' : '';
  }
  $$('.palette-dot').forEach((button) => {
    const active = PALETTES[Number(button.dataset.palette)].color === config.color;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', active);
  });
  $('#color-label').textContent = PALETTES.find((p) => p.color === config.color)?.name || '나만의 컬러';
  for (const [id, key] of [['body', 'color'], ['accent', 'accent']]) {
    $('#' + id + '-color').value = config[key];
    $('#' + id + '-hex').textContent = config[key].toUpperCase();
  }
  $('#belly-color').value = config.belly;
  $('#body-size').value = config.size;
  $('#ear-size').value = config.earSize;
  $('#size-value').textContent = Math.round(config.size * 100) + '%';
  $('#ear-value').textContent = Math.round(config.earSize * 100) + '%';
  $$('[data-option]').forEach((button) => {
    const active = config[button.dataset.option] === button.dataset.value;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', active);
  });
  $$('.starter-card').forEach((button) => {
    const active = button.dataset.preset === selectedPreset;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', active);
    const tick = button.querySelector('.preset-selected');
    if (tick) tick.hidden = !active;
  });
  $('#collection-count').textContent = collection.length;
  $('#undo').disabled = history.length === 0;
}

function portrait(preset) {
  const c = preset.config;
  const id = preset.id || 'custom';
  let ears = '';
  if (c.ears === 'long') ears = '<path d="M29 37C18 13 19 5 24 5c7 4 13 19 13 29M57 34C57 17 66 4 71 5c4 10-1 24-6 33" fill="' + c.color + '"/><path d="M22 7l5 12-6 2c-2-7-2-12 1-14M70 6c2 5 1 9-1 15l-7-3c3-8 6-13 8-12" fill="' + (c.type === 'electric' ? '#4b493c' : c.accent) + '"/>';
  if (c.ears === 'pointy') ears = '<path d="M23 39L24 17l18 17M53 33l19-15-2 24" fill="' + c.color + '"/>';
  if (c.ears === 'round') ears = '<circle cx="26" cy="29" r="12" fill="' + c.color + '"/><circle cx="65" cy="29" r="12" fill="' + c.color + '"/>';
  const sprout = c.accessory === 'sprout' ? '<path d="M43 40C13 36 19 6 47 18c11-17 34-6 22 13-7 12-17 8-26 9" fill="#518c61"/><path d="M45 38l9-20" stroke="#376946" stroke-width="2"/>' : '';
  let tail = '';
  if (c.tail === 'bolt') tail = '<path d="M65 69l14-7-7-9 13-7-6-15-18 12 7 10-13 7z" fill="' + c.color + '" stroke="' + c.accent + '" stroke-width=".6"/>';
  if (c.tail === 'flame') tail = '<path d="M61 69q25 4 14-24" fill="none" stroke="' + c.color + '" stroke-width="10"/><path d="M75 49q-13-8 0-25 0 9 7 15 4 9-7 10" fill="#ee8461"/><path d="M75 46q-5-6 1-12 7 10-1 12" fill="#f8d768"/>';
  if (c.tail === 'leaf') tail = '<path d="M61 70C86 70 86 47 76 44c-17 5-19 12-15 26" fill="' + (c.type === 'grass' ? '#4d9471' : c.color) + '"/>';
  return '<svg viewBox="0 0 96 92" aria-hidden="true"><defs><linearGradient id="g-' + id + '" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="' + c.color + '"/><stop offset="1" stop-color="' + c.accent + '" stop-opacity=".7"/></linearGradient></defs><ellipse cx="47" cy="83" rx="26" ry="4" fill="#72845e" opacity=".12"/>' + tail + sprout + '<ellipse cx="47" cy="65" rx="22" ry="21" fill="url(#g-' + id + ')"/><ellipse cx="46" cy="68" rx="14" ry="15" fill="' + c.belly + '"/><ellipse cx="29" cy="80" rx="10" ry="5" fill="' + c.color + '"/><ellipse cx="64" cy="80" rx="10" ry="5" fill="' + c.color + '"/>' + ears + '<ellipse cx="47" cy="43" rx="27" ry="23" fill="url(#g-' + id + ')"/><ellipse cx="35" cy="42" rx="3.5" ry="5" fill="#343c32"/><ellipse cx="59" cy="42" rx="3.5" ry="5" fill="#343c32"/><circle cx="34" cy="40" r="1.3" fill="white"/><circle cx="58" cy="40" r="1.3" fill="white"/><ellipse cx="28" cy="51" rx="5" ry="3.5" fill="' + (c.type === 'electric' ? '#ed8869' : '#e6a0a3') + '" opacity=".8"/><ellipse cx="66" cy="51" rx="5" ry="3.5" fill="' + (c.type === 'electric' ? '#ed8869' : '#e6a0a3') + '" opacity=".8"/><path d="M42 52q5 5 10 0" stroke="#645945" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>';
}

function optionsGroup(key, label, options) {
  return '<div class="option-group"><span class="field-label">' + label + '</span><div class="option-buttons" aria-label="' + label + '">' + options.map(([value, text]) => '<button data-option="' + key + '" data-value="' + value + '" aria-pressed="false">' + text + '</button>').join('') + '</div></div>';
}

$('#type-options').innerHTML = Object.entries(TYPES).map(([key, value]) => '<button class="type-chip" data-type="' + key + '" aria-pressed="false"><b>' + value.symbol + '</b>' + value.label + '</button>').join('');
$('#palette-options').innerHTML = PALETTES.map((p, i) => '<button class="palette-dot" data-palette="' + i + '" style="--swatch:' + p.color + '" aria-label="' + p.name + '" title="' + p.name + '" aria-pressed="false"></button>').join('');
$('#part-options').innerHTML = optionsGroup('body', '몸체', [['round', '동글동글'], ['slim', '날씬하게'], ['chunky', '통통하게']]) + optionsGroup('ears', '귀 모양', [['long', '긴 귀'], ['pointy', '뾰족 귀'], ['round', '둥근 귀'], ['none', '없음']]) + optionsGroup('tail', '꼬리 모양', [['bolt', '번개'], ['flame', '불꽃'], ['leaf', '나뭇잎'], ['curly', '돌돌'], ['none', '없음']]) + optionsGroup('accessory', '액세서리', [['none', '없음'], ['flower', '꽃'], ['scarf', '스카프'], ['sprout', '새싹']]);
$('#eye-options').innerHTML = optionsGroup('eyes', '표정', [['round', '초롱초롱'], ['happy', '방긋방긋'], ['sleepy', '졸려요']]);
$('#starter-grid').innerHTML = PRESETS.map((p) => '<button class="starter-card" data-preset="' + p.id + '" title="' + p.description + '" aria-label="' + p.name + '(으)로 시작하기" aria-pressed="false"><span class="starter-portrait">' + portrait(p) + '</span><span><strong>' + p.name + '</strong><small>' + p.english + '</small></span><span class="preset-selected" hidden>' + icon('check') + '</span></button>').join('');

try {
  scene = createScene($('#scene-container'), config);
} catch (error) {
  console.error('3D preview could not start:', error);
  $('#scene-container').innerHTML = '<div class="scene-error">' + icon('triangle-alert') + '<p>3D 미리보기를 시작하지 못했어요.<br>브라우저의 하드웨어 가속을 켜거나 최신 Chrome, Edge에서 다시 열어주세요.</p><button id="retry-scene">다시 시도</button></div>';
  $('#retry-scene').onclick = () => location.reload();
}

$('#pokemon-name').addEventListener('focus', pushHistory);
$('#pokemon-name').addEventListener('input', (event) => applyConfig({ name: event.target.value }, { history: false, render: false }));
$('#pokemon-name').addEventListener('blur', () => { $('#pokemon-name').value = config.name; updateControls(); });
$('#type-options').addEventListener('click', (event) => { const button = event.target.closest('[data-type]'); if (button) applyConfig({ type: button.dataset.type }); });
$('#palette-options').addEventListener('click', (event) => {
  const button = event.target.closest('[data-palette]');
  if (button) { const { color, accent, belly } = PALETTES[Number(button.dataset.palette)]; applyConfig({ color, accent, belly }); }
});
for (const [id, key] of [['body-color', 'color'], ['accent-color', 'accent'], ['belly-color', 'belly']]) {
  $('#' + id).addEventListener('change', (event) => applyConfig({ [key]: event.target.value }));
}
for (const [id, key] of [['body-size', 'size'], ['ear-size', 'earSize']]) {
  $('#' + id).addEventListener('pointerdown', pushHistory);
  $('#' + id).addEventListener('keydown', (event) => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) pushHistory(); });
  $('#' + id).addEventListener('input', (event) => applyConfig({ [key]: Number(event.target.value) }, { history: false }));
}
$$('[data-option]').forEach((button) => button.addEventListener('click', () => applyConfig({ [button.dataset.option]: button.dataset.value })));
$$('[data-bg]').forEach((button) => button.addEventListener('click', () => {
  background = button.dataset.bg;
  document.documentElement.style.setProperty('--stage', background);
  $$('[data-bg]').forEach((b) => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); });
}));

function setTab(name, focus = false) {
  $$('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === name;
    button.setAttribute('aria-selected', active);
    button.tabIndex = active ? 0 : -1;
    $('#' + button.dataset.tab + '-panel').hidden = !active;
    if (active && focus) button.focus();
  });
}
$$('[data-tab]').forEach((button, index, buttons) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
  button.addEventListener('keydown', (event) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    setTab(buttons[next].dataset.tab, true);
  });
});
$$('[data-preset]').forEach((button) => button.addEventListener('click', () => {
  const preset = PRESETS.find((p) => p.id === button.dataset.preset);
  pushHistory();
  selectedPreset = preset.id;
  applyConfig(preset.config, { history: false, newCreature: true });
  scene?.resetCamera();
  toast(preset.name + '(으)로 시작해볼까요? 자유롭게 꾸며보세요.');
}));
$('#randomize').onclick = () => { applyConfig(randomConfig(), { newCreature: true }); scene?.resetCamera(); toast('새로운 친구를 만났어요! 이름을 지어주세요.'); };
$('#reset').onclick = () => {
  const preset = PRESETS.find((p) => p.id === selectedPreset) || PRESETS[0];
  applyConfig(preset.config, { newCreature: true });
  scene?.resetCamera();
  toast('처음 모습으로 돌아왔어요. 실행 취소로 되돌릴 수 있어요.');
};
function undo() {
  if (!history.length) return;
  editRevision++;
  const previous = history.pop();
  config = previous.config;
  currentId = previous.currentId;
  selectedPreset = previous.selectedPreset;
  scene?.update(config);
  updateControls();
  persistDraft();
}
$('#undo').onclick = undo;
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { event.preventDefault(); undo(); }
});
$('#zoom-in').onclick = () => scene?.zoom(-0.7);
$('#zoom-out').onclick = () => scene?.zoom(0.7);
$('#reset-camera').onclick = () => scene?.resetCamera();
$('#rotate').onclick = () => {
  spinning = !spinning;
  scene?.setSpin(spinning);
  $('#rotate').setAttribute('aria-pressed', spinning);
};
$('#fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('.viewport-panel').requestFullscreen) await $('.viewport-panel').requestFullscreen();
    else toast('이 브라우저에서는 전체 화면을 지원하지 않아요.');
  } catch { toast('전체 화면으로 전환할 수 없어요. 브라우저 설정을 확인해주세요.'); }
};

function showView(view) {
  const skipLink = $('.skip-link');
  skipLink.href = view === 'world' ? '#world-canvas' : view === 'collection' ? '#collection-view' : '#workspace';
  skipLink.textContent = view === 'world' ? '게임으로 바로 가기' : view === 'collection' ? '컬렉션으로 바로 가기' : '작업대로 바로 가기';
  if (view === 'world') exploration?.activate();
  else exploration?.deactivate();
  scene?.setActive(view === 'editor');
  $('#editor-view').hidden = view !== 'editor';
  $('#page-intro').hidden = view !== 'editor';
  $('#collection-view').hidden = view !== 'collection';
  $$('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'collection') renderCollection();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
$$('[data-view]').forEach((button) => button.onclick = () => showView(button.dataset.view));
$$('a.brand').forEach((link) => link.onclick = (event) => { event.preventDefault(); showView('world'); });
$('#explore-draft').onclick = () => { exploration?.usePartner(config, 'draft'); showView('world'); };
$('#new-creature').onclick = () => { applyConfig(DEFAULT_CONFIG, { newCreature: true }); showView('editor'); scene?.resetCamera(); };
$('#guide-button').onclick = $('#profile-guide').onclick = () => {
  if (document.body.classList.contains('world-mode')) exploration?.openGuide();
  else $('#guide-dialog').showModal();
};
$('#export-button').onclick = () => $('#export-dialog').showModal();
$$('.close-dialog').forEach((button) => button.onclick = () => button.closest('dialog').close());
$$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));

async function thumbnail(captureBackground = background) {
  const url = scene.capture();
  const image = new window.Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = Math.round(image.height / image.width * 480);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = captureBackground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.85);
}

$('#save').onclick = async () => {
  if (!scene) return toast('3D 미리보기가 준비되면 저장할 수 있어요.');
  collection = loadCollection();
  if (currentId && !collection.some((item) => item.id === currentId)) currentId = null;
  if (!currentId && collection.length >= 24) return toast('컬렉션에 24명이 모였어요. 파일로 저장한 뒤 친구 한 명을 정리해주세요.');
  const button = $('#save');
  button.disabled = true;
  const savedConfig = { ...config };
  const savedRevision = editRevision;
  const savedBackground = background;
  const id = currentId || crypto.randomUUID();
  try {
    const item = { id, name: savedConfig.name, config: savedConfig, image: await thumbnail(savedBackground), createdAt: new Date().toISOString() };
    collection = loadCollection();
    if (!collection.some((entry) => entry.id === id) && collection.length >= 24) throw new Error('Collection is full');
    const next = [item, ...collection.filter((entry) => entry.id !== id)];
    collection = saveCollection(next);
    exploration?.syncCollection();
    if (editRevision === savedRevision) currentId = id;
    updateControls();
    if (!$('#collection-view').hidden) renderCollection();
    toast(savedConfig.name + ', 컬렉션에 저장했어요!');
  } catch (error) {
    console.error('Save failed:', error);
    toast('저장 공간이 부족하거나 사용할 수 없어요. 프로젝트 파일로 다운로드해주세요.');
  } finally { button.disabled = false; }
};

const deleteDialog = document.createElement('dialog');
deleteDialog.className = 'modal';
deleteDialog.innerHTML = '<div class="eyebrow">YOUR COLLECTION</div><h2>컬렉션에서 삭제할까요?</h2><p class="modal-lead">저장한 친구가 이 브라우저에서 삭제됩니다.<br>필요하다면 먼저 프로젝트 파일로 저장해주세요.</p><div class="editor-actions"><button class="button random-button" data-cancel-delete>취소</button><button class="button primary-button" data-confirm-delete>삭제하기</button></div>';
document.body.appendChild(deleteDialog);
deleteDialog.querySelector('h2').id = 'delete-dialog-title';
deleteDialog.setAttribute('aria-labelledby', 'delete-dialog-title');
for (const dialog of $$('#guide-dialog, #export-dialog')) {
  const heading = dialog.querySelector('h2');
  heading.id = dialog.id + '-title';
  dialog.setAttribute('aria-labelledby', heading.id);
}
deleteDialog.querySelector('[data-cancel-delete]').onclick = () => deleteDialog.close();

function renderCollection() {
  const grid = $('#collection-grid');
  if (!collection.length) {
    grid.innerHTML = '<div class="empty-collection">' + icon('heart') + '<h2>첫 번째 친구를 기다리고 있어요.</h2><p>상상을 더해 포켓몬을 만들고<br>이곳에 나만의 작은 세계를 모아보세요.</p><button class="button primary-button" data-go-create>첫 친구 만들기' + icon('arrow-right') + '</button></div>';
    grid.querySelector('[data-go-create]').onclick = () => showView('editor');
  } else {
    grid.innerHTML = collection.map((item, index) => '<article class="collection-card"><button class="collection-image" data-edit="' + index + '" aria-label="' + escape(item.name) + ' 편집">' + (item.image ? '<img src="' + item.image + '" alt="' + escape(item.name) + '의 3D 모습"/>' : portrait({ id: 'collection-' + index, config: item.config })) + '</button><div class="collection-card-content"><div class="collection-card-title"><h3>' + escape(item.name) + '</h3><small>' + TYPES[item.config.type].symbol + ' ' + TYPES[item.config.type].label + '</small></div><div class="collection-card-actions"><button class="button" data-edit="' + index + '">' + icon('pencil') + '이어 만들기</button><button class="icon-button" data-download="' + index + '" title="프로젝트 저장" aria-label="' + escape(item.name) + ' 프로젝트 다운로드">' + icon('download') + '</button><button class="icon-button" data-delete="' + index + '" title="컬렉션에서 삭제" aria-label="' + escape(item.name) + ' 삭제">' + icon('trash-2') + '</button></div></div></article>').join('');
    grid.querySelectorAll('[data-edit]').forEach((button) => button.onclick = () => {
      const item = collection[Number(button.dataset.edit)];
      applyConfig(item.config);
      currentId = item.id;
      selectedPreset = PRESETS.find((p) => p.config.type === config.type)?.id || 'pikachu';
      updateControls();
      showView('editor');
      scene?.resetCamera();
    });
    grid.querySelectorAll('[data-download]').forEach((button) => button.onclick = () => exportProject(collection[Number(button.dataset.download)].config));
    grid.querySelectorAll('[data-delete]').forEach((button) => button.onclick = () => {
      const item = collection[Number(button.dataset.delete)];
      deleteDialog.showModal();
      deleteDialog.querySelector('[data-confirm-delete]').onclick = () => {
        try {
          collection = saveCollection(collection.filter((entry) => entry.id !== item.id));
          exploration?.syncCollection();
          if (currentId === item.id) currentId = null;
          renderCollection();
          updateControls();
          deleteDialog.close();
          toast('컬렉션에서 삭제했어요.');
        } catch { toast('삭제 내용을 저장하지 못했어요. 저장 공간 설정을 확인해주세요.'); }
      };
    });
  }
  refreshIcons();
}

function filename(name) { return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'my-pokemon'; }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function exportProject(value = config) {
  downloadBlob(new Blob([JSON.stringify({ format: 'poke-lab', version: 1, config: value }, null, 2)], { type: 'application/json' }), filename(value.name) + '.pokelab.json');
  toast('프로젝트 파일을 저장했어요. 나중에 다시 불러올 수 있어요.');
}
async function exportFile(format) {
  if (exportBusy) return;
  if (format === 'json') return exportProject();
  if (!scene) return toast('3D 미리보기가 준비되면 다운로드할 수 있어요.');
  exportBusy = true;
  $$('[data-export]').forEach((button) => button.disabled = true);
  try {
    if (format === 'png') {
      const data = scene.capture();
      const image = new window.Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = data; });
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG generation failed');
      downloadBlob(blob, filename(config.name) + '.png');
      toast('지금 모습을 이미지로 저장했어요.');
    } else {
      toast('3D 모델을 준비하고 있어요…');
      const buffer = await scene.exportGLB();
      downloadBlob(new Blob([buffer], { type: 'model/gltf-binary' }), filename(config.name) + '.glb');
      toast('3D 모델을 저장했어요. Blender 등에서 열어보세요.');
    }
  } catch (error) {
    console.error('Export failed:', error);
    toast('파일을 만들지 못했어요. 잠시 후 다시 시도해주세요.');
  } finally {
    exportBusy = false;
    $$('[data-export]').forEach((button) => button.disabled = false);
  }
}
$('#snapshot').onclick = () => exportFile('png');
$$('[data-export]').forEach((button) => button.onclick = () => exportFile(button.dataset.export));
$('#import-button').onclick = () => $('#import-file').click();
$('#import-file').onchange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('File too large');
    const data = JSON.parse(await file.text());
    if (data?.format !== 'poke-lab' || data.version !== 1 || !data.config || typeof data.config !== 'object' || Array.isArray(data.config)) throw new Error('Invalid project');
    applyConfig(normalizeConfig(data.config), { newCreature: true });
    selectedPreset = PRESETS.find((p) => p.config.type === config.type)?.id || 'pikachu';
    updateControls();
    showView('editor');
    scene?.resetCamera();
    $('#export-dialog').close();
    toast('프로젝트를 불러왔어요. 이어서 만들어보세요.');
  } catch { toast('POKÉ LAB에서 저장한 2MB 이하의 프로젝트 JSON 파일을 선택해주세요.'); }
  finally { event.target.value = ''; }
};
window.addEventListener('pagehide', () => { clearTimeout(draftTimer); try { saveDraft(config); } catch { /* On-page storage status already explains unavailable storage. */ } });
window.addEventListener('storage', (event) => {
  if (event.key === null || event.key?.startsWith('pokemon-lab.collection')) {
    collection = loadCollection();
    if (currentId && !collection.some((item) => item.id === currentId)) currentId = null;
    updateControls();
    if (!$('#collection-view').hidden) renderCollection();
  }
});
updateControls();
refreshIcons();
exploration = initWorldUI({
  getDraft: () => ({ ...config }),
  getCollection: () => loadCollection(),
  onEdit: value => { applyConfig(value, { newCreature: true }); showView('editor'); },
});
showView('world');
if (import.meta.hot) import.meta.hot.dispose(() => { exploration?.dispose(); scene?.dispose(); clearTimeout(draftTimer); clearTimeout(toastTimer); });
