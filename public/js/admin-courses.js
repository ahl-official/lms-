// Admin Courses Page Script (externalized from courses.html)
// Relies on LMSUtils from ../js/main.js

let currentUser = null;
let allCourses = [];
let allVideos = [];
let filteredCourses = [];
let questionCounter = 0;
let videoToDelete = null;
let courseToDelete = null;

// Load roles for dropdowns
async function loadRoles() {
  try {
    const roles = await LMSUtils.apiCall('/roles');

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

    const courseRoleName = document.getElementById('courseRoleName');
    if (courseRoleName) {
      while (courseRoleName.children.length > 1) {
        courseRoleName.removeChild(courseRoleName.lastChild);
      }
      roles
        .filter((role) => role.name !== 'admin')
        .forEach((role) => {
          const option = document.createElement('option');
          option.value = role.name;
          option.textContent = role.name;
          courseRoleName.appendChild(option);
        });
    }
  } catch (error) {
    console.error('Failed to load roles:', error);
  }
}

// Initialize page
async function initCoursesPage() {
  try {
    currentUser = await LMSUtils.getCurrentUser();

    // If not authenticated, getCurrentUser will redirect and return null
    if (!currentUser) {
      return;
    }

    if (currentUser.role !== 'admin') {
      window.location.href = '/';
      return;
    }

    document.getElementById('userName').textContent = currentUser.name;

    await loadRoles();
    await loadCoursesData();
    setupEventListeners();
  } catch (error) {
    console.error('Courses page initialization failed:', error);
    window.location.href = '/';
  }
}

// Load courses data
async function loadCoursesData() {
  try {
    allCourses = await LMSUtils.apiCall('/courses');
    filteredCourses = [...allCourses];

    for (let course of allCourses) {
      const structureData = await LMSUtils.apiCall(`/courses/${course.id}/structure`);
      const { structure: preparedStructure, lessons } = prepareCourseStructure(structureData);
      course.structure = preparedStructure;
      course.videos = lessons;
    }

    updateStatistics();
    renderCourses();
  } catch (error) {
    console.error('Failed to load courses data:', error);
    LMSUtils.showNotification('Failed to load courses data', 'error');
  }
}

function prepareCourseStructure(structure) {
  if (!structure) {
    return {
      structure: { levels: [], unassignedLessons: [] },
      lessons: [],
    };
  }

  const preparedLevels = (structure.levels || []).map((level, levelIndex) => {
    const levelSequence = level.sequence ?? levelIndex + 1;
    const preparedChapters = (level.chapters || []).map((chapter, chapterIndex) => {
      const chapterSequence = chapter.sequence ?? chapterIndex + 1;
      const preparedLessons = (chapter.lessons || []).map((lesson, lessonIndex) => ({
        ...lesson,
        level_id: level.id,
        level_title: level.title,
        level_sequence: levelSequence,
        chapter_id: chapter.id,
        chapter_title: chapter.title,
        chapter_sequence: chapterSequence,
        lesson_number: lessonIndex + 1,
      }));
      return {
        ...chapter,
        sequence: chapterSequence,
        lessons: preparedLessons,
      };
    });
    return {
      ...level,
      sequence: levelSequence,
      chapters: preparedChapters,
    };
  });

  const lessons = [];
  preparedLevels.forEach((level) => {
    level.chapters.forEach((chapter) => {
      chapter.lessons.forEach((lesson) => lessons.push(lesson));
    });
  });

  const unassigned = (structure.unassignedLessons || []).map((lesson, index) => ({
    ...lesson,
    level_id: null,
    level_title: 'Unassigned',
    level_sequence: 9999,
    chapter_id: null,
    chapter_title: 'Unassigned',
    chapter_sequence: 9999,
    lesson_number: index + 1,
  }));

  lessons.push(...unassigned);

  return {
    structure: {
      ...structure,
      levels: preparedLevels,
      unassignedLessons: unassigned,
    },
    lessons,
  };
}

// Update statistics
async function updateStatistics() {
  const totalCourses = allCourses.length;
  const totalVideos = allCourses.reduce((sum, course) => sum + (course.videos?.length || 0), 0);

  document.getElementById('totalCourses').textContent = totalCourses;
  document.getElementById('totalVideos').textContent = totalVideos;

  try {
    const activitiesData = await LMSUtils.apiCall('/activities/count');
    document.getElementById('totalActivities').textContent = activitiesData.count || 0;

    const studentsData = await LMSUtils.apiCall('/students/count');
    document.getElementById('enrolledStudents').textContent = studentsData.count || 0;
  } catch (error) {
    console.error('Failed to load statistics:', error);
    document.getElementById('totalActivities').textContent = '0';
    document.getElementById('enrolledStudents').textContent = '0';
  }
}

