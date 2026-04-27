
const API_BASE = '';

// Check authentication
const user = JSON.parse(sessionStorage.getItem('ahl_user') || '{}');
if (!user.id || (user.role !== 'admin' && user.role !== 'viewer')) {
    window.location.href = 'login.html';
}
const isViewer = user.role === 'viewer';
const ADMIN_API_PREFIX = isViewer ? '/api/viewer' : '/api/admin';
const DASHBOARD_PATH = '/dashboard';
let selectedCourseId = parseInt(sessionStorage.getItem('selected_course_id') || '1', 10) || 1;

// --- Course Management ---

async function loadCourses() {
    try {
        const resp = await fetch(`${API_BASE}${ADMIN_API_PREFIX}/courses`, { credentials: 'same-origin' });
        if (!resp.ok) {
             if (resp.status === 401) window.location.href = 'login.html';
             return;
        }
        const data = await resp.json();

        const select = document.getElementById('course-select');
        if (select) {
            select.innerHTML = '';
            (data.courses || []).forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                if (c.id === selectedCourseId) opt.selected = true;
                select.appendChild(opt);
            });
            // If selected course no longer exists, default to first
            if (data.courses.length > 0 && !data.courses.find(c => c.id === selectedCourseId)) {
                selectedCourseId = data.courses[0].id;
                sessionStorage.setItem('selected_course_id', selectedCourseId);
                select.value = selectedCourseId;
            }
        }
        await loadCourseCategories();
        // Initial view load
        const currentSection = document.querySelector('aside nav button.bg-indigo-50')?.id?.replace('nav-', '') || 'dashboard';
        switchSection(currentSection);
    } catch (e) {
        console.error('Failed to load courses', e);
    }
}

function switchCourse(id) {
    selectedCourseId = parseInt(id);
    sessionStorage.setItem('selected_course_id', selectedCourseId);

    // Update categories for the new course
    loadCourseCategories();

    // Reload current view
    const currentSection = document.querySelector('aside nav button.bg-indigo-50')?.id?.replace('nav-', '') || 'dashboard';
    switchSection(currentSection);
}

// Course Manager Modal
function openCurrentCourseCategoryManager() {
    const select = document.getElementById('course-select');
    const courseName = select.options[select.selectedIndex]?.text || 'Current Course';
    openCategoryManager(selectedCourseId, courseName);
}

async function openCourseManager() {
    const modal = document.getElementById('course-manager-modal');
    if (modal) modal.classList.remove('hidden');
    await refreshCourseManagerList();
}

function closeCourseManager() {
    const modal = document.getElementById('course-manager-modal');
    if (modal) modal.classList.add('hidden');
    // Refresh main dropdown in case changes were made
    loadCourses();
}

