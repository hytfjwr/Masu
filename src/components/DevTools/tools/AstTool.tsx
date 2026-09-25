import { memo, useMemo, useState } from 'react';
import { getCachedAsts, isAstCached, MAX_CACHE_SIZE, parseCached } from '../../../engine/astCache';
import { parseWithTokens, type SpannedToken } from '../../../engine/parser';
import { FormulaSyntaxError } from '../../../engine/syntaxError';
import type { TokenSpan } from '../../../engine/tokenizer';
import type { ASTNode } from '../../../engine/types';
import { buildVizTree, layoutTree, NODE_HEIGHT, type VizCategory, type VizNode } from './astLayout';

interface AstToolProps {
  /** Formula to show when nothing is pinned from the cache (text without '='). */
  formula?: string;
  /** Where `formula` comes from, e.g. "B3" or "B3（編集中）". */
  formulaLabel: string;
  /** `formula` is being typed right now: parse it without touching the AST cache. */
  live: boolean;
  /** Bumps on every workbook change (refreshes the cache listing). */
  version: number;
  onSelectRange: (ref: NonNullable<VizNode['ref']>) => void;
}

type Tab = 'tree' | 'tokens' | 'cache';

const CATEGORY_LABELS: Array<[VizCategory, string]> = [
  ['function', '関数'],
  ['operator', '演算子'],
  ['reference', '参照'],
  ['literal', 'リテラル'],
  ['array', '配列'],
  ['named', '名前'],
  ['error', 'エラー値'],
];

type Analysis =
  | { ok: true; ast: ASTNode; tokens: SpannedToken[]; cached: boolean }
  | { ok: false; error: FormulaSyntaxError | Error };