// Render courses
function renderCourses() {
  const container = document.getElementById('coursesContainer');

  if (filteredCourses.length === 0) {
    container.innerHTML = '<p>No courses found.</p>';
    return;
  }

  const coursesHTML = filteredCourses
    .map((course) => {
      const levelCount = course.structure?.levels?.length || 0;
      const chapterCount =
        course.structure?.levels?.reduce((sum, level) => sum + (level.chapters?.length || 0), 0) || 0;
      const lessonCount = course.videos?.length || 0;
      const trainerName = course.trainer_name || 'Not Assigned';
      const safeCourseTitle = JSON.stringify(course.title);

      const videoItemsHtml =
        lessonCount > 0
          ? course.videos
              .map((video) => {
                const safeVideoTitle = JSON.stringify(video.title);
                const safeGumletUrl = JSON.stringify(video.gumlet_url || '');
                const levelLabel =
                  video.level_sequence && video.level_sequence !== 9999
                    ? `Level ${video.level_sequence}: ${video.level_title}`
                    : 'Unassigned Level';
                const chapterLabel =
                  video.chapter_sequence && video.chapter_sequence !== 9999
                    ? `Chapter ${video.level_sequence}.${video.chapter_sequence}: ${video.chapter_title}`
                    : 'Unassigned Chapter';

                return `
                            <div class="video-item" style="background: #f8f9fa; padding: 1rem; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong>${video.sequence}. ${video.title}</strong>
                                    <br>
                                    <small style="color: #666;">${levelLabel} • ${chapterLabel}</small>
                                    <br>
                                    <small style="color: #999;">${video.gumlet_url || ''}</small>
                                </div>
                                <div class="video-actions" style="position: relative; display: inline-block;">
                            <button class="btn btn-secondary" style="padding: 0.3rem 0.75rem;" data-action="toggle-video-dropdown" data-video-id="${video.id}">Actions ▾</button>
                                    <div class="dropdown-menu" id="videoDropdownMenu${video.id}" style="display: none; position: absolute; right: 0; top: 100%; background: white; border: 1px solid #ddd; border-radius: 5px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); min-width: 180px; overflow: hidden;">
                            <a class="dropdown-item" href="#" data-action="transcribe-video" data-video-id="${video.id}" data-video-title="${safeVideoTitle}" style="display: block; padding: 0.5rem 1rem; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">Get Transcript</a>
                            <a class="dropdown-item" href="#" data-action="view-transcript" data-video-id="${video.id}" data-video-title="${safeVideoTitle}" style="display: block; padding: 0.5rem 1rem; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">View Transcript</a>
                            <a class="dropdown-item" href="#" data-action="generate-ai-content" data-video-id="${video.id}" data-video-title="${safeVideoTitle}" style="display: block; padding: 0.5rem 1rem; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">AI Generate</a>
                            <a class="dropdown-item" href="#" data-action="create-test" data-video-id="${video.id}" data-video-title="${safeVideoTitle}" style="display: block; padding: 0.5rem 1rem; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">Create Test</a>
                            <a class="dropdown-item" href="#" data-action="add-activity" data-video-id="${video.id}" data-video-title="${safeVideoTitle}" style="display: block; padding: 0.5rem 1rem; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">Add Activity</a>
                            <a class="dropdown-item" href="#" data-action="preview-video" data-video-id="${video.id}" data-video-title="${safeVideoTitle}" data-gumlet-url="${safeGumletUrl}" style="display: block; padding: 0.5rem 1rem; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">Preview</a>
                            <a class="dropdown-item" href="#" data-action="edit-video" data-video-id="${video.id}" data-video-title="${safeVideoTitle}" data-gumlet-url="${safeGumletUrl}" data-sequence="${video.sequence}" data-course-id="${course.id}" data-level-id="${video.level_id ?? ''}" data-chapter-id="${video.chapter_id ?? ''}" style="display: block; padding: 0.5rem 1rem; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">Edit</a>
                            <a class="dropdown-item" href="#" data-action="confirm-delete-video" data-video-id="${video.id}" data-video-title="${safeVideoTitle}" style="display: block; padding: 0.5rem 1rem; text-decoration: none; color: #dc3545;">Delete</a>
                                    </div>
                                </div>
                            </div>
                        `;
              })
              .join('')
          : '<p style="color: #777; margin: 1rem 0;">No lessons in this course yet.</p>';

      return `
                    <div class="card" style="margin-bottom: 1rem;">
                        <div class="flex justify-between align-center mb-1">
                            <div>
                                <h4>${course.title}</h4>
                                <p style="color: #666; margin: 0.5rem 0;">
                                    <strong>Role:</strong> ${course.role_name} |
                                    <strong>Levels:</strong> ${levelCount} |
                                    <strong>Chapters:</strong> ${chapterCount} |
                                    <strong>Lessons:</strong> ${lessonCount} |
                                    <strong>Created:</strong> ${LMSUtils.formatDate(course.created_at)} |
                                    <strong>Trainer:</strong> ${trainerName}
                                </p>
                            </div>
                            <div class="flex gap-1" style="flex-wrap: wrap; justify-content: flex-end;">
                <button class="btn btn-secondary" style="padding: 0.5rem 1rem;" data-action="add-level" data-course-id="${course.id}" data-course-title="${safeCourseTitle}">Add Level</button>
                <button class="btn btn-secondary" style="padding: 0.5rem 1rem;" data-action="add-chapter" data-course-id="${course.id}" data-course-title="${safeCourseTitle}">Add Chapter</button>
                <button class="btn btn-primary" style="padding: 0.5rem 1rem;" data-action="add-video" data-course-id="${course.id}" data-course-title="${safeCourseTitle}">Add Lesson</button>
                <button class="btn btn-danger" style="padding: 0.5rem 1rem;" data-action="confirm-delete-course" data-course-id="${course.id}" data-course-title="${safeCourseTitle}">Delete Course</button>
                            </div>
                        </div>
                        <div class="videos-list">
                            <h5 style="margin: 1rem 0 0.5rem 0;">Lessons:</h5>
                            <div style="display: grid; gap: 0.5rem;">
                                ${videoItemsHtml}
                            </div>
                        </div>
                    </div>
                `;
    })
    .join('');

  container.innerHTML = coursesHTML;
}

// Setup event listeners
function setupEventListeners() {
  const roleFilter = document.getElementById('roleFilter');
  roleFilter.addEventListener('change', filterCourses);
}

// CSP-safe global click delegation to replace inline handlers
function setupCSPDelegation() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    try {
      switch (action) {
        case 'view-pending-ai':
          viewPendingAIContent();
          break;
        case 'show-create-course':
          showCreateCourseModal();
          break;
        case 'hide-modal': {
          const targetId = el.dataset.target;
          if (targetId) {
            const modal = document.getElementById(targetId);
            if (modal) modal.style.display = 'none';
          }
          break;
        }
        case 'add-question':
          addQuestion();
          break;

        // Video actions dropdown and items
        case 'toggle-video-dropdown':
          toggleVideoDropdown(parseInt(el.dataset.videoId));
          break;
        case 'transcribe-video':
          transcribeVideo(parseInt(el.dataset.videoId), el.dataset.videoTitle);
          hideVideoDropdown(parseInt(el.dataset.videoId));
          break;
        case 'view-transcript':
          viewTranscript(parseInt(el.dataset.videoId), el.dataset.videoTitle);
          hideVideoDropdown(parseInt(el.dataset.videoId));
          break;
        case 'generate-ai-content':
          generateAIContent(parseInt(el.dataset.videoId), el.dataset.videoTitle);
          hideVideoDropdown(parseInt(el.dataset.videoId));
          break;
        case 'generate-content': {
          const type = el.dataset.type;
          if (type) {
            generateContent(type, el);
          }
          break;
        }
        case 'create-test':
          createTest(parseInt(el.dataset.videoId), el.dataset.videoTitle);
          hideVideoDropdown(parseInt(el.dataset.videoId));
          break;
        case 'add-activity':
          addActivity(parseInt(el.dataset.videoId), el.dataset.videoTitle);
          hideVideoDropdown(parseInt(el.dataset.videoId));
          break;
        case 'preview-video':
          previewVideo(parseInt(el.dataset.videoId), el.dataset.videoTitle, el.dataset.gumletUrl);
          hideVideoDropdown(parseInt(el.dataset.videoId));
          break;
        case 'edit-video':
          editVideo(
            parseInt(el.dataset.videoId),
            el.dataset.videoTitle,
            el.dataset.gumletUrl,
            parseInt(el.dataset.sequence),
            parseInt(el.dataset.courseId),
            el.dataset.levelId ? parseInt(el.dataset.levelId) : null,
            el.dataset.chapterId ? parseInt(el.dataset.chapterId) : null,
          );
          hideVideoDropdown(parseInt(el.dataset.videoId));
          break;
        case 'confirm-delete-video':
          confirmDeleteVideo(parseInt(el.dataset.videoId), el.dataset.videoTitle);
          hideVideoDropdown(parseInt(el.dataset.videoId));
          break;

        // Course-level actions
        case 'add-level':
          addLevel(parseInt(el.dataset.courseId), el.dataset.courseTitle);
          break;
        case 'add-chapter':
          addChapter(parseInt(el.dataset.courseId), el.dataset.courseTitle);
          break;
        case 'add-video':
          addVideo(parseInt(el.dataset.courseId), el.dataset.courseTitle);
          break;
        case 'confirm-delete-course':
          confirmDeleteCourse(parseInt(el.dataset.courseId), el.dataset.courseTitle);
          break;

        // Form builder
        case 'remove-question':
          removeQuestion(el);
          break;

        // Preview sections
        case 'delete-activity':
          deleteActivity(parseInt(el.dataset.activityId), parseInt(el.dataset.videoId));
          break;
        case 'delete-test':
          deleteTest(parseInt(el.dataset.testId), parseInt(el.dataset.videoId));
          break;

        // AI Review
        case 'review-ai':
          reviewAIContent(parseInt(el.dataset.contentId), el.dataset.status);
          break;
        case 'request-update':
          requestContentUpdate(parseInt(el.dataset.contentId));
          break;
      }
    } catch (err) {
      console.error('Action handler failed:', action, err);
    }
  });
}

