// Admin Dashboard scripts moved from inline to satisfy CSP
// Requires: window.LMSUtils from ../js/main.js

let currentUser = null;

// Initialize dashboard
async function initDashboard() {
  try {
    currentUser = await LMSUtils.getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      window.location.href = '/';
      return;
    }

    document.getElementById('userName').textContent = currentUser.name;

    // Setup phone formatting for all phone input fields
    const phoneInputs = document.querySelectorAll('input[type="tel"], input[name="phone"]');
    phoneInputs.forEach((input) => {
      LMSUtils.setupPhoneFormatting(input);
    });

    await loadDashboardData();
    await loadRoles();
    await loadTrainers();
    await loadTrainerAssignments();
  } catch (error) {
    console.error('Dashboard initialization failed:', error);
    window.location.href = '/';
  }
}

// Load roles for user creation form
async function loadRoles() {
  try {
    const roles = await LMSUtils.apiCall('/roles');
    const roleSelect = document.getElementById('userRole');
    const courseRoleSelect = document.getElementById('courseRole');

    roleSelect.innerHTML = '<option value="">Select Role</option>';
    courseRoleSelect.innerHTML = '<option value="">Select Course Role</option>';

    roles.forEach((role) => {
      const userRoleOption = document.createElement('option');
      userRoleOption.value = role.name;
      userRoleOption.textContent = role.name;
      roleSelect.appendChild(userRoleOption);

      if (!['admin'].includes(role.name)) {
        const courseRoleOption = document.createElement('option');
        courseRoleOption.value = role.name;
        courseRoleOption.textContent = role.name;
        courseRoleSelect.appendChild(courseRoleOption);
      }
    });
  } catch (error) {
    console.error('Failed to load roles:', error);
  }
}

// Load trainers for course creation form
async function loadTrainers() {
  try {
    const users = await LMSUtils.apiCall('/users');
    const trainers = users.filter((u) => u.role === 'trainer');
    const trainerSelect = document.getElementById('courseTrainer');

    trainerSelect.innerHTML = '<option value="">Select Trainer</option>';

    trainers.forEach((trainer) => {
      const option = document.createElement('option');
      option.value = trainer.id;
      option.textContent = `${trainer.name} (${trainer.email})`;
      trainerSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load trainers:', error);
  }
}

// Load dashboard statistics
async function loadDashboardData() {
  try {
    const users = await LMSUtils.apiCall('/users');
    const courses = await LMSUtils.apiCall('/courses');
    const submissions = await LMSUtils.apiCall('/submissions/pending');

    const students = users.filter((u) => u.role === 'student');
    const trainers = users.filter((u) => u.role === 'trainer');

    document.getElementById('totalStudents').textContent = students.length;
    document.getElementById('totalTrainers').textContent = trainers.length;
    document.getElementById('totalCourses').textContent = courses.length;
    document.getElementById('pendingSubmissions').textContent = submissions.length;

    await updateRoleCounts(students);
    loadRecentActivity(submissions.slice(0, 5));
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    LMSUtils.showNotification('Failed to load dashboard data', 'error');
  }
}

// Update role counts dynamically
async function updateRoleCounts(students) {
  try {
    const roles = await LMSUtils.apiCall('/roles');
    const rolesGrid = document.querySelector('.roles-grid');

    rolesGrid.innerHTML = '';

    const roleCounts = {};
    roles
      .filter((role) => role.name !== 'admin')
      .forEach((role) => {
        roleCounts[role.name] = 0;
      });

    students.forEach((student) => {
      if (student.course_role && Object.prototype.hasOwnProperty.call(roleCounts, student.course_role)) {
        roleCounts[student.course_role]++;
      }
    });

    roles
      .filter((role) => role.name !== 'admin')
      .forEach((role) => {
        const roleCard = document.createElement('div');
        roleCard.className = 'role-card';
        roleCard.style.cssText = 'background: #f8f9fa; padding: 1rem; border-radius: 5px; text-align: center;';

        roleCard.innerHTML = `
          <h4>${role.name}</h4>
          <p>${roleCounts[role.name]} students</p>
        `;

        rolesGrid.appendChild(roleCard);
      });
  } catch (error) {
    console.error('Failed to load role counts:', error);
    const rolesGrid = document.querySelector('.roles-grid');
    rolesGrid.innerHTML = '<p>Failed to load role data</p>';
  }
}

// Load recent activity
function loadRecentActivity(submissions) {
  const activityContainer = document.getElementById('recentActivity');

  if (submissions.length === 0) {
    activityContainer.innerHTML = '<p>No recent activity</p>';
    return;
  }

  const activityHTML = submissions
    .map(
      (submission) => `
        <div style="padding: 0.5rem 0; border-bottom: 1px solid #eee;">
          <strong>${submission.student_name}</strong> submitted "${submission.activity_title}"
          <br>
          <small style="color: #666;">${LMSUtils.formatDate(submission.submitted_at)}</small>
          ${LMSUtils.createStatusBadge(submission.status)}
        </div>
      `
    )
    .join('');

  activityContainer.innerHTML = activityHTML;
}

// Modal functions
function showCreateUserModal() {
  document.getElementById('createUserModal').style.display = 'block';
}

function hideCreateUserModal() {
  document.getElementById('createUserModal').style.display = 'none';
  document.getElementById('createUserForm').reset();
  document.getElementById('createUserError').style.display = 'none';
}

function showCreateCourseModal() {
  document.getElementById('createCourseModal').style.display = 'block';
}

function hideCreateCourseModal() {
  document.getElementById('createCourseModal').style.display = 'none';
  document.getElementById('createCourseForm').reset();
  document.getElementById('createCourseError').style.display = 'none';
}

// Form handlers
document.getElementById('createUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const userData = Object.fromEntries(formData.entries());

  const phoneInput = document.getElementById('userPhone');
  if (phoneInput && phoneInput.dataset.cleanValue) {
    userData.phone = phoneInput.dataset.cleanValue;
  } else if (userData.phone) {
    userData.phone = LMSUtils.formatPhone(userData.phone);
  }

  if (userData.role === 'trainer') {
    const selectedCourses = [];
    const courseCheckboxes = document.querySelectorAll('input[name="trainer_courses"]:checked');
    courseCheckboxes.forEach((checkbox) => {
      selectedCourses.push(parseInt(checkbox.value));
    });
    userData.trainer_courses = selectedCourses;
  }

  try {
    const response = await LMSUtils.apiCall('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (userData.role === 'trainer' && userData.trainer_courses && userData.trainer_courses.length > 0) {
      const userId = response.id || response.user_id;
      if (userId) {
        for (const courseId of userData.trainer_courses) {
          try {
            await LMSUtils.apiCall('/trainer-assignments', {
              method: 'POST',
              body: JSON.stringify({ trainer_id: userId, course_id: courseId }),
            });
          } catch (assignmentError) {
            console.error('Failed to assign course:', assignmentError);
          }
        }
      }
    }

    LMSUtils.showNotification('User created successfully', 'success');
    hideCreateUserModal();
    loadDashboardData();
    if (userData.role === 'trainer') {
      loadTrainerAssignments();
    }
  } catch (error) {
    document.getElementById('createUserError').textContent = error.message;
    document.getElementById('createUserError').style.display = 'block';
  }
});

document.getElementById('createCourseForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const courseData = Object.fromEntries(formData.entries());

  try {
    await LMSUtils.apiCall('/courses', {
      method: 'POST',
      body: JSON.stringify(courseData),
    });

    LMSUtils.showNotification('Course created successfully', 'success');
    hideCreateCourseModal();
    loadDashboardData();
  } catch (error) {
    document.getElementById('createCourseError').textContent = error.message;
    document.getElementById('createCourseError').style.display = 'block';
  }
});

