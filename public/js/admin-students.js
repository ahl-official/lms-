let currentUser = null;
let allStudents = [];
let filteredStudents = [];

// Load roles for dropdowns
async function loadRoles() {
  try {
    const roles = await LMSUtils.apiCall('/roles');

    // Populate role filter dropdown (exclude admin role)
    const roleFilter = document.getElementById('roleFilter');
    if (roleFilter) {
      while (roleFilter.children.length > 1) {
        roleFilter.removeChild(roleFilter.lastChild);
      }
      roles
        .filter((role) => role.name !== 'admin')
        .forEach((role) => {
          const option = document.createElement('option');
          option.value = role.name;
          option.textContent = role.name;
          roleFilter.appendChild(option);
        });
    }

    // Populate course role dropdowns (exclude admin role)
    const courseRoleSelects = ['studentCourseRole', 'editStudentCourseRole'];
    courseRoleSelects.forEach((selectId) => {
      const select = document.getElementById(selectId);
      if (select) {
        while (select.children.length > 1) {
          select.removeChild(select.lastChild);
        }
        roles
          .filter((role) => role.name !== 'admin')
          .forEach((role) => {
            const option = document.createElement('option');
            option.value = role.name;
            option.textContent = role.name;
            select.appendChild(option);
          });
      }
    });
  } catch (error) {
    console.error('Failed to load roles:', error);
  }
}

async function initStudentsPage() {
  try {
    currentUser = await LMSUtils.getCurrentUser();

    if (currentUser.role !== 'admin') {
      window.location.href = '/';
      return;
    }

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = currentUser.name;

    // Setup phone formatting for all phone input fields
    const phoneInputs = document.querySelectorAll('input[type="tel"], input[name="phone"]');
    phoneInputs.forEach((input) => {
      LMSUtils.setupPhoneFormatting(input);
    });

    await loadRoles();
    await loadStudentsData();
    setupEventListeners();
  } catch (error) {
    console.error('Students page initialization failed:', error);
    window.location.href = '/';
  }
}

// Load students data
async function loadStudentsData() {
  try {
    const users = await LMSUtils.apiCall('/users');
    allStudents = users.filter((u) => u.role === 'student');
    filteredStudents = [...allStudents];

    updateStatistics();
    renderStudentsTable();
  } catch (error) {
    console.error('Failed to load students data:', error);
    LMSUtils.showNotification('Failed to load students data', 'error');
  }
}

// Update statistics
function updateStatistics() {
  const totalStudents = allStudents.length;
  const activeStudents = allStudents.filter((s) => s.course_role).length;

  const totalEl = document.getElementById('totalStudents');
  if (totalEl) totalEl.textContent = totalStudents;
  const activeEl = document.getElementById('activeStudents');
  if (activeEl) activeEl.textContent = activeStudents;
  const completedEl = document.getElementById('completedCourses');
  if (completedEl) completedEl.textContent = '0';
  const avgProgressEl = document.getElementById('averageProgress');
  if (avgProgressEl) avgProgressEl.textContent = '0%';
}

