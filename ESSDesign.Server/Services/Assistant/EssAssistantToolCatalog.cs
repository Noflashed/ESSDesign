using System.Globalization;
using System.Text.Json;

namespace ESSDesign.Server.Services.Assistant;

public sealed class EssAssistantToolCatalog
{
    private readonly EssAssistantDataService _data;

    public EssAssistantToolCatalog(EssAssistantDataService data)
    {
        _data = data;
    }

    public IReadOnlyList<object> GetDefinitions(
        EssAssistantAccessContext access,
        IReadOnlySet<string>? allowedNames = null)
    {
        var tools = new List<object>
        {
            Function("search_ess", "Search multiple ESS business domains at once. Use this to discover which exact records exist before answering broad or ambiguous questions.", new
            {
                query = StringSchema("Words, names, identifiers, locations, or drawing numbers to find."),
                domains = ArraySchema("Domains to search: all, sites, people, designs, drawing_register, project_data, materials, transport, or news."),
                limit = IntegerSchema("Maximum matches per domain, from 1 to 12."),
            }, "query", "domains", "limit"),
            Function("search_sites", "Search the universal ESS builder and project site registry, including locations, site assignments, inducted crew counts, and drawing numbers.", new
            {
                query = NullableStringSchema("Builder, project, location, or drawing number. Null lists sites."),
                include_archived = BooleanSchema("Whether archived sites should be included."),
                limit = IntegerSchema("Maximum results, from 1 to 50."),
            }, "query", "include_archived", "limit"),
            Function("search_people", "Search ESS employees and users. Contact and private fields are automatically redacted according to the current user's role.", new
            {
                query = NullableStringSchema("Person name, email, phone, title, or role. Null lists people."),
                role = NullableStringSchema("Optional account role or employee classification. 'Leading Hand' uses the employee registry's leading-hand flag, not only account-role text."),
                include_private_profile = BooleanSchema("Request private profile fields. They are returned only to authorised administrators."),
                limit = IntegerSchema("Maximum results, from 1 to 100."),
            }, "query", "role", "include_private_profile", "limit"),
            Function("get_roster", "Read the ESS rostering plan for a date range, including active sites and required crew. Do not describe inducted crew as confirmed assignments.", new
            {
                start_date = StringSchema("Start date in YYYY-MM-DD format."),
                days = IntegerSchema("Number of days, from 1 to 31."),
            }, "start_date", "days"),
            Function("search_designs", "Search ESS Design's nested site and scaffold folders. Results identify the parent scaffold folder separately from PDF filenames. Use the strongest site and scaffold match only; do not combine weaker partial matches.", new
            {
                query = NullableStringSchema("Drawing number, filename, folder, description, revision, or status. Null lists recent designs."),
                sort = StringSchema("Either relevance or latest."),
                all_revisions = BooleanSchema("True to return every revision; false to return the latest record per drawing."),
                limit = IntegerSchema("Maximum results, from 1 to 100."),
            }, "query", "sort", "all_revisions", "limit"),
            Function("search_drawing_register", "Search the company-wide drawing register and its linked builder and project identifiers.", new
            {
                query = NullableStringSchema("Drawing number, client, project, design type, status, or revision. Null lists the latest drawing numbers."),
                limit = IntegerSchema("Maximum results, from 1 to 200."),
            }, "query", "limit"),
            Function("search_project_data", "Search project-level SWMS, design documents, scaffold tags, handover certificates, and day-labour variations across site storage.", new
            {
                query = NullableStringSchema("Builder, project, document name, form reference, or drawing number. Null searches recent active sites."),
                kind = NullableStringSchema("Optional kind: swms, design-document, scaff-tags, handover-certificates, or day-labour-variations."),
                limit = IntegerSchema("Maximum results, from 1 to 60."),
            }, "query", "kind", "limit"),
            Function("search_material_orders", "Search material-order requests and drafts, including items, delivery status, schedule, and truck details.", new
            {
                query = NullableStringSchema("Builder, project, requester, truck, item, notes, or status. Null lists recent orders."),
                include_archived = BooleanSchema("Whether archived requests should be included."),
                limit = IntegerSchema("Maximum results, from 1 to 100."),
            }, "query", "include_archived", "limit"),
            Function("get_news", "Read current ESS company news posts.", new
            {
                query = NullableStringSchema("Title or subtitle words. Null lists the newest posts."),
                limit = IntegerSchema("Maximum results, from 1 to 50."),
            }, "query", "limit"),
            Function("get_notifications", "Read the current user's ESS notifications. Administrators may request another person or all users.", new
            {
                person = NullableStringSchema("Null for the current user, a person's name, or 'all' for administrators."),
                limit = IntegerSchema("Maximum results, from 1 to 100."),
            }, "person", "limit"),
            Function("get_weather", "Get live current weather for a location. Correct obvious place-name spelling, preserve any supplied state or postcode, and call immediately when the location is known.", new
            {
                location = StringSchema("Suburb, postcode, address, or place name. Include the Australian state or postcode when the conversation provides it."),
            }, "location"),
            Function("get_ess_overview", "Get a live, high-level count and status summary across the ESS system. Use for company-wide overview questions.", new { }),
            Function("open_ess_record", "Open a document from a prior tool result. Call this only with an exact record type and ID returned by a search tool.", new
            {
                record_type = StringSchema("design, project_data, or material_order."),
                record_id = StringSchema("Exact document or record ID returned by an ESS search tool."),
                file_type = NullableStringSchema("For designs, use ess or third_party. Otherwise null."),
            }, "record_type", "record_id", "file_type"),
        };

        if (access.CanSeeTransportOperations)
        {
            tools.Add(Function("get_transport", "Read role-restricted live truck locations, recent truck history, and route estimates.", new
            {
                query = NullableStringSchema("Truck, role, request, route, or location. Null returns all current trucks."),
                history_hours = IntegerSchema("History window in hours, from 1 to 168."),
                limit = IntegerSchema("Maximum results per section, from 1 to 100."),
            }, "query", "history_hours", "limit"));
        }

        return allowedNames == null
            ? tools
            : tools.Where(tool => allowedNames.Contains(GetDefinitionName(tool))).ToList();
    }