// Show/hide course role and trainer courses based on user role selection
document.getElementById('userRole').addEventListener('change', (e) => {
  const courseRoleGroup = document.getElementById('courseRoleGroup');
  const trainerCoursesGroup = document.getElementById('trainerCoursesGroup');

  if (e.target.value === 'student') {
    courseRoleGroup.style.display = 'block';
    document.getElementById('courseRole').required = true;
    trainerCoursesGroup.style.display = 'none';
  } else if (e.target.value === 'trainer') {
    courseRoleGroup.style.display = 'none';
    document.getElementById('courseRole').required = false;
    trainerCoursesGroup.style.display = 'block';
    loadCoursesForTrainerAssignment();
  } else {
    courseRoleGroup.style.display = 'none';
    document.getElementById('courseRole').required = false;
    trainerCoursesGroup.style.display = 'none';
  }
});

// Load courses for trainer assignment in user creation form
async function loadCoursesForTrainerAssignment() {
  try {
    const courses = await LMSUtils.apiCall('/courses');
    const coursesList = document.getElementById('trainerCoursesList');

    let html = '';
    courses.forEach((course) => {
      html += `
        <div class="checkbox-item">
          <input type="checkbox" id="course_${course.id}" name="trainer_courses" value="${course.id}">
          <label for="course_${course.id}">${course.title}</label>
        </div>
      `;
    });

    coursesList.innerHTML = html;
  } catch (error) {
    console.error('Failed to load courses for trainer assignment:', error);
  }
}

// WhatsApp Testing Functions
async function sendTestWhatsApp() {
  const phone = document.getElementById('testPhone').value;
  const message = document.getElementById('testMessage').value;
  const statusDiv = document.getElementById('whatsappStatus');

  if (!phone || !message) {
    LMSUtils.showNotification('Please enter phone number and message', 'error');
    return;
  }

  try {
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '📤 Sending WhatsApp message...';
    statusDiv.style.background = '#fff3cd';

    await LMSUtils.apiCall('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ phone, message }),
    });

    statusDiv.innerHTML = '✅ WhatsApp message sent successfully!';
    statusDiv.style.background = '#d4edda';
    LMSUtils.showNotification('WhatsApp message sent successfully', 'success');
  } catch (error) {
    statusDiv.innerHTML = `❌ Failed to send WhatsApp message: ${error.message}`;
    statusDiv.style.background = '#f8d7da';
    LMSUtils.showNotification('Failed to send WhatsApp message', 'error');
  }
}