async function refreshCourseManagerList() {
    const list = document.getElementById('course-manager-list');
    if (!list) return;

    list.innerHTML = '<div class="p-4 text-center text-slate-400">Loading...</div>';

    try {
        const resp = await fetch(`${API_BASE}${ADMIN_API_PREFIX}/courses`, { credentials: 'same-origin' });
        const data = await resp.json();

        list.innerHTML = '';
        (data.courses || []).forEach(c => {
            const div = document.createElement('div');
            div.className = 'px-5 py-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors';
            div.innerHTML = `
                <div>
                    <div class="font-medium text-slate-800">${c.name}</div>
                    <div class="text-xs text-slate-500">/${c.slug} • ID: ${c.id}</div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="openCategoryManager(${c.id}, '${c.name.replace(/'/g, "\\'")}')" class="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                        Manage Categories
                    </button>
                    <button onclick="deleteCourse(${c.id}, '${c.name.replace(/'/g, "\\'")}')" class="px-3 py-1.5 text-xs bg-rose-50 text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors">
                        Delete
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = '<div class="p-4 text-center text-rose-500">Failed to load courses</div>';
    }
}

document.getElementById('create-course-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('create-course-btn');
    const name = document.getElementById('new-course-name').value;
    const slug = document.getElementById('new-course-slug').value;
    const desc = document.getElementById('new-course-desc').value;

    if (!name || !slug) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Creating...';

    try {
        const resp = await fetch(`${API_BASE}${ADMIN_API_PREFIX}/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, slug, description: desc }),
            credentials: 'same-origin'
        });
        const data = await resp.json();

        if (resp.ok) {
            showToast('Course created!', 'success');
            document.getElementById('create-course-form').reset();
            await refreshCourseManagerList();
        } else {
            showToast(data.message || 'Failed to create course', 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

async function deleteCategory(catId, catName) {
    if (!confirm(`Are you sure you want to delete module "${catName}"?\n\nThis will permanently delete:\n- All uploaded videos in this module\n- All AI knowledge/embeddings for this module\n\nThis action cannot be undone.`)) {
        return;
    }

    if (!managingCourseId) return;

    try {
        const resp = await fetch(`${API_BASE}${ADMIN_API_PREFIX}/courses/${managingCourseId}/categories/${catId}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        const data = await resp.json();

        if (resp.ok) {
            showToast('Module deleted successfully', 'success');
            await refreshCategoryManagerList();
            await loadCourseCategories(); // Update the main dropdown
        } else {
            showToast(data.message || 'Failed to delete module', 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// Category Manager Modal
let managingCourseId = null;

async function openCategoryManager(courseId, courseName) {
    managingCourseId = courseId;
    const modal = document.getElementById('category-manager-modal');
    const title = document.getElementById('cat-manager-course-name');
    if (modal) modal.classList.remove('hidden');
    if (title) title.textContent = `For Course: ${courseName}`;
    await refreshCategoryManagerList();
}

async function deleteCourse(courseId, courseName) {
    const typed = window.prompt(`Type the course name to confirm deletion:\n${courseName}`);
    if (!typed || typed.trim() !== courseName.trim()) {
        showToast('Name does not match. Deletion cancelled.', 'warning');
        return;
    }
    try {
        const resp = await fetch(`${API_BASE}${ADMIN_API_PREFIX}/courses/${courseId}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            showToast('Course deleted', 'success');
            await refreshCourseManagerList();
            await loadCourses();
        } else {
            showToast(data.message || 'Deletion failed', 'error');
        }
    } catch (e) {
        showToast(e.message || 'Deletion failed', 'error');
    }
}
function closeCategoryManager() {
    const modal = document.getElementById('category-manager-modal');
    if (modal) modal.classList.add('hidden');
    managingCourseId = null;
}

async function refreshCategoryManagerList() {
    if (!managingCourseId) return;
    const list = document.getElementById('category-manager-list');
    if (!list) return;

    list.innerHTML = '<div class="p-4 text-center text-slate-400">Loading...</div>';

    try {
        const resp = await fetch(`${API_BASE}${ADMIN_API_PREFIX}/courses/${managingCourseId}/categories`, { credentials: 'same-origin' });
        const data = await resp.json();

        list.innerHTML = '';
        if (!data.categories || data.categories.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-slate-400 italic">No categories yet</div>';
            return;
        }

        data.categories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'px-4 py-3 flex items-center justify-between text-sm hover:bg-slate-50 group';
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-slate-700 font-medium">${cat.name}</span>
                    <span class="text-xs text-slate-400">#${cat.id}</span>
                </div>
                <button onclick="deleteCategory(${cat.id}, '${cat.name.replace(/'/g, "\\'")}')"
                    class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Delete Module">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = '<div class="p-4 text-center text-rose-500">Failed to load categories</div>';
    }
}

document.getElementById('add-category-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!managingCourseId) return;

    const btn = document.getElementById('add-cat-btn');
    const nameInput = document.getElementById('new-cat-name');
    const name = nameInput.value.trim();

    if (!name) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '...';

    try {
        const resp = await fetch(`${API_BASE}${ADMIN_API_PREFIX}/courses/${managingCourseId}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
            credentials: 'same-origin'
        });
        const data = await resp.json();

        if (resp.ok) {
            showToast('Module added!', 'success');
            nameInput.value = '';
            await refreshCategoryManagerList();
            await loadCourseCategories(); // Update the main dropdown
        } else {
            showToast(data.message || 'Failed to add category', 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// Initial load is handled by DOMContentLoaded event listener at the bottom
// loadCourses();

document.getElementById('admin-name').textContent = user.name;
const avatar = document.getElementById('admin-avatar');
if (avatar) avatar.textContent = user.name.substring(0, 2).toUpperCase();

const createFormInit = document.getElementById('create-user-form');
if (isViewer && createFormInit) {
    const card = createFormInit.closest('.glass-card') || createFormInit;
    card.classList.add('hidden');
}
// Hide role filter on dashboard for viewers (always candidates view)
const roleFilterEl = document.getElementById('dashboard-role-filter');
if (isViewer && roleFilterEl) {
    roleFilterEl.value = 'candidate';
    roleFilterEl.closest('.flex')?.classList.add('hidden');
}
// --- Navigation Logic ---
function switchSection(sectionId) {
    // Update Sidebar UI
    document.querySelectorAll('aside nav button').forEach(btn => {
        if (btn.id === 'nav-' + sectionId) {
            btn.classList.add('bg-indigo-50', 'text-indigo-600');
            btn.classList.remove('text-slate-600', 'hover:bg-gray-50');
        } else {
            btn.classList.remove('bg-indigo-50', 'text-indigo-600');
            btn.classList.add('text-slate-600', 'hover:bg-gray-50');
        }
    });

    // Hide all sections
    ['dashboard', 'content', 'users', 'settings'].forEach(id => {
        const el = document.getElementById('section-' + id);
        if (el) el.classList.add('hidden');
    });

    // Show selected section
    const target = document.getElementById('section-' + sectionId);
    if (target) target.classList.remove('hidden');

    // Update Page Title
    const titles = {
        'dashboard': 'Dashboard Overview',
        'content': 'Content Library',
        'users': 'User Management',
        'settings': 'System Configuration'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[sectionId] || 'Admin Dashboard';

    // Special Actions per section
    const searchContainer = document.getElementById('simple-search-container');
    const mobileSearch = document.getElementById('mobile-search');
    if (searchContainer) {
        if (sectionId === 'dashboard') {
            searchContainer.classList.remove('md:hidden');
            // IMPORTANT: keep 'hidden' so it's still hidden on mobile; md:flex overrides at desktop
        } else {
            searchContainer.classList.add('md:hidden');
        }
    }
    if (mobileSearch) {
        if (sectionId === 'dashboard') {
            mobileSearch.classList.remove('hidden');
        } else {
            mobileSearch.classList.add('hidden');
        }
    }

    // Trigger data loads
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'content') {
        loadStats();
        loadRagStatus();
    }
    if (sectionId === 'users') loadUsers();
    if (sectionId === 'settings') loadSettings();
}

// --- Mobile Sidebar Toggle ---
const mobileBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('mobile-backdrop');
function openMobileSidebar() {
    if (!sidebar || !backdrop) return;
    sidebar.classList.remove('hidden');
    sidebar.classList.add('fixed', 'inset-y-0', 'left-0');
    backdrop.classList.remove('hidden');
}
function closeMobileSidebar() {
    if (!sidebar || !backdrop) return;
    backdrop.classList.add('hidden');
    sidebar.classList.remove('fixed', 'inset-y-0', 'left-0');
    if (window.innerWidth < 768) {
        sidebar.classList.add('hidden');
    }
}
mobileBtn?.addEventListener('click', openMobileSidebar);
backdrop?.addEventListener('click', closeMobileSidebar);
window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
        sidebar?.classList.remove('hidden');
        backdrop?.classList.add('hidden');
    } else {
        closeMobileSidebar();
    }
});

// --- Dashboard Logic ---

function switchDashboardTab(tab) {
    const btnCandidates = document.getElementById('tab-candidates');
    const btnSessions = document.getElementById('tab-sessions');
    const viewCandidates = document.getElementById('view-candidates');
    const viewSessions = document.getElementById('view-sessions');

    if (!btnCandidates || !btnSessions || !viewCandidates || !viewSessions) return;

    if (tab === 'candidates') {
        btnCandidates.classList.add('text-indigo-600', 'border-indigo-600');
        btnCandidates.classList.remove('text-slate-500', 'border-transparent');

        btnSessions.classList.remove('text-indigo-600', 'border-indigo-600');
        btnSessions.classList.add('text-slate-500', 'border-transparent');

        viewCandidates.classList.remove('hidden');
        viewSessions.classList.add('hidden');
    } else {
        btnSessions.classList.add('text-indigo-600', 'border-indigo-600');
        btnSessions.classList.remove('text-slate-500', 'border-transparent');

        btnCandidates.classList.remove('text-indigo-600', 'border-indigo-600');
        btnCandidates.classList.add('text-slate-500', 'border-transparent');

        viewSessions.classList.remove('hidden');
        viewCandidates.classList.add('hidden');

        // Load sessions if empty
        const list = document.getElementById('sessions-table-body');
        if (list && list.children.length === 0) {
            loadSessionsList();
        }
    }
}

function formatScore(x) {
    return (typeof x === 'number' && !isNaN(x)) ? Number(x).toFixed(1) : '—';
}

async function loadSessionsList() {
    const loading = document.getElementById('sessions-loading');
    const empty = document.getElementById('sessions-empty');
    const tbody = document.getElementById('sessions-table-body');

    if (loading) loading.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    if (tbody) tbody.innerHTML = '';

    try {
        // Build query params from filters
        // For now, just load all completed sessions
        const response = await fetch(`${API_BASE}${ADMIN_API_PREFIX}/sessions/search?limit=50&course_id=${encodeURIComponent(selectedCourseId)}`, { credentials: 'same-origin' });
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        const data = await response.json();

        if (loading) loading.classList.add('hidden');

        if (!data.sessions || data.sessions.length === 0) {
            if (empty) empty.classList.remove('hidden');
            return;
        }

        if (tbody) {
            data.sessions.forEach(session => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition-colors';

                const scoreClass = session.overall_score >= 8 ? 'text-emerald-600 bg-emerald-50' :
                                 session.overall_score >= 5 ? 'text-amber-600 bg-amber-50' :
                                 'text-rose-600 bg-rose-50';

                tr.innerHTML = `
                    <td class="px-6 py-4"><input type="checkbox" class="rounded border-gray-300 text-indigo-600 session-checkbox" value="${session.id}"></td>
                    <td class="px-6 py-4">
                        <div class="font-medium text-slate-900">${session.username || 'Unknown'}</div>
                        <div class="text-xs text-slate-500">ID: ${session.id}</div>
                    </td>
                    <td class="px-6 py-4 text-slate-600">${session.category}</td>
                    <td class="px-6 py-4 text-slate-600 text-xs">${new Date(session.started_at).toLocaleDateString()}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded-lg text-xs font-bold ${scoreClass}">${session.overall_score !== null ? session.overall_score : '-'}</span>
                    </td>
                    <td class="px-6 py-4 text-slate-500 text-xs truncate max-w-[150px]">${session.notes || '-'}</td>
                    <td class="px-6 py-4">
                        ${session.tags ? session.tags.split(',').map(t => `<span class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] mr-1">${t}</span>`).join('') : '-'}
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="viewSessionDetails(${session.id})" class="text-indigo-600 hover:text-indigo-900 text-sm font-medium">View Report</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

    } catch (e) {
        console.error('Failed to load sessions:', e);
        if (loading) loading.classList.add('hidden');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-12 text-center text-rose-500">Failed to load sessions</td></tr>';
    }
}

async function loadDashboard() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('dashboard-content');
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');

    // 1. Load KPI Stats
    try {
        const role = document.getElementById('dashboard-role-filter')?.value || 'candidate';
        const response = await fetch(`${API_BASE}${ADMIN_API_PREFIX}/kpi?role=${role}&course_id=${encodeURIComponent(selectedCourseId)}`, { credentials: 'same-origin' });
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        const stats = await response.json();

        if (stats) {
            document.getElementById('stat-candidates').textContent = stats.total_candidates || 0;
            document.getElementById('stat-sessions').textContent = stats.completed_sessions || 0;
            document.getElementById('stat-avg-score').textContent = stats.average_score || '-';
            document.getElementById('stat-active').textContent = stats.active_today || 0;
        }
    } catch (e) {
        console.error('Failed to load KPIs:', e);
    }

    // 2. Load Candidates List (Default View)
    await loadCandidatesList();

    // Setup Tab Listeners
    const btnCandidates = document.getElementById('tab-candidates');
    const btnSessions = document.getElementById('tab-sessions');
    if (btnCandidates) btnCandidates.onclick = () => switchDashboardTab('candidates');
    if (btnSessions) btnSessions.onclick = () => switchDashboardTab('sessions');

    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
}

async function loadCandidatesList() {
    const container = document.getElementById('candidates-list');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-8"><div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-indigo-600"></div></div>';

    try {
        const role = document.getElementById('dashboard-role-filter')?.value || 'candidate';
        const desktopTerm = (document.getElementById('search-input')?.value || '').trim();
        const mobileTerm = (document.getElementById('mobile-search-input')?.value || '').trim();
        const searchTerm = (mobileTerm || desktopTerm);
        const query = new URLSearchParams({
            role,
            limit: '20',
            course_id: String(selectedCourseId),
            ...(searchTerm ? { search: searchTerm } : {})
        }).toString();
        const response = await fetch(`${API_BASE}${ADMIN_API_PREFIX}${DASHBOARD_PATH}?${query}`, { credentials: 'same-origin' });
        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        const data = await response.json();

        container.innerHTML = '';

        if (!data.candidates || data.candidates.length === 0) {
            document.getElementById('no-data').classList.remove('hidden');
            return;
        } else {
            document.getElementById('no-data').classList.add('hidden');
        }

        data.candidates.forEach(user => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-all w-full';

            card.innerHTML = `
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 w-full">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                      ${(user.name || user.username || '??').substring(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div class="font-semibold text-slate-900 text-base">${user.name || user.username}</div>
                      <div class="text-xs text-slate-500">${user.username || ''}</div>
                      <div class="mt-1 inline-flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">${user.role}</span>
                        <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">Completed: ${user.completed_sessions || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center md:items-start gap-3 md:gap-4">
                    <div class="text-center">
                      <div class="text-xs text-slate-500 uppercase">Avg Score</div>
                      <div class="text-2xl font-bold ${getScoreColor(user.overall_average)}">${formatScore(user.overall_average)}</div>
                    </div>
                    <div class="flex-1">
                      <div class="grid grid-cols-3 gap-2">
                        <div class="text-center">
                          <div class="text-xs text-slate-500 uppercase whitespace-nowrap">Trial</div>
                          <div class="text-sm font-bold ${getScoreColor(user.difficulty_performance?.['trial']?.average)}">${formatScore(user.difficulty_performance?.['trial']?.average)}</div>
                        </div>
                        <div class="text-center">
                          <div class="text-xs text-slate-500 uppercase whitespace-nowrap">Basics</div>
                          <div class="text-sm font-bold ${getScoreColor(user.difficulty_performance?.['basics']?.average)}">${formatScore(user.difficulty_performance?.['basics']?.average)}</div>
                        </div>
                        <div class="text-center">
                          <div class="text-xs text-slate-500 uppercase whitespace-nowrap">Field</div>
                          <div class="text-sm font-bold ${getScoreColor(user.difficulty_performance?.['field-ready']?.average)}">${formatScore(user.difficulty_performance?.['field-ready']?.average)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="mt-2 md:mt-0 flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    <button onclick="viewUserSessions(${user.user_id}, '${(user.name || user.username || '').replace(/'/g, "\\'")}')" class="w-full md:w-auto px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                      Open
                    </button>
                    <button onclick="deleteCandidate(${user.user_id})" class="px-3 py-2 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-gray-50 transition-colors md:ml-2">
                      Delete
                    </button>
                  </div>
                </div>
            `;
            container.appendChild(card);
            if (isViewer) {
                const delBtn = card.querySelector('button[onclick^="deleteCandidate"]');
                if (delBtn) delBtn.remove();
            }
        });

    } catch (e) {
        console.error('Failed to load candidates:', e);
        container.innerHTML = '<div class="text-center py-8 text-rose-500">Failed to load data.</div>';
    }
}

