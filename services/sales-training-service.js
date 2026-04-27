const axios = require('axios');
const logger = require('../utils/logger');
const SalesPineconeService = require('./sales-pinecone-service');

class SalesTrainingService {
    constructor(db) {
        this.db = db;
        this.pineconeService = new SalesPineconeService(db);
        this.openrouterApiKey = process.env.OPENROUTER_API_KEY;
    }

    async getSystemSetting(key, defaultValue) {
        return new Promise((resolve) => {
            this.db.get('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key], (err, row) => {
                if (err || !row) resolve(defaultValue);
                else resolve(row.setting_value);
            });
        });
    }

    async aggregateCategoryContent(category, topK = 50, courseId = 1) {
        try {
            const embedding = await this.pineconeService.createEmbeddingsBatch([`Summarize key facts, procedures, and scenarios for training category: ${category}`]);

            // Need to get namespaces from DB first
            const namespaces = await this.getNamespacesForCategory(category, courseId);

            const results = await this.pineconeService.queryPinecone(embedding[0], category, topK, namespaces, courseId);

            const textChunks = results.map(m => {
                const meta = m.metadata || {};
                return `SOURCE: ${meta.video_name || 'Unknown'}\nCONTENT: ${meta.text}`;
            });

            return textChunks.join('\n\n').substring(0, 20000);
        } catch (error) {
            logger.error('Failed to aggregate category content:', error);
            return "";
        }
    }

    async getNamespacesForCategory(category, courseId) {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT video_name FROM sales_uploads WHERE category = ? AND course_id = ?', [category, courseId], (err, rows) => {
                if (err) return reject(err);

                const namespaces = rows.map(row => {
                    return this.pineconeService.getNamespace(category, row.video_name, courseId);
                });
                resolve(namespaces);
            });
        });
    }

    async prepareQuestions(sessionId, category, difficulty, durationMinutes = 10, mode = 'standard', courseId = 1) {
        const llmModel = await this.getSystemSetting('llm_model', 'openai/gpt-4o');
        const content = await this.aggregateCategoryContent(category, 50, courseId);

        let trainingMaterialSection = "";
        let strictRule1 = "";

        if (!content || content.length < 50) {
            trainingMaterialSection = `NOTE: Specific training material unavailable. Use your expert knowledge about '${category}' in a high-ticket sales context.`;
            strictRule1 = "1) Every question must be answerable from the provided context if available. Otherwise, use conservative knowledge.";
        } else {
            trainingMaterialSection = `TRAINING MATERIAL (verbatim excerpts; do not invent facts):\n${content.substring(0, 8000)}`;
            strictRule1 = "1) Every question must be answerable from the material. No outside knowledge.";
        }

        const numQuestions = Math.min(Math.max(Math.floor(durationMinutes * 0.6), 7), 25);

        const systemPrompt = `You are an expert sales training coach creating exam questions.

${trainingMaterialSection}

TASK: Generate exactly ${numQuestions} questions to test knowledge of "${category}".

QUESTION MIX for difficulty "${difficulty}":
- Order questions from EASIEST to HARDEST (Progressive Difficulty).
- Balanced mix of factual, procedural, and scenario questions.

STRICT RULES:
${strictRule1}
2) Provide an "expected_answer".
3) Provide 3-5 "key_points" the answer should include (short phrases).
4) Provide a "source" reference (use "General Knowledge" or specific video name if available).
5) Phrase questions like a real customer would ask.
6) Set "is_objection"=true only for objection-handling technique questions.
7) Include a "difficulty" field matching the input difficulty.

OUTPUT (JSON only):
{
  "questions": [
    {
      "question": "...",
      "expected_answer": "...",
      "key_points": ["a","b","c"],
      "source": "...",
      "difficulty": "${difficulty}",
      "is_objection": false
    }
  ]
}`;

        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: llmModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Generate ${numQuestions} exam questions for ${category} at ${difficulty} level.` }
                    ],
                    temperature: 0.7
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openrouterApiKey}`,
                        'Content-Type': 'application/json',
                        'X-Title': 'AHL Sales Trainer'
                    },
                    timeout: 60000
                }
            );

            let contentResponse = response.data.choices[0].message.content;
            // Basic JSON extraction
            const jsonMatch = contentResponse.match(/\{[\s\S]*\}/);
            const data = JSON.parse(jsonMatch[0]);

            await this.savePreparedQuestions(sessionId, data.questions);
            return data.questions;
        } catch (error) {
            logger.error('Question generation failed:', error);
            throw error;
        }
    }

    async savePreparedQuestions(sessionId, questions) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                const stmt = this.db.prepare('INSERT INTO sales_question_bank (session_id, position, question_text, expected_answer, key_points_json, source, difficulty, is_objection) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                questions.forEach((q, i) => {
                    stmt.run(
                        sessionId,
                        i + 1,
                        q.question || q.question_text,
                        q.expected_answer,
                        JSON.stringify(q.key_points || []),
                        q.source,
                        q.difficulty,
                        q.is_objection ? 1 : 0
                    );
                });
                stmt.finalize(err => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    async evaluateAnswer(sessionId, question, userAnswer, category, courseId = 1) {
        const llmModel = await this.getSystemSetting('llm_model', 'openai/gpt-4o');
        const keyPoints = JSON.parse(question.key_points_json || '[]');
        const isObjection = !!question.is_objection;

        let evaluationPrompt = "";
        if (isObjection) {
            evaluationPrompt = `You are evaluating a sales trainee's objection-handling response.
EVALUATION CRITERIA:
- IGNORE filler words and minor stammering.
- Focus strictly on MEANING and INTENT.
- Paraphrasing is ENCOURAGED.
- **CRITICAL**: If the user's answer is short but correct, score it HIGH (8/10+).
- Synonyms are recognized.

PENALTIES: apologizing (-3), arguing (-5), over-explaining (-2), losing control (-4)
BONUS: using prescribed language OR equivalent professional phrasing (+2)

OBJECTION SCENARIO: ${question.question_text}
EXPECTED: ${question.expected_answer}
KEY POINTS: ${JSON.stringify(keyPoints)}

USER'S ANSWER: "${userAnswer}"

OUTPUT JSON:
{
  "overall_score": 0,
  "feedback": "",
  "spoken_feedback": "",
  "what_correct": "",
  "what_missed": ""
}`;
        } else {
            evaluationPrompt = `You are a supportive sales training evaluator.
Your goal is to verify understanding, not memorization.
1. IGNORE filler words.
2. If the user captures the CORE IDEA, mark it correct (8/10+).
3. Do NOT penalize for using different vocabulary.
4. **CRITICAL**: If the user's answer is short but correct, score it HIGH.

QUESTION: ${question.question_text}
EXPECTED: ${question.expected_answer}
KEY POINTS: ${JSON.stringify(keyPoints)}

USER'S ANSWER: "${userAnswer}"

OUTPUT JSON:
{
  "overall_score": 0,
  "feedback": "",
  "spoken_feedback": "",
  "what_correct": "",
  "what_missed": ""
}`;
        }

        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: llmModel,
                    messages: [
                        { role: 'system', content: evaluationPrompt },
                        { role: 'user', content: 'Evaluate this answer.' }
                    ],
                    temperature: 0.3
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openrouterApiKey}`,
                        'Content-Type': 'application/json',
                        'X-Title': 'AHL Sales Trainer'
                    }
                }
            );

            const content = response.data.choices[0].message.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const evaluation = JSON.parse(jsonMatch[0]);
            evaluation.user_answer = userAnswer;

            return evaluation;
        } catch (error) {
            logger.error('Evaluation failed:', error);
            return {
                overall_score: 0,
                feedback: "Evaluation failed due to technical error",
                user_answer: userAnswer
            };
        }
    }
}

module.exports = SalesTrainingService;
