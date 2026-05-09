// test-receipt.js — run with: node test-receipt.js
// Creates a minimal 1x1 white JPEG and hits the parse-receipt Edge Function
// so we can see the exact error without needing a real receipt scan.

const https = require('https');
const fs = require('fs');
require('dotenv').config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// A minimal valid JPEG (1×1 white pixel, 631 bytes)
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';

const jpegBuf = Buffer.from(TINY_JPEG_B64, 'base64');

// Build a multipart/form-data body manually
const boundary = '----TestBoundary1234567890';
const body = Buffer.concat([
  Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  ),
  jpegBuf,
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);

const url = new URL(`${SUPABASE_URL}/functions/v1/parse-receipt`);

const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'POST',
  headers: {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  },
};

console.log('Calling parse-receipt at', url.toString());

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    console.log('\nHTTP Status:', res.statusCode);
    try {
      console.log('Response:', JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => console.error('Request error:', e));
req.write(body);
req.end();
