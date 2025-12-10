// Externalized Trainers page logic
// Depends on LMSUtils, DOMUtils from ../js/main.js

let currentUser = null;
let allTrainers = [];
let filteredTrainers = [];
let allCourses = [];

// Load courses for dropdowns
async function loadCourses() {
  try {
    const courses = await LMSUtils.apiCall('/courses');
    allCourses = courses;

    const courseSelects = ['trainerCourses', 'editTrainerCourses'];
    courseSelects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        select.innerHTML = '';
        courses.forEach(course => {
          const option = document.createElement('option');
          option.value = course.id;
          option.textContent = `${course.title} (${course.role_name})`;
          select.appendChild(option);
        });
      }
    });
  } catch (error) {
    console.error('Failed to load courses:', error);
  }
}

// Load trainers
async function loadTrainers() {
  try {
    const users = await LMSUtils.apiCall('/users');
    allTrainers = users.filter(user => user.role === 'trainer');

    // Load trainer assignments
    const assignments = await LMSUtils.apiCall('/trainer-assignments');

    // Map assignments to trainers
    allTrainers.forEach(trainer => {
      trainer.assignedCourses = assignments
        .filter(assignment => assignment.trainer_id === trainer.id)
        .map(assignment => {
          const course = allCourses.find(c => c.id === assignment.course_id);
          return course ? course.title : 'Unknown Course';
        });
    });

    filteredTrainers = [...allTrainers];
    renderTrainers();
    updateStats();
  } catch (error) {
    console.error('Failed to load trainers:', error);
    const container = document.getElementById('trainersTableContainer');
    if (container) container.innerHTML = '<p class="text-danger">Failed to load trainers.</p>';
  }
}

