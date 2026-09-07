/* ==========================================================================
   Kalender Kegiatan OSIS - SMAIT Anak Sholeh Mataram
   Logika Aplikasi, Otentikasi, Sinkronisasi LocalStorage, Ekspor ICS & PWA
   ========================================================================== */

'use strict';

// Kunci Penyimpanan Lokal (LocalStorage)
const STORAGE_KEY     = 'osis-smait-anak-sholeh-kalender-v1';
const THEME_KEY       = 'osis-smait-anak-sholeh-theme-v1';
const USERS_KEY       = 'osis-smait-anak-sholeh-users-v1';
const ASSIGNMENTS_KEY = 'osis-smait-anak-sholeh-assignments-v1';
const SESSION_KEY     = 'osis-smait-anak-sholeh-session-v1';
const NOTIFY_KEY      = 'osis-smait-notified-date-v1';

// Pengguna Bawaan (Default Credentials)
const DEFAULT_USERS = [
  { id: 'u1', name: 'Ketua OSIS',   username: 'ketua',   password: 'osis2024',    role: 'admin',   sekbid: '' },
  { id: 'u2', name: 'Pembina OSIS', username: 'pembina', password: 'pembina2024', role: 'pembina', sekbid: '' },
  { id: 'u3', name: 'Anggota OSIS', username: 'anggota', password: 'anggota2024', role: 'member',  sekbid: '' },
];

let users = [];
let assignments = [];
let currentUser = null;
let deferredInstallPrompt = null;
let toastTimer = null;

// Definisi Kategori
const CATEGORIES = [
  { id: 'rapat',    label: 'Rapat',    accent: '#5B8CA0', tint: '#E7EFF3', darkTint: 'rgba(91,140,160,0.25)' },
  { id: 'kegiatan', label: 'Kegiatan', accent: '#7FA93C', tint: '#EEF4E2', darkTint: 'rgba(127,169,60,0.25)' },
  { id: 'lomba',    label: 'Lomba',    accent: '#E4A032', tint: '#FBF1DD', darkTint: 'rgba(228,160,50,0.25)' },
  { id: 'deadline', label: 'Deadline', accent: '#B0653C', tint: '#F7E9E1', darkTint: 'rgba(176,101,60,0.25)' },
  { id: 'libur',    label: 'Libur',    accent: '#A08A72', tint: '#F0EAE1', darkTint: 'rgba(160,138,114,0.25)' },
];

// Definisi Seksi Bidang (Divisi)
const SEKBIDS = [
  { id: 'humas',       label: 'HUMAS' },
  { id: 'kerohanian',  label: 'KEROHANIAN' },
  { id: 'media',       label: 'MEDIA' },
  { id: 'psdm',        label: 'PSDM' },
];

// Definisi Status Program
const STATUSES = [
  { id: 'rencana',  label: 'Rencana' },
  { id: 'berjalan', label: 'Berjalan' },
  { id: 'selesai',  label: 'Selesai' },
  { id: 'batal',    label: 'Batal' },
];

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/* ---------- Fungsi Bantu Tanggal & Utilitas ---------- */

const el = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const todayISO = () => toISO(new Date());

/** Senin sebagai awal pekan: 0 = Senin ... 6 = Minggu */
const mondayIndex = d => (d.getDay() + 6) % 7;

function formatDate(iso, style = 'long') {
  const d = fromISO(iso);
  if (style === 'long')   return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (style === 'medium') return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (style === 'short')  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function relativeLabel(iso) {
  const diff = Math.round((fromISO(iso) - fromISO(todayISO())) / 86400000);
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Besok';
  if (diff === -1) return 'Kemarin';
  if (diff > 1 && diff < 7) return `${diff} hari lagi`;
  return formatDate(iso, 'short');
}

const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[1];
const sekbidOf = id => SEKBIDS.find(s => s.id === id);
const statusOf = id => STATUSES.find(s => s.id === id) || STATUSES[0];
const uid = () => 'ev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function canManage() {
  return currentUser && (currentUser.role === 'admin' || currentUser.role === 'pembina');
}

/* ---------- Manajemen Pengguna & Sesi ---------- */

function loadAuthData() {
  try {
    users = JSON.parse(localStorage.getItem(USERS_KEY)) || DEFAULT_USERS.slice();
  } catch (_) {
    users = DEFAULT_USERS.slice();
  }

  try {
    assignments = JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY)) || [];
  } catch (_) {
    assignments = [];
  }

  if (!localStorage.getItem(USERS_KEY)) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  try {
    const id = localStorage.getItem(SESSION_KEY);
    currentUser = users.find(u => u.id === id) || null;
  } catch (_) {
    currentUser = null;
  }
}

