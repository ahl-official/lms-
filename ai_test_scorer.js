const sqlite3 = require('sqlite3').verbose();
const AIService = require('./ai_service');
const AudioService = require('./audio_service');

class AITestScorer {
    constructor() {
        this.db = new sqlite3.Database('./lms_database.db');
        this.aiService = new AIService();
        this.audioService = new AudioService();
    }

    // Start a new test attempt
    async startTestAttempt(testId, studentId) {
        try {
            // Check if student has exceeded max attempts
            const attemptCount = await this.getAttemptCount(testId, studentId);
            const testDetails = await this.getTestDetails(testId);
            
            if (attemptCount >= testDetails.max_attempts) {
                throw new Error(`Maximum attempts (${testDetails.max_attempts}) exceeded for this test`);
            }

            // Create new attempt record
            const attemptId = await this.createAttemptRecord(testId, studentId, attemptCount + 1);
            
            console.log(`📝 Started test attempt ${attemptCount + 1} for student ${studentId}`);
            return { attemptId, attemptNumber: attemptCount + 1, testDetails };
        } catch (error) {
            console.error('Error starting test attempt:', error);
            throw error;
        }
    }

    // Submit answer for a question
    async submitAnswer(attemptId, questionId, studentAnswer, responseTimeSeconds = null) {
        try {
            const question = await this.getQuestion(questionId);
            if (!question) {
                throw new Error(`Question ${questionId} not found`);
            }

            // Score the answer based on question type
            const scoreResult = await this.scoreAnswer(question, studentAnswer);
            
            // Save the response (store transcription text for audio responses)
            if (question.question_type === 'audio_response') {
                const transcriptionText = scoreResult.transcription || '';
                await this.saveQuestionResponse(
                    attemptId,
                    questionId,
                    transcriptionText,
                    scoreResult,
                    responseTimeSeconds,
                    studentAnswer // audio file path
                );
            } else {
                await this.saveQuestionResponse(attemptId, questionId, studentAnswer, scoreResult, responseTimeSeconds, null);
            }
            
            return scoreResult;
        } catch (error) {
            console.error('Error submitting answer:', error);
            throw error;
        }
    }

    // Complete test attempt and calculate final score
    async completeTestAttempt(attemptId) {
        try {
            const attempt = await this.getAttemptDetails(attemptId);
            if (!attempt) {
                throw new Error(`Attempt ${attemptId} not found`);
            }

            // Calculate total score
            const scoreData = await this.calculateTotalScore(attemptId);
            const testDetails = await this.getTestDetails(attempt.test_id);
            
            // Determine if passed
            const passed = scoreData.percentageScore >= testDetails.passing_score;
            
            // Update attempt record
            await this.updateAttemptCompletion(attemptId, scoreData, passed);
            
            // Generate AI feedback
            const feedback = await this.generateAIFeedback(attemptId, scoreData, passed, testDetails);
            
            // Save feedback
            await this.saveFeedback(attemptId, feedback, passed ? 'pass' : 'fail');
            
            console.log(`✅ Test completed - Score: ${scoreData.percentageScore}% (${passed ? 'PASSED' : 'FAILED'})`);
            
            return {
                attemptId,
                totalScore: scoreData.totalScore,
                maxScore: scoreData.maxScore,
                percentageScore: scoreData.percentageScore,
                passed,
                feedback,
                canRetry: !passed && await this.canRetry(attempt.test_id, attempt.student_id)
            };
        } catch (error) {
            console.error('Error completing test attempt:', error);
            throw error;
        }
    }

