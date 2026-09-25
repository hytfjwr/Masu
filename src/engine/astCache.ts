import { parse } from './parser';
import type { ASTNode } from './types';

/**
 * Cache of parsed formula ASTs, keyed by the raw formula string (without the leading '=').
 * Avoids re-parsing the same formula on every recalculation pass.
 * Parse errors are never cached — they propagate directly to the caller.
 */
const cache = new Map<string, ASTNode>();

/** Entries kept before the whole cache is dropped and refilled (exported for tooling). */
export const MAX_CACHE_SIZE = 25000;

/** Parse a formula, using a cached AST when available. */
export function parseCached(formula: string): ASTNode {
  const cached = cache.get(formula);
  if (cached) return cached;

  const ast = parse(formula); // Throws on parse errors; not cached.

  if (cache.size >= MAX_CACHE_SIZE) {
    cache.clear();
  }
  cache.set(formula, ast);
  return ast;
}

/** Snapshot of the cache for developer tooling (AST visualizer), newest entries first. */
export function getCachedAsts(): Array<{ formula: string; ast: ASTNode }> {
  return Array.from(cache, ([formula, ast]) => ({ formula, ast })).reverse();
}

/** Whether a formula's AST is currently cached. */
export function isAstCached(formula: string): boolean {
  return cache.has(formula);
}
