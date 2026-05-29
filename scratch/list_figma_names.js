const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'parsed_preview.html');
if (!fs.existsSync(filePath)) {
  console.log('File not found:', filePath);
  process.exit(1);
}

const html = fs.readFileSync(filePath, 'utf8');

// Match data-figma-name values
const regex = /data-figma-name="([^"]+)"/g;
let match;
const names = new Set();
while ((match = regex.exec(html)) !== null) {
  names.add(match[1]);
}

console.log('All Figma Names found in HTML:');
names.forEach(name => {
  console.log(' - ' + name);
});