function getScoreColor(score) {
    if (!score) return 'text-slate-400';
    if (score >= 8.5) return 'text-emerald-600';
    if (score >= 7.0) return 'text-indigo-600';
    if (score >= 5.0) return 'text-amber-600';
    return 'text-rose-600';
}

const searchBtn = document.getElementById('search-btn');
const refreshBtn = document.getElementById('refresh-btn');
const mobileSearchBtn = document.getElementById('mobile-search-btn');
const mobileRefreshBtn = document.getElementById('mobile-refresh-btn');
const desktopSearchInput = document.getElementById('search-input');
const mobileSearchInput = document.getElementById('mobile-search-input');
searchBtn?.addEventListener('click', () => loadCandidatesList());
refreshBtn?.addEventListener('click', () => {
    if (desktopSearchInput) desktopSearchInput.value = '';
    loadCandidatesList();
});
mobileSearchBtn?.addEventListener('click', () => loadCandidatesList());
mobileRefreshBtn?.addEventListener('click', () => {
    if (mobileSearchInput) mobileSearchInput.value = '';
    loadCandidatesList();
});
desktopSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadCandidatesList();
});
mobileSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadCandidatesList();
});
async function deleteCandidate(userId) {
    try {
        const confirmDelete = window.confirm('Delete this candidate? This cannot be undone.');
        if (!confirmDelete) return;
        const resp = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
            showToast('Candidate deleted', 'success');
            await loadCandidatesList();
        } else {
            showToast(data.message || 'Deletion failed', 'error');
        }
    } catch (e) {
        showToast(e.message || 'Deletion failed', 'error');
    }
}

