export const SECTION_HEADER_LABELS = new Set([
    'TIMBER BOARDS',
    'SCAFFOLD CLIPS',
    'SCAFFOLD TUBE',
    'SCAFFOLD STAIRS',
    'LADDER HATCHES',
    'SALE ITEMS'
]);

export const PICKING_CARD_ROWS = [
    { id: 'r09', left: ['STANDARDS', '3.0M'], middle: ['HARDWOOD SOLE BOARDS', '0.5M'], right: ['SCAFFOLD LADDER', '6.0M'] },
    { id: 'r09a', left: ['', ''], middle: ['', ''], right: ['SCAFFOLD LADDER', '5.4M'] },
    { id: 'r10', left: ['STANDARDS', '2.5M'], middle: ['HARDWOOD SOLE BOARDS', '1.5M'], right: ['SCAFFOLD LADDER', '4.8M'] },
    { id: 'r10a', left: ['', ''], middle: ['', ''], right: ['SCAFFOLD LADDER', '4.2M'] },
    { id: 'r11', left: ['STANDARDS', '2.0M'], middle: ['SCREWJACKS', ''], right: ['SCAFFOLD LADDER', '3.6M'] },
    { id: 'r12', left: ['STANDARDS', '1.5M'], middle: ['U HEAD JACK', ''], right: ['SCAFFOLD LADDER', '3M'] },
    { id: 'r13', left: ['STANDARDS', '1.0M'], middle: ['SWIVEL JACK', ''], right: ['SCAFFOLD LADDER', '2.4M'] },
    { id: 'r14', left: ['STANDARDS', '0.5M'], middle: ['TIMBER BOARDS', ''], right: ['LADDER HATCHES', ''] },
    { id: 'r15', left: ['STANDARD INTERMEDIATE', '2M LOCK'], middle: ['TIMBER BOARDS', '3.6M'], right: ['CORNER BRACKET', '1 X 2'] },
    { id: 'r16', left: ['OPEN END', '3.0M'], middle: ['TIMBER BOARDS', '3.0M'], right: ['CORNER BRACKET', '2 X 2'] },
    { id: 'r17', left: ['OPEN END', '2.5M'], middle: ['TIMBER BOARDS', '2.4M'], right: ['CORNER BRACKET', '2 X 3'] },
    { id: 'r18', left: ['OPEN END', '2.0M'], middle: ['TIMBER BOARDS', '1.8M'], right: ['HANDRAIL POST (STANDARD)', '1M'] },
    { id: 'r19', left: ['OPEN END', '1.5M'], middle: ['TIMBER BOARDS', '1.5M'], right: ['HANDRAIL TIE POST', '0.75'] },
    { id: 'r20', left: ['OPEN END', '1.0M'], middle: ['TIMBER BOARDS', '1.2M'], right: ['HANDRAIL TIE POST', '0.3'] },
    { id: 'r21', left: ['STANDARD 1 STAR OPEN END', '0.5M'], middle: ['SCAFFOLD CLIPS', ''], right: ['WALL TIE BRACKETS', ''] },
    { id: 'r22', left: ['LEDGERS', '2.4M'], middle: ['DOUBLE CLIP 90 DEGREES', ''], right: ['WALL TIE DOUBLE', ''] },
    { id: 'r23', left: ['LEDGERS', '1.8M'], middle: ['DOUBLE SAFETY', ''], right: ['WALL TIE SAFETY', ''] },
    { id: 'r24', left: ['LEDGERS', '1.2M'], middle: ['SWIVEL', ''], right: ['LADDER BEAMS', '6.3'] },
    { id: 'r25', left: ['LEDGERS', '9.5M'], middle: ['SWIVEL SAFETY', ''], right: ['LADDER BEAMS', '5m'] },
    { id: 'r26', left: ['LEDGERS', '0.7M'], middle: ['PUTLOG CLIPS', ''], right: ['LADDER BEAMS', '4.2'] },
    { id: 'r27', left: ['LEDGERS', '1 BOARD'], middle: ['JOINERS INTERNAL / EXTERNAL', ''], right: ['LADDER BEAMS', '3.0M'] },
    { id: 'r28', left: ['TRANSOMS', '2.4M'], middle: ['BEAM CLAMPS', ''], right: ['PALLET CAGE', ''] },
    { id: 'r29', left: ['TRANSOMS', '1.8M'], middle: ['TOE BOARD CLIPS', ''], right: ['PALLETS', ''] },
    { id: 'r30', left: ['TRANSOMS', '1.2M'], middle: ['COUPLER CLIPS', ''], right: ['PALLET CASTOR', ''] },
    { id: 'r31', left: ['TRANSOMS', '9.50M'], middle: ['TOE BOARD SPADES', ''], right: ['UNIT BEAMS', ''] },
    { id: 'r32', left: ['TRANSOMS', '0.7M'], middle: ['V CLIPS', ''], right: ['UNIT BEAMS', ''] },
    { id: 'r33', left: ['TRANSOMS 2 BOARD', '0.51M'], middle: ['', ''], right: ['UNIT BEAMS', ''] },
    { id: 'r34', left: ['TRANSOMS 2 BOARD', '0.48M'], middle: ['', ''], right: ['UNIT BEAMS', '3.6M'] },
    { id: 'r35', left: ['TRANSOMS 1 BOARD', '1 BOARD'], middle: ['SCAFFOLD TUBE', ''], right: ['TRANSOM TRUSS', '2.4M'] },
    { id: 'r36', left: ['LADDER TRANSOMS', ''], middle: ['SCAFFOLD TUBE', '6.0M'], right: ['TRANSOM TRUSS', '1.8M'] },
    { id: 'r37', left: ['LADDER TRANSOMS', '1.2M'], middle: ['SCAFFOLD TUBE', '5.4M'], right: ['TRANSOM TRUSS', '1.2M'] },
    { id: 'r38', left: ['DIAGONAL BRACES', '3.6M'], middle: ['SCAFFOLD TUBE', '4.8M'], right: ['LAP PLATES', '2 BOARD'] },
    { id: 'r39', left: ['DIAGONAL BRACES', '3.2M'], middle: ['SCAFFOLD TUBE', '4.2M'], right: ['LAP PLATES', '3 BOARD'] },
    { id: 'r40', left: ['DIAGONAL BRACES', '2.7M'], middle: ['SCAFFOLD TUBE', '3.6M'], right: ['CASTOR WHEELS', ''] },
    { id: 'r41', left: ['DIAGONAL BRACES', '1.9M'], middle: ['SCAFFOLD TUBE', '3.0M'], right: ['SALE ITEMS', ''] },
    { id: 'r42', left: ['STEEL BOARDS', '2.4M'], middle: ['2.4', 'M'], right: ['CHAIN/SHADE BLUE', '15M'] },
    { id: 'r43', left: ['STEEL BOARDS', '1.8M'], middle: ['1.8', 'M'], right: ['CHAIN/SHADE GREEN', '15M'] },
    { id: 'r44', left: ['STEEL BOARDS', '1.2M'], middle: ['1.5', 'M'], right: ['CHAIN/SHADE BLACK', '15M'] },
    { id: 'r45', left: ['STEEL BOARDS', '0.95M'], middle: ['1.2', 'M'], right: ['CHAIN/SHADE', '0.9 mm'] },
    { id: 'r46', left: ['STEEL BOARDS', '0.745'], middle: ['0.9', 'mm'], right: ['CHAIN WIRE 15M / SHADE 50M', ''] },
    { id: 'r47', left: ['INFILL BOARDS', '2.4M'], middle: ['SCAFFOLD TUBE', '0.6MM'], right: ['SCREW BOLTS 100MM', '12MM'] },
    { id: 'r48', left: ['INFILL BOARDS', '1.8M'], middle: ['SCAFFOLD TUBE', '0.3MM'], right: ['SCREW BOLTS 75MM', '12MM'] },
    { id: 'r49', left: ['INFILL BOARDS', '1.2M'], middle: ['SCAFFOLD STAIRS', ''], right: ['TECH SCREWS', '90MM'] },
    { id: 'r50', left: ['HOP-UP 3 SPIGOTS', ''], middle: ['ALUMINIUM STAIRS', ''], right: ['TECH SCREWS', '45MM'] },
    { id: 'r51', left: ['HOP-UP 2 SPIGOTS', ''], middle: ['ALUMINIUM HANDRAIL', ''], right: ['TECH SCREWS TIMBER', '45MM'] },
    { id: 'r52', left: ['HOP-UP BRACKETS 3', '3 BOARD'], middle: ['ALUMINIUM TOP RAIL', ''], right: ['PLYWOOD 17MM / 12MM', ''] },
    { id: 'r53', left: ['HOP-UP BRACKETS 2', '2 BOARD'], middle: ['STAIR BOLTS', ''], right: ['3/2 TIMBERS', ''] },
    { id: 'r54', left: ['HOP-UP BRACKETS 1', '1 BOARD'], middle: ['STAIR STRINGER', ''], right: ['TIE WIRE', ''] },
    { id: 'r55', left: ['TIE BARS', '2.4M'], middle: ['1 BOARD STEP DOWNS', '1 BOARD'], right: ['INCOMPLETE SIGNS', ''] },
    { id: 'r56', left: ['TIE BARS', '1.8M'], middle: ['2 BOARD STEP DOWNS', '2 BOARD'], right: ['SCAFF TAGS', ''] },
    { id: 'r57', left: ['TIE BARS', '1.2M'], middle: ['ALUMINIUM STAIR RISER', '2.0M'], right: ['M20 TREAD ROD', ''] },
    { id: 'r58', left: ['TIE BARS', '0.745'], middle: ['ALUMINIUM STAIR RISER', '1.0M'], right: ['UNIT BEAM BRACKETS', ''] },
    { id: 'r59', left: ['LEDGER', '3.0M'], middle: ['STAIR BOLTS', ''], right: ['', ''] },
    { id: 'r60', left: ['STEEL BOARDS', '3M'], middle: ['STAIR DOOR', ''], right: ['', ''] }
];

