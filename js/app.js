const UNIT_OPTIONS = ['GCU-1', 'GCU-2', 'GPU-1', 'GPU-2', 'HDPE-1', 'HDPE-2', 'LLDPE-1', 'LLDPE-2', 'PP-1', 'PP-2', 'LPG', 'SPHERE', 'YARD', 'FLAKER-1', 'BOG', 'IOP','LOADING GANTRY','SCPT','ANP','ANP-II','DNP-1','DNP-2','Butene-1','New Butene-1'];
const EQUIPMENT_TYPES = ['Pipeline', 'Vessel', 'Exchanger', 'Steam Trap', 'Tank'];
const INSPECTION_STATUS_OPTIONS = ['Scaffolding Prepared', 'Manhole Opened', 'NDT in Progress', 'Insulation Removed', 'Manhole Box-up','Module Prepared'];
const PERMIT_TYPE_OPTIONS = [
  { value: 'REQ-CWP', label: 'Cold Work Permit' },
  { value: 'REQ-HWP', label: 'Hot Work Permit' },
  { value: 'REQ-ECP', label: 'Confined Space' },
  { value: 'REQ-ELP', label: 'Electrical' },
  { value: 'REQ-EXP', label: 'Excavation' },
  { value: 'REQ-RGP', label: 'Radiography' },
  { value: 'REQ-VHP', label: 'Vehicle Entry' },
  { value: 'REQ-WHP', label: 'Work at Height' }
];


function buildQuickActions() {
  const pages = [
    { href: 'dashboard.html', label: 'Dashboard' },
    { href: 'inspection.html', label: 'Inspection' },
    { href: 'observation.html', label: 'Observation' },
    { href: 'requisition.html', label: 'Requisition' },
    { href: 'permit_planning.html', label: 'Permit Planning' },
    { href: 'admin.html', label: 'Admin', adminOnly: true }
  ];

  const wrap = document.createElement('div');
  wrap.className = 'quick-actions';
  pages.forEach((p) => {
    if (p.adminOnly && !isAdmin()) return;
    const a = document.createElement('a');
    a.href = p.href;
    a.className = 'btn quick-btn';
    a.textContent = p.label;
    wrap.appendChild(a);
  });
  return wrap;
}

function injectCommonFooter() {
  if (document.querySelector('.site-footer')) return;
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.textContent = '© ATR-2026 Shutdown Inspection Tracker — Designed by Inspection Department';
  document.body.appendChild(footer);
}

function injectQuickActions() {
  if (document.body.dataset.page === 'login') return;
  const content = document.querySelector('.content');
  if (!content || content.querySelector('.quick-actions')) return;
  content.insertBefore(buildQuickActions(), content.firstChild.nextSibling);
}


function getLoggedInUser() {
  return localStorage.getItem(STORAGE_KEYS.sessionUser) || 'WindowsUser';
}

function getCurrentUserObj() {
  return getUser(getLoggedInUser());
}

function isAdmin() {
  const user = getCurrentUserObj();
  return user && user.role === 'admin';
}

function getTheme() {
  return localStorage.getItem('atr_theme') || 'dark';
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', getTheme());
}

function setupThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.onclick = () => {
    localStorage.setItem('atr_theme', getTheme() === 'dark' ? 'light' : 'dark');
    applyTheme();
  };
}

function setHeaderUser() {
  document.querySelectorAll('#loggedInUser').forEach((el) => {
    el.textContent = getLoggedInUser();
  });
}

function formatDateLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysSince(value) {
  if (!value) return '-';
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return '-';
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function ensurePdfLib() {
  return window.jspdf?.jsPDF || null;
}

function drawReportHeader(doc, title, subtitle = '') {
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, 194, 281);
  doc.setFillColor(15, 23, 42);
  doc.rect(8, 8, 194, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ATR-2026 Shutdown Inspection Tracker', 12, 18);
  doc.setFontSize(11);
  doc.text(title, 12, 26);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  if (subtitle) doc.text(subtitle, 12, 38);
}

function addPdfField(doc, label, value, y) {
  doc.setFont('helvetica', 'bold');
  doc.text(`${label}:`, 12, y);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(String(value || '-'), 152);
  doc.text(lines, 52, y);
  return y + Math.max(8, lines.length * 5 + 2);
}

function buildObservationReportPdf(row) {
  const jsPDF = ensurePdfLib();
  if (!jsPDF) {
    alert('PDF library not loaded. Please refresh and try again.');
    return '';
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawReportHeader(doc, 'Observation Email Report', `Generated on ${formatDateLabel(new Date().toISOString())}`);

  let y = 48;
  y = addPdfField(doc, 'Tag Number', row.tag_number, y);
  y = addPdfField(doc, 'Unit', row.unit, y);
  y = addPdfField(doc, 'Location', row.location, y);
  y = addPdfField(doc, 'Status', row.status, y);
  y = addPdfField(doc, 'Observation Date', formatDateLabel(row.timestamp), y);
  y = addPdfField(doc, 'Job Due Since (days)', daysSince(row.timestamp), y);
  y = addPdfField(doc, 'Observation Details', row.observation, y);
  y = addPdfField(doc, 'Recommendation', row.recommendation, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Attached Image Links:', 12, y);
  doc.setFont('helvetica', 'normal');
  y += 6;
  (row.images || []).forEach((img, idx) => {
    const text = `${idx + 1}. ${img}`;
    const lines = doc.splitTextToSize(text, 184);
    doc.text(lines, 12, y);
    y += Math.max(6, lines.length * 5 + 1);
  });
  if (!(row.images || []).length) doc.text('No images uploaded.', 12, y);

  const fileName = `Observation_Report_${sanitizeName(row.tag_number || row.id || 'report')}.pdf`;
  doc.save(fileName);
  return fileName;
}

function buildVesselInspectionPdf(vesselRows) {
  const jsPDF = ensurePdfLib();
  if (!jsPDF) {
    alert('PDF library not loaded. Please refresh and try again.');
    return;
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawReportHeader(doc, 'Vessel Inspection Report', `Generated on ${formatDateLabel(new Date().toISOString())}`);

  let y = 42;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.rect(10, y, 190, 8);
  doc.text('Tag', 12, y + 5.5);
  doc.text('Unit', 42, y + 5.5);
  doc.text('Name', 64, y + 5.5);
  doc.text('Status', 108, y + 5.5);
  doc.text('Final', 136, y + 5.5);
  doc.text('Updated By', 162, y + 5.5);
  y += 8;

  doc.setFont('helvetica', 'normal');
  vesselRows.forEach((row) => {
    if (y > 268) {
      doc.addPage();
      drawReportHeader(doc, 'Vessel Inspection Report (cont.)');
      y = 42;
    }
    doc.rect(10, y, 190, 8);
    doc.text((row.equipment_tag_number || '-').slice(0, 15), 12, y + 5.5);
    doc.text((row.unit_name || '-').slice(0, 10), 42, y + 5.5);
    doc.text((row.equipment_name || '-').slice(0, 20), 64, y + 5.5);
    doc.text((row.status || '-').slice(0, 16), 108, y + 5.5);
    doc.text((row.final_status || '-').slice(0, 10), 136, y + 5.5);
    doc.text((row.updated_by || '-').slice(0, 16), 162, y + 5.5);
    y += 8;
  });

  const lastUpdated = vesselRows.slice().sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))[0];
  doc.setFont('helvetica', 'bold');
  doc.text(`Signed by: ${lastUpdated?.updated_by || 'N/A'}`, 12, 278);
  doc.setFont('helvetica', 'normal');
  doc.text(`Last update: ${formatDateLabel(lastUpdated?.timestamp)}`, 90, 278);
  doc.save('Vessel_Inspection_Report.pdf');
}

function moveTopControlsToSidebar() {
  if (document.body.dataset.page === 'login') return;
  const headerRight = document.querySelector('.header-right');
  if (headerRight) headerRight.classList.add('hidden');
  document.body.classList.add('top-controls-moved');
}

function logoutCurrentUser() {
  localStorage.removeItem(STORAGE_KEYS.sessionUser);
  localStorage.removeItem('username');
  window.location.assign('index.html');
}

function setupUserMenu() {
  if (document.body.dataset.page === 'login') return;
  const sidebarNav = document.querySelector('.sidebar nav');
  if (!sidebarNav || sidebarNav.querySelector('.user-menu-wrap')) return;

  const wrap = document.createElement('div');
  wrap.className = 'user-menu-wrap sidebar-profile-wrap sidebar-menu-extras';

  const userBtn = document.createElement('button');
  userBtn.type = 'button';
  userBtn.className = 'btn user-menu';
  userBtn.textContent = `Menu: ${getLoggedInUser()} ⌄`;

  const menu = document.createElement('div');
  menu.className = 'user-menu-pop hidden';
  menu.innerHTML = `
    <p class="sidebar-signin">Signed in as: <span>${getLoggedInUser()}</span></p>
    <button type="button" class="btn theme-inside-menu">Toggle Theme</button>
    <button type="button" class="btn logout-btn">Logout</button>
  `;

  wrap.append(userBtn, menu);
  sidebarNav.appendChild(wrap);

  userBtn.addEventListener('click', () => menu.classList.toggle('hidden'));
  menu.querySelector('.logout-btn').addEventListener('click', logoutCurrentUser);
  menu.querySelector('.theme-inside-menu').addEventListener('click', () => {
    localStorage.setItem('atr_theme', getTheme() === 'dark' ? 'light' : 'dark');
    applyTheme();
  });

  document.addEventListener('click', (evt) => {
    if (!wrap.contains(evt.target)) menu.classList.add('hidden');
  });
}

function setupSidebarDrawer() {
  if (document.body.dataset.page === 'login') return;
  const sidebar = document.querySelector('.sidebar');
  const header = document.querySelector('.header');
  if (!sidebar || !header) return;

  document.body.classList.add('sidebar-collapsed');

  let menuBtn = document.getElementById('sidebarToggleBtn');
  if (!menuBtn) {
    menuBtn = document.createElement('button');
    menuBtn.id = 'sidebarToggleBtn';
    menuBtn.type = 'button';
    menuBtn.className = 'btn menu-btn';
    menuBtn.textContent = '☰ Menu';
    header.insertBefore(menuBtn, header.firstChild);
  }

  menuBtn.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
    document.body.classList.toggle('sidebar-collapsed');
  });

  document.addEventListener('click', (evt) => {
    const clickedInside = sidebar.contains(evt.target) || menuBtn.contains(evt.target);
    if (!clickedInside) {
      document.body.classList.remove('sidebar-open');
      document.body.classList.add('sidebar-collapsed');
    }
  });
}

