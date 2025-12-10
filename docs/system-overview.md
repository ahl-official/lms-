# AHL Training LMS — System Overview

## Purpose
- Training-focused LMS with AI-generated content, adaptive tests, audio tools, and WhatsApp notifications.
- Single Express server with sqlite3, session auth, strict CORS, rate limiting, and modular services.

## Architecture
- Server: `server.js` initializes middleware, sessions, DB, and mounts feature routes.
- Modules: `ai_service.js`, `adaptive_learning_service.js`, `video_unlock_service.js`, `gumlet_service.js`, `openrouter_service.js`, `audio_service.js`.
- Mounts:
  - `/api/ai-test` (`server.js:79`) → `routes/ai-test-routes.js`
  - `/api/mock-call` (`server.js:82`) → `routes/mock-call-routes.js`
  - `/api/audio` (`server.js:85`) → `routes/audio-routes.js`
  - `/api/tools` (`server.js:89`) → `routes/learning-tools-routes.js`

## Authentication & RBAC
- Session + JWT fallback (`middleware/auth.js:12`).
- Role gating via `requireRole` and helpers (`middleware/auth.js:205`).
- Endpoints:
  - `POST /api/login` (`server.js:373`) creates session.
  - `POST /api/logout` (`server.js:403`).
  - `GET /api/user` (`server.js:409`) returns session user.

## Data Model (Selected)
- Core tables defined in `server.js` (courses, levels, chapters, videos, activities, progress, submissions, roles).
- AI features (`ai_migration.js`): `video_transcripts`, `ai_generated_content`, `ai_content_updates`, `system_settings` with indexes.
- AI tests (`ai_test_migration.js`): `ai_tests`, `ai_test_questions`, `student_test_attempts`, `test_question_responses`, `ai_test_feedback`, `test_completion_requirements`.
- Adaptive learning (`adaptive_learning_migration.js`): profiles, question performance, learning path progress, recommendations, test sessions, analytics.

## Services
- `AIService` (`ai_service.js`)
  - Initializes OpenAI/OpenRouter from `system_settings`.
  - Gumlet-based transcript retrieval (avoids Whisper costs).
  - Safe provider/model selection with sensible defaults.
- `AdaptiveLearningService` (`adaptive_learning_service.js`)
  - Builds user learning profile; generates adaptive questions; scores; AI feedback; recommendations.
  - Requires transcript; suggests available transcribed videos if missing.
- `VideoUnlockService` (`video_unlock_service.js:15`)
  - `checkVideoAccess` enforces previous video test requirements.
  - `unlockNextVideo`, `isFirstVideoInCourse`, `getPreviousVideo`, `getVideoTestRequirements`, `getNextVideo`, `getCourseProgress`.
- `GumletService` (`gumlet_service.js:12`, `gumlet_service.js:126`)
  - Extracts asset ID from embed URL; fetches word-level transcript via Gumlet API.
- `OpenRouterService` (`openrouter_service.js`)
  - Catalogs models and wraps API calls.
- `AudioService` (`audio_service.js`)
  - Multer upload, format conversion, duration/quality analysis, TTS/transcription stubs.

## Routes
- Auth
  - `POST /api/login` (`server.js:373`), `POST /api/logout` (`server.js:403`), `GET /api/user` (`server.js:409`).
- Roles (admin-only CRUD): `server.js` role endpoints around `server.js:596` and later.
- Courses
  - `POST /api/courses` (`server.js:769`), plus videos/activities/progress endpoints in `server.js`.
- AI Tests (`routes/ai-test-routes.js`)
  - Generate: `POST /api/ai-test/generate` (`routes/ai-test-routes.js:47`).
  - Full lifecycle: preview, start attempt, submit, score, results, feedback.
  - Audio answer upload with `multer` to `uploads/audio`.
