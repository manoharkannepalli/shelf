import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { BaseDirectory, mkdir, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';

function safeHttpsUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch { return ''; }
}

function sanitizeSnapshotHtml(value) {
  if (typeof value !== 'string' || value.length > 500_000) return '';
  const template = document.createElement('template');
  template.innerHTML = value;
  template.content.querySelectorAll('script, style, noscript, iframe, object, embed, form, a, img, video, audio, svg').forEach((node) => node.remove());
  return [...template.content.querySelectorAll('p')]
    .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text) => `<p>${escapeHtml(text)}</p>`)
    .join('');
}

function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const type = item.type === 'pdf' ? 'pdf' : 'article';
  const id = Number.isSafeInteger(item.id) && item.id > 0 ? item.id : Date.now();
  return {
    id,
    type,
    title: String(item.title || 'Untitled').slice(0, 240),
    description: String(item.description || '').slice(0, 2000),
    source: String(item.source || '').slice(0, 240),
    time: String(item.time || '').slice(0, 80),
    status: ['to-read', 'reading', 'finished'].includes(item.status) ? item.status : 'to-read',
    collection: String(item.collection || '').slice(0, 120),
    tag: String(item.tag || '').slice(0, 120),
    progress: Math.min(100, Math.max(0, Number(item.progress) || 0)),
    tone: ['clay', 'sage', 'lavender', 'sky'].includes(item.tone) ? item.tone : 'clay',
    saved: String(item.saved || 'Saved recently').slice(0, 120),
    featured: Boolean(item.featured),
    url: type === 'article' ? safeHttpsUrl(item.url) : '',
    filePath: type === 'pdf' && /^files\/\d+\.pdf$/.test(String(item.filePath || '')) ? String(item.filePath) : '',
    snapshotHtml: sanitizeSnapshotHtml(item.snapshotHtml),
    offline: Boolean(item.offline)
  };
}

(function setupShelfBridges() {
  const desktop = Boolean(window.__TAURI_INTERNALS__);

  async function loadItems() {
    if (!desktop) return null;
    try {
      const raw = await readTextFile('library.json', { baseDir: BaseDirectory.AppLocalData });
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.items) ? parsed.items : null;
    } catch { return null; }
  }

  async function saveItems(items) {
    if (!desktop) return;
    await mkdir('.', { baseDir: BaseDirectory.AppLocalData, recursive: true }).catch(() => {});
    await writeTextFile('library.json', JSON.stringify({ version: 1, savedAt: new Date().toISOString(), items }, null, 2), { baseDir: BaseDirectory.AppLocalData });
  }

  async function savePdf(file, id) {
    if (!desktop || !file) return null;
    await mkdir('files', { baseDir: BaseDirectory.AppLocalData, recursive: true }).catch(() => {});
    const filePath = `files/${id}.pdf`;
    await writeFile(filePath, new Uint8Array(await file.arrayBuffer()), { baseDir: BaseDirectory.AppLocalData });
    return filePath;
  }

  function captureEscape(value) { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char])); }
  async function capture(url) {
    const safeUrl = safeHttpsUrl(url);
    if (!safeUrl) throw new Error('Shelf saves HTTPS links only');
    const response = desktop ? await tauriFetch(safeUrl, { method: 'GET' }) : await fetch(safeUrl, { method: 'GET' });
    if (!response.ok) throw new Error(`Unable to save this page (${response.status})`);
    const document = new DOMParser().parseFromString(await response.text(), 'text/html');
    document.querySelectorAll('script, style, noscript, iframe, nav, aside, footer, form, header').forEach((node) => node.remove());
    const source = document.querySelector('article, main, [role="main"]') || document.body;
    const paragraphs = [...source.querySelectorAll('p')].map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim()).filter((text) => text.length > 40).slice(0, 18);
    const fallback = (source.textContent || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter((text) => text.length > 40).slice(0, 8);
    const body = paragraphs.length ? paragraphs : fallback;
    if (!body.length) throw new Error('No readable article content found');
    return { html: body.map((paragraph) => `<p>${captureEscape(paragraph)}</p>`).join(''), description: body[0].slice(0, 150) + (body[0].length > 150 ? '…' : ''), savedAt: new Date().toISOString() };
  }

  window.ShelfStorage = { desktop, loadItems, saveItems, savePdf };
  window.ShelfCapture = { capture };
})();

