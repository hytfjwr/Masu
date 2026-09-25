import { describe, it, expect } from 'vite-plus/test';
import { aggregate, buildPivotTable, extractFieldNames } from './pivotEngine';
import type { PivotComputeConfig } from './pivotEngine';

describe('extractFieldNames', () => {
  it('extracts trimmed field names from first row', () => {
    const data = [
      ['商品名 ', ' 地域', '売上 '],
      ['A', '東京', '100'],
    ];
    expect(extractFieldNames(data)).toEqual(['商品名', '地域', '売上']);
  });

  it('returns empty array for empty data', () => {
    expect(extractFieldNames([])).toEqual([]);
  });
});

describe('aggregate', () => {
  it('computes sum', () => {
    expect(aggregate([10, 20, 30], 'sum')).toBe(60);
  });

  it('computes count', () => {
    expect(aggregate([10, 20, 30], 'count')).toBe(3);
  });

  it('computes average', () => {
    expect(aggregate([10, 20, 30], 'average')).toBeCloseTo(20);
  });

  it('computes max', () => {
    expect(aggregate([10, 50, 30], 'max')).toBe(50);
  });

  it('computes min', () => {
    expect(aggregate([10, 50, 30], 'min')).toBe(10);
  });

  it('handles empty array for sum', () => {
    expect(aggregate([], 'sum')).toBe(0);
  });

  it('handles empty array for count', () => {
    expect(aggregate([], 'count')).toBe(0);
  });
});

