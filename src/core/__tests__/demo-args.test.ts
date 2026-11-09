import { describe, expect, it } from 'vitest';
import { parseDemoArgs, UsageError } from '../../../scripts/demo-args';

describe('demo:export arguments', () => {
  it('defaults to both modes, trigger commands, exports/demo, no autotest', () => {
    expect(parseDemoArgs([])).toEqual({ modes: ['registry', 'functions'], commandMode: 'trigger', out: 'exports/demo', autotest: false, help: false });
  });

  it('parses --commands in both spellings, with the other flags', () => {
    expect(parseDemoArgs(['--commands', 'direct']).commandMode).toBe('direct');
    expect(parseDemoArgs(['--commands=trigger']).commandMode).toBe('trigger');
    expect(parseDemoArgs(['--mode', 'functions', '--autotest', '--commands=direct', '--out=x'])).toEqual({
      modes: ['functions'], commandMode: 'direct', out: 'x', autotest: true, help: false,
    });
    expect(parseDemoArgs(['-h']).help).toBe(true);
  });

  it('rejects bad values and unknown flags', () => {
    expect(() => parseDemoArgs(['--commands', 'chat'])).toThrow(UsageError);
    expect(() => parseDemoArgs(['--commands'])).toThrow(/missing value/);
    expect(() => parseDemoArgs(['--commands', '--autotest'])).toThrow(/missing value/);
    expect(() => parseDemoArgs(['--mode', 'all'])).toThrow(/bad --mode/);
    expect(() => parseDemoArgs(['--trigger'])).toThrow(/unknown argument/);
  });
});