    // Score individual answer based on question type
    async scoreAnswer(question, studentAnswer) {
        const questionData = JSON.parse(question.question_data);
        let isCorrect = false;
        let pointsEarned = 0;
        let feedback = '';

        switch (question.question_type) {
            case 'multiple_choice':
                isCorrect = studentAnswer.toUpperCase() === questionData.correct_answer.toUpperCase();
                pointsEarned = isCorrect ? question.points : 0;
                feedback = isCorrect ? 
                    'Correct! ' + (questionData.explanation || '') : 
                    `Incorrect. The correct answer is ${questionData.correct_answer}. ${questionData.explanation || ''}`;
                break;

            case 'true_false':
                isCorrect = studentAnswer.toLowerCase() === questionData.correct_answer.toLowerCase();
                pointsEarned = isCorrect ? question.points : 0;
                feedback = isCorrect ? 
                    'Correct! ' + (questionData.explanation || '') : 
                    `Incorrect. The correct answer is ${questionData.correct_answer}. ${questionData.explanation || ''}`;
                break;

            case 'fill_blank':
                const correctAnswers = Array.isArray(questionData.correct_answer) ? 
                    questionData.correct_answer : [questionData.correct_answer];
                isCorrect = correctAnswers.some(answer => 
                    studentAnswer.toLowerCase().trim() === answer.toLowerCase().trim()
                );
                pointsEarned = isCorrect ? question.points : 0;
                feedback = isCorrect ? 
                    'Correct!' : 
                    `Incorrect. Acceptable answers include: ${correctAnswers.join(', ')}`;
                break;

            case 'typing':
                const result = await this.scoreTypingAnswer(studentAnswer, questionData, question.points);
                isCorrect = result.pointsEarned > 0;
                pointsEarned = result.pointsEarned;
                feedback = result.feedback;
                break;

            case 'audio_response':
                const audioScore = await this.scoreAudioAnswer(studentAnswer, questionData, question.points);
                isCorrect = audioScore.pointsEarned > 0;
                pointsEarned = audioScore.pointsEarned;
                feedback = audioScore.feedback;
                // Attach transcription to result so caller can save
                return {
                    isCorrect,
                    pointsEarned,
                    feedback,
                    transcription: audioScore.transcription,
                    duration: audioScore.duration,
                    confidence: audioScore.confidence
                };
                
                break;

            default:
                feedback = 'Unknown question type';
        }

        return {
            isCorrect,
            pointsEarned,
            feedback
        };
    }

    // Score typing/short answer questions
    async scoreTypingAnswer(studentAnswer, questionData, maxPoints) {
        const expectedKeywords = questionData.expected_keywords || [];
        const minWords = questionData.min_words || 10;
        const maxWords = questionData.max_words || 200;
        
        const words = studentAnswer.trim().split(/\s+/);
        const wordCount = words.length;
        
        let score = 0;
        let feedback = [];
        
        // Check word count
        if (wordCount < minWords) {
            feedback.push(`Answer too short (${wordCount} words, minimum ${minWords})`);
            score -= 0.2;
        } else if (wordCount > maxWords) {
            feedback.push(`Answer too long (${wordCount} words, maximum ${maxWords})`);
            score -= 0.1;
        }
        
        // Check for expected keywords
        if (expectedKeywords.length > 0) {
            const foundKeywords = expectedKeywords.filter(keyword => 
                studentAnswer.toLowerCase().includes(keyword.toLowerCase())
            );
            
            const keywordScore = foundKeywords.length / expectedKeywords.length;
            score += keywordScore * 0.8; // 80% of score from keywords
            
            if (foundKeywords.length > 0) {
                feedback.push(`Good! Found key concepts: ${foundKeywords.join(', ')}`);
            }
            
            const missingKeywords = expectedKeywords.filter(keyword => 
                !studentAnswer.toLowerCase().includes(keyword.toLowerCase())
            );
            
            if (missingKeywords.length > 0) {
                feedback.push(`Consider mentioning: ${missingKeywords.join(', ')}`);
            }
        } else {
            // If no keywords specified, give partial credit for reasonable length
            score += wordCount >= minWords ? 0.7 : 0.3;
        }
        
        // Ensure score is between 0 and 1
        score = Math.max(0, Math.min(1, score));
        
        const pointsEarned = Math.round(score * maxPoints * 10) / 10; // Round to 1 decimal
        
        return {
            pointsEarned,
            feedback: feedback.join(' ')
        };
    }