function requireAuth() {
  if (document.body.dataset.page === 'login') return true;
  const user = getCurrentUserObj();
  if (!user || !user.approved) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function applyRoleVisibility() {
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.style.display = isAdmin() ? 'block' : 'none';
  });
  if (document.body.dataset.page === 'admin' && !isAdmin()) {
    alert('Admin access only');
    window.location.href = 'dashboard.html';
  }
}

function setupLogin() {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const msg = document.getElementById('authMessage');
  const pwd = document.getElementById('password');
  const showPwd = document.getElementById('showPasswordToggle');
  const newPwd = document.getElementById('newPassword');
  const showNewPwd = document.getElementById('showNewPasswordToggle');
  const googleSignInBtn = document.getElementById('googleSignInBtn');

  const signInTabBtn = document.getElementById('signInTabBtn');
  const createAccountTabBtn = document.getElementById('createAccountTabBtn');
  const signInPanel = document.getElementById('signInPanel');
  const createAccountPanel = document.getElementById('createAccountPanel');

  if (!loginForm && !signupForm) return;

  // Always-on cloud sync config (embedded as requested)
  setCloudConfig({ enabled: true, cloudinaryCloudName: 'dhlmqtton', cloudinaryUploadPreset: 'ATR-2026-I' });

  async function completeGoogleLogin(gUser) {
    if (!gUser) return;
    if (!gUser.email) throw new Error('Google sign-in did not return an email.');

    const username = gUser.email.trim().toLowerCase();

    // Rehydrate from cloud after Firebase auth completes so local stale cache
    // cannot overwrite existing cloud data during first write.
    await initializeData();

    let user = getUser(username);
    if (!user) {
      requestAccess({
        id: generateId('USR'),
        username,
        password: 'google-auth',
        role: 'inspector',
        approved: true,
        request_date: new Date().toISOString().slice(0, 10),
        approved_by: 'google-auth'
      });
      user = getUser(username);
    }

    if (user && !user.approved) {
      approveUser(username, 'google-auth');
      user = getUser(username);
    }

    localStorage.setItem(STORAGE_KEYS.sessionUser, user?.username || username);
    localStorage.setItem('username', user?.username || username);
    window.location.assign('dashboard.html');
  }

  function setActiveTab(tab) {
    if (!signInTabBtn || !createAccountTabBtn || !signInPanel || !createAccountPanel) return;
    const signInActive = tab === 'signin';
    signInTabBtn.classList.toggle('active', signInActive);
    createAccountTabBtn.classList.toggle('active', !signInActive);
    signInPanel.classList.toggle('hidden', !signInActive);
    createAccountPanel.classList.toggle('hidden', signInActive);
    if (msg) msg.textContent = '';
  }

  signInTabBtn?.addEventListener('click', () => setActiveTab('signin'));
  createAccountTabBtn?.addEventListener('click', () => setActiveTab('create'));

  if (showPwd && pwd) {
    showPwd.addEventListener('change', () => {
      pwd.type = showPwd.checked ? 'text' : 'password';
    });
  }

  if (showNewPwd && newPwd) {
    showNewPwd.addEventListener('change', () => {
      newPwd.type = showNewPwd.checked ? 'text' : 'password';
    });
  }

  if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
      try {
        const gUser = await signInWithGoogle();
        await completeGoogleLogin(gUser);
      } catch (err) {
        if (msg) msg.textContent = err.message || 'Google sign-in failed.';
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value.trim().toLowerCase();
      const password = document.getElementById('password').value;
      const user = getUser(username);

      if (!user) {
        if (msg) msg.textContent = 'User not found. Please create account request.';
        return;
      }

      if (user.password !== password) {
        if (msg) msg.textContent = 'Password is wrong.';
        return;
      }

      if (!user.approved) {
        if (msg) msg.textContent = 'Account pending admin approval.';
        return;
      }

      localStorage.setItem(STORAGE_KEYS.sessionUser, username);
      localStorage.setItem('username', username);
      window.location.assign('dashboard.html');
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const username = document.getElementById('newUsername').value.trim().toLowerCase();
      const password = document.getElementById('newPassword').value;
      const role = document.getElementById('newRole').value;

      if (!username || !password) {
        if (msg) msg.textContent = 'Username and password are required for account request.';
        return;
      }

      if (getUser(username)) {
        if (msg) msg.textContent = 'User already exists. Please login.';
        return;
      }

      requestAccess({
        username,
        password,
        role,
        approved: false,
        request_date: new Date().toISOString().slice(0, 10),
        approved_by: ''
      });

      if (msg) msg.textContent = 'Account request submitted. Ask admin to approve from Admin Panel.';
      signupForm.reset();
      setActiveTab('signin');
    });
  }

  consumeGoogleRedirectResult()
    .then((gUser) => completeGoogleLogin(gUser))
    .catch((err) => {
      if (msg && err?.code !== 'auth/no-auth-event') msg.textContent = err.message || 'Google redirect sign-in failed.';
    });
}

function normalizeInspectionTypeValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'planned') return 'Planned';
  if (['opportunity', 'opportunity based', 'opportunity-based'].includes(normalized)) return 'Opportunity Based';
  return String(value || '').trim();
}

function normalizeInspectionFormValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['boroscopy', 'borescopy'].includes(normalized)) return 'BOROSCOPY';
  if (normalized === 'internal') return 'INTERNAL';
  if (normalized === 'external') return 'EXTERNAL';
  if (normalized === 'hot job') return 'HOT JOB';
  if (normalized === 'cold') return 'COLD JOB';
  return String(value || '').trim();
}

function normalizeScaffoldingRequiredValue(value) {
  if (value === true || value === 'true') return 'true';
  if (value === false || value === 'false') return 'false';
  const normalized = String(value || '').trim().toLowerCase();
  if (['yes', 'y', 'required', 'true', '1'].includes(normalized)) return 'true';
  if (['no', 'n', 'not required', 'false', '0'].includes(normalized)) return 'false';
  return '';
}

function normalizeInspectionPayload(payload) {
  const normalizedInspectionType = normalizeInspectionTypeValue(payload.inspection_type);
  const normalizedInspectionForm = normalizeInspectionFormValue(payload.inspection_form || payload.inspection_possible);
  const normalizedScaffoldingRequired = normalizeScaffoldingRequiredValue(payload.scaffolding_required);
  return {
    id: payload.id || '',
    unit_name: payload.unit_name || '',
    equipment_type: payload.equipment_type || '',
    equipment_tag_number: payload.equipment_tag_number || '',
    inspection_type: normalizedInspectionType,
    equipment_name: payload.equipment_name || '',
    last_inspection_year: payload.last_inspection_year || '',
    inspection_form: normalizedInspectionForm,
    inspection_possible: normalizedInspectionForm,
    inspection_date: payload.inspection_date || '',
    status: payload.status || '',
    scaffolding_required: normalizedScaffoldingRequired,
    final_status: payload.final_status || '',
    remarks: payload.remarks || '',
    observation: payload.observation || '',
    recommendation: payload.recommendation || ''
  };
}

