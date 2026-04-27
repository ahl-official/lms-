        // Toast System
        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');

            let bgClass = 'bg-gray-800';
            if (type === 'success') bgClass = 'bg-green-600';
            if (type === 'error') bgClass = 'bg-red-600';
            if (type === 'warning') bgClass = 'bg-yellow-600';

            toast.className = `${bgClass} text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-y-full opacity-0 flex items-center gap-2`;
            toast.innerHTML = `
                <span>${message}</span>
                <button onclick="this.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">&times;</button>
            `;

            container.appendChild(toast);

            requestAnimationFrame(() => toast.classList.remove('translate-y-full', 'opacity-0'));
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

            // Space to Pause/Resume
            if (e.code === 'Space') {
                const pauseBtn = document.getElementById('pause-btn');
                const sessionDiv = document.getElementById('training-session');
                if (pauseBtn && !sessionDiv.classList.contains('hidden')) {
                    e.preventDefault();
                    pauseBtn.click();
                }
            }

            // M to Mute
            if (e.key.toLowerCase() === 'm') {
                const muteBtn = document.getElementById('mute-btn');
                const sessionDiv = document.getElementById('training-session');
                if (muteBtn && !sessionDiv.classList.contains('hidden')) {
                    muteBtn.click();
                }
            }
        });

        const API_BASE = '';

        // Check authentication
        const user = JSON.parse(sessionStorage.getItem('ahl_user') || '{}');
        if (!user.id || user.role === 'admin') {
            window.location.href = 'login.html';
        }

        document.getElementById('user-name').textContent = `Welcome, ${user.name}!`;

        // Session state
        const sessionState = {
            selectedCourseId: 1, // Default to Sales Trainer
            selectedCategory: null,
            sessionId: null,
            mode: 'standard',
            isActive: false,
            isPaused: false,
            isAISpeaking: false,
            aiPending: false,
            hasEnded: false,
            timeRemaining: 0,
            timerInterval: null,
            recognition: null,
            recognitionActive: false,
            deepgramSocket: null,
            mediaRecorder: null,
            mediaStream: null,
            audioContext: null,
            analyser: null,
            visualizerFrame: null,
            deepgramKeepAlive: null,
            currentQuestion: null,
            lastAIMessage: '',
            currentTranscript: '',
            speechTimeout: null,
            isMuted: false,
            currentUtterance: null,
            difficulty: 'basic',
            duration: 10,
            conversationHistory: []
        };

        const synthesis = window.speechSynthesis;
        let selectedVoice = null;
        function normalizeText(t) { return (t || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
        function enforceQuestion(text) {
            let t = (text || '').trim();
            const qm = t.indexOf('?');
            if (qm !== -1) {
                t = t.slice(0, qm + 1);
            } else {
                t = t.replace(/[\s\.\!]+$/g, '');
                if (t.length) t = t + '?';
            }
            return t;
        }
        function pickVoice() {
            const voices = synthesis.getVoices() || [];
            const preferred = voices.find(v => /en(-|_)US/i.test(v.lang) && /Samantha|Karen|Google US English|Alex/i.test(v.name))
                || voices.find(v => /en(-|_)US/i.test(v.lang))
                || voices[0] || null;
            selectedVoice = preferred;
        }
        synthesis.onvoiceschanged = () => { pickVoice(); };
        pickVoice();

        // Logout
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'same-origin', keepalive: true });
            sessionStorage.removeItem('ahl_user');
            window.location.href = 'login.html';
        });

        // Load Courses
        async function loadCourses() {
            try {
                const select = document.getElementById('course-select');
                if (!select) return;

                const response = await fetch(`${API_BASE}/api/training/courses`, { credentials: 'same-origin' });
                if (!response.ok) throw new Error('Failed to load courses');

                const data = await response.json();
                select.innerHTML = '';

                (data.courses || []).forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name;
                    if (c.id === sessionState.selectedCourseId) opt.selected = true;
                    select.appendChild(opt);
                });

                // If current selection not in list, pick first
                if (data.courses.length > 0 && !data.courses.find(c => c.id === sessionState.selectedCourseId)) {
                    sessionState.selectedCourseId = data.courses[0].id;
                    select.value = sessionState.selectedCourseId;
                }

                select.addEventListener('change', (e) => {
                    sessionState.selectedCourseId = parseInt(e.target.value);
                    loadCategories();
                    // Also clear any previous session state if needed
                });

                // Load categories for the initial course
                loadCategories();

            } catch (e) {
                console.error('Failed to load courses', e);
                // Fallback to loading categories for default course
                loadCategories();
            }
        }

        // Load categories
        async function loadCategories() {
            try {
                const grid = document.getElementById('categories-grid');
                const loading = document.getElementById('categories-loading');

                if (loading) loading.classList.remove('hidden');
                if (grid) grid.classList.add('hidden');

                const response = await fetch(`${API_BASE}/api/training/categories?course_id=${sessionState.selectedCourseId}`, { credentials: 'same-origin' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                if (loading) loading.classList.add('hidden');
                if (grid) {
                    grid.innerHTML = '';
                    grid.classList.remove('hidden');
                }

                const categories = Array.isArray(data && data.categories) ? data.categories : [];
                if (categories.length === 0) {
                    if (grid) grid.innerHTML = '<p class="col-span-3 text-center text-slate-500">No modules found for this course.</p>';
                    return;
                }

                categories.forEach(cat => {
                    const name = typeof cat === 'string' ? cat : (cat.name || '');
                    const videoCount = typeof cat === 'object' ? (cat.video_count || 0) : 0;
                    const chunkCount = typeof cat === 'object' ? (cat.chunk_count || 0) : 0;
                    const card = document.createElement('div');
                    const hasContent = (videoCount || 0) > 0;
                    card.className = 'category-card bg-white rounded-2xl shadow-sm p-6 border border-gray-200 hover:border-indigo-300 transition-all' + (hasContent ? '' : ' opacity-60 cursor-not-allowed');
                    const badgeClass = hasContent ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200';
                    const chunksText = hasContent ? `${chunkCount} knowledge chunks available` : `No content uploaded yet`;
                    const btnClass = hasContent
                        ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200'
                        : 'bg-slate-300 cursor-not-allowed';

                    card.innerHTML = `
                        <div class="flex items-start justify-between mb-4">
                            <h3 class="text-xl font-bold text-slate-900 tracking-tight">${name}</h3>
                            <span class="px-2.5 py-0.5 ${badgeClass} text-xs font-semibold rounded-md">
                                ${videoCount} video${videoCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <p class="text-slate-500 text-sm mb-6">${chunksText}</p>
                        <button class="w-full py-3 ${btnClass} text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                            <span>Start Training</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                        </button>
                    `;

                    card.querySelector('button').addEventListener('click', () => selectCategory(name));
                    card.addEventListener('click', (e) => {
                        if (e.target.closest('button')) return;
                        if (!hasContent) return;
                        selectCategory(name);
                    });
                    grid.appendChild(card);
                });

                document.getElementById('categories-loading').classList.add('hidden');
                document.getElementById('categories-grid').classList.remove('hidden');
                const videoSection = document.getElementById('welcome-video-section');
                if (videoSection) videoSection.classList.remove('hidden');
            } catch (error) {
                console.error('Error loading categories:', error);
                alert('Failed to load categories. Please refresh the page.');
                document.getElementById('categories-loading').classList.add('hidden');
                document.getElementById('categories-grid').classList.add('hidden');
            }
        }

        async function loadOnboardingStatus() {
            try {
                const resp = await fetch(`${API_BASE}/api/training/progress`, { credentials: 'same-origin' });
                if (!resp.ok) return;
                const data = await resp.json();

                const container = document.getElementById('onboarding-checklist');
                const itemsContainer = document.getElementById('checklist-items');
                const progressLabel = document.getElementById('progress-percent');
                const welcomeSection = document.getElementById('welcome-video-section');

                if (!container || !itemsContainer) return;

                if (data.items) {
                    container.classList.remove('hidden');
                    itemsContainer.innerHTML = '';

                    let completedCount = 0;
                    let welcomeWatched = false;

                    data.items.forEach(item => {
                        if (item.completed) completedCount++;
                        if (item.label === 'Watch Welcome Guide' && item.completed) welcomeWatched = true;

                        const el = document.createElement('div');
                        el.className = `flex items-center gap-3 p-3 rounded-xl border ${item.completed ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`;
                        el.innerHTML = `
                            <div class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${item.completed ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}">
                                ${item.completed ? '✓' : '○'}
                            </div>
                            <span class="text-sm font-medium ${item.completed ? 'text-emerald-900' : 'text-slate-600'}">${item.label}</span>
                        `;
                        itemsContainer.appendChild(el);
                    });

                    const percent = Math.round((completedCount / data.items.length) * 100);
                    progressLabel.textContent = `${percent}% Complete`;

                    if (percent === 100) {
                        progressLabel.className = 'text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md';
                    }

                    // Show welcome video if not watched
                    if (welcomeSection) {
                        if (!welcomeWatched) {
                            welcomeSection.classList.remove('hidden');
                        } else {
                            welcomeSection.classList.add('hidden');
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to load onboarding', e);
            }
        }

        async function markWelcomeWatched() {
            try {
                const resp = await fetch(`${API_BASE}/api/training/onboarding`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ completed: true })
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) return;
                showToast('Onboarding marked complete', 'success');
                const welcomeSection = document.getElementById('welcome-video-section');
                if (welcomeSection) welcomeSection.classList.add('hidden');
                loadOnboardingStatus();
            } catch (e) {
                console.error('Failed to update onboarding', e);
                showToast('Failed to update onboarding status', 'error');
            }
        }

        function selectCategory(categoryName) {
            sessionState.selectedCategory = categoryName;
            document.getElementById('selected-category-title').textContent = categoryName;
            document.getElementById('category-selection').classList.add('hidden');
            document.getElementById('training-config').classList.remove('hidden');
        }

        document.getElementById('back-to-categories').addEventListener('click', () => {
            document.getElementById('training-config').classList.add('hidden');
            document.getElementById('category-selection').classList.remove('hidden');
        });

        // Start training session
        document.getElementById('start-training-btn').addEventListener('click', async () => {
            sessionState.difficulty = document.getElementById('difficulty-level').value;
            sessionState.duration = parseInt(document.getElementById('session-duration').value);
            sessionState.mode = document.getElementById('training-mode').value;

            const startBtn = document.getElementById('start-training-btn');
            const originalText = startBtn.innerHTML;

            startBtn.disabled = true;
            startBtn.innerHTML = '<div class="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div> Starting...';

            // Request microphone access
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                showToast('Microphone access required. Please allow and try again.', 'error');
                startBtn.disabled = false;
                startBtn.innerHTML = originalText;
                return;
            }

            // Create session in database
            try {
                const response = await fetch(`${API_BASE}/api/training/start`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        category: sessionState.selectedCategory,
                        difficulty: sessionState.difficulty,
                        duration_minutes: sessionState.duration,
                        mode: sessionState.mode,
                        course_id: sessionState.selectedCourseId
                    })
                });

                const data = await response.json();
                sessionState.sessionId = data.session_id;

                // Save to localStorage
                sessionStorage.setItem('ahl_active_session', JSON.stringify({
                    session_id: data.session_id,
                    category: sessionState.selectedCategory,
                    mode: sessionState.mode
                }));

                // Show training screen
                document.getElementById('training-config').classList.add('hidden');
                document.getElementById('training-session').classList.remove('hidden');
                updateContextChips();

                showToast('Session started! Good luck.', 'success');

                // Initialize and start
                initializeSpeechRecognition();

                // Start countdown before actual session start
                startCountdown(3, () => {
                    startTrainingSession();

                    // Start autosave loop (every 30s)
                    if (sessionState.autosaveInterval) clearInterval(sessionState.autosaveInterval);
                    sessionState.autosaveInterval = setInterval(() => {
                        if (sessionState.isActive && !sessionState.hasEnded && !sessionState.isPaused) {
                            saveProgress(true); // silent=true
                        }
                    }, 30000);
                });

            } catch (error) {
                console.error('Error starting session:', error);
                showToast('Failed to start session. Please try again.', 'error');
            } finally {
                startBtn.disabled = false;
                startBtn.innerHTML = originalText;
            }
        });

        async function getDeepgramToken() {
            try {
                const res = await fetch(`${API_BASE}/api/deepgram-token`, { credentials: 'same-origin' });
                const data = await res.json();
                if (data.key) return data.key;
                throw new Error(data.error || 'No key');
            } catch (e) {
                console.error('Deepgram token error:', e);
                return null;
            }
        }

        async function initializeDeepgram() {
            if (sessionState.deepgramSocket && (sessionState.deepgramSocket.readyState === 0 || sessionState.deepgramSocket.readyState === 1)) return;

            const key = await getDeepgramToken();
            if (!key) {
                showToast('Failed to connect to speech service', 'error');
                return;
            }

            const socket = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true', ['token', key]);

            socket.onopen = () => {
                console.log('Deepgram connected');
                if (sessionState.deepgramKeepAlive) clearInterval(sessionState.deepgramKeepAlive);
                sessionState.deepgramKeepAlive = setInterval(() => {
                    if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'KeepAlive' }));
                }, 3000);
            };

            socket.onmessage = (message) => {
                if (!sessionState.isActive || sessionState.isPaused || sessionState.isAISpeaking) return;

                const data = JSON.parse(message.data);
                if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
                    const transcript = data.channel.alternatives[0].transcript;
                    if (!transcript) return;

                    const isFinal = data.is_final;

                    if (sessionState.speechTimeout) clearTimeout(sessionState.speechTimeout);

                    const liveDisplay = document.getElementById('live-transcript');

                    if (isFinal) {
                        sessionState.currentTranscript += ' ' + transcript;
                    }

                    let fullDisplay = sessionState.currentTranscript;
                    if (!isFinal) fullDisplay += ' ' + transcript;

                    if (liveDisplay) liveDisplay.textContent = fullDisplay.slice(-100);

                    // Silence detection (4s)
                    sessionState.speechTimeout = setTimeout(() => {
                        const fullText = fullDisplay.trim();
                        if (fullText) {
                             processUserInput(fullText);
                        }
                        sessionState.currentTranscript = '';
                    }, 4000);
                }
            };

            socket.onclose = () => {
                console.log('Deepgram closed');
                sessionState.deepgramSocket = null;
                // Auto-reconnect if session is active
                if (sessionState.isActive && !sessionState.hasEnded) {
                    console.log('Attempting to reconnect Deepgram...');
                    setTimeout(() => initializeDeepgram(), 1000);
                }
            };

            socket.onerror = (e) => {
                console.error('Deepgram error', e);
            };

            sessionState.deepgramSocket = socket;
        }

        function initializeSpeechRecognition() {
            initializeDeepgram();
        }

        function startCountdown(seconds, onComplete) {
            // Create countdown overlay
            const overlay = document.createElement('div');
            overlay.id = 'countdown-overlay';
            overlay.className = 'fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50';
            overlay.innerHTML = `<div class="text-white font-bold" style="font-size: 8rem;">${seconds}</div>`;
            document.body.appendChild(overlay);

            let count = seconds;
            const interval = setInterval(() => {
                count--;
                if (count > 0) {
                    overlay.innerHTML = `<div class="text-white font-bold animate-pulse" style="font-size: 8rem;">${count}</div>`;
                } else {
                    clearInterval(interval);
                    document.body.removeChild(overlay);
                    if (onComplete) onComplete();
                }
            }, 1000);
        }

        async function initializeAudio() {
             if (sessionState.mediaStream) return;
             try {
                 const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                 sessionState.mediaStream = stream;

                 // Audio Visualization Setup
                 const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                 const analyser = audioContext.createAnalyser();
                 const source = audioContext.createMediaStreamSource(stream);
                 source.connect(analyser);
                 analyser.fftSize = 64;

                 sessionState.audioContext = audioContext;
                 sessionState.analyser = analyser;

                 updateVisualizer();

             } catch (e) {
                 console.error('Mic initialization error', e);
                 showToast('Microphone access denied', 'error');
             }
        }

        function updateVisualizer() {
            if (!sessionState.analyser) return;

            const dataArray = new Uint8Array(sessionState.analyser.frequencyBinCount);
            sessionState.analyser.getByteFrequencyData(dataArray);

            // Calculate volume level (simple average of lower frequencies)
            let sum = 0;
            const count = 5; // Use first 5 bins
            for(let i = 0; i < count; i++) {
                sum += dataArray[i];
            }
            const avg = sum / count;

            // Update bars
            const bars = document.getElementById('mic-visualizer').children;
            const sensitivity = 2.5; // Multiplier

            if (avg > 10) {
                 document.getElementById('mic-visualizer').classList.remove('opacity-50');
                 // Mirror effect: 3 is center
                 const heights = [0.5, 0.8, 1.0, 0.8, 0.5].map(m =>
                    Math.max(0.5, Math.min(2.0, (avg / 100) * m * sensitivity))
                 );

                 for(let i=0; i<bars.length; i++) {
                     bars[i].style.height = `${heights[i]}rem`;
                 }
            } else {
                 document.getElementById('mic-visualizer').classList.add('opacity-50');
                 for(let i=0; i<bars.length; i++) {
                     bars[i].style.height = '0.5rem';
                 }
            }

            sessionState.visualizerFrame = requestAnimationFrame(updateVisualizer);
        }

        async function startListening() {
            if (sessionState.recognitionActive || !sessionState.isActive || sessionState.hasEnded || sessionState.aiPending || sessionState.isAISpeaking) return;
            try {
                // Ensure Deepgram socket is ready
                if (!sessionState.deepgramSocket || sessionState.deepgramSocket.readyState !== 1) {
                    await initializeDeepgram();
                    let attempts = 0;
                    while ((!sessionState.deepgramSocket || sessionState.deepgramSocket.readyState !== 1) && attempts < 20) {
                        await new Promise(r => setTimeout(r, 100));
                        attempts++;
                    }
                }

                if (!sessionState.deepgramSocket || sessionState.deepgramSocket.readyState !== 1) {
                    console.error('Deepgram socket not ready');
                    return;
                }

                // Ensure audio stream is ready
                await initializeAudio();
                if (!sessionState.mediaStream) return;

                // Reuse or create recorder
                if (!sessionState.mediaRecorder) {
                    const mediaRecorder = new MediaRecorder(sessionState.mediaStream);
                    sessionState.mediaRecorder = mediaRecorder;

                    mediaRecorder.addEventListener('dataavailable', event => {
                        if (event.data.size > 0 &&
                            sessionState.deepgramSocket &&
                            sessionState.deepgramSocket.readyState === 1 &&
                            sessionState.recognitionActive) { // Gate sending
                            sessionState.deepgramSocket.send(event.data);
                        }
                    });
                    mediaRecorder.start(250);
                } else if (sessionState.mediaRecorder.state === 'paused') {
                    sessionState.mediaRecorder.resume();
                }

                sessionState.recognitionActive = true;
                updateStatus('Listening...', 'bg-blue-500');
            } catch (e) {
                console.log('Error starting listening:', e);
                showToast('Microphone error', 'error');
            }
        }

        function stopListening() {
            if (sessionState.mediaRecorder && sessionState.mediaRecorder.state === 'recording') {
                sessionState.mediaRecorder.pause();
            }
            // Do NOT stop the tracks here, to allow fast resume
            sessionState.recognitionActive = false;
        }

        async function processUserInput(text) {
            if (!sessionState.isActive || sessionState.hasEnded) return;
            const normalized = normalizeText(text);
            if (sessionState.aiPending) return;
            if (normalizeText(sessionState.lastUserText) === normalized && (Date.now() - sessionState.lastUserAt) < 4000) return;

            // Fix race condition: Lock immediately
            sessionState.aiPending = true;

            try {
                stopListening();
                addMessage(text, 'user');
                sessionState.lastUserText = text;
                sessionState.lastUserAt = Date.now();

                // 1. Log user message
                await fetch(`${API_BASE}/api/training/message`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: sessionState.sessionId,
                        role: 'user',
                        content: text,
                        context_source: 'speech'
                    })
                });

                // Trigger autosave
                saveProgress();

                updateStatus('Evaluating...', 'bg-yellow-400');

                // 2. Evaluate Answer
                const feedbackText = await evaluateUserAnswer(text);

                if (feedbackText && sessionState.isActive && !sessionState.hasEnded) {
                    addMessage(feedbackText, 'ai');
                    sessionState.lastAIMessage = feedbackText;

                    // Speak feedback and wait for it to finish (approx) or just queue it
                    await speakAsync(feedbackText);
                }

                // 3. Get Next Question
                if (sessionState.isActive && !sessionState.hasEnded) {
                    updateStatus('Preparing next question...', 'bg-blue-400');
                    await fetchNextQuestion();
                }

            } catch (e) {
                console.error('Error in conversation flow:', e);
                showToast('Error processing response', 'error');
            } finally {
                sessionState.aiPending = false;
                if (sessionState.isActive && !sessionState.hasEnded && !sessionState.isPaused && !sessionState.isAISpeaking) {
                     setTimeout(() => startListening(), 500);
                }
            }
        }

        async function evaluateUserAnswer(userText) {
            if (!sessionState.currentQuestion) return null;
            try {
                const response = await fetch(`${API_BASE}/api/training/evaluate-answer`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: sessionState.sessionId,
                        question_id: sessionState.currentQuestion.id,
                        user_answer: userText
                    })
                });
                const data = await response.json();
                if (!response.ok) {
                    console.error('Evaluation failed', data);
                    return "I couldn't evaluate that properly. Let's move on.";
                }

                const evaluation = data.evaluation;

                // Log system feedback
                await fetch(`${API_BASE}/api/training/message`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: sessionState.sessionId,
                        role: 'system',
                        content: evaluation.feedback || '',
                        context_source: 'evaluation',
                        evaluation_data: evaluation
                    })
                });

                return evaluation.speak_feedback || evaluation.feedback || '';
            } catch (error) {
                console.error('Error in evaluation:', error);
                return "I had trouble checking that answer.";
            }
        }

        async function fetchNextQuestion() {
            try {
                sessionState.currentQuestion = null;
                const nextQ = await fetch(`${API_BASE}/api/training/get-next-question`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionState.sessionId })
                });
                const nextData = await nextQ.json();

                if (!nextQ.ok) {
                    console.error('Failed to get next question', nextData);
                    return;
                }

                if (nextData.done) {
                    sessionState.hasEnded = true;
                    setTimeout(() => endSession(), 500);
                    return;
                }

                sessionState.currentQuestion = nextData.question;
                const qText = enforceQuestion(nextData.question.question_text);

                // Add next question to UI
                addMessage(qText, 'ai');
                sessionState.lastAIMessage = qText;

                // Log assistant question
                await fetch(`${API_BASE}/api/training/message`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: sessionState.sessionId,
                        role: 'assistant',
                        content: qText,
                        context_source: 'question'
                    })
                });

                // Speak next question
                await speakAsync(qText);

            } catch (error) {
                console.error('Error fetching next question:', error);
            }
        }

        // Helper to wrap speak in a promise (optional, effectively just triggers it)
        function speakAsync(text) {
            return new Promise((resolve) => {
                speak(text, resolve); // Modified speak to accept callback
            });
        }


        function speak(text, onComplete) {
            if (sessionState.isMuted) {
                if (onComplete) onComplete();
                return;
            }

            // CRITICAL FIX: Stop recognition while AI speaks to prevent self-hearing (audio loopback)
            stopListening();
            sessionState.currentTranscript = '';
            const liveDisplay = document.getElementById('live-transcript');
            if (liveDisplay) liveDisplay.textContent = '';

            sessionState.isAISpeaking = true;
            updateStatus('AI Speaking...', 'bg-green-500');

            synthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.05;
            if (selectedVoice) utterance.voice = selectedVoice;

            utterance.onend = () => {
                sessionState.isAISpeaking = false;
                if (onComplete) onComplete();
            };

            utterance.onerror = () => {
                sessionState.isAISpeaking = false;
                if (onComplete) onComplete();
            };

            sessionState.currentUtterance = utterance;
            synthesis.speak(utterance);
        }

        function addMessage(text, sender) {
            const row = document.createElement('div');
            const isUser = sender === 'user';

            // Update history
            if (sessionState.conversationHistory) {
                sessionState.conversationHistory.push({
                    role: isUser ? 'user' : 'assistant',
                    content: text
                });
            }

            row.className = `flex items-end ${isUser ? 'justify-end' : 'justify-start'} gap-2`;

            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-ai'} whitespace-pre-wrap text-sm`;
            bubble.textContent = text;

            // Scenario chain indicator for multi-turn questions
            if (!isUser && /Continuing from the previous scenario/i.test(text)) {
                showScenarioChip();
            }

            const time = document.createElement('div');
            time.className = 'msg-time mt-1';
            time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const side = document.createElement('div');
            side.className = 'flex flex-col items-center';
            const avatar = document.createElement('div');
            avatar.className = `avatar ${isUser ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`;
            avatar.textContent = isUser ? '🧑' : '🤖';

            side.appendChild(avatar);
            side.appendChild(time);

            if (isUser) {
                row.appendChild(bubble);
                row.appendChild(side);
            } else {
                row.appendChild(side);
                row.appendChild(bubble);
            }

            const container = document.getElementById('chat-container');
            container.appendChild(row);
            container.scrollTop = container.scrollHeight;
        }

        function showScenarioChip() {
            const indicator = document.getElementById('status-indicator');
            const chip = document.createElement('span');
            chip.className = 'px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded border border-purple-200';
            chip.textContent = 'Scenario Chain';
            indicator.appendChild(chip);
            setTimeout(() => chip.remove(), 5000);
        }
        function updateStatus(text, colorClass) {
            const indicator = document.getElementById('status-indicator');
            const dot = indicator.querySelector('.relative.inline-flex.rounded-full');
            const label = indicator.querySelector('span.text-sm');
            if (dot) {
                dot.className = `relative inline-flex rounded-full h-3 w-3 ${colorClass}`;
            }
            if (label) {
                label.textContent = text;
            }
        }
        function setReportContent(html) {
            const el = document.getElementById('report-content');
            if (el) el.innerHTML = html;
        }

        function updateContextChips() {
            const container = document.getElementById('context-chips');
            if (!container) return;
            container.classList.remove('hidden');
            container.innerHTML = '';
            const items = [
                { label: 'Category', value: sessionState.selectedCategory, cls: 'bg-slate-100 text-slate-700 border border-slate-200' },
                { label: 'Difficulty', value: sessionState.difficulty, cls: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
                { label: 'Mode', value: sessionState.mode, cls: 'bg-amber-100 text-amber-700 border border-amber-200' }
            ];
            items.forEach(it => {
                if (!it.value) return;
                const chip = document.createElement('span');
                chip.className = `px-2 py-1 text-xs font-semibold rounded ${it.cls}`;
                chip.textContent = `${it.label}: ${it.value}`;
                container.appendChild(chip);
            });
        }

        function startTimer() {
            updateTimerDisplay();

            if (sessionState.timerInterval) clearInterval(sessionState.timerInterval);

            sessionState.timerInterval = setInterval(() => {
                if (!sessionState.isPaused && sessionState.isActive) {
                    sessionState.timeRemaining--;
                    updateTimerDisplay();

                    if (sessionState.timeRemaining <= 0) {
                        if (sessionState.mode === 'practice') {
                             if (sessionState.timeRemaining === 0) {
                                 showToast("Time's up! You can continue practicing.", 'info');
                             }
                        } else {
                             if (sessionState.timeRemaining === 0) {
                                 const msg = sessionState.mode === 'exam' ? "Time's up! Submitting Exam..." : "Time's up! Session ending...";
                                 showToast(msg, 'warning');
                             }
                             endSession();
                        }
                    }

                    // Periodic autosave every 30 seconds
                    if (sessionState.timeRemaining % 30 === 0) {
                        saveProgress();
                    }
                }
            }, 1000);
        }

        async function startTrainingSession() {
        sessionState.isActive = true;
        sessionState.timeRemaining = sessionState.duration * 60;

        // Exam mode visual and constraints
        const examBadge = document.getElementById('exam-badge');
        const pauseBtn = document.getElementById('pause-btn');

        if (sessionState.mode === 'exam') {
            examBadge.classList.remove('hidden');
            document.getElementById('session-timer').classList.add('text-red-600');
            // Disable pause in exam mode
            if (pauseBtn) pauseBtn.classList.add('hidden');
        } else {
            examBadge.classList.add('hidden');
            document.getElementById('session-timer').classList.remove('text-red-600');
            if (pauseBtn) pauseBtn.classList.remove('hidden');
        }

        startTimer();

            updateStatus('Initializing questions...', 'bg-blue-400');
            try {
                const response = await fetch(`${API_BASE}/api/training/get-next-question`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionState.sessionId })
                });
                const data = await response.json();
                if (!response.ok || data.done) {
                    showToast('No prepared questions found for this session.', 'error');
                    endSession();
                    return;
                }
                sessionState.currentQuestion = data.question;
                const qText = enforceQuestion(data.question.question_text);
                addMessage(qText, 'ai');
                sessionState.lastAIMessage = qText;
                await fetch(`${API_BASE}/api/training/message`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: sessionState.sessionId,
                        role: 'assistant',
                        content: qText,
                        context_source: 'question'
                    })
                });

                // Speak and then start listening
                speak(qText, () => {
                    if (sessionState.isActive && !sessionState.isPaused) {
                        startListening();
                    }
                });

            } catch (e) {
                console.error('Failed to start question flow', e);
                showToast('Failed to load questions for this session.', 'error');
            }
        }

        function updateTimerDisplay() {
            const absTime = Math.abs(sessionState.timeRemaining);
            const minutes = Math.floor(absTime / 60);
            const seconds = absTime % 60;
            const sign = sessionState.timeRemaining < 0 ? '-' : '';
            const timerEl = document.getElementById('session-timer');
            timerEl.textContent = `${sign}${minutes}:${seconds.toString().padStart(2, '0')}`;

            if (sessionState.timeRemaining < 0) {
                 timerEl.classList.add('text-amber-600');
                 timerEl.classList.remove('text-indigo-600');
            } else {
                 timerEl.classList.remove('text-amber-600');
                 timerEl.classList.add('text-indigo-600');
            }
        }

        async function endSession() {
            sessionState.isActive = false;
            sessionState.hasEnded = true;
            stopListening();

            // Cleanup audio
            if (sessionState.mediaRecorder) {
                if (sessionState.mediaRecorder.state !== 'inactive') sessionState.mediaRecorder.stop();
                sessionState.mediaRecorder = null;
            }
            if (sessionState.mediaStream) {
                sessionState.mediaStream.getTracks().forEach(t => t.stop());
                sessionState.mediaStream = null;
            }
            if (sessionState.deepgramSocket) {
                sessionState.deepgramSocket.close();
                sessionState.deepgramSocket = null;
            }
            if (sessionState.deepgramKeepAlive) {
                clearInterval(sessionState.deepgramKeepAlive);
                sessionState.deepgramKeepAlive = null;
            }

            synthesis.cancel();

            if (sessionState.timerInterval) {
                clearInterval(sessionState.timerInterval);
            }

            // Clear active session from storage
            sessionStorage.removeItem('ahl_active_session');

            // Mark session complete
            await fetch(`${API_BASE}/api/training/end`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionState.sessionId })
            });

            // Generate report
            document.getElementById('training-session').classList.add('hidden');
            document.getElementById('report-screen').classList.remove('hidden');
            setReportContent('<p class="text-center">🔄 Generating performance report...</p>');

            async function loadReportOnce() {
                const resp = await fetch(`${API_BASE}/api/training/report/${sessionState.sessionId}`, { method: 'GET', credentials: 'same-origin' });
                let data = null;
                try {
                    data = await resp.json();
                } catch (e) {
                    throw new Error('Invalid server response');
                }
                if (!resp.ok) {
                    throw new Error(data && (data.error || data.details) ? (data.error || data.details) : 'Failed');
                }
                if (data && typeof data.report_html !== 'undefined') {
                    const html = data.report_html || "<div class='text-slate-500 text-sm'>No questions were recorded for this session.</div>";
                    setReportContent(html);
                    return data;
                }
                throw new Error('No report_html in response');
            }
            try {
                let attempts = 3;
                let data = null;
                while (attempts > 0) {
                    try {
                        data = await loadReportOnce();
                        break;
                    } catch (e) {
                        attempts--;
                        if (attempts === 0) throw e;
                        await new Promise(r => setTimeout(r, 700));
                    }
                }

                // Recommendations logic
                const recContainer = document.getElementById('report-recommendations');
                const recContent = document.getElementById('recommendation-content');
                if (data && data.session && data.session.overall_score !== undefined && data.session.overall_score !== null) {
                    const score = data.session.overall_score;
                    let recHTML = '';

                    // Special handling for Exam Mode
                    if (sessionState.mode === 'exam') {
                        const passed = score >= 8.0;
                        const statusColor = passed ? 'green' : 'red';
                        const statusIcon = passed ? '🏆' : '⚠️';
                        const statusText = passed ? 'CERTIFICATION PASSED' : 'CERTIFICATION FAILED';

                        recHTML = `
                            <div class="text-center mb-6 p-4 rounded-xl border-2 border-${statusColor}-200 bg-${statusColor}-50">
                                <div class="text-4xl mb-2">${statusIcon}</div>
                                <h3 class="text-2xl font-bold text-${statusColor}-800 uppercase tracking-wide">${statusText}</h3>
                                <p class="text-${statusColor}-700 font-medium mt-1">Score: ${score}/10 (Required: 8.0)</p>
                            </div>
                        `;

                        if (passed) {
                            recHTML += `
                                <p>• Congratulations! You have demonstrated mastery of this module.</p>
                                <p>• Your certification status has been updated.</p>
                            `;
                        } else {
                            recHTML += `
                                <p>• You did not meet the passing criteria for this exam.</p>
                                <p>• Review the "Areas to Improve" section below.</p>
                                <p>• Try a few <strong>Practice Mode</strong> sessions before retaking.</p>
                            `;
                        }
                    } else {
                        // Standard feedback for other modes
                        if (score < 6.0) {
                            recHTML = `
                                <p>• Review the training material for <strong>${data.session.category}</strong>.</p>
                                <p>• Try a <strong>Practice Mode</strong> session to build confidence without time pressure.</p>
                                <p>• Focus on including more specific key points in your answers.</p>
                            `;
                        } else if (score < 8.0) {
                            recHTML = `
                                <p>• Good progress! You're getting the core concepts.</p>
                                <p>• To reach Expert level, focus on using professional terminology.</p>
                                <p>• Try another session at <strong>Basics</strong> difficulty to improve consistency.</p>
                            `;
                        } else {
                            recHTML = `
                                <p>• Excellent work! You have mastered this level.</p>
                                <p>• You are ready to attempt <strong>Field Ready</strong> difficulty.</p>
                                <p>• Consider taking the <strong>Certification Exam</strong> for this module.</p>
                            `;
                        }
                    }

                    recContent.innerHTML = recHTML;
                    recContainer.classList.remove('hidden');
                } else {
                    recContainer.classList.add('hidden');
                }

            } catch (e) {
                setReportContent(`
                  <div class="text-center">
                    <p class="text-slate-500 mb-2">Report is still preparing...</p>
                    <button id="retry-report-btn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Retry</button>
                    <div class="mt-2 text-xs text-slate-400">${e?.message || 'Unknown error'}</div>
                  </div>
                `);
                document.getElementById('retry-report-btn')?.addEventListener('click', async () => {
                    setReportContent('<p class="text-center">🔄 Generating performance report...</p>');
                    try {
                        await loadReportOnce();
                    } catch (err) {
                        setReportContent('<p class="text-center text-red-500">Failed to load report.</p>');
                    }
                });
            }
        }

        // Report generation is now fully backend-driven via GET /api/training/report/{session_id}

        // Control buttons
        document.getElementById('pause-btn').addEventListener('click', () => {
            sessionState.isPaused = !sessionState.isPaused;
            document.getElementById('pause-btn').innerHTML = sessionState.isPaused ? '▶️ Resume' : '⏸ Pause';

            if (sessionState.isPaused) {
                synthesis.cancel();
                stopListening();
                updateStatus('Paused', 'bg-yellow-500');
            } else {
                updateStatus('Resuming...', 'bg-blue-400');
                setTimeout(() => {
                    if (!sessionState.isAISpeaking) startListening();
                }, 500);
            }
        });

        document.getElementById('stop-btn').addEventListener('click', () => {
            if (confirm('End session now and generate report?')) {
                endSession();
            }
        });

        document.getElementById('done-speaking-btn').addEventListener('click', () => {
            if (sessionState.speechTimeout) {
                clearTimeout(sessionState.speechTimeout);
            }
            const text = sessionState.currentTranscript.trim();
            if (!text) {
                showToast("I didn't hear anything. Please speak clearly.", 'warning');
                return;
            }
            processUserInput(text);
            sessionState.currentTranscript = '';
        });

        document.getElementById('mute-btn').addEventListener('click', () => {
            sessionState.isMuted = !sessionState.isMuted;
            document.getElementById('mute-btn').textContent = sessionState.isMuted ? '🔊 Unmute AI' : '🔇 Mute AI';
            if (sessionState.isMuted) synthesis.cancel();
        });

        document.getElementById('repeat-btn').addEventListener('click', () => {
            if (sessionState.lastAIMessage && !sessionState.isAISpeaking) {
                speak(sessionState.lastAIMessage);
            }
        });

        const exportBtn = document.getElementById('export-pdf-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                if (!sessionState.sessionId) return;
                try {
                    const resp = await fetch(`${API_BASE}/api/sessions/${sessionState.sessionId}/export/pdf`, { method: 'GET', credentials: 'same-origin' });
                    if (!resp.ok) {
                        showToast('Failed to download PDF.', 'error');
                        return;
                    }
                    const blob = await resp.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `session_report_${sessionState.sessionId}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                } catch (e) {
                    console.error('PDF download failed', e);
                    showToast('Error downloading PDF.', 'error');
                }
            });
        }

        let resumeData = null;

        async function checkForResume() {
            try {
                const resp = await fetch(`${API_BASE}/api/training/resume-check`, { credentials: 'same-origin' });
                if (!resp.ok) return;
                const data = await resp.json();

                if (data.has_session) {
                    resumeData = data;
                    document.getElementById('resume-category').textContent = data.category;
                    const date = new Date(data.started_at);
                    document.getElementById('resume-date').textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    document.getElementById('resume-modal').classList.remove('hidden');
                }
            } catch (e) {
                console.error('Resume check failed', e);
            }
        }

        async function resumeSession() {
            if (!resumeData) return;
            document.getElementById('resume-modal').classList.add('hidden');

            // Restore state
            sessionState.sessionId = resumeData.session_id;
            sessionState.duration = 10; // Default, will be overwritten by draft if exists

            // Switch to session view
            document.getElementById('category-selection').classList.add('hidden');
            document.getElementById('training-config').classList.add('hidden');
            document.getElementById('training-session').classList.remove('hidden');
            updateContextChips();

            // Restore draft data if available
            if (resumeData.draft && resumeData.draft.data_json) {
                try {
                    const state = JSON.parse(resumeData.draft.data_json);

                    // Restore chat history
                    const container = document.getElementById('chat-container');
                    container.innerHTML = '';
                    if (state.history) {
                        state.history.forEach(msg => {
                           addMessage(msg.content, msg.role);
                           if (msg.role === 'ai') sessionState.lastAIMessage = msg.content;
                        });
                    }

                    // Restore time
                    if (state.timeRemaining) {
                        sessionState.timeRemaining = state.timeRemaining;
                        updateTimerDisplay();
                    }

                    sessionState.isActive = true;
                    startTimer();
                    startListening();

                    showToast('Session resumed', 'success');
                } catch (e) {
                    console.error('Failed to parse draft', e);
                    // Fallback to fresh start for this session ID
                    startTrainingSession();
                }
            } else {
                // No draft, just active session record
                startTrainingSession();
            }
        }

        async function discardSession() {
            document.getElementById('resume-modal').classList.add('hidden');
            if (resumeData && resumeData.session_id) {
                try {
                    await fetch(`${API_BASE}/api/training/end`, {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ session_id: resumeData.session_id })
                    });
                } catch (e) { console.error(e); }
            }
        }

        async function saveProgress() {
            if (!sessionState.sessionId || !sessionState.isActive) return;

            const history = [];
            // Extract history from UI or sessionState if we kept it fully in sync
            // We pushed to sessionState.conversationHistory in addMessage
            // But let's verify sessionState.conversationHistory is initialized
            if (!sessionState.conversationHistory) sessionState.conversationHistory = [];

            const state = {
                history: sessionState.conversationHistory,
                timeRemaining: sessionState.timeRemaining,
                lastUpdate: Date.now()
            };

            try {
                await fetch(`${API_BASE}/api/training/autosave`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        session_id: sessionState.sessionId,
                        state: state
                    })
                });

                // Show saved indicator
                const indicator = document.getElementById('autosave-indicator');
                if (indicator) {
                    indicator.classList.remove('hidden');
                    indicator.classList.add('opacity-100');
                    setTimeout(() => {
                        indicator.classList.add('opacity-0');
                        setTimeout(() => indicator.classList.add('hidden'), 500);
                    }, 2000);
                }
            } catch (e) {
                console.warn('Autosave failed', e);
            }
        }

        document.getElementById('new-session-btn').addEventListener('click', () => {
            window.location.reload();
        });

        // Initial checks
        window.addEventListener('load', () => {
            loadCourses();
            loadOnboardingStatus();
            checkForResume();

            // Multi-turn tip logic
            const diffSelect = document.getElementById('difficulty-level');
            const modeSelect = document.getElementById('training-mode');
            const tip = document.getElementById('multi-turn-tip');

            function updateTip() {
                const isFieldReady = diffSelect.value === 'field-ready';
                const isExam = modeSelect.value === 'exam';

                if (isFieldReady || isExam) {
                    tip.classList.remove('hidden');
                } else {
                    tip.classList.add('hidden');
                }
            }

            diffSelect.addEventListener('change', updateTip);
            modeSelect.addEventListener('change', updateTip);
        });