    // Score audio responses using STT transcription and keyword checks
    async scoreAudioAnswer(audioPath, questionData, maxPoints) {
        try {
            if (!audioPath) {
                return {
                    pointsEarned: 0,
                    feedback: 'No audio file provided.',
                    transcription: '',
                    duration: null,
                    confidence: null
                };
            }

            const stt = await this.audioService.transcribeAudio(audioPath);
            if (!stt.success) {
                return {
                    pointsEarned: 0,
                    feedback: `Audio transcription failed: ${stt.error}`,
                    transcription: '',
                    duration: null,
                    confidence: null
                };
            }

            const transcription = (stt.transcription || '').trim();
            const duration = stt.duration || null;
            const confidence = stt.confidence || null;

            // If placeholder transcription, still evaluate length minimally
            const expectedKeywords = questionData.expected_keywords || [];
            const minSeconds = questionData.min_seconds || 5;
            const maxSeconds = questionData.max_seconds || null;
            const requiredPhrase = questionData.required_phrase || '';

            let score = 0;
            let notes = [];

            // Duration scoring (10%)
            if (duration != null) {
                if (duration < minSeconds) {
                    notes.push(`Response too short (${Math.round(duration)}s, minimum ${minSeconds}s).`);
                    score -= 0.1;
                } else {
                    score += 0.1;
                }
                if (maxSeconds && duration > maxSeconds) {
                    notes.push(`Response too long (${Math.round(duration)}s, maximum ${maxSeconds}s).`);
                    score -= 0.05;
                }
            }

            // Keyword scoring (70%)
            if (expectedKeywords.length > 0) {
                const found = expectedKeywords.filter(k => transcription.toLowerCase().includes(k.toLowerCase()));
                const keywordScore = found.length / expectedKeywords.length;
                score += keywordScore * 0.7;
                if (found.length > 0) {
                    notes.push(`Covered key concepts: ${found.join(', ')}.`);
                }
                const missing = expectedKeywords.filter(k => !transcription.toLowerCase().includes(k.toLowerCase()));
                if (missing.length > 0) {
                    notes.push(`Consider mentioning: ${missing.join(', ')}.`);
                }
            } else {
                // If no keywords provided, award partial credit for speaking duration
                score += duration && duration >= minSeconds ? 0.5 : 0.2;
            }

            // Required phrase scoring (20%)
            if (requiredPhrase) {
                if (transcription.toLowerCase().includes(requiredPhrase.toLowerCase())) {
                    score += 0.2;
                    notes.push('Included the required phrase.');
                } else {
                    notes.push(`Missing required phrase: "${requiredPhrase}".`);
                }
            }

            // Confidence hint (does not affect score directly)
            if (confidence != null) {
                notes.push(`Transcription confidence: ${Math.round(confidence * 100)}%.`);
            }

            // Clamp score and compute points
            score = Math.max(0, Math.min(1, score));
            const pointsEarned = Math.round(score * maxPoints * 10) / 10;

            return {
                pointsEarned,
                feedback: notes.join(' '),
                transcription,
                duration,
                confidence
            };
        } catch (error) {
            console.error('Error scoring audio answer:', error);
            return {
                pointsEarned: 0,
                feedback: 'An error occurred while scoring the audio response.',
                transcription: '',
                duration: null,
                confidence: null
            };
        }
    }

    // Generate AI feedback for completed test
    async generateAIFeedback(attemptId, scoreData, passed, testDetails) {
        try {
            // Get all responses for this attempt
            const responses = await this.getAttemptResponses(attemptId);
            const incorrectAnswers = responses.filter(r => !r.is_correct);
            
            const provider = await this.aiService.getCurrentProvider();
            const model = await this.aiService.getCurrentModel(provider);
            
            const prompt = `
Generate personalized feedback for a student who just completed a test.

Test Details:
- Title: ${testDetails.title}
- Score: ${scoreData.percentageScore}% (${scoreData.totalScore}/${scoreData.maxScore} points)
- Result: ${passed ? 'PASSED' : 'FAILED'}
- Passing Score: ${testDetails.passing_score}%

Incorrect Answers: ${incorrectAnswers.length} out of ${responses.length}

Provide feedback in the following JSON format:
{
  "overall_feedback": "Encouraging and constructive overall assessment",
  "strengths": ["List of 2-3 areas where student performed well"],
  "weaknesses": ["List of 1-2 areas needing improvement"],
  "recommendations": ["List of 2-3 specific study suggestions"],
  "study_materials": ["List of 1-2 recommended resources or topics to review"],
  "next_steps": "Clear guidance on what to do next"
}

Make the feedback:
- Encouraging and supportive
- Specific and actionable
- Appropriate for the score level
- Focused on learning and improvement
${passed ? '- Congratulatory for passing' : '- Motivational for retrying'}
`;

            let response;
            if (provider === 'openrouter' && this.aiService.openrouter) {
                response = await this.aiService.openrouter.generateCompletion(prompt, model);
            } else if (provider === 'openai' && this.aiService.openai) {
                const completion = await this.aiService.openai.chat.completions.create({
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 1000
                });
                response = completion.choices[0].message.content;
            } else {
                throw new Error('No AI service available');
            }

            return JSON.parse(response.trim());
        } catch (error) {
            console.error('Error generating AI feedback:', error);
            // Return fallback feedback
            return this.generateFallbackFeedback(scoreData, passed, testDetails);
        }
    }

