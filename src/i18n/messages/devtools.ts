import type { MessageTable } from '../types';

/** DevTools panel and its tools. */
export const devtools = {
  // Panel chrome (DevTools.tsx)
  'devtools.panel.title': { en: 'Developer tools', ja: '開発者ツール' },
  'devtools.panel.tools': { en: 'Tools', ja: 'ツール' },
  'devtools.panel.tab.ast': { en: 'AST', ja: 'AST' },
  'devtools.panel.tab.deps': { en: 'Dependency graph', ja: '依存グラフ' },
  'devtools.panel.tab.profiler': { en: 'Profiler', ja: 'プロファイラ' },
  'devtools.panel.tab.functions': { en: 'Functions', ja: '関数' },
  'devtools.panel.tab.inspector': { en: 'Cell', ja: 'セル' },
  'devtools.panel.tab.history': { en: 'History', ja: '履歴' },
  'devtools.panel.tab.render': { en: 'Rendering', ja: '描画' },
  'devtools.panel.tab.storage': { en: 'Storage', ja: 'ストレージ' },
  'devtools.panel.cellEditingLabel': { en: '{cell} (editing)', ja: '{cell}（編集中）' },

  // AST tool (AstTool.tsx, astLayout.ts)
  'devtools.astTool.category.function': { en: 'Function', ja: '関数' },
  'devtools.astTool.category.operator': { en: 'Operator', ja: '演算子' },
  'devtools.astTool.category.reference': { en: 'Reference', ja: '参照' },
  'devtools.astTool.category.literal': { en: 'Literal', ja: 'リテラル' },
  'devtools.astTool.category.array': { en: 'Array', ja: '配列' },
  'devtools.astTool.category.named': { en: 'Name', ja: '名前' },
  'devtools.astTool.category.error': { en: 'Error value', ja: 'エラー値' },
  'devtools.astTool.originCache': { en: 'Cache', ja: 'キャッシュ' },
  'devtools.astTool.hint': {
    en: 'Select a cell with a formula, or pick one from the cache',
    ja: '数式のセルを選ぶか、キャッシュから選んでください',
  },
  'devtools.astTool.cached': { en: 'Cached', ja: 'キャッシュ済み' },
  'devtools.astTool.new': { en: 'New', ja: '新規' },
  'devtools.astTool.backToSelectedCell': {
    en: 'Back to the selected cell',
    ja: '選択中のセルに戻る',
  },
  'devtools.astTool.cacheTitle': { en: "The engine's AST cache", ja: 'エンジンの AST キャッシュ' },
  'devtools.astTool.errorAtEnd': { en: 'at the end', ja: '末尾' },
  'devtools.astTool.errorAtPosition': { en: 'at character {position}', ja: '{position}文字目' },
  'devtools.astTool.tab.tree': { en: 'Tree', ja: '木構造' },
  'devtools.astTool.tab.tokens': { en: 'Tokens', ja: 'トークン' },
  'devtools.astTool.tab.cache': { en: 'Cache', ja: 'キャッシュ' },
  'devtools.astTool.treeErrorEmpty': {
    en: "Can't build a tree: syntax error",
    ja: '構文エラーのため木を作れません',
  },
  'devtools.astTool.treeEmpty': { en: 'The AST will appear here', ja: 'ここに AST が表示されます' },
  'devtools.astTool.tokensErrorEmpty': {
    en: 'Stopped while tokenizing',
    ja: '字句解析の段階で止まりました',
  },
  'devtools.astTool.tokensEmpty': {
    en: 'The token stream will appear here',
    ja: 'ここにトークン列が表示されます',
  },
  'devtools.astTool.cacheSearchPlaceholder': { en: 'Filter by formula', ja: '数式で絞り込み' },
  'devtools.astTool.cacheEmpty': { en: 'The cache is empty', ja: 'キャッシュは空です' },
  'devtools.astTool.nodeTitleRef': {
    en: '{kind} — Click to select the cell',
    ja: '{kind} — クリックでセルを選択',
  },
  'devtools.astTool.emptyArg': { en: '(omitted)', ja: '（省略）' },
  'devtools.astTool.arrayRow': { en: 'Row {row}', ja: '行 {row}' },

  // Dependency graph tool (DependencyTool.tsx, dependencyGraph.ts)
  'devtools.dependencyTool.level.precedents2': { en: 'Precedents (2)', ja: '参照元 2' },
  'devtools.dependencyTool.level.precedents': { en: 'Precedents', ja: '参照元' },
  'devtools.dependencyTool.level.selected': { en: 'Selected', ja: '選択中' },
  'devtools.dependencyTool.level.dependents': { en: 'Dependents', ja: '参照先' },
  'devtools.dependencyTool.level.dependents2': { en: 'Dependents (2)', ja: '参照先 2' },
  'devtools.dependencyTool.summary': {
    en: '{precedents} precedents · {dependents} dependents · Click a node to jump to that cell',
    ja: '参照元 {precedents} ・ 参照先 {dependents}・ ノードをクリックでそのセルへ移動',
  },
  'devtools.dependencyTool.empty': {
    en: "This cell isn't connected to any other cells",
    ja: 'このセルはほかのセルとつながっていません',
  },
  'devtools.dependencyTool.detailEmpty': { en: '(empty)', ja: '（空）' },
  'devtools.dependencyTool.detailRange': { en: 'Range', ja: '範囲' },

  // Profiler tool (ProfilerTool.tsx)
  'devtools.profilerTool.recording': { en: 'Recording', ja: '記録中' },
  'devtools.profilerTool.startRecording': { en: 'Start recording', ja: '記録を開始' },
  'devtools.profilerTool.clear': { en: 'Clear', ja: 'クリア' },
  'devtools.profilerTool.heatmapOnGrid': { en: 'Heatmap on grid', ja: 'グリッドにヒートマップ' },
  'devtools.profilerTool.passCount': {
    en: { one: '{count} pass', other: '{count} passes' },
    ja: '{count} パス',
  },
  'devtools.profilerTool.emptyRecording': {
    en: 'Edit a cell and recalculations will be recorded here',
    ja: 'セルを編集すると、再計算がここに記録されます',
  },
  'devtools.profilerTool.emptyNotRecording': {
    en: 'Click "Start recording", then edit a cell to measure recalculations',
    ja: '「記録を開始」を押してからセルを編集すると、再計算を計測します',
  },
  'devtools.profilerTool.passesLabel': { en: 'Recalculation passes', ja: '再計算パス' },
  'devtools.profilerTool.kindAll': { en: 'Full', ja: '全体' },
  'devtools.profilerTool.kindIncremental': { en: 'Incremental', ja: '差分' },
  'devtools.profilerTool.passTitle': {
    en: '#{id} {kind} {duration} / {count} evaluations',
    ja: '#{id} {kind} {duration} / {count} 評価',
  },
  'devtools.profilerTool.duration': { en: 'Duration', ja: '所要時間' },
  'devtools.profilerTool.evaluatedFormulas': { en: 'Formulas evaluated', ja: '評価した数式' },
  'devtools.profilerTool.perFormula': { en: 'Per formula', ja: '1 数式あたり' },
  'devtools.profilerTool.functionCache': { en: 'Function cache', ja: '関数キャッシュ' },
  'devtools.profilerTool.rangeCache': { en: 'Range cache', ja: '範囲キャッシュ' },
  'devtools.profilerTool.hits': {
    en: { one: '{count} hit', other: '{count} hits' },
    ja: '{count} ヒット',
  },
  'devtools.profilerTool.kind': { en: 'Kind', ja: '種類' },
  'devtools.profilerTool.iterations': {
    en: { one: '{count} iteration', other: '{count} iterations' },
    ja: '{count} 反復',
  },
  'devtools.profilerTool.slowestFormulas': { en: 'Slowest formulas', ja: '遅い数式' },
  'devtools.profilerTool.evaluationOrder': {
    en: 'Evaluation order (topological)',
    ja: '評価順（トポロジカル順）',
  },
  'devtools.profilerTool.more': { en: '…{count} more', ja: '…ほか {count}' },

  // Functions tool (FunctionsTool.tsx)
  'devtools.functionsTool.hint.volatile': {
    en: 'Recalculated every time even if nothing changed (TODAY, RAND, OFFSET, etc.)',
    ja: '値の変化がなくても毎回再計算される（TODAY, RAND, OFFSET など）',
  },
  'devtools.functionsTool.hint.special': {
    en: 'Special form that evaluates its arguments lazily (IF, LET, LAMBDA, etc.)',
    ja: '引数を遅延評価する特別な形（IF, LET, LAMBDA など）',
  },
  'devtools.functionsTool.hint.lift': {
    en: 'Passing an array to a scalar argument broadcasts it element by element',
    ja: 'スカラー引数に配列を渡すと要素ごとに自動展開される',
  },
  'devtools.functionsTool.hint.memo': {
    en: 'Caches calls with the same arguments within a recalculation pass',
    ja: '同じ引数の呼び出しを再計算パス内でキャッシュする',
  },
  'devtools.functionsTool.usedHint': {
    en: "Functions used by this workbook's formulas",
    ja: 'このブックの数式で使われている関数',
  },
  'devtools.functionsTool.all': { en: 'All', ja: 'すべて' },
  'devtools.functionsTool.inUse': { en: 'In use {count}', ja: '使用中 {count}' },
  'devtools.functionsTool.searchPlaceholder': {
    en: 'Search by name or description',
    ja: '関数名・説明で検索',
  },
  'devtools.functionsTool.liftExcludeArgs': {
    en: 'Argument(s) {args} stay as ranges',
    ja: '引数 {args} は範囲のまま渡される',
  },
  'devtools.functionsTool.usageCountTitle': {
    en: 'Number of calls in this workbook',
    ja: 'このブックでの呼び出し回数',
  },

  // Cell inspector (InspectorTool.tsx)
  'devtools.inspectorTool.copied': { en: 'Copied', ja: 'コピーしました' },
  'devtools.inspectorTool.copyJson': { en: 'Copy JSON', ja: 'JSON をコピー' },
  'devtools.inspectorTool.type': { en: 'Type', ja: '型' },
  'devtools.inspectorTool.type.empty': { en: 'Empty', ja: '空' },
  'devtools.inspectorTool.type.error': { en: 'Error', ja: 'エラー' },
  'devtools.inspectorTool.type.text': { en: 'Text', ja: '文字列' },
  'devtools.inspectorTool.type.number': { en: 'Number', ja: '数値' },
  'devtools.inspectorTool.type.boolean': { en: 'Boolean', ja: '真偽値' },
  'devtools.inspectorTool.formula': { en: 'Formula', ja: '数式' },
  'devtools.inspectorTool.yes': { en: 'Yes', ja: 'あり' },
  'devtools.inspectorTool.no': { en: 'No', ja: 'なし' },
  'devtools.inspectorTool.spill': { en: 'Spill', ja: 'スピル' },
  'devtools.inspectorTool.spillReceiver': { en: 'Receiver', ja: '受け側' },
  'devtools.inspectorTool.spillNone': { en: 'None', ja: 'なし' },
  'devtools.inspectorTool.spillSource': { en: 'Source: {source}', ja: '元: {source}' },
  'devtools.inspectorTool.precedents': { en: 'Precedents', ja: '参照元' },
  'devtools.inspectorTool.dependents': { en: 'Dependents', ja: '参照先' },
  'devtools.inspectorTool.cellDataEmpty': {
    en: 'This cell has no data (no entry in the Map)',
    ja: 'このセルにはデータがありません（Map にエントリなし）',
  },

  // History tool (HistoryTool.tsx, historyDiff.ts)
  'devtools.historyTool.origin': { en: 'History start', ja: '履歴の起点' },
  'devtools.historyTool.noChange': {
    en: 'No change (sheet settings only)',
    ja: '変更なし（シート設定などのみ）',
  },
  'devtools.historyTool.sheetsAdded': { en: 'Sheets added: {sheets}', ja: 'シート追加: {sheets}' },
  'devtools.historyTool.sheetsRemoved': {
    en: 'Sheets removed: {sheets}',
    ja: 'シート削除: {sheets}',
  },
  'devtools.historyTool.changedCells': {
    en: { one: '{count} cell ({sample}{more})', other: '{count} cells ({sample}{more})' },
    ja: '{count} セル（{sample}{more}）',
  },
  'devtools.historyTool.changedCellsMore': { en: ', {count} more', ja: ' ほか {count}' },
  'devtools.historyTool.justNow': { en: 'Just now', ja: 'たった今' },
  'devtools.historyTool.secondsAgo': {
    en: { one: '{count} second ago', other: '{count} seconds ago' },
    ja: '{count} 秒前',
  },
  'devtools.historyTool.minutesAgo': {
    en: { one: '{count} minute ago', other: '{count} minutes ago' },
    ja: '{count} 分前',
  },
  'devtools.historyTool.hoursAgo': {
    en: { one: '{count} hour ago', other: '{count} hours ago' },
    ja: '{count} 時間前',
  },
  'devtools.historyTool.initialState': { en: 'Initial state', ja: '最初の状態' },
  'devtools.historyTool.status': {
    en: {
      one: '{count} state (Undo {undo} · Redo {redo}) · max 100',
      other: '{count} states (Undo {undo} · Redo {redo}) · max 100',
    },
    ja: '{count} 状態（Undo {undo} ・ Redo {redo}）・ 最大 100 件',
  },
  'devtools.historyTool.timeTravel': {
    en: 'Time travel through history',
    ja: '履歴のタイムトラベル',
  },
  'devtools.historyTool.oldest': { en: 'Oldest', ja: '最古' },
  'devtools.historyTool.newest': { en: 'Newest', ja: '最新' },
  'devtools.historyTool.moveTo': {
    en: 'Move to #{index} (release to jump)',
    ja: '#{index} へ移動（離すと移動）',
  },
  'devtools.historyTool.empty': {
    en: 'History will appear here once you make changes',
    ja: '操作すると、ここに履歴が並びます',
  },
  'devtools.historyTool.current': { en: 'Current', ja: '現在' },

  // Render tool (RenderTool.tsx)
  'devtools.renderTool.flashRerenders': {
    en: 'Flash re-rendered cells',
    ja: '再描画されたセルを光らせる',
  },
  'devtools.renderTool.updateInterval': { en: 'Updates every second', ja: '1 秒ごとに更新' },
  'devtools.renderTool.cellRerendersPerSec': {
    en: 'Cell re-renders / sec',
    ja: 'セルの再描画 / 秒',
  },
  'devtools.renderTool.mountedCells': { en: 'Mounted cells', ja: 'マウント中のセル' },
  'devtools.renderTool.renderedRows': { en: 'Rendered rows', ja: '描画中の行' },
  'devtools.renderTool.renderedCols': { en: 'Rendered columns', ja: '描画中の列' },
  'devtools.renderTool.totalRerenders': { en: 'Total re-renders', ja: '累計の再描画' },
  'devtools.renderTool.longTasks': { en: 'Long tasks (50ms+)', ja: '長いタスク（50ms+）' },
  'devtools.renderTool.longTaskLast': { en: 'Last {ms} ms', ja: '直近 {ms} ms' },

  // Storage tool (StorageTool.tsx)
  'devtools.storageTool.source': {
    en: 'IndexedDB "masu / autosave"',
    ja: 'IndexedDB「masu / autosave」',
  },
  'devtools.storageTool.reload': { en: 'Reload', ja: '再読み込み' },
  'devtools.storageTool.download': { en: 'Download', ja: 'ダウンロード' },
  'devtools.storageTool.loading': { en: 'Loading…', ja: '読み込み中…' },
  'devtools.storageTool.unavailable': {
    en: 'IndexedDB is unavailable',
    ja: 'IndexedDB を利用できません',
  },
  'devtools.storageTool.noData': {
    en: 'No autosave data yet',
    ja: '自動保存データはまだありません',
  },
  'devtools.storageTool.savedData': { en: 'Saved data', ja: '保存データ' },
  'devtools.storageTool.currentWorkbook': { en: 'Current workbook', ja: '現在のブック' },
  'devtools.storageTool.measure': { en: 'Measure', ja: '計測する' },
  'devtools.storageTool.autosaveStatus': { en: 'Autosave status', ja: '自動保存の状態' },
  'devtools.storageTool.status.idle': { en: 'Idle', ja: '待機' },
  'devtools.storageTool.status.saving': { en: 'Saving', ja: '保存中' },
  'devtools.storageTool.status.saved': { en: 'Saved', ja: '保存済み' },
  'devtools.storageTool.status.error': { en: 'Error', ja: 'エラー' },
  'devtools.storageTool.browserStorage': { en: 'Browser storage', ja: 'ブラウザのストレージ' },
  'devtools.storageTool.contentsHeading': {
    en: 'Contents (format version {version})',
    ja: '中身（形式バージョン {version}）',
  },
  'devtools.storageTool.sheet': { en: 'Sheet', ja: 'シート' },
  'devtools.storageTool.savedCells': { en: 'Saved cells', ja: '保存されたセル' },
  'devtools.storageTool.namedRangesCount': {
    en: { one: '{count} named range', other: '{count} named ranges' },
    ja: '名前付き範囲 {count} 件',
  },
  'devtools.storageTool.showJson': {
    en: 'Show JSON (first 6,000 characters)',
    ja: 'JSON を表示（先頭 6,000 文字）',
  },
  'devtools.storageTool.confirmDelete': {
    en: 'Delete the autosave data? (it will be saved again the next time you make an edit)',
    ja: '自動保存データを削除しますか？（次に編集したときに、また保存されます）',
  },
  'devtools.storageTool.noKeysWithPrefix': {
    en: 'No keys start with {prefix}',
    ja: '{prefix} で始まるキーはありません',
  },
} satisfies MessageTable;