// Render students table
function renderStudentsTable() {
  const container = document.getElementById('studentsTableContainer');
  if (!container) return;

  if (filteredStudents.length === 0) {
    container.innerHTML = '<p>No students found.</p>';
    return;
  }

  const tableHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th>Course Role</th>
          <th>Joined</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredStudents
          .map(
            (student) => `
          <tr>
            <td><strong>${student.name}</strong></td>
            <td>${student.email}</td>
            <td>${student.phone || 'N/A'}</td>
            <td>
              ${
                student.course_role
                  ? `<span class="status-badge status-completed">${student.course_role}</span>`
                  : '<span class="status-badge status-pending">No Role</span>'
              }
            </td>
            <td>${LMSUtils.formatDate(student.created_at)}</td>
            <td>
              <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-right: 0.5rem;" 
                onclick="viewStudentDetails(${student.id})">
                View Details
              </button>
              <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-right: 0.5rem;" 
                onclick="editStudent(${student.id})">
                Edit
              </button>
              <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" 
                onclick="confirmDeleteStudent(${student.id}, '${student.name}')">
                Delete
              </button>
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = tableHTML;
}

// Setup event listeners
function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', LMSUtils.debounce(filterStudents, 300));
  }
  const roleFilter = document.getElementById('roleFilter');
  if (roleFilter) {
    roleFilter.addEventListener('change', filterStudents);
  }
}

// Filter students
function filterStudents() {
  const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const roleFilter = document.getElementById('roleFilter')?.value || '';

  filteredStudents = allStudents.filter((student) => {
    const matchesSearch =
      !searchTerm ||
      student.name.toLowerCase().includes(searchTerm) ||
      student.email.toLowerCase().includes(searchTerm) ||
      (student.phone && student.phone.includes(searchTerm));

    const matchesRole = !roleFilter || student.course_role === roleFilter;

    return matchesSearch && matchesRole;
  });

  renderStudentsTable();
}

// View student details
async function viewStudentDetails(studentId) {
  try {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) return;

    const detailsHTML = `
      <div class="student-details">
        <div class="form-row">
          <div>
            <h4>Personal Information</h4>
            <p><strong>Name:</strong> ${student.name}</p>
            <p><strong>Email:</strong> ${student.email}</p>
            <p><strong>Phone:</strong> ${student.phone || 'N/A'}</p>
            <p><strong>Course Role:</strong> ${student.course_role || 'Not Assigned'}</p>
            <p><strong>Joined:</strong> ${LMSUtils.formatDate(student.created_at)}</p>
          </div>
          <div>
            <h4>Progress Overview</h4>
            <div class="progress-section">
              <p><strong>Overall Progress:</strong></p>
              ${LMSUtils.createProgressBar(0, 'Course Progress: ')}
            </div>
            <p><strong>Videos Completed:</strong> 0/0</p>
            <p><strong>Activities Submitted:</strong> 0</p>
            <p><strong>Activities Approved:</strong> 0</p>
          </div>
        </div>

        <div class="mt-2">
          <h4>Recent Activity</h4>
          <div class="activity-list">
            <p style="color: #666; font-style: italic;">No recent activity</p>
          </div>
        </div>

        <div class="mt-2">
          <h4>Actions</h4>
          <div class="flex gap-1">
            <button class="btn btn-primary" onclick="resetStudentProgress(${student.id})">Reset Progress</button>
            <button class="btn btn-secondary" onclick="sendNotification(${student.id})">Send Notification</button>
          </div>
        </div>
      </div>`;

    const titleEl = document.getElementById('studentDetailsTitle');
    if (titleEl) titleEl.textContent = `${student.name} - Details`;
    const contentEl = document.getElementById('studentDetailsContent');
    if (contentEl) contentEl.innerHTML = detailsHTML;
    const modalEl = document.getElementById('studentDetailsModal');
    if (modalEl) modalEl.style.display = 'block';
  } catch (error) {
    console.error('Failed to load student details:', error);
    LMSUtils.showNotification('Failed to load student details', 'error');
  }
}

// Reset student progress
async function resetStudentProgress(studentId) {
  if (!confirm("Are you sure you want to reset this student's progress? This action cannot be undone.")) {
    return;
  }
  try {
    // TODO: Implement reset progress API
    LMSUtils.showNotification('Student progress reset successfully', 'success');
  } catch (error) {
    console.error('Failed to reset student progress:', error);
    LMSUtils.showNotification('Failed to reset student progress', 'error');
  }
}

// Send notification to student
async function sendNotification(studentId) {
  const message = prompt('Enter message to send to student:');
  if (!message) return;

  try {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student || !student.phone) {
      LMSUtils.showNotification('Student phone number not found', 'error');
      return;
    }

    await LMSUtils.apiCall('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ phone: student.phone, message }),
    });

    LMSUtils.showNotification('Notification sent successfully', 'success');
  } catch (error) {
    console.error('Failed to send notification:', error);
    LMSUtils.showNotification('Failed to send notification', 'error');
  }
}

// Edit student
async function editStudent(studentId) {
  try {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) return;

    document.getElementById('editStudentId').value = student.id;
    document.getElementById('editStudentName').value = student.name;
    document.getElementById('editStudentEmail').value = student.email;
    document.getElementById('editStudentPhone').value = student.phone || '';
    document.getElementById('editStudentCourseRole').value = student.course_role || '';

    const modalEl = document.getElementById('editStudentModal');
    if (modalEl) modalEl.style.display = 'block';
  } catch (error) {
    console.error('Failed to load student for editing:', error);
    LMSUtils.showNotification('Failed to load student information', 'error');
  }
}

// Modal functions
function showCreateStudentModal() {
  const el = document.getElementById('createStudentModal');
  if (el) el.style.display = 'block';
}

function hideCreateStudentModal() {
  const el = document.getElementById('createStudentModal');
  if (el) el.style.display = 'none';
  const formEl = document.getElementById('createStudentForm');
  if (formEl) formEl.reset();
  const errEl = document.getElementById('createStudentError');
  if (errEl) errEl.style.display = 'none';
}

function hideStudentDetailsModal() {
  const el = document.getElementById('studentDetailsModal');
  if (el) el.style.display = 'none';
}

function hideEditStudentModal() {
  const el = document.getElementById('editStudentModal');
  if (el) el.style.display = 'none';
  const formEl = document.getElementById('editStudentForm');
  if (formEl) formEl.reset();
  const errEl = document.getElementById('editStudentError');
  if (errEl) errEl.style.display = 'none';
}

// Form handlers
const createFormEl = document.getElementById('createStudentForm');
if (createFormEl) {
  createFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const studentData = Object.fromEntries(formData.entries());
    studentData.role = 'student';

    const phoneInput = document.getElementById('studentPhone');
    if (phoneInput && phoneInput.dataset.cleanValue) {
      studentData.phone = phoneInput.dataset.cleanValue;
    } else if (studentData.phone) {
      studentData.phone = LMSUtils.formatPhone(studentData.phone);
    }

    try {
      await LMSUtils.apiCall('/users', {
        method: 'POST',
        body: JSON.stringify(studentData),
      });

      LMSUtils.showNotification('Student added successfully', 'success');
      hideCreateStudentModal();
      loadStudentsData();
    } catch (error) {
      const errEl = document.getElementById('createStudentError');
      if (errEl) {
        errEl.textContent = error.message;
        errEl.style.display = 'block';
      }
    }
  });
}

const editFormEl = document.getElementById('editStudentForm');
if (editFormEl) {
  editFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const studentData = Object.fromEntries(formData.entries());
    const studentId = studentData.id;
    delete studentData.id;

    const phoneInput = document.getElementById('editStudentPhone');
    if (phoneInput && phoneInput.dataset.cleanValue) {
      studentData.phone = phoneInput.dataset.cleanValue;
    } else if (studentData.phone) {
      studentData.phone = LMSUtils.formatPhone(studentData.phone);
    }

    try {
      await LMSUtils.apiCall(`/users/${studentId}`, {
        method: 'PUT',
        body: JSON.stringify(studentData),
      });

      LMSUtils.showNotification('Student updated successfully', 'success');
      hideEditStudentModal();
      loadStudentsData();
    } catch (error) {
      const errEl = document.getElementById('editStudentError');
      if (errEl) {
        errEl.textContent = error.message;
        errEl.style.display = 'block';
      }
    }
  });
}

// Delete student functions
let studentToDelete = null;

function confirmDeleteStudent(studentId, studentName) {
  studentToDelete = studentId;
  const msgEl = document.getElementById('deleteStudentMessage');
  if (msgEl) {
    msgEl.textContent = `Are you sure you want to delete "${studentName}"? This action cannot be undone and will remove all associated data.`;
  }
  const modalEl = document.getElementById('deleteStudentModal');
  if (modalEl) modalEl.style.display = 'block';
}

function hideDeleteStudentModal() {
  const el = document.getElementById('deleteStudentModal');
  if (el) el.style.display = 'none';
  studentToDelete = null;
}

async function deleteStudent() {
  if (!studentToDelete) return;
  try {
    await LMSUtils.apiCall(`/users/${studentToDelete}`, { method: 'DELETE' });
    LMSUtils.showNotification('Student deleted successfully', 'success');
    hideDeleteStudentModal();
    loadStudentsData();
  } catch (error) {
    LMSUtils.showNotification(`Failed to delete student: ${error.message}`, 'error');
  }
}

// Setup delete button event listener
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener('click', deleteStudent);
}

// Close modals when clicking outside
window.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});

// Initialize page when DOM loads
document.addEventListener('DOMContentLoaded', initStudentsPage);

