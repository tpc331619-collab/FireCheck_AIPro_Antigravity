const fs = require('fs');
const content = fs.readFileSync('components/Dashboard.tsx', 'utf8');
const lines = content.split('\n');

let balance = 0;
let divBalance = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignore single line comments
    const cleanLine = line.replace(/\/\/.*$/, '');

    const openDivs = (cleanLine.match(/<div\b/g) || []).length;
    const closeDivs = (cleanLine.match(/<\/div>/g) || []).length;

    divBalance += openDivs - closeDivs;

    if (i < 1040 && (openDivs > 0 || closeDivs > 0)) {
        console.log(`Line ${i + 1}: Balance ${divBalance} (Open: ${openDivs}, Close: ${closeDivs}) : ${line.trim().substring(0, 50)}`);
    }
}
console.log(`Final Balance: ${divBalance}`);
// Read last few lines to see if we missed closing