const defaultItems = [
  { id: 1, type: 'article', title: 'The art of noticing', description: 'Paying attention is a kind of generosity. A quiet essay on seeing more in the ordinary.', source: 'Aesop Magazine', time: '18 min read', status: 'reading', collection: 'Inspiration', tag: 'essays', progress: 42, tone: 'clay', saved: 'Saved yesterday', featured: true },
  { id: 2, type: 'article', title: 'A field guide to slower thinking', description: 'Notes on making better decisions by making a little more room.', source: 'The Marginalian', time: '12 min read', status: 'to-read', collection: 'Learning', tag: 'ideas', progress: 0, tone: 'sage', saved: 'Saved 2 days ago' },
  { id: 3, type: 'pdf', title: 'The shape of a useful day', description: 'A small workbook for designing days that leave space for deep work.', source: 'Personal archive', time: '24 min read', status: 'reading', collection: 'Work', tag: 'focus', progress: 64, tone: 'lavender', saved: 'Saved 3 days ago' },
  { id: 4, type: 'article', title: 'How to make a home for ideas', description: 'A visual essay about collecting fragments before they become a practice.', source: 'Offscreen Journal', time: '9 min read', status: 'to-read', collection: 'Ideas', tag: 'design', progress: 0, tone: 'sky', saved: 'Saved 4 days ago' },
  { id: 5, type: 'pdf', title: 'On keeping a commonplace book', description: 'A gentle introduction to an old system for remembering what matters.', source: 'The School of Life', time: '16 min read', status: 'finished', collection: 'Learning', tag: 'books', progress: 100, tone: 'sage', saved: 'Finished last week' },
  { id: 6, type: 'article', title: 'The useful beauty of constraints', description: 'Why a smaller canvas can help the right ideas come forward.', source: 'Dense Discovery', time: '7 min read', status: 'finished', collection: 'Ideas', tag: 'creative', progress: 100, tone: 'clay', saved: 'Finished last week' }
];

const state = {
  items: loadItems(),
  view: 'continue',
  collection: null,
  search: '',
  layout: 'grid',
  addMode: 'link'
};

async function listenForShelfLinks() {
  if (!window.__TAURI_INTERNALS__) return;
  try {
    const handle = (urls) => {
      const deepLink = urls.find((url) => url.startsWith('shelf://save'));
      if (!deepLink) return;
      const parsed = new URL(deepLink);
      const link = safeHttpsUrl(parsed.searchParams.get('url'));
      const collection = parsed.searchParams.get('collection');
      if (!link) return;
      openModal('link');
      els.linkInput.value = link;
      if (collection) els.collectionInput.value = collection;
      showToast('Link received from your browser');
    };
    const current = await getCurrent();
    if (current) handle(current);
    await onOpenUrl(handle);
  } catch (error) {
    console.info('Shelf browser capture is unavailable in this preview.', error);
  }
}

