// Argument parsing of `npm run demo:export` (separate module so tests can import it without running an export).
import type { CommandMode, ExportMode } from '../src/core/export/types';

export const DEMO_USAGE =
  'usage: npm run demo:export -- [--mode registry|functions|both] [--commands trigger|direct] [--out exports/demo] [--autotest]';

export class UsageError extends Error {}

export interface DemoArgs {
  modes: ExportMode[];
  /** Default trigger (like the export dialog). */
  commandMode: CommandMode;
  out: string;
  autotest: boolean;
  help: boolean;
}

export function parseDemoArgs(argv: string[]): DemoArgs {
  let mode = 'both', commands = 'trigger', out = 'exports/demo', autotest = false, help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new UsageError(`missing value for ${a}`);
      return v;
    };
    if (a === '--mode') mode = value();
    else if (a.startsWith('--mode=')) mode = a.slice('--mode='.length);
    else if (a === '--commands') commands = value();
    else if (a.startsWith('--commands=')) commands = a.slice('--commands='.length);
    else if (a === '--out') out = value();
    else if (a.startsWith('--out=')) out = a.slice('--out='.length);
    else if (a === '--autotest') autotest = true;
    else if (a === '--help' || a === '-h') help = true;
    else throw new UsageError(`unknown argument ${a}`);
  }
  if (mode !== 'registry' && mode !== 'functions' && mode !== 'both') throw new UsageError(`bad --mode ${mode}`);
  if (commands !== 'trigger' && commands !== 'direct') throw new UsageError(`bad --commands ${commands} (trigger or direct)`);
  return { modes: mode === 'both' ? ['registry', 'functions'] : [mode], commandMode: commands, out, autotest, help };
}
