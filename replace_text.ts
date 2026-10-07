import fs from 'fs';
import path from 'path';

function processFile(filePath: string) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  content = content.replace(/hover:bg-slate-100\/5/g, 'hover:bg-slate-800');
  content = content.replace(/hover:bg-slate-100\/10/g, 'hover:bg-slate-700');
  content = content.replace(/hover:bg-slate-100\/20/g, 'hover:bg-slate-700');
  content = content.replace(/hover:bg-slate-100\/30/g, 'hover:bg-slate-600');
  
  content = content.replace(/bg-slate-100\/5/g, 'bg-slate-800');
  content = content.replace(/bg-slate-100\/10/g, 'bg-slate-800');
  content = content.replace(/bg-slate-100\/20/g, 'bg-slate-800');
  content = content.replace(/bg-slate-100\/30/g, 'bg-slate-700');
  
  content = content.replace(/border-slate-100\/5/g, 'border-slate-800');
  content = content.replace(/border-slate-100\/10/g, 'border-slate-700');
  content = content.replace(/border-slate-100\/20/g, 'border-slate-700');
  content = content.replace(/border-slate-100\/30/g, 'border-slate-600');

  fs.writeFileSync(filePath, content);
}

function walkDir(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.css')) {
      processFile(fullPath);
    }
  }
}

walkDir('./src');
console.log('Done');
