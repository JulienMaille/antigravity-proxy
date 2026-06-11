/**
 * Tool Capability Registry
 *
 * Tracks tool schemas and provides validation/normalization for tool calls.
 * Supports both well-known Antigravity tools and dynamic per-request tools.
 *
 * Well-known tools (like `manage_task`, `run_command`, etc.) are registered
 * by default at module load time. Per-request tools (from mapped.tools) are
 * merged in at request time.
 */

import { logger } from './logger.js';
import type { CoreTool } from './mapper.js';

// ─── Types ─────────────────────────────────────────────────────────────

export interface ToolParamDef {
  type: 'string' | 'number' | 'boolean' | 'integer' | 'object' | 'array';
  required: boolean;
  description?: string;
  default?: unknown;
  /** Known aliases — alternative names the model might use */
  aliases?: string[];
}

export interface ToolSchema {
  description?: string;
  /** Canonical tool name */
  name: string;
  /** Known aliases the model might call this tool by */
  aliases?: string[];
  params: Record<string, ToolParamDef>;
}

/** Result of normalizing a tool call */
export interface NormalizedToolCall {
  name: string;
  args: Record<string, unknown>;
  /** Messages to include in the error/system feedback */
  warnings?: string[];
  fixed?: boolean;
}

// ─── Known tool definitions ────────────────────────────────────────────

/** Antigravity's well-known tools, registered at startup */
const WELL_KNOWN_TOOLS: ToolSchema[] = [
  {
    name: 'manage_task',
    aliases: ['manageTask', 'manage-tasks', 'task_manage'],
    description: 'Manage background processes (list/kill/status/send_input)',
    params: {
      Action: {
        type: 'string',
        required: true,
        description: 'Action to perform: list, kill, kill_all, status, send_input',
        default: 'list',
        aliases: ['action', 'cmd', 'command'],
      },
      TaskId: {
        type: 'string',
        required: false,
        description: 'Task ID (required for kill, status, send_input)',
        aliases: ['task_id', 'taskid', 'id', 'task'],
      },
      Input: {
        type: 'string',
        required: false,
        description: 'Stdin input for send_input action',
      },
    },
  },
  {
    name: 'run_command',
    aliases: ['runCommand', 'run-command', 'exec', 'execute'],
    description: 'Run a shell command (PowerShell on Windows)',
    params: {
      CommandLine: {
        type: 'string',
        required: true,
        description: 'Full command with proper quoting',
        aliases: ['command', 'cmd', 'command_line', 'commandline'],
      },
      Cwd: {
        type: 'string',
        required: false,
        description: 'Working directory (absolute path)',
        aliases: ['cwd', 'working_dir', 'directory', 'path'],
      },
      WaitMsBeforeAsync: {
        type: 'number',
        required: false,
        description: '0 = wait, small number = background task',
        default: 0,
        aliases: ['wait_ms', 'waitms', 'timeout', 'async_after'],
      },
    },
  },
  {
    name: 'write_to_file',
    aliases: ['writeToFile', 'write-file', 'create_file', 'createFile', 'save_file'],
    description: 'Create or overwrite a file',
    params: {
      TargetFile: {
        type: 'string',
        required: true,
        description: 'Absolute path to the target file',
        aliases: ['file_path', 'filepath', 'path', 'file', 'target'],
      },
      CodeContent: {
        type: 'string',
        required: true,
        description: 'Full file content',
        aliases: ['content', 'code', 'text', 'data', 'body'],
      },
      Overwrite: {
        type: 'boolean',
        required: true,
        description: 'Must be true for existing files, false for new files',
        aliases: ['overwrite', 'force', 'replace'],
      },
      Description: {
        type: 'string',
        required: false,
        description: 'Optional description of the file',
        aliases: ['desc', 'summary'],
      },
    },
  },
  {
    name: 'replace_file_content',
    aliases: ['replaceFileContent', 'replace-file-content', 'edit_file', 'editFile'],
    description: 'Targeted edit of a file section with verification',
    params: {
      TargetFile: {
        type: 'string',
        required: true,
        aliases: ['file_path', 'filepath', 'path', 'file', 'target'],
      },
      StartLine: {
        type: 'number',
        required: true,
        description: '1-indexed start line',
        aliases: ['start', 'start_line', 'from'],
      },
      EndLine: {
        type: 'number',
        required: true,
        description: '1-indexed end line (inclusive)',
        aliases: ['end', 'end_line', 'to'],
      },
      ReplacementContent: {
        type: 'string',
        required: true,
        description: 'New content for the replaced lines',
        aliases: ['content', 'new_content', 'replacement', 'code'],
      },
      TargetContent: {
        type: 'string',
        required: true,
        description: 'Exact current content (for verification)',
        aliases: ['old_content', 'existing', 'current'],
      },
      Instruction: {
        type: 'string',
        required: true,
        description: 'Brief description of the edit',
        aliases: ['desc', 'description', 'summary'],
      },
    },
  },
  {
    name: 'list_dir',
    aliases: ['listDir', 'list-dir', 'ls', 'dir'],
    description: 'List files in a directory',
    params: {
      AbsolutePath: {
        type: 'string',
        required: false,
        description: 'Directory path to list',
        aliases: ['path', 'dir', 'directory', 'Dir', 'DirectoryPath'],
      },
    },
  },
  {
    name: 'view_file',
    aliases: ['viewFile', 'view-file', 'read_file', 'readFile', 'cat', 'show'],
    description: 'View file contents',
    params: {
      AbsolutePath: {
        type: 'string',
        required: false,
        description: 'Absolute path to the file',
        aliases: ['path', 'file', 'file_path', 'filepath', 'target'],
      },
    },
  },
  {
    name: 'grep_search',
    aliases: ['grepSearch', 'grep-search', 'search', 'find'],
    description: 'Search file contents for a pattern',
    params: {
      SearchPath: {
        type: 'string',
        required: false,
        description: 'Directory or file to search in',
        aliases: ['path', 'dir', 'root', 'search_path'],
      },
      Query: {
        type: 'string',
        required: false,
        description: 'Pattern to search for',
        aliases: ['pattern', 'q', 'regex', 'search'],
      },
      Includes: {
        type: 'array',
        required: false,
        description: 'Glob patterns to include (e.g. ["*.ts"])',
        aliases: ['glob', 'include', 'filter'],
      },
    },
  },
];

