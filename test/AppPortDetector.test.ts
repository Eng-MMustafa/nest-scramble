/**
 * Tests for the application port detection used by `nest-scramble serve`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppPortDetector } from '../src/utils/AppPortDetector';

function makeProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-port-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

describe('AppPortDetector', () => {
  const roots: string[] = [];
  afterAll(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

  it('prefers PORT from a .env file', () => {
    const root = makeProject({ '.env': 'NODE_ENV=development\nPORT=4321\n', 'src/app.js': 'app.listen(3000);' });
    roots.push(root);
    expect(AppPortDetector.detect(path.join(root, 'src'), root)).toMatchObject({ port: 4321, source: 'env-file' });
  });

  it('reads the fallback literal from app.listen(process.env.PORT || 4000)', () => {
    const root = makeProject({ 'src/server.js': "const app = require('./app');\napp.listen(process.env.PORT || 4000, () => {});" });
    roots.push(root);
    expect(AppPortDetector.detect(path.join(root, 'src'), root)).toMatchObject({ port: 4000, source: 'listen' });
  });

  it('follows a PORT constant to its numeric fallback', () => {
    const root = makeProject({
      'src/main.ts': "const PORT = Number(process.env.PORT ?? 5050);\nasync function bootstrap() { await app.listen(PORT); }\nbootstrap();",
    });
    roots.push(root);
    expect(AppPortDetector.detect(path.join(root, 'src'), root)).toMatchObject({ port: 5050, source: 'listen' });
  });

  it('defaults to 3000 when nothing can be inferred', () => {
    const root = makeProject({ 'src/routes.js': "router.get('/x', () => {});" });
    roots.push(root);
    expect(AppPortDetector.detect(path.join(root, 'src'), root)).toEqual({ port: 3000, source: 'default' });
    expect(AppPortDetector.baseUrl(path.join(root, 'src'), root).url).toBe('http://localhost:3000');
  });
});
