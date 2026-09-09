// Derived from ESSApp/src/utils/materialSelection.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
import {
  PICKING_CARD_ROWS,
  SECTION_HEADER_LABELS,
  type ItemSide,
  type PickingCardRow,
} from '../features/materialOrders/requestSchema';

export type MaterialItemSide = ItemSide;
export type MaterialPickingRow = PickingCardRow;

export const MATERIAL_PICKING_ROWS = PICKING_CARD_ROWS;

const MATERIAL_PICKER_COLUMNS: Array<{side: MaterialItemSide; title: string}> = [
  {side: 'left', title: 'MODULAR SCAFFOLD'},
  {side: 'middle', title: 'SOLE BOARDS'},
  {side: 'right', title: 'SCAFFOLD LADDER'},
];

export function materialQuantityKey(rowId: string, side: MaterialItemSide): string {
  return `${rowId}_${side}_qty`;
}

export function isMaterialSectionHeader(entry: [string, string]): boolean {
  return SECTION_HEADER_LABELS.has((entry[0] || '').trim().toUpperCase()) && !entry[1];
}

function normalizeMaterialText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function formatSelectedMaterialList(itemValues: Record<string, string>): string {
  return MATERIAL_PICKER_ITEMS.map(item => {
    if (item.section) {
      return '';
    }

    const quantity = (itemValues[materialQuantityKey(item.rowId, item.side)] ?? '').trim();
    if (!quantity || quantity === '0') {
      return '';
    }

    return `- ${quantity} x ${[item.label, item.spec].filter(Boolean).join(' ')}`;
  }).filter(Boolean).join('\n');
}

export function materialListToEntries(materialList?: string): string[] {
  if (!materialList?.trim()) {
    return [];
  }

  return materialList.split(/\r?\n|;/).flatMap(line =>
    line
      .split(/\s+(?=[-•]\s*\d+\s*x\s+)/i)
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => {
        const cleaned = entry.replace(/^[-•]\s*/, '').trim();
        return cleaned ? `- ${cleaned}` : '';
      })
      .filter(Boolean),
  );
}

export function buildMaterialListColumns(
  materialList: string | undefined,
  options: {maxRows?: number; maxColumns?: number} = {},
): string[][] {
  const entries = materialListToEntries(materialList);
  if (!entries.length) {
    return [];
  }

  const maxRows = Math.max(1, options.maxRows ?? 4);
  const maxColumns = Math.max(1, options.maxColumns ?? 4);
  const columnCount = Math.min(maxColumns, Math.max(1, Math.ceil(entries.length / maxRows)));
  const rowCount = Math.ceil(entries.length / columnCount);

  return Array.from({length: columnCount}, (_, columnIndex) =>
    entries.slice(columnIndex * rowCount, columnIndex * rowCount + rowCount),
  );
}

export function materialListToItemValues(materialList?: string): Record<string, string> {
  if (!materialList?.trim()) {
    return {};
  }

  const labelLookup = new Map<string, string>();
  MATERIAL_PICKING_ROWS.forEach(row => {
    (['left', 'middle', 'right'] as const).forEach(side => {
      const entry = row[side];
      if (!entry[0] || isMaterialSectionHeader(entry)) {
        return;
      }

      labelLookup.set(normalizeMaterialText([entry[0], entry[1]].filter(Boolean).join(' ')), materialQuantityKey(row.id, side));
    });
  });

  return materialListToEntries(materialList).reduce<Record<string, string>>((acc, entry) => {
    const match = entry.replace(/^[-•]\s*/, '').match(/^(\d+)\s*x\s+(.+)$/i);
    if (!match) {
      return acc;
    }

    const key = labelLookup.get(normalizeMaterialText(match[2]));
    if (key) {
      acc[key] = match[1];
    }
    return acc;
  }, {});
}

export type MaterialPickerItem = {
  key: string;
  rowId: string;
  side: MaterialItemSide;
  label: string;
  spec: string;
  section: boolean;
};