function saveAuthData() {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

function showLogin() {
  const m = el('loginModal');
  if (m && !m.open) m.showModal();
}

function login(username, password) {
  const u = users.find(x => x.username.toLowerCase() === username.toLowerCase() && x.password === password);
  if (!u) return false;

  currentUser = u;
  localStorage.setItem(SESSION_KEY, u.id);
  el('loginModal').close();
  updateAuthUI();
  render();
  toast(`Selamat datang, ${u.name}`);
  return true;
}

function logout() {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  updateAuthUI();
  showLogin();
}

function updateAuthUI() {
  const btnUser = el('btnUser');
  if (btnUser) {
    btnUser.textContent = currentUser ? `${currentUser.name} · Keluar` : 'Masuk';
  }

  const adminPanel = el('adminPanel');
  if (adminPanel) adminPanel.hidden = !canManage();

  const btnAdd = el('btnAdd');
  if (btnAdd) btnAdd.hidden = !canManage();

  const btnAddDay = el('btnAddDay');
  if (btnAddDay) btnAddDay.hidden = !canManage();

  const btnImport = el('btnImport');
  if (btnImport) btnImport.hidden = !canManage();

  const btnReset = el('btnReset');
  if (btnReset) btnReset.hidden = !canManage();
}

/* ---------- Status Aplikasi (State) ---------- */

const state = {
  view: new Date(),                 // Bulan & tahun yang sedang ditampilkan
  selected: todayISO(),             // Tanggal aktif terpilih
  events: [],
  filters: new Set(),               // Kosong = tampilkan semua
  query: '',
  editingId: null,
  draftCategory: 'kegiatan',
  draftStatus: 'rencana',
  viewMode: 'grid',                 // 'grid' | 'agenda'
};

/* ---------- Tema Gelap / Terang ---------- */

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  const iconDark = el('themeIconDark');
  const iconLight = el('themeIconLight');
  if (iconDark && iconLight) {
    iconDark.hidden = isDark;
    iconLight.hidden = !isDark;
  }
  const btnLoginTheme = el('btnLoginTheme');
  if (btnLoginTheme) {
    btnLoginTheme.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';
  }
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ---------- Penyimpanan Kegiatan ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const savedEvents = JSON.parse(raw);
      if (Array.isArray(savedEvents)) {
        state.events = savedEvents;
        return;
      }
    }
  } catch (e) {
    console.warn('Gagal membaca data tersimpan:', e);
  }
  state.events = seedEvents();
  save();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
  } catch (e) {
    toast('Gagal menyimpan - memori browser penuh');
  }
}

/** Kegiatan Awal Demonstrasi OSIS SMAIT Anak Sholeh */
function seedEvents() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  const day = n => toISO(new Date(y, m, Math.min(n, new Date(y, m + 1, 0).getDate())));

  return [
    {
      id: uid(), title: 'Rapat Pleno Pengurus OSIS', date: day(4), endDate: '', allDay: false,
      start: '13:30', end: '15:00', category: 'rapat', location: 'Ruang OSIS',
      sekbid: 'psdm', pic: 'Ketua OSIS', status: 'selesai',
      link: 'https://meet.google.com',
      notes: 'Evaluasi program kerja triwulan.', createdAt: Date.now()
    },
    {
      id: uid(), title: 'Pekan Olahraga Antarkelas (Porseni)', date: day(11), endDate: day(14), allDay: true,
      start: '', end: '', category: 'kegiatan', location: 'Lapangan Sekolah',
      sekbid: 'psdm', pic: 'Divisi PSDM', status: 'berjalan',
      link: '',
      notes: 'Futsal, voli, badminton, dan tenis meja.', createdAt: Date.now()
    },
    {
      id: uid(), title: 'Lomba Tahfidz & Da\'i Antar Kelas', date: day(18), endDate: '', allDay: false,
      start: '08:00', end: '11:30', category: 'lomba', location: 'Masjid SMAIT Anak Sholeh',
      sekbid: 'kerohanian', pic: 'Divisi Kerohanian', status: 'rencana',
      link: '',
      notes: 'Kategori 3 Juz dan Ceramah Keislaman.', createdAt: Date.now()
    },
    {
      id: uid(), title: 'Batas Kumpul Proposal Bakti Sosial', date: day(22), endDate: '', allDay: true,
      start: '', end: '', category: 'deadline', location: 'Ruang Kesiswaan',
      sekbid: 'humas', pic: 'Divisi Humas', status: 'rencana',
      link: '',
      notes: 'Diserahkan langsung ke Pembina OSIS.', createdAt: Date.now()
    },
    {
      id: uid(), title: 'Publikasi Buletin & Dokumentasi OSIS', date: day(26), endDate: '', allDay: true,
      start: '', end: '', category: 'kegiatan', location: 'Media Center',
      sekbid: 'media', pic: 'Divisi Media', status: 'rencana',
      link: '',
      notes: 'Rilis buletin bulanan digital di media sosial.', createdAt: Date.now()
    },
  ];
}

/* ---------- Penyaringan & Pengurutan ---------- */

function passesFilter(ev) {
  if (state.filters.size && !state.filters.has(ev.category)) return false;
  if (!state.query) return true;

  const q = state.query.toLowerCase();
  const sekbidLabel = (sekbidOf(ev.sekbid) || {}).label || '';
  const statusLabel = (statusOf(ev.status) || {}).label || '';

  return [ev.title, ev.location, ev.notes, ev.pic, catOf(ev.category).label, sekbidLabel, statusLabel]
    .some(v => (v || '').toLowerCase().includes(q));
}

