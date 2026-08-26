/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { DiffResult, SpecChange } from './SpecDiff';

export interface ChangelogOptions {
  /** Label of the old version, e.g. `v1.2.0` or a git ref. */
  fromLabel: string;
  /** Label of the new version. */
  toLabel: string;
  /** ISO date printed in the heading. Defaults to today. */
  date?: string;
}

/** Kinds that read as additions to the API surface. */
const ADDED_KINDS = new Set([
  'path.added',
  'operation.added',
  'response.added',
  'parameter.added',
  'requestBody.added',
]);

/** Kinds that read as removals of the API surface. */
const REMOVED_KINDS = new Set([
  'path.removed',
  'operation.removed',
  'response.removed',
  'parameter.removed',
  'requestBody.removed',
]);

function section(title: string, changes: SpecChange[]): string {
  if (changes.length === 0) return '';
  const lines = changes.map(change => `- ${change.detail}`);
  return `### ${title}\n\n${lines.join('\n')}\n\n`;
}

/**
 * Renders a diff between two API versions as a Keep-a-Changelog style
 * Markdown document aimed at API consumers.
 *
 * The diff engine already knows what changed and how dangerous it is; this
 * formatter only decides how a human wants to read it: Breaking first
 * (consumers must act), then Removed, Changed and Added.
 */
export function formatApiChangelog(result: DiffResult, options: ChangelogOptions): string {
  const date = options.date || new Date().toISOString().slice(0, 10);
  const header = `# API Changelog — ${options.fromLabel} → ${options.toLabel}\n\n_${date}_\n\n`;

  if (result.changes.length === 0) {
    return header + 'No API changes detected.\n';
  }

  const breaking = result.breaking;
  const removed = result.changes.filter(
    change => change.level !== 'breaking' && REMOVED_KINDS.has(change.kind),
  );
  const added = result.changes.filter(
    change => change.level !== 'breaking' && ADDED_KINDS.has(change.kind),
  );
  const changed = result.changes.filter(
    change =>
      change.level !== 'breaking' &&
      !ADDED_KINDS.has(change.kind) &&
      !REMOVED_KINDS.has(change.kind),
  );

  const summary =
    `> ${result.changes.length} change(s): ` +
    `**${breaking.length} breaking**, ${removed.length} removed, ` +
    `${changed.length} changed, ${added.length} added.\n\n`;

  return (
    header +
    summary +
    section('⚠ Breaking Changes', breaking) +
    section('Removed', removed) +
    section('Changed', changed) +
    section('Added', added)
  ).trimEnd() + '\n';
}
