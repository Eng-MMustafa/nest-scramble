/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { Controller, Get, Inject, Res } from '@nestjs/common';

@Controller()
export class DocsController {
  constructor(
    @Inject('NEST_SCRAMBLE_OPENAPI') private openApiSpec: any,
  ) {}

  @Get('docs')
  getDocs(@Res() res: any) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Nest-Scramble API Documentation</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { 
      margin: 0; 
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }
  </style>
</head>
<body>
  <script id="api-reference" data-url="/docs/json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  @Get('docs/json')
  getOpenApiJson(@Res() res: any) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(this.openApiSpec, null, 2));
  }

  @Get('docs/spec')
  getOpenApiSpec() {
    return this.openApiSpec;
  }
}