async function viewSessionDetails(sessionId) {
    // Open report in new window or modal
    // For now, let's just open the raw report endpoint or a specific admin report view
    // Since we don't have a dedicated admin report page, we can reuse the trainer report view or just fetch the HTML and show it in a modal.

    try {
        const response = await fetch(`${API_BASE}/api/training/report/${sessionId}`, { credentials: 'same-origin' });
        const data = await response.json();

        if (data.success && data.report_html) {
            // Create a modal to show the report
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
                    <div class="p-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                        <h3 class="font-bold text-lg text-slate-800">Session Report</h3>
                        <button onclick="this.closest('.fixed').remove()" class="p-2 hover:bg-gray-100 rounded-full">✕</button>
                    </div>
                    <div class="p-6">
                        ${data.report_html}
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            alert('Failed to load report details');
        }
    } catch (e) {
        console.error('Error viewing session:', e);
        alert('Error viewing session details');
    }
}

// --- Content / Upload Logic ---
async function loadStats() {
    // Re-using logic from admin-upload.html but pointing to /rag-status which seems more robust
    loadRagStatus();
}

async function loadRagStatus() {
    const container = document.getElementById('stats-container'); // In content section
    const statusContainer = document.getElementById('rag-status-container'); // Also in content section

    if (!container && !statusContainer) return;
    if (isViewer) {
        if (container) container.innerHTML = '<div class="text-center py-4 text-slate-400">Content status is available to admins only.</div>';
        if (statusContainer) statusContainer.classList.add('hidden');
        return;
    }

    if (container) container.innerHTML = '<div class="text-center py-4 text-slate-400">Loading stats...</div>';

    try {
        const response = await fetch(`${API_BASE}/api/admin/rag-status?course_id=${encodeURIComponent(selectedCourseId)}`, { credentials: 'same-origin' });
        if (!response.ok) {
            if (container) container.innerHTML = '<span class="text-rose-500 text-xs">Unauthorized. Please login as admin.</span>';
            if (statusContainer) statusContainer.innerHTML = '';
            return;
        }
        const data = await response.json();

        // Populate Categories List (stats-container)
        if (container) {
            container.innerHTML = '';
            const categories = Array.isArray(data.categories) ? data.categories : [];
            categories.forEach(cat => {
                const hasContent = cat.video_count > 0;
                const div = document.createElement('div');
                div.className = `p-3 rounded-xl border ${hasContent ? 'bg-white border-slate-200' : 'bg-slate-50 border-transparent'} flex items-center justify-between group hover:border-indigo-200 transition-colors`;

                div.innerHTML = `
                    <div>
                        <h3 class="text-sm font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors">${cat.category}</h3>
                        <p class="text-xs text-slate-500 mt-0.5">
                            <span class="font-medium ${hasContent ? 'text-indigo-600' : ''}">${cat.video_count}</span> videos •
                            <span class="font-medium ${hasContent ? 'text-indigo-600' : ''}">${cat.chunk_count}</span> chunks
                        </p>
                    </div>
                    <div class="h-6 w-6 rounded-full flex items-center justify-center ${hasContent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}">
                        ${hasContent ? '✓' : '•'}
                    </div>
                `;
                container.appendChild(div);
            });

            // Show parent container if hidden
            const statsCard = container.closest('.glass-card');
            if (statsCard) {
                const loader = statsCard.querySelector('#stats-loading');
                if (loader) loader.classList.add('hidden');
                container.classList.remove('hidden');
            }
        }

        // Populate RAG System Health (rag-status-container)
        if (statusContainer) {
            statusContainer.innerHTML = '';
            const indexStats = (data && typeof data.index_stats === 'object') ? data.index_stats : null;
            if (indexStats) {
                const totalVectors = (indexStats.total_vectors ?? indexStats.total_vector_count ?? 0);
                const dimension = (indexStats.dimension ?? '—');
                const fullnessRaw = (indexStats.fullness ?? indexStats.index_fullness);
                const fullness = (typeof fullnessRaw === 'number') ? ((fullnessRaw * 100).toFixed(1) + '%') : '—';

                const metrics = [
                    { label: 'Total Vectors', value: totalVectors },
                    { label: 'Dimension', value: dimension },
                    { label: 'Fullness', value: fullness }
                ];

                metrics.forEach(m => {
                    statusContainer.innerHTML += `
                        <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <div class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">${m.label}</div>
                            <div class="text-xl font-bold text-slate-900">${m.value}</div>
                        </div>
                    `;
                });
            }
            // Update timestamp
            document.getElementById('rag-last-updated').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        }

    } catch (error) {
        console.error('Error loading stats:', error);
        if (container) container.innerHTML = '<span class="text-rose-500 text-xs">Failed to load stats</span>';
    }
}