// Filter courses
function filterCourses() {
  const roleFilter = document.getElementById('roleFilter').value;
  filteredCourses = allCourses.filter((course) => {
    return !roleFilter || course.role_name === roleFilter;
  });
  renderCourses();
}

// Add video to course
function addVideo(courseId, courseTitle) {
  const course = allCourses.find((c) => c.id === courseId);
  const levelSelect = document.getElementById('videoLevel');
  const chapterSelect = document.getElementById('videoChapter');
  const addVideoError = document.getElementById('addVideoError');

  if (!course || !course.structure) {
    LMSUtils.showNotification('Course structure not loaded yet. Please try again in a moment.', 'warning');
    return;
  }

  if (!Array.isArray(course.structure.levels) || course.structure.levels.length === 0) {
    LMSUtils.showNotification('Add a level before creating lessons.', 'warning');
    addLevel(courseId, courseTitle);
    return;
  }

  const hasChapters = course.structure.levels.some(
    (level) => Array.isArray(level.chapters) && level.chapters.length > 0,
  );
  if (!hasChapters) {
    LMSUtils.showNotification('Add at least one chapter before creating lessons.', 'warning');
    addChapter(courseId, courseTitle);
    return;
  }

  document.getElementById('videoCourseId').value = courseId;
  document.getElementById('addVideoTitle').textContent = `Add Video to ${courseTitle}`;
  document.getElementById('videoSequence').value = (course.videos?.length || 0) + 1;

  levelSelect.innerHTML = '<option value="">Select Level</option>';
  chapterSelect.innerHTML = '<option value="">Select Chapter</option>';
  addVideoError.style.display = 'none';

  const updateChapterOptions = (levelId) => {
    chapterSelect.innerHTML = '<option value="">Select Chapter</option>';
    const selectedLevel = course.structure.levels.find((level) => level.id === parseInt(levelId));
    if (selectedLevel && Array.isArray(selectedLevel.chapters) && selectedLevel.chapters.length > 0) {
      selectedLevel.chapters.forEach((chapter) => {
        const option = document.createElement('option');
        option.value = chapter.id;
        option.textContent = `Chapter ${selectedLevel.sequence}.${chapter.sequence}: ${chapter.title}`;
        chapterSelect.appendChild(option);
      });
      chapterSelect.disabled = false;
      chapterSelect.value = String(selectedLevel.chapters[0].id);
    } else {
      chapterSelect.disabled = true;
      chapterSelect.value = '';
    }
  };

  course.structure.levels.forEach((level) => {
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = `Level ${level.sequence}: ${level.title}`;
    levelSelect.appendChild(option);
  });

  levelSelect.onchange = (event) => {
    updateChapterOptions(event.target.value);
    chapterSelect.value = '';
  };

  levelSelect.value = String(course.structure.levels[0].id);
  updateChapterOptions(levelSelect.value);

  document.getElementById('addVideoModal').style.display = 'block';
}

function addLevel(courseId, courseTitle) {
  const course = allCourses.find((c) => c.id === courseId);
  document.getElementById('levelCourseId').value = courseId;
  document.getElementById('addLevelTitle').textContent = `Add Level to ${courseTitle}`;
  const nextSequence = (course?.structure?.levels?.length || 0) + 1;
  document.getElementById('levelSequence').value = nextSequence;
  document.getElementById('levelTitle').value = '';
  document.getElementById('levelDescription').value = '';
  document.getElementById('addLevelError').style.display = 'none';
  document.getElementById('addLevelModal').style.display = 'block';
}

function hideAddLevelModal() {
  document.getElementById('addLevelModal').style.display = 'none';
  document.getElementById('addLevelForm').reset();
  document.getElementById('addLevelError').style.display = 'none';
}

function addChapter(courseId, courseTitle) {
  const course = allCourses.find((c) => c.id === courseId);
  if (!course || !course.structure || !course.structure.levels || course.structure.levels.length === 0) {
    LMSUtils.showNotification('Please create a level before adding chapters.', 'warning');
    return;
  }

  document.getElementById('chapterCourseId').value = courseId;
  document.getElementById('addChapterTitle').textContent = `Add Chapter to ${courseTitle}`;
  document.getElementById('chapterTitle').value = '';
  document.getElementById('chapterDescription').value = '';
  document.getElementById('addChapterError').style.display = 'none';

  const levelSelect = document.getElementById('chapterLevelSelect');
  levelSelect.innerHTML = '<option value="">Select Level</option>';

  const updateChapterSequence = () => {
    const selectedLevelId = parseInt(levelSelect.value);
    const selectedLevel = course.structure.levels.find((level) => level.id === selectedLevelId);
    const nextSequence = selectedLevel ? (selectedLevel.chapters?.length || 0) + 1 : '';
    document.getElementById('chapterSequence').value = nextSequence;
  };

  course.structure.levels.forEach((level) => {
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = `Level ${level.sequence}: ${level.title}`;
    levelSelect.appendChild(option);
  });

  levelSelect.onchange = updateChapterSequence;
  levelSelect.value = String(course.structure.levels[0].id);
  updateChapterSequence();

  document.getElementById('addChapterModal').style.display = 'block';
}

