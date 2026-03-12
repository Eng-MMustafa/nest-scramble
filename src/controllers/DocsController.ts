/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { Controller, Get, Inject, Res, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller()
@Public()
export class DocsController {
  constructor(
    @Inject('NEST_SCRAMBLE_OPENAPI') private openApiSpec: any,
    @Inject('NEST_SCRAMBLE_OPTIONS') private options: any,
  ) {}

  @Get('docs')
  getDocs(@Res() res: any) {
    const primaryColor = this.options?.primaryColor || '#00f2ff';
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>API Documentation - Nest-Scramble</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    body { 
      margin: 0; 
      padding: 0;
      font-size: 17px;
      line-height: 1.6;
      letter-spacing: 0.1px;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
    }
    :root {
      --scalar-font: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
      --scalar-font-code: 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    }
    .light-mode {
      --scalar-color-1: #141824;
      --scalar-color-2: rgba(20, 24, 36, 0.7);
      --scalar-color-3: rgba(20, 24, 36, 0.55);
      --scalar-color-accent: ${primaryColor};
      --scalar-background-1: #ffffff;
      --scalar-background-2: #f5f7fb;
      --scalar-background-3: #eef2f8;
      --scalar-background-accent: ${primaryColor}12;
      --scalar-border-color: rgba(20, 24, 36, 0.08);
    }
    .dark-mode {
      --scalar-color-1: rgba(246, 249, 255, 0.94);
      --scalar-color-2: rgba(226, 235, 248, 0.76);
      --scalar-color-3: rgba(205, 219, 238, 0.6);
      --scalar-color-accent: ${primaryColor};
      --scalar-background-1: #1a2130;
      --scalar-background-2: #222b3a;
      --scalar-background-3: #2b3548;
      --scalar-background-accent: ${primaryColor}1a;
      --scalar-border-color: rgba(214, 226, 242, 0.12);
    }
    .scalar-api-reference nav,
    .scalar-api-reference aside,
    .scalar-api-reference .sidebar,
    .scalar-api-reference .toc,
    .scalar-api-reference .toc a,
    .scalar-api-reference .sidebar a {
      font-size: 1.05rem;
      letter-spacing: 0.2px;
    }
    .group\/button-label {
      font-size: large;
      font-weight: 600;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <script id="api-reference" data-url="/docs-json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('docs-json')
  getOpenApiJson(@Res() res: any) {
    try {
      const jsonString = JSON.stringify(this.openApiSpec, null, 2);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(jsonString);
    } catch (error) {
      console.error('[Nest-Scramble] Error serializing OpenAPI spec:', error);
      res.status(500).json({ error: 'Failed to generate OpenAPI specification' });
    }
  }

  @Get('docs/json')
  getOpenApiJsonLegacy(@Res() res: any) {
    return this.getOpenApiJson(res);
  }

  @Get('docs/spec')
  getOpenApiSpec() {
    return this.openApiSpec;
  }
}