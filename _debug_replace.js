const p = { name: 'id' };
const repl = `\${${p.name}}`;
console.log('repl value:', JSON.stringify(repl));
const result = '/:id'.replace(new RegExp(`:${p.name}`, 'g'), repl);
console.log('result:', JSON.stringify(result));
