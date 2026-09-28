/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import * as fs from 'fs';
import * as path from 'path';

export function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveExistingPathWithinRoot(rootPath: string, candidatePath: string): string {
  const root = fs.realpathSync(path.resolve(rootPath));
  const candidate = fs.realpathSync(path.resolve(candidatePath));
  if (!isPathInside(root, candidate)) {
    throw new Error(`Path "${candidatePath}" resolves outside the allowed root "${rootPath}".`);
  }
  return candidate;
}
