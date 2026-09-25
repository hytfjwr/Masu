/**
 * Parse function signatures from FunctionMeta.signature strings.
 * Pure utility, no React dependencies.
 */

export interface ParsedArg {
  /** Argument name (e.g. "number1", "lookup_value") */
  name: string;
  /** Whether the argument is required (not wrapped in brackets) */
  required: boolean;
  /** Whether this represents a variadic argument (contains "...") */
  variadic: boolean;
}

export interface ParsedSignature {
  /** Function name (e.g. "SUM") */
  funcName: string;
  /** Parsed arguments */
  args: ParsedArg[];
}

/**
 * Parse a function signature string like "SUM(number1, [number2], ...)"
 * into structured data.
 */
export function parseSignature(signature: string): ParsedSignature {
  // Match FUNC_NAME(...args...)
  const match = signature.match(/^(\w+)\((.*)\)$/);
  if (!match) {
    return { funcName: signature.trim(), args: [] };
  }

  const funcName = match[1];
  const argsStr = match[2].trim();

  if (argsStr === '') {
    return { funcName, args: [] };
  }

  const rawArgs = splitArgs(argsStr);
  const args: ParsedArg[] = [];

  for (const raw of rawArgs) {
    const trimmed = raw.trim();
    if (trimmed === '...') {
      // Standalone variadic — mark the previous arg as variadic if exists
      if (args.length > 0) {
        args[args.length - 1].variadic = true;
      }
      continue;
    }

    const isOptional = trimmed.startsWith('[') && trimmed.endsWith(']');
    let name = isOptional ? trimmed.slice(1, -1).trim() : trimmed;

    // Check for trailing "..."
    let variadic = false;
    if (name.endsWith('...')) {
      variadic = true;
      name = name.slice(0, -3).trim();
      // Remove trailing comma if present
      if (name.endsWith(',')) {
        name = name.slice(0, -1).trim();
      }
    }

    if (name) {
      args.push({
        name,
        required: !isOptional,
        variadic,
      });
    }
  }

  return { funcName, args };
}

/**
 * Split arguments string respecting brackets.
 * "number1, [number2], ..." -> ["number1", "[number2]", "..."]
 */
function splitArgs(argsStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let bracketDepth = 0;

  for (const ch of argsStr) {
    if (ch === '[') {
      bracketDepth++;
      current += ch;
    } else if (ch === ']') {
      bracketDepth--;
      current += ch;
    } else if (ch === ',' && bracketDepth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}
