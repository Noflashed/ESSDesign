using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ESSDesign.Server.Services;

/// <summary>
/// The Drawing Register's numbering rules, the same as the Add Row form in DrawingRegisterPage.jsx:
/// BUILDER-PROJECT-ESD####, with the builder and project codes most used by existing rows (or derived
/// from the names) and the next sequence number after the highest in the whole register.
/// </summary>
public static class DrawingRegisterNumbers
{
    public static readonly string[] DesignUses = ["CONSTRUCTION", "PRELIMINARY", "CONCEPT", "AS-BUILT"];

    private static readonly HashSet<string> IgnoredCodeWords = new(StringComparer.Ordinal)
    {
        "the", "and", "pty", "ltd", "limited", "construction", "constructions", "group", "development", "project", "projects"
    };

    private static readonly Regex FullNumber = new(@"^([A-Z0-9]+)-([A-Z0-9]+)-ESD(\d+)$", RegexOptions.IgnoreCase);
    private static readonly Regex TrailingDigits = new(@"(\d+)$");

    public static string NormalizeName(string? value) =>
        Regex.Replace((value ?? string.Empty).Trim().ToLowerInvariant(), "[^a-z0-9]+", " ");

    public static string CleanName(string? value) => Regex.Replace((value ?? string.Empty).Trim(), @"\s+", " ");

    public static string DeriveCode(string? name)
    {
        var normalized = NormalizeName(name);
        var words = normalized.Split(' ')
            .Where(word => word.Length > 0 && !IgnoredCodeWords.Contains(word) && Regex.IsMatch(word, "[a-z]"))
            .ToList();
        if (words.Count >= 3) return string.Concat(words.Take(3).Select(word => word[0])).ToUpperInvariant();
        var source = words.FirstOrDefault() ?? normalized.Replace(" ", string.Empty);
        var code = source.Length > 3 ? source[..3] : source;
        return code.ToUpperInvariant().PadRight(3, 'X');
    }

    /// <summary>The most frequent code; on a tie, the one seen first (as the web form's Map ordering does).</summary>
    public static string MostCommonCode(IEnumerable<string?> codes)
    {
        var counts = new List<(string Code, int Count)>();
        foreach (var code in codes)
        {
            if (string.IsNullOrEmpty(code)) continue;
            var index = counts.FindIndex(item => item.Code == code);
            if (index < 0) counts.Add((code, 1));
            else counts[index] = (code, counts[index].Count + 1);
        }
        var best = (Code: string.Empty, Count: 0);
        foreach (var item in counts)
        {
            if (item.Count > best.Count) best = item;
        }
        return best.Code;
    }

    public static (string BuilderCode, string ProjectCode)? Parse(string? drawingNo)
    {
        var match = FullNumber.Match((drawingNo ?? string.Empty).Trim());
        return match.Success ? (match.Groups[1].Value.ToUpperInvariant(), match.Groups[2].Value.ToUpperInvariant()) : null;
    }

    public static long Sequence(string? drawingNo)
    {
        var match = TrailingDigits.Match((drawingNo ?? string.Empty).Trim());
        return match.Success && long.TryParse(match.Groups[1].Value, out var value) ? value : long.MinValue;
    }

    public sealed record Row(string Client, string Project, string DrawingNo);

    public static string Next(IReadOnlyCollection<Row> rows, string client, string project)
    {
        var clientKey = NormalizeName(client);
        var projectKey = NormalizeName(project);
        var clientRows = rows.Where(row => NormalizeName(row.Client) == clientKey).ToList();
        var builderCode = MostCommonCode(clientRows.Select(row => Parse(row.DrawingNo)?.BuilderCode));
        if (builderCode.Length == 0) builderCode = DeriveCode(client);
        var projectCode = MostCommonCode(clientRows
            .Where(row => NormalizeName(row.Project) == projectKey)
            .Select(row => Parse(row.DrawingNo)?.ProjectCode));
        if (projectCode.Length == 0) projectCode = DeriveCode(project);
        var highest = rows.Select(row => Sequence(row.DrawingNo)).Append(0).Max();
        return $"{builderCode}-{projectCode}-ESD{(highest + 1).ToString(CultureInfo.InvariantCulture).PadLeft(4, '0')}";
    }

    public static List<Row> Rows(JsonElement document)
    {
        var rows = new List<Row>();
        if (document.ValueKind != JsonValueKind.Object
            || !document.TryGetProperty("drawingRegisterEntries", out var entries)
            || entries.ValueKind != JsonValueKind.Array)
        {
            return rows;
        }
        foreach (var entry in entries.EnumerateArray())
        {
            rows.Add(new Row(Text(entry, "client"), Text(entry, "project"), Text(entry, "drawingNo")));
        }
        return rows;
    }

    /// <summary>The register's design use for what was said (CON, construction, as built...), or "".</summary>
    public static string DesignUse(string? value)
    {
        var status = Regex.Replace((value ?? string.Empty).Trim().ToUpperInvariant(), @"[\s_]+", " ").Replace("AS BUILT", "AS-BUILT");
        return status switch
        {
            "CON" or "CONSTRUCTION" or "CONSTRICTION" or "FOR CONSTRUCTION" => "CONSTRUCTION",
            "PRE" or "PRELIMINARY" => "PRELIMINARY",
            "ASB" or "AS-BUILT" or "AS-BULT" => "AS-BUILT",
            "CONC" or "CONCEPT" or "CONCEPT ONLY" or "CONCEPTUAL" => "CONCEPT",
            _ => string.Empty
        };
    }

    /// <summary>dd/MM/yyyy, as the register stores it, from ISO or day-first dates; "" when invalid.</summary>
    public static string DateIssued(string? value)
    {
        var text = (value ?? string.Empty).Trim();
        int day, month, year;
        var iso = Regex.Match(text, @"^(\d{4})-(\d{1,2})-(\d{1,2})$");
        var local = Regex.Match(text, @"^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$");
        if (iso.Success)
        {
            (year, month, day) = (int.Parse(iso.Groups[1].Value), int.Parse(iso.Groups[2].Value), int.Parse(iso.Groups[3].Value));
        }
        else if (local.Success)
        {
            (day, month, year) = (int.Parse(local.Groups[1].Value), int.Parse(local.Groups[2].Value), int.Parse(local.Groups[3].Value));
        }
        else
        {
            return string.Empty;
        }
        if (year < 100) year += 2000;
        if (month is < 1 or > 12 || day < 1 || day > DateTime.DaysInMonth(year, month)) return string.Empty;
        return $"{day:00}/{month:00}/{year}";
    }

    public static string Today()
    {
        try
        {
            var sydney = TimeZoneInfo.FindSystemTimeZoneById("Australia/Sydney");
            var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, sydney);
            return $"{now.Day:00}/{now.Month:00}/{now.Year}";
        }
        catch (Exception)
        {
            var now = DateTime.UtcNow;
            return $"{now.Day:00}/{now.Month:00}/{now.Year}";
        }
    }

    public static string Text(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value)
            ? value.ValueKind switch
            {
                JsonValueKind.String => value.GetString() ?? string.Empty,
                JsonValueKind.Number => value.ToString(),
                _ => string.Empty
            }
            : string.Empty;
}