export function quantityKey(rowId, side) {
    return `${rowId}_${side}_qty`;
}

export function formatDayLabel(dateValue) {
    if (!dateValue) return '';
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-AU', { weekday: 'long' });
}

export function getMaterialDisplayLabel(label) {
    const value = String(label || '').trim();
    const upper = value.toUpperCase();
    if (upper === 'OPEN END') return 'OPEN END STANDARDS';
    if (upper === 'HOP-UP 3 SPIGOTS') return '3-BOARD HOP-UP WITH SPIGOT';
    if (upper === 'HOP-UP 2 SPIGOTS') return '2-BOARD HOP-UP WITH SPIGOT';
    if (upper === 'HOP-UP BRACKETS 3') return '3-BOARD HOP-UP';
    if (upper === 'HOP-UP BRACKETS 2') return '2-BOARD HOP-UP';
    if (upper === 'HOP-UP BRACKETS 1') return '1-BOARD HOP-UP';
    return value;
}

export function shouldSkipMaterialEntry(label, spec) {
    return /^\d+(?:\.\d+)?$/.test(String(label || '').trim()) && ['M', 'MM'].includes(String(spec || '').trim().toUpperCase());
}

function formatMetricNumber(value) {
    const numericValue = Number.parseFloat(value);
    if (!Number.isFinite(numericValue)) return value;
    return Number.isInteger(numericValue) ? numericValue.toFixed(1) : String(numericValue);
}

