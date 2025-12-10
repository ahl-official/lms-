const sqlite3 = require('sqlite3').verbose();
const AIService = require('./ai_service');

class AdaptiveLearningService {
    constructor() {
        this.db = new sqlite3.Database('./lms_database.db');
        this.aiService = new AIService();
        this.masteryThreshold = 0.7; // 70% to pass
        this.maxAttempts = 5;
    }

    // Initialize or get user's adaptive learning profile
    async initializeUserProfile(userId) {
        return new Promise((resolve, reject) => {
            // Check if profile exists
            this.db.get(
                'SELECT * FROM adaptive_learning_profiles WHERE user_id = ?',
                [userId],
                (err, profile) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (profile) {
                        resolve(profile);
                        return;
                    }

                    // Create new profile
                    const defaultPreferences = JSON.stringify({
                        multiple_choice: 0.4,
                        typing: 0.3,
                        audio: 0.2,
                        scenario: 0.1
                    });

                    this.db.run(
                        `INSERT INTO adaptive_learning_profiles 
                         (user_id, question_type_preferences) VALUES (?, ?)`,
                        [userId, defaultPreferences],
                        function(err) {
                            if (err) {
                                reject(err);
                                return;
                            }

                            // Return the newly created profile
                            resolve({
                                id: this.lastID,
                                user_id: userId,
                                learning_style: 'balanced',
                                preferred_difficulty: 'medium',
                                question_type_preferences: defaultPreferences,
                                performance_trend: 'stable',
                                mastery_score_average: 0.0,
                                total_tests_taken: 0,
                                total_study_time: 0
                            });
                        }
                    );
                }
            );
        });
    }

    // Check if user should take adaptive test after video completion
    async shouldTriggerAdaptiveTest(userId, videoId) {
        return new Promise((resolve, reject) => {
            // Check if user has already mastered this video
            this.db.get(
                `SELECT * FROM learning_path_progress 
                 WHERE user_id = ? AND video_id = ? AND is_mastered = TRUE`,
                [userId, videoId],
                (err, mastered) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (mastered) {
                        resolve({ shouldTrigger: false, reason: 'already_mastered' });
                        return;
                    }

                    // Check attempt count
                    this.db.get(
                        `SELECT attempts_count FROM learning_path_progress 
                         WHERE user_id = ? AND video_id = ?`,
                        [userId, videoId],
                        (err, progress) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            const attempts = progress ? progress.attempts_count : 0;
                            if (attempts >= this.maxAttempts) {
                                resolve({ shouldTrigger: false, reason: 'max_attempts_reached' });
                                return;
                            }

                            resolve({ shouldTrigger: true, attempts });
                        }
                    );
                }
            );
        });
    }

    // Generate adaptive test based on user's learning profile
    async generateAdaptiveTest(userId, videoId, options = {}) {
        try {
            console.log(`Generating adaptive test for video ID: ${videoId}, user ID: ${userId}`);
            const profile = await this.initializeUserProfile(userId);
            const videoDetails = await this.getVideoDetails(videoId);
            const transcriptRow = await this.aiService.getTranscript(videoId);
            
            console.log(`Transcript row for video ${videoId}:`, transcriptRow ? 'Found' : 'Not found');

            if (!transcriptRow || !transcriptRow.transcript_text) {
                // Get available videos with transcripts as suggestions
                const availableVideos = await this.getVideosWithTranscripts();
                const suggestions = availableVideos.length > 0 
                    ? `Available videos with transcripts: ${availableVideos.map(v => `${v.id} (${v.title})`).join(', ')}`
                    : 'No videos have transcripts available.';
                
                throw new Error(`No transcript available for video ${videoId}. Please ensure the video has been transcribed before generating adaptive tests. ${suggestions}`);
            }

            const transcript = transcriptRow.transcript_text;

            // Determine question types based on user preferences
            const preferences = JSON.parse(profile.question_type_preferences);
            const questionCount = options.questionCount || 10;
            const difficulty = this.adaptDifficulty(profile.preferred_difficulty, profile.performance_trend);

            // Generate questions using AI with adaptive parameters
            const questions = await this.generateAdaptiveQuestions(
                videoId,
                videoDetails.title,
                transcript,
                {
                    questionCount,
                    difficulty,
                    preferences,
                    learningStyle: profile.learning_style,
                    userId
                }
            );

            // Create test session with questions
            const sessionId = await this.createTestSession(userId, videoId, questions.length, questions);

            return {
                sessionId,
                questions,
                difficulty,
                timeLimit: this.calculateTimeLimit(questionCount, difficulty),
                passingScore: this.masteryThreshold * 100
            };

        } catch (error) {
            console.error('Error generating adaptive test:', error);
            throw error;
        }
    }

    // Generate questions with AI, adapted to user's learning profile
    async generateAdaptiveQuestions(videoId, videoTitle, transcript, options) {
        const { questionCount, difficulty, preferences, learningStyle, userId } = options;
        
        // Get user's weak areas from previous attempts
        const weakAreas = await this.getUserWeakAreas(userId, videoId);
        
        let provider = await this.aiService.getCurrentProvider();
        let model = await this.aiService.getCurrentModel(provider);
        
        // Define fallback options
        const fallbackOptions = [
            { provider: 'openrouter', model: 'deepseek/deepseek-chat-v3.1:free' },
            { provider: 'openrouter', model: 'google/gemini-2.0-flash-exp:free' },
            { provider: 'openrouter', model: 'openai/gpt-4o-mini:free' },
            { provider: 'openai', model: 'gpt-3.5-turbo' }
        ];
        
        console.log(`Primary AI configuration: provider=${provider}, model=${model}`);

        const prompt = `
Generate ${questionCount} adaptive test questions for personalized learning assessment.

Video Title: ${videoTitle}
Transcript: ${transcript}

User Learning Profile:
- Learning Style: ${learningStyle}
- Difficulty Level: ${difficulty}
- Weak Areas: ${weakAreas.join(', ') || 'None identified'}

Question Type Distribution (generate according to these preferences):
- Multiple Choice: ${Math.round(preferences.multiple_choice * questionCount)} questions
- Typing/Text Input: ${Math.round(preferences.typing * questionCount)} questions
- Audio-based: ${Math.round(preferences.audio * questionCount)} questions
- Scenario-based: ${Math.round(preferences.scenario * questionCount)} questions

Requirements:
1. Focus extra attention on weak areas if any are identified
2. Adapt question complexity to ${difficulty} level
3. Include diverse question types as specified
4. Provide detailed explanations for each answer
5. Include confidence assessment prompts

Return a JSON array with this exact structure:
[
  {
    "question": "Question text here",
    "type": "multiple_choice|typing|audio|scenario",
    "options": ["A", "B", "C", "D"] // only for multiple_choice
    "correct_answer": "Correct answer",
    "explanation": "Detailed explanation of why this is correct",
    "difficulty": "easy|medium|hard",
    "topic_area": "Main topic this question covers",
    "estimated_time": 60 // seconds
  }
]

Ensure questions test comprehension, application, and critical thinking appropriate for ${difficulty} difficulty.`;

        try {
            console.log(`Calling AI service with provider: ${provider}, model: ${model}`);
            let response;
            
            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('AI request timeout after 30 seconds')), 30000);
            });
            
            const tryAIRequest = async (currentProvider, currentModel) => {
                if (currentProvider === 'openrouter' && this.aiService.openrouter) {
                    const messages = [{ role: 'user', content: prompt }];
                    const completion = await this.aiService.openrouter.createChatCompletion(messages, currentModel);
                    return completion.choices[0].message.content;
                } else if (currentProvider === 'openai' && this.aiService.openai) {
                    const completion = await this.aiService.openai.chat.completions.create({
                        model: currentModel,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.7,
                        max_tokens: 3000
                    });
                    return completion.choices[0].message.content;
                } else {
                    throw new Error(`No ${currentProvider} provider available`);
                }
            };
            
            const aiPromise = (async () => {
                // Try primary configuration first
                try {
                    return await tryAIRequest(provider, model);
                } catch (primaryError) {
                    console.log(`Primary AI request failed: ${primaryError.message}`);
                    
                    // Try fallback options
                    for (let i = 0; i < fallbackOptions.length; i++) {
                        const fallback = fallbackOptions[i];
                        try {
                            console.log(`Trying fallback ${i + 1}: ${fallback.provider}/${fallback.model}`);
                            return await tryAIRequest(fallback.provider, fallback.model);
                        } catch (fallbackError) {
                            console.log(`Fallback ${i + 1} failed: ${fallbackError.message}`);
                            if (i === fallbackOptions.length - 1) {
                                throw new Error(`All AI providers failed. Last error: ${fallbackError.message}`);
                            }
                        }
                    }
                }
            })();
            
            response = await Promise.race([aiPromise, timeoutPromise]);
            console.log('AI response received successfully');

            // Parse and validate questions
            const questions = this.parseAndValidateQuestions(response, questionCount);
            return questions;

        } catch (error) {
            console.error('Error generating adaptive questions:', error.message);
            console.error('Full error details:', error);
            console.log('Falling back to fallback questions');
            // Return fallback questions if AI fails
            return this.generateFallbackQuestions(videoTitle, transcript, questionCount, difficulty);
        }
    }

    // Submit and score adaptive test
    async submitAdaptiveTest(sessionId, answers) {
        try {
            const session = await this.getTestSession(sessionId);
            if (!session) {
                throw new Error('Test session not found');
            }

            // Score the test and track individual question performance
            const results = await this.scoreAdaptiveTest(session, answers);
            
            // Generate detailed AI feedback
            const detailedFeedback = await this.generateDetailedFeedback(session, results);
            
            // Update test session
            await this.completeTestSession(sessionId, results);
            
            // Update learning progress
            await this.updateLearningProgress(session.user_id, session.video_id, results);
            
            // Update user profile based on performance
            await this.updateUserProfile(session.user_id, results);
            
            // Generate recommendations for next steps
            const recommendations = await this.generateRecommendations(session.user_id, session.video_id, results);
            
            const finalResponse = {
                ...results,
                ...detailedFeedback,
                recommendations,
                nextAction: this.determineNextAction(results)
            };
            
            console.log('=== FINAL RESPONSE TO FRONTEND ===');
            console.log('Final response object:', JSON.stringify(finalResponse, null, 2));
            console.log('================================');
            
            return finalResponse;

        } catch (error) {
            console.error('Error submitting adaptive test:', error);
            throw error;
        }
    }

    // Score test and provide detailed feedback
    async scoreAdaptiveTest(session, answers) {
        // Get the original questions for this session
        let questions;
        try {
            questions = session.question_sequence ? JSON.parse(session.question_sequence) : null;
        } catch (error) {
            console.error('Error parsing question_sequence:', error);
            questions = null;
        }
        
        // Validate inputs
        if (!answers || !Array.isArray(answers)) {
            throw new Error('Invalid answers format - expected array');
        }
        
        if (!questions || !Array.isArray(questions)) {
            throw new Error('Session corrupted - please start a new test. The current session does not contain valid question data.');
        }
        
        let correctAnswers = 0;
        const questionResults = [];
        let totalTime = 0;

        // Process all questions, not just answered ones
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const userAnswer = answers[i];
            
            let isCorrect = false;
            let userAnswerValue = null;
            let timeSpent = 0;
            
            // If question exists but no answer provided, mark as incorrect
            if (!question) {
                console.warn(`Skipping question ${i}: missing question data`);
                continue;
            }
            
            if (userAnswer && userAnswer.answer !== undefined && userAnswer.answer !== null) {
                isCorrect = await this.evaluateAnswer(question, userAnswer);
                timeSpent = userAnswer.timeSpent || 0;
                
                // Format user answer for display
                if (userAnswer.answer instanceof Blob) {
                    userAnswerValue = 'Audio response provided';
                } else if (userAnswer.type === 'audio_response' || userAnswer.hasAudio === true) {
                    userAnswerValue = 'Audio response provided';
                } else if (Array.isArray(userAnswer.answer)) {
                    userAnswerValue = userAnswer.answer.join(', ');
                } else if (question.type === 'multiple_choice' && question.options && typeof userAnswer.answer === 'number') {
                    // Convert numeric answer to actual option text for multiple choice
                    const optionIndex = userAnswer.answer;
                    if (optionIndex >= 0 && optionIndex < question.options.length) {
                        userAnswerValue = question.options[optionIndex];
                    } else {
                        userAnswerValue = `Option ${optionIndex + 1}`;
                    }
                } else {
                    userAnswerValue = String(userAnswer.answer);
                }
            } else {
                // No answer provided - mark as incorrect
                isCorrect = false;
                userAnswerValue = 'No answer provided';
                timeSpent = 0;
            }
            
            if (isCorrect) correctAnswers++;
            
            // Track individual question performance
            await this.trackQuestionPerformance(
                session.user_id,
                session.video_id,
                question,
                userAnswer || { answer: 'No answer provided', timeSpent: 0 },
                isCorrect,
                timeSpent
            );

            questionResults.push({
                questionIndex: i,
                questionText: question.question,
                questionType: question.type,
                isCorrect,
                userAnswer: userAnswerValue,
                correctAnswer: question.correct_answer,
                explanation: question.explanation || `This question tests your understanding of ${question.topic_area || 'the subject matter'}.`,
                timeSpent: timeSpent,
                topic: question.topic_area || 'General',
                difficulty: question.difficulty || 'medium'
            });

            totalTime += timeSpent;
        }

        const scorePercentage = questions.length > 0 ? (correctAnswers / questions.length) * 100 : 0;
        const isPassed = scorePercentage >= (this.masteryThreshold * 100);

        // Debug logging
        console.log('=== SCORE CALCULATION DEBUG ===');
        console.log('Total questions:', questions.length);
        console.log('Correct answers:', correctAnswers);
        console.log('Raw score percentage:', scorePercentage);
        console.log('Rounded score:', Math.round(scorePercentage * 100) / 100);
        console.log('Is passed:', isPassed);
        console.log('Mastery threshold:', this.masteryThreshold);
        console.log('===============================');

        const results = {
            totalQuestions: questions.length,
            correctAnswers,
            score: Math.round(scorePercentage * 100) / 100, // Round to 2 decimal places
            scorePercentage: Math.round(scorePercentage * 100) / 100, // Keep for backward compatibility
            masteryAchieved: isPassed,
            isPassed,
            timeSpent: totalTime,
            timeTaken: this.formatTime(totalTime), // Formatted time string
            questionResults,
            masteryLevel: scorePercentage / 100
        };
        
        console.log('Final results object:', JSON.stringify(results, null, 2));
        return results;
    }

    // Helper methods
    async getVideoDetails(videoId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM videos WHERE id = ?',
                [videoId],
                (err, video) => {
                    if (err) reject(err);
                    else resolve(video);
                }
            );
        });
    }

    async getVideosWithTranscripts() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT v.id, v.title 
                FROM videos v 
                INNER JOIN video_transcripts vt ON v.id = vt.video_id 
                WHERE vt.transcript_text IS NOT NULL AND LENGTH(vt.transcript_text) > 0
                ORDER BY v.id
            `, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getUserWeakAreas(userId, videoId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT weak_areas FROM learning_path_progress WHERE user_id = ? AND video_id = ?',
                [userId, videoId],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (row && row.weak_areas) {
                        try {
                            resolve(JSON.parse(row.weak_areas));
                        } catch (e) {
                            resolve([]);
                        }
                    } else {
                        resolve([]);
                    }
                }
            );
        });
    }

    adaptDifficulty(baseDifficulty, performanceTrend) {
        if (performanceTrend === 'improving') {
            return baseDifficulty === 'easy' ? 'medium' : 
                   baseDifficulty === 'medium' ? 'hard' : 'hard';
        } else if (performanceTrend === 'declining') {
            return baseDifficulty === 'hard' ? 'medium' : 
                   baseDifficulty === 'medium' ? 'easy' : 'easy';
        }
        return baseDifficulty;
    }

    calculateTimeLimit(questionCount, difficulty) {
        const baseTimePerQuestion = {
            'easy': 90,    // 1.5 minutes
            'medium': 120, // 2 minutes
            'hard': 180    // 3 minutes
        };
        return questionCount * (baseTimePerQuestion[difficulty] || 120);
    }

    parseAndValidateQuestions(response, expectedCount) {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('No valid JSON found in response');
            }

            const questions = JSON.parse(jsonMatch[0]);
            
            // Validate structure
            if (!Array.isArray(questions) || questions.length === 0) {
                throw new Error('Invalid questions format');
            }

            // Ensure we have the right number of questions
            return questions.slice(0, expectedCount);

        } catch (error) {
            console.error('Error parsing questions:', error);
            throw new Error('Failed to parse AI-generated questions');
        }
    }

    generateFallbackQuestions(videoTitle, transcript, questionCount, difficulty) {
        // Generate basic questions as fallback
        const questions = [];
        for (let i = 0; i < questionCount; i++) {
            questions.push({
                question: `Question ${i + 1} about ${videoTitle}`,
                type: 'multiple_choice',
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correct_answer: 'Option A',
                explanation: 'This is a fallback question.',
                difficulty: difficulty,
                topic_area: 'General',
                estimated_time: 60
            });
        }
        return questions;
    }

    async createTestSession(userId, videoId, questionCount, questions = null) {
        return new Promise((resolve, reject) => {
            const questionSequence = questions ? JSON.stringify(questions) : null;
            this.db.run(
                `INSERT INTO adaptive_test_sessions 
                 (user_id, video_id, total_questions, session_type, question_sequence) 
                 VALUES (?, ?, ?, 'assessment', ?)`,
                [userId, videoId, questionCount, questionSequence],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getTestSession(sessionId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM adaptive_test_sessions WHERE id = ?',
                [sessionId],
                (err, session) => {
                    if (err) reject(err);
                    else resolve(session);
                }
            );
        });
    }

    async evaluateAnswer(question, userAnswer) {
        console.log('=== EVALUATING ANSWER ===');
        console.log('Question type:', question.type);
        console.log('Question:', question.question);
        console.log('Correct answer:', question.correct_answer);
        console.log('User answer object:', userAnswer);
        console.log('User answer value:', userAnswer?.answer);
        
        // Handle audio responses (Blob objects or audio response indicators)
        if (userAnswer.answer instanceof Blob || 
            question.type === 'audio_response' || 
            question.type === 'audio' ||
            userAnswer.type === 'audio_response' ||
            userAnswer.hasAudio === true ||
            (typeof userAnswer.answer === 'string' && userAnswer.answer === 'Audio response provided')) {
            const result = await this.evaluateAudioAnswer(question, userAnswer.answer);
            console.log('Audio evaluation result:', result);
            return result;
        }
        
        // Ensure userAnswer.answer is a string
        let answerText = userAnswer.answer;
        if (typeof answerText !== 'string') {
            // Handle array answers (multiple selections)
            if (Array.isArray(answerText)) {
                answerText = answerText.join(', ');
            } else {
                // Convert other types to string
                answerText = String(answerText || '');
            }
        }
        
        console.log('Processed answer text:', answerText);
        
        let result = false;
        if (question.type === 'multiple_choice') {
            result = question.correct_answer.toLowerCase().trim() === 
                   answerText.toLowerCase().trim();
            console.log('Multiple choice evaluation:', result);
        } else if (question.type === 'typing' || question.type === 'scenario_based' || question.type === 'scenario') {
            // Use AI to evaluate text answers
            result = await this.evaluateTextAnswer(question.correct_answer, answerText);
            console.log('Text evaluation result:', result);
        } else {
            console.log('Unknown question type, defaulting to false');
        }
        
        console.log('Final evaluation result:', result);
        console.log('========================');
        return result;
    }

    async evaluateAudioAnswer(question, audioData) {
        try {
            // For now, we'll use a simplified approach since we don't have speech-to-text setup
            // In a full implementation, this would:
            // 1. Convert audio blob to text using speech-to-text API
            // 2. Use AI to evaluate the transcribed text against the expected answer
            
            console.log('Evaluating audio answer for question:', question.question);
            console.log('Audio data:', audioData);
            
            // Check if audio response was provided
            const hasAudioResponse = audioData === 'Audio response provided' || 
                                   (audioData && audioData.size > 0) ||
                                   (typeof audioData === 'object' && audioData.hasAudio);
            
            // Simulate AI evaluation - in production, replace with actual speech-to-text + AI analysis
            if (!hasAudioResponse) {
                return false;
            }
            
            // For demonstration, we'll use AI to generate a score based on the question context
            const prompt = `
                Evaluate an audio response for the following question:
                Question: "${question.question}"
                Expected Answer: "${question.correct_answer}"
                
                Since I cannot process the actual audio, please provide a realistic evaluation score (0-100) 
                based on whether a student would likely be able to answer this question correctly through audio.
                Consider the complexity and nature of the question.
                
                Respond with only a number between 0 and 100.
            `;
            
            const provider = await this.aiService.getCurrentProvider();
            const model = await this.aiService.getCurrentModel(provider);
            
            let response;
            if (provider === 'openrouter' && this.aiService.openrouter) {
                response = await this.aiService.openrouter.generateCompletion(prompt, model);
            } else if (provider === 'openai' && this.aiService.openai) {
                const completion = await this.aiService.openai.chat.completions.create({
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 10
                });
                response = completion.choices[0].message.content;
            } else {
                // Fallback: give partial credit for having an audio response
                return true;
            }
            
            const score = parseInt(response.trim());
            return !isNaN(score) && score >= 70; // Consider 70+ as correct
            
        } catch (error) {
            console.error('Error evaluating audio answer:', error);
            // Fallback: give credit for attempting audio response
            const hasAudioResponse = audioData === 'Audio response provided' || 
                                   (audioData && audioData.size > 0) ||
                                   (typeof audioData === 'object' && audioData.hasAudio);
            return hasAudioResponse;
        }
    }

    async evaluateTextAnswer(correctAnswer, userAnswer) {
        // Ensure both answers are strings
        const correctText = String(correctAnswer || '').toLowerCase();
        const userText = String(userAnswer || '').toLowerCase();
        
        // Enhanced AI-based evaluation
        try {
            const prompt = `
                Evaluate if the student's answer is correct for the given question.
                
                Expected Answer: "${correctAnswer}"
                Student Answer: "${userAnswer}"
                
                Consider:
                - Semantic similarity (same meaning, different words)
                - Key concepts covered
                - Partial credit for incomplete but relevant answers
                
                Respond with only 'true' if the answer is substantially correct (70%+ accuracy) or 'false' if not.
            `;
            
            const provider = await this.aiService.getCurrentProvider();
            const model = await this.aiService.getCurrentModel(provider);
            
            let response;
            if (provider === 'openrouter' && this.aiService.openrouter) {
                response = await this.aiService.openrouter.generateCompletion(prompt, model);
            } else if (provider === 'openai' && this.aiService.openai) {
                const completion = await this.aiService.openai.chat.completions.create({
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.2,
                    max_tokens: 10
                });
                response = completion.choices[0].message.content;
            } else {
                // Fallback to keyword matching
                return this.keywordBasedEvaluation(correctText, userText);
            }
            
            return response.trim().toLowerCase() === 'true';
            
        } catch (error) {
            console.error('Error in AI text evaluation:', error);
            // Fallback to keyword matching
            return this.keywordBasedEvaluation(correctText, userText);
        }
    }
    
    keywordBasedEvaluation(correctText, userText) {
        // Simple keyword matching fallback
        const correctKeywords = correctText.split(/\s+/).filter(word => word.length > 0);
        const userKeywords = userText.split(/\s+/).filter(word => word.length > 0);
        
        if (correctKeywords.length === 0) return false;
        
        const matchCount = correctKeywords.filter(keyword => 
            userKeywords.some(userKeyword => userKeyword.includes(keyword))
        ).length;
        
        return matchCount / correctKeywords.length >= 0.6; // 60% keyword match
    }

    formatTime(seconds) {
        if (!seconds || seconds === 0) return 'N/A';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${remainingSeconds}s`;
    }

    // Generate detailed AI feedback with strengths, weaknesses, and recommendations
    async generateDetailedFeedback(session, results) {
        try {
            const { questions, questionResults, scorePercentage, correctAnswers, totalQuestions } = results;
            
            // Analyze performance by question type and topic
            const performanceAnalysis = this.analyzePerformanceByCategory(questionResults, questions);
            
            // Generate strengths based on correct answers
            const strengths = this.identifyStrengths(questionResults, questions, performanceAnalysis);
            
            // Generate weaknesses based on incorrect answers
            const weaknesses = this.identifyWeaknesses(questionResults, questions, performanceAnalysis);
            
            // Generate specific improvement recommendations
            const improvements = this.generateImprovementRecommendations(weaknesses, performanceAnalysis, scorePercentage);
            
            // Create overall feedback summary
            const overallFeedback = this.createOverallFeedback(scorePercentage, correctAnswers, totalQuestions, strengths, weaknesses);
            
            return {
                detailedFeedback: {
                    overall: overallFeedback,
                    strengths: strengths,
                    weaknesses: weaknesses,
                    improvements: improvements,
                    performanceByCategory: performanceAnalysis
                }
            };
        } catch (error) {
            console.error('Error generating detailed feedback:', error);
            return {
                detailedFeedback: {
                    overall: 'Assessment completed. Please review your performance and continue learning.',
                    strengths: [],
                    weaknesses: [],
                    improvements: [],
                    performanceByCategory: {}
                }
            };
        }
    }

    // Analyze performance by question category/type
    analyzePerformanceByCategory(questionResults, questions) {
        const categoryPerformance = {};
        
        questionResults.forEach((result, index) => {
            const question = questions[index];
            const category = question.type || 'general';
            
            if (!categoryPerformance[category]) {
                categoryPerformance[category] = {
                    correct: 0,
                    total: 0,
                    questions: []
                };
            }
            
            categoryPerformance[category].total++;
            if (result.isCorrect) {
                categoryPerformance[category].correct++;
            }
            
            categoryPerformance[category].questions.push({
                question: question.question,
                isCorrect: result.isCorrect,
                userAnswer: result.userAnswer,
                correctAnswer: question.correct_answer || question.answer,
                explanation: result.explanation
            });
        });
        
        // Calculate percentages
        Object.keys(categoryPerformance).forEach(category => {
            const perf = categoryPerformance[category];
            perf.percentage = Math.round((perf.correct / perf.total) * 100);
        });
        
        return categoryPerformance;
    }

    // Identify strengths based on correct answers
    identifyStrengths(questionResults, questions, performanceAnalysis) {
        const strengths = [];
        
        // Find categories with good performance (>= 70%)
        Object.entries(performanceAnalysis).forEach(([category, perf]) => {
            if (perf.percentage >= 70) {
                strengths.push(`Strong performance in ${category} questions (${perf.percentage}% correct)`);
            }
        });
        
        // Identify specific question types answered correctly
        const correctQuestions = questionResults.filter(result => result.isCorrect);
        if (correctQuestions.length > 0) {
            const questionTypes = [...new Set(correctQuestions.map((_, index) => questions[index].type))];
            if (questionTypes.length > 1) {
                strengths.push(`Demonstrated understanding across multiple question types: ${questionTypes.join(', ')}`);
            }
        }
        
        // Add general strengths based on overall performance
        const overallPercentage = (questionResults.filter(r => r.isCorrect).length / questionResults.length) * 100;
        if (overallPercentage >= 80) {
            strengths.push('Excellent overall comprehension of the material');
        } else if (overallPercentage >= 60) {
            strengths.push('Good foundational understanding of key concepts');
        }
        
        return strengths.length > 0 ? strengths : ['Completed the assessment and engaged with the learning material'];
    }

    // Identify weaknesses based on incorrect answers
    identifyWeaknesses(questionResults, questions, performanceAnalysis) {
        const weaknesses = [];
        
        // Find categories with poor performance (< 60%)
        Object.entries(performanceAnalysis).forEach(([category, perf]) => {
            if (perf.percentage < 60) {
                weaknesses.push(`Need improvement in ${category} questions (${perf.percentage}% correct)`);
                
                // Add specific examples of missed questions
                const missedQuestions = perf.questions.filter(q => !q.isCorrect);
                if (missedQuestions.length > 0) {
                    const example = missedQuestions[0];
                    weaknesses.push(`Example: "${example.question.substring(0, 50)}..." - Review the correct approach`);
                }
            }
        });
        
        // Identify patterns in incorrect answers
        const incorrectQuestions = questionResults.filter(result => !result.isCorrect);
        if (incorrectQuestions.length > questionResults.length * 0.5) {
            weaknesses.push('Consider reviewing the fundamental concepts before proceeding');
        }
        
        return weaknesses;
    }

    // Generate specific improvement recommendations
    generateImprovementRecommendations(weaknesses, performanceAnalysis, scorePercentage) {
        const improvements = [];
        
        if (scorePercentage < 60) {
            improvements.push('Review the video content again to strengthen your understanding of core concepts');
            improvements.push('Take notes while watching and create a summary of key points');
            improvements.push('Practice with additional exercises in areas where you struggled');
        } else if (scorePercentage < 80) {
            improvements.push('Focus on the specific areas where you had difficulty');
            improvements.push('Review the explanations for questions you got wrong');
        }
        
        // Category-specific recommendations
        Object.entries(performanceAnalysis).forEach(([category, perf]) => {
            if (perf.percentage < 70) {
                switch (category) {
                    case 'multiple_choice':
                        improvements.push('For multiple choice questions, eliminate obviously wrong answers first');
                        break;
                    case 'typing':
                    case 'scenario':
                        improvements.push('For text-based questions, be more specific and detailed in your responses');
                        break;
                    case 'audio':
                        improvements.push('For audio responses, speak clearly and organize your thoughts before recording');
                        break;
                    default:
                        improvements.push(`Review the ${category} material more thoroughly`);
                }
            }
        });
        
        // Always add a motivational recommendation
        improvements.push('Keep practicing! Learning is a process, and each attempt helps you improve');
        
        return improvements;
    }

    // Create overall feedback summary
    createOverallFeedback(scorePercentage, correctAnswers, totalQuestions, strengths, weaknesses) {
        let feedback = `You scored ${scorePercentage}% (${correctAnswers}/${totalQuestions} correct). `;
        
        if (scorePercentage >= 90) {
            feedback += 'Outstanding performance! You have excellent mastery of this material.';
        } else if (scorePercentage >= 80) {
            feedback += 'Great job! You have a strong understanding of the concepts.';
        } else if (scorePercentage >= 70) {
            feedback += 'Good work! You understand most of the material with room for improvement.';
        } else if (scorePercentage >= 60) {
            feedback += 'You have a basic understanding, but there are important areas to strengthen.';
        } else {
            feedback += 'This material needs more attention. Consider reviewing the content before retaking.';
        }
        
        if (strengths.length > 0) {
            feedback += ` Your strengths include: ${strengths[0]}.`;
        }
        
        if (weaknesses.length > 0) {
            feedback += ` Focus on improving: ${weaknesses[0]}.`;
        }
        
        return feedback;
    }

    determineNextAction(results) {
        if (results.isPassed) {
            return 'advance'; // Move to next video
        } else if (results.scorePercentage >= 50) {
            return 'review'; // Review and retry
        } else {
            return 'practice'; // Need more practice
        }
    }

    // Placeholder methods for full implementation
    async trackQuestionPerformance(userId, videoId, question, userAnswer, isCorrect, timeSpent) {
        // Implementation for tracking individual question performance
    }

    async completeTestSession(sessionId, results) {
        // Implementation for updating test session with results
    }

    async updateLearningProgress(userId, videoId, results) {
        // Implementation for updating learning path progress
    }

    async updateUserProfile(userId, results) {
        // Implementation for updating user's adaptive learning profile
    }

    async generateRecommendations(userId, videoId, results) {
        // Implementation for generating personalized recommendations
        return [];
    }
}

module.exports = AdaptiveLearningService;