const els = {
  grid: document.querySelector('#item-grid'),
  recent: document.querySelector('#recent-list'),
  empty: document.querySelector('#empty-state'),
  modal: document.querySelector('#add-modal'),
  form: document.querySelector('#add-form'),
  linkBlock: document.querySelector('#link-input-block'),
  linkInput: document.querySelector('#link-input'),
  fileDrop: document.querySelector('#file-drop'),
  fileInput: document.querySelector('#file-input'),
  collectionInput: document.querySelector('#collection-input'),
  tagInput: document.querySelector('#tag-input'),
  toast: document.querySelector('#toast'),
  toastMessage: document.querySelector('#toast-message'),
  pageTitle: document.querySelector('#page-title'),
  pageIntro: document.querySelector('#page-intro'),
  listHeading: document.querySelector('#list-heading'),
  listSubheading: document.querySelector('#list-subheading'),
  featuredCard: document.querySelector('#featured-card'),
  featuredTitle: document.querySelector('#featured-title'),
  featuredDescription: document.querySelector('#featured-description'),
  featuredSource: document.querySelector('#featured-source'),
  featuredDate: document.querySelector('#featured-date'),
  featuredType: document.querySelector('#featured-type'),
  featuredTime: document.querySelector('#featured-time'),
  continueCount: document.querySelector('#continue-count'),
  allCount: document.querySelector('#all-count'),
  progressPercent: document.querySelector('#progress-percent'),
  progressRead: document.querySelector('#progress-read'),
  reader: document.querySelector('#reader-overlay'),
  readerType: document.querySelector('#reader-type'),
  readerTime: document.querySelector('#reader-time'),
  readerSource: document.querySelector('#reader-source'),
  readerTitle: document.querySelector('#reader-title'),
  readerDek: document.querySelector('#reader-dek'),
  readerBody: document.querySelector('#reader-body'),
  readerFinish: document.querySelector('#reader-finish'),
  readerExternal: document.querySelector('#reader-external'),
  settingsModal: document.querySelector('#settings-modal'),
  importLibrary: document.querySelector('#import-library')
};

let activeReaderId = null;

function loadItems() {
  try {
    const saved = JSON.parse(localStorage.getItem('shelf-items'));
    const items = Array.isArray(saved) ? saved.map(sanitizeItem).filter(Boolean).slice(0, 500) : [];
    return items.length ? items : defaultItems;
  } catch { return defaultItems; }
}