function formatCompactNumber(value) {
    const numericValue = Number.parseFloat(value);
    return Number.isFinite(numericValue) ? String(numericValue) : value;
}

export function normalizeMaterialSpec(spec) {
    const value = String(spec || '').trim();
    if (!value) return '';

    const compact = value.replace(/\s+/g, ' ');
    const metreMatch = compact.match(/^(\d+(?:\.\d+)?)\s*m$/i);
    if (metreMatch) return `${formatMetricNumber(metreMatch[1])}m`;

    const bareMetreMatch = compact.match(/^(\d+(?:\.\d+)?)$/);
    if (bareMetreMatch) return `${formatMetricNumber(bareMetreMatch[1])}m`;

    const metreWithSuffixMatch = compact.match(/^(\d+(?:\.\d+)?)\s*m\s+(.+)$/i);
    if (metreWithSuffixMatch) {
        return `${formatMetricNumber(metreWithSuffixMatch[1])}m ${metreWithSuffixMatch[2].toLowerCase()}`;
    }

    const millimetreMatch = compact.match(/^(\d+(?:\.\d+)?)\s*mm$/i);
    if (millimetreMatch) return `${formatCompactNumber(millimetreMatch[1])}mm`;

    return compact.replace(/\s*x\s*/gi, ' x ');
}

export function isSectionHeaderEntry(entry) {
    const normalizedLabel = (entry?.[0] || '').trim().toUpperCase();
    return SECTION_HEADER_LABELS.has(normalizedLabel) && !entry?.[1];
}
