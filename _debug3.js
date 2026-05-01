// Exact same compiled code as in dist/generators/TypedClientGenerator.js
// Character for character from the file
function buildUrlExpr(route, pathParams) {
    // Replace :param with ${param} template literal syntax
    let result = '/' + route.replace(/^\/+/, '').replace(/\/*$/, '');
    for (const p of pathParams) {
        const repl = `\${${p.name}}`;
        console.log('  repl =', JSON.stringify(repl));
        result = result.replace(new RegExp(`:${p.name}`, 'g'), repl);
        console.log('  result after replace =', JSON.stringify(result));
        // Also handle {param} style (OpenAPI normalised)
        result = result.replace(new RegExp(`\\{${p.name}\\}`, 'g'), `\${${p.name}}`);
    }
    return result;
}

const params = [{ name: 'id', type: { type: 'number', isArray: false, isOptional: false }, decorator: 'Param', parameterLocation: 'path' }];

console.log('Testing with route ":id":');
console.log('Result:', JSON.stringify(buildUrlExpr(':id', params)));