// Upload Form Handler
const uploadForm = document.getElementById('upload-form');
if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const category = document.getElementById('category').value;
        const videoName = document.getElementById('video-name').value.trim();
        const fileInput = document.getElementById('file-input');
        const file = fileInput.files[0];

        if (!file || !category || !videoName) {
            showToast('Please fill all fields', 'error');
            return;
        }

        const uploadBtn = document.getElementById('upload-btn');
        const statusDiv = document.getElementById('upload-status');
        const statusText = document.getElementById('status-text');
        const progressBar = document.getElementById('progress-bar');
        const resultDiv = document.getElementById('upload-result');

        const originalContent = uploadBtn.innerHTML;
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<div class="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div> Uploading...';
        statusDiv.classList.remove('hidden');
        if (resultDiv) resultDiv.classList.add('hidden');

        statusText.textContent = 'Reading file and creating embeddings...';
        progressBar.style.width = '30%';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        formData.append('video_name', videoName);
        formData.append('course_id', String(selectedCourseId));

        try {
            const response = await fetch(`${API_BASE}/api/admin/upload`, {
                method: 'POST',
                credentials: 'same-origin',
                body: formData
            });

            progressBar.style.width = '70%';
            const data = await response.json();
            progressBar.style.width = '100%';

            if (response.ok && data.success) {
                statusText.textContent = 'Upload complete!';
                if (resultDiv) {
                    resultDiv.className = 'mt-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-sm';
                    resultDiv.innerHTML = `
                        <div class="flex items-start gap-3">
                            <div class="p-1 bg-emerald-100 rounded-full text-emerald-600 flex-shrink-0">✓</div>
                            <div>
                                <h4 class="font-bold text-emerald-900 mb-1">Upload Successful</h4>
                                <ul class="space-y-1 text-emerald-700/80">
                                    <li>Category: <span class="font-medium text-emerald-800">${data.category}</span></li>
                                    <li>Video: <span class="font-medium text-emerald-800">${data.video_name}</span></li>
                                    <li>Chunks: <span class="font-medium text-emerald-800">${data.chunks}</span></li>
                                </ul>
                            </div>
                        </div>
                    `;
                    resultDiv.classList.remove('hidden');
                }
                showToast('Content uploaded successfully!', 'success');

                // Reset form
                uploadForm.reset();
                const fileNameDisplay = document.getElementById('file-name-display');
                if (fileNameDisplay) {
                    fileNameDisplay.textContent = 'TXT files only';
                    fileNameDisplay.classList.remove('text-indigo-600', 'font-medium');
                    fileNameDisplay.classList.add('text-slate-400');
                }

                // Reload stats
                loadStats();
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            statusText.textContent = 'Upload failed';
            progressBar.classList.remove('bg-indigo-600');
            progressBar.classList.add('bg-rose-500');
            showToast('Upload failed: ' + error.message, 'error');
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = originalContent;

            if (statusText.textContent === 'Upload complete!') {
                setTimeout(() => {
                    statusDiv.classList.add('hidden');
                    progressBar.style.width = '0%';
                }, 3000);
            }
        }
    });
}