function eventsOn(iso, applyFilter = true) {
  return state.events
    .filter(ev => iso >= ev.date && iso <= (ev.endDate || ev.date))
    .filter(ev => !applyFilter || passesFilter(ev))
    .sort(sortEvents);
}

function sortEvents(a, b) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const t = (a.start || '99:99').localeCompare(b.start || '99:99');
  return t !== 0 ? t : a.title.localeCompare(b.title);
}

function timeLabel(ev) {
  if (ev.allDay) return 'Sepanjang hari';
  if (ev.start && ev.end) return `${ev.start} - ${ev.end}`;
  return ev.start || 'Sepanjang hari';
}

function rangeLabel(ev) {
  if (!ev.endDate || ev.endDate === ev.date) return formatDate(ev.date, 'long');
  return `${formatDate(ev.date, 'short')} - ${formatDate(ev.endDate, 'medium')}`;
}

/* ---------- Render Antarmuka (UI) ---------- */

function render() {
  renderFilters();
  renderGrid();
  renderDayPanel();
  renderUpcoming();
  renderStats();
  renderMyTasks();
  notifyTodayIfAllowed();

  if (state.viewMode === 'agenda') {
    renderAgendaView();
  }
}

function renderFilters() {
  const box = el('filters');
  if (!box) return;

  const all = `<button class="chip chip--all" data-cat="" aria-pressed="${state.filters.size === 0}">
      <span class="dot"></span>Semua</button>`;

  box.innerHTML = all + CATEGORIES.map(c => `
    <button class="chip" data-cat="${c.id}" style="--dot:${c.accent}" aria-pressed="${state.filters.has(c.id)}">
      <span class="dot"></span>${c.label}
    </button>`).join('');
}

function renderGrid() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = mondayIndex(first);
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;

  el('monthLabel').textContent = `${MONTHS[m]} ${y}`;

  const monthCount = state.events.filter(ev => {
    const s = ev.date.slice(0, 7);
    const e = (ev.endDate || ev.date).slice(0, 7);
    const key = `${y}-${pad(m + 1)}`;
    return s <= key && e >= key;
  }).filter(passesFilter).length;

  el('monthMeta').textContent = monthCount
    ? `${monthCount} kegiatan pada bulan ini`
    : 'Belum ada kegiatan pada bulan ini';

  const today = todayISO();
  let html = '';

  for (let i = 0; i < total; i++) {
    const d = new Date(y, m, i - lead + 1);
    const iso = toISO(d);
    const outside = d.getMonth() !== m;
    const weekend = mondayIndex(d) >= 5;
    const list = eventsOn(iso);
    const shown = list.slice(0, 3);
    const rest = list.length - shown.length;

    const classes = ['day'];
    if (outside) classes.push('day--out');
    if (weekend) classes.push('day--weekend');
    if (iso === today) classes.push('day--today');
    if (iso === state.selected) classes.push('day--selected');

    html += `<div class="${classes.join(' ')}" role="button" tabindex="0"
                  data-date="${iso}" aria-label="${formatDate(iso, 'long')}, ${list.length} kegiatan">
        <div class="day__header">
          <span class="day__num">${d.getDate()}</span>
        </div>
        <div class="day__events">
          ${shown.map(ev => {
            const c = catOf(ev.category);
            const t = !ev.allDay && ev.start ? `<span class="ev__time">${ev.start}</span>` : '';
            return `<button type="button" class="ev" data-id="${ev.id}" style="--accent:${c.accent};--tint:${c.tint};--dark-tint:${c.darkTint}" title="${escapeHTML(ev.title)} (${c.label})" aria-label="${escapeHTML(ev.title)}">
                      ${t}<span class="ev__name">${escapeHTML(ev.title)}</span></button>`;
          }).join('')}
          ${rest > 0 ? `<span class="ev ev--more">+${rest} lainnya</span>` : ''}
        </div>
      </div>`;
  }

  el('calGrid').innerHTML = html;
  el('footerCount').textContent = `${state.events.length} kegiatan tersimpan`;
}

function eventCard(ev, opts = {}) {
  const c = catOf(ev.category);
  const status = statusOf(ev.status);
  const sekbid = sekbidOf(ev.sekbid);

  const meta = [];
  if (opts.showDate) meta.push(relativeLabel(ev.date));
  meta.push(timeLabel(ev));
  if (ev.location) meta.push(ev.location);
  if (ev.pic) meta.push(`PIC: ${ev.pic}`);
  if (ev.endDate && ev.endDate !== ev.date && !opts.showDate) meta.push(rangeLabel(ev));

  const badges = [];
  badges.push(`<span class="status-badge status-badge--${status.id}">${status.label}</span>`);
  if (sekbid) badges.push(`<span class="sekbid-badge">${sekbid.label}</span>`);

  const linkHtml = ev.link ? `<a href="${escapeHTML(ev.link)}" target="_blank" rel="noopener noreferrer" class="item__link" onclick="event.stopPropagation()">
      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg>
      Buka Tautan
    </a>` : '';

  return `<button class="item" data-id="${ev.id}" style="--accent:${c.accent}">
      <span class="item__top">
        <span class="item__title">${escapeHTML(ev.title)}</span>
        <span class="item__cat">${c.label}</span>
      </span>
      <span class="item__badges">${badges.join('')}</span>
      <span class="item__meta">${meta.map(t => `<span>${escapeHTML(t)}</span>`).join('')}</span>
      ${ev.notes ? `<span class="item__notes">${escapeHTML(ev.notes)}</span>` : ''}
      ${linkHtml}
    </button>`;
}

