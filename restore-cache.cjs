/**
 * Restore the Figma node data cache from the old task log.
 * Handles control characters that may be present in log output.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_FILE = 'C:/Users/raylee/.gemini/antigravity/brain/d4034c41-b7ae-4a11-b632-81ddf1bd2554/.system_generated/tasks/task-45.log';
const CACHE_DIR = path.join(__dirname, '.cache');

// Read the log file
const log = fs.readFileSync(LOG_FILE, 'utf8');

// Find the JSON cache entry for the page data
const startMarker = '"key":"auto-page:';
const startIdx = log.indexOf(startMarker);
if (startIdx === -1) {
  console.log('Could not find auto-page cache entry in log!');
  process.exit(1);
}

// Find the start of the JSON object
const jsonStart = startIdx - 1;

// Parse by counting braces
let braceCount = 0;
let jsonEnd = -1;
for (let i = jsonStart; i < log.length; i++) {
  if (log[i] === '{') braceCount++;
  else if (log[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      jsonEnd = i + 1;
      break;
    }
  }
}

if (jsonEnd === -1) {
  console.log('Could not find end of JSON!');
  process.exit(1);
}

console.log('JSON length:', jsonEnd - jsonStart);
let rawJson = log.substring(jsonStart, jsonEnd);

// Clean up control characters that may be present from PowerShell output
// Remove \r characters
rawJson = rawJson.replace(/\r/g, '');
// Remove lone \n in the middle of strings (but keep them in JSON structure)
// Actually, the issue is that the log has line breaks from terminal wrapping
// Let's try joining all lines
rawJson = rawJson.replace(/\n/g, '');

// Verify it's valid JSON
let parsed;
try {
  parsed = JSON.parse(rawJson);
  console.log('✅ JSON is valid!');
  console.log('   Key:', parsed.key.substring(0, 100));
  console.log('   Has document:', !!parsed.data?.document);
  console.log('   Pages:', parsed.data?.document?.children?.length);
  if (parsed.data?.document?.children?.[0]) {
    const page = parsed.data.document.children[0];
    console.log('   Page 1:', page.name, 'type:', page.type, 'children:', page.children?.length);
  }
} catch (e) {
  console.log('❌ JSON parse error:', e.message);
  // Try to find the problematic area
  const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
  console.log('   Context around error:', JSON.stringify(rawJson.substring(Math.max(0, pos-30), pos+30)));
  process.exit(1);
}

// Build cache entries
const pageData = parsed.data;
const page1 = pageData.document?.children?.[0];
if (!page1) {
  console.log('Could not find Page 1!');
  process.exit(1);
}

// Build node-format response (scope=node)
const nodeData = {
  name: pageData.name,
  lastModified: pageData.lastModified,
  version: pageData.version,
  thumbnailUrl: pageData.thumbnailUrl,
  nodes: {
    '0:1': {
      document: page1
    }
  }
};

// Build check-format response (shallow)
const shallowPage = {
  ...page1,
  children: page1.children?.map(c => ({ id: c.id, name: c.name, type: c.type })) || []
};
const checkData = {
  name: pageData.name,
  nodes: {
    '0:1': {
      document: shallowPage
    }
  }
};

// Ensure cache directory
fs.mkdirSync(CACHE_DIR, { recursive: true });

function saveCache(key, data, ttl = 24 * 60 * 60 * 1000) {
  const entry = { key, data, timestamp: Date.now(), ttl };
  const hash = crypto.createHash('sha256').update(key).digest('hex').substring(0, 32);
  const filePath = path.join(CACHE_DIR, `${hash}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry), 'utf-8');
  console.log(`✅ Saved: ${hash}.json (${Math.round(fs.statSync(filePath).size/1024)}KB)`);
}

const nodeKey = 'auto-node:https://api.figma.com/v1/files/b6JmSNO0Ui5MKT2pdqhby2/nodes?ids=0%3A1&depth=10&geometry=paths';
const checkKey = 'auto-check:https://api.figma.com/v1/files/b6JmSNO0Ui5MKT2pdqhby2/nodes?ids=0%3A1&depth=1';
const pageKey = 'auto-page:https://api.figma.com/v1/files/b6JmSNO0Ui5MKT2pdqhby2?depth=10&geometry=paths';

saveCache(checkKey, checkData);
saveCache(nodeKey, nodeData);
saveCache(pageKey, pageData);

console.log('\n🎉 Cache restored! Auto-convert will use cached node data.');
