import fs from 'fs';

const cacheData = JSON.parse(fs.readFileSync('./.cache/458d1a0165044bae2bdead2a9726f27d.json', 'utf8'));
const targetNodeWrapper = cacheData.data.nodes["0:1"];
const targetDoc = targetNodeWrapper?.document;

if (targetDoc && targetDoc.children) {
  targetDoc.children.forEach(c => {
    if (c.name.includes('畫面') || c.name.includes('主') || c.name.includes('投注')) {
      console.log(`Node Name: ${c.name}`);
      console.log(`  absoluteBoundingBox:`, c.absoluteBoundingBox);
    }
  });
}