function localDateISO() {
  const now = new Date();
  const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

const INSPECTION_FORM_FIELDS = [
  'id',
  'equipment_tag_number',
  'unit_name',
  'equipment_type',
  'inspection_type',
  'equipment_name',
  'last_inspection_year',
  'inspection_form',
  'inspection_date',
  'status',
  'scaffolding_required',
  'final_status',
  'remarks',
  'observation',
  'recommendation'
];

function normalizeExcelHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function remapInspectionExcelRow(row = {}) {
  const keyMap = {
    id: 'id',
    equipmenttagnumber: 'equipment_tag_number',
    tagnumber: 'equipment_tag_number',
    equipmenttag: 'equipment_tag_number',
    unitname: 'unit_name',
    unit: 'unit_name',
    equipmenttype: 'equipment_type',
    inspectiontype: 'inspection_type',
    equipmentname: 'equipment_name',
    lastinspectionyear: 'last_inspection_year',
    inspectionpossible: 'inspection_form',
    inspectionscope: 'inspection_form',
    inspectionform: 'inspection_form',
    inspectiondate: 'inspection_date',
    status: 'status',
    scaffoldingrequired: 'scaffolding_required',
    finalstatus: 'final_status',
    remarks: 'remarks',
    observation: 'observation',
    recommendation: 'recommendation'
  };

  const mapped = {};
  Object.entries(row || {}).forEach(([rawKey, rawValue]) => {
    const normalizedHeader = normalizeExcelHeader(rawKey);
    const canonicalKey = keyMap[normalizedHeader];
    if (canonicalKey) mapped[canonicalKey] = rawValue;
  });

  return mapped;
}

function setupInspectionPage() {
  if (document.body.dataset.page !== 'inspection') return;

  const unitFilter = document.getElementById('unitFilter');
  const tagSearch = document.getElementById('tagSearch');
  const tabs = document.getElementById('equipmentTypeTabs');
  const unitLists = document.getElementById('unitWiseLists');
  const formPanel = document.getElementById('inspectionFormPanel');
  const form = document.getElementById('inspectionForm');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const statusSelect = document.getElementById('status');

  unitFilter.insertAdjacentHTML('beforeend', '<option value="All">All Units</option>');
  unitFilter.insertAdjacentHTML('beforeend', '<option value="">(Blank Unit)</option>');
  UNIT_OPTIONS.forEach((u) => {
    unitFilter.insertAdjacentHTML('beforeend', `<option value="${u}">${u}</option>`);
    document.getElementById('unit_name').insertAdjacentHTML('beforeend', `<option>${u}</option>`);
  });
  document.getElementById('equipment_type').insertAdjacentHTML('beforeend', '<option value="">-- Keep Blank --</option>');
  EQUIPMENT_TYPES.forEach((t) => document.getElementById('equipment_type').insertAdjacentHTML('beforeend', `<option>${t}</option>`));
  statusSelect.insertAdjacentHTML('beforeend', '<option value="">-- Keep Blank --</option>');
  INSPECTION_STATUS_OPTIONS.forEach((s) => statusSelect.insertAdjacentHTML('beforeend', `<option>${s}</option>`));

  const typeFilters = ['All', ...EQUIPMENT_TYPES];
  let activeType = 'All';
  let editId = '';
  let saveInProgress = false;

  tabs.innerHTML = typeFilters.map((t) => `<button class="btn tab-btn ${t === 'All' ? 'active' : ''}" data-type="${t}" type="button">${t}</button>`).join('');
  tabs.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      activeType = btn.dataset.type;
      tabs.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderInspectionList();
    };
  });

  function openForm(title) {
    document.getElementById('inspectionFormTitle').textContent = title;
    formPanel.classList.remove('hidden');
    document.getElementById('inspectionMain')?.classList.add('split-view');
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => document.getElementById('equipment_tag_number')?.focus(), 100);
  }

  function closeForm() {
    formPanel.classList.add('hidden');
    document.getElementById('inspectionMain')?.classList.remove('split-view');
    form.reset();
    editId = '';
    saveInProgress = false;
    setButtonLoadingState(submitBtn, false, 'Save Update');
  }

  function filteredRows() {
    return getCollection('inspections').filter((r) => {
      const okUnit = unitFilter.value === 'All' || (unitFilter.value === '' ? !r.unit_name : r.unit_name === unitFilter.value);
      const okType = activeType === 'All' || r.equipment_type === activeType;
      const okTag = (r.equipment_tag_number || '').toLowerCase().includes(tagSearch.value.trim().toLowerCase());
      return okUnit && okType && okTag;
    });
  }

  function renderInspectionList() {
    const rows = filteredRows();
    const grouped = {};
    rows.forEach((r) => {
      if (!grouped[r.unit_name]) grouped[r.unit_name] = [];
      grouped[r.unit_name].push(r);
    });

    const units = Object.keys(grouped);
    if (!units.length) {
      unitLists.innerHTML = '<p class="hint">No equipment found.</p>';
      return;
    }

    unitLists.innerHTML = units.map((unit) => `
      <section class="unit-panel">
        <div class="unit-panel-head">
          <h4>${unit}</h4>
          <button class="btn unit-select-all" data-unit="${unit}" type="button">Select All in ${unit}</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Select</th><th>Tag</th><th>Type</th><th>Status</th><th>Final</th><th>Action</th></tr>
            </thead>
            <tbody>
              ${grouped[unit].map((r) => `
                <tr>
                  <td><input type="checkbox" class="inspection-selector" data-id="${r.id || ""}" data-key="${String(r.id || r.equipment_tag_number || "").trim().toLowerCase()}" data-unit="${unit}" /></td>
                  <td>${r.equipment_tag_number}</td>
                  <td>${r.equipment_type}</td>
                  <td>${r.status || '-'}</td>
                  <td>${r.final_status || '-'}</td>
                  <td><button class="btn edit-equipment" data-id="${r.id || ""}" data-tag="${r.equipment_tag_number || ""}" type="button">Edit</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `).join('');

    unitLists.querySelectorAll('.unit-select-all').forEach((btn) => {
      btn.onclick = () => {
        unitLists.querySelectorAll(`.inspection-selector[data-unit="${btn.dataset.unit}"]`).forEach((cb) => { cb.checked = true; });
      };
    });

    unitLists.querySelectorAll('.edit-equipment').forEach((btn) => {
      btn.onclick = () => {
        const row = getCollection('inspections').find((r) => r.id === btn.dataset.id || String(r.equipment_tag_number || "") === String(btn.dataset.tag || ""));
        if (!row) return;
        editId = row.id;
        const normalized = normalizeInspectionPayload(row);
        Object.entries(normalized).forEach(([k, v]) => {
          const el = document.getElementById(k);
          if (el) el.value = v || '';
        });
        openForm('Edit Equipment');
      };
    });
  }

  document.getElementById('openAddEquipmentBtn').onclick = () => { closeForm(); openForm('Add Equipment'); };
  document.getElementById('closeInspectionFormBtn').onclick = closeForm;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (saveInProgress) return;
    saveInProgress = true;
    setButtonLoadingState(submitBtn, true, 'Save Update', 'Saving Update...');
    const payload = normalizeInspectionPayload({
      id: editId,
      unit_name: document.getElementById('unit_name').value,
      equipment_type: document.getElementById('equipment_type').value,
      equipment_tag_number: document.getElementById('equipment_tag_number').value,
      inspection_type: document.getElementById('inspection_type').value,
      equipment_name: document.getElementById('equipment_name').value,
      last_inspection_year: document.getElementById('last_inspection_year').value,
      inspection_form: document.getElementById('inspection_form').value,
      inspection_date: document.getElementById('inspection_date').value,
      status: document.getElementById('status').value,
      scaffolding_required: document.getElementById('scaffolding_required').value,
      final_status: document.getElementById('final_status').value,
      remarks: document.getElementById('remarks').value,
      observation: document.getElementById('observation').value,
      recommendation: document.getElementById('recommendation').value
    });
    upsertById('inspections', payload, 'INSP');
    closeForm();
    if (typeof setSyncStatus === 'function') setSyncStatus({ ok: true, message: 'Inspection saved successfully.' });
    renderInspectionList();
  });

  document.getElementById('markCompletedBtn').onclick = () => {
    const tag = document.getElementById('equipment_tag_number').value;
    const row = getCollection('inspections').find((r) => r.equipment_tag_number === tag);
    if (row) upsertById('inspections', { ...row, final_status: 'Completed', completed_at: localDateISO() }, 'INSP');
    renderInspectionList();
  };

  document.getElementById('markSelectedCompletedBtn').onclick = () => {
    const selectedKeys = new Set(Array.from(document.querySelectorAll('.inspection-selector:checked')).map((i) => String(i.dataset.key || '').trim().toLowerCase()).filter(Boolean));
    if (!selectedKeys.size) return;
    const rows = getCollection('inspections');
    const updates = rows
      .filter((row) => selectedKeys.has(String(row.id || row.equipment_tag_number || '').trim().toLowerCase()))
      .map((row) => ({ ...row, final_status: 'Completed', completed_at: localDateISO() }));
    batchUpsertById('inspections', updates, 'INSP');
    renderInspectionList();
  };

  document.getElementById('addSelectedToNextDayPlanningBtn').onclick = () => {
    const selectedKeys = new Set(Array.from(document.querySelectorAll('.inspection-selector:checked')).map((i) => String(i.dataset.key || '').trim().toLowerCase()).filter(Boolean));
    if (!selectedKeys.size) {
      alert('Select at least one equipment item.');
      return;
    }
    const currentUser = getLoggedInUser();
    const normalizedUser = String(currentUser || '').trim().toLowerCase();
    const plannedDate = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    const rows = getCollection('inspections');
    const existing = getCollection('next_day_planning');
    const existingKey = new Set(existing
      .filter((x) => String(x.user_id || '').trim().toLowerCase() === normalizedUser)
      .map((x) => `${x.equipment_tag}__${x.planned_date}`));
    const toAdd = rows
      .filter((row) => selectedKeys.has(String(row.id || row.equipment_tag_number || '').trim().toLowerCase()))
      .filter((row) => !existingKey.has(`${row.equipment_tag_number}__${plannedDate}`))
      .map((row) => ({
        user_id: normalizedUser,
        equipment_tag: row.equipment_tag_number || '',
        equipment_name: row.equipment_name || '',
        functional_location: row.functional_location || row.unit_name || '',
        work_center: row.work_center || '',
        planned_date: plannedDate,
        status: 'pending'
      }));

    if (!toAdd.length) {
      alert('Selected items are already added for next day planning.');
      return;
    }

    batchUpsertById('next_day_planning', toAdd, 'PLAN');
    alert(`${toAdd.length} item(s) added to next day planning.`);
  };

  document.getElementById('downloadVesselReportBtn')?.addEventListener('click', () => {
    const vesselRows = getCollection('inspections').filter((row) => row.equipment_type === 'Vessel');
    if (!vesselRows.length) {
      alert('No vessel inspections available for report generation.');
      return;
    }
    buildVesselInspectionPdf(vesselRows);
  });

  unitFilter.onchange = renderInspectionList;
  tagSearch.oninput = renderInspectionList;
  window.addEventListener('atr-db-updated', renderInspectionList);
  renderInspectionList();
}

async function filesToPaths(fileList, observationId, tagNo) {
  const paths = [];
  const safeTag = sanitizeName(tagNo || 'tag');
  let idx = 1;
  for (const file of Array.from(fileList)) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const standardizedName = `${safeTag}_${observationId}_${String(idx).padStart(2, '0')}.${ext}`;
    const imagePath = `data/images/${standardizedName}`;
    const uploadedUrl = await saveImageDataAtPath(imagePath, file);
    paths.push(uploadedUrl || imagePath);
    idx += 1;
  }
  return paths;
}

function statusClass(status) {
  if (status === 'Not Started') return 'status-red';
  if (status === 'In Progress') return 'status-yellow';
  if (status === 'Completed') return 'status-green';
  return '';
}

function setButtonLoadingState(button, isLoading, defaultText, loadingText = 'Saving...') {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = defaultText || button.textContent || 'Save';
  button.disabled = Boolean(isLoading);
  button.textContent = isLoading ? loadingText : (defaultText || button.dataset.defaultText);
}

function confirmDeleteRecord(recordType, summary = '') {
  const summaryLine = summary ? `\n\n${summary}` : '';
  return window.confirm(`Delete this ${recordType}? This action cannot be undone.${summaryLine}`);
}

function setupObservationPage() {
  if (document.body.dataset.page !== 'observation') return;

  const form = document.getElementById('observationForm');
  const panel = document.getElementById('observationFormPanel');
  const pageMain = document.getElementById('observationMain');
  const imageInput = document.getElementById('obsImage');
  const preview = document.getElementById('imagePreviewList');
  const tbody = document.getElementById('observationsTableBody');
  const completedTagSelect = document.getElementById('obsInspectionTag');
  const obsUnit = document.getElementById('obsUnit');
  const formTitle = document.getElementById('observationFormTitle');
  const submitBtn = document.getElementById('observationSubmitBtn');
  const openBtn = document.getElementById('openObservationFormBtn');
  let editId = '';
  let editImagePaths = [];
  let saveInProgress = false;

  UNIT_OPTIONS.forEach((u) => obsUnit.insertAdjacentHTML('beforeend', `<option>${u}</option>`));

  function refreshCompletedInspectionTags() {
    const completed = getCollection('inspections').filter((r) => r.final_status === 'Completed');
    completedTagSelect.innerHTML = '<option value="">Select from completed inspections (optional)</option>'
      + completed.map((r) => `<option value="${r.id}">${r.equipment_tag_number || r.id} (${r.unit_name || 'No Unit'})</option>`).join('');
  }

  completedTagSelect.onchange = () => {
    const row = getCollection('inspections').find((r) => r.id === completedTagSelect.value);
    if (!row) return;
    document.getElementById('obsTag').value = row.equipment_tag_number || '';
    document.getElementById('obsUnit').value = row.unit_name || '';
    if (!document.getElementById('obsLocation').value) document.getElementById('obsLocation').value = row.equipment_name || '';
  };

  function render() {
    const rows = getCollection('observations');
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${r.tag_number}</td><td>${r.unit}</td><td>${r.location}</td>
        <td>${r.observation}</td><td>${r.recommendation}</td>
        <td><select class="obs-status ${statusClass(r.status)}" data-id="${r.id}">
          ${['Not Started', 'In Progress', 'Completed'].map((s) => `<option ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></td>
        <td>${(r.images || []).map((p) => `<img class="mini-preview clickable-img" data-src="${getImageData(p)}" src="${getImageData(p)}" alt="img"/>`).join('')}</td>
        <td>
          <button class="btn edit-obs" data-id="${r.id}" type="button">Edit</button>
          <button class="btn email-obs" data-id="${r.id}" type="button">Draft Email</button>
          ${isAdmin() ? `<button class="btn delete-obs" data-id="${r.id}" type="button">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.edit-obs').forEach((btn) => {
      btn.onclick = () => {
        const row = getCollection('observations').find((x) => x.id === btn.dataset.id);
        if (!row) return;
        editId = row.id;
        editImagePaths = row.images || [];
        document.getElementById('obsInspectionTag').value = '';
        document.getElementById('obsTag').value = row.tag_number || '';
        document.getElementById('obsUnit').value = row.unit || '';
        document.getElementById('obsLocation').value = row.location || '';
        document.getElementById('obsObservation').value = row.observation || '';
        document.getElementById('obsRecommendation').value = row.recommendation || '';
        document.getElementById('obsStatus').value = row.status || 'Not Started';
        preview.innerHTML = editImagePaths.map((p) => `<img class="mini-preview" src="${getImageData(p)}" alt="saved preview"/>`).join('');
        formTitle.textContent = 'Update Observation';
        submitBtn.textContent = 'Update Observation';
        panel.classList.remove('hidden');
        pageMain?.classList.add('split-view');
        openBtn.setAttribute('aria-expanded', 'true');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });

    tbody.querySelectorAll('.obs-status').forEach((statusDropdown) => {
      statusDropdown.onchange = () => {
        const row = getCollection('observations').find((x) => x.id === statusDropdown.dataset.id);
        if (row) upsertById('observations', { ...row, status: statusDropdown.value }, 'OBS');
        render();
      };
    });

    tbody.querySelectorAll('.delete-obs').forEach((btn) => {
      btn.onclick = () => {
        const row = getCollection('observations').find((x) => x.id === btn.dataset.id);
        if (!row) return;
        const ok = confirmDeleteRecord('observation', `Tag: ${row.tag_number || '-'}\nUnit: ${row.unit || '-'}\nStatus: ${row.status || '-'}`);
        if (!ok) return;
        deleteById('observations', btn.dataset.id);
        render();
      };
    });

    tbody.querySelectorAll('.email-obs').forEach((btn) => {
      btn.onclick = () => {
        const row = getCollection('observations').find((x) => x.id === btn.dataset.id);
        if (!row) return;
        const reportFileName = buildObservationReportPdf(row);
        const imageLinks = (row.images || []).map((img, idx) => `${idx + 1}. ${img}`).join('\n');
        const dueDays = daysSince(row.timestamp);
        const subject = encodeURIComponent(`ATR Observation Report - ${row.tag_number || row.id}`);
        const body = encodeURIComponent(`Dear Team,

Please find below the detailed observation report for planning and closure:

Tag Number: ${row.tag_number || '-'}
Unit: ${row.unit || '-'}
Location: ${row.location || '-'}
Status: ${row.status || '-'}
Observation Date: ${formatDateLabel(row.timestamp)}
Job Due Since: ${dueDays} day(s)

Observation Details:
${row.observation || '-'}

Recommendation:
${row.recommendation || '-'}

Attached/Reference Image URLs:
${imageLinks || 'No images uploaded'}

PDF Report: ${reportFileName || 'Generated in browser download'}

Kindly review and provide closure action plan with timeline.

Regards,
${getLoggedInUser()}`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      };
    });

    tbody.querySelectorAll('.clickable-img').forEach((img) => {
      img.onclick = () => window.open(img.dataset.src, '_blank');
    });
  }

  openBtn.onclick = () => {
    editId = '';
    editImagePaths = [];
    form.reset();
    preview.innerHTML = '';
    formTitle.textContent = 'Add Observation';
    submitBtn.textContent = 'Save Observation';
    refreshCompletedInspectionTags();
    panel.classList.remove('hidden');
    pageMain?.classList.add('split-view');
    openBtn.setAttribute('aria-expanded', 'true');
    document.getElementById('obsTag').focus();
  };
  document.getElementById('closeObservationFormBtn').onclick = () => {
    panel.classList.add('hidden');
    pageMain?.classList.remove('split-view');
    openBtn.setAttribute('aria-expanded', 'false');
  };

  imageInput.onchange = () => {
    preview.innerHTML = '';
    Array.from(imageInput.files || []).forEach((file) => {
      const fr = new FileReader();
      fr.onload = (e) => preview.insertAdjacentHTML('beforeend', `<img class="mini-preview" src="${e.target.result}" alt="preview"/>`);
      fr.readAsDataURL(file);
    });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saveInProgress) return;
    saveInProgress = true;
    setButtonLoadingState(submitBtn, true, editId ? 'Update Observation' : 'Save Observation', 'Saving Observation...');
    try {
      const observationId = editId || generateId('OBS');
      const tagNo = document.getElementById('obsTag').value;
      const selectedFiles = imageInput.files || [];
      const imagePaths = selectedFiles.length ? await filesToPaths(selectedFiles, observationId, tagNo) : editImagePaths;
      upsertById('observations', {
        id: observationId,
        tag_number: tagNo,
        unit: document.getElementById('obsUnit').value,
        location: document.getElementById('obsLocation').value,
        observation: document.getElementById('obsObservation').value,
        recommendation: document.getElementById('obsRecommendation').value,
        status: document.getElementById('obsStatus').value,
        images: imagePaths
      }, 'OBS');
      form.reset();
      preview.innerHTML = '';
      panel.classList.add('hidden');
      pageMain?.classList.remove('split-view');
      openBtn.setAttribute('aria-expanded', 'false');
      formTitle.textContent = 'Add Observation';
      submitBtn.textContent = 'Save Observation';
      editId = '';
      editImagePaths = [];
      saveInProgress = false;
      setButtonLoadingState(submitBtn, false, 'Save Observation');
      if (typeof setSyncStatus === 'function') setSyncStatus({ ok: true, message: 'Observation and images saved to cloud.' });
      refreshCompletedInspectionTags();
      render();
    } catch (err) {
      saveInProgress = false;
      setButtonLoadingState(submitBtn, false, editId ? 'Update Observation' : 'Save Observation');
      if (typeof setSyncStatus === 'function') setSyncStatus({ ok: false, message: err.message || 'Failed to save observation.' });
      alert(err.message || 'Failed to save observation.');
    }
  });

  window.addEventListener('atr-db-updated', () => {
    refreshCompletedInspectionTags();
    render();
  });

  refreshCompletedInspectionTags();
  render();
}

function setupRequisitionPage() {
  if (document.body.dataset.page !== 'requisition') return;
  const formPanel = document.getElementById('requisitionFormPanel');
  const form = document.getElementById('requisitionForm');
  const tbody = document.getElementById('requisitionTableBody');
  const pageMain = document.getElementById('requisitionMain');
  const formTitle = document.getElementById('requisitionFormTitle');
  const submitBtn = document.getElementById('requisitionSubmitBtn');
  const openBtn = document.getElementById('openRequisitionFormBtn');
  const result = document.getElementById('reqResult');
  const status2Wrap = document.getElementById('status2Wrap');
  let editId = '';
  let saveInProgress = false;

  UNIT_OPTIONS.forEach((u) => document.getElementById('reqUnit').insertAdjacentHTML('beforeend', `<option>${u}</option>`));

  function render() {
    tbody.innerHTML = getCollection('requisitions').map((r) => `
      <tr>
        <td>${r.tag_no}</td><td>${r.job_description}</td><td>${r.location}</td><td>${r.unit}</td>
        <td>${r.module_type}</td><td>${r.result}</td><td>${r.status_2 || '-'}</td><td>${r.remarks || '-'}</td>
        <td>
          <button class="btn edit-req" data-id="${r.id}" type="button">Edit</button>
          ${isAdmin() ? `<button class="btn delete-req" data-id="${r.id}" type="button">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.edit-req').forEach((btn) => {
      btn.onclick = () => {
        const row = getCollection('requisitions').find((x) => x.id === btn.dataset.id);
        if (!row) return;
        editId = row.id;
        const fieldMap = {
          tag_no: 'reqTag',
          module_type: 'reqType',
          job_description: 'reqJobDescription',
          location: 'reqLocation',
          unit: 'reqUnit',
          job_size: 'reqJobSize',
          requisition_datetime: 'reqDateTime',
          result: 'reqResult',
          status_2: 'reqStatus2',
          remarks: 'reqRemarks'
        };
        Object.entries(fieldMap).forEach(([k, id]) => {
          const el = document.getElementById(id);
          if (el) el.value = row[k] || '';
        });
        status2Wrap.classList.toggle('hidden', row.result !== 'Reshoot');
        formTitle.textContent = 'Update Requisition';
        submitBtn.textContent = 'Update Requisition';
        formPanel.classList.remove('hidden');
        pageMain?.classList.add('split-view');
        openBtn.setAttribute('aria-expanded', 'true');
        formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });

    tbody.querySelectorAll('.delete-req').forEach((btn) => {
      btn.onclick = () => {
        const row = getCollection('requisitions').find((x) => x.id === btn.dataset.id);
        if (!row) return;
        const ok = confirmDeleteRecord('requisition', `Tag: ${row.tag_no || '-'}\nUnit: ${row.unit || '-'}\nResult: ${row.result || '-'}`);
        if (!ok) return;
        deleteById('requisitions', btn.dataset.id);
        render();
      };
    });
  }

  openBtn.onclick = () => {
    editId = '';
    form.reset();
    formTitle.textContent = 'Requisition Form';
    submitBtn.textContent = 'Save Requisition';
    status2Wrap.classList.add('hidden');
    formPanel.classList.remove('hidden');
    pageMain?.classList.add('split-view');
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    openBtn.setAttribute('aria-expanded', 'true');
    document.getElementById('reqTag')?.focus();
  };

  document.getElementById('closeRequisitionFormBtn').onclick = () => {
    formPanel.classList.add('hidden');
    pageMain?.classList.remove('split-view');
    openBtn.setAttribute('aria-expanded', 'false');
    formTitle.textContent = 'Requisition Form';
    submitBtn.textContent = 'Save Requisition';
  };

  result.onchange = () => status2Wrap.classList.toggle('hidden', result.value !== 'Reshoot');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (saveInProgress) return;
    saveInProgress = true;
    setButtonLoadingState(submitBtn, true, editId ? 'Update Requisition' : 'Save Requisition', 'Saving Requisition...');
    upsertById('requisitions', {
      id: editId,
      tag_no: document.getElementById('reqTag').value,
      module_type: document.getElementById('reqType').value,
      job_description: document.getElementById('reqJobDescription').value,
      location: document.getElementById('reqLocation').value,
      unit: document.getElementById('reqUnit').value,
      job_size: document.getElementById('reqJobSize').value,
      requisition_datetime: document.getElementById('reqDateTime').value,
      result: document.getElementById('reqResult').value,
      status_2: document.getElementById('reqStatus2').value,
      remarks: document.getElementById('reqRemarks').value
    }, 'REQ');
    formPanel.classList.add('hidden');
    pageMain?.classList.remove('split-view');
    openBtn.setAttribute('aria-expanded', 'false');
    formTitle.textContent = 'Requisition Form';
    submitBtn.textContent = 'Save Requisition';
    editId = '';
    saveInProgress = false;
    setButtonLoadingState(submitBtn, false, 'Save Requisition');
    if (typeof setSyncStatus === 'function') setSyncStatus({ ok: true, message: 'Requisition saved successfully.' });
    render();
  });

  window.addEventListener('atr-db-updated', render);
  render();
}

function setupAdminPanel() {
  if (document.body.dataset.page !== 'admin') return;

  const tbody = document.getElementById('pendingUsersBody');
  const message = document.getElementById('bulkUploadMessage');
  const uploadTypeSelect = document.getElementById('uploadTypeSelect');
  const defaultUploadUnit = document.getElementById('defaultUploadUnit');

  function renderUsers() {
    const users = getCollection('users');
    const filterValue = document.getElementById('adminUserFilter')?.value || 'all';
    const filteredUsers = users.filter((u) => {
      if (filterValue === 'pending') return !u.approved;
      if (filterValue === 'approved') return !!u.approved;
      return true;
    });

    tbody.innerHTML = filteredUsers.map((u) => `<tr>
      <td>${u.username}</td><td>${u.role}</td><td>${u.request_date || '-'}</td><td>${u.approved ? 'Approved' : 'Pending'}</td>
      <td>${u.approved ? '-' : `<button class="btn approve-user" data-user="${u.username}" type="button">Approve</button>`}</td>
    </tr>`).join('');
    tbody.querySelectorAll('.approve-user').forEach((btn) => {
      btn.onclick = () => { approveUser(btn.dataset.user, getLoggedInUser()); renderUsers(); };
    });
  }

  function applyInspectionExcelRows(rows) {
    const payloads = rows.map((row) => {
      const mappedRow = remapInspectionExcelRow(row);
      const payload = normalizeInspectionPayload(mappedRow);
      if (!payload.unit_name && defaultUploadUnit.value) payload.unit_name = defaultUploadUnit.value;
      if (mappedRow.id) payload.id = String(mappedRow.id).trim();
      return payload;
    }).filter((payload) => Object.values(payload).some((value) => String(value || '').trim()));

    if (!payloads.length) {
      message.textContent = 'No valid inspection rows found in uploaded file.';
      return;
    }
    batchUpsertById('inspections', payloads, 'INSP');
  }

  function applyUsersExcelRows(rows) {
    const users = getCollection('users');
    const byUsername = new Map(users.map((u) => [u.username, u]));
    rows.forEach((row) => {
      const username = String(row.username || '').trim().toLowerCase();
      if (!username) return;
      const candidate = {
        username,
        password: row.password || 'pass@123',
        role: row.role || 'inspector',
        approved: String(row.approved).toLowerCase() === 'true' || row.approved === true,
        request_date: row.request_date || new Date().toISOString().slice(0, 10),
        approved_by: row.approved_by || ''
      };
      if (byUsername.has(username)) Object.assign(byUsername.get(username), candidate);
      else users.push(candidate);
    });
    saveCollection('users', users.map((u) => withAudit(u, true)));
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    if (uploadTypeSelect.value === 'users') {
      const ws = XLSX.utils.json_to_sheet([{ username: 'new.user', password: 'pass@123', role: 'inspector', approved: false, request_date: '2026-01-20', approved_by: '' }]);
      XLSX.utils.book_append_sheet(wb, ws, 'users_template');
      XLSX.writeFile(wb, 'ATR2026_Users_Template.xlsx');
      return;
    }
    const ws = XLSX.utils.json_to_sheet([{
      id: '',
      equipment_tag_number: 'TAG-001',
      unit_name: 'GCU-1',
      equipment_type: 'Vessel',
      inspection_type: 'Planned',
      equipment_name: 'Eq Name',
      last_inspection_year: '2020',
      inspection_form: 'BOROSCOPY',
      inspection_date: '2026-01-20',
      status: 'Scaffolding Prepared',
      final_status: 'Not Started',
      remarks: 'Sample remarks',
      observation: 'Sample observation',
      recommendation: 'Sample recommendation'
    }]);
    XLSX.utils.book_append_sheet(wb, ws, 'inspections_template');
    XLSX.writeFile(wb, 'ATR2026_Inspection_Template.xlsx');
  }

  function exportInspectionFormFields() {
    const inspections = getCollection('inspections') || [];
    const rows = inspections.map((row) => {
      const normalized = normalizeInspectionPayload(row);
      return INSPECTION_FORM_FIELDS.reduce((acc, key) => {
        acc[key] = normalized[key] || '';
        return acc;
      }, {});
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [INSPECTION_FORM_FIELDS.reduce((acc, key) => {
      acc[key] = '';
      return acc;
    }, {})]);
    XLSX.utils.book_append_sheet(wb, ws, 'inspections_export');
    XLSX.writeFile(wb, 'ATR2026_Inspection_Upload_Format_With_Data.xlsx');
    message.textContent = `Inspection upload format exported with ${rows.length} current rows.`;
  }

  async function exportAllRuntimeData() {
    const snapshot = buildDatabaseFilesPayload();
    downloadTextFile('atr2026_runtime_backup.json', JSON.stringify(snapshot, null, 2));
    message.textContent = 'Runtime JSON backup downloaded. Firebase auto-sync runs on each save/delete/submit.';
  }

  async function syncNow() {
    await syncAllToCloud();
    message.textContent = 'Firebase sync complete.';
  }

  const exportInspectionsBtn = document.getElementById('exportInspectionsBtn');
  if (exportInspectionsBtn) exportInspectionsBtn.onclick = exportInspectionFormFields;
  const userFilter = document.getElementById('adminUserFilter');
  if (userFilter) userFilter.onchange = renderUsers;
  document.getElementById('bulkUploadBtn').onclick = () => {
    const file = document.getElementById('bulkUploadFile').files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (uploadTypeSelect.value === 'users') applyUsersExcelRows(rows);
      else applyInspectionExcelRows(rows);
      message.textContent = `Upload success: ${rows.length} rows processed.`;
      renderUsers();
    };
    fr.readAsArrayBuffer(file);
  };

  const exportBtn = document.getElementById('exportAllDataBtn');
  if (exportBtn) exportBtn.onclick = exportAllRuntimeData;
  const syncBtn = document.getElementById('syncGithubBtn');
  if (syncBtn) syncBtn.onclick = () => syncNow().catch((err) => { message.textContent = err.message; });

  window.addEventListener('atr-db-updated', renderUsers);
  renderUsers();
}



function getPermitSessionData(username = '') {
  const normalizedUser = String(username || '').trim().toLowerCase();
  const scopedKey = `atr2026_permit_session_${normalizedUser}`;
  try {
    return JSON.parse(localStorage.getItem(scopedKey) || sessionStorage.getItem(scopedKey) || '{}');
  } catch (_) {
    return {};
  }
}

function setPermitSessionData(username = '', payload = {}) {
  const normalizedUser = String(username || '').trim().toLowerCase();
  const scopedKey = `atr2026_permit_session_${normalizedUser}`;
  const serialized = JSON.stringify(payload || {});
  localStorage.setItem(scopedKey, serialized);
  sessionStorage.setItem(scopedKey, serialized);
}

function buildPermitEmailDraft(rows = []) {
  const header = ['Permit Application Summary', '', 'TITLE | PERMIT TYPE | REQUISITION NO'];
  const body = rows.map((r) => `${r.TITLE} | ${r.PERMIT_TYPE} | ${r.REQUISITION_NO}`);
  return [...header, ...body].join('\n');
}

function setupPermitPlanningPage() {
  if (document.body.dataset.page !== 'permit-planning') return;

  const SAP_WEBSITE_URL = 'https://sugam.gail.co.in/';
  const PERMIT_AUTOMATION_CONFIG = 'Apply permit-z2.json';
  const fallbackPermitSteps = [
    { action: 'login', label: 'Login' },
    { action: 'search_app', label: 'Open IW21' },
    { action: 'set_field', label: 'Notification Type = Z2' },
    { action: 'set_field', label: 'Short Text = TITLE' },
    { action: 'set_field', label: 'Functional Location' },
    { action: 'set_field', label: 'Equipment' },
    { action: 'set_field', label: 'Planner Group = INP' },
    { action: 'set_field', label: 'Main Work Center' },
    { action: 'set_field', label: 'Person Involved' },
    { action: 'set_field', label: 'WCM Operation' },
    { action: 'set_field', label: 'Permit Required' },
    { action: 'set_field', label: 'Permit Type' },
    { action: 'open_permit_create', label: 'Create Permit' },
    { action: 'save', label: 'Save' },
    { action: 'capture_requisition_no', label: 'Capture Requisition Number' },
    { action: 'release', label: 'Release' },
    { action: 'save', label: 'Save' }
  ];
  let permitSteps = [...fallbackPermitSteps];

  const sessionHint = document.getElementById('permitSessionHint');
  const planningBody = document.getElementById('planningTableBody');
  const applyForm = document.getElementById('permitApplyForm');
  const message = document.getElementById('permitFlowMessage');
  const progressLabel = document.getElementById('permitProgressLabel');
  const progressBody = document.getElementById('permitProgressBody');
  const summaryBody = document.getElementById('permitSummaryBody');
  const emailDraft = document.getElementById('permitEmailDraft');
  const copyDraftBtn = document.getElementById('copyPermitEmailBtn');
  const sendMailBtn = document.getElementById('sendPermitEmailBtn');
  const requestBody = document.getElementById('permitRequestTableBody');
  const commonWorkCenterInput = document.getElementById('permitCommonWorkCenter');
  const sapUsernameInput = document.getElementById('permitSapUsername');
  const sapPasswordInput = document.getElementById('permitSapPassword');

  const username = String(getLoggedInUser() || '').trim().toLowerCase();

  const permitTypeOptionsHtml = '<option value="">Select</option>' + PERMIT_TYPE_OPTIONS
    .map((p) => `<option value="${p.value}">${p.value} → ${p.label}</option>`)
    .join('');

  const cpfInput = document.getElementById('permitCpfNo');
  const sessionData = getPermitSessionData(username);
  cpfInput.value = sessionData.CPF_NO || '';
  commonWorkCenterInput.value = sessionData.WORK_CENTER || '';
  sapUsernameInput.value = sessionData.SAP_USERNAME || username || '';
  sapPasswordInput.value = sessionData.SAP_PASSWORD || '';
  sessionHint.textContent = 'Common inputs are stored per user and reused automatically.';

  const bookmarkletLink = document.getElementById('sugamBookmarkletLink');
  const copyBookmarkletBtn = document.getElementById('copySugamBookmarkletBtn');
  const bookmarkletCode = buildSugamBookmarkletCode();
  if (bookmarkletLink) bookmarkletLink.href = bookmarkletCode;
  if (copyBookmarkletBtn) {
    copyBookmarkletBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(bookmarkletCode);
        message.textContent = 'Bookmarklet code copied. Add a new browser bookmark and paste as URL.';
      } catch (_) {
        message.textContent = 'Copy failed. Drag the bookmarklet button to your bookmarks bar instead.';
      }
    };
  }

  function toStepLabel(step) {
    if (step.label) return step.label;
    const action = String(step.action || '').replace(/_/g, ' ').trim();
    return action ? action.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Step';
  }

  function renderProgress(currentIndex = -1, state = 'idle') {
    if (!permitSteps.length) {
      progressBody.innerHTML = '<tr><td>⏳</td><td>-</td><td>No automation steps loaded.</td></tr>';
      progressLabel.textContent = 'No permit automation steps configured.';
      return;
    }

    progressBody.innerHTML = permitSteps.map((step, i) => {
      let status = '⏳ Pending';
      if (state === 'done') status = '✅ Done';
      else if (state === 'error' && i === currentIndex) status = '❌ Failed';
      else if (i < currentIndex) status = '✅ Done';
      else if (i === currentIndex && state === 'running') status = '🔄 Running';
      return `<tr><td>${status}</td><td>${i + 1}</td><td>${toStepLabel(step)}</td></tr>`;
    }).join('');

    if (state === 'done') progressLabel.textContent = `Completed ${permitSteps.length}/${permitSteps.length} SAP steps.`;
    else if (state === 'error') progressLabel.textContent = `Failed at step ${currentIndex + 1} of ${permitSteps.length}.`;
    else if (currentIndex < 0) progressLabel.textContent = `Waiting for Apply Permit (${permitSteps.length} configured steps).`;
    else progressLabel.textContent = `Running step ${currentIndex + 1} of ${permitSteps.length}.`;
  }

  function generateRequisitionNo(row = {}) {
    const equipmentTag = String(row.equipment_tag || 'TAG').replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase() || 'TAG';
    return `REQ-${equipmentTag}-${Date.now().toString().slice(-6)}`;
  }

  async function loadPermitAutomationConfig() {
    try {
      const res = await fetch(PERMIT_AUTOMATION_CONFIG, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (Array.isArray(payload.steps) && payload.steps.length) {
        permitSteps = payload.steps;
        sessionHint.textContent = `${payload.title || 'Permit automation'} loaded with ${permitSteps.length} steps.`;
      }
    } catch (_) {
      permitSteps = [...fallbackPermitSteps];
    } finally {
      renderProgress(-1, 'idle');
    }
  }

  function getUserPlanningRows() {
    return getCollection('next_day_planning').filter((x) => {
      const owner = String(x.user_id || x.entered_by || x.updated_by || '').trim().toLowerCase();
      return owner === username;
    });
  }

  function getPendingPlanningRows() {
    return getUserPlanningRows().filter((x) => (x.status || 'pending') !== 'permit_applied');
  }

  function renderPlanning() {
    const rows = getUserPlanningRows();
    if (!rows.length) {
      planningBody.innerHTML = '<tr><td colspan="6">No next day planning records for current user.</td></tr>';
      return;
    }
    planningBody.innerHTML = rows.map((r) => `
      <tr>
        <td>${r.equipment_tag || '-'}</td>
        <td>${r.equipment_name || '-'}</td>
        <td>${r.functional_location || '-'}</td>
        <td>${r.work_center || '-'}</td>
        <td>${r.planned_date || '-'}</td>
        <td>${r.status || 'pending'}</td>
      </tr>
    `).join('');
  }

  function renderRequestTable() {
    const rows = getPendingPlanningRows();
    if (!rows.length) {
      requestBody.innerHTML = '<tr><td colspan="8">No pending planning items. Add from Update Inspection first.</td></tr>';
      return;
    }

    requestBody.innerHTML = rows.map((r) => {
      const defaultTitle = `Inspection of ${r.equipment_tag || 'tag'}`.slice(0, 40);
      return `
        <tr>
          <td><input type="checkbox" class="permit-row-selector" data-id="${r.id}" checked /></td>
          <td>${r.equipment_tag || '-'}</td>
          <td>${r.equipment_name || '-'}</td>
          <td>${r.functional_location || '-'}</td>
          <td><input class="permit-title-input" data-id="${r.id}" maxlength="40" value="${defaultTitle}" /></td>
          <td><select class="permit-type-input" data-id="${r.id}" required>${permitTypeOptionsHtml}</select></td>
          <td><input class="permit-person-input" data-id="${r.id}" type="number" min="1" value="6" required /></td>
          <td>CPF from session</td>
        </tr>
      `;
    }).join('');
  }

  function renderSummary() {
    const rows = getCollection('permit_applications').filter((x) => String(x.applied_by || '').trim().toLowerCase() === username);
    summaryBody.innerHTML = rows.length ? rows.map((r) => `<tr><td>${r.TITLE}</td><td>${r.PERMIT_TYPE}</td><td>${r.REQUISITION_NO}</td><td>${r.equipment_tag}</td><td>${formatDateLabel(r.applied_on)}</td></tr>`).join('') : '<tr><td colspan="5">No permits applied yet.</td></tr>';
    const draft = buildPermitEmailDraft(rows);
    emailDraft.value = draft;
    const subject = encodeURIComponent('Permit Application Summary');
    const body = encodeURIComponent(draft);
    sendMailBtn.href = `mailto:?subject=${subject}&body=${body}`;
  }
  function resolvePermitValue(rawValue, runtime = {}) {
    if (typeof rawValue !== 'string') return rawValue;
    return rawValue.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, token) => String(runtime[token] ?? ''));
  }


  function encodePrefillPayload(payload = {}) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  function buildSugamPrefillUrl(runtime = {}) {
    const payload = encodePrefillPayload({
      runtime,
      steps: permitSteps,
      generated_at: new Date().toISOString()
    });
    return `${SAP_WEBSITE_URL}?atr_prefill=${encodeURIComponent(payload)}`;
  }

  function buildSugamBookmarkletCode() {
    return `javascript:(function(){const wait=(ms)=>new Promise((r)=>setTimeout(r,ms));const q=(s)=>Array.from(document.querySelectorAll(s));const eq=(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();const parse=()=>{const u=new URL(location.href);const p=u.searchParams.get('atr_prefill')||u.hash.replace(/^#atr_prefill=/,'');if(!p){alert('No atr_prefill payload found in URL. Open SUGAM from ATR Permit Planning first.');return null;}try{return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(p)))));}catch(e){alert('Unable to decode prefill payload.');return null;}};const resolve=(raw,r)=>typeof raw==='string'?raw.replace(/{{\s*([A-Z0-9_]+)\s*}}/g,(_,t)=>String(r[t]??'')):raw;const find=(selector={})=>{if(selector['aria-label']){const exact=document.querySelector('[aria-label="'+selector['aria-label'].replace(/"/g,'\\"')+'"]');if(exact)return exact;const near=q('[aria-label]').find((el)=>eq(el.getAttribute('aria-label'),selector['aria-label'])||String(el.getAttribute('aria-label')||'').toLowerCase().includes(String(selector['aria-label']).toLowerCase()));if(near)return near;}if(selector.id){const byId=document.getElementById(selector.id);if(byId)return byId;}if(selector.role&&selector.text){const roleHits=q('[role="'+selector.role+'"]');const found=roleHits.find((el)=>String(el.textContent||'').toLowerCase().includes(String(selector.text).toLowerCase()));if(found)return found;}if(selector.text){const pool=q('button,[role="button"],input,textarea,select,[aria-label],label,span,div');const found=pool.find((el)=>String(el.textContent||el.value||el.getAttribute('aria-label')||'').toLowerCase().includes(String(selector.text).toLowerCase()));if(found)return found;}return null;};const set=(el,val)=>{if(!el)return;el.focus();if('value'in el){el.value=String(val??'');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}else{el.click();}};const press=(k='Enter')=>{const tgt=document.activeElement||document.body;tgt.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}));tgt.dispatchEvent(new KeyboardEvent('keyup',{key:k,bubbles:true}));};(async()=>{const payload=parse();if(!payload)return;const steps=Array.isArray(payload.steps)?payload.steps:[];const runtime=payload.runtime||{};for(let i=0;i<steps.length;i+=1){const step=steps[i]||{};const target=find(step.selector||{});const value=resolve(step.value,runtime);if(step.action==='capture_requisition_no')continue;if(step.action==='press'){press(step.key||'Enter');await wait(350);continue;}if(target){target.click();if(value!==undefined&&value!==null&&value!=='')set(target,value);}if(['search_app','set_field','login','type'].includes(step.action))press('Enter');await wait(350);}alert('SUGAM prefill steps executed. Verify fields before Save/Release.');})();})();`;
  }


  async function runPermitFlowForRow(row, commonInput) {
    const runtime = { ...commonInput, EQUIPMENT: row.equipment_tag || commonInput.EQUIPMENT || '' };
    const launchUrl = buildSugamPrefillUrl(runtime);
    const sapWindow = window.open(launchUrl, '_blank');
    if (!sapWindow) {
      throw new Error('Popup blocked. Allow popups to open SUGAM prefill links.');
    }

    try {
      await navigator.clipboard.writeText(buildSugamBookmarkletCode());
      message.textContent = 'SUGAM tab opened with payload. Bookmarklet code copied—save it once and click inside logged-in SUGAM tab.';
    } catch (_) {
      message.textContent = 'SUGAM tab opened with payload. Copy the bookmarklet from Permit Planning and click it in logged-in SUGAM tab.';
    }

    for (let i = 0; i < permitSteps.length; i += 1) {
      const step = permitSteps[i];
      renderProgress(i, 'running');
      const value = resolvePermitValue(step.value, runtime);
      message.textContent = `Prepared step ${i + 1}/${permitSteps.length}: ${toStepLabel(step)}${value ? ` → ${value}` : ''}`;
      await new Promise((resolve) => setTimeout(resolve, 70));
      if (step.action === 'capture_requisition_no') row.__REQUISITION_NO = generateRequisitionNo(row);
    }

    renderProgress(permitSteps.length, 'done');
    return row.__REQUISITION_NO || `REQ-${Date.now()}`;
  }


  document.getElementById('refreshPlanningBtn').onclick = () => {
    renderPlanning();
    renderRequestTable();
    renderSummary();
  };

  applyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const sessionInputs = getPermitSessionData(username);
    const cpfNo = cpfInput.value.trim() || sessionInputs.CPF_NO || '';
    if (!cpfNo) {
      alert('Enter CPF_NO once. It will be reused for this user.');
      return;
    }

    const selectedIds = new Set(Array.from(document.querySelectorAll('.permit-row-selector:checked')).map((cb) => cb.dataset.id));
    if (!selectedIds.size) {
      alert('Select at least one row from permit request table.');
      return;
    }

    const pendingRows = getPendingPlanningRows();
    const selectedRows = pendingRows.filter((row) => selectedIds.has(row.id));
    if (!selectedRows.length) {
      alert('No pending planning rows selected.');
      return;
    }

    const commonWorkCenter = commonWorkCenterInput.value.trim() || sessionInputs.WORK_CENTER || '';
    if (!commonWorkCenter) {
      alert('Enter common work center once for all selected rows.');
      return;
    }

    const sapUsername = sapUsernameInput.value.trim() || sessionInputs.SAP_USERNAME || '';
    if (!sapUsername) {
      alert('Enter SAP username once. It will be reused for this user.');
      return;
    }

    const sapPassword = sapPasswordInput.value || sessionInputs.SAP_PASSWORD || '';
    if (!sapPassword) {
      alert('Enter SAP password once. It will be reused for this user.');
      return;
    }

    setPermitSessionData(username, {
      CPF_NO: cpfNo,
      WORK_CENTER: commonWorkCenter,
      SAP_USERNAME: sapUsername,
      SAP_PASSWORD: sapPassword
    });

    const titleById = new Map(Array.from(document.querySelectorAll('.permit-title-input')).map((el) => [el.dataset.id, el.value.trim()]));
    const permitTypeById = new Map(Array.from(document.querySelectorAll('.permit-type-input')).map((el) => [el.dataset.id, el.value]));
    const personById = new Map(Array.from(document.querySelectorAll('.permit-person-input')).map((el) => [el.dataset.id, el.value]));

    try {
      for (const row of selectedRows) {
        const title = (titleById.get(row.id) || `Inspection of ${row.equipment_tag || 'tag'}`).slice(0, 40);
        const permitType = permitTypeById.get(row.id) || '';
        const noOfPerson = personById.get(row.id) || '6';

        if (!permitType) {
          throw new Error(`Permit type missing for ${row.equipment_tag || row.id}`);
        }

        const commonInput = {
          USERNAME: sapUsername,
          PASSWORD: sapPassword,
          TITLE: title,
          DESCRIPTION: '',
          FUNCTIONAL_LOCATION: (row.functional_location || '').trim(),
          EQUIPMENT: (row.equipment_tag || '').trim(),
          WORK_CENTER: commonWorkCenter,
          NO_OF_PERSON: noOfPerson,
          PERMIT_TYPE: permitType,
          CPF_NO: cpfNo
        };

        const reqNo = await runPermitFlowForRow(row, commonInput);
        upsertById('permit_applications', {
          equipment_tag: row.equipment_tag,
          TITLE: commonInput.TITLE,
          PERMIT_TYPE: commonInput.PERMIT_TYPE,
          REQUISITION_NO: reqNo,
          applied_by: username,
          applied_on: new Date().toISOString(),
          cpf_no: commonInput.CPF_NO,
          no_of_person: commonInput.NO_OF_PERSON,
          work_center: commonInput.WORK_CENTER
        }, 'PMT');

        upsertById('next_day_planning', {
          ...row,
          work_center: commonWorkCenter,
          status: 'permit_applied'
        }, 'PLAN');
      }
      message.textContent = `Permit flow completed for ${selectedRows.length} item(s).`;
      renderPlanning();
      renderRequestTable();
      renderSummary();
    } catch (err) {
      message.textContent = err.message;
    }
  });

  copyDraftBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(emailDraft.value || '');
      message.textContent = 'Email draft copied to clipboard.';
    } catch (_) {
      message.textContent = 'Copy failed. Please copy manually from text area.';
    }
  };

  window.addEventListener('atr-db-updated', () => {
    renderPlanning();
    renderRequestTable();
    renderSummary();
  });

  renderPlanning();
  renderRequestTable();
  renderSummary();
  loadPermitAutomationConfig();
}

function setupSyncStatusUI() {
  const existing = document.getElementById('syncStatusBanner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.id = 'syncStatusBanner';
  banner.className = 'sync-status-banner popup';
  banner.textContent = 'Cloud sync ready.';
  document.body.appendChild(banner);

  let hideTimer;
  function showStatus(message, ok = true) {
    banner.textContent = message;
    banner.classList.toggle('ok', ok);
    banner.classList.toggle('error', !ok);
    banner.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => banner.classList.remove('show'), 2400);
  }

  const raw = localStorage.getItem(STORAGE_KEYS.syncStatus);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      showStatus(parsed.message || 'Cloud sync ready.', parsed.ok !== false);
    } catch (_) {}
  }

  window.addEventListener('atr-sync-status', (evt) => {
    const ok = evt.detail?.ok !== false;
    showStatus(evt.detail?.message || (ok ? 'Cloud sync success.' : 'Cloud sync failed.'), ok);
  });
}

function setupDashboard() {
  if (document.body.dataset.page !== 'dashboard') return;
  const inspections = getCollection('inspections');
  const summary = calculateProgress(inspections);
  document.getElementById('totalCount').textContent = summary.total;
  document.getElementById('completedCount').textContent = summary.completed;
  document.getElementById('inProgressCount').textContent = summary.inProgress;
  document.getElementById('notStartedCount').textContent = summary.notStarted;
  document.getElementById('todaysProgressCount').textContent = summary.todaysProgress;
  renderCharts(inspections);
}

window.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  setupThemeToggle();

  try {
    await initializeData();
  } catch (err) {
    console.error('initializeData failed:', err);
  }

  setupLogin();

  try {
    startRealtimeSync();
  } catch (err) {
    console.error('startRealtimeSync failed:', err);
  }

  setupSyncStatusUI();
  injectCommonFooter();
  if (!requireAuth()) return;
  setHeaderUser();
  applyRoleVisibility();
  moveTopControlsToSidebar();
  setupSidebarDrawer();
  setupUserMenu();
  injectCommonFooter();
  setupInspectionPage();
  setupObservationPage();
  setupRequisitionPage();
  setupPermitPlanningPage();
  setupAdminPanel();
  setupDashboard();

  window.addEventListener('atr-db-updated', () => {
    if (document.body.dataset.page === 'login') return;
    if (typeof setSyncStatus === 'function') {
      setSyncStatus({ ok: true, message: 'Cloud update received. Refresh page to load the newest view.' });
    }
  });
});