function getMaterialRow(rowId: string): MaterialPickingRow {
  const row = MATERIAL_PICKING_ROWS.find(item => item.id === rowId);
  if (!row) {
    throw new Error(`Missing material row: ${rowId}`);
  }
  return row;
}

function createMaterialPickerSection(side: MaterialItemSide, key: string, label: string): MaterialPickerItem {
  return {
    key,
    rowId: '',
    side,
    label,
    spec: '',
    section: true,
  };
}

function createMaterialPickerItem(row: MaterialPickingRow, side: MaterialItemSide): MaterialPickerItem {
  const entry = row[side];
  return {
    key: `${row.id}:${side}`,
    rowId: row.id,
    side,
    label: entry[0],
    spec: entry[1],
    section: isMaterialSectionHeader(entry),
  };
}

export const MATERIAL_PICKER_ITEMS: MaterialPickerItem[] = MATERIAL_PICKER_COLUMNS.flatMap(column => {
  const items: MaterialPickerItem[] = [
    createMaterialPickerSection(column.side, `column:${column.side}`, column.title),
  ];
  const skippedKeys = new Set<string>();

  if (column.side === 'left') {
    ['r35', 'r36', 'r37'].forEach(rowId => skippedKeys.add(`${rowId}:right`));
  }

  if (column.side === 'right') {
    ['r27', 'r28', 'r29', 'r30', 'r35', 'r36', 'r37'].forEach(rowId => skippedKeys.add(`${rowId}:right`));
  }

  MATERIAL_PICKING_ROWS.forEach(row => {
    const entry = row[column.side];
    if (!entry[0] && !entry[1]) {
      return;
    }

    if (skippedKeys.has(`${row.id}:${column.side}`)) {
      return;
    }

    if (column.side === 'middle' && row.id === 'r36') {
      items.push(createMaterialPickerSection(column.side, 'section:middle:scaffold-tube', 'SCAFFOLD TUBE'));
    }

    if (column.side === 'middle' && row.id === 'h_diagonal') {
      return;
    }

    items.push(createMaterialPickerItem(row, column.side));

    if (column.side === 'left' && row.id === 'r37') {
      ['r35', 'r36', 'r37'].forEach(rowId => {
        items.push(createMaterialPickerItem(getMaterialRow(rowId), 'right'));
      });
    }

    if (column.side === 'right' && row.id === 'r17') {
      items.push(createMaterialPickerSection(column.side, 'section:right:ladder-beams', 'LADDER BEAMS'));
      ['r27', 'r28', 'r29', 'r30'].forEach(rowId => {
        items.push(createMaterialPickerItem(getMaterialRow(rowId), 'right'));
      });
    }
  });

  return items;
});

export function filterMaterialPickerItems(searchText: string): MaterialPickerItem[] {
  const query = searchText.trim().toLowerCase();
  if (!query) {
    return MATERIAL_PICKER_ITEMS;
  }

  const results: MaterialPickerItem[] = [];
  let currentColumnHeader: MaterialPickerItem | null = null;
  let currentSubheader: MaterialPickerItem | null = null;
  let emittedColumnKey = '';
  let emittedSubheaderKey = '';

  MATERIAL_PICKER_ITEMS.forEach(item => {
    if (item.section) {
      if (item.key.startsWith('column:')) {
        currentColumnHeader = item;
        currentSubheader = null;
        emittedColumnKey = '';
        emittedSubheaderKey = '';
      } else {
        currentSubheader = item;
        emittedSubheaderKey = '';
      }
      return;
    }

    if (!`${item.label} ${item.spec}`.toLowerCase().includes(query)) {
      return;
    }

    if (currentColumnHeader && emittedColumnKey !== currentColumnHeader.key) {
      results.push(currentColumnHeader);
      emittedColumnKey = currentColumnHeader.key;
    }

    if (currentSubheader && emittedSubheaderKey !== currentSubheader.key) {
      results.push(currentSubheader);
      emittedSubheaderKey = currentSubheader.key;
    }

    results.push(item);
  });

  return results;
}
