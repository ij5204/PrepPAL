const fs = require('fs');
const env = fs.readFileSync('supabase/functions/.env.local', 'utf8');
const key = env.match(/CLAUDE_API_KEY=(.*)/)[1].trim();

async function testClaude() {
  console.log('Testing Claude API with key:', key.substring(0, 15) + '...');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say hello' }],
    }),
  });
  
  const data = await res.json();
  console.log('Response:', data);
}

testClaude();
