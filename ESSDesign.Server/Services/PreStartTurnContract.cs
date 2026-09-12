using System.Text.Json;
using System.Text.Json.Nodes;

namespace ESSDesign.Server.Services;

/// <summary>Opt-in contract for the conversational iOS form. Legacy clients keep their existing protocol.</summary>
public static class PreStartTurnContract
{
    public const string Version = "prestart-turn-v2";
    public static readonly string[] Fields = ["previousIssues", "previousIssuesDetails", "plannedActivities", "swmsInPlace", "permitDetails", "permitConditionsChanged", "hazardousSubstances", "hazardousSubstancesDetails", "areaForeman", "risks", "checklist.dailyRiskAssessment", "checklist.qualifications", "checklist.plantAndEquipment", "checklist.equipmentSafe", "checklist.workAreaSafe", "checklist.ppe", "checklist.weather", "checklist.consulted", "workGroupCount", "cleanupWorkerCount", "generalNotes", "attendees"];
    public const string Instructions = """
        You help an ESS scaffolder fill a construction pre-start. Return only the structured decision for THIS turn.
        The latest user's words are the evidence for updates. Saved answers and dialogue resolve references only; never output them as fresh answers. An assistant question is never evidence. Cite a verbatim excerpt from the supplied transcript or its follow-up answers in each update.evidence. Never invent measurements, units, activities, controls, names, approvals or quantities. If speech is unclear, ask one short specific question; do not guess missing words. 'Four from height' is the speech homophone 'fall from height', NOT a four-metre fall. Stretcher stair and alloy stair are distinct; strip means dismantle only in clear scaffold context. Keep IDs, locations and uncertainty unchanged. Garbled activity notes such as 'put a syrup and D and a wrecked a building seven' do not identify the work or stair type reliably: clarify whether erecting/dismantling and which stair, rather than inventing an alloy stair or a dismantling task. 'Wet forces' can mean wet floors only when surrounding words, such as mopping up, establish that meaning.
        A turn can BOTH answer the current question AND change an earlier answer: return every explicitly supplied update, up to four, in form order. For 'No substances, but change yesterday's issues to a fall from heights', return hazardousSubstances=false (mode answer) AND previousIssuesDetails='A fall from heights.' (mode replace, replaceEntire=true). Do not force both instructions into one field or discard either.
        Use mode answer for first answers, append for additions, replace for corrections. Never update a field without new user evidence. For append, return only new facts; the app combines them with the old value. For replace, preserve unrelated facts only for a partial edit. 'It should just say', 'change it to', 'replace the answer with' means replaceEntire=true: return ONLY the replacement requested, never restore removed details. For a partial change to one risk/action or attendee, replaceEntire=false and keep unrelated existing rows/names. Never silently remove a signed attendee; the app validates that.
        Booleans are true/false/null, not strings. An incident report makes previousIssues=true without needing an extra yes. If previousIssues or hazardousSubstances is false, omit its details. If positive details are provided while that parent is false or empty, include the parent true before details. Bare yes does not supply details. Do not infer other safety checks from activities or from history. Counts are digit strings; names are newline-separated; text is concise professional Australian English without adding facts. For risks use an array of one to six {row,risk,action}: one stated hazard per row and only its stated control, or empty action. Never return risks as a paragraph. More than six hazards requires clarification; do not blame the user for a format problem.
        A pending proposal is UNAPPLIED. When the user accepts it, including 'yeah change it to [the same proposed value]' or 'yes I just want it to say [the same value]', return action confirm and no updates. 'Yes, but change...' with DIFFERENT facts means new updates and a new proposal, never confirmation. A rejection without a new replacement means clarify what should change; cancel/never mind means cancel. Do not reinterpret an accepted proposal or repopulate unrelated fields. The app reads back and confirms edits before writing.
        If the user asks to revisit a known topic but gives no new facts, return reopen with target and editMode; do not write the navigation request as an answer. If target/change is unclear, return clarify with one short question and no updates. Use only the allowed fields in the current input, regardless of fields present in history. All unused nullable fields must be null; non-update actions have an empty updates list.
        """;

    public static string[] ReadAllowedFields(string input)
    {
        try
        {
            using var document = JsonDocument.Parse(input);
            var root = document.RootElement;
            var current = root.GetProperty("currentField").GetString();
            var allowed = root.GetProperty("allowedFields").EnumerateArray().Select(field => field.GetProperty("key").GetString()!).ToArray();
            if (allowed.Length is < 1 or > 22 || allowed.Distinct().Count() != allowed.Length || allowed.Any(field => !Fields.Contains(field)) || !allowed.Contains(current)) throw new JsonException();
            if (root.GetProperty("transcript").ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(root.GetProperty("transcript").GetString())) throw new JsonException();
            return allowed;
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException)
        { throw new ArgumentException("Invalid pre-start turn input.", e); }
    }

