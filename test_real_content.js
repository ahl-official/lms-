const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./lms_database.db');

db.get('SELECT generated_content FROM ai_generated_content WHERE id = 50', (err, row) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  if (!row) {
    console.log('No content found for ID 50');
    return;
  }
  
  let rawContent = row.generated_content;
  
  console.log('=== ORIGINAL CONTENT ===');
  console.log('First 200 chars:', JSON.stringify(rawContent.substring(0, 200)));
  console.log('Starts with ```json:', rawContent.startsWith('```json'));
  console.log('Starts with "```json:', rawContent.startsWith('"```json'));
  
  // Test different regex patterns
  console.log('\n=== TESTING REGEX PATTERNS ===');
  
  // Pattern 1: Current pattern
  let test1 = rawContent.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  console.log('Pattern 1 result (first 100):', JSON.stringify(test1.substring(0, 100)));
  
  // Pattern 2: Handle quotes
  let test2 = rawContent.replace(/^"?```json\s*\n?/, '').replace(/\n?\s*```"?\s*$/, '');
  console.log('Pattern 2 result (first 100):', JSON.stringify(test2.substring(0, 100)));
  
  // Pattern 3: More aggressive
  let test3 = rawContent.replace(/^["'`]*```json["'`]*\s*\n?/, '').replace(/\n?\s*["'`]*```["'`]*\s*$/, '');
  console.log('Pattern 3 result (first 100):', JSON.stringify(test3.substring(0, 100)));
  
  // Test parsing
  try {
    const parsed = JSON.parse(test3);
    console.log('\n=== PARSING SUCCESS ===');
    console.log('Type:', typeof parsed);
    console.log('Is Array:', Array.isArray(parsed));
    if (Array.isArray(parsed)) {
      console.log('Length:', parsed.length);
    }
  } catch (error) {
    console.log('\n=== PARSING FAILED ===');
    console.log('Error:', error.message);
  }
  
  db.close();
});