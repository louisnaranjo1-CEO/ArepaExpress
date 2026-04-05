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

    content = content.replace(/className=(?:{(?:`([^`]+)`|'([^']+)'|"([^"]+)")}|"([^"]+)"|'([^']+)')/g, (match, p1, p2, p3, p4, p5) => {
        let cls = p1 || p2 || p3 || p4 || p5;
        if (!cls) return match;
        
        let newCls = cls;
        
        let hasBgPrimary = /\bbg-primary\b/.test(cls);
        let hasDarkBg = /\bbg-(secondary|black|slate-800|slate-900)\b/.test(cls);
        
        if (hasBgPrimary) {
            newCls = newCls.replace(/\btext-white\b/g, 'text-slate-900');
            newCls = newCls.replace(/\bhover:text-white\b/g, 'hover:text-slate-900');
            newCls = newCls.replace(/\bgroup-hover:text-white\b/g, 'group-hover:text-slate-900');
        } else if (/\b(?:hover:|group-hover:)?bg-primary\b/.test(cls)) {
            newCls = newCls.replace(/\bhover:text-white\b/g, 'hover:text-slate-900');
            newCls = newCls.replace(/\bgroup-hover:text-white\b/g, 'group-hover:text-slate-900');
        }
        
        if (!hasDarkBg) {
            newCls = newCls.replace(/\btext-primary\b/g, 'text-slate-900');
            newCls = newCls.replace(/\bhover:text-primary\b/g, 'hover:text-slate-900');
            newCls = newCls.replace(/\bgroup-hover:text-primary\b/g, 'group-hover:text-slate-900');
            newCls = newCls.replace(/\bgroup-focus-within:text-primary\b/g, 'group-focus-within:text-slate-900');
            
            // Also replace some yellow text
            newCls = newCls.replace(/\btext-yellow-(300|400|500|600)\b/g, 'text-amber-700');
        }
        
        return match.replace(cls, newCls);
    });
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed', filePath);
    }
}

walkDir('./src', processFile);