function analyze(formula: string, live: boolean): Analysis {
  try {
    const cached = isAstCached(formula);
    const { ast: fresh, tokens } = parseWithTokens(formula);
    // Show the very object the engine evaluates when it's cached (never cache half-typed formulas)
    const ast = live ? fresh : parseCached(formula);
    return { ok: true, ast, tokens, cached };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** The formula with one range highlighted (hovered node/token, or the syntax error). */
function SourceLine({
  formula,
  highlight,
  error,
}: {
  formula: string;
  highlight: TokenSpan | null;
  error?: FormulaSyntaxError;
}) {
  const span = error ? { start: error.start, end: error.end } : highlight;
  if (!span) return <code className="ast-viz-code">={formula}</code>;
  const before = formula.slice(0, span.start);
  const mid = formula.slice(span.start, span.end);
  const after = formula.slice(span.end);
  return (
    <code className="ast-viz-code">
      ={before}
      {mid ? (
        <mark className={error ? 'ast-viz-mark-error' : 'ast-viz-mark'}>{mid}</mark>
      ) : (
        <span className={error ? 'ast-viz-caret-error' : 'ast-viz-caret'} />
      )}
      {after}
    </code>
  );
}

/**
 * Developer tools "AST" tab: draws the parsed AST of the selected cell's formula (live while
 * editing), its token stream, and the engine's AST cache. Hovering a node or token highlights its
 * source range; clicking a reference node selects it in the sheet.
 */
export const AstTool = memo(function AstTool({
  formula: cellFormula,
  formulaLabel,
  live,
  version,
  onSelectRange,
}: AstToolProps) {
  const [tab, setTab] = useState<Tab>('tree');
  const [pinned, setPinned] = useState<string | null>(null);
  const [hoverSpan, setHoverSpan] = useState<TokenSpan | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const formula = pinned ?? cellFormula;
  const analysis = useMemo(
    () => (formula ? analyze(formula, live && pinned === null) : null),
    [formula, live, pinned],
  );
  const layout = useMemo(
    () => (analysis?.ok && formula ? layoutTree(buildVizTree(analysis.ast, formula)) : null),
    [analysis, formula],
  );
  // Re-read the cache whenever the workbook changes or the cache tab is shown
  const cacheEntries = useMemo(
    () => getCachedAsts(),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [version, tab, analysis],
  );
  const filteredCache = useMemo(() => {
    const q = query.trim().toUpperCase();
    return (
      q ? cacheEntries.filter((e) => e.formula.toUpperCase().includes(q)) : cacheEntries
    ).slice(0, 300);
  }, [cacheEntries, query]);

  // Hovered node + its ancestors (highlighted path to the root)
  const activePath = useMemo(() => {
    const path = new Set<string>();
    if (!layout || !hoverId) return path;
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (let n = byId.get(hoverId); n; n = n.parentId ? byId.get(n.parentId) : undefined)
      path.add(n.id);
    return path;
  }, [layout, hoverId]);

  const syntaxError =
    analysis && !analysis.ok && analysis.error instanceof FormulaSyntaxError
      ? analysis.error
      : undefined;
  const tokenCount = analysis?.ok ? analysis.tokens.length - 1 : 0;

  const clearHover = () => {
    setHoverSpan(null);
    setHoverId(null);
  };

  return (
    <div className="devtools-tool ast-tool">
      <div className="ast-viz-source">
        <span className={`ast-viz-origin${pinned ? ' ast-viz-origin-cache' : ''}`}>
          {pinned ? 'キャッシュ' : formulaLabel}
        </span>
        {formula ? (
          <SourceLine formula={formula} highlight={hoverSpan} error={syntaxError} />
        ) : (
          <span className="ast-viz-hint">数式のセルを選ぶか、キャッシュから選んでください</span>
        )}
        {analysis?.ok && !live && (
          <span className={`ast-viz-pill${analysis.cached ? ' ast-viz-pill-hit' : ''}`}>
            {analysis.cached ? 'キャッシュ済み' : '新規'}
          </span>
        )}
        {pinned && (
          <button type="button" className="ast-viz-link" onClick={() => setPinned(null)}>
            選択中のセルに戻る
          </button>
        )}
        <span className="ast-viz-meta" title="エンジンの AST キャッシュ">
          {cacheEntries.length.toLocaleString()} / {MAX_CACHE_SIZE.toLocaleString()}
        </span>
      </div>

      {analysis && !analysis.ok && (
        <div className="ast-viz-error" role="status">
          <span>⚠ {analysis.error.message}</span>
          {syntaxError && formula && (
            <span className="ast-viz-error-where">
              {syntaxError.start === syntaxError.end && syntaxError.end === formula.length
                ? '末尾'
                : `${syntaxError.start + 2}文字目`}
            </span>
          )}
        </div>
      )}

      <nav className="ast-viz-tabs" role="tablist">
        {(
          [
            ['tree', '木構造'],
            ['tokens', `トークン ${tokenCount || ''}`],
            ['cache', 'キャッシュ'],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="ast-viz-tab"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="ast-viz-body">
        {tab === 'tree' &&
          (layout ? (
            <div className="ast-viz-canvas" onMouseLeave={clearHover}>
              <svg key={formula} className="ast-tree" width={layout.width} height={layout.height}>
                {layout.edges.map(({ from, to }) => {
                  const y1 = from.y + NODE_HEIGHT;
                  const y2 = to.y;
                  const my = (y1 + y2) / 2;
                  return (
                    <path
                      key={to.id}
                      className="ast-edge"
                      data-active={activePath.has(to.id) || undefined}
                      d={`M ${from.x} ${y1} C ${from.x} ${my}, ${to.x} ${my}, ${to.x} ${y2}`}
                      pathLength={1}
                      style={{ ['--d' as string]: to.depth }}
                    />
                  );
                })}
                {layout.nodes.map((n) => (
                  <g
                    key={n.id}
                    transform={`translate(${n.x - n.width / 2} ${n.y})`}
                    className={`ast-node ast-node-${n.category}`}
                    data-active={activePath.has(n.id) || undefined}
                    data-hovered={hoverId === n.id || undefined}
                    data-clickable={n.ref ? true : undefined}
                    onMouseEnter={() => {
                      setHoverId(n.id);
                      setHoverSpan(n.span ?? null);
                    }}
                    onClick={() => n.ref && onSelectRange(n.ref)}
                  >
                    <g className="ast-node-pop" style={{ ['--d' as string]: n.depth }}>
                      <rect width={n.width} height={NODE_HEIGHT} rx={10} />
                      <text x={n.width / 2} y={15} className="ast-node-label">
                        {n.label}
                      </text>
                      <text x={n.width / 2} y={28} className="ast-node-kind">
                        {n.kind}
                      </text>
                    </g>
                    <title>{n.ref ? `${n.kind} — クリックでセルを選択` : n.kind}</title>
                  </g>
                ))}
              </svg>
            </div>
          ) : (
            <div className="ast-viz-empty">
              {formula ? '構文エラーのため木を作れません' : 'ここに AST が表示されます'}
            </div>
          ))}

        {tab === 'tokens' &&
          (analysis?.ok ? (
            <div className="ast-viz-tokens" onMouseLeave={clearHover}>
              {analysis.tokens.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  className="ast-token"
                  data-eof={t.type === 'EOF' || undefined}
                  style={{ ['--i' as string]: i }}
                  onMouseEnter={() => setHoverSpan({ start: t.start, end: t.end })}
                >
                  <span className="ast-token-type">{t.type}</span>
                  <code className="ast-token-text">
                    {t.type === 'EOF' ? '⏎' : formula!.slice(t.start, t.end)}
                  </code>
                  <span className="ast-token-pos">
                    {t.start}–{t.end}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ast-viz-empty">
              {formula ? '字句解析の段階で止まりました' : 'ここにトークン列が表示されます'}
            </div>
          ))}

        {tab === 'cache' && (
          <div className="ast-viz-cache">
            <input
              type="search"
              className="ast-viz-search"
              placeholder="数式で絞り込み"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {filteredCache.length === 0 ? (
              <div className="ast-viz-empty">キャッシュは空です</div>
            ) : (
              <ul className="ast-viz-cache-list">
                {filteredCache.map((entry) => (
                  <li key={entry.formula}>
                    <button
                      type="button"
                      className="ast-viz-cache-row"
                      data-current={entry.formula === formula || undefined}
                      onClick={() => {
                        setPinned(entry.formula);
                        setTab('tree');
                        clearHover();
                      }}
                    >
                      <code>={entry.formula}</code>
                      <span>{entry.ast.kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <footer className="ast-viz-legend">
        {CATEGORY_LABELS.map(([cat, label]) => (
          <span key={cat} className={`ast-legend ast-node-${cat}`}>
            <i />
            {label}
          </span>
        ))}
      </footer>
    </div>
  );
});
