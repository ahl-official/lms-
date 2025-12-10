const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const db = new sqlite3.Database('./lms_database.db');

console.log('Adding OpenRouter settings to database...');

db.serialize(() => {
    // Add new settings for OpenRouter support
    const newSettings = [
        ['openrouter_api_key', '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'],
        ['default_ai_provider', 'openai'], // Default to OpenAI for existing users
        ['default_openai_model', 'gpt-4'],
        ['default_openrouter_model', 'deepseek/deepseek-chat-v3.1:free'], // Default to a free model
        ['ai_provider_enabled_openai', 'true'],
        ['ai_provider_enabled_openrouter', 'true']
    ];

    let settingsProcessed = 0;
    const totalSettings = newSettings.length;
    
    newSettings.forEach(([key, value]) => {
        db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)`, 
            [key, value], function(err) {
            settingsProcessed++;
            
            if (err) {
                console.error(`❌ Error inserting setting ${key}:`, err);
            } else {
                if (this.changes > 0) {
                    console.log(`✓ Added setting: ${key}`);
                } else {
                    console.log(`- Setting already exists: ${key}`);
                }
            }
            
            if (settingsProcessed === totalSettings) {
                console.log('\n✓ OpenRouter settings migration completed successfully!');
                console.log('\nNew settings added:');
                console.log('- openrouter_api_key: OpenRouter API key');
                console.log('- default_ai_provider: Default AI provider (openai/openrouter)');
                console.log('- default_openai_model: Default OpenAI model');
                console.log('- default_openrouter_model: Default OpenRouter model');
                console.log('- ai_provider_enabled_openai: Enable/disable OpenAI');
                console.log('- ai_provider_enabled_openrouter: Enable/disable OpenRouter');
                
                // Close database
                db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err);
                    } else {
                        console.log('\n🎉 Database migration completed!');
                    }
                });
            }
        });
    });
});