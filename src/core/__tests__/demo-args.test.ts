import { describe, expect, it } from 'vitest';
import { DEMO_USAGE, parseDemoArgs, UsageError } from '../../../scripts/demo-args';

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

  it('parses --scale 1-4 in both spellings; without it the templates keep their own 解析度', () => {
    expect(parseDemoArgs([]).scale).toBeUndefined();
    expect(parseDemoArgs(['--scale', '3']).scale).toBe(3);
    expect(parseDemoArgs(['--scale=1', '--autotest', '--out', 'exports/demo-1x'])).toEqual({
      modes: ['registry', 'functions'], commandMode: 'trigger', out: 'exports/demo-1x', autotest: true, scale: 1, help: false,
    });
    for (const bad of ['0', '5', '2.5', 'x', '']) expect(() => parseDemoArgs([`--scale=${bad}`]), bad).toThrow(/bad --scale/);
    expect(() => parseDemoArgs(['--scale'])).toThrow(/missing value/);
    expect(DEMO_USAGE).toContain('[--scale 1|2|3|4]');
  });

  it('rejects bad values and unknown flags', () => {
    expect(() => parseDemoArgs(['--commands', 'chat'])).toThrow(UsageError);
    expect(() => parseDemoArgs(['--commands'])).toThrow(/missing value/);
    expect(() => parseDemoArgs(['--commands', '--autotest'])).toThrow(/missing value/);
    expect(() => parseDemoArgs(['--mode', 'all'])).toThrow(/bad --mode/);
    expect(() => parseDemoArgs(['--trigger'])).toThrow(/unknown argument/);
  });
});
