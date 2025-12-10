const content = `\`\`\`json
[
  {
    "question": "Test question?",
    "options": {
      "A": "Option A",
      "B": "Option B"
    },
    "correct_answer": "A",
    "explanation": "Test explanation"
  }
]
\`\`\``;

console.log('Original content:');
console.log(content);
console.log('\nStartsWith ```json:', content.startsWith('```json'));

let rawContent = content;

// Strip markdown code blocks if present
if (rawContent.startsWith('```json')) {
  rawContent = rawContent.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
} else if (rawContent.startsWith('```')) {
  rawContent = rawContent.replace(/^```\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
}

console.log('\nCleaned content:');
console.log(rawContent);

try {
  const parsed = JSON.parse(rawContent);
  console.log('\nParsed successfully!');
  console.log('Type:', typeof parsed);
  console.log('Is Array:', Array.isArray(parsed));
  console.log('Length:', parsed.length);
} catch (error) {
  console.log('\nParsing failed:', error.message);
}