// Sync Content Handler
const syncBtn = document.getElementById('sync-content-btn');
if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
        const originalHtml = syncBtn.innerHTML;
        syncBtn.disabled = true;
        syncBtn.innerHTML = '🔄 Syncing...';

        try {
            const response = await fetch(`${API_BASE}/api/admin/sync-content`, {
                method: 'POST',
                credentials: 'same-origin'
            });
            const data = await response.json();

            if (response.ok) {
                showToast(`Sync complete! Added: ${data.added}, Deleted: ${data.deleted}`, 'success');
                loadStats();
            } else {
                throw new Error(data.message || 'Sync failed');
            }
        } catch (e) {
            showToast('Sync failed: ' + e.message, 'error');
        } finally {
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalHtml;
        }
    });
}


// --- User Management Logic ---
async function loadUsers() {
    // Currently just showing the create form. If there was a user list table, we'd load it here.
}

const createUserForm = document.getElementById('create-user-form');
if (createUserForm) {
    createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isViewer) {
            showToast('Insufficient permissions', 'error');
            return;
        }

        const username = document.getElementById('new-username').value.trim();
        const password = document.getElementById('new-password').value.trim();
        const name = document.getElementById('new-name').value.trim();
        const roleEl = document.getElementById('new-role');
        const role = roleEl ? roleEl.value : 'candidate';

        const btn = document.getElementById('create-user-btn');
        const resultDiv = document.getElementById('user-result');

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div> Creating...';

        try {
            const response = await fetch(`${API_BASE}/api/admin/users`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, name, role })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                if (resultDiv) {
                    resultDiv.className = 'mt-4 p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl';
                    resultDiv.innerHTML = `Created: <strong>${username}</strong>`;
                    resultDiv.classList.remove('hidden');
                }
                showToast('User created successfully', 'success');
                createUserForm.reset();
            } else {
                throw new Error(data.message || 'Creation failed');
            }
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

// --- Session Modal & Reports ---
let modalSessions = [];
let modalIndex = 0;
let modalCandidateName = '';