// ─── Registry ──────────────────────────────────────────────────────────

export class ToolCapabilityRegistry {
  /** Static well-known tools keyed by canonical name */
  private wellKnown = new Map<string, ToolSchema>();

  /** Aliases → canonical name */
  private aliasMap = new Map<string, string>();

  /** Per-request dynamic tools (merged on each request) */
  private dynamicTools = new Map<string, ToolSchema>();

  constructor() {
    this.registerWellKnown();
  }

  private registerWellKnown(): void {
    for (const tool of WELL_KNOWN_TOOLS) {
      this.wellKnown.set(tool.name, tool);
      this.aliasMap.set(tool.name, tool.name);
      for (const alias of tool.aliases || []) {
        const lower = alias.toLowerCase();
        if (!this.aliasMap.has(lower)) {
          this.aliasMap.set(lower, tool.name);
        }
      }
    }
  }

  /**
   * Resolve a tool name to its canonical name.
   * Handles aliases and common naming variations.
   */
  resolveName(name: string): string {
    const lower = name.toLowerCase().trim();
    // Direct match
    if (this.aliasMap.has(lower)) return this.aliasMap.get(lower)!;
    if (this.wellKnown.has(name)) return name;
    if (this.dynamicTools.has(name)) return name;

    // Fuzzy match: check if any alias contains or is contained in the name
    for (const [alias, canonical] of this.aliasMap) {
      if (lower.includes(alias) || alias.includes(lower)) {
        return canonical;
      }
    }
    for (const [dynName] of this.dynamicTools) {
      const dl = dynName.toLowerCase();
      if (lower.includes(dl) || dl.includes(lower)) {
        return dynName;
      }
    }

    return name; // Unknown — pass through
  }

  /**
   * Get the schema for a tool by its canonical name.
   */
  getSchema(name: string): ToolSchema | undefined {
    return this.wellKnown.get(name) || this.dynamicTools.get(name);
  }

  /**
   * Merge per-request tools into the registry.
   * These complement but do not override well-known tools.
   */
  setDynamicTools(tools: Record<string, CoreTool> | null | undefined): void {
    this.dynamicTools.clear();
    if (!tools) return;
    for (const [name, def] of Object.entries(tools)) {
      const schema = this.coreToolToSchema(name, def);
      this.dynamicTools.set(name, schema);
    }
  }

  /**
   * Convert a CoreTool (from mapper) to a ToolSchema.
   */
  private coreToolToSchema(name: string, tool: CoreTool): ToolSchema {
    const schema: ToolSchema = { name, params: {} };
    if (tool.description) schema.description = tool.description;

    const params = tool.parameters as Record<string, any> | undefined;
    if (params?.properties) {
      const requiredSet = new Set<string>(
        Array.isArray(params.required) ? params.required : [],
      );
      for (const [key, prop] of Object.entries(params.properties)) {
        const propObj = prop as Record<string, any>;
        schema.params[key] = {
          type: propObj.type || 'string',
          required: requiredSet.has(key),
          description: propObj.description,
          default: propObj.default,
        };
      }
    }
    return schema;
  }

  /**
   * Check if a tool is known.
   */
  hasTool(name: string): boolean {
    const canonical = this.resolveName(name);
    return this.wellKnown.has(canonical) || this.dynamicTools.has(canonical);
  }
}

/** Singleton registry instance */
export const toolCapabilityRegistry = new ToolCapabilityRegistry();
