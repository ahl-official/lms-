const sqlite3 = require('sqlite3').verbose();
const AIService = require('./ai_service');

class AITestGenerator {
    constructor() {
        this.db = new sqlite3.Database('./lms_database.db');
        this.aiService = new AIService();
    }

    // Generate comprehensive AI test for a video
    async generateAITest(videoId, options = {}) {
        const {
            questionCount = 10,
            difficulty = 'medium',
            includeAudio = false,
            passingScore = 70,
            maxAttempts = 5,
            timeLimit = 30
        } = options;

        try {
            console.log(`🤖 Starting AI test generation for video ${videoId}...`);

            // Get video details and transcript
            const videoDetails = await this.getVideoDetails(videoId);
            if (!videoDetails) {
                throw new Error(`Video ${videoId} not found`);
            }

            const transcript = await this.aiService.getTranscript(videoId);
            if (!transcript) {
                throw new Error(`No transcript found for video ${videoId}`);
            }

            // Create the AI test record
            const testId = await this.createAITestRecord(videoId, {
                title: `AI Generated Test: ${videoDetails.title}`,
                description: `Comprehensive assessment covering key concepts from ${videoDetails.title}`,
                passingScore,
                maxAttempts,
                timeLimit,
                questionCount,
                difficulty
            });

            // Generate questions using AI
            const questions = await this.generateTestQuestions(videoId, videoDetails.title, transcript, {
                questionCount,
                difficulty,
                includeAudio
            });

            // Save questions to database
            await this.saveTestQuestions(testId, questions);

            // Update test status to completed
            await this.updateTestStatus(testId, 'completed', JSON.stringify(questions));

            console.log(`✅ AI test generated successfully with ${questions.length} questions`);
            return { testId, questions };

        } catch (error) {
            console.error('❌ Error generating AI test:', error);
            throw error;
        }
    }

    // Generate diverse question types using AI
    async generateTestQuestions(videoId, videoTitle, transcript, options = {}) {
        const { questionCount = 10, difficulty = 'medium', includeAudio = false } = options;
        
        const provider = await this.aiService.getCurrentProvider();
        const model = await this.aiService.getCurrentModel(provider);

        const prompt = `
Analyze the following video transcript and generate ${questionCount} diverse test questions to assess student understanding.

Video Title: ${videoTitle}
Transcript: ${transcript}

Generate questions with the following distribution:
- 60% Multiple Choice (4 options each)
- 25% Typing/Short Answer questions
- 10% True/False questions
- 5% Fill in the blank questions
${includeAudio ? '\n- Include 1-2 audio response questions for practical scenarios' : ''}

Difficulty Level: ${difficulty}

For each question, provide:
1. Question text
2. Question type (multiple_choice, typing, true_false, fill_blank${includeAudio ? ', audio_response' : ''})
3. For multiple choice: 4 options (A, B, C, D) and correct answer
4. For typing: expected keywords/phrases for partial credit
5. For true/false: correct answer and explanation
6. For fill_blank: the complete sentence with blank and correct answer
7. Points value (1-3 based on difficulty)
8. Difficulty level for this specific question

Return ONLY a valid JSON array with this structure:
[
  {
    "question_text": "What is the main concept discussed?",
    "question_type": "multiple_choice",
    "question_data": {
      "options": {
        "A": "Option 1",
        "B": "Option 2",
        "C": "Option 3",
        "D": "Option 4"
      },
      "correct_answer": "B",
      "explanation": "Explanation of why B is correct"
    },
    "points": 2,
    "difficulty": "medium"
  },
  {
    "question_text": "Explain the key benefits of this approach",
    "question_type": "typing",
    "question_data": {
      "expected_keywords": ["efficiency", "cost-effective", "scalable"],
      "min_words": 20,
      "max_words": 100,
      "sample_answer": "A good answer should mention efficiency, cost-effectiveness, and scalability..."
    },
    "points": 3,
    "difficulty": "hard"
  }
]

Ensure questions test comprehension, application, and critical thinking based on the video content.`;

        try {
            let response;
            if (provider === 'openrouter' && this.aiService.openrouter) {
                response = await this.aiService.openrouter.generateCompletion(prompt, model);
            } else if (provider === 'openai' && this.aiService.openai) {
                const completion = await this.aiService.openai.chat.completions.create({
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 4000
                });
                response = completion.choices[0].message.content;
            } else {
                throw new Error('No AI service available');
            }

            // Parse and validate the response
            const questions = JSON.parse(response.trim());
            
            // Validate and enhance questions
            return this.validateAndEnhanceQuestions(questions);

        } catch (error) {
            console.error('Error generating questions with AI:', error);
            // Fallback to template-based questions if AI fails
            return this.generateFallbackQuestions(videoTitle, transcript, questionCount);
        }
    }