async function viewUserSessions(userId, candidateName = '') {
    try {
        modalCandidateName = candidateName || modalCandidateName || '';
        const url = isViewer
            ? `${API_BASE}${ADMIN_API_PREFIX}/sessions/user/${userId}?course_id=${encodeURIComponent(selectedCourseId)}`
            : `${API_BASE}/api/sessions/user/${userId}?course_id=${encodeURIComponent(selectedCourseId)}`;
        const resp = await fetch(url, { credentials: 'same-origin' });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.message || 'Failed to load user sessions');
        modalSessions = (data.sessions || []).sort((a, b) => {
            // Sort by ended_at desc, fallback started_at
            const aT = (a.ended_at || a.started_at || '');
            const bT = (b.ended_at || b.started_at || '');
            return aT < bT ? 1 : (aT > bT ? -1 : 0);
        });
        if (!modalSessions.length) {
            showToast('No sessions found for this user', 'warning');
            return;
        }
        const latestCompleted = modalSessions.find(s => s.status === 'completed') || modalSessions[0];
        modalIndex = modalSessions.findIndex(s => s.id === latestCompleted.id);
        if (!latestCompleted) {
            showToast('No sessions found for this user', 'warning');
            return;
        }
        openSessionModal(latestCompleted.id);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function openSessionModal(sessionId) {
    const modal = document.getElementById('session-modal');
    const content = document.getElementById('modal-content');
    if (!modal || !content) return;
    modal.classList.remove('hidden');

    const categories = Array.from(new Set(modalSessions.map(s => s.category || 'Uncategorized'))).sort();
    const statusOptions = ['all', 'completed', 'active'];
    const layout = `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <aside class="md:col-span-1">
                <div class="bg-white rounded-xl border border-slate-200 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-sm font-bold text-slate-700">Sessions</h3>
                        <div class="flex items-center gap-2">
                            <button class="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-50" onclick="prevSession()">◀</button>
                            <button class="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-50" onclick="nextSession()">▶</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <select id="session-filter-status" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                            ${statusOptions.map(st => `<option value="${st}">${st.charAt(0).toUpperCase()+st.slice(1)}</option>`).join('')}
                        </select>
                        <select id="session-filter-category" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                            <option value="all">All Categories</option>
                            ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="relative mb-3">
                        <input id="session-search" type="text" placeholder="Search by #id or category" class="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500">
                        <span class="absolute left-2.5 top-1.5 text-slate-400">🔍</span>
                    </div>
                    <div id="session-list" class="max-h-[360px] overflow-y-auto space-y-1 pr-1"></div>
                </div>
            </aside>
            <section class="md:col-span-3">
                <div class="flex items-center justify-between mb-3">
                    <div class="text-sm text-slate-500">Viewing session <span id="session-current-label" class="font-semibold text-slate-800">#${sessionId}</span></div>
                    <button id="session-export-btn" class="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Export PDF</button>
                </div>
                <div id="session-report" class="bg-white rounded-xl p-4 border border-slate-200">
                    <div class="text-center py-16"><div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-indigo-600"></div></div>
                </div>
            </section>
        </div>
    `;
    content.innerHTML = layout;

    try {
        const listEl = document.getElementById('session-list');
        const searchEl = document.getElementById('session-search');
        const statusEl = document.getElementById('session-filter-status');
        const catEl = document.getElementById('session-filter-category');
        const reportEl = document.getElementById('session-report');
        const exportBtn = document.getElementById('session-export-btn');
        const currLabel = document.getElementById('session-current-label');

        function renderList() {
            const term = (searchEl.value || '').toLowerCase();
            const status = statusEl.value;
            const cat = catEl.value;
            const items = modalSessions.filter(s => {
                const byStatus = status === 'all' ? true : s.status === status;
                const byCat = cat === 'all' ? true : (s.category || 'Uncategorized') === cat;
                const byTerm = term ? (`${s.id}`.includes(term) || (s.category || '').toLowerCase().includes(term)) : true;
                return byStatus && byCat && byTerm;
            });
            const html = items.map((s, i) => {
                const idx = modalSessions.findIndex(ms => ms.id === s.id);
                const active = idx === modalIndex;
                const score = formatScore(s.overall_score);
                return `
                    <button class="w-full text-left px-3 py-2 rounded-lg border ${active?'bg-indigo-50 text-indigo-700 border-indigo-200':'bg-white text-slate-700 border-slate-200'} hover:bg-slate-50 text-xs"
                        onclick="selectSession(${idx})">
                        <div class="flex items-center justify-between">
                            <span class="font-semibold">#${s.id}</span>
                            <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Score: ${score}</span>
                        </div>
                        <div class="mt-0.5 text-slate-500">${s.category || 'Uncategorized'} • ${s.status}</div>
                        <div class="text-[10px] text-slate-400">${s.ended_at || s.started_at || ''}</div>
                    </button>
                `;
            }).join('');
            listEl.innerHTML = html || '<div class="text-xs text-slate-500 p-2">No sessions match filters</div>';
        }

        searchEl.addEventListener('input', renderList);
        statusEl.addEventListener('change', renderList);
        catEl.addEventListener('change', renderList);

        exportBtn.addEventListener('click', async () => {
            const sid = modalSessions[modalIndex]?.id;
            if (!sid) return;
            try {
                const res = await fetch(`${API_BASE}/api/sessions/${sid}/export/pdf`, { credentials: 'same-origin' });
                if (!res.ok) throw new Error('Export failed');
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `session_report_${sid}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            } catch (e) {
                showToast('Export failed', 'error');
            }
        });

        renderList();

        const resp = await fetch(`${API_BASE}/api/training/report/${sessionId}`, { credentials: 'same-origin' });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.details || 'Failed to load report');
        const reportHtml = data.report_html || '';
        const titleName = modalCandidateName || data.session?.username || '';
        currLabel.textContent = `#${sessionId} • ${titleName}`;
        reportEl.innerHTML = `<div class="bg-white rounded-xl p-4 border border-slate-200">${reportHtml}</div>`;

        if (data.session && data.session.id != null) {
            const sid = Number(data.session.id);
            const idx = modalSessions.findIndex(s => Number(s.id) === sid);
            if (idx >= 0) {
                modalSessions[idx].overall_score = typeof data.session.overall_score === 'number'
                    ? Number(data.session.overall_score)
                    : modalSessions[idx].overall_score;
                renderList();
            }
        }

        const saveBtn = document.getElementById('save-notes-btn');
        const notesInput = document.getElementById('session-notes');
        const notesStatus = document.getElementById('notes-status');
        saveBtn.onclick = async () => {
            try {
                const resp2 = await fetch(`${API_BASE}/api/admin/sessions/${sessionId}/notes`, {
                    method: 'PUT',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notes: notesInput.value })
                });
                const data2 = await resp2.json();
                if (!resp2.ok) throw new Error(data2.message || 'Failed to save notes');
                notesStatus.textContent = 'Saved';
                showToast('Notes saved', 'success');
                setTimeout(() => notesStatus.textContent = '', 2000);
            } catch (e) {
                showToast(e.message, 'error');
            }
        };

    } catch (e) {
        content.innerHTML = headerNav + '<div class="text-center py-12 text-rose-500">Failed to load report</div>';
    }
}

function selectSession(i) {
    if (i < 0 || i >= modalSessions.length) return;
    modalIndex = i;
    openSessionModal(modalSessions[modalIndex].id);
}
function prevSession() {
    if (modalSessions.length === 0) return;
    modalIndex = (modalIndex - 1 + modalSessions.length) % modalSessions.length;
    openSessionModal(modalSessions[modalIndex].id);
}
function nextSession() {
    if (modalSessions.length === 0) return;
    modalIndex = (modalIndex + 1) % modalSessions.length;
    openSessionModal(modalSessions[modalIndex].id);
}

document.getElementById('close-modal')?.addEventListener('click', () => {
    document.getElementById('session-modal')?.classList.add('hidden');
});

// --- Settings Logic ---
async function loadSettings() {
    const container = document.getElementById('settings-container');
    const loading = document.getElementById('settings-loading');
    const form = document.getElementById('settings-form');

    if (!container) return;

    loading.classList.remove('hidden');
    form.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE}/api/admin/settings`, { credentials: 'same-origin' });
        const data = await response.json();

        container.innerHTML = '';

        if (data.settings) {
            data.settings.forEach(setting => {
                const div = document.createElement('div');
                div.className = 'space-y-2';

                let inputHtml = '';
                if (setting.type === 'boolean') {
                    inputHtml = `
                        <select name="${setting.key}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="true" ${setting.value === true ? 'selected' : ''}>Enabled</option>
                            <option value="false" ${setting.value === false ? 'selected' : ''}>Disabled</option>
                        </select>
                    `;
                } else if (setting.type === 'number') {
                    inputHtml = `
                        <input type="number" name="${setting.key}" value="${setting.value}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500">
                    `;
                } else {
                    inputHtml = `
                        <input type="text" name="${setting.key}" value="${setting.value}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500">
                    `;
                }

                div.innerHTML = `
                    <label class="block text-sm font-bold text-slate-700">${setting.description || setting.key}</label>
                    ${inputHtml}
                    <p class="text-xs text-slate-400">Key: ${setting.key}</p>
                `;
                container.appendChild(div);
            });
        }

        loading.classList.add('hidden');
        form.classList.remove('hidden');

    } catch (e) {
        loading.innerHTML = '<span class="text-rose-500">Failed to load settings</span>';
    }
}

const settingsForm = document.getElementById('settings-form');
if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(settingsForm);
        const settings = [];

        formData.forEach((value, key) => {
            // Convert types if needed (basic check)
            if (value === 'true') value = true;
            else if (value === 'false') value = false;
            else if (!isNaN(value) && value !== '') value = Number(value);

            settings.push({ key, value });
        });

        try {
            const response = await fetch(`${API_BASE}/api/admin/settings`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings })
            });

            const data = await response.json();
            if (response.ok) {
                showToast('Settings saved successfully', 'success');
            } else {
                throw new Error(data.message || 'Save failed');
            }
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

// --- Common UI Utils ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let colors = 'bg-slate-800 text-white';

    if (type === 'success') colors = 'bg-white border-l-4 border-emerald-500 text-slate-800 shadow-xl shadow-emerald-100';
    if (type === 'error') colors = 'bg-white border-l-4 border-rose-500 text-slate-800 shadow-xl shadow-rose-100';
    if (type === 'warning') colors = 'bg-white border-l-4 border-amber-500 text-slate-800 shadow-xl shadow-amber-100';

    toast.className = `pointer-events-auto min-w-[300px] max-w-md p-4 rounded-xl flex items-start gap-3 transform transition-all duration-500 translate-y-10 opacity-0 ${colors}`;
    toast.innerHTML = `
        <div class="flex-1 font-medium text-sm">${message}</div>
        <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600">✕</button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('translate-y-10', 'opacity-0'));
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// Logout
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
        await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'same-origin' });
    } catch (e) { console.warn(e); }
    sessionStorage.removeItem('ahl_user');
    window.location.href = 'login.html';
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initial load is handled by loadCourses() call at top level,
    // but better to call it here to ensure DOM is ready
    // We already called loadCourses() at the top, but that might run before DOM is ready.
    // Let's rely on this one.
    loadCourses();
});

async function loadCourseCategories() {
    try {
        const resp = await fetch(`${API_BASE}/api/admin/courses/${encodeURIComponent(selectedCourseId)}/categories`, { credentials: 'same-origin' });
        if (resp.status === 401) {
            window.location.href = 'login.html';
            return;
        }
        const data = await resp.json();
        const cats = data.categories || [];
        const catSelect = document.getElementById('category');
        if (catSelect) {
            catSelect.innerHTML = '<option value="">Select Category...</option>';
            cats.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.name;
                opt.textContent = c.name;
                catSelect.appendChild(opt);
            });
        }
    } catch (e) {}
}

// File Input UI Enhancement
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');
if(fileInput && fileNameDisplay) {
    fileInput.addEventListener('change', (e) => {
        if(e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
            fileNameDisplay.classList.add('text-indigo-600', 'font-medium');
            fileNameDisplay.classList.remove('text-slate-400');
        } else {
            fileNameDisplay.textContent = 'TXT files only';
            fileNameDisplay.classList.remove('text-indigo-600', 'font-medium');
            fileNameDisplay.classList.add('text-slate-400');
        }
    });
}