// Render trainers table
function renderTrainers() {
  const container = document.getElementById('trainersTableContainer');
  if (!container) return;

  if (filteredTrainers.length === 0) {
    container.innerHTML = '<p>No trainers found.</p>';
    return;
  }

  const tableHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th>Specialization</th>
          <th>Experience</th>
          <th>Assigned Courses</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredTrainers.map(trainer => {
          const coursesText = trainer.assignedCourses && trainer.assignedCourses.length > 0
            ? trainer.assignedCourses.slice(0, 2).join(', ') + (trainer.assignedCourses.length > 2 ? '...' : '')
            : 'No courses assigned';

          return `
            <tr>
              <td><strong>${trainer.name}</strong></td>
              <td>${trainer.email}</td>
              <td>${trainer.phone || 'N/A'}</td>
              <td>
                ${trainer.specialization ?
                  `<span class="status-badge status-completed">${trainer.specialization}</span>` :
                  '<span class="status-badge status-pending">No Specialization</span>'
                }
              </td>
              <td>${trainer.experience ? trainer.experience + ' years' : 'N/A'}</td>
              <td>${coursesText}</td>
              <td>
                <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-right: 0.5rem;"
                        data-action="show-trainer-details" data-trainer-id="${trainer.id}">
                  View Details
                </button>
                <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-right: 0.5rem;"
                        data-action="show-edit-trainer" data-trainer-id="${trainer.id}">
                  Edit
                </button>
                <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;"
                        data-action="show-delete-trainer" data-trainer-id="${trainer.id}">
                  Delete
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  container.innerHTML = tableHTML;
}

// Update statistics
function updateStats() {
  const totalEl = document.getElementById('totalTrainers');
  const activeEl = document.getElementById('activeTrainers');
  const assignedEl = document.getElementById('assignedCourses');
  const studentsEl = document.getElementById('totalStudents');

  if (totalEl) totalEl.textContent = allTrainers.length;
  if (activeEl) activeEl.textContent = allTrainers.filter(t => t.status !== 'inactive').length;

  const totalAssignedCourses = allTrainers.reduce((sum, trainer) => {
    return sum + (trainer.assignedCourses ? trainer.assignedCourses.length : 0);
  }, 0);
  if (assignedEl) assignedEl.textContent = totalAssignedCourses;

  if (studentsEl) studentsEl.textContent = '0';
}

// Search and filter functionality
function filterTrainers() {
  const searchInput = document.getElementById('searchInput');
  const statusSelect = document.getElementById('statusFilter');
  const searchTerm = (searchInput?.value || '').toLowerCase();
  const statusFilter = statusSelect?.value || '';

  filteredTrainers = allTrainers.filter(trainer => {
    const matchesSearch = trainer.name.toLowerCase().includes(searchTerm) ||
      trainer.email.toLowerCase().includes(searchTerm) ||
      (trainer.specialization && trainer.specialization.toLowerCase().includes(searchTerm));

    const matchesStatus = !statusFilter || trainer.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  renderTrainers();
}

// Modal functions
function showCreateTrainerModal() {
  const modal = document.getElementById('createTrainerModal');
  if (modal) modal.style.display = 'block';
  loadCourses();
}

function hideCreateTrainerModal() {
  const modal = document.getElementById('createTrainerModal');
  const form = document.getElementById('createTrainerForm');
  const error = document.getElementById('createTrainerError');
  if (modal) modal.style.display = 'none';
  if (form) form.reset();
  if (error) error.style.display = 'none';
}

function showEditTrainerModal(trainerId) {
  const trainer = allTrainers.find(t => t.id === trainerId);
  if (!trainer) return;

  document.getElementById('editTrainerId').value = trainer.id;
  document.getElementById('editTrainerName').value = trainer.name;
  document.getElementById('editTrainerEmail').value = trainer.email;
  document.getElementById('editTrainerPhone').value = trainer.phone || '';
  document.getElementById('editTrainerSpecialization').value = trainer.specialization || '';
  document.getElementById('editTrainerExperience').value = trainer.experience || '';

  // Load courses and select assigned ones
  loadCourses().then(() => {
    const courseSelect = document.getElementById('editTrainerCourses');
    LMSUtils.apiCall('/trainer-assignments').then(assignments => {
      const trainerAssignments = assignments.filter(a => a.trainer_id === trainerId);
      const assignedCourseIds = trainerAssignments.map(a => a.course_id.toString());

      Array.from(courseSelect.options).forEach(option => {
        option.selected = assignedCourseIds.includes(option.value);
      });
    });
  });

  const modal = document.getElementById('editTrainerModal');
  if (modal) modal.style.display = 'block';
}

function hideEditTrainerModal() {
  const modal = document.getElementById('editTrainerModal');
  const form = document.getElementById('editTrainerForm');
  const error = document.getElementById('editTrainerError');
  if (modal) modal.style.display = 'none';
  if (form) form.reset();
  if (error) error.style.display = 'none';
}

function showTrainerDetails(trainerId) {
  const trainer = allTrainers.find(t => t.id === trainerId);
  if (!trainer) return;

  document.getElementById('trainerDetailsTitle').textContent = `${trainer.name} - Details`;

  let html = `
    <div class="trainer-details">
      <div class="detail-section">
        <h4>Personal Information</h4>
        <p><strong>Name:</strong> ${trainer.name}</p>
        <p><strong>Email:</strong> ${trainer.email}</p>
        <p><strong>Phone:</strong> ${trainer.phone || 'N/A'}</p>
        <p><strong>Specialization:</strong> ${trainer.specialization || 'N/A'}</p>
        <p><strong>Experience:</strong> ${trainer.experience ? trainer.experience + ' years' : 'N/A'}</p>
      </div>

      <div class="detail-section">
        <h4>Assigned Courses</h4>
  `;

  if (trainer.assignedCourses && trainer.assignedCourses.length > 0) {
    html += '<ul>';
    trainer.assignedCourses.forEach(course => {
      html += `<li>${course}</li>`;
    });
    html += '</ul>';
  } else {
    html += '<p>No courses assigned</p>';
  }

  html += `
      </div>
    </div>
  `;

  document.getElementById('trainerDetailsContent').innerHTML = html;
  document.getElementById('trainerDetailsModal').style.display = 'block';
}

function hideTrainerDetailsModal() {
  const modal = document.getElementById('trainerDetailsModal');
  if (modal) modal.style.display = 'none';
}

function showDeleteTrainerModal(trainerId) {
  const trainer = allTrainers.find(t => t.id === trainerId);
  if (!trainer) return;

  document.getElementById('deleteTrainerMessage').textContent =
    `Are you sure you want to delete trainer "${trainer.name}"? This action cannot be undone.`;

  const confirmBtn = document.getElementById('confirmDeleteBtn');
  if (confirmBtn) confirmBtn.dataset.trainerId = String(trainerId);
  const modal = document.getElementById('deleteTrainerModal');
  if (modal) modal.style.display = 'block';
}

function hideDeleteTrainerModal() {
  const modal = document.getElementById('deleteTrainerModal');
  if (modal) modal.style.display = 'none';
}

// CRUD operations
async function deleteTrainer(trainerId) {
  try {
    await LMSUtils.apiCall(`/users/${trainerId}`, { method: 'DELETE' });
    hideDeleteTrainerModal();
    loadTrainers();
    LMSUtils.showNotification('Trainer deleted successfully', 'success');
  } catch (error) {
    console.error('Failed to delete trainer:', error);
    LMSUtils.showNotification('Failed to delete trainer', 'error');
  }
}

// Form submissions
document.addEventListener('DOMContentLoaded', () => {
  const createForm = document.getElementById('createTrainerForm');
  const editForm = document.getElementById('editTrainerForm');

  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(e.target);
      const trainerData = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        password: formData.get('password'),
        role: 'trainer',
        specialization: formData.get('specialization'),
        experience: formData.get('experience'),
        trainer_courses: Array.from(document.getElementById('trainerCourses').selectedOptions).map(option => option.value)
      };

      try {
        await LMSUtils.apiCall('/users', {
          method: 'POST',
          body: JSON.stringify(trainerData)
        });

        hideCreateTrainerModal();
        loadTrainers();
        LMSUtils.showNotification('Trainer created successfully', 'success');
      } catch (error) {
        console.error('Failed to create trainer:', error);
        const errorEl = document.getElementById('createTrainerError');
        if (errorEl) {
          errorEl.textContent = error.message;
          errorEl.style.display = 'block';
        }
      }
    });
  }

  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(e.target);
      const trainerId = formData.get('id');
      const trainerData = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        specialization: formData.get('specialization'),
        experience: formData.get('experience'),
        trainer_courses: Array.from(document.getElementById('editTrainerCourses').selectedOptions).map(option => option.value)
      };

      try {
        await LMSUtils.apiCall(`/users/${trainerId}`, {
          method: 'PUT',
          body: JSON.stringify(trainerData)
        });

        hideEditTrainerModal();
        loadTrainers();
        LMSUtils.showNotification('Trainer updated successfully', 'success');
      } catch (error) {
        console.error('Failed to update trainer:', error);
        const errorEl = document.getElementById('editTrainerError');
        if (errorEl) {
          errorEl.textContent = error.message;
          errorEl.style.display = 'block';
        }
      }
    });
  }

  // Event listeners
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', filterTrainers);
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', filterTrainers);

  // Logout buttons are wired by main.js, but keep a fallback
  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await LMSUtils.logout();
    });
  });

  // Initialize page
  (async () => {
    try {
      currentUser = await LMSUtils.getCurrentUser();
      if (currentUser) {
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = currentUser.name;
        await loadCourses();
        await loadTrainers();
      }
    } catch (error) {
      console.error('Failed to initialize page:', error);
    }
  })();

  // CSP-safe global click delegation for trainer actions
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    switch (action) {
      case 'show-create-trainer':
        e.preventDefault();
        showCreateTrainerModal();
        break;
      case 'hide-create-trainer-modal':
        e.preventDefault();
        hideCreateTrainerModal();
        break;
      case 'hide-edit-trainer-modal':
        e.preventDefault();
        hideEditTrainerModal();
        break;
      case 'hide-trainer-details-modal':
        e.preventDefault();
        hideTrainerDetailsModal();
        break;
      case 'hide-delete-trainer-modal':
        e.preventDefault();
        hideDeleteTrainerModal();
        break;
      case 'show-edit-trainer': {
        e.preventDefault();
        const id = parseInt(el.dataset.trainerId);
        if (!Number.isNaN(id)) showEditTrainerModal(id);
        break;
      }
      case 'show-trainer-details': {
        e.preventDefault();
        const id = parseInt(el.dataset.trainerId);
        if (!Number.isNaN(id)) showTrainerDetails(id);
        break;
      }
      case 'show-delete-trainer': {
        e.preventDefault();
        const id = parseInt(el.dataset.trainerId);
        if (!Number.isNaN(id)) showDeleteTrainerModal(id);
        break;
      }
      case 'confirm-delete-trainer': {
        e.preventDefault();
        const id = parseInt(el.dataset.trainerId);
        if (!Number.isNaN(id)) deleteTrainer(id);
        break;
      }
      default:
        break;
    }
  });
});

// Export to window for inline HTML handlers
window.showCreateTrainerModal = showCreateTrainerModal;
window.hideCreateTrainerModal = hideCreateTrainerModal;
window.showEditTrainerModal = showEditTrainerModal;
window.hideEditTrainerModal = hideEditTrainerModal;
window.showTrainerDetails = showTrainerDetails;
window.hideTrainerDetailsModal = hideTrainerDetailsModal;
window.showDeleteTrainerModal = showDeleteTrainerModal;
window.hideDeleteTrainerModal = hideDeleteTrainerModal;
window.deleteTrainer = deleteTrainer;