function hideAddChapterModal() {
  document.getElementById('addChapterModal').style.display = 'none';
  document.getElementById('addChapterForm').reset();
  document.getElementById('addChapterError').style.display = 'none';
  document.getElementById('chapterLevelSelect').innerHTML = '<option value="">Select Level</option>';
}

// Create test for video
function createTest(videoId, videoTitle) {
  document.getElementById('testVideoId').value = videoId;
  document.getElementById('createTestTitle').textContent = `Create Test for ${videoTitle}`;
  document.getElementById('testTitle').value = `${videoTitle} - Test`;

  document.getElementById('questionsContainer').innerHTML = '';
  questionCounter = 0;
  addQuestion();

  document.getElementById('createTestModal').style.display = 'block';
}

// Add question to test
function addQuestion() {
  questionCounter++;
  const container = document.getElementById('questionsContainer');

  const questionDiv = document.createElement('div');
  questionDiv.className = 'question-item';
  questionDiv.style.cssText =
    'border: 1px solid #ddd; padding: 1rem; margin-bottom: 1rem; border-radius: 5px; background: #f8f9fa;';
  questionDiv.innerHTML = `
                <div class="flex justify-between align-center mb-1">
                    <h5>Question ${questionCounter}</h5>
            <button type="button" class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" data-action="remove-question">Remove</button>
                </div>
                <div class="form-group">
                    <label>Question:</label>
                    <input type="text" name="question_${questionCounter}" required placeholder="Enter your question..." style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 3px;">
                </div>
                <div class="form-group">
                    <label>Option A:</label>
                    <input type="text" name="option_a_${questionCounter}" required placeholder="Option A" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 3px;">
                </div>
                <div class="form-group">
                    <label>Option B:</label>
                    <input type="text" name="option_b_${questionCounter}" required placeholder="Option B" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 3px;">
                </div>
                <div class="form-group">
                    <label>Option C:</label>
                    <input type="text" name="option_c_${questionCounter}" required placeholder="Option C" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 3px;">
                </div>
                <div class="form-group">
                    <label>Option D:</label>
                    <input type="text" name="option_d_${questionCounter}" required placeholder="Option D" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 3px;">
                </div>
                <div class="form-group">
                    <label>Correct Answer:</label>
                    <select name="correct_answer_${questionCounter}" required style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 3px;">
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Points:</label>
                    <input type="number" name="points_${questionCounter}" min="1" value="1" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 3px;">
                </div>
            `;

  container.appendChild(questionDiv);
}

function removeQuestion(button) {
  button.closest('.question-item').remove();
}

// Add activity to video
function addActivity(videoId, videoTitle) {
  document.getElementById('activityVideoId').value = videoId;
  document.getElementById('addActivityTitle').textContent = `Add Activity to ${videoTitle}`;

  const sampleQuestions = [
    {
      question: 'Sample question?',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct: 0,
    },
  ];
  document.getElementById('activityQuestions').value = JSON.stringify(sampleQuestions, null, 2);

  document.getElementById('addActivityModal').style.display = 'block';
}

// Enhanced preview video with activity and test
async function previewVideo(videoId, videoTitle, gumletUrl) {
  try {
    document.getElementById('previewModalTitle').textContent = `Preview: ${videoTitle}`;
    document.getElementById('comprehensivePreviewModal').style.display = 'block';
    loadPreviewVideo(gumletUrl);
    await Promise.all([loadPreviewActivity(videoId), loadPreviewTest(videoId)]);
  } catch (error) {
    console.error('Error loading preview:', error);
    LMSUtils.showNotification('Failed to load preview content', 'error');
  }
}

function loadPreviewVideo(gumletUrl) {
  const videoFrame = document.getElementById('previewVideoFrame');
  const videoError = document.getElementById('previewVideoError');

  if (gumletUrl && gumletUrl.includes('gumlet.io')) {
    videoFrame.src = gumletUrl;
    videoFrame.style.display = 'block';
    videoError.style.display = 'none';
  } else {
    videoFrame.style.display = 'none';
    videoError.style.display = 'block';
  }
}

