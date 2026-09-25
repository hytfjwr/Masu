# Tabula

[![CI](https://github.com/hytfjwr/Tabula/actions/workflows/ci.yml/badge.svg)](https://github.com/hytfjwr/Tabula/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/hytfjwr/Tabula/actions/workflows/pages.yml/badge.svg)](https://github.com/hytfjwr/Tabula/actions/workflows/pages.yml)

A spreadsheet editor that runs entirely in your browser. There is no server and no cloud: formula evaluation, file import/export, PDF generation and autosave all happen client-side.

**Live demo:** https://hytfjwr.github.io/Tabula/

## Features

- **Formula engine** — 250+ Excel-compatible functions, dynamic arrays with spilling, `LET` / `LAMBDA` / `MAP` / `REDUCE`, cross-sheet references and named ranges
- **Files** — open and save XLSX, CSV (with Shift_JIS detection), JSON and the native `.tabula.json` format
- **Data tools** — sorting, filters, remove duplicates, data validation, conditional formatting, row/column grouping
- **Visualization** — charts, sparklines and pivot tables
- **Printing** — print preview and PDF export
- **Autosave** — your workbook is kept in IndexedDB and restored on reload
- Frozen panes, find & replace, keyboard shortcuts, IME-friendly in-cell editing, and dark mode

## Getting started

Requires Node.js and [pnpm](https://pnpm.io/) 10.

```bash
pnpm install
pnpm dev
```

## Scripts

| Command      | Description                         |
| ------------ | ----------------------------------- |
| `pnpm dev`   | Start the Vite dev server           |
| `pnpm build` | Type-check and build for production |
| `pnpm lint`  | Run ESLint                          |
| `pnpm test`  | Run the test suite with Vitest      |

## Tech stack

React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Virtual, Recharts, ExcelJS and jsPDF.
