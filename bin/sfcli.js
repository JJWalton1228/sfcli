#!/usr/bin/env node

import { createProgram } from '../src/index.js';
import { checkFirstRun } from '../src/commands/setup.js';

const program = createProgram();

// First-run wizard (only triggers if no config exists)
const ranSetup = await checkFirstRun(program);
if (!ranSetup) {
  await program.parseAsync(process.argv);
}