function renderDayPanel() {
  const list = eventsOn(state.selected);
  el('dayTitle').textContent = formatDate(state.selected, 'long');
  el('dayCount').textContent = list.length;
  el('dayEvents').innerHTML = list.length
    ? list.map(ev => eventCard(ev)).join('')
    : `<div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <p>Tidak ada kegiatan pada tanggal ini.</p>
      </div>`;
}

function renderUpcoming() {
  const today = todayISO();
  const list = state.events
    .filter(ev => (ev.endDate || ev.date) >= today)
    .filter(passesFilter)
    .sort((a, b) => a.date.localeCompare(b.date) || sortEvents(a, b))
    .slice(0, 5);

  el('upcoming').innerHTML = list.length
    ? list.map(ev => eventCard(ev, { showDate: true })).join('')
    : `<p class="empty">Belum ada kegiatan mendatang.</p>`;
}

function renderStats() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  const key = `${y}-${pad(m + 1)}`;
  const monthEvents = state.events.filter(ev => {
    const s = ev.date.slice(0, 7);
    const e = (ev.endDate || ev.date).slice(0, 7);
    return s <= key && e >= key;
  });

  const total = monthEvents.length;
  const done = monthEvents.filter(ev => ev.status === 'selesai').length;
  const upcoming = monthEvents.filter(ev => ev.status !== 'selesai' && ev.status !== 'batal').length;

  if (el('statTotal')) el('statTotal').textContent = total;
  if (el('statDone')) el('statDone').textContent = done;
  if (el('statUpcoming')) el('statUpcoming').textContent = upcoming;
}

function renderMyTasks() {
  const box = el('myTasks');
  if (!box) return;

  const mine = currentUser ? assignments.filter(a => a.userId === currentUser.id) : [];
  el('taskCount').textContent = mine.length;
  box.innerHTML = mine.length ? mine.map(a => {
    const ev = state.events.find(e => e.id === a.eventId);
    return `<div class="task-card"><strong>${escapeHTML(a.task)}</strong><span>${escapeHTML(ev ? ev.title : 'Kegiatan dihapus')}</span><span class="muted"> · ${ev ? formatDate(ev.date, 'short') : ''}</span></div>`;
  }).join('') : '<p class="empty">Belum ada tugas yang ditugaskan.</p>';
}

