import fs from 'fs';
import path from 'path';

const OLD_URL_BASE = 'https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/otro.png?alt=media';
const NEW_URL = 'https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&token=8acf92ec-b853-4f37-bd82-a4f651bbdcd9';

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

    // Use regex to catch the URL with or without token
    const regex = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/arepa-express-ve-2026\.firebasestorage\.app\/o\/otro\.png\?alt=media(&token=[a-zA-Z0-9-]+)?/g;
    
    content = content.replace(regex, NEW_URL);
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated logo in', filePath);
    }
}

walkDir('./src', processFile);