async function loadPreviewActivity(videoId) {
  const activityContent = document.getElementById('previewActivityContent');
  const activityError = document.getElementById('previewActivityError');

  try {
    const response = await fetch(`/api/activities/video/${videoId}`);

    if (response.ok) {
      const activity = await response.json();

      let questionsHtml = '';
      if (activity.questions) {
        try {
          const questions = JSON.parse(activity.questions);
          if (questions && questions.length > 0) {
            questionsHtml = `
                                    <h6 style="margin-top: 1rem; margin-bottom: 0.5rem; color: #495057;">Questions:</h6>
                                    <ol style="margin: 0; padding-left: 1.5rem;">
                                        ${questions.map((q) => `<li style="margin-bottom: 0.5rem;">${q}</li>`).join('')}
                                    </ol>
                                `;
          }
        } catch (e) {
          console.warn('Could not parse activity questions:', e);
        }
      }

      activityContent.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                            <h5 style="margin: 0; color: #28a745;">${activity.title}</h5>
            <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" data-action="delete-activity" data-activity-id="${activity.id}" data-video-id="${videoId}">
                                <i class="fas fa-trash" style="margin-right: 4px;"></i>Delete
                            </button>
                        </div>
                        <p style="margin: 0 0 1rem 0; color: #6c757d; line-height: 1.5;">${activity.description || 'No description available'}</p>
                        ${questionsHtml}
                    `;

      activityContent.style.display = 'block';
      activityError.style.display = 'none';
    } else {
      activityContent.style.display = 'none';
      activityError.style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading activity:', error);
    activityContent.style.display = 'none';
    activityError.style.display = 'block';
  }
}

async function loadPreviewTest(videoId) {
  const testContent = document.getElementById('previewTestContent');
  const testError = document.getElementById('previewTestError');

  try {
    const response = await fetch(`/api/tests/video/${videoId}`);

    if (response.ok) {
      const test = await response.json();

      let questionsHtml = '';
      if (test.questions && test.questions.length > 0) {
        questionsHtml = `
                            <h6 style="margin-top: 1rem; margin-bottom: 0.5rem; color: #495057;">Questions (${test.questions.length}):</h6>
                            <div style="margin: 0;">
                                ${test.questions
                                  .map(
                                    (q, index) => `
                                    <div style="margin-bottom: 1rem; padding: 1rem; background: white; border-radius: 5px; border: 1px solid #e9ecef;">
                                        <p style="margin: 0 0 0.5rem 0; font-weight: 500; color: #495057;">${index + 1}. ${q.question}</p>
                                        <div style="margin-left: 1rem;">
                                            <p style="margin: 0.25rem 0; color: #6c757d;">A) ${q.option_a}</p>
                                            <p style="margin: 0.25rem 0; color: #6c757d;">B) ${q.option_b}</p>
                                            <p style="margin: 0.25rem 0; color: #6c757d;">C) ${q.option_c}</p>
                                            <p style="margin: 0.25rem 0; color: #6c757d;">D) ${q.option_d}</p>
                                            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #28a745; font-weight: 500;">Points: ${q.points || 1}</p>
                                        </div>
                                    </div>
                                `,
                                  )
                                  .join('')}
                            </div>
                        `;
      }

      testContent.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                            <h5 style="margin: 0; color: #ffc107;">${test.title}</h5>
      <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" data-action="delete-test" data-test-id="${test.id}" data-video-id="${videoId}">
                                <i class="fas fa-trash" style="margin-right: 4px;"></i>Delete
                            </button>
                        </div>
                        <p style="margin: 0 0 1rem 0; color: #6c757d; line-height: 1.5;">${test.description || 'No description available'}</p>
                        ${questionsHtml}
                    `;

      testContent.style.display = 'block';
      testError.style.display = 'none';
    } else {
      testContent.style.display = 'none';
      testError.style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading test:', error);
    testContent.style.display = 'none';
    testError.style.display = 'block';
  }
}

function hideComprehensivePreviewModal() {
  document.getElementById('comprehensivePreviewModal').style.display = 'none';
  document.getElementById('previewVideoFrame').src = '';
}

function viewCourse(courseId) {
  const course = allCourses.find((c) => c.id === courseId);
  if (course) {
    LMSUtils.showNotification(`Viewing ${course.title} - ${course.videos?.length || 0} videos`, 'info');
  }
}

// Modal functions
async function showCreateCourseModal() {
  document.getElementById('createCourseModal').style.display = 'block';
  await loadTrainersForCourse();
}

async function loadTrainersForCourse() {
  try {
    const users = await LMSUtils.apiCall('/users');
    const trainers = users.filter((user) => user.role === 'trainer');

    const trainerSelect = document.getElementById('courseTrainer');
    while (trainerSelect.children.length > 1) {
      trainerSelect.removeChild(trainerSelect.lastChild);
    }

    trainers.forEach((trainer) => {
      const option = document.createElement('option');
      option.value = trainer.id;
      option.textContent = trainer.name;
      trainerSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load trainers:', error);
  }
}

function hideCreateCourseModal() {
  document.getElementById('createCourseModal').style.display = 'none';
  document.getElementById('createCourseForm').reset();
  document.getElementById('createCourseError').style.display = 'none';
}

function hideAddVideoModal() {
  document.getElementById('addVideoModal').style.display = 'none';
  document.getElementById('addVideoForm').reset();
  document.getElementById('addVideoError').style.display = 'none';
  document.getElementById('videoLevel').innerHTML = '<option value="">Select Level</option>';
  document.getElementById('videoChapter').innerHTML = '<option value="">Select Chapter</option>';
}

function hideCreateTestModal() {
  document.getElementById('createTestModal').style.display = 'none';
  document.getElementById('createTestForm').reset();
  document.getElementById('createTestError').style.display = 'none';
  document.getElementById('questionsContainer').innerHTML = '';
  questionCounter = 0;
}

function hideAddActivityModal() {
  document.getElementById('addActivityModal').style.display = 'none';
  document.getElementById('addActivityForm').reset();
  document.getElementById('addActivityError').style.display = 'none';
}

function hideEditVideoModal() {
  document.getElementById('editVideoModal').style.display = 'none';
  document.getElementById('editVideoForm').reset();
  document.getElementById('editVideoError').style.display = 'none';
  document.getElementById('editVideoLevel').innerHTML = '<option value="">Select Level</option>';
  document.getElementById('editVideoChapter').innerHTML = '<option value="">Select Chapter</option>';
}

function hideDeleteVideoModal() {
  document.getElementById('deleteVideoModal').style.display = 'none';
  videoToDelete = null;
}

// Video management functions
function editVideo(videoId, title, gumletUrl, sequence, courseId, levelId, chapterId) {
  document.getElementById('editVideoId').value = videoId;
  document.getElementById('editVideoTitleInput').value = title;
  document.getElementById('editGumletUrl').value = gumletUrl;
  document.getElementById('editVideoSequence').value = sequence;
  document.getElementById('editVideoTitle').textContent = `Edit Video: ${title}`;
  document.getElementById('editVideoError').style.display = 'none';

  const course = allCourses.find((c) => c.id === courseId);
  const levelSelect = document.getElementById('editVideoLevel');
  const chapterSelect = document.getElementById('editVideoChapter');

  levelSelect.innerHTML = '<option value="">Select Level</option>';
  chapterSelect.innerHTML = '<option value="">Select Chapter</option>';

  if (!course || !course.structure || !course.structure.levels || course.structure.levels.length === 0) {
    LMSUtils.showNotification('Please create a level and chapter before editing lessons.', 'warning');
    document.getElementById('editVideoModal').style.display = 'none';
    return;
  }

  const updateChapterOptions = (selectedLevelId) => {
    chapterSelect.innerHTML = '<option value="">Select Chapter</option>';
    const selectedLevel = course.structure.levels.find((level) => level.id === parseInt(selectedLevelId));
    if (selectedLevel) {
      selectedLevel.chapters.forEach((chapter) => {
        const option = document.createElement('option');
        option.value = chapter.id;
        option.textContent = `Chapter ${selectedLevel.sequence}.${chapter.sequence}: ${chapter.title}`;
        chapterSelect.appendChild(option);
      });
      chapterSelect.disabled = selectedLevel.chapters.length === 0;
    } else {
      chapterSelect.disabled = true;
    }
  };

  course.structure.levels.forEach((level) => {
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = `Level ${level.sequence}: ${level.title}`;
    levelSelect.appendChild(option);
  });

  levelSelect.onchange = (event) => {
    updateChapterOptions(event.target.value);
    chapterSelect.value = '';
  };

  // Safely parse provided levelId/chapterId (they may be null or strings)
  const parsedLevelId = typeof levelId === 'number' ? levelId : levelId ? parseInt(levelId) : null;
  const parsedChapterId = typeof chapterId === 'number' ? chapterId : chapterId ? parseInt(chapterId) : null;

  const initialLevelId = parsedLevelId || course.structure.levels[0].id;
  levelSelect.value = String(initialLevelId);
  updateChapterOptions(initialLevelId);
  chapterSelect.disabled = chapterSelect.options.length <= 1;
  chapterSelect.value = parsedChapterId ? String(parsedChapterId) : '';

  document.getElementById('editVideoModal').style.display = 'block';
}

function confirmDeleteVideo(videoId, videoTitle) {
  videoToDelete = videoId;
  document.getElementById('deleteVideoMessage').textContent = `Are you sure you want to delete "${videoTitle}"? This action cannot be undone and will remove all associated tests, activities, and student progress for this video.`;
  document.getElementById('deleteVideoModal').style.display = 'block';
}

async function deleteVideo() {
  if (!videoToDelete) return;
  try {
    await LMSUtils.apiCall(`/videos/${videoToDelete}`, { method: 'DELETE' });
    LMSUtils.showNotification('Video deleted successfully', 'success');
    hideDeleteVideoModal();
    loadCoursesData();
  } catch (error) {
    LMSUtils.showNotification(`Failed to delete video: ${error.message}`, 'error');
  }
}

// Form handlers
document.getElementById('createCourseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const courseData = Object.fromEntries(formData.entries());
  try {
    await LMSUtils.apiCall('/courses', { method: 'POST', body: JSON.stringify(courseData) });
    LMSUtils.showNotification('Course created successfully', 'success');
    hideCreateCourseModal();
    loadCoursesData();
  } catch (error) {
    document.getElementById('createCourseError').textContent = error.message;
    document.getElementById('createCourseError').style.display = 'block';
  }
});

document.getElementById('addVideoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const videoData = Object.fromEntries(formData.entries());
  if (!videoData.gumlet_url || !videoData.gumlet_url.includes('gumlet.io')) {
    document.getElementById('addVideoError').textContent = 'Please enter a valid Gumlet URL';
    document.getElementById('addVideoError').style.display = 'block';
    return;
  }
  if (!videoData.chapter_id) {
    document.getElementById('addVideoError').textContent = 'Please select a chapter for this lesson';
    document.getElementById('addVideoError').style.display = 'block';
    return;
  }
  try {
    await LMSUtils.apiCall('/videos', { method: 'POST', body: JSON.stringify(videoData) });
    LMSUtils.showNotification('Video added successfully', 'success');
    hideAddVideoModal();
    loadCoursesData();
  } catch (error) {
    document.getElementById('addVideoError').textContent = error.message;
    document.getElementById('addVideoError').style.display = 'block';
  }
});

document.getElementById('addLevelForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const courseId = parseInt(formData.get('course_id'));
  const payload = { title: formData.get('title'), description: formData.get('description') || null };
  const sequenceValue = formData.get('sequence');
  if (sequenceValue) payload.sequence = parseInt(sequenceValue);
  if (!payload.title) {
    document.getElementById('addLevelError').textContent = 'Level title is required';
    document.getElementById('addLevelError').style.display = 'block';
    return;
  }
  try {
    await LMSUtils.apiCall(`/courses/${courseId}/levels`, { method: 'POST', body: JSON.stringify(payload) });
    LMSUtils.showNotification('Level added successfully', 'success');
    hideAddLevelModal();
    loadCoursesData();
  } catch (error) {
    document.getElementById('addLevelError').textContent = error.message;
    document.getElementById('addLevelError').style.display = 'block';
  }
});