    // Validate and enhance AI-generated questions
    validateAndEnhanceQuestions(questions) {
        return questions.map((q, index) => {
            // Ensure required fields
            if (!q.question_text || !q.question_type || !q.question_data) {
                throw new Error(`Invalid question structure at index ${index}`);
            }

            // Set defaults
            q.points = q.points || 1;
            q.difficulty = q.difficulty || 'medium';
            q.sequence_order = index + 1;

            // Validate question types
            const validTypes = ['multiple_choice', 'typing', 'true_false', 'fill_blank', 'audio_response'];
            if (!validTypes.includes(q.question_type)) {
                q.question_type = 'multiple_choice'; // Default fallback
            }

            // Enhance question data based on type
            if (q.question_type === 'multiple_choice') {
                if (!q.question_data.options || !q.question_data.correct_answer) {
                    throw new Error(`Invalid multiple choice question at index ${index}`);
                }
            } else if (q.question_type === 'typing') {
                if (!q.question_data.expected_keywords) {
                    q.question_data.expected_keywords = [];
                }
                q.question_data.min_words = q.question_data.min_words || 10;
                q.question_data.max_words = q.question_data.max_words || 200;
            }

            return q;
        });
    }

    // Fallback question generation if AI fails
    generateFallbackQuestions(videoTitle, transcript, questionCount) {
        console.log('🔄 Using fallback question generation...');
        
        const questions = [];
        const words = transcript.split(' ');
        const sentences = transcript.split('.');
        
        // Generate basic questions based on content
        for (let i = 0; i < Math.min(questionCount, 5); i++) {
            questions.push({
                question_text: `What is the main topic discussed in "${videoTitle}"?`,
                question_type: 'multiple_choice',
                question_data: {
                    options: {
                        A: 'Basic concepts',
                        B: 'Advanced techniques',
                        C: 'Practical applications',
                        D: 'All of the above'
                    },
                    correct_answer: 'D',
                    explanation: 'The video covers multiple aspects of the topic.'
                },
                points: 1,
                difficulty: 'easy',
                sequence_order: i + 1
            });
        }

        return questions;
    }

    // Create AI test record in database
    async createAITestRecord(videoId, testData) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO ai_tests 
                (video_id, title, description, passing_score, max_attempts, time_limit_minutes, 
                 question_count, difficulty_level, test_type, generation_status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'auto_generated', 'generating')`;
            
            this.db.run(sql, [
                videoId,
                testData.title,
                testData.description,
                testData.passingScore,
                testData.maxAttempts,
                testData.timeLimit,
                testData.questionCount,
                testData.difficulty
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // Save test questions to database
    async saveTestQuestions(testId, questions) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO ai_test_questions 
                (test_id, question_text, question_type, question_data, points, difficulty, sequence_order) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`;
            
            let completed = 0;
            const total = questions.length;
            
            if (total === 0) {
                resolve();
                return;
            }
            
