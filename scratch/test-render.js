import fs from 'fs';

async function main() {
  try {
    const res = await fetch('http://localhost:3000/api/local/parse?path=index.aspx');
    const data = await res.json();
    fs.writeFileSync('scratch/parsed_preview.html', data.html);
    fs.writeFileSync('scratch/parsed_preview.css', data.css);
    console.log('Successfully saved parsed HTML and CSS to scratch/');
  } catch (err) {
    console.error('Error fetching parsed files:', err);
  }
}

main();
