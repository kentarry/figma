import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./.cache/458d1a0165044bae2bdead2a9726f27d.json', 'utf8'));
const targetNode = data.data.nodes["0:1"];
if (targetNode) {
  console.log(`Target Node Name: ${targetNode.document.name}, Type: ${targetNode.document.type}`);
  if (targetNode.document.children) {
    console.log(`Children count: ${targetNode.document.children.length}`);
    targetNode.document.children.forEach(c => {
      console.log(`  Child ID: ${c.id}, Name: ${c.name}, Type: ${c.type}`);
      if (c.children) {
        console.log(`    Sub-children count: ${c.children.length}`);
        c.children.forEach(sc => {
          console.log(`      Sub-child ID: ${sc.id}, Name: ${sc.name}, Type: ${sc.type}`);
        });
      }
    });
  }
} else {
  console.log('Nodes["0:1"] not found. Available keys in nodes:', Object.keys(data.data.nodes));
}
