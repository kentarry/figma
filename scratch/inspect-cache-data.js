import fs from 'fs';
import path from 'path';

const cacheDir = './.cache';
const files = fs.readdirSync(cacheDir);

for (const file of files) {
  if (file.endsWith('.json')) {
    const data = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'));
    console.log(`File: ${file}`);
    console.log(`  Key: ${data.key}`);
    console.log(`  Timestamp: ${data.timestamp}`);
    if (data.data) {
      console.log(`  Data type: ${typeof data.data}`);
      if (Array.isArray(data.data)) {
        console.log(`  Data is array of length: ${data.data.length}`);
      } else {
        console.log(`  Data keys: ${Object.keys(data.data).join(', ')}`);
        if (data.data.document) {
          console.log(`    Document type: ${data.data.document.type}, children: ${data.data.document.children?.length}`);
        }
        if (data.data.name) {
          console.log(`    Name: ${data.data.name}`);
        }
        if (data.data.children) {
          console.log(`    Children: ${data.data.children.length}`);
          data.data.children.forEach(c => {
            console.log(`      Child ID: ${c.id}, Name: ${c.name}, Type: ${c.type}`);
          });
        }
      }
    }
    console.log('---------------------------------------------');
  }
}