            questions.forEach((question) => {
                this.db.run(sql, [
                    testId,
                    question.question_text,
                    question.question_type,
                    JSON.stringify(question.question_data),
                    question.points,
                    question.difficulty,
                    question.sequence_order
                ], (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    completed++;
                    if (completed === total) {
                        resolve();
                    }
                });
            });
        });
    }

    // Update test generation status
    async updateTestStatus(testId, status, generatedContent = null) {
        return new Promise((resolve, reject) => {
            const sql = `UPDATE ai_tests SET generation_status = ?, generated_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
            
            this.db.run(sql, [status, generatedContent, testId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Get video details
    async getVideoDetails(videoId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM videos WHERE id = ?', [videoId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Get AI test by video ID
    async getAITestByVideoId(videoId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM ai_tests WHERE video_id = ? ORDER BY created_at DESC LIMIT 1', [videoId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Get test questions
    async getTestQuestions(testId) {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM ai_test_questions WHERE test_id = ? ORDER BY sequence_order', [testId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Parse question_data JSON
                    const questions = rows.map(row => ({
                        ...row,
                        question_data: JSON.parse(row.question_data)
                    }));
                    resolve(questions);
                }
            });
        });
    }

    // Generate tests for all videos without tests
    async generateTestsForAllVideos() {
        try {
            console.log('🚀 Starting bulk test generation for all videos...');
            
            // Get all videos without AI tests
            const videos = await this.getVideosWithoutTests();
            console.log(`Found ${videos.length} videos without AI tests`);
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const video of videos) {
                try {
                    console.log(`\n📹 Processing video: ${video.title} (ID: ${video.id})`);
                    await this.generateAITest(video.id);
                    successCount++;
                    
                    // Add delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    console.error(`❌ Failed to generate test for video ${video.id}:`, error.message);
                    errorCount++;
                }
            }
            
            console.log(`\n🎉 Bulk generation completed!`);
            console.log(`✅ Success: ${successCount} tests generated`);
            console.log(`❌ Errors: ${errorCount} failed`);
            
            return { successCount, errorCount, total: videos.length };
        } catch (error) {
            console.error('❌ Error in bulk test generation:', error);
            throw error;
        }
    }

    // Get videos without AI tests
    async getVideosWithoutTests() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT v.* FROM videos v 
                LEFT JOIN ai_tests t ON v.id = t.video_id 
                WHERE t.id IS NULL
                ORDER BY v.sequence
            `;
            
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get test preview for admin/instructor
    async getTestPreview(videoId) {
        try {
            // First check for AI tests
            const aiTest = await this.getAITestByVideoId(videoId);
            
            if (aiTest) {
                // Get the AI test questions
                const questions = await this.getTestQuestions(aiTest.id);
                
                return {
                    hasTest: true,
                    test: {
                        id: aiTest.id,
                        title: aiTest.title,
                        description: aiTest.description,
                        passing_score: aiTest.passing_score,
                        max_attempts: aiTest.max_attempts,
                        time_limit_minutes: aiTest.time_limit_minutes,
                        question_count: aiTest.question_count,
                        difficulty_level: aiTest.difficulty_level,
                        generation_status: aiTest.generation_status,
                        created_at: aiTest.created_at
                    },
                    questions: questions,
                    questionCount: questions.length
                };
            }
            
            // If no AI test, check for regular tests (from approved AI content)
            const regularTest = await this.getRegularTestByVideoId(videoId);
            
            if (!regularTest) {
                return {
                    hasTest: false,
                    message: 'No test found for this video'
                };
            }

            // Get the regular test questions
            const questions = await this.getRegularTestQuestions(regularTest.id);
            
            return {
                hasTest: true,
                test: {
                    id: regularTest.id,
                    title: regularTest.title,
                    description: regularTest.description,
                    passing_score: regularTest.passing_score,
                    max_attempts: 5, // Default for regular tests
                    time_limit_minutes: 30, // Default for regular tests
                    question_count: questions.length,
                    difficulty_level: 'medium', // Default
                    generation_status: 'completed',
                    created_at: regularTest.created_at
                },
                questions: questions.map((q, index) => ({
                     id: q.id,
                     question_text: q.question,
                     question_type: 'multiple_choice',
                     question_data: {
                         options: [
                             { label: 'A', text: q.option_a },
                             { label: 'B', text: q.option_b },
                             { label: 'C', text: q.option_c },
                             { label: 'D', text: q.option_d }
                         ],
                         correct_answer: q.correct_answer
                     },
                     points: q.points || 1,
                     difficulty: 'medium',
                     sequence_order: index + 1,
                     explanation: ''
                 })),
                questionCount: questions.length
            };
        } catch (error) {
            console.error('Error getting test preview:', error);
            throw error;
        }
    }
    
    // Get regular test by video ID (from approved AI content)
    async getRegularTestByVideoId(videoId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM tests WHERE video_id = ? ORDER BY created_at DESC LIMIT 1', [videoId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    
    // Get regular test questions
    async getRegularTestQuestions(testId) {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM test_questions WHERE test_id = ? ORDER BY id', [testId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
}

module.exports = AITestGenerator;