import fs from 'fs';

const cacheData = JSON.parse(fs.readFileSync('./.cache/458d1a0165044bae2bdead2a9726f27d.json', 'utf8'));
const targetNodeWrapper = cacheData.data.nodes["0:1"];
const targetDoc = targetNodeWrapper?.document;

function traverse(node, path = '') {
  const currentPath = path ? `${path} > ${node.name}` : node.name;
  const nameLower = (node.name || '').toLowerCase();
  if (nameLower.includes('arrow') || nameLower.includes('next') || nameLower.includes('prev') || nameLower.includes('箭') || nameLower.includes('切') || nameLower.includes('左右')) {
    console.log(`Match: ${currentPath} [ID: ${node.id}, Type: ${node.type}]`);
  }
  if (node.children) {
    node.children.forEach(c => traverse(c, currentPath));
  }
}

if (targetDoc) {
  traverse(targetDoc);
}
