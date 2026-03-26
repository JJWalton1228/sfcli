import { describe, it, expect } from 'vitest';
import { getCompletions, generateBashCompletionScript, generateZshCompletionScript } from '../../src/utils/completions.js';

describe('Tab completion — getCompletions', () => {
  it('should return top-level commands when no args', () => {
    const results = getCompletions([]);
    expect(results).toContain('customers');
    expect(results).toContain('jobs');
    expect(results).toContain('techs');
    expect(results).toContain('auth');
    expect(results).toContain('cache');
    expect(results).toContain('sync');
    expect(results).toContain('config');
  });

  it('should return subcommands for customers', () => {
    const results = getCompletions(['customers']);
    expect(results).toContain('list');
    expect(results).toContain('search');
    expect(results).toContain('get');
    expect(results).toContain('create');
    expect(results).toContain('update');
  });

  it('should return subcommands for jobs', () => {
    const results = getCompletions(['jobs']);
    expect(results).toContain('list');
    expect(results).toContain('get');
    expect(results).toContain('today');
    expect(results).toContain('this-week');
    expect(results).toContain('create');
  });

  it('should return subcommands for cache', () => {
    const results = getCompletions(['cache']);
    expect(results).toContain('refresh');
    expect(results).toContain('status');
    expect(results).toContain('clear');
  });

  it('should return subcommands for sync', () => {
    const results = getCompletions(['sync']);
    expect(results).toContain('push');
    expect(results).toContain('pull');
    expect(results).toContain('schedule');
    expect(results).toContain('status');
    expect(results).toContain('fm-test');
  });

  it('should return sync schedule subcommands', () => {
    const results = getCompletions(['sync', 'schedule']);
    expect(results).toContain('enable');
    expect(results).toContain('disable');
    expect(results).toContain('status');
  });

  it('should return global flags when current word starts with --', () => {
    const results = getCompletions(['--']);
    expect(results).toContain('--profile');
    expect(results).toContain('--output');
    expect(results).toContain('--verbose');
    expect(results).toContain('--no-cache');
  });

  it('should filter completions by partial input', () => {
    const results = getCompletions(['cu']);
    expect(results).toContain('customers');
    expect(results).not.toContain('jobs');
  });

  it('should return empty array for unknown command', () => {
    const results = getCompletions(['nonexistent']);
    expect(results).toEqual([]);
  });
});

describe('Tab completion — shell scripts', () => {
  it('should generate a bash completion script containing the function name', () => {
    const script = generateBashCompletionScript();
    expect(script).toContain('_sfcli_completions');
    expect(script).toContain('complete -F');
    expect(script).toContain('sfcli');
  });

  it('should generate a zsh completion script', () => {
    const script = generateZshCompletionScript();
    expect(script).toContain('compdef');
    expect(script).toContain('sfcli');
  });
});
