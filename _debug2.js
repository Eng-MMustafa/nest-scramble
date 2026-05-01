// Exact replica of compiled TypedClientGenerator.js buildUrlExpr
const pathParams = [{ name: 'id', type: { type: 'number', isArray: false, isOptional: false }, decorator: 'Param', parameterLocation: 'path' }];
const route = ':id';

let result = '/' + route.replace(/^\/+/, '').replace(/\/*$/, '');
console.log('before replace:', JSON.stringify(result)); // "/:id"

for (const p of pathParams) {
  const repl = `\${${p.name}}`;
  console.log('replacement string:', JSON.stringify(repl));
  
  const regex = new RegExp(`:${p.name}`, 'g');
  console.log('regex:', regex);
  
  result = result.replace(regex, repl);
  console.log('after replace:', JSON.stringify(result));
  
  // also check what String.prototype.replace does with the $ in replacement
  const test = '/:id'.replace(/:id/g, repl);
  console.log('direct test:', JSON.stringify(test));
}

console.log('final urlExpr:', JSON.stringify(result));
