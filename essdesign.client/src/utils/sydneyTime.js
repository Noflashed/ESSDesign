export const SYDNEY_TIME_ZONE = 'Australia/Sydney';

const sydneyPartsFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
});

const isDateOnly = value => (
    /^\d{4}-\d{1,2}-\d{1,2}$/.test(String(value || '').trim())
    || /^\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})$/.test(String(value || '').trim())
);

const partValue = (parts, type) => Number(parts.find(part => part.type === type)?.value || 0);

const getSydneyParts = date => {
    const parts = sydneyPartsFormatter.formatToParts(date);
    return {
        year: partValue(parts, 'year'),
        month: partValue(parts, 'month'),
        day: partValue(parts, 'day'),
        hour: partValue(parts, 'hour'),
        minute: partValue(parts, 'minute'),
        second: partValue(parts, 'second')
    };
};

const sydneyOffsetMilliseconds = date => {
    const parts = getSydneyParts(date);
    const roundedInstant = Math.floor(date.getTime() / 1000) * 1000;
    return Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
    ) - roundedInstant;
};

const dateFromSydneyParts = ({ year, month, day, hour = 0, minute = 0, second = 0 }) => {
    const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    let candidate = new Date(wallClockAsUtc);
    candidate = new Date(wallClockAsUtc - sydneyOffsetMilliseconds(candidate));
    // Re-check after applying the first offset because the requested wall clock
    // may sit on the other side of a daylight-saving boundary.
    return new Date(wallClockAsUtc - sydneyOffsetMilliseconds(candidate));
};

export const parseSydneyDate = value => {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value);
    }
    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const text = String(value || '').trim();
    if (!text) return null;

    // An explicit offset or trailing Z identifies an exact instant and must not
    // be reinterpreted as a Sydney wall-clock value.
    if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
        const date = new Date(text);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):?(\d{2})?(?::?(\d{2}))?\s*(am|pm)?)?$/i);
    if (isoMatch) {
        const [, year, month, day, hourText = '0', minute = '0', second = '0', period = ''] = isoMatch;
        let hour = Number(hourText);
        if (period.toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (period.toLowerCase() === 'am' && hour === 12) hour = 0;
        return dateFromSydneyParts({
            year: Number(year),
            month: Number(month),
            day: Number(day),
            hour,
            minute: Number(minute),
            second: Number(second)
        });
    }

    const localMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i);
    if (localMatch) {
        const [, day, month, yearText, hourText = '0', minute = '0', second = '0', period = ''] = localMatch;
        const year = Number(yearText) < 100 ? 2000 + Number(yearText) : Number(yearText);
        let hour = Number(hourText);
        if (period.toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (period.toLowerCase() === 'am' && hour === 12) hour = 0;
        return dateFromSydneyParts({
            year,
            month: Number(month),
            day: Number(day),
            hour,
            minute: Number(minute),
            second: Number(second)
        });
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const formatSydneyDate = value => {
    const date = parseSydneyDate(value);
    if (!date) return '-';
    return new Intl.DateTimeFormat('en-AU', {
        timeZone: SYDNEY_TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
};

export const formatSydneyDateTime = value => {
    const date = parseSydneyDate(value);
    if (!date) return '-';
    if (isDateOnly(value)) return formatSydneyDate(value);
    return new Intl.DateTimeFormat('en-AU', {
        timeZone: SYDNEY_TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    }).format(date);
};

export const inspectionTimestamp = record => (
    record?.inspectedAt
    || [record?.date, record?.time].map(value => String(value || '').trim()).filter(Boolean).join(' ')
);

export const addSydneyMonths = (value, months) => {
    const date = parseSydneyDate(value);
    if (!date) return null;
    const parts = getSydneyParts(date);
    const shifted = new Date(Date.UTC(
        parts.year,
        parts.month - 1 + months,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
    ));
    return dateFromSydneyParts({
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds()
    });
};
