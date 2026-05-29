import { writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const psContent = `Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '請選擇要切版的設計稿資料夾（包含 HTML/ASPX/CSS/圖片的目錄）'
$f.ShowNewFolderButton = $false
$f.RootFolder = 'MyComputer'
if ($f.ShowDialog() -eq 'OK') {
    Write-Output $f.SelectedPath
} else {
    Write-Output 'CANCELLED'
}`;

const tempFile = join(process.cwd(), 'temp_select.ps1');

try {
  // Write temporary ps1 file with UTF-8 encoding
  writeFileSync(tempFile, psContent, 'utf-8');
  
  // Run powershell file using UTF8 output encoding to support Chinese paths correctly
  const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${tempFile}'"`, {
    encoding: 'utf8'
  });
  
  console.log(result.trim());
} catch (e) {
  console.log('CANCELLED');
} finally {
  try {
    unlinkSync(tempFile);
  } catch (e) {}
}