function persist() {
  state.items = state.items.map(sanitizeItem).filter(Boolean).slice(0, 500);
  const serialized = JSON.stringify(state.items);
  localStorage.setItem('shelf-items', serialized);
  localStorage.setItem('shelf-items-backup', JSON.stringify({ savedAt: new Date().toISOString(), items: state.items }));
  window.ShelfStorage?.saveItems(state.items).catch((error) => console.info('Shelf desktop storage is unavailable.', error));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function filteredItems() {
  let items = [...state.items];
  if (state.view === 'continue') items = items.filter((item) => item.status !== 'finished');
  if (state.view === 'saved') items = items.filter((item) => item.status === 'to-read');
  if (state.collection) items = items.filter((item) => item.collection === state.collection);
  if (state.search) {
    const query = state.search.toLowerCase();
    items = items.filter((item) => [item.title, item.description, item.source, item.collection, item.tag].join(' ').toLowerCase().includes(query));
  }
  return items;
}

function render() {
  const items = filteredItems();
  els.grid.classList.toggle('list-layout', state.layout === 'list');
  els.grid.innerHTML = items.map(renderCard).join('');
  els.empty.hidden = items.length > 0;
  els.recent.innerHTML = [...state.items].slice().sort((a, b) => b.id - a.id).slice(0, 3).map(renderRecent).join('');
  updateCopy();
  bindCardActions();
  updateStats();
}

function renderCard(item) {
  const symbol = item.type === 'pdf' ? 'PDF' : '⌁';
  const progress = item.progress || 0;
  return `<article class="item-card card-tone-${escapeHtml(item.tone || 'clay')}" data-id="${item.id}">
    <div class="item-card-top"><span class="item-kind"><span class="kind-symbol ${item.type === 'pdf' ? 'pdf' : ''}">${symbol}</span>${item.type === 'pdf' ? 'PDF' : 'ARTICLE'}</span><button class="item-menu" type="button" data-action="menu" aria-label="More options">•••</button></div>
    <h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description)}</p>
    <div class="item-card-bottom"><span class="item-source">${escapeHtml(item.source)}</span><span class="item-time">${escapeHtml(item.time)}</span></div>
    <div class="item-progress"><span style="width:${progress}%"></span></div>
  </article>`;
}

function renderRecent(item) {
  return `<button class="recent-item" type="button" data-id="${item.id}"><span class="recent-thumb ${item.type === 'pdf' ? 'pdf' : ''}">${item.type === 'pdf' ? 'PDF' : '⌁'}</span><span class="recent-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.saved)}</small></span></button>`;
}

function updateCopy() {
  const copy = {
    continue: ['Continue reading.', 'Pick up where you left off, or make room for something new.', 'On your shelf', 'A few things waiting for your attention.'],
    all: ['Your whole shelf.', 'Everything you’ve saved, in one gentle place.', 'All items', 'The complete collection, just as you left it.'],
    saved: ['Saved for later.', 'The things you want to return to when the time is right.', 'Waiting patiently', 'No pressure. They’ll be here when you’re ready.']
  }[state.view];
  els.pageTitle.innerHTML = `${copy[0].replace('.', '')}<span class="title-period">.</span>`;
  els.pageIntro.textContent = copy[1];
  els.listHeading.textContent = state.collection ? state.collection : copy[2];
  els.listSubheading.textContent = state.collection ? 'A small corner of your reading life.' : copy[3];
  const featured = state.items.find((item) => item.featured && item.status !== 'finished') || state.items.find((item) => item.status !== 'finished');
  if (featured) {
    els.featuredTitle.textContent = featured.title;
    els.featuredDescription.textContent = featured.description;
    els.featuredSource.textContent = featured.source;
    els.featuredDate.textContent = featured.saved;
    els.featuredType.textContent = featured.type === 'pdf' ? 'PDF' : 'ARTICLE';
    els.featuredTime.textContent = featured.time;
    els.featuredCard.dataset.id = featured.id;
  } else { els.featuredCard.hidden = true; }
}

function updateStats() {
  const continueCount = state.items.filter((item) => item.status !== 'finished').length;
  els.continueCount.textContent = continueCount;
  els.allCount.textContent = state.items.length;
  const finished = state.items.filter((item) => item.status === 'finished').length;
  const percent = state.items.length ? Math.round((finished / state.items.length) * 100) : 0;
  els.progressPercent.textContent = `${percent}%`;
  els.progressRead.textContent = `${finished} of ${state.items.length}`;
  document.querySelector('.progress-ring').style.background = `conic-gradient(var(--clay) 0 ${percent}%, #eee6dc ${percent}% 100%)`;
}

function bindCardActions() {
  document.querySelectorAll('[data-id]').forEach((card) => {
    if (card.dataset.action === 'menu') return;
    card.addEventListener('click', () => openItem(Number(card.dataset.id)));
  });
  document.querySelectorAll('[data-action="menu"]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const card = button.closest('[data-id]');
    const item = state.items.find((entry) => entry.id === Number(card.dataset.id));
    if (!item) return;
    item.status = item.status === 'finished' ? 'to-read' : 'finished';
    item.progress = item.status === 'finished' ? 100 : 0;
    persist(); render(); showToast(item.status === 'finished' ? 'Marked as finished' : 'Moved back to your shelf');
  }));
}

function openItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  if (item.status === 'to-read') { item.status = 'reading'; item.progress = 8; persist(); render(); }
  activeReaderId = id;
  els.reader.hidden = false;
  document.body.style.overflow = 'hidden';
  els.readerType.textContent = item.type === 'pdf' ? 'PDF' : 'ARTICLE';
  els.readerTime.textContent = item.time;
  els.readerSource.textContent = `${item.source} · ${item.saved}`;
  els.readerTitle.textContent = item.title;
  els.readerDek.textContent = item.description;
  els.readerBody.innerHTML = item.type === 'pdf' ? `<div class="reader-pdf"><span class="pdf-symbol">PDF</span><strong>${escapeHtml(item.title)}</strong><span>This saved document is ready to read offline.</span></div>` : articleBody(item);
  els.readerFinish.textContent = item.status === 'finished' ? 'Mark as unread' : 'Mark finished';
}