- Adaptive Learning
  - Complete video (may trigger adaptive): `POST /api/videos/:id/complete` (`server.js:2350`).
  - Generate adaptive test: `POST /api/adaptive-test/generate` (`server.js:2381`).
- Student Q&A
  - Ask AI: `POST /api/videos/:id/ask-ai` (`server.js:1433`).
  - Count: `GET /api/student-qa-sessions/count` (`server.js:1767`).
  - List: `GET /api/student-qa-sessions` (`server.js:1807`).
- Learning Tools (`routes/learning-tools-routes.js`)
  - Flashcards: `POST /api/tools/flashcards/generate` (`routes/learning-tools-routes.js:19`).
- Mock Call (`routes/mock-call-routes.js`)
  - Scenarios: `GET /api/mock-call/scenarios` (`routes/mock-call-routes.js:47`).
  - Start session, upload recording, analysis and scoring via `MockCallService`.

## AI Test System
- Generation (`ai_test_generator.js:11`)
  - Validates video and transcript, creates `ai_tests`, generates diverse questions (MC/typing/TF/fill-blank/audio), saves, marks completed.
  - Fallback question generator for resiliency.
- Scoring (`ai_test_scorer.js:588`, `ai_test_scorer.js:598`)
  - Aggregates responses, calculates points, pass/fail, percentage, and AI feedback with fallback.
- Unlock integration
  - Enforced via `test_completion_requirements` and `VideoUnlockService.checkVideoAccess`.

## Audio
- Uploads (`routes/audio-routes.js`)
  - Single and multiple uploads with `AudioService` processing and validation.
- Utilities (`audio_service.js`)
  - Convert formats, measure duration, analyze quality, info endpoints.
  - TTS/transcription guarded by env flags and keys.

## Adaptive Learning
- Profiles and preference defaults per user.
- Transcript required; provides alternative video suggestions if absent.
- Feedback: strengths, weaknesses, improvements, overall guidance.
- Migrations enable analytics, recommendations, and session tracking.

## Video Unlocking
- First video accessible by default (`video_unlock_service.js:141`).
- Subsequent videos require passing previous test when `is_required`.
- Auto-unlock next after activity approval (`server.js:2642`).

## WhatsApp Integration (WAHA)
- Configuration object present in `server.js:22` (base URL, session name, API key).
- Send text via `POST /api/sendText` with payload constructed in `server.js:3283`.
- Use environment/settings for secrets; avoid hardcoded keys in production.

## Front-End
- Admin Dashboard (`public/js/admin-dashboard.js`)
  - Loads stats, roles, trainers; user/course creation; trainer assignments.
- Student Dashboard (`public/student/dashboard.html`)
  - Progress, current course, recent videos; calls `/api` for data.
- Utilities (`public/js/main.js`)
  - Fetch wrapper with credentials, notifications, Gumlet URL helpers (`public/js/main.js:129`).

## Operations
- Start server: `npm start` (`package.json`).
- Middleware: `helmet`, `cors` (strict allowed origins), `morgan`, `express-rate-limit`, sessions.
- Static assets: `public/`.
- Logging: JSON structured via `utils/logger.js:21`.

## Known Issues & Guidance
- Gumlet URL must match `https://play.gumlet.io/embed/<asset-id>` for transcripts (`gumlet_service.js:12`, `gumlet_service.js:134`).
- AI generation requires an available transcript; transcribe first or configure Gumlet processing.
- Trainer–student queries rely on `trainer_course_assignments`; ensure migrations run and assignments are in place.
- Store provider keys in `system_settings`; do not hardcode secrets.

## Test Key Flows
- Auth: login, then `GET /api/user`.
- Transcript: ensure `video_transcripts.transcription_status = 'completed'` before AI generation.
- AI Test: generate, attempt, submit, results.
- Adaptive: complete video, then generate adaptive test.
- Unlock: verify access to next video after passing previous.
- Mock Call: list scenarios, start, upload recording, review analysis.
