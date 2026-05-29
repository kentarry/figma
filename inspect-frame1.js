import fs from 'fs';
import path from 'path';

const cacheDir = './.cache';
const files = fs.readdirSync(cacheDir);

for (const file of files) {
  if (!file.endsWith('.json')) continue;
  const filePath = path.join(cacheDir, file);
  const cacheEntry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const data = cacheEntry.data;
  
  if (!data || !data.nodes) continue;
  
  const rootNode = data.nodes['0:1'] || data.nodes['0%3A1'];
  if (!rootNode || !rootNode.document) continue;
  
  console.log(`\n=== Scanning ${file} ===`);
  
  function dumpSubtree(node, targetId, match = false) {
    let currentMatch = match || (node.id === targetId);
    if (currentMatch) {
      console.log(`Node: ID=${node.id}, Name="${node.name}", Type=${node.type}`);
      if (node.characters) console.log(`  Text: "${node.characters}"`);
    }
    if (node.children) {
      node.children.forEach(c => dumpSubtree(c, targetId, currentMatch));
    }
  }
  
  dumpSubtree(rootNode.document, '2:6');
}
