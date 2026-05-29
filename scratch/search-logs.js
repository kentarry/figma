import fs from 'fs';
import readline from 'readline';

const logPath = 'c:/Users/raylee/.gemini/antigravity/brain/484fcd52-49f2-490a-869d-e76c2dfb3496/.system_generated/logs/transcript.jsonl';

async function run() {
  if (!fs.existsSync(logPath)) {
    console.error('Log file does not exist at:', logPath);
    return;
  }

  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    if (line.includes('_injectBetButtons')) {
      console.log(`Match ${++count}:`);
      // Print first 500 chars of matching line to avoid overflow
      console.log(line.substring(0, 800));
      console.log('---------------------------------------------');
    }
  }
}

run().catch(console.error);