function renderAgendaView() {
  const container = el('agendaList');
  if (!container) return;

  const filtered = state.events
    .filter(passesFilter)
    .sort((a, b) => a.date.localeCompare(b.date) || sortEvents(a, b));

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty" style="padding: 40px 16px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <p>Tidak ada kegiatan yang cocok dengan saringan saat ini.</p>
      </div>`;
    return;
  }

  const groups = {};
  filtered.forEach(ev => {
    if (!groups[ev.date]) groups[ev.date] = [];
    groups[ev.date].push(ev);
  });

  let html = '';
  for (const dateIso of Object.keys(groups)) {
    html += `
      <div class="agenda-group">
        <div class="agenda-date">
          <span>${formatDate(dateIso, 'long')}</span>
        </div>
        <div class="stack" style="padding: 10px 14px 4px;">
          ${groups[dateIso].map(ev => eventCard(ev, { showDate: false })).join('')}
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

function setViewMode(mode) {
  state.viewMode = mode;
  const isGrid = mode === 'grid';
  el('viewGridBtn').classList.toggle('is-active', isGrid);
  el('viewGridBtn').setAttribute('aria-selected', isGrid);
  el('viewAgendaBtn').classList.toggle('is-active', !isGrid);
  el('viewAgendaBtn').setAttribute('aria-selected', !isGrid);

  el('monthGridView').hidden = !isGrid;
  el('agendaListView').hidden = isGrid;

  if (!isGrid) renderAgendaView();
}

/* ---------- Modal Kegiatan & Form Input ---------- */

const modal = el('eventModal');

function renderCategoryChips(selected) {
  el('fCategory').innerHTML = CATEGORIES.map(c => `
    <button type="button" class="chip" data-cat="${c.id}"
            style="--dot:${c.accent};--accent:${c.accent};--tint:${c.tint}"
            aria-pressed="${c.id === selected}">
      <span class="dot"></span>${c.label}
    </button>`).join('');
}

function renderStatusChips(selected) {
  el('fStatus').querySelectorAll('.chip--status').forEach(btn => {
    const isAct = btn.dataset.status === selected;
    btn.classList.toggle('is-active', isAct);
    btn.setAttribute('aria-pressed', isAct);
  });
}

function openModal(mode, payload = {}) {
  if (!canManage()) {
    toast('Hanya admin atau pembina yang dapat menambah/mengubah kegiatan');
    return;
  }

  const isEdit = mode === 'edit';
  state.editingId = isEdit ? payload.id : null;

  el('modalTitle').textContent = isEdit ? 'Ubah Kegiatan' : 'Tambah Kegiatan';
  el('btnDelete').hidden = !isEdit;

  const ev = isEdit ? payload : {
    title: '', date: payload.date || state.selected, endDate: '',
    allDay: true, start: '', end: '', category: 'kegiatan',
    sekbid: '', pic: '', status: 'rencana', link: '',
    location: '', notes: '',
  };

  el('fTitle').value = ev.title;
  el('fDate').value = ev.date;
  el('fEndDate').value = ev.endDate || '';
  el('fAllDay').checked = ev.allDay;
  el('fStart').value = ev.start || '';
  el('fEnd').value = ev.end || '';
  el('fSekbid').value = ev.sekbid || '';
  el('fPic').value = ev.pic || '';
  el('fLink').value = ev.link || '';
  el('fLocation').value = ev.location || '';
  el('fNotes').value = ev.notes || '';

  state.draftCategory = ev.category || 'kegiatan';
  state.draftStatus = ev.status || 'rencana';
  renderCategoryChips(state.draftCategory);
  renderStatusChips(state.draftStatus);
  renderAssignmentSection(isEdit ? payload.id : null);
  syncTimeRow();
  clearErrors();

  modal.showModal();
  setTimeout(() => el('fTitle').focus(), 50);
}

function renderAssignmentSection(eventId) {
  const section = el('assignmentSection');
  if (!section) return;

  section.hidden = !canManage() || !eventId;
  if (!eventId) return;

  el('assignmentUser').innerHTML = users.map(u => `<option value="${u.id}">${escapeHTML(u.name)} (${u.role})</option>`).join('');
  const list = assignments.filter(a => a.eventId === eventId);

  el('assignmentList').innerHTML = list.length ? list.map(a => {
    const u = users.find(x => x.id === a.userId);
    return `<div class="assignment-row"><span>${escapeHTML(u ? u.name : 'Pengguna')} — ${escapeHTML(a.task)}</span><button type="button" data-assignment-id="${a.id}" aria-label="Hapus tugas">Hapus</button></div>`;
  }).join('') : '<p class="hint">Belum ada tugas untuk kegiatan ini.</p>';
}

function addAssignment() {
  const eventId = state.editingId;
  if (!eventId) return;

  const userId = el('assignmentUser').value;
  const task = el('assignmentTask').value.trim();

  if (!userId || !task) {
    toast('Pilih anggota dan masukkan tugas');
    return;
  }

  assignments.push({
    id: 'assign_' + Date.now().toString(36),
    eventId,
    userId,
    task,
    assignedBy: currentUser.id,
    createdAt: Date.now()
  });

  el('assignmentTask').value = '';
  saveAuthData();
  renderAssignmentSection(eventId);
  renderMyTasks();
  toast('Tugas penugasan ditambahkan');
}

function deleteAssignment(id) {
  assignments = assignments.filter(a => a.id !== id);
  saveAuthData();
  renderAssignmentSection(state.editingId);
  renderMyTasks();
}

function syncTimeRow() {
  el('timeRow').hidden = el('fAllDay').checked;
}

function clearErrors() {
  ['errTitle', 'errDate'].forEach(id => {
    const node = el(id);
    if (node) node.textContent = '';
  });
  ['fTitle', 'fDate'].forEach(id => {
    const node = el(id);
    if (node) node.classList.remove('invalid');
  });
}

function submitForm(e) {
  e.preventDefault();
  clearErrors();

  const title = el('fTitle').value.trim();
  const date = el('fDate').value;
  let endDate = el('fEndDate').value;
  const allDay = el('fAllDay').checked;
  let ok = true;

  if (!title) {
    el('errTitle').textContent = 'Nama kegiatan wajib diisi.';
    el('fTitle').classList.add('invalid');
    ok = false;
  }

  if (!date) {
    el('errDate').textContent = 'Tanggal mulai wajib diisi.';
    el('fDate').classList.add('invalid');
    ok = false;
  }

  if (date && endDate && endDate < date) {
    el('errDate').textContent = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    el('fDate').classList.add('invalid');
    ok = false;
  }

  if (!ok) return;

  if (endDate === date) endDate = '';

  const data = {
    title, date, endDate, allDay,
    start: allDay ? '' : el('fStart').value,
    end:   allDay ? '' : el('fEnd').value,
    category: state.draftCategory,
    status:   state.draftStatus || 'rencana',
    sekbid:   el('fSekbid').value,
    pic:      el('fPic').value.trim(),
    link:     el('fLink').value.trim(),
    location: el('fLocation').value.trim(),
    notes:    el('fNotes').value.trim(),
  };

  if (state.editingId) {
    const i = state.events.findIndex(ev => ev.id === state.editingId);
    state.events[i] = { ...state.events[i], ...data };
    toast('Kegiatan diperbarui');
  } else {
    state.events.push({ id: uid(), createdAt: Date.now(), ...data });
    toast('Kegiatan ditambahkan');
  }

  state.selected = date;
  state.view = fromISO(date);
  save();
  modal.close();
  render();
}

function deleteEvent() {
  const ev = state.events.find(e => e.id === state.editingId);
  if (!ev) return;
  if (!confirm(`Hapus kegiatan "${ev.title}"?`)) return;

  const deletedId = state.editingId;
  state.events = state.events.filter(e => e.id !== deletedId);
  assignments = assignments.filter(a => a.eventId !== deletedId);

  save();
  saveAuthData();
  modal.close();
  render();
  toast('Kegiatan dihapus');
}

/* ---------- Notifikasi Toast ---------- */

function toast(msg) {
  const t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('toast--show'), 2400);
}

