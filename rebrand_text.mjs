import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function processFile(filePath) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.js') && !filePath.endsWith('.jsx')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Replace Un 2x3 with Deliexpress (preserving case where possible, but usually it's "Un 2x3")
    content = content.replace(/Un 2x3/g, 'Deliexpress');
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Rebranded text in', filePath);
    }
}

walkDir('./src', processFile);
