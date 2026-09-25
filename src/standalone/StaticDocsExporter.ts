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
    const html = renderDocsPage({
      specUrl: './openapi.json',
      title: input.title ? `${input.title} — API Documentation` : undefined,
      theme: input.theme,
      primaryColor: input.primaryColor,
    });

    const inline = [
      this.jsonScript('scramble-spec', input.spec),
      this.jsonScript('scramble-ws', input.wsDocument || { gateways: [] }),
      this.jsonScript('scramble-graphql', input.graphqlDocument || { resolvers: [] }),
    ].join('\n');

    // Inline documents must exist before the app script runs.
    return html.replace('<body>', `<body>\n${inline}`);
  }

  /** Writes `index.html` plus the raw JSON documents next to it. */
  static write(outputDir: string, input: StaticExportInput): string[] {
    fs.mkdirSync(outputDir, { recursive: true });
    const written: string[] = [];
    const put = (name: string, contents: string) => {
      const file = path.join(outputDir, name);
      fs.writeFileSync(file, contents);
      written.push(file);
    };
    put('index.html', this.render(input));
    put('openapi.json', JSON.stringify(input.spec, null, 2));
    if (input.wsDocument && input.wsDocument.gateways && input.wsDocument.gateways.length) {
      put('websocket.json', JSON.stringify(input.wsDocument, null, 2));
    }
    if (input.graphqlDocument && input.graphqlDocument.resolvers && input.graphqlDocument.resolvers.length) {
      put('graphql.json', JSON.stringify(input.graphqlDocument, null, 2));
    }
    return written;
  }

  /** `</script>` inside JSON would end the tag early — escape it. */
  private static jsonScript(id: string, value: unknown): string {
    const json = JSON.stringify(value).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
    return `<script type="application/json" id="${id}">${json}</script>`;
  }
}