/* ---------- Ekspor / Impor Data ---------- */

function exportJSON() {
  const blob = new Blob([JSON.stringify(state.events, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kalender-osis-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Data diekspor ke berkas JSON');
}

function formatIcsDate(iso, timeStr, isEnd = false) {
  const cleanIso = iso.replace(/-/g, '');
  if (!timeStr) {
    if (isEnd) {
      const d = fromISO(iso);
      d.setDate(d.getDate() + 1);
      return toISO(d).replace(/-/g, '');
    }
    return cleanIso;
  }
  const cleanTime = timeStr.replace(/:/g, '') + '00';
  return `${cleanIso}T${cleanTime}`;
}

function escapeIcs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function exportICS() {
  if (!state.events.length) {
    toast('Tidak ada kegiatan untuk diekspor');
    return;
  }

  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OSIS SMAIT Anak Sholeh Mataram//Kalender Kegiatan//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Kalender OSIS SMAIT Anak Sholeh',
    'X-WR-TIMEZONE:Asia/Makassar',
  ];

  state.events.forEach(ev => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id || uid()}@osis-smait-anaksholeh`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`SUMMARY:${escapeIcs(ev.title)}`);

    const cat = catOf(ev.category);
    const sekbid = sekbidOf(ev.sekbid);
    const status = statusOf(ev.status);

    const cats = [cat.label];
    if (sekbid) cats.push(sekbid.label);
    lines.push(`CATEGORIES:${escapeIcs(cats.join(','))}`);

    if (ev.location) lines.push(`LOCATION:${escapeIcs(ev.location)}`);
    if (ev.link) lines.push(`URL:${escapeIcs(ev.link)}`);

    const descLines = [];
    if (status) descLines.push(`Status: ${status.label}`);
    if (sekbid) descLines.push(`Seksi Bidang: ${sekbid.label}`);
    if (ev.pic) descLines.push(`PIC: ${ev.pic}`);
    if (ev.notes) descLines.push(ev.notes);
    if (ev.link) descLines.push(`Tautan: ${ev.link}`);
    if (descLines.length) lines.push(`DESCRIPTION:${escapeIcs(descLines.join('\n'))}`);

    const isAllDay = ev.allDay || (!ev.start && !ev.end);
    const endIso = ev.endDate || ev.date;

    if (isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(ev.date, null, false)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(endIso, null, true)}`);
    } else {
      const startTime = ev.start || '08:00';
      let endTime = ev.end;
      if (!endTime) {
        const [h, m] = startTime.split(':').map(Number);
        const endH = Math.min(23, h + 1);
        endTime = `${pad(endH)}:${pad(m)}`;
      }
      lines.push(`DTSTART:${formatIcsDate(ev.date, startTime, false)}`);
      lines.push(`DTEND:${formatIcsDate(endIso, endTime, false)}`);
    }

    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kalender-osis-${todayISO()}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Kalender .ics diekspor (Google/Apple Calendar)');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('format');

      const valid = data.filter(ev => ev && typeof ev.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ev.date));
      if (!valid.length) throw new Error('kosong');

      const existing = new Set(state.events.map(ev => ev.id));
      let added = 0;

      valid.forEach(ev => {
        const id = existing.has(ev.id) || !ev.id ? uid() : ev.id;
        state.events.push({
          id,
          title: ev.title,
          date: ev.date,
          endDate: ev.endDate || '',
          allDay: ev.allDay !== false,
          start: ev.start || '',
          end: ev.end || '',
          category: catOf(ev.category).id,
          status: ev.status || 'rencana',
          sekbid: ev.sekbid || '',
          pic: ev.pic || '',
          link: ev.link || '',
          location: ev.location || '',
          notes: ev.notes || '',
          createdAt: ev.createdAt || Date.now(),
        });
        existing.add(id);
        added++;
      });

      save();
      render();
      toast(`${added} kegiatan berhasil diimpor`);
    } catch (err) {
      toast('Berkas JSON tidak valid atau kosong');
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!confirm('Hapus SEMUA kegiatan yang tersimpan? Tindakan ini tidak bisa dibatalkan.')) return;
  state.events = [];
  assignments = [];
  save();
  saveAuthData();
  render();
  toast('Semua kegiatan telah dihapus');
}

/* ---------- Administrasi Pengguna ---------- */

