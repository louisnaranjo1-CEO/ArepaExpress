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

    // We want to replace text-white with text-secondary when it's next to bg-primary (inside the same className / string).
    // Simple approach: find all class strings (between quotes or backticks)
    const classRegex = /className=["'`]({?[^"'`]*}?)["'`]/g;
    
    // Actually, jsx supports className={"..."} and className={`...`} and className="..."
    // Let's just do a regex replace on the file for specific patterns:
    
    // 1. bg-primary text-white -> bg-primary text-secondary
    // This is hard if they are separated.
    // Better: split the file by className="..." and process the content.
    content = content.replace(/className=(?:{(?:`([^`]+)`|'([^']+)'|"([^"]+)")}|"([^"]+)"|'([^']+)')/g, (match, p1, p2, p3, p4, p5) => {
        let cls = p1 || p2 || p3 || p4 || p5;
        if (!cls) return match;
        
        let hasBgPrimary = /\bbg-primary\b/.test(cls);
        let hasTextWhite = /\btext-white\b/.test(cls);
        
        let newCls = cls;
        
        // If it has bg-primary, text should be text-secondary instead of text-white
        if (hasBgPrimary) {
            newCls = newCls.replace(/\btext-white\b/g, 'text-secondary');
            
            // If there's hover:bg-primary hover:text-white -> hover:text-secondary
            newCls = newCls.replace(/\bhover:text-white\b/g, 'hover:text-secondary');
            newCls = newCls.replace(/\bgroup-hover:text-white\b/g, 'group-hover:text-secondary');
        } else {
            // If it doesn't have bg-primary, but maybe it has hover:bg-primary?
            if (/\b(?:hover:|group-hover:)?bg-primary\b/.test(cls)) {
               newCls = newCls.replace(/\bhover:text-white\b/g, 'hover:text-secondary');
               newCls = newCls.replace(/\bgroup-hover:text-white\b/g, 'group-hover:text-secondary');
            }
        }
        
        // Also: "Texto Amarillo sobre Fondo Blanco: contraste es inexistente"
        // Let's replace text-primary on classes that also have bg-white or don't have dark backgrounds
        // If we see text-primary, and we don't see a dark bg, let's just replace text-primary with text-secondary globally (or text-slate-900).
        // Since primary is strictly yellow, text-primary shouldn't be used at all unless it's on a black background (bg-secondary/bg-black/bg-slate-900).
        let hasDarkBg = /\bbg-(secondary|black|slate-800|slate-900)\b/.test(cls);
        if (!hasDarkBg) {
            newCls = newCls.replace(/\btext-primary\b/g, 'text-secondary');
            newCls = newCls.replace(/\btext-yellow-\d+\b/g, 'text-secondary');
            newCls = newCls.replace(/\bhover:text-primary\b/g, 'hover:text-secondary');
            newCls = newCls.replace(/\bgroup-hover:text-primary\b/g, 'group-hover:text-secondary');
            newCls = newCls.replace(/\bgroup-focus-within:text-primary\b/g, 'group-focus-within:text-secondary');
        }
        
        return match.replace(cls, newCls);
    });
    
    // Some text-primary might be outside of simple quotes. We can also just replace `text-primary` with `text-secondary` globally if not preceded by `bg-`
    // but the regex above catches most className="...text-primary..." 
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed', filePath);
    }
}

walkDir('./src', processFile);