document.getElementById('addChapterForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const levelId = parseInt(formData.get('level_id'));
  const payload = { title: formData.get('title'), description: formData.get('description') || null };
  const sequenceValue = formData.get('sequence');
  if (sequenceValue) payload.sequence = parseInt(sequenceValue);
  if (!levelId) {
    document.getElementById('addChapterError').textContent = 'Please select a level';
    document.getElementById('addChapterError').style.display = 'block';
    return;
  }
  if (!payload.title) {
    document.getElementById('addChapterError').textContent = 'Chapter title is required';
    document.getElementById('addChapterError').style.display = 'block';
    return;
  }
  try {
    await LMSUtils.apiCall(`/levels/${levelId}/chapters`, { method: 'POST', body: JSON.stringify(payload) });
    LMSUtils.showNotification('Chapter added successfully', 'success');
    hideAddChapterModal();
    loadCoursesData();
  } catch (error) {
    document.getElementById('addChapterError').textContent = error.message;
    document.getElementById('addChapterError').style.display = 'block';
  }
});

document.getElementById('createTestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const testData = {
    videoId: parseInt(formData.get('videoId')),
    title: formData.get('title'),
    description: formData.get('description'),
    passingScore: parseInt(formData.get('passingScore')) || 70,
    questions: [],
  };
  const questionItems = document.querySelectorAll('.question-item');
  questionItems.forEach((item) => {
    const questionInput = item.querySelector('input[name^="question_"]');
    if (!questionInput) return;
    const questionNum = questionInput.name.split('_')[1];
    const question = {
      question: item.querySelector(`input[name="question_${questionNum}"]`)?.value,
      option_a: item.querySelector(`input[name="option_a_${questionNum}"]`)?.value,
      option_b: item.querySelector(`input[name="option_b_${questionNum}"]`)?.value,
      option_c: item.querySelector(`input[name="option_c_${questionNum}"]`)?.value,
      option_d: item.querySelector(`input[name="option_d_${questionNum}"]`)?.value,
      correct_answer: item.querySelector(`select[name="correct_answer_${questionNum}"]`)?.value,
      points: parseInt(item.querySelector(`input[name="points_${questionNum}"]`)?.value) || 1,
    };
    if (question.question && question.option_a && question.option_b && question.correct_answer) {
      testData.questions.push(question);
    }
  });
  if (testData.questions.length === 0) {
    document.getElementById('createTestError').textContent = 'Please add at least one question';
    document.getElementById('createTestError').style.display = 'block';
    return;
  }
  try {
    await LMSUtils.apiCall('/tests', { method: 'POST', body: JSON.stringify(testData) });
    LMSUtils.showNotification('Test created successfully', 'success');
    hideCreateTestModal();
    loadCoursesData();
  } catch (error) {
    document.getElementById('createTestError').textContent = error.message;
    document.getElementById('createTestError').style.display = 'block';
  }
});

document.getElementById('addActivityForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const activityData = Object.fromEntries(formData.entries());
  try {
    if (activityData.questions) JSON.parse(activityData.questions);
  } catch (jsonError) {
    document.getElementById('addActivityError').textContent = 'Invalid JSON format for questions';
    document.getElementById('addActivityError').style.display = 'block';
    return;
  }
  try {
    await LMSUtils.apiCall('/activities', { method: 'POST', body: JSON.stringify(activityData) });
    LMSUtils.showNotification('Activity added successfully', 'success');
    hideAddActivityModal();
    loadCoursesData();
  } catch (error) {
    document.getElementById('addActivityError').textContent = error.message;
    document.getElementById('addActivityError').style.display = 'block';
  }
});