function renderUsers() {
  const box = el('usersList');
  if (!box) return;

  box.innerHTML = users.map(u => `
    <div class="assignment-row">
      <span><b>${escapeHTML(u.name)}</b> &bull; ${escapeHTML(u.username)} (${escapeHTML(u.role)})</span>
      ${u.id !== 'u1' ? `<button type="button" data-user-id="${u.id}">Hapus</button>` : '<span class="muted small">Utama</span>'}
    </div>`).join('');
}

function addUser() {
  const name = el('newUserName').value.trim();
  const username = el('newUserUsername').value.trim();
  const password = el('newUserPassword').value;

  if (!name || !username || !password) {
    toast('Lengkapi seluruh isian pengguna');
    return;
  }

  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    toast('Username sudah terdaftar');
    return;
  }

  users.push({
    id: 'u_' + Date.now().toString(36),
    name,
    username,
    password,
    role: el('newUserRole').value,
    sekbid: ''
  });

  saveAuthData();
  ['newUserName', 'newUserUsername', 'newUserPassword'].forEach(id => el(id).value = '');
  renderUsers();
  toast('Pengguna baru berhasil ditambahkan');
}

/* ---------- Gestur Sentuh Ponsel & PWA ---------- */

function setupTouchGestures() {
  const grid = el('calendarCard');
  if (!grid) return;

  let startX = 0;
  let startY = 0;

  grid.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }
  }, { passive: true });

  grid.addEventListener('touchend', e => {
    if (e.changedTouches.length === 1) {
      const diffX = e.changedTouches[0].clientX - startX;
      const diffY = e.changedTouches[0].clientY - startY;
      if (Math.abs(diffX) > 55 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
        if (diffX > 0) shiftMonth(-1); // Geser kanan: bulan lalu
        else shiftMonth(1);          // Geser kiri: bulan depan
      }
    }
  }, { passive: true });
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    toast('Browser ini belum mendukung fitur notifikasi');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    toast('Notifikasi berhasil diaktifkan');
    notifyTodayIfAllowed(true);
  } else {
    toast('Izin notifikasi tidak diberikan');
  }
}

function notifyTodayIfAllowed(force = false) {
  if (!currentUser || !('Notification' in window) || Notification.permission !== 'granted') return;

  const today = todayISO();
  if (!force && localStorage.getItem(NOTIFY_KEY) === today) return;

  const events = state.events.filter(e => e.date <= today && today <= (e.endDate || e.date));
  const tasks = assignments.filter(a => a.userId === currentUser.id && state.events.some(e => e.id === a.eventId && e.date <= today && today <= (e.endDate || e.date)));

  if (!events.length && !tasks.length) return;

  const lines = [];
  if (events.length) lines.push(`${events.length} kegiatan hari ini`);
  if (tasks.length) lines.push(`${tasks.length} tugas untuk Anda`);
  const body = lines.join(' · ');

  if (navigator.serviceWorker?.ready) {
    navigator.serviceWorker.ready.then(r => r.showNotification('Kalender OSIS SMAIT', {
      body,
      icon: 'assets/logo.png',
      tag: `osis-${today}`
    })).catch(() => new Notification('Kalender OSIS SMAIT', { body }));
  } else {
    new Notification('Kalender OSIS SMAIT', { body });
  }

  localStorage.setItem(NOTIFY_KEY, today);
}

function selectDate(iso) {
  state.selected = iso;
  const d = fromISO(iso);
  if (d.getMonth() !== state.view.getMonth() || d.getFullYear() !== state.view.getFullYear()) {
    state.view = d;
  }
  render();
}

function shiftMonth(delta) {
  state.view = new Date(state.view.getFullYear(), state.view.getMonth() + delta, 1);
  render();
}

/* ---------- Event Listeners Binding ---------- */