    public Task<EssAssistantToolResult> ExecuteAsync(
        string name,
        string argumentsJson,
        EssAssistantAccessContext access,
        CancellationToken cancellationToken)
    {
        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(argumentsJson) ? "{}" : argumentsJson);
        var args = document.RootElement;
        return name switch
        {
            "search_ess" => _data.SearchEssAsync(
                GetString(args, "query") ?? string.Empty,
                GetStrings(args, "domains"),
                GetInt(args, "limit", 6),
                access,
                cancellationToken),
            "search_sites" => _data.SearchSitesAsync(GetString(args, "query"), GetBool(args, "include_archived"), GetInt(args, "limit", 20), cancellationToken),
            "search_people" => _data.SearchPeopleAsync(GetString(args, "query"), GetString(args, "role"), GetBool(args, "include_private_profile"), GetInt(args, "limit", 20), access, cancellationToken),
            "get_roster" => _data.GetRosterAsync(GetDate(args, "start_date"), GetInt(args, "days", 7), cancellationToken),
            "search_designs" => _data.SearchDesignsAsync(GetString(args, "query"), GetString(args, "sort") ?? "relevance", GetBool(args, "all_revisions"), GetInt(args, "limit", 20), cancellationToken),
            "search_drawing_register" => _data.SearchDrawingRegisterAsync(GetString(args, "query"), GetInt(args, "limit", 30), cancellationToken),
            "search_project_data" => _data.SearchProjectDataAsync(GetString(args, "query"), GetString(args, "kind"), GetInt(args, "limit", 20), cancellationToken),
            "search_material_orders" => _data.SearchMaterialOrdersAsync(GetString(args, "query"), GetBool(args, "include_archived"), GetInt(args, "limit", 20), cancellationToken),
            "get_transport" => _data.GetTransportAsync(GetString(args, "query"), GetInt(args, "history_hours", 24), GetInt(args, "limit", 20), access, cancellationToken),
            "get_news" => _data.GetNewsAsync(GetString(args, "query"), GetInt(args, "limit", 20), cancellationToken),
            "get_notifications" => _data.GetNotificationsAsync(GetString(args, "person"), GetInt(args, "limit", 30), access, cancellationToken),
            "get_weather" => _data.GetCurrentWeatherAsync(GetString(args, "location") ?? string.Empty, cancellationToken),
            "get_ess_overview" => _data.GetOverviewAsync(cancellationToken),
            "open_ess_record" => _data.OpenRecordAsync(GetString(args, "record_type") ?? string.Empty, GetString(args, "record_id") ?? string.Empty, GetString(args, "file_type"), cancellationToken),
            _ => Task.FromResult(new EssAssistantToolResult { Data = new { error = $"Unknown ESS assistant tool: {name}" } }),
        };
    }

    private static object Function(string name, string description, object properties, params string[] required) => new
    {
        type = "function",
        name,
        description,
        strict = true,
        parameters = new
        {
            type = "object",
            properties,
            required,
            additionalProperties = false,
        },
    };

    private static object StringSchema(string description) => new { type = "string", description };
    private static object NullableStringSchema(string description) => new { type = new[] { "string", "null" }, description };
    private static object BooleanSchema(string description) => new { type = "boolean", description };
    private static object IntegerSchema(string description) => new { type = "integer", description };
    private static object ArraySchema(string description) => new { type = "array", description, items = new { type = "string" } };

    private static string GetDefinitionName(object definition)
    {
        var json = JsonSerializer.SerializeToElement(definition);
        return json.TryGetProperty("name", out var name) ? name.GetString() ?? string.Empty : string.Empty;
    }

    private static string? GetString(JsonElement args, string property)
    {
        if (!args.TryGetProperty(property, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return null;
        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }

    private static IReadOnlyCollection<string> GetStrings(JsonElement args, string property) =>
        args.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray().Select(item => item.GetString()).Where(item => !string.IsNullOrWhiteSpace(item)).Select(item => item!).ToArray()
            : Array.Empty<string>();

    private static int GetInt(JsonElement args, string property, int fallback) =>
        args.TryGetProperty(property, out var value) && value.TryGetInt32(out var number) ? number : fallback;

    private static bool GetBool(JsonElement args, string property) =>
        args.TryGetProperty(property, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False && value.GetBoolean();

    private static DateOnly GetDate(JsonElement args, string property) =>
        DateOnly.TryParseExact(GetString(args, property), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : DateOnly.FromDateTime(DateTime.Today);
}
