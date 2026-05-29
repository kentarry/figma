async function run() {
  const url = 'http://localhost:3000/api/figma/auto-convert?fileKey=tEJWXLBb2i2rNZ56HKJ26w&nodeId=0-1';
  console.log(`Fetching ${url}...`);
  const res = await fetch(url, {
    headers: { 'X-Figma-Token': 'test_token_figd' }
  });
  console.log(`Status: ${res.status}`);
  if (res.ok) {
    const data = await res.json();
    console.log('Keys:', Object.keys(data));
    console.log('Success:', data.success);
    console.log('Scope:', data.scope);
    console.log('Exported Nodes:', data.exportedNodeCount);
    console.log('NodeData document name:', data.nodeData?.document?.name);
    console.log('Images keys count:', Object.keys(data.images || {}).length);
    if (data.nodeData?.document?.children) {
      console.log('Document children:');
      data.nodeData.document.children.forEach(c => {
        console.log(`  Child ID: ${c.id}, Name: ${c.name}, Type: ${c.type}`);
      });
    }
  } else {
    console.error(await res.text());
  }
}

run().catch(console.error);
