import fs from 'fs';

const cacheData = JSON.parse(fs.readFileSync('./.cache/458d1a0165044bae2bdead2a9726f27d.json', 'utf8'));
const targetNodeWrapper = cacheData.data.nodes["0:1"];
const targetDoc = targetNodeWrapper?.document;

function findNode(node, id) {
  if (node.id === id) return node;
  if (node.children) {
    for (const c of node.children) {
      const found = findNode(c, id);
      if (found) return found;
    }
  }
  return null;
}

if (targetDoc) {
  const node = findNode(targetDoc, '1:42');
  console.log('Node 1:42 properties:', JSON.stringify(node, null, 2));
}
