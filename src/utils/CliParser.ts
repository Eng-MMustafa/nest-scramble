/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/

/**
 * Minimal command-line parser backing the CLI.
 *
 * This replaces commander. The CLI has three commands and a dozen flags, all
 * exercised by the e2e suite; a parser covering exactly that contract is a
 * hundred lines and removes a runtime dependency. Both `--flag value` and
 * `--flag=value` forms are accepted.
 */

export interface OptionDef {
  /** Property name on the parsed options object, e.g. 'failOnBreaking'. */
  key: string;
  /** Long form including dashes, e.g. '--fail-on-breaking'. */
  long: string;
  /** Short form including dash, e.g. '-o'. */
  short?: string;
  /** Placeholder shown in help for value-taking options, e.g. '<file>'. */
  placeholder?: string;
  /** Boolean flags take no value and default to false. */
  boolean?: boolean;
  default?: string | boolean;
  description: string;
}

export interface CommandDef {
  name: string;
  /** Required positional argument names, e.g. ['base', 'head']. */
  positionals: string[];
  options: OptionDef[];
  description: string;
}

export interface ParsedCommand {
  positionals: string[];
  options: Record<string, string | boolean>;
}

export class CliUsageError extends Error {}

export function parseCommand(def: CommandDef, args: string[]): ParsedCommand {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (const opt of def.options) {
    options[opt.key] = opt.boolean ? false : (opt.default ?? '');
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }

    const [flag, inlineValue] = arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, undefined];

    const opt = def.options.find((o) => o.long === flag || o.short === flag);
    if (!opt) {
      throw new CliUsageError(`unknown option '${flag}' for '${def.name}'`);
    }

    if (opt.boolean) {
      options[opt.key] = true;
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      value = args[++i];
      if (value === undefined || value.startsWith('-')) {
        throw new CliUsageError(`option '${flag}' requires a value`);
      }
    }
    options[opt.key] = value;
  }

  if (positionals.length < def.positionals.length) {
    const missing = def.positionals[positionals.length];
    throw new CliUsageError(`missing required argument '${missing}' for '${def.name}'`);
  }

  return { positionals, options };
}

export function formatHelp(binName: string, description: string, commands: CommandDef[]): string {
  const lines: string[] = [
    `Usage: ${binName} <command> [options]`,
    '',
    description,
    '',
    'Commands:',
  ];

  for (const cmd of commands) {
    const args = cmd.positionals.map((p) => `<${p}>`).join(' ');
    lines.push(`  ${`${cmd.name} ${args}`.trim().padEnd(28)} ${cmd.description}`);
    for (const opt of cmd.options) {
      const flags = [opt.short, opt.long].filter(Boolean).join(', ');
      const value = opt.placeholder ? ` ${opt.placeholder}` : '';
      lines.push(`      ${`${flags}${value}`.padEnd(30)} ${opt.description}`);
    }
    lines.push('');
  }

  lines.push('Global:');
  lines.push('      --version                      Print the package version');
  lines.push('      --help                         Show this help');
  lines.push('');

  return lines.join('\n');
}
