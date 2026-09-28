/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';
import { renderDocsPage } from '../utils/DocsPageRenderer';

export interface StaticExportInput {
  spec: any;
  wsDocument?: any;
  graphqlDocument?: any;
  title?: string;
  theme?: 'futuristic' | 'classic';
  primaryColor?: string;
}

/**
 * Produces a single self-contained `index.html`: the full docs UI with the
 * OpenAPI, WebSocket and GraphQL documents inlined as JSON script tags.
 * Drop it on GitHub Pages, S3 or open it from disk — no server required.
 * "Try it" still works against `servers[0].url` when that host allows CORS.
 */
export class StaticDocsExporter {
  static render(input: StaticExportInput): string {
    const safeInput = this.publicInput(input);
    const html = renderDocsPage({
      specUrl: './openapi.json',
      title: safeInput.title ? `${safeInput.title} — API Documentation` : undefined,
      theme: safeInput.theme,
      primaryColor: safeInput.primaryColor,
    });

    const inline = [
      this.jsonScript('scramble-spec', safeInput.spec),
      this.jsonScript('scramble-ws', safeInput.wsDocument || { gateways: [] }),
      this.jsonScript('scramble-graphql', safeInput.graphqlDocument || { resolvers: [] }),
    ].join('\n');

    // Inline documents must exist before the app script runs.
    return html.replace('<body>', `<body>\n${inline}`);
  }

  /** Writes `index.html` plus the raw JSON documents next to it. */
  static write(outputDir: string, input: StaticExportInput): string[] {
    const absoluteOutput = path.resolve(outputDir);
    if (fs.existsSync(absoluteOutput) && fs.lstatSync(absoluteOutput).isSymbolicLink()) {
      throw new Error('Static docs output directory must not be a symbolic link.');
    }
    fs.mkdirSync(absoluteOutput, { recursive: true });
    const outputRoot = fs.realpathSync(absoluteOutput);
    const safeInput = this.publicInput(input);
    const written: string[] = [];
    const put = (name: string, contents: string) => {
      const file = path.join(outputRoot, name);
      if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) {
        throw new Error(`Static docs output file must not be a symbolic link: ${name}`);
      }
      fs.writeFileSync(file, contents);
      written.push(file);
    };
    put('index.html', this.render(safeInput));
    put('openapi.json', JSON.stringify(safeInput.spec, null, 2));
    if (safeInput.wsDocument && safeInput.wsDocument.gateways && safeInput.wsDocument.gateways.length) {
      put('websocket.json', JSON.stringify(safeInput.wsDocument, null, 2));
    }
    if (safeInput.graphqlDocument && safeInput.graphqlDocument.resolvers && safeInput.graphqlDocument.resolvers.length) {
      put('graphql.json', JSON.stringify(safeInput.graphqlDocument, null, 2));
    }
    return written;
  }

  private static publicInput(input: StaticExportInput): StaticExportInput {
    return this.redactPaths(input) as StaticExportInput;
  }

  private static redactPaths(value: unknown, key = ''): unknown {
    if (typeof value === 'string' && /^(filePath|sourcePath)$/i.test(key)) return path.basename(value);
    if (Array.isArray(value)) return value.map((item) => this.redactPaths(item));
    if (value && typeof value === 'object') {
      const safe: Record<string, unknown> = Object.create(null);
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        if (['__proto__', 'constructor', 'prototype'].includes(childKey)) continue;
        safe[childKey] = this.redactPaths(childValue, childKey);
      }
      return safe;
    }
    return value;
  }

  /** `</script>` inside JSON would end the tag early — escape it. */
  private static jsonScript(id: string, value: unknown): string {
    const json = JSON.stringify(value).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
    return `<script type="application/json" id="${id}">${json}</script>`;
  }
}
