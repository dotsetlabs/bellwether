export function getTsxCommand(targetPath: string): { command: string; args: string[] } {
  return {
    command: process.execPath,
    args: ['--import', 'tsx', targetPath],
  };
}