function bind() {
  // Login & Autentikasi
  el('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const ok = login(el('loginUsername').value.trim(), el('loginPassword').value);
    el('loginError').textContent = ok ? '' : 'Nama pengguna atau kata sandi salah.';
  });

  el('btnUser').addEventListener('click', () => {
    if (currentUser) {
      if (confirm(`Keluar dari akun ${currentUser.name}?`)) logout();
    } else {
      showLogin();
    }
  });

  el('btnInstall').addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      toast('Gunakan menu browser untuk memasang aplikasi');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    el('btnInstall').hidden = true;
  });

  el('btnNotifications').addEventListener('click', enableNotifications);

  el('btnLoginTheme').addEventListener('click', () => {
    toggleTheme();
  });

  // Kelola Pengguna
  el('btnManageUsers').addEventListener('click', () => {
    renderUsers();
    el('usersModal').showModal();
  });
  el('btnCloseUsers').addEventListener('click', () => el('usersModal').close());
  el('btnAddUser').addEventListener('click', addUser);
  el('usersList').addEventListener('click', e => {
    const id = e.target.dataset.userId;
    if (id && id !== 'u1' && confirm('Hapus pengguna ini?')) {
      users = users.filter(u => u.id !== id);
      assignments = assignments.filter(a => a.userId !== id);
      saveAuthData();
      renderUsers();
      renderMyTasks();
      toast('Pengguna dihapus');
    }
  });

  // Penugasan
  el('btnAddAssignment').addEventListener('click', addAssignment);
  el('assignmentList').addEventListener('click', e => {
    const id = e.target.dataset.assignmentId;
    if (id) deleteAssignment(id);
  });

  // Navigasi Bulan
  el('btnPrev').addEventListener('click', () => shiftMonth(-1));
  el('btnNext').addEventListener('click', () => shiftMonth(1));
  el('btnToday').addEventListener('click', () => {
    state.view = new Date();
    selectDate(todayISO());
  });

  // Tambah Kegiatan
  el('btnAdd').addEventListener('click', () => openModal('add', { date: state.selected }));
  el('btnAddDay').addEventListener('click', () => openModal('add', { date: state.selected }));

  // Tema
  const btnTheme = el('btnTheme');
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);

  // Tampilan
  el('viewGridBtn').addEventListener('click', () => setViewMode('grid'));
  el('viewAgendaBtn').addEventListener('click', () => setViewMode('agenda'));

  // Interaksi Kalender Grid
  el('calGrid').addEventListener('click', e => {
    const evChip = e.target.closest('.ev[data-id]');
    if (evChip) {
      e.stopPropagation();
      const ev = state.events.find(x => x.id === evChip.dataset.id);
      if (ev) {
        selectDate(ev.date);
        if (canManage()) openModal('edit', ev);
        return;
      }
    }
    const cell = e.target.closest('.day');
    if (cell) selectDate(cell.dataset.date);
  });

  el('calGrid').addEventListener('dblclick', e => {
    const evChip = e.target.closest('.ev[data-id]');
    if (evChip) return;
    const cell = e.target.closest('.day');
    if (cell) openModal('add', { date: cell.dataset.date });
  });

  el('calGrid').addEventListener('keydown', e => {
    const evChip = e.target.closest('.ev[data-id]');
    if (evChip && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      const ev = state.events.find(x => x.id === evChip.dataset.id);
      if (ev) {
        selectDate(ev.date);
        if (canManage()) openModal('edit', ev);
        return;
      }
    }
    const cell = e.target.closest('.day');
    if (!cell) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectDate(cell.dataset.date);
    }
  });

  // Klik kartu kegiatan di sidebar / agenda
  document.addEventListener('click', e => {
    const item = e.target.closest('.item');
    if (!item) return;
    const ev = state.events.find(x => x.id === item.dataset.id);
    if (ev && canManage()) openModal('edit', ev);
  });

  // Filter Kategori
  el('filters').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const cat = chip.dataset.cat;
    if (!cat) {
      state.filters.clear();
    } else {
      state.filters.has(cat) ? state.filters.delete(cat) : state.filters.add(cat);
    }
    render();
  });

  // Pencarian
  el('searchInput').addEventListener('input', e => {
    state.query = e.target.value.trim();
    render();
  });

  // Form Kegiatan
  el('fCategory').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.draftCategory = chip.dataset.cat;
    renderCategoryChips(state.draftCategory);
  });

  el('fStatus').addEventListener('click', e => {
    const chip = e.target.closest('.chip--status');
    if (!chip) return;
    state.draftStatus = chip.dataset.status;
    renderStatusChips(state.draftStatus);
  });

  el('fAllDay').addEventListener('change', syncTimeRow);
  el('fDate').addEventListener('change', () => {
    const end = el('fEndDate');
    if (end.value && end.value < el('fDate').value) end.value = '';
    end.min = el('fDate').value;
  });

  el('eventForm').addEventListener('submit', submitForm);
  el('btnCancel').addEventListener('click', () => modal.close());
  el('btnClose').addEventListener('click', () => modal.close());
  el('btnDelete').addEventListener('click', deleteEvent);

  // Cadangan & Data
  el('btnExport').addEventListener('click', exportJSON);
  const btnExportIcs = el('btnExportIcs');
  if (btnExportIcs) btnExportIcs.addEventListener('click', exportICS);

  el('btnImport').addEventListener('click', () => el('fileInput').click());
  el('fileInput').addEventListener('change', e => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });

  el('btnReset').addEventListener('click', resetAll);

  // Gestur Ponsel
  setupTouchGestures();

  // Pintasan Keyboard
  document.addEventListener('keydown', e => {
    if (modal.open) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) return;

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      openModal('add', { date: state.selected });
    }
    if (e.key === 'ArrowLeft') shiftMonth(-1);
    if (e.key === 'ArrowRight') shiftMonth(1);
    if (e.key === 't' || e.key === 'T') {
      state.view = new Date();
      selectDate(todayISO());
    }
  });
}

/* ---------- Inisialisasi Aplikasi ---------- */

function init() {
  initTheme();
  loadAuthData();
  load();
  bind();
  updateAuthUI();
  render();

  // PWA Service Worker (Aktif pada HTTPS atau localhost)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('PWA ServiceWorker registrasi gagal:', err);
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const button = el('btnInstall');
    if (button) button.hidden = false;
  });
}

// Mulai aplikasi setelah DOM selesai dimuat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
