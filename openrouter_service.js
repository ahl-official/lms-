const axios = require('axios');

class OpenRouterService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://openrouter.ai/api/v1';
        this.models = [
            // Free models
            { id: 'deepseek/deepseek-chat-v3.1:free', name: 'DeepSeek Chat v3.1 (Free)', provider: 'DeepSeek', free: true },
            { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek Chat v3 0324 (Free)', provider: 'DeepSeek', free: true },
            { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 0528 (Free)', provider: 'DeepSeek', free: true },
            { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2 (Free)', provider: 'Moonshot AI', free: true },
            { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B A22B (Free)', provider: 'Qwen', free: true },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (Free)', provider: 'Meta', free: true },
            { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B Instruct (Free)', provider: 'Meta', free: true },
            { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (Free)', provider: 'Google', free: true },
            { id: 'google/gemini-pro-1.5:free', name: 'Gemini Pro 1.5 (Free)', provider: 'Google', free: true },
            { id: 'tencent/hunyuan-a13b-instruct:free', name: 'Hunyuan A13B Instruct (Free)', provider: 'Tencent', free: true },
            { id: 'openai/gpt-oss-20b:free', name: 'GPT OSS 20B (Free)', provider: 'OpenAI', free: true },
            { id: 'openai/gpt-4o-mini:free', name: 'GPT-4o Mini (Free)', provider: 'OpenAI', free: true },
            { id: 'mistralai/mistral-small-3.2-24b-instruct:free', name: 'Mistral Small 3.2 24B (Free)', provider: 'Mistral AI', free: true },
            { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Instruct (Free)', provider: 'Mistral AI', free: true },
            { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1:free', name: 'Nemotron Ultra 253B (Free)', provider: 'NVIDIA', free: true },
            { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano 9B (Free)', provider: 'NVIDIA', free: true },
            
            // Paid models
            { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', free: false },
            { id: 'openai/gpt-4o-2024-11-20', name: 'GPT-4o (Latest)', provider: 'OpenAI', free: false },
            { id: 'openai/chatgpt-4o-latest', name: 'ChatGPT-4o (Latest)', provider: 'OpenAI', free: false },
            { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI', free: false },
            { id: 'openai/gpt-4', name: 'GPT-4', provider: 'OpenAI', free: false },
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', free: false },
            { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic', free: false },
            { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic', free: false },
            { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'Anthropic', free: false },
            { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', provider: 'Google', free: false },
            { id: 'google/gemini-pro', name: 'Gemini Pro', provider: 'Google', free: false },
            { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google', free: false },
            { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B Instruct', provider: 'Meta', free: false },
            { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B Instruct', provider: 'Meta', free: false },
            { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', provider: 'Meta', free: false },
            { id: 'mistralai/mistral-large', name: 'Mistral Large', provider: 'Mistral AI', free: false },
            { id: 'mistralai/mistral-medium', name: 'Mistral Medium', provider: 'Mistral AI', free: false },
            { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', free: false },
            { id: 'deepseek/deepseek-coder', name: 'DeepSeek Coder', provider: 'DeepSeek', free: false },
            { id: 'x-ai/grok-beta', name: 'Grok Beta', provider: 'xAI', free: false },
            { id: 'perplexity/llama-3.1-sonar-large-128k-online', name: 'Perplexity Sonar Large', provider: 'Perplexity', free: false },
            { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B Instruct', provider: 'NVIDIA', free: false },
            { id: 'cohere/command-r-plus', name: 'Command R+', provider: 'Cohere', free: false }
        ];
    }

    // Get all available models
    getModels() {
        return this.models;
    }

    // Get models by provider
    getModelsByProvider(provider) {
        return this.models.filter(model => model.provider === provider);
    }

    // Get free models only
    getFreeModels() {
        return this.models.filter(model => model.free);
    }

    // Get paid models only
    getPaidModels() {
        return this.models.filter(model => !model.free);
    }

    // Find model by ID
    getModelById(modelId) {
        return this.models.find(model => model.id === modelId);
    }

    // Make API call to OpenRouter
    async makeRequest(endpoint, data) {
        try {
            const response = await axios.post(`${this.baseURL}${endpoint}`, data, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://localhost:3000', // Replace with your domain
                    'X-Title': 'AHL Training LMS' // Your app name
                }
            });
            return response.data;
        } catch (error) {
            console.error('OpenRouter API Error:', error.response?.data || error.message);
            throw new Error(`OpenRouter API request failed: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    // Generate chat completion
    async createChatCompletion(messages, modelId, options = {}) {
        const model = this.getModelById(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        const requestData = {
            model: modelId,
            messages: messages,
            max_tokens: options.max_tokens || 4000,
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 1,
            frequency_penalty: options.frequency_penalty || 0,
            presence_penalty: options.presence_penalty || 0,
            ...options
        };

        return await this.makeRequest('/chat/completions', requestData);
    }

    // Generate test questions using OpenRouter
    async generateTestQuestions(videoTitle, transcript, modelId, existingContent = null) {
        const model = this.getModelById(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        let prompt = `Based on the following video transcript, create 10 multiple-choice questions to test student understanding. Each question should have 4 options (A, B, C, D) with only one correct answer.

Video Title: ${videoTitle}

Transcript:
${transcript}

Please format your response as a JSON array with this structure:
[
  {
    "question": "Question text here?",
    "options": {
      "A": "Option A text",
      "B": "Option B text", 
      "C": "Option C text",
      "D": "Option D text"
    },
    "correct_answer": "A",
    "explanation": "Brief explanation of why this is correct"
  }
]

Make sure questions cover key concepts from the video and are appropriate for the learning level.`;

        if (existingContent) {
            prompt += `\n\nExisting content to improve:\n${existingContent}`;
        }

        const messages = [
            {
                role: 'system',
                content: 'You are an expert educational content creator. Generate high-quality, engaging multiple-choice questions based on video content. Always respond with valid JSON only.'
            },
            {
                role: 'user',
                content: prompt
            }
        ];

        const response = await this.createChatCompletion(messages, modelId, {
            temperature: 0.7,
            max_tokens: 3000
        });

        return response.choices[0].message.content;
    }

    // Generate activity using OpenRouter
    async generateActivity(videoTitle, transcript, modelId, existingContent = null) {
        const model = this.getModelById(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        let prompt = `Based on the following video transcript, create an engaging learning activity that helps students apply the concepts they learned.

Video Title: ${videoTitle}

Transcript:
${transcript}

Please format your response as a JSON object with this structure:
{
  "title": "Activity Title",
  "description": "Brief description of what students will do",
  "instructions": "Step-by-step instructions for the activity",
  "materials_needed": ["List of materials or resources needed"],
  "estimated_time": "Estimated completion time",
  "learning_objectives": ["What students will learn or practice"],
  "assessment_criteria": "How to evaluate student work"
}

Make the activity practical, engaging, and directly related to the video content.`;

        if (existingContent) {
            prompt += `\n\nExisting content to improve:\n${existingContent}`;
        }

        const messages = [
            {
                role: 'system',
                content: 'You are an expert educational content creator. Generate practical, engaging learning activities based on video content. Always respond with valid JSON only.'
            },
            {
                role: 'user',
                content: prompt
            }
        ];

        const response = await this.createChatCompletion(messages, modelId, {
            temperature: 0.8,
            max_tokens: 2000
        });

        return response.choices[0].message.content;
    }

    // Answer student questions using OpenRouter
    async answerStudentQuestion(question, videoTitle, transcript, modelId) {
        const model = this.getModelById(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        const messages = [
            {
                role: 'system',
                content: `You are a helpful AI tutor for the AHL Training LMS. Answer student questions based on the video content provided. Be encouraging, clear, and educational. If the question is not related to the video content, politely redirect the student to ask questions about the video material.`
            },
            {
                role: 'user',
                content: `Video Title: ${videoTitle}\n\nVideo Content Summary:\n${transcript.substring(0, 2000)}...\n\nStudent Question: ${question}\n\nPlease provide a helpful answer based on the video content.`
            }
        ];

        const response = await this.createChatCompletion(messages, modelId, {
            temperature: 0.7,
            max_tokens: 1000
        });

        return response.choices[0].message.content;
    }
}

module.exports = OpenRouterService;