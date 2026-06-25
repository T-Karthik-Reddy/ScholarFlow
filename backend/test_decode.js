const fs = require('fs');
const b64 = fs.readFileSync('test.b64', 'utf-8');
const binaryString = atob(b64);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
}
fs.writeFileSync('test.pdf', bytes);
