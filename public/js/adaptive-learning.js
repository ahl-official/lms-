class AdaptiveLearning {
    constructor() {
        this.currentTest = null;
        this.currentQuestionIndex = 0;
        this.answers = [];
        this.sessionId = null;
        this.testInProgress = false; // Flag to prevent duplicate modals
        this.bindEvents();
    }

    bindEvents() {
        // Listen for video completion events
        document.addEventListener('videoCompleted', (event) => {
            console.log('AdaptiveLearning: videoCompleted event received', event.detail);
            this.handleVideoCompletion(event.detail);
        });
        

    }

    async handleVideoCompletion(data) {
        console.log('handleVideoCompletion called with data:', data);
        console.log('testInProgress flag:', this.testInProgress);
        
        if (data.adaptiveTest && data.adaptiveTest.shouldTrigger && !this.testInProgress) {
            console.log('Conditions met, showing adaptive test prompt');
            // Ensure videoId is available in testData
            const testData = {
                ...data.adaptiveTest,
                videoId: data.adaptiveTest.videoId || data.videoId
            };
            this.showAdaptiveTestPrompt(testData);
        } else {
            console.log('Conditions not met:', {
                hasAdaptiveTest: !!data.adaptiveTest,
                shouldTrigger: data.adaptiveTest?.shouldTrigger,
                testInProgress: this.testInProgress
            });
        }
    }

    showAdaptiveTestPrompt(testData) {
        console.log('showAdaptiveTestPrompt called with testData:', JSON.stringify(testData, null, 2));
        console.log('testData.videoId:', testData.videoId);
        
        // Remove any existing modals first
        const existingModals = document.querySelectorAll('.adaptive-test-modal');
        existingModals.forEach(modal => {
            console.log('Removing existing modal');
            modal.remove();
        });
        
        const modal = document.createElement('div');
        modal.className = 'adaptive-test-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🎯 Adaptive Learning Assessment</h3>
                    <p>Test your understanding with personalized questions</p>
                </div>
                <div class="modal-body">
                    <div class="test-info">
                        <div class="info-item">
                            <span class="icon">📊</span>
                            <span>Difficulty: ${testData.difficulty || 'Adaptive'}</span>
                        </div>
                        <div class="info-item">
                            <span class="icon">⏱️</span>
                            <span>Estimated time: ${testData.estimatedTime || '5-10'} minutes</span>
                        </div>
                        <div class="info-item">
                            <span class="icon">🎯</span>
                            <span>Questions adapt to your performance</span>
                        </div>
                    </div>
                    <p class="test-description">
                        This assessment will help us understand your learning progress and provide personalized recommendations.
                    </p>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="skip-test-btn">Skip for now</button>
                    <button class="btn btn-primary" id="start-test-btn">Start Assessment</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        const skipBtn = modal.querySelector('#skip-test-btn');
        const startBtn = modal.querySelector('#start-test-btn');
        
        skipBtn.addEventListener('click', () => {
            modal.remove();
            this.testInProgress = false; // Reset flag when skipping
        });
        
        startBtn.addEventListener('click', () => {
            console.log('Start Assessment button clicked with videoId:', testData.videoId);
            this.startAdaptiveTest(testData.videoId);
        });
    }

    async startAdaptiveTest(videoId) {
        try {
            console.log('startAdaptiveTest called with videoId:', videoId);
            console.log('videoId type:', typeof videoId);
            
            // Store video ID for potential restart
            this.lastVideoId = videoId;
            
            // Set test in progress flag
            this.testInProgress = true;
            
            // Close the prompt modal
            const modal = document.querySelector('.adaptive-test-modal');
            if (modal) modal.remove();

            // Show loading
            this.showLoading('Generating personalized questions...');

            // Generate adaptive test
            console.log('Making API call to generate adaptive test with videoId:', videoId);
            const response = await fetch('/api/adaptive-test/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ videoId })
            });

            console.log('API response status:', response.status);
            console.log('API response ok:', response.ok);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('API error response:', errorData);
                throw new Error(errorData.error || 'Failed to generate test');
            }

            const testData = await response.json();
            console.log('API response received successfully');
            
            // Additional validation
            if (!testData) {
                throw new Error('API returned null or undefined response');
            }
            
            if (!testData.questions) {
                console.error('API response missing questions field');
                throw new Error('API response is missing questions data');
            }
            
            if (!Array.isArray(testData.questions)) {
                console.error('Questions field is not an array:', typeof testData.questions);
                throw new Error('Questions data is not in the expected format');
            }
            
            if (testData.questions.length === 0) {
                console.error('Questions array is empty');
                throw new Error('No questions were generated for this test');
            }
            
            this.currentTest = testData;
            console.log('Test initialized with', this.currentTest.questions.length, 'questions');
            
            this.sessionId = this.currentTest.sessionId;
            this.currentQuestionIndex = 0;
            this.answers = [];

            this.hideLoading();
            this.showTestInterface();
        } catch (error) {
            console.error('Error starting adaptive test:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                videoId: videoId
            });
            this.hideLoading();
            this.testInProgress = false; // Reset flag on error
            
            // Use the error message from the server response
            const errorMessage = error.message || 'Failed to start assessment. Please try again.';
            this.showError(errorMessage);
        }
    }

    showTestInterface() {
        // Check if test data is available
        if (!this.currentTest || !this.currentTest.questions || this.currentTest.questions.length === 0) {
            console.error('Cannot show test interface: invalid test data', {
                currentTest: this.currentTest,
                questions: this.currentTest?.questions
            });
            this.showError('Test data is not available. Please try again.');
            this.testInProgress = false;
            return;
        }
        
        const testContainer = document.createElement('div');
        testContainer.className = 'adaptive-test-container';
        testContainer.innerHTML = `
            <div class="test-header">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <div class="test-info">
                    <span class="question-counter">Question 1 of ${this.currentTest.questions.length}</span>
                    <button class="btn btn-text" id="exit-test-btn">Exit Test</button>
                </div>
            </div>
            <div class="test-content">
                <div class="question-container"></div>
                <div class="test-actions">
                    <button class="btn btn-secondary" id="prev-btn" disabled>Previous</button>
                    <button class="btn btn-primary" id="next-btn">Next</button>
                </div>
            </div>
        `;

        document.body.appendChild(testContainer);
        
        // Bind event listeners with proper context
        document.getElementById('exit-test-btn').addEventListener('click', () => this.exitTest());
        document.getElementById('prev-btn').addEventListener('click', () => this.previousQuestion());
        document.getElementById('next-btn').addEventListener('click', () => this.nextQuestion());
        
        this.displayCurrentQuestion();
    }

    displayCurrentQuestion() {
        const question = this.currentTest.questions[this.currentQuestionIndex];
        const container = document.querySelector('.question-container');
        
        let questionHTML = `
            <div class="question">
                <h3 class="question-title">${question.question}</h3>
                <div class="question-type-${question.type}">
        `;

        switch (question.type) {
            case 'multiple_choice':
                questionHTML += this.renderMultipleChoice(question);
                break;
            case 'typing':
                questionHTML += this.renderTypingQuestion(question);
                break;
            case 'audio_response':
            case 'audio':
                questionHTML += this.renderAudioQuestion(question);
                break;
            case 'scenario_based':
            case 'scenario':
                questionHTML += this.renderScenarioQuestion(question);
                break;
            default:
                // Default to typing question for unknown types
                console.warn(`Unknown question type: ${question.type}, defaulting to typing`);
                questionHTML += this.renderTypingQuestion(question);
                break;
        }

        questionHTML += `
                </div>
            </div>
        `;

        container.innerHTML = questionHTML;
        
        // Bind event listeners for input elements
        this.bindQuestionEvents(question);
        
        this.updateProgress();
        this.updateNavigation();
    }

    renderMultipleChoice(question) {
        return `
            <div class="options">
                ${question.options.map((option, index) => `
                    <label class="option">
                        <input type="radio" name="question_${this.currentQuestionIndex}" value="${index}" 
                               ${this.answers[this.currentQuestionIndex] === index ? 'checked' : ''}>
                        <span class="option-text">${option}</span>
                    </label>
                `).join('')}
            </div>
        `;
    }

    renderTypingQuestion(question) {
        const currentAnswer = this.answers[this.currentQuestionIndex]?.answer || '';
        return `
            <div class="typing-input">
                <textarea 
                    id="typing-answer-${this.currentQuestionIndex}"
                    placeholder="Type your answer here..."
                    rows="4"
                >${currentAnswer}</textarea>
            </div>
        `;
    }

    renderAudioQuestion(question) {
        // Check if this question mentions audio clip playback
        const hasAudioClip = question.question && question.question.toLowerCase().includes('audio clip will play');
        
        return `
            <div class="audio-response">
                ${hasAudioClip ? `
                    <div class="audio-playback-section">
                        <p class="instruction">🔊 Listen to the audio clip first:</p>
                        <div class="audio-playback-controls">
                            <button class="btn btn-play-clip" id="playClipBtn">▶️ Play Audio Clip</button>
                            <div class="audio-status" id="audioStatus">Click to play the audio clip</div>
                        </div>
                        <hr style="margin: 15px 0;">
                    </div>
                ` : ''}
                <p class="instruction">Record your response (up to 2 minutes):</p>
                <div class="audio-controls">
                    <button class="btn btn-record">🎤 Start Recording</button>
                    <button class="btn btn-stop" disabled>⏹️ Stop</button>
                    <button class="btn btn-play" disabled>▶️ Play</button>
                </div>
                <div class="recording-status"></div>
            </div>
        `;
    }

    renderScenarioQuestion(question) {
        return `
            <div class="scenario">
                <div class="scenario-context">
                    <h4>Scenario:</h4>
                    <p>${question.scenario || 'No scenario provided'}</p>
                </div>
                <div class="scenario-response">
                    <h4>Your Response:</h4>
                    <textarea 
                        id="scenario-answer-${this.currentQuestionIndex}"
                        placeholder="Describe how you would handle this situation..."
                        rows="6"
                    >${this.answers[this.currentQuestionIndex]?.answer || ''}</textarea>
                </div>
            </div>
        `;
    }

    bindQuestionEvents(question) {
        switch (question.type) {
            case 'typing':
                const typingTextarea = document.getElementById(`typing-answer-${this.currentQuestionIndex}`);
                if (typingTextarea) {
                    typingTextarea.addEventListener('input', (e) => {
                        this.saveAnswer(e.target.value);
                    });
                }
                break;
            case 'scenario_based':
            case 'scenario':
                const scenarioTextarea = document.getElementById(`scenario-answer-${this.currentQuestionIndex}`);
                if (scenarioTextarea) {
                    scenarioTextarea.addEventListener('input', (e) => {
                        this.saveAnswer(e.target.value);
                    });
                }
                break;
            case 'audio_response':
            case 'audio':
                const recordBtn = document.querySelector('.btn-record');
                const stopBtn = document.querySelector('.btn-stop');
                const playBtn = document.querySelector('.btn-play');
                const playClipBtn = document.querySelector('.btn-play-clip');
                
                if (recordBtn) {
                    recordBtn.addEventListener('click', () => {
                        this.startRecording();
                    });
                }
                
                if (stopBtn) {
                    stopBtn.addEventListener('click', () => {
                        this.stopRecording();
                    });
                }
                
                if (playBtn) {
                    playBtn.addEventListener('click', () => {
                        this.playRecording();
                    });
                }
                
                if (playClipBtn) {
                    playClipBtn.addEventListener('click', () => {
                        this.playQuestionAudioClip(question);
                    });
                }
                break;
            default:
                // For unknown types that default to typing, bind typing events
                if (!['multiple_choice', 'audio_response', 'audio'].includes(question.type)) {
                    const defaultTextarea = document.getElementById(`typing-answer-${this.currentQuestionIndex}`);
                    if (defaultTextarea) {
                        defaultTextarea.addEventListener('input', (e) => {
                            this.saveAnswer(e.target.value);
                        });
                    }
                }
                break;
        }
    }

    saveAnswer(value) {
        if (value instanceof Blob) {
            // For audio responses, store the blob directly
            this.answers[this.currentQuestionIndex] = value;
        } else {
            this.answers[this.currentQuestionIndex] = {
                answer: value,
                timeSpent: 0
            };
        }
    }

    nextQuestion() {
        console.log('=== NEXT QUESTION CALLED ===');
        // Check if test is available
        if (!this.currentTest || !this.currentTest.questions) {
            console.error('No test available');
            return;
        }
        
        // Validate that current question is answered before proceeding
        const question = this.currentTest.questions[this.currentQuestionIndex];
        if (question) {
            let hasAnswer = false;
            console.log('=== VALIDATION DEBUG ===');
            console.log('Question type:', question.type);
            console.log('Current question index:', this.currentQuestionIndex);
            console.log('All answers:', this.answers);
            
            switch (question.type) {
                case 'multiple_choice':
                    const selected = document.querySelector(`input[name="question_${this.currentQuestionIndex}"]:checked`);
                    if (selected) {
                        this.answers[this.currentQuestionIndex] = {
                            answer: parseInt(selected.value),
                            timeSpent: 0
                        };
                        hasAnswer = true;
                    }
                    break;
                case 'typing':
                case 'scenario_based':
                case 'scenario':
                    const textarea = document.querySelector('.question-container textarea');
                    if (textarea && textarea.value.trim()) {
                        this.answers[this.currentQuestionIndex] = {
                            answer: textarea.value.trim(),
                            timeSpent: 0
                        };
                        hasAnswer = true;
                    }
                    break;
                case 'audio_response':
                case 'audio':
                    // For audio responses, check if recording exists (audioBlob)
                    console.log('Audio validation - Question type:', question.type);
                    console.log('Audio validation - Current answer:', this.answers[this.currentQuestionIndex]);
                    console.log('Audio validation - Is Blob?', this.answers[this.currentQuestionIndex] instanceof Blob);
                    if (this.answers[this.currentQuestionIndex] && this.answers[this.currentQuestionIndex] instanceof Blob) {
                        hasAnswer = true;
                    }
                    break;
                default:
                    // Handle unknown types that default to typing
                    if (!['multiple_choice', 'audio_response', 'audio'].includes(question.type)) {
                        const defaultTextarea = document.querySelector('.question-container textarea');
                        if (defaultTextarea && defaultTextarea.value.trim()) {
                            this.answers[this.currentQuestionIndex] = {
                                answer: defaultTextarea.value.trim(),
                                timeSpent: 0
                            };
                            hasAnswer = true;
                        }
                    }
                    break;
            }
            
            // Show error if no answer provided
            if (!hasAnswer) {
                this.showError('Please provide an answer before proceeding to the next question.');
                return;
            }
        }

        if (this.currentQuestionIndex < this.currentTest.questions.length - 1) {
            console.log('=== INCREMENTING QUESTION INDEX ===');
            console.log('Old index:', this.currentQuestionIndex);
            this.currentQuestionIndex++;
            console.log('New index:', this.currentQuestionIndex);
            this.displayCurrentQuestion();
        } else {
            console.log('=== SUBMITTING TEST ===');
            this.submitTest();
        }
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.displayCurrentQuestion();
        }
    }

    updateProgress() {
        const progress = ((this.currentQuestionIndex + 1) / this.currentTest.questions.length) * 100;
        const progressBar = document.querySelector('.progress-fill');
        const counter = document.querySelector('.question-counter');
        
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (counter) counter.textContent = `Question ${this.currentQuestionIndex + 1} of ${this.currentTest.questions.length}`;
    }

    updateNavigation() {
        const prevBtn = document.querySelector('.test-actions .btn-secondary');
        const nextBtn = document.querySelector('.test-actions .btn-primary');
        
        if (prevBtn) prevBtn.disabled = this.currentQuestionIndex === 0;
        if (nextBtn) {
            nextBtn.textContent = this.currentQuestionIndex === this.currentTest.questions.length - 1 ? 'Submit Test' : 'Next';
        }
    }

    generateSuggestion(question, result) {
        if (!question || !result) return 'Review the topic and try again.';
        
        const suggestions = {
            'multiple_choice': `Review the concept related to "${question.topic || 'this topic'}". The correct answer was "${result.correctAnswer}". Make sure to understand why this option is correct.`,
            'typing': `Focus on understanding the key concepts. The expected answer was "${result.correctAnswer}". Practice similar questions to improve your understanding.`,
            'scenario_based': `Analyze the scenario more carefully. Consider all the factors mentioned in the question. The correct approach was "${result.correctAnswer}".`,
            'scenario': `Break down the scenario step by step. Think about the practical application of the concepts. The correct solution was "${result.correctAnswer}".`
        };
        
        return suggestions[question.type] || `Study the topic "${question.topic || 'related concepts'}" more thoroughly. The correct answer was "${result.correctAnswer}".`;
    }

    toggleReport() {
        const container = document.getElementById('questionsContainer');
        const toggleBtn = document.getElementById('reportToggleBtn');
        
        if (container.style.display === 'none') {
            container.style.display = 'block';
            toggleBtn.textContent = '▲ Hide Details';
        } else {
            container.style.display = 'none';
            toggleBtn.textContent = '▼ Show Details';
        }
    }

    toggleQuestion(index) {
        const content = document.getElementById(`questionContent${index}`);
        const expandBtn = document.getElementById(`expandBtn${index}`);
        
        if (content.style.display === 'none') {
            content.style.display = 'block';
            expandBtn.textContent = '▲';
        } else {
            content.style.display = 'none';
            expandBtn.textContent = '▼';
        }
    }

    async submitTest() {
        try {
            this.showLoading('Analyzing your responses...');

            // Process answers to handle audio blobs
            const processedAnswers = await this.processAnswersForSubmission();

            const response = await fetch('/api/adaptive-test/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    answers: processedAnswers
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit test');
            }

            const results = await response.json();
            
            // Debug logging
            console.log('=== FRONTEND RECEIVED RESULTS ===');
            console.log('Results object:', results);
            console.log('Score value:', results.score);
            console.log('Score percentage:', results.scorePercentage);
            console.log('Correct answers:', results.correctAnswers);
            console.log('Total questions:', results.totalQuestions);
            console.log('===============================');
            
            this.hideLoading();
            this.testInProgress = false; // Reset flag on successful completion
            this.showResults(results);
        } catch (error) {
            console.error('Error submitting test:', error);
            this.hideLoading();
            this.testInProgress = false; // Reset flag on error
            
            // Check if it's a session corruption error
            if (error.message.includes('Session corrupted')) {
                this.showSessionCorruptedError();
            } else {
                this.showError('Failed to submit test. Please try again.');
            }
        }
    }

    async processAnswersForSubmission() {
        const processedAnswers = [];
        
        for (let i = 0; i < this.answers.length; i++) {
            const answer = this.answers[i];
            
            if (answer instanceof Blob) {
                // For audio responses, mark them as audio type with metadata
                processedAnswers[i] = {
                    answer: 'Audio response provided',
                    type: 'audio_response',
                    hasAudio: true,
                    audioSize: answer.size,
                    timeSpent: 0
                };
            } else if (answer && typeof answer === 'object') {
                // Regular answer object
                processedAnswers[i] = answer;
            } else {
                // Handle other formats
                processedAnswers[i] = {
                    answer: answer || '',
                    timeSpent: 0
                };
            }
        }
        
        return processedAnswers;
    }

    setupReportEventListeners() {
        // Setup report toggle
        const reportHeader = document.getElementById('reportHeader');
        if (reportHeader) {
            reportHeader.addEventListener('click', () => this.toggleReport());
        }

        // Setup question toggles
        const questionHeaders = document.querySelectorAll('.question-header[data-question-index]');
        questionHeaders.forEach(header => {
            const index = header.getAttribute('data-question-index');
            header.addEventListener('click', () => this.toggleQuestion(index));
        });
    }

    showResults(results) {
        const testContainer = document.querySelector('.adaptive-test-container');
        if (testContainer) testContainer.remove();

        const resultsModal = document.createElement('div');
        resultsModal.className = 'test-results-modal';
        resultsModal.innerHTML = `
            <div class="modal-content">
                <div class="results-header">
                    <h3>🎉 Assessment Complete!</h3>
                    <div class="score-display">
                        <div class="score-circle">
                            <span class="score">${results.score || results.scorePercentage || 'N/A'}%</span>
                        </div>
                        <div class="debug-info" style="font-size: 12px; color: #666; margin-top: 10px;">
                            Debug: score=${results.score}, scorePercentage=${results.scorePercentage}, correct=${results.correctAnswers}, total=${results.totalQuestions}
                        </div>
                    </div>
                </div>
                <div class="results-body">
                    <div class="performance-summary">
                        <h4>Performance Summary</h4>
                        <div class="summary-grid">
                            <div class="summary-item">
                                <span class="label">Mastery Level:</span>
                                <span class="value ${results.masteryAchieved ? 'achieved' : 'not-achieved'}">
                                    ${results.masteryAchieved ? 'Achieved ✅' : 'In Progress 📈'}
                                </span>
                            </div>
                            <div class="summary-item">
                                <span class="label">Correct Answers:</span>
                                <span class="value">${results.correctAnswers}/${results.totalQuestions}</span>
                            </div>
                            <div class="summary-item">
                                <span class="label">Time Taken:</span>
                                <span class="value">${results.timeTaken || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    
                    
                    <!-- Detailed Question Report -->
                    ${results.questionResults && results.questionResults.length > 0 ? `
                        <div class="question-report-section">
                            <div class="report-header" id="reportHeader">
                                 <h4>📋 Detailed Question Report</h4>
                                 <button class="toggle-btn" id="reportToggleBtn">▼ Show Details</button>
                             </div>
                            <div class="questions-container" id="questionsContainer" style="display: none;">
                                ${results.questionResults.map((result, index) => `
                                    <div class="question-item ${result.isCorrect ? 'correct' : 'incorrect'}">
                                        <div class="question-header" data-question-index="${index}">
                                             <div class="question-title">
                                                 <span class="question-number">Q${index + 1}</span>
                                                 <span class="question-preview">${(result.questionText || 'Question not available').substring(0, 50)}...</span>
                                             </div>
                                             <div class="question-controls">
                                                 <span class="question-status ${result.isCorrect ? 'correct' : 'incorrect'}">
                                                     ${result.isCorrect ? '✅ Correct' : '❌ Incorrect'}
                                                 </span>
                                                 <button class="expand-btn" id="expandBtn${index}">▼</button>
                                             </div>
                                         </div>
                                        <div class="question-content" id="questionContent${index}" style="display: none;">
                                            <p class="question-text"><strong>Question:</strong> ${result.questionText || 'Question not available'}</p>
                                            <p class="user-answer"><strong>Your Answer:</strong> ${result.userAnswer || 'No answer provided'}</p>
                                            <p class="correct-answer"><strong>Correct Answer:</strong> ${result.correctAnswer || 'Not available'}</p>
                                            ${result.explanation ? `<p class="explanation"><strong>Explanation:</strong> ${result.explanation}</p>` : ''}
                                            ${!result.isCorrect ? `
                                                <div class="improvement-suggestion">
                                                    <strong>💡 Suggestion:</strong> ${this.generateSuggestion(result, result)}
                                                </div>
                                            ` : ''}
                                            ${result.topic ? `<p class="topic-info"><strong>Topic:</strong> ${result.topic} | <strong>Difficulty:</strong> ${result.difficulty || 'Medium'}</p>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${results.detailedFeedback ? `
                        <div class="detailed-feedback">
                            <div class="overall-feedback">
                                <h4>📊 Overall Performance</h4>
                                <p class="feedback-text">${results.detailedFeedback.overall}</p>
                            </div>
                            
                            ${results.detailedFeedback.strengths && results.detailedFeedback.strengths.length > 0 ? `
                                <div class="strengths-section">
                                    <h4>💪 Your Strengths</h4>
                                    <ul class="feedback-list strengths">
                                        ${results.detailedFeedback.strengths.map(strength => `<li>✅ ${strength}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                            ${results.detailedFeedback.weaknesses && results.detailedFeedback.weaknesses.length > 0 ? `
                                <div class="weaknesses-section">
                                    <h4>🎯 Areas for Improvement</h4>
                                    <ul class="feedback-list weaknesses">
                                        ${results.detailedFeedback.weaknesses.map(weakness => `<li>📝 ${weakness}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                            ${results.detailedFeedback.improvements && results.detailedFeedback.improvements.length > 0 ? `
                                <div class="improvements-section">
                                    <h4>🚀 Improvement Recommendations</h4>
                                    <ul class="feedback-list improvements">
                                        ${results.detailedFeedback.improvements.map(improvement => `<li>💡 ${improvement}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                            
                            ${results.detailedFeedback.performanceByCategory && Object.keys(results.detailedFeedback.performanceByCategory).length > 0 ? `
                                <div class="category-performance">
                                    <h4>📈 Performance by Category</h4>
                                    <div class="category-grid">
                                        ${Object.entries(results.detailedFeedback.performanceByCategory).map(([category, perf]) => `
                                            <div class="category-item">
                                                <div class="category-name">${category.replace('_', ' ').toUpperCase()}</div>
                                                <div class="category-score ${perf.percentage >= 70 ? 'good' : perf.percentage >= 50 ? 'average' : 'needs-work'}">
                                                    ${perf.percentage}% (${perf.correct}/${perf.total})
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    ` : results.feedback ? `
                        <div class="ai-feedback">
                            <h4>📝 Personalized Feedback</h4>
                            <p>${results.feedback}</p>
                        </div>
                    ` : ''}
                    
                    ${results.recommendations && results.recommendations.length > 0 ? `
                        <div class="recommendations">
                            <h4>🎯 Recommended Next Steps</h4>
                            <ul>
                                ${results.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="this.closest('.test-results-modal').remove()">Continue Learning</button>
                </div>
            </div>
        `;

        document.body.appendChild(resultsModal);
        this.testInProgress = false; // Reset flag when test is complete
        
        // Setup event listeners for expandable sections
        this.setupReportEventListeners();
    }

    exitTest() {
        if (confirm('Are you sure you want to exit the test? Your progress will be lost.')) {
            const testContainer = document.querySelector('.adaptive-test-container');
            if (testContainer) testContainer.remove();
            this.testInProgress = false; // Reset flag when exiting
        }
    }

    showLoading(message) {
        const loading = document.createElement('div');
        loading.className = 'adaptive-loading';
        loading.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(loading);
    }

    hideLoading() {
        const loading = document.querySelector('.adaptive-loading');
        if (loading) loading.remove();
    }

    showError(message) {
        const error = document.createElement('div');
        error.className = 'adaptive-error';
        error.innerHTML = `
            <div class="error-content">
                <h3>⚠️ Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="this.closest('.adaptive-error').remove()">OK</button>
            </div>
        `;
        document.body.appendChild(error);
    }

    showSessionCorruptedError() {
        // Remove test container if it exists
        const testContainer = document.querySelector('.adaptive-test-container');
        if (testContainer) testContainer.remove();

        const error = document.createElement('div');
        error.className = 'adaptive-error session-corrupted';
        error.innerHTML = `
            <div class="error-content">
                <h3>🔄 Session Expired</h3>
                <p>Your test session has expired or been corrupted. This can happen if you've been inactive for too long or if there was a technical issue.</p>
                <div class="error-actions">
                    <button class="btn btn-secondary" onclick="this.closest('.adaptive-error').remove()">Cancel</button>
                    <button class="btn btn-primary" id="restart-test-btn">Start New Test</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(error);
        
        // Add event listener for restart button
        const restartBtn = error.querySelector('#restart-test-btn');
        restartBtn.addEventListener('click', () => {
            error.remove();
            // Reset all test state
            this.currentTest = null;
            this.currentQuestionIndex = 0;
            this.answers = [];
            this.sessionId = null;
            this.testInProgress = false;
            
            // Trigger a new test with the last known video ID
            // We'll need to store the video ID when starting the test
            if (this.lastVideoId) {
                this.startAdaptiveTest(this.lastVideoId);
            } else {
                this.showError('Unable to restart test. Please refresh the page and try again.');
            }
        });
    }

    // Audio recording methods
    async startRecording() {
        console.log('=== START RECORDING ===');
        console.log('Current question index:', this.currentQuestionIndex);
        console.log('Current test questions length:', this.currentTest?.questions?.length);
        console.log('Current question type:', this.currentTest?.questions?.[this.currentQuestionIndex]?.type);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                console.log('=== AUDIO BLOB CREATED ===');
                console.log('Saving to index:', this.currentQuestionIndex);
                console.log('Audio blob size:', audioBlob.size);
                this.saveAnswer(audioBlob);
                console.log('Saved answer:', this.answers[this.currentQuestionIndex]);
                
                // Enable play button
                const playBtn = document.querySelector('.btn-play');
                if (playBtn) playBtn.disabled = false;
            };

            this.mediaRecorder.start();
            
            // Update UI
            const recordBtn = document.querySelector('.btn-record');
            const stopBtn = document.querySelector('.btn-stop');
            const status = document.querySelector('.recording-status');
            
            if (recordBtn) recordBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            if (status) status.textContent = '🔴 Recording...';
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Could not access microphone. Please check permissions.');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            
            // Update UI
            const recordBtn = document.querySelector('.btn-record');
            const stopBtn = document.querySelector('.btn-stop');
            const status = document.querySelector('.recording-status');
            
            if (recordBtn) recordBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
            if (status) status.textContent = '✅ Recording saved';
        }
    }

    playRecording() {
        const audioBlob = this.answers[this.currentQuestionIndex];
        if (audioBlob) {
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
        }
    }

    async playQuestionAudioClip(question) {
        const playClipBtn = document.querySelector('.btn-play-clip');
        const audioStatus = document.querySelector('#audioStatus');
        
        if (playClipBtn) playClipBtn.disabled = true;
        if (audioStatus) audioStatus.textContent = 'Generating audio clip...';
        
        try {
            // Extract the context from the question to generate appropriate audio
            let audioText = '';
            
            if (question.question.toLowerCase().includes('stage of the calling funnel')) {
                audioText = 'Welcome to our consultation booking service. I understand you are interested in learning more about our hair systems. Let me help you book a consultation with one of our specialists. We have both video and in-person consultations available. Which would you prefer?';
            } else if (question.question.toLowerCase().includes('key objective')) {
                audioText = 'Thank you for your interest in our services. The main goal of this conversation is to understand your specific needs and book you for a detailed consultation where we can discuss the best hair system options for you. Our specialists will provide personalized recommendations based on your requirements.';
            } else {
                // Generic audio for other audio clip questions
                audioText = 'This is a sample audio clip for the question. Listen carefully and provide your response based on what you hear.';
            }
            
            // Use text-to-speech to generate audio
            const utterance = new SpeechSynthesisUtterance(audioText);
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 0.8;
            
            utterance.onstart = () => {
                if (audioStatus) audioStatus.textContent = '🔊 Playing audio clip...';
                if (playClipBtn) playClipBtn.textContent = '🔊 Playing...';
            };
            
            utterance.onend = () => {
                if (audioStatus) audioStatus.textContent = 'Audio clip finished. You can replay or start recording your response.';
                if (playClipBtn) {
                    playClipBtn.textContent = '🔄 Replay Audio Clip';
                    playClipBtn.disabled = false;
                }
            };
            
            utterance.onerror = () => {
                if (audioStatus) audioStatus.textContent = 'Error playing audio clip. Please try again.';
                if (playClipBtn) {
                    playClipBtn.textContent = '▶️ Play Audio Clip';
                    playClipBtn.disabled = false;
                }
            };
            
            speechSynthesis.speak(utterance);
            
        } catch (error) {
            console.error('Error playing audio clip:', error);
            if (audioStatus) audioStatus.textContent = 'Error playing audio clip. Please try again.';
            if (playClipBtn) {
                playClipBtn.textContent = '▶️ Play Audio Clip';
                playClipBtn.disabled = false;
            }
        }
    }
}

// Initialize adaptive learning system
const adaptiveLearning = new AdaptiveLearning();