describe('buildPivotTable', () => {
  const sourceData = [
    ['商品', '地域', '月', '売上'],
    ['A', '東京', '1月', '100'],
    ['B', '東京', '1月', '200'],
    ['A', '大阪', '1月', '150'],
    ['B', '大阪', '1月', '250'],
    ['A', '東京', '2月', '120'],
    ['B', '東京', '2月', '220'],
    ['A', '大阪', '2月', '170'],
    ['B', '大阪', '2月', '270'],
  ];

  it('builds row-only pivot table with SUM', () => {
    const config: PivotComputeConfig = {
      rowFields: [0], // 商品
      colFields: [],
      valueFields: [{ fieldIndex: 3, fieldName: '売上', aggregation: 'sum' }],
      filterFields: [],
    };
    const result = buildPivotTable(sourceData, config);

    // Header row + 2 data rows (A, B) + 1 total row
    expect(result.length).toBe(4);
    // Header
    expect(result[0][0].value).toBe('商品');
    expect(result[0][1].value).toBe('合計 / 売上');
    // Data - A: 100+150+120+170 = 540
    expect(result[1][0].value).toBe('A');
    expect(result[1][1].value).toBe(540);
    // Data - B: 200+250+220+270 = 940
    expect(result[2][0].value).toBe('B');
    expect(result[2][1].value).toBe(940);
    // Total
    expect(result[3][0].value).toBe('総計');
    expect(result[3][1].value).toBe(1480);
  });

  it('builds cross-tabulation with row and column fields', () => {
    const config: PivotComputeConfig = {
      rowFields: [0], // 商品
      colFields: [1], // 地域
      valueFields: [{ fieldIndex: 3, fieldName: '売上', aggregation: 'sum' }],
      filterFields: [],
    };
    const result = buildPivotTable(sourceData, config);

    // Header row (地域 labels) + 2 data rows + 1 total
    expect(result.length).toBe(4);
    // Column headers: 大阪, 東京 (sorted), then total
    expect(result[0][1].value).toBe('大阪');
    expect(result[0][2].value).toBe('東京');
    expect(result[0][3].value).toBe('合計 売上');

    // A, 大阪: 150+170=320
    expect(result[1][1].value).toBe(320);
    // A, 東京: 100+120=220
    expect(result[1][2].value).toBe(220);
    // A total: 540
    expect(result[1][3].value).toBe(540);
  });

  it('handles count aggregation', () => {
    const config: PivotComputeConfig = {
      rowFields: [1], // 地域
      colFields: [],
      valueFields: [{ fieldIndex: 3, fieldName: '売上', aggregation: 'count' }],
      filterFields: [],
    };
    const result = buildPivotTable(sourceData, config);

    // 大阪: 4 rows, 東京: 4 rows
    const dataRows = result.slice(1, -1); // exclude header and total
    const osaka = dataRows.find((r) => r[0].value === '大阪');
    const tokyo = dataRows.find((r) => r[0].value === '東京');
    expect(osaka?.[1].value).toBe(4);
    expect(tokyo?.[1].value).toBe(4);
  });

  it('handles average aggregation', () => {
    const config: PivotComputeConfig = {
      rowFields: [0], // 商品
      colFields: [],
      valueFields: [{ fieldIndex: 3, fieldName: '売上', aggregation: 'average' }],
      filterFields: [],
    };
    const result = buildPivotTable(sourceData, config);

    // A: (100+150+120+170)/4 = 135
    expect(result[1][1].value).toBeCloseTo(135);
    // B: (200+250+220+270)/4 = 235
    expect(result[2][1].value).toBeCloseTo(235);
  });

  it('handles max and min aggregation', () => {
    const configMax: PivotComputeConfig = {
      rowFields: [0],
      colFields: [],
      valueFields: [{ fieldIndex: 3, fieldName: '売上', aggregation: 'max' }],
      filterFields: [],
    };
    const resultMax = buildPivotTable(sourceData, configMax);
    expect(resultMax[1][1].value).toBe(170); // A max
    expect(resultMax[2][1].value).toBe(270); // B max

    const configMin: PivotComputeConfig = {
      rowFields: [0],
      colFields: [],
      valueFields: [{ fieldIndex: 3, fieldName: '売上', aggregation: 'min' }],
      filterFields: [],
    };
    const resultMin = buildPivotTable(sourceData, configMin);
    expect(resultMin[1][1].value).toBe(100); // A min
    expect(resultMin[2][1].value).toBe(200); // B min
  });

  it('handles empty data', () => {
    const config: PivotComputeConfig = {
      rowFields: [0],
      colFields: [],
      valueFields: [{ fieldIndex: 1, fieldName: '値', aggregation: 'sum' }],
      filterFields: [],
    };
    const result = buildPivotTable([['A']], config);
    expect(result[0][0].value).toBe('(データなし)');
  });

  it('applies filter', () => {
    const config: PivotComputeConfig = {
      rowFields: [0], // 商品
      colFields: [],
      valueFields: [{ fieldIndex: 3, fieldName: '売上', aggregation: 'sum' }],
      filterFields: [1], // 地域
      filterValues: { 1: ['東京'] }, // 東京のみ
    };
    const result = buildPivotTable(sourceData, config);

    // A, 東京: 100+120=220
    expect(result[1][1].value).toBe(220);
    // B, 東京: 200+220=420
    expect(result[2][1].value).toBe(420);
    // Total: 640
    expect(result[3][1].value).toBe(640);
  });

  it('handles multiple value fields', () => {
    const data = [
      ['商品', '売上', '数量'],
      ['A', '100', '5'],
      ['B', '200', '10'],
      ['A', '150', '8'],
    ];
    const config: PivotComputeConfig = {
      rowFields: [0],
      colFields: [],
      valueFields: [
        { fieldIndex: 1, fieldName: '売上', aggregation: 'sum' },
        { fieldIndex: 2, fieldName: '数量', aggregation: 'sum' },
      ],
      filterFields: [],
    };
    const result = buildPivotTable(data, config);

    // Header: 商品, 合計/売上, 合計/数量
    expect(result[0].length).toBe(3);
    // A: 売上 250, 数量 13
    expect(result[1][1].value).toBe(250);
    expect(result[1][2].value).toBe(13);
    // B: 売上 200, 数量 10
    expect(result[2][1].value).toBe(200);
    expect(result[2][2].value).toBe(10);
  });

  it('handles collapsed rows', () => {
    const data = [
      ['カテゴリ', 'サブカテゴリ', '値'],
      ['食品', 'フルーツ', '100'],
      ['食品', '野菜', '200'],
      ['飲料', 'ジュース', '300'],
    ];
    const config: PivotComputeConfig = {
      rowFields: [0, 1], // カテゴリ, サブカテゴリ
      colFields: [],
      valueFields: [{ fieldIndex: 2, fieldName: '値', aggregation: 'sum' }],
      filterFields: [],
      collapsedRows: { 食品: true }, // 食品を折りたたみ
    };
    const result = buildPivotTable(data, config);

    // Header + 飲料\0ジュース + 総計 = 3 rows (食品の子行はスキップ)
    // 食品\0フルーツ and 食品\0野菜 are skipped because parent '食品' is collapsed
    const dataRowValues = result.slice(1, -1).map((r) => r[0].value);
    expect(dataRowValues).not.toContain('フルーツ');
    expect(dataRowValues).not.toContain('野菜');
    // 飲料\0ジュース should still be there
    const juiceRow = result.slice(1, -1).find((r) => r[1].value === 'ジュース');
    expect(juiceRow).toBeDefined();
  });

  it('handles no value fields', () => {
    const config: PivotComputeConfig = {
      rowFields: [0],
      colFields: [],
      valueFields: [],
      filterFields: [],
    };
    const result = buildPivotTable(sourceData, config);
    expect(result[0][0].value).toBe('(値フィールドなし)');
  });
});
