async function run() {
  const url = 'http://localhost:3000/api/figma/auto-convert?fileKey=tEJWXLBb2i2rNZ56HKJ26w&nodeId=0-1';
  
  // Test with test_token_figd
  {
    const res = await fetch(url, { headers: { 'X-Figma-Token': 'test_token_figd' } });
    console.log(`test_token_figd: ${res.status}`);
  }

  // Test with fake-token-for-disk-cache
  {
    const res = await fetch(url, { headers: { 'X-Figma-Token': 'fake-token-for-disk-cache' } });
    console.log(`fake-token-for-disk-cache: ${res.status}`);
  }
}

run().catch(console.error);
