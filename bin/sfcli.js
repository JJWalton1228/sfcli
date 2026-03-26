#!/usr/bin/env node

import { createProgram } from '../src/index.js';
import { checkFirstRun } from '../src/commands/setup.js';
import { getCompletions } from '../src/utils/completions.js';

// Handle --completion flag for shell tab completion (hidden, fast path)
const completionIdx = process.argv.indexOf('--completion');
if (completionIdx !== -1) {
  const args = process.argv.slice(completionIdx + 1);
  const completions = getCompletions(args);
  if (completions.length > 0) {
    process.stdout.write(completions.join('\n'));
  }
  process.exit(0);
}

const program = createProgram();

// First-run wizard (only triggers if no config exists)
const ranSetup = await checkFirstRun(program);
if (!ranSetup) {
  await program.parseAsync(process.argv);
}
