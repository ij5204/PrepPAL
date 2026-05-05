const fs = require('fs');
const env = fs.readFileSync('supabase/functions/.env.local', 'utf8');
const key = env.match(/CLAUDE_API_KEY=(.*)/)[1].trim();

async function checkModels() {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

checkModels();