    public static JsonObject ResponseFormat(string[]? allowed = null)
    {
        allowed ??= Fields;
        var schema = JsonNode.Parse("""
            {"type":"object","additionalProperties":false,"required":["action","updates","target","editMode","question"],"properties":{
              "action":{"type":"string","enum":["updates","clarify","confirm","cancel","reopen"]},
              "updates":{"type":"array","maxItems":4,"items":{"type":"object","additionalProperties":false,"required":["key","mode","value","evidence","replaceEntire"],"properties":{
                "key":{"type":"string"},"mode":{"type":"string","enum":["answer","append","replace"]},
                "evidence":{"type":"string"},"replaceEntire":{"type":"boolean"},
                "value":{"anyOf":[{"type":["string","boolean","null"]},{"type":"array","minItems":1,"maxItems":6,"items":{"type":"object","additionalProperties":false,"required":["row","risk","action"],"properties":{"row":{"type":"integer","minimum":1,"maximum":6},"risk":{"type":"string"},"action":{"type":"string"}}}}]}
              }}},
              "target":{"type":["string","null"]},"editMode":{"type":["string","null"],"enum":["append","replace",null]},"question":{"type":["string","null"]}
            }}
            """)!.AsObject();
        var template = schema["properties"]!["updates"]!["items"]!.AsObject();
        var variants = new JsonArray();
        bool BooleanField(string field) => field.StartsWith("checklist.") || field is "previousIssues" or "swmsInPlace" or "permitConditionsChanged" or "hazardousSubstances";
        bool CountField(string field) => field is "workGroupCount" or "cleanupWorkerCount";
        void Variant(IEnumerable<string> keys, JsonNode value)
        {
            var selected = keys.ToArray();
            if (selected.Length == 0) return;
            var item = template.DeepClone();
            item["properties"]!["key"]!["enum"] = JsonSerializer.SerializeToNode(selected);
            item["properties"]!["value"] = value;
            variants.Add(item);
        }
        Variant(allowed.Where(BooleanField), JsonNode.Parse("""{"type":["boolean","null"]}""")!);
        Variant(allowed.Where(CountField), JsonNode.Parse("""{"type":"string","pattern":"^[0-9]{1,3}$"}""")!);
        Variant(allowed.Where(field => field == "risks"), template["properties"]!["value"]!["anyOf"]![1]!.DeepClone());
        Variant(allowed.Where(field => !BooleanField(field) && !CountField(field) && field != "risks"), JsonNode.Parse("""{"type":"string"}""")!);
        schema["properties"]!["updates"]!["items"] = new JsonObject { ["anyOf"] = variants };
        schema["properties"]!["target"]!["enum"] = JsonSerializer.SerializeToNode(allowed.Cast<string?>().Append(null));
        return new JsonObject { ["type"] = "json_schema", ["json_schema"] = new JsonObject { ["name"] = "prestart_turn_v2", ["strict"] = true, ["schema"] = schema } };
    }

    public static void ValidateReply(string reply)
    {
        try
        {
            using var document = JsonDocument.Parse(reply);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count() != 5 || new[] {"action", "updates", "target", "editMode", "question"}.Any(key => !root.TryGetProperty(key, out _))) throw new JsonException();
            var action = root.GetProperty("action").GetString();
            var updates = root.GetProperty("updates");
            if (action is not ("updates" or "clarify" or "confirm" or "cancel" or "reopen") || updates.ValueKind != JsonValueKind.Array || updates.GetArrayLength() > 4 ||
                (action == "updates" ? updates.GetArrayLength() == 0 : updates.GetArrayLength() != 0)) throw new JsonException();
            foreach (var update in updates.EnumerateArray())
            {
                if (!Fields.Contains(update.GetProperty("key").GetString()) || update.GetProperty("mode").GetString() is not ("answer" or "append" or "replace") ||
                    update.GetProperty("evidence").ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(update.GetProperty("evidence").GetString()) ||
                    update.GetProperty("replaceEntire").ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw new JsonException();
                var field = update.GetProperty("key").GetString()!;
                var value = update.GetProperty("value");
                if (field.StartsWith("checklist.") || field is "previousIssues" or "swmsInPlace" or "permitConditionsChanged" or "hazardousSubstances")
                {
                    if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null)) throw new JsonException();
                }
                else if (field == "risks")
                {
                    if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() is < 1 or > 6) throw new JsonException();
                    var row = 0;
                    foreach (var risk in value.EnumerateArray())
                    {
                        if (risk.GetProperty("row").GetInt32() != ++row || string.IsNullOrWhiteSpace(risk.GetProperty("risk").GetString()) || risk.GetProperty("action").ValueKind != JsonValueKind.String) throw new JsonException();
                    }
                }
                else if (value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()) || value.GetString()!.Length > 4000) throw new JsonException();
                if (field is "workGroupCount" or "cleanupWorkerCount" && (value.GetString()!.Length > 3 || !value.GetString()!.All(char.IsAsciiDigit))) throw new JsonException();
            }
            if (updates.EnumerateArray().Select(update => update.GetProperty("key").GetString()).Distinct().Count() != updates.GetArrayLength()) throw new JsonException();
            if (action == "reopen" && (!Fields.Contains(root.GetProperty("target").GetString()) || root.GetProperty("editMode").GetString() is not ("append" or "replace"))) throw new JsonException();
            if (action == "clarify" && (root.GetProperty("question").ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(root.GetProperty("question").GetString()) || root.GetProperty("question").GetString()!.Length > 500)) throw new JsonException();
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException)
        { throw new HttpRequestException("Invalid structured pre-start decision.", e); }
    }
}