function articleBody(item) {
  const title = escapeHtml(item.title);
  if (item.snapshotHtml) return item.snapshotHtml;
  return `<p>There is a particular pleasure in returning to an idea when the room is quiet. <em>${title}</em> begins with a simple invitation: make a little space for the things you want to notice.</p><p>Not everything worth keeping needs to become a project. Some thoughts can remain small, useful companions — a sentence underlined, a question carried into the afternoon, a detail that changes the way a familiar place looks.</p><p>The best reading shelves do not ask us to consume more. They help us remember what we meant to return to, then get out of the way when we arrive.</p>`;
}

function closeReader() { els.reader.hidden = true; activeReaderId = null; document.body.style.overflow = ''; }

function toggleReaderFinished() {
  const item = state.items.find((entry) => entry.id === activeReaderId);
  if (!item) return;
  item.status = item.status === 'finished' ? 'reading' : 'finished';
  item.progress = item.status === 'finished' ? 100 : Math.max(item.progress || 8, 8);
  persist(); render();
  els.readerFinish.textContent = item.status === 'finished' ? 'Mark as unread' : 'Mark finished';
  showToast(item.status === 'finished' ? 'Marked as finished' : 'Moved back to reading');
}

async function openReaderExternally() {
  const item = state.items.find((entry) => entry.id === activeReaderId);
  if (!item) return;
  if (item.url) {
    if (window.ShelfStorage?.desktop) await openUrl(item.url);
    else window.open(item.url, '_blank', 'noopener,noreferrer');
  }
  else showToast('This saved copy only lives inside Shelf');
}

function openModal(mode = 'link') {
  state.addMode = mode;
  els.modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setAddMode(mode);
  setTimeout(() => (mode === 'link' ? els.linkInput : els.fileDrop).focus(), 0);
}

function closeModal() { els.modal.hidden = true; document.body.style.overflow = ''; els.form.reset(); setAddMode('link'); }
function openSettings() { els.settingsModal.hidden = false; document.body.style.overflow = 'hidden'; }
function closeSettings() { els.settingsModal.hidden = true; document.body.style.overflow = ''; }

