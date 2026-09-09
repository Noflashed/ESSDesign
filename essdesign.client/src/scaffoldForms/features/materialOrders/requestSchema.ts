// Derived from ESSApp/src/features/materialOrders/requestSchema.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
export type ItemSide = 'left' | 'middle' | 'right';

export type PickingCardRow = {
  id: string;
  left: [string, string];
  middle: [string, string];
  right: [string, string];
};

export const SECTION_HEADER_LABELS = new Set([
  'TIMBER BOARDS',
  'SCAFFOLD CLIPS',
  'SCAFFOLD TUBE',
  'SCAFFOLD STAIRS',
  'LADDER HATCHES',
  'SALE ITEMS',
  'LEDGERS',
  'TRANSOMS',
  'DIAGONAL BRACING',
  'STEEL BOARDS',
  'INFILL BOARDS',
  'HOP-UPS',
  'TIE BARS',
  'LADDERS',
  'CORNER BRACKETS',
]);

export const PICKING_CARD_ROWS: PickingCardRow[] = [
  {id: 'h_ladders', left: ['', ''], middle: ['', ''], right: ['LADDERS', '']},
  {id: 'r09', left: ['STANDARDS', '3.0M'], middle: ['HARDWOOD SOLE BOARDS', '0.5M'], right: ['LADDER', '6.0M']},
  {id: 'r10', left: ['STANDARDS', '2.5M'], middle: ['HARDWOOD SOLE BOARDS', '1.5M'], right: ['LADDER', '5.4M']},
  {id: 'r11', left: ['STANDARDS', '2.0M'], middle: ['SCREW JACKS', ''], right: ['LADDER', '4.8M']},
  {id: 'r12', left: ['STANDARDS', '1.5M'], middle: ['U HEAD JACK', ''], right: ['LADDER', '4.2M']},
  {id: 'r13', left: ['STANDARDS', '1.0M'], middle: ['SWIVEL JACK', ''], right: ['LADDER', '3.6M']},
  {id: 'r14', left: ['STANDARDS', '0.5M'], middle: ['TIMBER BOARDS', ''], right: ['LADDER', '3.0M']},
  {id: 'r15', left: ['INTERMEDIATE STANDARD', '2.0M'], middle: ['TIMBER BOARDS', '3.6M'], right: ['LADDER', '2.4M']},
  {id: 'r16', left: ['STANDARD OPEN/END', '3.0M'], middle: ['TIMBER BOARDS', '3.0M'], right: ['', '']},
  {id: 'r17', left: ['STANDARD OPEN/END', '2.5M'], middle: ['TIMBER BOARDS', '2.4M'], right: ['LADDER HATCHES', '']},
  {id: 'h_corner', left: ['', ''], middle: ['', ''], right: ['CORNER BRACKETS', '']},
  {id: 'r18', left: ['STANDARD OPEN/END', '2.0M'], middle: ['TIMBER BOARDS', '1.8M'], right: ['CORNER BRACKET', '1 X 2']},
  {id: 'r19', left: ['STANDARD OPEN/END', '1.5M'], middle: ['TIMBER BOARDS', '1.5M'], right: ['CORNER BRACKET', '2 X 2']},
  {id: 'r20', left: ['STANDARD OPEN/END', '1.0M'], middle: ['TIMBER BOARDS', '1.2M'], right: ['CORNER BRACKET', '2 X 3']},
  {id: 'r21', left: ['STANDARD OPEN/END', '0.5M'], middle: ['SCAFFOLD CLIPS', ''], right: ['HANDRAIL POST', '1M']},
  {id: 'h_ledgers', left: ['LEDGERS', ''], middle: ['', ''], right: ['', '']},
  {id: 'r22', left: ['LEDGERS', '3.0M'], middle: ['DOUBLE COUPLER', ''], right: ['HANDRAIL TIE POST', '0.75M']},
  {id: 'r23', left: ['LEDGERS', '2.4M'], middle: ['', ''], right: ['HANDRAIL TIE POST', '0.3M']},
  {id: 'r24', left: ['LEDGERS', '1.8M'], middle: ['SWIVEL COUPLER', ''], right: ['WALL TIE BRACKETS', '']},
  {id: 'r25', left: ['LEDGERS', '1.2M'], middle: ['', ''], right: ['', '']},
  {id: 'r26', left: ['LEDGERS', '9.5M'], middle: ['PUTLOG CLIPS', ''], right: ['', '']},
  {id: 'r27', left: ['LEDGERS', '0.7M'], middle: ['JOINERS INTERNAL / EXTERNAL', ''], right: ['LADDER BEAMS', '6.3M']},
  {id: 'r28', left: ['LEDGERS', '1 BOARD'], middle: ['BEAM CLAMPS', ''], right: ['LADDER BEAMS', '5M']},
  {id: 'h_transoms', left: ['TRANSOMS', ''], middle: ['', ''], right: ['', '']},
  {id: 'r29', left: ['TRANSOMS', '2.4M'], middle: ['TOE BOARD CLIPS', ''], right: ['LADDER BEAMS', '4.2M']},
  {id: 'r30', left: ['TRANSOMS', '1.8M'], middle: ['CC CLIPS', ''], right: ['LADDER BEAMS', '3.0M']},
  {id: 'r31', left: ['TRANSOMS', '1.2M'], middle: ['TOE BOARD SPADES', ''], right: ['PALLET CAGE', '']},
  {id: 'r32', left: ['TRANSOMS', '9.5M'], middle: ['V CLIPS', ''], right: ['PALLETS', '']},
  {id: 'r33', left: ['TRANSOMS', '0.7M'], middle: ['', ''], right: ['PALLET CASTOR', '']},
  {id: 'r34', left: ['TRANSOMS 2 BOARD', '2 BOARD'], middle: ['', ''], right: ['UNIT BEAMS', '3.6M']},
  {id: 'r35', left: ['TRANSOMS 1 BOARD', '1 BOARD'], middle: ['', ''], right: ['TRUSS TRANSOM', '2.4M']},
  {id: 'r36', left: ['LADDER TRANSOM', ''], middle: ['SCAFFOLD TUBE', '6.0M'], right: ['TRUSS TRANSOM', '1.8M']},
  {id: 'r37', left: ['LADDER TRANSOM', '1.2M'], middle: ['SCAFFOLD TUBE', '5.4M'], right: ['TRUSS TRANSOM', '1.2M']},
  {id: 'h_diagonal', left: ['DIAGONAL BRACING', ''], middle: ['SCAFFOLD TUBE', ''], right: ['', '']},
  {id: 'r38', left: ['DIAGONAL BRACE', '3.6M'], middle: ['SCAFFOLD TUBE', '4.8M'], right: ['2 BOARD LAP PLATES', '']},
  {id: 'r39', left: ['DIAGONAL BRACE', '3.2M'], middle: ['SCAFFOLD TUBE', '4.2M'], right: ['3 BOARD LAP PLATES', '']},
  {id: 'r40', left: ['DIAGONAL BRACE', '2.7M'], middle: ['SCAFFOLD TUBE', '3.6M'], right: ['CASTOR WHEELS', '']},
  {id: 'r41', left: ['DIAGONAL BRACE', '1.9M'], middle: ['SCAFFOLD TUBE', '3.0M'], right: ['SALE ITEMS', '']},
  {id: 'h_steel', left: ['STEEL BOARDS', ''], middle: ['', ''], right: ['', '']},
  {id: 'r42', left: ['STEEL BOARDS', '3.0M'], middle: ['SCAFFOLD TUBE', '2.4M'], right: ['CHAIN/SHADE BLUE', '']},
  {id: 'r43', left: ['STEEL BOARDS', '2.4M'], middle: ['SCAFFOLD TUBE', '1.8M'], right: ['CHAIN/SHADE GREEN', '']},
  {id: 'r44', left: ['STEEL BOARDS', '1.8M'], middle: ['SCAFFOLD TUBE', '1.5M'], right: ['CHAIN/SHADE BLACK', '']},
  {id: 'r45', left: ['STEEL BOARDS', '1.2M'], middle: ['SCAFFOLD TUBE', '1.2M'], right: ['CHAIN/SHADE', '']},
  {id: 'r46', left: ['STEEL BOARDS', '0.95M'], middle: ['SCAFFOLD TUBE', '0.9M'], right: ['', '']},
  {id: 'r47', left: ['STEEL BOARDS', '0.745'], middle: ['SCAFFOLD TUBE', '0.6M'], right: ['100MM SCREW BOLTS', '']},
  {id: 'h_infill', left: ['INFILL BOARDS', ''], middle: ['', ''], right: ['', '']},
  {id: 'r48', left: ['INFILL BOARDS', '2.4M'], middle: ['SCAFFOLD TUBE', '0.3M'], right: ['75MM SCREW BOLTS', '']},
  {id: 'r49', left: ['INFILL BOARDS', '1.8M'], middle: ['SCAFFOLD STAIRS', ''], right: ['TECH SCREWS', '90MM']},
  {id: 'r50', left: ['INFILL BOARDS', '1.2M'], middle: ['ALUMINIUM STAIRS', ''], right: ['TECH SCREWS', '45MM']},
  {id: 'h_hopups', left: ['HOP-UPS', ''], middle: ['', ''], right: ['', '']},
  {id: 'r51', left: ['3-BOARD HOP-UP WITH SPIGOT', ''], middle: ['ALUMINIUM HANDRAIL', ''], right: ['', '']},
  {id: 'r52', left: ['2-BOARD HOP-UP WITH SPIGOT', ''], middle: ['ALUMINIUM TOP RAIL', ''], right: ['17MM PLYWOOD', '']},
  {id: 'r53', left: ['3-BOARD HOP-UP', ''], middle: ['STAIR BOLTS', ''], right: ['12MM PLYWOOD', '']},
  {id: 'r54', left: ['2-BOARD HOP-UP', ''], middle: ['STAIR STRINGER', ''], right: ['TIE WIRE', '']},
  {id: 'r55', left: ['1-BOARD HOP-UP', ''], middle: ['1-BOARD STEP DOWN', '1 BOARD'], right: ['INCOMPLETE SIGNS', '']},
  {id: 'h_tiebars', left: ['TIE BARS', ''], middle: ['', ''], right: ['', '']},
  {id: 'r56', left: ['TIE BARS', '2.4M'], middle: ['2-BOARD STEP-DOWN', '2 BOARD'], right: ['SCAFF TAGS', '']},
  {id: 'r57', left: ['TIE BARS', '1.8M'], middle: ['ALUMINIUM STAIR', '2.0M'], right: ['', '']},
  {id: 'r58', left: ['TIE BARS', '1.2M'], middle: ['ALUMINIUM STAIR', '1.0M'], right: ['', '']},
  {id: 'r59', left: ['TIE BARS', '0.7M'], middle: ['STAIR BOLTS', ''], right: ['', '']},
  {id: 'r60', left: ['', ''], middle: ['STAIR DOOR', ''], right: ['', '']},
];

export function quantityKey(rowId: string, side: ItemSide): string {
  return `${rowId}_${side}_qty`;
}

export function formatDayLabel(dateValue: string): string {
  if (!dateValue) {
    return '';
  }
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString('en-AU', {weekday: 'long'});
}

export function isSectionHeaderEntry(entry: [string, string]): boolean {
  const normalizedLabel = (entry[0] || '').trim().toUpperCase();
  return SECTION_HEADER_LABELS.has(normalizedLabel) && !entry[1];
}
