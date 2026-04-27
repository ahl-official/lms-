const { Pinecone } = require('@pinecone-database/pinecone');
const axios = require('axios');
const logger = require('../utils/logger');

class SalesPineconeService {
    constructor(db) {
        this.db = db;
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.pineconeApiKey = process.env.PINECONE_API_KEY;
        this.pineconeIndexHost = process.env.PINECONE_INDEX_HOST;

        if (this.pineconeApiKey && this.pineconeIndexHost) {
            this.pc = new Pinecone({
                apiKey: this.pineconeApiKey
            });
            this.index = this.pc.index('', this.pineconeIndexHost);
        }
    }

    async createEmbeddingsBatch(texts) {
        if (!texts || texts.length === 0) return [];

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/embeddings',
                {
                    model: 'text-embedding-3-small',
                    input: texts
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );

            return response.data.data.map(item => item.embedding);
        } catch (error) {
            logger.error('Failed to create embeddings:', error.response?.data || error.message);
            throw error;
        }
    }

    getNamespace(category, videoName, courseId = 1, courseSlug = 'sales') {
        if (courseId === 1) {
            return `${category.toLowerCase().replace(/ /g, '_')}_${videoName.toLowerCase().replace(/ /g, '_')}`;
        } else {
            return `${courseSlug}_${category.toLowerCase().replace(/ /g, '_')}_${videoName.toLowerCase().replace(/ /g, '_')}`;
        }
    }

    async processAndUpload(content, category, videoName, courseId = 1, courseSlug = 'sales') {
        const namespace = this.getNamespace(category, videoName, courseId, courseSlug);

        // Simple chunking logic (similar to text_utils.py)
        const chunks = this.chunkText(content);
        const embeddings = await this.createEmbeddingsBatch(chunks);

        const vectors = chunks.map((chunk, i) => ({
            id: `${namespace}_chunk_${i}`,
            values: embeddings[i],
            metadata: {
                text: chunk.substring(0, 3000),
                category,
                video_name: videoName,
                chunk_index: i,
                namespace,
                course_id: courseId
            }
        }));

        // Batch upsert
        const batchSize = 100;
        for (let i = 0; i < vectors.length; i += batchSize) {
            const batch = vectors.slice(i, i + batchSize);
            await this.index.namespace(namespace).upsert(batch);
        }

        return {
            chunks: chunks.length,
            namespace
        };
    }

    chunkText(text, maxLength = 1000, overlap = 200) {
        // Simple chunking implementation
        const chunks = [];
        let start = 0;
        while (start < text.length) {
            let end = start + maxLength;
            if (end > text.length) end = text.length;
            chunks.push(text.substring(start, end));
            start += (maxLength - overlap);
        }
        return chunks;
    }

    async queryPinecone(embedding, category, topK = 50, namespaces = [], courseId = 1) {
        if (!this.index) return [];

        // If namespaces not provided, we should have a way to find them.
        // In the original, it queries the DB for uploads.

        const results = [];
        for (const ns of namespaces) {
            try {
                const queryResponse = await this.index.namespace(ns).query({
                    vector: embedding,
                    topK: topK,
                    includeMetadata: true
                });
                if (queryResponse.matches) {
                    results.push(...queryResponse.matches);
                }
            } catch (error) {
                logger.error(`Failed to query namespace ${ns}:`, error.message);
            }
        }

        return results;
    }

    async deleteCategoryNamespaces(namespaces) {
        let count = 0;
        for (const ns of namespaces) {
            try {
                await this.index.namespace(ns).deleteAll();
                count++;
            } catch (error) {
                logger.error(`Failed to delete namespace ${ns}:`, error.message);
            }
        }
        return count;
    }
}

module.exports = SalesPineconeService;
