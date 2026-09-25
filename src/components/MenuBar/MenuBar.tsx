import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useClampDropdownToViewport } from '../../hooks/useClampToViewport';
import { useSpreadsheetActions } from '../../context/SpreadsheetContext';
import { HoverGlider } from '../HoverGlider';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

interface MenuItemDef {
  labelKey?: MessageKey;
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
  { labelKey: 'chrome.menuBar.newWorkbook', action: 'newWorkbook' },
  { separator: true, action: '' },
  { labelKey: 'chrome.menuBar.import', action: 'import' },
  { labelKey: 'chrome.menuBar.exportCSV', action: 'exportCSV' },
  { labelKey: 'chrome.menuBar.exportJSON', action: 'exportJSON' },
  { labelKey: 'chrome.menuBar.exportXLSX', action: 'exportXLSX' },
  { separator: true, action: '' },
  { labelKey: 'chrome.menuBar.saveNative', action: 'saveNative' },
  { labelKey: 'chrome.menuBar.openNative', action: 'openNative' },
  { separator: true, action: '' },
  { labelKey: 'chrome.menuBar.printPreview', action: 'printPreview' },
];

const EDIT_MENU_TEMPLATE: MenuItemDef[] = [
  { labelKey: 'chrome.menuBar.undo', shortcut: `${mod}+Z`, action: 'undo' },
  { labelKey: 'chrome.menuBar.redo', shortcut: `${mod}+Y`, action: 'redo' },
  { separator: true, action: '' },
  { labelKey: 'chrome.menuBar.copy', shortcut: `${mod}+C`, action: 'copy' },
  { labelKey: 'chrome.menuBar.cut', shortcut: `${mod}+X`, action: 'cut' },
  { labelKey: 'chrome.menuBar.paste', shortcut: `${mod}+V`, action: 'paste' },
  {
    labelKey: 'chrome.menuBar.pasteValues',
    shortcut: `${mod}+Shift+V`,
    action: 'pasteValues',
  },
  { labelKey: 'chrome.menuBar.pasteFormat', action: 'pasteFormat' },
  { labelKey: 'chrome.menuBar.pasteTranspose', action: 'pasteTranspose' },
  { separator: true, action: '' },
  { labelKey: 'chrome.menuBar.searchReplace', shortcut: `${mod}+H`, action: 'searchReplace' },
];

const MENU_ITEMS: { labelKey: MessageKey; id: string }[] = [
  { labelKey: 'chrome.menuBar.file', id: 'file' },
  { labelKey: 'chrome.menuBar.edit', id: 'edit' },
  { labelKey: 'chrome.menuBar.view', id: 'view' },
  { labelKey: 'chrome.menuBar.insert', id: 'insert' },
  { labelKey: 'chrome.menuBar.format', id: 'format' },
  { labelKey: 'chrome.menuBar.data', id: 'data' },
  { labelKey: 'chrome.menuBar.help', id: 'help' },
];

