import fs from 'fs';
import { NodeParser } from '../public/js/node-parser.js';

// Mock sanitizeClassName and other functions if needed, or import them
// Let's load the cache file directly
const cacheData = JSON.parse(fs.readFileSync('./.cache/458d1a0165044bae2bdead2a9726f27d.json', 'utf8'));
const targetNodeWrapper = cacheData.data.nodes["0:1"];
const targetDoc = targetNodeWrapper?.document;

if (!targetDoc) {
  console.error('No targetDoc found in cache!');
  process.exit(1);
}

const parser = new NodeParser();
const parsedTree = parser.parse(targetDoc);

console.log('Parsed Tree Name:', parsedTree.name, 'Type:', parsedTree.type);
console.log('Parsed Tree Children count:', parsedTree.children?.length);
if (parsedTree.children) {
  parsedTree.children.forEach(c => {
    console.log(`  Child ID: ${c.id}, Name: ${c.name}, Type: ${c.type}, ClassName: ${c.className}`);
    if (c.children) {
      console.log(`    Sub-children count: ${c.children.length}`);
      c.children.forEach(sc => {
        console.log(`      Sub-child ID: ${sc.id}, Name: ${sc.name}, Type: ${sc.type}, ClassName: ${sc.className}`);
      });
    }
  });
}