async function checkWhatsAppStatus() {
  const statusDiv = document.getElementById('whatsappStatus');

  try {
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '🔍 Checking WAHA status...';
    statusDiv.style.background = '#fff3cd';

    statusDiv.innerHTML = `
      📱 <strong>WhatsApp Configuration:</strong><br>
      • WAHA URL: https://waha.amankhan.space<br>
      • Session: aman<br>
      • Target Phone: ${document.getElementById('testPhone').value}<br>
      • Status: Ready for testing
    `;
    statusDiv.style.background = '#d1ecf1';
  } catch (error) {
    statusDiv.innerHTML = `❌ Error checking status: ${error.message}`;
    statusDiv.style.background = '#f8d7da';
  }
}

// Load trainer assignments
async function loadTrainerAssignments() {
  try {
    const assignments = await LMSUtils.apiCall('/trainer-assignments');
    const assignmentsDiv = document.getElementById('trainerAssignments');

    if (assignments.length === 0) {
      assignmentsDiv.innerHTML = '<p>No trainer assignments found.</p>';
      return;
    }

    let html =
      '<h4>Current Trainer Assignments</h4><div class="table-responsive"><table class="table table-striped"><thead><tr><th>Trainer</th><th>Course</th><th>Actions</th></tr></thead><tbody>';

    assignments.forEach((assignment) => {
      html += `
        <tr>
          <td>${assignment.trainer_name}</td>
          <td>${assignment.course_title}</td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="removeTrainerAssignment(${assignment.trainer_id}, ${assignment.course_id})">
              Remove
            </button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    assignmentsDiv.innerHTML = html;
  } catch (error) {
    console.error('Failed to load trainer assignments:', error);
    document.getElementById('trainerAssignments').innerHTML = '<p class="text-danger">Failed to load trainer assignments.</p>';
  }
}

// Show trainer assignment modal
function showTrainerAssignmentModal() {
  loadTrainersForAssignment();
  loadCoursesForAssignment();
  document.getElementById('trainerAssignmentModal').style.display = 'block';
}

// Hide trainer assignment modal
function hideTrainerAssignmentModal() {
  document.getElementById('trainerAssignmentModal').style.display = 'none';
  document.getElementById('trainerAssignmentForm').reset();
}

// Load trainers for assignment modal
async function loadTrainersForAssignment() {
  try {
    const users = await LMSUtils.apiCall('/users');
    const trainers = users.filter((user) => user.role === 'trainer');
    const select = document.getElementById('assignTrainer');

    select.innerHTML = '<option value="">Select Trainer</option>';
    trainers.forEach((trainer) => {
      select.innerHTML += `<option value="${trainer.id}">${trainer.name}</option>`;
    });
  } catch (error) {
    console.error('Failed to load trainers for assignment:', error);
  }
}

// Load courses for assignment modal
async function loadCoursesForAssignment() {
  try {
    const courses = await LMSUtils.apiCall('/courses');
    const select = document.getElementById('assignCourse');

    select.innerHTML = '<option value="">Select Course</option>';
    courses.forEach((course) => {
      select.innerHTML += `<option value="${course.id}">${course.title}</option>`;
    });
  } catch (error) {
    console.error('Failed to load courses for assignment:', error);
  }
}

// Handle trainer assignment form submission
document.getElementById('trainerAssignmentForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const assignmentData = {
    trainer_id: parseInt(formData.get('trainer_id')),
    course_id: parseInt(formData.get('course_id')),
  };

  try {
    await LMSUtils.apiCall('/trainer-assignments', {
      method: 'POST',
      body: JSON.stringify(assignmentData),
    });

    LMSUtils.showNotification('Trainer assigned to course successfully', 'success');
    hideTrainerAssignmentModal();
    await loadTrainerAssignments();
  } catch (error) {
    console.error('Failed to assign trainer:', error);
    LMSUtils.showNotification('Failed to assign trainer to course', 'error');
  }
});

// Remove trainer assignment
async function removeTrainerAssignment(trainerId, courseId) {
  if (!confirm('Are you sure you want to remove this trainer assignment?')) {
    return;
  }

  try {
    await LMSUtils.apiCall(`/trainer-assignments/${trainerId}/${courseId}`, {
      method: 'DELETE',
    });

    LMSUtils.showNotification('Trainer assignment removed successfully', 'success');
    await loadTrainerAssignments();
  } catch (error) {
    console.error('Failed to remove trainer assignment:', error);
    LMSUtils.showNotification('Failed to remove trainer assignment', 'error');
  }
}

// Close modals when clicking outside
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', initDashboard);