export const MenuBar = memo(function MenuBar() {
  const { t } = useI18n();
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
          if (window.confirm(t('chrome.menuBar.confirmNewWorkbook'))) {
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
        case 'saveNative':
          actions.saveNative();
          break;
        case 'openNative':
          actions.openNative();
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
    [actions, t],
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
          { labelKey: 'chrome.menuBar.freezePane', action: 'freezePane' },
          {
            labelKey: 'chrome.menuBar.unfreezePane',
            action: 'unfreezePane',
            disabled: !hasFrozen,
          },
          { separator: true, action: '' },
          {
            labelKey: 'chrome.menuBar.devTools',
            shortcut: `${mod}+Shift+K`,
            action: 'devTools',
          },
        ];
      }
      case 'insert':
        return [
          { labelKey: 'chrome.menuBar.insertRowAbove', action: 'insertRowAbove' },
          { labelKey: 'chrome.menuBar.insertRowBelow', action: 'insertRowBelow' },
          { separator: true, action: '' },
          { labelKey: 'chrome.menuBar.insertColLeft', action: 'insertColLeft' },
          { labelKey: 'chrome.menuBar.insertColRight', action: 'insertColRight' },
          { separator: true, action: '' },
          { labelKey: 'chrome.menuBar.insertChart', action: 'insertChart' },
          { labelKey: 'chrome.menuBar.insertSparkline', action: 'insertSparkline' },
          { labelKey: 'chrome.menuBar.insertPivotTable', action: 'insertPivotTable' },
          { separator: true, action: '' },
          { labelKey: 'chrome.menuBar.insertCheckbox', action: 'insertCheckbox' },
          { labelKey: 'chrome.menuBar.insertDropdown', action: 'insertDropdown' },
          { separator: true, action: '' },
          { labelKey: 'chrome.menuBar.namedRangesManage', action: 'namedRanges' },
        ];
      case 'format':
        return [
          {
            labelKey: 'chrome.menuBar.toggleStrikethrough',
            shortcut: `${mod}+Shift+X`,
            action: 'toggleStrikethrough',
          },
          { separator: true, action: '' },
          { labelKey: 'chrome.menuBar.conditionalFormat', action: 'conditionalFormat' },
          { labelKey: 'chrome.menuBar.dataValidation', action: 'dataValidation' },
          { separator: true, action: '' },
          {
            labelKey: 'chrome.menuBar.clearFormatting',
            shortcut: `${mod}+\\`,
            action: 'clearFormatting',
          },
        ];
      case 'data':
        return [
          { labelKey: 'chrome.menuBar.sortRange', action: 'sortRange' },
          { labelKey: 'chrome.menuBar.sortSheetAsc', action: 'sortSheetAsc' },
          { labelKey: 'chrome.menuBar.sortSheetDesc', action: 'sortSheetDesc' },
          { separator: true, action: '' },
          {
            labelKey: actions.filterRange
              ? 'chrome.menuBar.removeFilter'
              : 'chrome.menuBar.createFilter',
            action: 'toggleFilter',
          },
          { separator: true, action: '' },
          { labelKey: 'chrome.menuBar.dataValidation', action: 'dataValidation' },
          { labelKey: 'chrome.menuBar.namedRanges', action: 'namedRanges' },
          { separator: true, action: '' },
          {
            labelKey: 'chrome.menuBar.dataCleanup',
            action: '',
            submenu: [
              { labelKey: 'chrome.menuBar.removeDuplicates', action: 'removeDuplicates' },
              { labelKey: 'chrome.menuBar.trimWhitespace', action: 'trimWhitespace' },
            ],
          },
          { labelKey: 'chrome.menuBar.splitTextToColumns', action: 'splitTextToColumns' },
        ];
      case 'help':
        return [
          { labelKey: 'chrome.menuBar.shortcuts', action: 'shortcuts' },
          { labelKey: 'chrome.menuBar.functionWizard', action: 'functionWizard' },
        ];
      default:
        return [];
    }
  };

  return (
    <>
      <div className="flex items-center h-6 shrink-0 -ml-2" data-menu-bar>
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
                {t(item.labelKey)}
              </button>
              {openMenu === item.id && (
                <div
                  ref={dropdownRef}
                  data-context-menu
                  className="absolute top-full left-0 mt-px min-w-[200px] glass-surface rounded-xl z-50 py-1 animate-slide-down"
                >
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
                          <span>{menuItem.labelKey && t(menuItem.labelKey)}</span>
                          <span className="text-text-primary/30 text-[10px]">▸</span>
                        </button>
                        {openSubmenu === idx && (
                          <div
                            data-context-menu
                            className="absolute left-full top-0 ml-1 min-w-[160px] glass-surface rounded-xl z-50 py-1 animate-fade-in-scale"
                          >
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
                                {subItem.labelKey && t(subItem.labelKey)}
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
                        <span>{menuItem.labelKey && t(menuItem.labelKey)}</span>
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
          <div
            className="glass-panel rounded-2xl p-4 min-w-[280px] animate-dialog-spring"
            data-testid="freeze-dialog"
          >
            <h3 className="text-sm font-medium text-text-primary mb-3">
              {t('chrome.menuBar.freezeDialogTitle')}
            </h3>
            <div className="flex flex-col gap-2 mb-4">
              <label className="flex items-center gap-2 text-xs text-text-primary">
                <span className="w-20">{t('chrome.menuBar.freezeRowsLabel')}</span>
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
                <span className="w-20">{t('chrome.menuBar.freezeColsLabel')}</span>
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
                {t('common.cancel')}
              </button>
              <button
                type="button"
                data-btn-primary
                className="h-7 px-3 text-xs text-white bg-accent-selection rounded hover:opacity-90"
                onClick={handleFreezeConfirm}
                data-testid="freeze-confirm-button"
              >
                {t('common.apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
