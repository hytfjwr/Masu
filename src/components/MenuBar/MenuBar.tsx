import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useClampDropdownToViewport } from '../../hooks/useClampToViewport';
import { useSpreadsheetActions } from '../../context/SpreadsheetContext';
import { HoverGlider } from '../HoverGlider';

interface MenuItemDef {
  label: string;
  shortcut?: string;
  action: string;
  disabled?: boolean;
  separator?: boolean;
  /** Nested flyout (e.g. データ > データクリーンアップ ▸) */
  submenu?: MenuItemDef[];
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl';

const FILE_MENU: MenuItemDef[] = [
  { label: '新規作成', action: 'newWorkbook' },
  { label: '', separator: true, action: '' },
  { label: 'インポート...', action: 'import' },
  { label: 'エクスポート > CSV', action: 'exportCSV' },
  { label: 'エクスポート > JSON', action: 'exportJSON' },
  { label: 'エクスポート > Excel (.xlsx)', action: 'exportXLSX' },
  { label: '', separator: true, action: '' },
  { label: '名前を付けて保存 (.tabula.json)', action: 'saveTabula' },
  { label: '開く (.tabula.json)...', action: 'openTabula' },
  { label: '', separator: true, action: '' },
  { label: '印刷プレビュー', action: 'printPreview' },
];

const EDIT_MENU_TEMPLATE: MenuItemDef[] = [
  { label: '元に戻す', shortcut: `${mod}+Z`, action: 'undo' },
  { label: 'やり直し', shortcut: `${mod}+Y`, action: 'redo' },
  { label: '', separator: true, action: '' },
  { label: 'コピー', shortcut: `${mod}+C`, action: 'copy' },
  { label: '切り取り', shortcut: `${mod}+X`, action: 'cut' },
  { label: '貼り付け', shortcut: `${mod}+V`, action: 'paste' },
  { label: '形式を選択して貼り付け > 値のみ', shortcut: `${mod}+Shift+V`, action: 'pasteValues' },
  { label: '形式を選択して貼り付け > 書式のみ', action: 'pasteFormat' },
  { label: '形式を選択して貼り付け > 転置', action: 'pasteTranspose' },
  { label: '', separator: true, action: '' },
  { label: '検索と置換', shortcut: `${mod}+H`, action: 'searchReplace' },
];

const MENU_ITEMS = [
  { label: 'ファイル', id: 'file' },
  { label: '編集', id: 'edit' },
  { label: '表示', id: 'view' },
  { label: '挿入', id: 'insert' },
  { label: '書式', id: 'format' },
  { label: 'データ', id: 'data' },
  { label: 'ヘルプ', id: 'help' },
] as const;

export const MenuBar = memo(function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  const [freezeDialog, setFreezeDialog] = useState(false);
  const [freezeRowsInput, setFreezeRowsInput] = useState('0');
  const [freezeColsInput, setFreezeColsInput] = useState('0');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useClampDropdownToViewport(dropdownRef, openMenu !== null);
  const actions = useSpreadsheetActions();

  const handleMenuClick = useCallback((id: string) => {
    setOpenMenu((prev) => (prev === id ? null : id));
    setOpenSubmenu(null);
  }, []);

  // useEffect required: global click-outside listener for menu dropdown
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-menu-bar]')) {
        setOpenMenu(null);
        setOpenSubmenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'newWorkbook':
          if (window.confirm('現在のスプレッドシートを閉じて新規作成しますか？（内容は自動保存から削除されます）')) {
            actions.newWorkbook();
          }
          break;
        case 'import':
          fileInputRef.current?.click();
          break;
        case 'exportCSV':
          actions.exportCSV();
          break;
        case 'exportJSON':
          actions.exportJSON();
          break;
        case 'exportXLSX':
          actions.exportXLSX();
          break;
        case 'undo':
          actions.undo();
          break;
        case 'redo':
          actions.redo();
          break;
        case 'copy':
          actions.copy();
          break;
        case 'cut':
          actions.cut();
          break;
        case 'paste':
          actions.paste();
          break;
        case 'pasteValues':
          actions.pasteValuesOnly();
          break;
        case 'pasteFormat':
          actions.pasteFormatOnly();
          break;
        case 'pasteTranspose':
          actions.pasteTranspose();
          break;
        case 'searchReplace':
          actions.openSearch({ replace: true });
          break;
        case 'freezePane':
          setFreezeRowsInput(String(actions.frozenRows));
          setFreezeColsInput(String(actions.frozenCols));
          setFreezeDialog(true);
          break;
        case 'unfreezePane':
          actions.setFrozenRows(0);
          actions.setFrozenCols(0);
          break;
        case 'conditionalFormat':
          actions.openConditionalFormatDialog();
          break;
        case 'dataValidation':
          actions.openValidationDialog();
          break;
        case 'toggleStrikethrough':
          actions.toggleStrikethrough();
          break;
        case 'clearFormatting':
          actions.clearFormatting();
          break;
        case 'insertRowAbove':
          actions.insertRow(actions.activeCell.row, 'before');
          break;
        case 'insertRowBelow':
          actions.insertRow(actions.activeCell.row, 'after');
          break;
        case 'insertColLeft':
          actions.insertColumn(actions.activeCell.col, 'before');
          break;
        case 'insertColRight':
          actions.insertColumn(actions.activeCell.col, 'after');
          break;
        case 'insertChart':
          actions.openChartDialog();
          break;
        case 'namedRanges':
          actions.openNamedRangeDialog();
          break;
        case 'saveTabula':
          actions.saveTabula();
          break;
        case 'openTabula':
          actions.openTabula();
          break;
        case 'printPreview':
          actions.openPrintPreview();
          break;
        case 'insertSparkline':
          actions.openSparklineDialog();
          break;
        case 'insertPivotTable':
          actions.openPivotTableDialog();
          break;
        case 'insertCheckbox':
          actions.insertCheckbox();
          break;
        case 'insertDropdown':
          actions.insertDropdown();
          break;
        case 'sortRange':
          actions.openSortRangeDialog();
          break;
        case 'sortSheetAsc':
          actions.sortActiveColumn(true);
          break;
        case 'sortSheetDesc':
          actions.sortActiveColumn(false);
          break;
        case 'toggleFilter':
          actions.toggleFilter();
          break;
        case 'removeDuplicates':
          actions.openRemoveDuplicatesDialog();
          break;
        case 'trimWhitespace':
          actions.trimWhitespace();
          break;
        case 'splitTextToColumns':
          actions.splitTextToColumnsAction();
          break;
        case 'shortcuts':
          actions.openShortcutsDialog();
          break;
        case 'functionWizard':
          actions.openFunctionWizard();
          break;
        case 'devTools':
          actions.openDevTools();
          break;
      }
      setOpenMenu(null);
      setOpenSubmenu(null);
    },
    [actions],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        actions.importFile(file);
      }
      e.target.value = '';
    },
    [actions],
  );

  const handleFreezeConfirm = useCallback(() => {
    const rows = Math.max(0, parseInt(freezeRowsInput, 10) || 0);
    const cols = Math.max(0, parseInt(freezeColsInput, 10) || 0);
    actions.setFrozenRows(rows);
    actions.setFrozenCols(cols);
    setFreezeDialog(false);
  }, [freezeRowsInput, freezeColsInput, actions]);

  const getMenuItems = (id: string): MenuItemDef[] => {
    switch (id) {
      case 'file':
        return FILE_MENU;
      case 'edit':
        return EDIT_MENU_TEMPLATE.map((item) => {
          if (item.action === 'undo') return { ...item, disabled: !actions.canUndo };
          if (item.action === 'redo') return { ...item, disabled: !actions.canRedo };
          return item;
        });
      case 'view': {
        const hasFrozen = actions.frozenRows > 0 || actions.frozenCols > 0;
        return [
          { label: '行列の固定...', action: 'freezePane' },
          { label: '固定を解除', action: 'unfreezePane', disabled: !hasFrozen },
          { label: '', separator: true, action: '' },
          { label: '開発者ツール', shortcut: `${mod}+Shift+K`, action: 'devTools' },
        ];
      }
      case 'insert':
        return [
          { label: '上に行を挿入', action: 'insertRowAbove' },
          { label: '下に行を挿入', action: 'insertRowBelow' },
          { label: '', separator: true, action: '' },
          { label: '左に列を挿入', action: 'insertColLeft' },
          { label: '右に列を挿入', action: 'insertColRight' },
          { label: '', separator: true, action: '' },
          { label: 'グラフを挿入...', action: 'insertChart' },
          { label: 'スパークライン...', action: 'insertSparkline' },
          { label: 'ピボットテーブル...', action: 'insertPivotTable' },
          { label: '', separator: true, action: '' },
          { label: 'チェックボックス', action: 'insertCheckbox' },
          { label: 'プルダウン', action: 'insertDropdown' },
          { label: '', separator: true, action: '' },
          { label: '名前付き範囲の管理...', action: 'namedRanges' },
        ];
      case 'format':
        return [
          { label: '取り消し線', shortcut: `${mod}+Shift+X`, action: 'toggleStrikethrough' },
          { label: '', separator: true, action: '' },
          { label: '条件付き書式...', action: 'conditionalFormat' },
          { label: 'データの入力規則...', action: 'dataValidation' },
          { label: '', separator: true, action: '' },
          { label: '書式をクリア', shortcut: `${mod}+\\`, action: 'clearFormatting' },
        ];
      case 'data':
        return [
          { label: '範囲を並べ替え...', action: 'sortRange' },
          { label: 'シートを並べ替え (A→Z)', action: 'sortSheetAsc' },
          { label: 'シートを並べ替え (Z→A)', action: 'sortSheetDesc' },
          { label: '', separator: true, action: '' },
          { label: actions.filterRange ? 'フィルタを削除' : 'フィルタを作成', action: 'toggleFilter' },
          { label: '', separator: true, action: '' },
          { label: 'データの入力規則...', action: 'dataValidation' },
          { label: '名前付き範囲...', action: 'namedRanges' },
          { label: '', separator: true, action: '' },
          {
            label: 'データクリーンアップ',
            action: '',
            submenu: [
              { label: '重複を削除...', action: 'removeDuplicates' },
              { label: '空白文字を削除', action: 'trimWhitespace' },
            ],
          },
          { label: 'テキストを列に分割', action: 'splitTextToColumns' },
        ];
      case 'help':
        return [
          { label: 'キーボード ショートカット', action: 'shortcuts' },
          { label: '関数リスト', action: 'functionWizard' },
        ];
      default:
        return [];
    }
  };

  return (
    <>
      <div
        className="flex items-center h-6 shrink-0 -ml-2"
        data-menu-bar
      >
        <nav className="relative flex items-center gap-0.5" data-hover-glide>
          <HoverGlider />
          {MENU_ITEMS.map((item) => (
            <div key={item.id} className="relative">
              <button
                type="button"
                className={`px-2.5 py-0.5 text-xs text-text-primary rounded-sm transition-all duration-100 select-none active:scale-95
                  ${openMenu === item.id ? 'bg-accent-selection/10 text-accent-selection' : ''}`}
                onClick={() => handleMenuClick(item.id)}
              >
                {item.label}
              </button>
              {openMenu === item.id && (
                <div ref={dropdownRef} data-context-menu className="absolute top-full left-0 mt-px min-w-[200px] glass-surface rounded-xl z-50 py-1 animate-slide-down">
                  {getMenuItems(item.id).map((menuItem, idx) =>
                    menuItem.separator ? (
                      <div key={idx} className="border-t border-grid-line my-1" />
                    ) : menuItem.submenu ? (
                      <div key={idx} className="relative">
                        <button
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-4 text-text-primary hover:bg-accent-selection/10 transition-colors duration-75"
                          onMouseEnter={() => setOpenSubmenu(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setOpenSubmenu((prev) => (prev === idx ? null : idx));
                          }}
                        >
                          <span>{menuItem.label}</span>
                          <span className="text-text-primary/30 text-[10px]">▸</span>
                        </button>
                        {openSubmenu === idx && (
                          <div data-context-menu className="absolute left-full top-0 ml-1 min-w-[160px] glass-surface rounded-xl z-50 py-1 animate-fade-in-scale">
                            {menuItem.submenu.map((subItem, subIdx) => (
                              <button
                                key={subIdx}
                                type="button"
                                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10 transition-colors duration-75"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleAction(subItem.action);
                                }}
                              >
                                {subItem.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        key={idx}
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-4 transition-colors duration-75 ${
                          menuItem.disabled
                            ? 'text-text-primary/30 cursor-default'
                            : 'text-text-primary hover:bg-accent-selection/10'
                        }`}
                        onMouseEnter={() => setOpenSubmenu(null)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (!menuItem.disabled) {
                            handleAction(menuItem.action);
                          }
                        }}
                        disabled={menuItem.disabled}
                      >
                        <span>{menuItem.label}</span>
                        {menuItem.shortcut && (
                          <span className="text-text-primary/30 text-[10px]">
                            {menuItem.shortcut}
                          </span>
                        )}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.xlsx"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Freeze Pane Dialog */}
      {freezeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-backdrop-in">
          <div className="glass-panel rounded-2xl p-4 min-w-[280px] animate-dialog-spring" data-testid="freeze-dialog">
            <h3 className="text-sm font-medium text-text-primary mb-3">行列の固定</h3>
            <div className="flex flex-col gap-2 mb-4">
              <label className="flex items-center gap-2 text-xs text-text-primary">
                <span className="w-20">固定する行数:</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={freezeRowsInput}
                  onChange={(e) => setFreezeRowsInput(e.target.value)}
                  className="w-16 h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
                  data-testid="freeze-rows-input"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-text-primary">
                <span className="w-20">固定する列数:</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={freezeColsInput}
                  onChange={(e) => setFreezeColsInput(e.target.value)}
                  className="w-16 h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
                  data-testid="freeze-cols-input"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="h-7 px-3 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40"
                onClick={() => setFreezeDialog(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                data-btn-primary
                className="h-7 px-3 text-xs text-white bg-accent-selection rounded hover:opacity-90"
                onClick={handleFreezeConfirm}
                data-testid="freeze-confirm-button"
              >
                適用
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
