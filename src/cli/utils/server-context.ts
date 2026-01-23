import type { ServerContext } from '../../interview/types.js';

/**
 * Extract server context from command and arguments.
 *
 * Analyzes the server command to provide hints about the server type
 * (filesystem, database, git, etc.) and extracts path arguments for
 * allowed directories.
 */
export function extractServerContextFromArgs(command: string, args: string[]): ServerContext {
  const context: ServerContext = {
    allowedDirectories: [],
    constraints: [],
    hints: [],
  };

  const fullCommand = `${command} ${args.join(' ')}`.toLowerCase();
  const pathArgs = args.filter((arg) => arg.startsWith('/') && !arg.startsWith('--'));

  if (fullCommand.includes('filesystem') || fullCommand.includes('file-system')) {
    context.allowedDirectories = pathArgs;
    if (context.allowedDirectories.length > 0) {
      context.hints!.push(`Filesystem server with allowed directories: ${context.allowedDirectories.join(', ')}`);
    }
    context.constraints!.push('Operations limited to specified directories');
  } else if (fullCommand.includes('postgres') || fullCommand.includes('mysql') || fullCommand.includes('sqlite')) {
    context.hints!.push('Database server - SQL operations expected');
    context.constraints!.push('Database operations only');
  } else if (fullCommand.includes('git')) {
    context.allowedDirectories = pathArgs;
    context.hints!.push('Git server - repository operations expected');
  } else {
    context.allowedDirectories = pathArgs;
  }

  return context;
}
