const fs = require('fs');
const content = fs.readFileSync('components/Dashboard.tsx', 'utf8');
const lines = content.split('\n');

let braceBalance = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Simple comment removal (imperfect but helps)
    const cleanLine = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');

    const openBraces = (cleanLine.match(/\{/g) || []).length;
    const closeBraces = (cleanLine.match(/\}/g) || []).length;

    braceBalance += openBraces - closeBraces;

    // Log if balance is high or changes significantly
    if (i >= 1400 && i <= 1610) {
        console.log(`Line ${i + 1}: Balance ${braceBalance} (+${openBraces}, -${closeBraces}) : ${cleanLine.trim().substring(0, 40)}`);
    }
}
console.log(`Final Brace Balance: ${braceBalance}`);

// Second pass: print lines where balance increases and never returns
// This is harder. Just print the lines where balance is high?
// Let's print the balance at the end of every 100 lines.
for (let i = 0; i < lines.length; i += 100) {
    let subRaw = lines.slice(0, i + 1).join('\n');
    // Regex based count
    let o = (subRaw.match(/\{/g) || []).length;
    let c = (subRaw.match(/\}/g) || []).length;
    console.log(`Line ${i}: Balance ${o - c}`);
}