// Delete course functions
function confirmDeleteCourse(courseId, courseTitle) {
  courseToDelete = courseId;
  document.getElementById('deleteCourseMessage').textContent = `Are you sure you want to delete "${courseTitle}"? This action cannot be undone and will remove all videos, activities, tests, and student progress associated with this course.`;
  document.getElementById('deleteCourseModal').style.display = 'block';
}

function hideDeleteCourseModal() {
  document.getElementById('deleteCourseModal').style.display = 'none';
  courseToDelete = null;
}

async function deleteCourse() {
  if (!courseToDelete) return;
  try {
    await LMSUtils.apiCall(`/courses/${courseToDelete}`, { method: 'DELETE' });
    LMSUtils.showNotification('Course deleted successfully', 'success');
    hideDeleteCourseModal();
    loadCoursesData();
  } catch (error) {
    LMSUtils.showNotification(`Failed to delete course: ${error.message}`, 'error');
  }
}

document.getElementById('confirmDeleteCourseBtn').addEventListener('click', deleteCourse);
document.getElementById('confirmDeleteVideoBtn').addEventListener('click', deleteVideo);

// Video dropdown functions
function toggleVideoDropdown(videoId) {
  const dropdown = document.getElementById(`videoDropdownMenu${videoId}`);
  const isVisible = dropdown.style.display === 'block';
  document.querySelectorAll('.dropdown-menu').forEach((menu) => {
    menu.style.display = 'none';
  });
  dropdown.style.display = isVisible ? 'none' : 'block';
}

function hideVideoDropdown(videoId) {
  const dropdown = document.getElementById(`videoDropdownMenu${videoId}`);
  dropdown.style.display = 'none';
}

document.addEventListener('click', function (event) {
  if (!event.target.closest('.video-actions')) {
    document.querySelectorAll('.dropdown-menu').forEach((menu) => {
      menu.style.display = 'none';
    });
  }
});

// Edit video form handler
document.getElementById('editVideoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const videoData = Object.fromEntries(formData.entries());
  const videoId = videoData.video_id;
  delete videoData.video_id;
  if (!videoData.gumlet_url || !videoData.gumlet_url.includes('gumlet.io')) {
    document.getElementById('editVideoError').textContent = 'Please enter a valid Gumlet URL';
    document.getElementById('editVideoError').style.display = 'block';
    return;
  }
  if (!videoData.chapter_id) {
    document.getElementById('editVideoError').textContent = 'Please select a chapter for this lesson';
    document.getElementById('editVideoError').style.display = 'block';
    return;
  }
  try {
    await LMSUtils.apiCall(`/videos/${videoId}`, { method: 'PUT', body: JSON.stringify(videoData) });
    LMSUtils.showNotification('Video updated successfully', 'success');
    hideEditVideoModal();
    loadCoursesData();
  } catch (error) {
    document.getElementById('editVideoError').textContent = error.message;
    document.getElementById('editVideoError').style.display = 'block';
  }
});

// AI Functions
async function transcribeVideo(videoId, videoTitle) {
  if (!confirm(`Get transcript from Gumlet for "${videoTitle}"? This will retrieve subtitles if available.`)) {
    return;
  }
  try {
    LMSUtils.showNotification('Retrieving transcript from Gumlet...', 'info');
    await LMSUtils.apiCall(`/videos/${videoId}/transcribe`, { method: 'POST' });
    LMSUtils.showNotification('Transcript retrieved successfully from Gumlet', 'success');
  } catch (error) {
    LMSUtils.showNotification(`Failed to retrieve transcript: ${error.message}`, 'error');
  }
}

async function generateAIContent(videoId, videoTitle) {
  document.getElementById('aiVideoId').value = videoId;
  document.getElementById('generateAITitle').textContent = `Generate AI Content for ${videoTitle}`;
  document.getElementById('generateAIModal').style.display = 'block';
}

async function generateContent(contentType, triggerEl) {
  const videoId = document.getElementById('aiVideoId').value;
  const generateBtn = triggerEl || document.querySelector(`#generateAIModal [data-action="generate-content"][data-type="${contentType}"]`);
  const originalText = generateBtn.innerHTML;
  try {
    generateBtn.innerHTML = '<span class="spinner"></span> Generating...';
    generateBtn.disabled = true;
    const allBtns = document.querySelectorAll('#generateAIModal button');
    allBtns.forEach((btn) => (btn.disabled = true));
    LMSUtils.showNotification(`Generating AI ${contentType}...`, 'info');
    await LMSUtils.apiCall(`/videos/${videoId}/generate-content`, {
      method: 'POST',
      body: JSON.stringify({ contentType: contentType }),
    });
    LMSUtils.showNotification(
      `AI ${contentType} generated successfully and sent for review! Click "AI Content Review" to approve it.`,
      'success',
    );
    hideGenerateAIModal();
    updatePendingCount();
  } catch (error) {
    LMSUtils.showNotification(`Failed to generate ${contentType}: ${error.message}`, 'error');
    generateBtn.innerHTML = originalText;
  } finally {
    const allBtns = document.querySelectorAll('#generateAIModal button');
    allBtns.forEach((btn) => {
      btn.disabled = false;
      if (btn === generateBtn) {
        btn.innerHTML = originalText;
      }
    });
  }
}

function hideGenerateAIModal() {
  document.getElementById('generateAIModal').style.display = 'none';
}

// Transcript Functions
async function viewTranscript(videoId, videoTitle) {
  try {
    const response = await LMSUtils.apiCall(`/videos/${videoId}/transcript`);
    if (!response.transcript_text) {
      LMSUtils.showNotification('No transcript found for this video', 'info');
      return;
    }
    document.getElementById('transcriptTitle').textContent = `Transcript for "${videoTitle}"`;
    document.getElementById('transcriptContent').textContent = response.transcript_text;
    document.getElementById('transcriptError').style.display = 'none';
    document.getElementById('deleteTranscriptBtn').setAttribute('data-video-id', videoId);
    document.getElementById('deleteTranscriptBtn').setAttribute('data-video-title', videoTitle);
    document.getElementById('transcriptModal').style.display = 'block';
  } catch (error) {
    LMSUtils.showNotification(`Failed to load transcript: ${error.message}`, 'error');
  }
}

function hideTranscriptModal() {
  document.getElementById('transcriptModal').style.display = 'none';
}

async function deleteTranscript() {
  const videoId = document.getElementById('deleteTranscriptBtn').getAttribute('data-video-id');
  const videoTitle = document.getElementById('deleteTranscriptBtn').getAttribute('data-video-title');
  if (!confirm(`Are you sure you want to delete the transcript for "${videoTitle}"? This action cannot be undone.`)) {
    return;
  }
  try {
    await LMSUtils.apiCall(`/videos/${videoId}/transcript`, { method: 'DELETE' });
    LMSUtils.showNotification('Transcript deleted successfully', 'success');
    hideTranscriptModal();
  } catch (error) {
    document.getElementById('transcriptError').textContent = error.message;
    document.getElementById('transcriptError').style.display = 'block';
  }
}