function exportLibrary() {
  const payload = JSON.stringify({ app: 'Shelf', version: 1, exportedAt: new Date().toISOString(), items: state.items }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `shelf-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Shelf backup exported');
}

function importLibrary(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.items)) throw new Error('Invalid shelf backup');
      const items = parsed.items.map(sanitizeItem).filter(Boolean).slice(0, 500);
      if (!items.length) throw new Error('Empty shelf backup');
      state.items = items; persist(); state.view = 'continue'; state.collection = null; render(); closeSettings(); showToast('Shelf backup restored');
    } catch { showToast('That backup could not be opened'); }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function setAddMode(mode) {
  state.addMode = mode;
  document.querySelectorAll('.add-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.addMode === mode));
  els.linkBlock.hidden = mode !== 'link';
  els.fileDrop.hidden = mode !== 'pdf';
  if (mode === 'pdf') els.fileDrop.querySelector('strong').textContent = 'Drop a PDF here';
}

function saveNewItem(event) {
  event.preventDefault();
  let title = '';
  let type = state.addMode === 'pdf' ? 'pdf' : 'article';
  let selectedFile = null;
  if (state.addMode === 'pdf') {
    selectedFile = els.fileInput.files[0];
    if (!selectedFile) return showToast('Choose a PDF to add');
    title = selectedFile.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  } else {
    const url = safeHttpsUrl(els.linkInput.value.trim());
    if (!url) return showToast('Shelf saves HTTPS links only');
    try { title = new URL(url).hostname.replace(/^www\./, ''); } catch { return showToast('That link needs a little fixing'); }
    els.linkInput.value = url;
  }
  const item = sanitizeItem({ id: Date.now(), type, url: type === 'article' ? els.linkInput.value.trim() : '', title: title.charAt(0).toUpperCase() + title.slice(1), description: type === 'pdf' ? 'A new PDF waiting for your attention.' : 'A saved article, ready for a quieter moment.', source: type === 'pdf' ? 'Personal archive' : title, time: type === 'pdf' ? 'PDF file' : 'Saved offline', status: 'to-read', collection: els.collectionInput.value, tag: els.tagInput.value.trim(), progress: 0, tone: ['clay', 'sage', 'lavender', 'sky'][state.items.length % 4], saved: 'Saved just now' });
  state.items.unshift(item); persist(); render(); closeModal(); showToast(type === 'pdf' ? 'PDF saved to your shelf' : 'Link saved for offline reading');
  if (type === 'pdf') {
    window.ShelfStorage?.savePdf(selectedFile, item.id).then((filePath) => { if (filePath) { item.filePath = filePath; persist(); } }).catch(() => showToast('PDF added, but local file storage needs the desktop app'));
  } else {
    window.ShelfCapture?.capture(item.url).then((snapshot) => { item.snapshotHtml = snapshot.html; item.description = snapshot.description; item.offline = true; persist(); render(); showToast('Offline copy ready to read'); }).catch(() => { item.offline = false; persist(); showToast('Saved the link; offline copy was unavailable'); });
  }
}

function showToast(message) {
  els.toastMessage.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  state.view = button.dataset.view; state.collection = null;
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.collection-item').forEach((item) => item.classList.remove('active'));
  render();
}));

document.querySelectorAll('.collection-item').forEach((button) => button.addEventListener('click', () => {
  state.collection = button.dataset.collection; state.view = 'all';
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('.collection-item').forEach((item) => item.classList.toggle('active', item === button));
  render();
}));

document.querySelector('#open-add').addEventListener('click', () => openModal());
document.querySelector('#empty-add').addEventListener('click', () => openModal());
document.querySelector('#close-modal').addEventListener('click', closeModal);
document.querySelector('#cancel-add').addEventListener('click', closeModal);
document.querySelectorAll('.add-tab').forEach((tab) => tab.addEventListener('click', () => setAddMode(tab.dataset.addMode)));
els.form.addEventListener('submit', saveNewItem);
document.querySelector('#continue-button').addEventListener('click', () => openItem(Number(els.featuredCard.dataset.id)));
document.querySelector('#close-reader').addEventListener('click', closeReader);
els.readerFinish.addEventListener('click', toggleReaderFinished);
els.readerExternal.addEventListener('click', openReaderExternally);
document.querySelector('#show-all').addEventListener('click', () => document.querySelector('[data-view="all"]').click());
document.querySelector('#search-trigger').addEventListener('click', () => {
  const query = window.prompt('Search your shelf');
  if (query === null) return;
  state.search = query.trim();
  showToast(state.search ? `Showing results for “${state.search}”` : 'Search cleared');
  render();
});
document.querySelector('#theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('shelf-theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
});
document.querySelector('#settings-button').addEventListener('click', openSettings);
document.querySelector('#close-settings').addEventListener('click', closeSettings);
document.querySelector('#export-library').addEventListener('click', exportLibrary);
els.importLibrary.addEventListener('change', importLibrary);
document.querySelector('#add-collection').addEventListener('click', () => showToast('New collections are coming in the next pass'));
document.querySelectorAll('.view-toggle').forEach((button) => button.addEventListener('click', () => {
  state.layout = button.dataset.layout;
  document.querySelectorAll('.view-toggle').forEach((item) => item.classList.toggle('active', item === button));
  render();
}));
document.querySelector('#file-drop').addEventListener('click', () => els.fileInput.click());
document.querySelector('#file-input').addEventListener('change', () => {
  const file = els.fileInput.files[0];
  if (file) els.fileDrop.querySelector('strong').textContent = file.name;
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openModal(); }
  if (event.key === 'Escape' && !els.reader.hidden) closeReader();
  else if (event.key === 'Escape' && !els.modal.hidden) closeModal();
  else if (event.key === 'Escape' && !els.settingsModal.hidden) closeSettings();
});

if (localStorage.getItem('shelf-theme') === 'dark') document.body.classList.add('dark-mode');
render();
listenForShelfLinks();
window.ShelfStorage?.loadItems().then((items) => {
  const safeItems = items?.map(sanitizeItem).filter(Boolean).slice(0, 500);
  if (safeItems?.length) { state.items = safeItems; render(); }
});