    // Fallback feedback if AI generation fails
    generateFallbackFeedback(scoreData, passed, testDetails) {
        const percentage = scoreData.percentageScore;
        
        if (passed) {
            return {
                overall_feedback: `Congratulations! You passed with ${percentage}%. Great job demonstrating your understanding of the material.`,
                strengths: ["Successfully met the passing criteria", "Demonstrated good comprehension"],
                weaknesses: percentage < 85 ? ["Some areas could use additional review"] : [],
                recommendations: ["Continue to the next lesson", "Review any missed concepts"],
                study_materials: ["Course materials", "Additional practice exercises"],
                next_steps: "You can now proceed to the next video in the course."
            };
        } else {
            return {
                overall_feedback: `You scored ${percentage}%, which is below the passing score of ${testDetails.passing_score}%. Don't worry - this is a learning opportunity!`,
                strengths: ["Attempted all questions", "Showed effort in learning"],
                weaknesses: ["Need to review key concepts", "Could benefit from additional study time"],
                recommendations: ["Review the video content again", "Focus on areas where you missed questions", "Take notes while studying"],
                study_materials: ["Video transcript", "Course materials"],
                next_steps: "Review the material and try the test again when you feel ready."
            };
        }
    }

    // Database helper methods
    async getAttemptCount(testId, studentId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT COUNT(*) as count FROM student_test_attempts WHERE test_id = ? AND student_id = ?',
                [testId, studentId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });
    }

    async getTestDetails(testId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM ai_tests WHERE id = ?', [testId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async createAttemptRecord(testId, studentId, attemptNumber) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO student_test_attempts 
                (test_id, student_id, attempt_number, status) 
                VALUES (?, ?, ?, 'in_progress')`;
            
            this.db.run(sql, [testId, studentId, attemptNumber], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    async getQuestion(questionId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM ai_test_questions WHERE id = ?', [questionId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async saveQuestionResponse(attemptId, questionId, studentAnswer, scoreResult, responseTimeSeconds, audioResponsePath = null) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO test_question_responses 
                (attempt_id, question_id, student_answer, is_correct, points_earned, response_time_seconds, audio_response_path, ai_feedback) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            
            this.db.run(sql, [
                attemptId, questionId, studentAnswer, scoreResult.isCorrect, 
                scoreResult.pointsEarned, responseTimeSeconds, audioResponsePath, scoreResult.feedback
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    async calculateTotalScore(attemptId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    SUM(points_earned) as total_score,
                    SUM(q.points) as max_score
                FROM test_question_responses r
                JOIN ai_test_questions q ON r.question_id = q.id
                WHERE r.attempt_id = ?
            `;
            
            this.db.get(sql, [attemptId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    const totalScore = row.total_score || 0;
                    const maxScore = row.max_score || 1;
                    const percentageScore = Math.round((totalScore / maxScore) * 100 * 10) / 10;
                    
                    resolve({
                        totalScore,
                        maxScore,
                        percentageScore
                    });
                }
            });
        });
    }

    async updateAttemptCompletion(attemptId, scoreData, passed) {
        return new Promise((resolve, reject) => {
            const sql = `UPDATE student_test_attempts SET 
                end_time = CURRENT_TIMESTAMP,
                total_score = ?,
                percentage_score = ?,
                passed = ?,
                status = 'completed'
                WHERE id = ?`;
            
            this.db.run(sql, [
                scoreData.totalScore,
                scoreData.percentageScore,
                passed ? 1 : 0,
                attemptId
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async saveFeedback(attemptId, feedback, feedbackType) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO ai_test_feedback 
                (attempt_id, overall_feedback, strengths, weaknesses, recommendations, study_materials, next_steps, feedback_type) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            
            this.db.run(sql, [
                attemptId,
                feedback.overall_feedback,
                JSON.stringify(feedback.strengths),
                JSON.stringify(feedback.weaknesses),
                JSON.stringify(feedback.recommendations),
                JSON.stringify(feedback.study_materials),
                feedback.next_steps,
                feedbackType
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    async canRetry(testId, studentId) {
        const attemptCount = await this.getAttemptCount(testId, studentId);
        const testDetails = await this.getTestDetails(testId);
        return attemptCount < testDetails.max_attempts;
    }

    async getAttemptDetails(attemptId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM student_test_attempts WHERE id = ?', [attemptId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async getAttemptResponses(attemptId) {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM test_question_responses WHERE attempt_id = ?', [attemptId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Score entire test - called by submit route
    async scoreTest(attemptId) {
        try {
            return await this.completeTestAttempt(attemptId);
        } catch (error) {
            console.error('Error scoring test:', error);
            throw error;
        }
    }

    // Get test results - called by results route
    async getTestResults(attemptId, studentId) {
        try {
            const attempt = await this.getAttemptDetails(attemptId);
            if (!attempt) {
                throw new Error(`Attempt ${attemptId} not found`);
            }

            // Verify the attempt belongs to the student
            if (attempt.student_id !== studentId) {
                throw new Error('Unauthorized access to test results');
            }

            // Get test details
            const testDetails = await this.getTestDetails(attempt.test_id);
            
            // Get responses with question details
            const responses = await this.getDetailedAttemptResponses(attemptId);
            
            // Get feedback
            const feedback = await this.getAttemptFeedback(attemptId);

            return {
                attemptId: attempt.id,
                testId: attempt.test_id,
                testTitle: testDetails.title,
                totalScore: attempt.total_score,
                maxScore: responses.reduce((sum, r) => sum + (r.question_points || 0), 0),
                percentageScore: attempt.percentage_score,
                passed: attempt.passed === 1,
                status: attempt.status,
                startTime: attempt.start_time,
                endTime: attempt.end_time,
                attemptNumber: attempt.attempt_number,
                responses: responses,
                feedback: feedback,
                canRetry: !attempt.passed && await this.canRetry(attempt.test_id, studentId)
            };
        } catch (error) {
            console.error('Error getting test results:', error);
            throw error;
        }
    }

    // Get detailed responses with question information
    async getDetailedAttemptResponses(attemptId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    r.*,
                    q.question_text,
                    q.question_type,
                    q.question_data,
                    q.points as question_points
                FROM test_question_responses r
                JOIN ai_test_questions q ON r.question_id = q.id
                WHERE r.attempt_id = ?
                ORDER BY q.sequence_order
            `;
            
            this.db.all(sql, [attemptId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Parse question_data JSON
                    const responses = rows.map(row => ({
                        ...row,
                        question_data: row.question_data ? JSON.parse(row.question_data) : null
                    }));
                    resolve(responses);
                }
            });
        });
    }

    // Get feedback for attempt
    async getAttemptFeedback(attemptId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM ai_test_feedback WHERE attempt_id = ?', [attemptId], (err, row) => {
                if (err) {
                    reject(err);
                } else if (row) {
                    resolve({
                        overall_feedback: row.overall_feedback,
                        strengths: row.strengths ? JSON.parse(row.strengths) : [],
                        weaknesses: row.weaknesses ? JSON.parse(row.weaknesses) : [],
                        recommendations: row.recommendations ? JSON.parse(row.recommendations) : [],
                        study_materials: row.study_materials ? JSON.parse(row.study_materials) : [],
                        next_steps: row.next_steps,
                        feedback_type: row.feedback_type
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }
}

module.exports = AITestScorer;