document.getElementById('deleteTranscriptBtn').addEventListener('click', deleteTranscript);

async function viewPendingAIContent(suppressNoContentNotification = false) {
  try {
    const pendingContent = await LMSUtils.apiCall('/ai-content/pending');
    if (pendingContent.length === 0) {
      if (!suppressNoContentNotification) {
        LMSUtils.showNotification('No pending AI content for review', 'info');
      }
      displayPendingContent(pendingContent);
      return;
    }
    displayPendingContent(pendingContent);
    document.getElementById('aiReviewModal').style.display = 'block';
  } catch (error) {
    LMSUtils.showNotification(`Failed to load pending content: ${error.message}`, 'error');
  }
}

function displayPendingContent(content) {
  const container = document.getElementById('pendingContentContainer');
  if (content.length === 0) {
    container.innerHTML = `
                    <div class="alert alert-info" style="text-align: center; padding: 2rem;">
                        <h4><i class="fas fa-info-circle"></i> No Pending AI Content</h4>
                        <p>AI-generated content will appear here for your review and approval.</p>
                        <hr>
                        <h5>How to Generate AI Content:</h5>
                        <ol style="text-align: left; display: inline-block;">
                            <li>Navigate to any course with videos</li>
                            <li>Click the <strong>"Generate AI Content"</strong> button next to a video</li>
                            <li>Select content type: <strong>Test</strong> or <strong>Activity</strong></li>
                            <li>Wait for the AI to process (progress indicator will show)</li>
                            <li>Return here to review and approve the generated content</li>
                        </ol>
                        <p><small class="text-muted">💡 Tip: Approved content becomes available to students immediately</small></p>
                    </div>
                `;
    return;
  }
  const contentHTML = content
    .map(
      (item) => `
                <div class="ai-content-item" style="border: 2px solid #ffc107; padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px; background: #fffbf0;">
                    <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 1rem;">
                        <h4 style="color: #856404; margin: 0;">
                            <i class="fas fa-robot"></i> ${item.content_type.toUpperCase()}
                            <small style="color: #6c757d; font-weight: normal;"> • from video: "${item.video_title}"</small>
                        </h4>
                        <span class="badge" style="background: #ffc107; color: #212529;">PENDING REVIEW</span>
                    </div>
                    <p style="margin-bottom: 1rem;"><strong><i class="fas fa-clock"></i> Generated:</strong> ${LMSUtils.formatDate(item.created_at)}</p>
                    <div style="background: #f8f9fa; padding: 1rem; border-radius: 5px; margin: 1rem 0; max-height: 300px; overflow-y: auto; border-left: 4px solid #007bff;">
                        <pre style="white-space: pre-wrap; font-family: inherit; margin: 0; font-size: 14px;">${JSON.stringify(JSON.parse(item.generated_content), null, 2)}</pre>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
      <button class="btn btn-success" data-action="review-ai" data-content-id="${item.id}" data-status="approve" style="flex: 1; min-width: 120px;">
                            <i class="fas fa-check"></i> Approve & Publish
                        </button>
      <button class="btn btn-danger" data-action="review-ai" data-content-id="${item.id}" data-status="reject" style="flex: 1; min-width: 120px;">
                            <i class="fas fa-times"></i> Reject
                        </button>
      <button class="btn btn-warning" data-action="request-update" data-content-id="${item.id}" style="flex: 1; min-width: 120px;">
                            <i class="fas fa-edit"></i> Request Update
                        </button>
                    </div>
                </div>
            `,
    )
    .join('');
  container.innerHTML = contentHTML;
}

async function reviewAIContent(contentId, status) {
  try {
    await LMSUtils.apiCall(`/ai-content/${contentId}/review`, {
      method: 'PUT',
      body: JSON.stringify({ action: status }),
    });
    LMSUtils.showNotification(
      `Content ${status === 'approve' ? 'approved and published' : status} successfully!`,
      'success',
    );
    viewPendingAIContent(true);
    updatePendingCount();
  } catch (error) {
    LMSUtils.showNotification(`Failed to ${status} content: ${error.message}`, 'error');
  }
}

async function requestContentUpdate(contentId) {
  const feedback = prompt('Enter feedback for content update:');
  if (!feedback) return;
  try {
    await LMSUtils.apiCall(`/ai-content/${contentId}/request-update`, {
      method: 'POST',
      body: JSON.stringify({ updateReason: feedback }),
    });
    LMSUtils.showNotification('Update request submitted successfully', 'success');
  } catch (error) {
    LMSUtils.showNotification(`Failed to request update: ${error.message}`, 'error');
  }
}

function hideAIReviewModal() {
  document.getElementById('aiReviewModal').style.display = 'none';
}

window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});

async function deleteActivity(activityId, videoId) {
  if (!confirm('Are you sure you want to delete this activity? This action cannot be undone.')) {
    return;
  }
  try {
    await LMSUtils.apiCall(`/activities/${activityId}`, { method: 'DELETE' });
    LMSUtils.showNotification('Activity deleted successfully', 'success');
    await loadPreviewActivity(videoId);
  } catch (error) {
    console.error('Error deleting activity:', error);
    LMSUtils.showNotification('Failed to delete activity: ' + error.message, 'error');
  }
}

async function deleteTest(testId, videoId) {
  if (!confirm('Are you sure you want to delete this test? This action cannot be undone and will remove all student progress for this test.')) {
    return;
  }
  try {
    await LMSUtils.apiCall(`/tests/${testId}`, { method: 'DELETE' });
    LMSUtils.showNotification('Test deleted successfully', 'success');
    await loadPreviewTest(videoId);
  } catch (error) {
    console.error('Error deleting test:', error);
    LMSUtils.showNotification('Failed to delete test: ' + error.message, 'error');
  }
}

async function updatePendingCount() {
  try {
    const pendingContent = await LMSUtils.apiCall('/ai-content/pending');
    const count = pendingContent.length;
    const badge = document.getElementById('pendingCount');
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline';
      document.getElementById('reviewAIBtn').classList.add('btn-warning');
      document.getElementById('reviewAIBtn').classList.remove('btn-success');
    } else {
      badge.style.display = 'none';
      document.getElementById('reviewAIBtn').classList.add('btn-success');
      document.getElementById('reviewAIBtn').classList.remove('btn-warning');
    }
  } catch (error) {
    console.error('Failed to update pending count:', error);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initCoursesPage();
  updatePendingCount();
  setupEventListeners();
  setupCSPDelegation();
});
