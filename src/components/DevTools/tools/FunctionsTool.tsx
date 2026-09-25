import { memo, useMemo, useState } from 'react';
import { parseCached } from '../../../engine/astCache';
import { NON_MEMOIZABLE } from '../../../engine/evaluator';
import type { ASTNode, FunctionMeta } from '../../../engine/types';
import { getCategorizedFunctions } from '../../../pivot/functionCategories';
import type { DevToolsHost } from '../types';

type Flag = 'volatile' | 'special' | 'lift' | 'memo' | 'used';

const FLAG_INFO: Record<Exclude<Flag, 'used'>, { label: string; hint: string }> = {
  volatile: { label: 'volatile', hint: '値の変化がなくても毎回再計算される（TODAY, RAND, OFFSET など）' },
  special: { label: 'special', hint: '引数を遅延評価する特別な形（IF, LET, LAMBDA など）' },
  lift: { label: 'lift', hint: 'スカラー引数に配列を渡すと要素ごとに自動展開される' },
  memo: { label: 'memo', hint: '同じ引数の呼び出しを再計算パス内でキャッシュする' },
};

function flagsOf(fn: FunctionMeta): Array<Exclude<Flag, 'used'>> {
  const flags: Array<Exclude<Flag, 'used'>> = [];
  if (fn.volatile) flags.push('volatile');
  if (fn.special) flags.push('special');
  if (fn.lift) flags.push('lift');
  if (!fn.volatile && !fn.special && !NON_MEMOIZABLE.has(fn.name)) flags.push('memo');
  return flags;
}

/** How often each function is called by the workbook's formulas (all sheets). */
function countUsage(host: DevToolsHost): Map<string, number> {
  const counts = new Map<string, number>();
  const walk = (node: ASTNode) => {
    switch (node.kind) {
      case 'FunctionCall':
        counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
        node.args.forEach(walk);
        break;
      case 'BinaryOp':
        walk(node.left);
        walk(node.right);
        break;
      case 'UnaryOp':
        walk(node.operand);
        break;
      case 'ArrayLiteral':
        node.rows.forEach((r) => r.forEach(walk));
        break;
      default:
        break;
    }
  };
  for (const sheet of host.sheets) {
    for (const cell of sheet.cells.values()) {
      if (cell.formula === undefined) continue;
      try {
        walk(parseCached(cell.formula));
      } catch {
        // syntax errors call nothing
      }
    }
  }
  return counts;
}

/**
 * Developer tools "関数" tab: every registered function with its category, signature, evaluation
 * flags (volatile / special / lift / memoized) and how often the workbook calls it.
 */
export const FunctionsTool = memo(function FunctionsTool({ host }: { host: DevToolsHost }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [flag, setFlag] = useState<Flag | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const categories = getCategorizedFunctions();
  const usage = useMemo(
    () => countUsage(host),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host.version, host.sheets],
  );
  const all = useMemo(() => {
    const seen = new Map<string, { fn: FunctionMeta; category: string }>();
    for (const c of categories) for (const fn of c.functions) if (!seen.has(fn.name)) seen.set(fn.name, { fn, category: c.label });
    return Array.from(seen.values()).sort((a, b) => a.fn.name.localeCompare(b.fn.name));
  }, [categories]);

  const q = query.trim().toUpperCase();
  const rows = all.filter(({ fn, category: cat }) => {
    if (category && cat !== category) return false;
    if (flag === 'used' && !usage.get(fn.name)) return false;
    if (flag && flag !== 'used' && !flagsOf(fn).includes(flag)) return false;
    return !q || fn.name.includes(q) || fn.description.toUpperCase().includes(q);
  });

  const stat = (f: Exclude<Flag, 'used'>) => all.filter(({ fn }) => flagsOf(fn).includes(f)).length;

  return (
    <div className="devtools-tool functions-tool">
      <div className="devtools-toolbar">
        <input
          type="search"
          className="ast-viz-search devtools-grow"
          placeholder="関数名・説明で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="devtools-muted">{rows.length} / {all.length}</span>
      </div>
      <div className="devtools-chips">
        <button type="button" className="devtools-chip" aria-pressed={category === null} onClick={() => setCategory(null)}>すべて</button>
        {categories.map((c) => (
          <button key={c.id} type="button" className="devtools-chip" aria-pressed={category === c.label} onClick={() => setCategory(category === c.label ? null : c.label)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="devtools-chips">
        {(['used', 'volatile', 'special', 'lift', 'memo'] as Flag[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`devtools-chip fn-flag-${f}`}
            aria-pressed={flag === f}
            title={f === 'used' ? 'このブックの数式で使われている関数' : FLAG_INFO[f].hint}
            onClick={() => setFlag(flag === f ? null : f)}
          >
            {f === 'used' ? `使用中 ${usage.size}` : `${FLAG_INFO[f].label} ${stat(f)}`}
          </button>
        ))}
      </div>
      <ul className="fn-list">
        {rows.map(({ fn, category: cat }) => {
          const n = usage.get(fn.name) ?? 0;
          const expanded = open === fn.name;
          return (
            <li key={fn.name}>
              <button type="button" className="fn-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : fn.name)}>
                <code className="fn-name">{fn.name}</code>
                <span className="fn-cat">{cat}</span>
                <span className="fn-flags">
                  {flagsOf(fn).map((f) => <i key={f} className={`fn-flag fn-flag-${f}`}>{FLAG_INFO[f].label}</i>)}
                </span>
                {n > 0 && <span className="fn-usage" title="このブックでの呼び出し回数">×{n}</span>}
              </button>
              {expanded && (
                <div className="fn-detail">
                  <code>{fn.signature}</code>
                  <p>{fn.description}</p>
                  <ul>
                    {flagsOf(fn).map((f) => <li key={f}><i className={`fn-flag fn-flag-${f}`}>{FLAG_INFO[f].label}</i>{FLAG_INFO[f].hint}</li>)}
                    {fn.liftExclude && fn.liftExclude.length > 0 && (
                      <li><i className="fn-flag">liftExclude</i>引数 {fn.liftExclude.map((i) => i + 1).join(', ')} は範囲のまま渡される</li>
                    )}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
});
