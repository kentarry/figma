import fs from 'fs';

const cacheData = JSON.parse(fs.readFileSync('./.cache/458d1a0165044bae2bdead2a9726f27d.json', 'utf8'));
const targetNodeWrapper = cacheData.data.nodes["0:1"];
const targetDoc = targetNodeWrapper?.document;

function traverse(node, path = '') {
  const currentPath = path ? `${path} > ${node.name}` : node.name;
  if (node.type === 'RECTANGLE' || node.type === 'IMAGE' || (node.fills && node.fills.some(f => f.type === 'IMAGE'))) {
    console.log(`Node: ${currentPath} [ID: ${node.id}, Type: ${node.type}, Fills: ${node.fills?.map(f=>f.type).join(',')}]`);
  }
  if (node.children) {
    node.children.forEach(c => traverse(c, currentPath));
  }
}

if (targetDoc) {
  traverse(targetDoc);
}
