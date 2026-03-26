/**
 * Command tree for tab completion.
 * Maps command names to their subcommands.
 */
const COMMAND_TREE = {
  customers: ['list', 'search', 'get', 'create', 'update'],
  jobs: ['list', 'get', 'create', 'update', 'today', 'this-week', 'status', 'dispatch', 'assign'],
  estimates: ['list', 'get', 'search', 'create'],
  invoices: ['list', 'get'],
  techs: ['list', 'get'],
  equipment: ['list', 'get', 'search'],
  auth: ['login', 'logout', 'whoami', 'profiles', 'add-profile', 'switch'],
  cache: ['refresh', 'status', 'clear'],
  sync: ['fm-test', 'pull', 'push', 'run', 'status', 'log', 'conflicts', 'resolve', 'mapping', 'schedule'],
  config: ['set', 'get', 'list'],
  report: ['jobs-summary', 'revenue', 'revenue-by-customer', 'revenue-by-technician', 'tech-performance', 'tech-utilization', 'customer-aging', 'customer-activity', 'new-customers', 'equipment-inventory', 'equipment-by-customer'],
  interactive: [],
  shell: [],
  discover: [],
};

const NESTED_COMMANDS = {
  'sync.schedule': ['enable', 'disable', 'status'],
  'sync.mapping': ['show', 'validate', 'init'],
};

const GLOBAL_FLAGS = [
  '--profile', '--output', '--no-color', '--verbose', '--dry-run', '--no-cache', '--sort', '--help', '--version',
];

const ENTITY_NAMES = ['customers', 'jobs', 'estimates', 'invoices', 'techs', 'equipment'];

/**
 * Get completions for a given set of args.
 * @param {string[]} args - Current command-line arguments (excluding 'sfcli')
 * @returns {string[]} Possible completions
 */
export function getCompletions(args) {
  if (args.length === 0) {
    return Object.keys(COMMAND_TREE);
  }

  const current = args[args.length - 1];

  // Global flags
  if (current.startsWith('--')) {
    return GLOBAL_FLAGS.filter(f => f.startsWith(current));
  }

  // Single arg — filter top-level commands or get subcommands
  if (args.length === 1) {
    const topLevel = Object.keys(COMMAND_TREE);
    const matches = topLevel.filter(c => c.startsWith(current));
    if (matches.length > 0 && !topLevel.includes(current)) {
      return matches;
    }
    // Exact match — return subcommands
    if (COMMAND_TREE[current]) {
      return COMMAND_TREE[current];
    }
    return [];
  }

  // Two+ args — check for nested commands
  const parent = args[0];
  const sub = args[1];
  const nestedKey = `${parent}.${sub}`;

  if (args.length === 2 && COMMAND_TREE[parent]) {
    const subs = COMMAND_TREE[parent];
    const matches = subs.filter(s => s.startsWith(sub));
    if (matches.length > 0 && !subs.includes(sub)) {
      return matches;
    }
    if (NESTED_COMMANDS[nestedKey]) {
      return NESTED_COMMANDS[nestedKey];
    }
    return [];
  }

  if (args.length === 3 && NESTED_COMMANDS[nestedKey]) {
    const nested = NESTED_COMMANDS[nestedKey];
    return nested.filter(n => n.startsWith(args[2]));
  }

  return [];
}

/**
 * Generate bash completion script.
 */
export function generateBashCompletionScript() {
  return `# sfcli bash completion
# Add to ~/.bashrc or ~/.bash_profile:
#   eval "$(sfcli completion bash)"

_sfcli_completions() {
  local cur prev words cword
  _init_completion || return

  local args=("\${COMP_WORDS[@]:1}")
  local completions
  completions=$(sfcli --completion "\${args[@]}" 2>/dev/null)

  COMPREPLY=($(compgen -W "$completions" -- "$cur"))
}

complete -F _sfcli_completions sfcli
`;
}

/**
 * Generate zsh completion script.
 */
export function generateZshCompletionScript() {
  return `# sfcli zsh completion
# Add to ~/.zshrc:
#   eval "$(sfcli completion zsh)"

_sfcli() {
  local -a args
  args=("\${words[@]:1}")
  local completions
  completions=$(sfcli --completion "\${args[@]}" 2>/dev/null)

  local -a comp_array
  comp_array=(\${(f)completions})
  compadd -a comp_array
}

compdef _sfcli sfcli
`;
}
