/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { ChangeLevel, DiffResult, SpecChange } from './SpecDiff';

export type DiffFormat = 'text' | 'json' | 'markdown';

const LEVEL_ORDER: ChangeLevel[] = ['breaking', 'warning', 'safe'];

const TEXT_MARKERS: Record<ChangeLevel, string> = {
  breaking: 'BREAKING',
  warning: 'WARNING ',
  safe: 'SAFE    ',
};

const HEADINGS: Record<ChangeLevel, string> = {
  breaking: 'Breaking changes',
  warning: 'Warnings',
  safe: 'Safe changes',
};

function group(changes: SpecChange[]): Map<ChangeLevel, SpecChange[]> {
  const grouped = new Map<ChangeLevel, SpecChange[]>();

  for (const level of LEVEL_ORDER) {
    const matching = changes.filter(change => change.level === level);
    if (matching.length > 0) {
      grouped.set(level, matching);
    }
  }

  return grouped;
}

function summaryLine(result: DiffResult): string {
  return `${result.breaking.length} breaking, ${result.warnings.length} warning, ${result.safe.length} safe`;
}

function formatText(result: DiffResult): string {
  if (result.changes.length === 0) {
    return 'No API changes detected.';
  }

  const lines: string[] = [];

  for (const [level, changes] of group(result.changes)) {
    for (const change of changes) {
      lines.push(`${TEXT_MARKERS[level]}  ${change.detail}`);
    }
  }

  lines.push('');
  lines.push(summaryLine(result));

  return lines.join('\n');
}

function formatMarkdown(result: DiffResult): string {
  if (result.changes.length === 0) {
    return '## API diff\n\nNo API changes detected.';
  }

  const lines: string[] = ['## API diff', '', summaryLine(result), ''];

  for (const [level, changes] of group(result.changes)) {
    lines.push(`### ${HEADINGS[level]}`, '');

    for (const change of changes) {
      const location = change.location ? ` \`${change.location}\`` : '';
      lines.push(`- ${change.detail}${location}`);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function formatJson(result: DiffResult): string {
  return JSON.stringify(
    {
      hasBreaking: result.hasBreaking,
      summary: {
        breaking: result.breaking.length,
        warning: result.warnings.length,
        safe: result.safe.length,
      },
      changes: result.changes,
    },
    null,
    2,
  );
}

/** Renders a diff for humans, for a pull request comment, or for tooling. */
export function formatDiff(result: DiffResult, format: DiffFormat = 'text'): string {
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'markdown':
      return formatMarkdown(result);
    default:
      return formatText(result);
  }
}
