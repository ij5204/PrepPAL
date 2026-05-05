const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('system_events')
    .select('*')
    .eq('event_type', 'claude_error')
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

check();
