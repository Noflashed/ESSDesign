using System.Text.Json;
using ESSDesign.Server.Controllers;
using ESSDesign.Server.Services;
using Microsoft.AspNetCore.Mvc;
using System.Reflection;
using Xunit;

namespace ESSDesign.Server.Tests;

public class DrawingRegisterNumberTests
{
    private static DrawingRegisterNumbers.Row Row(string client, string project, string number) => new(client, project, number);

    [Fact]
    public void ReusesTheClientAndProjectCodesAndTakesTheNextNumberInTheWholeRegister()
    {
        var rows = new[]
        {
            Row("BUILT PTY LTD", "Chifley Tower", "BUI-CHI-ESD1200"),
            Row("BUILT PTY LTD", "Chifley Tower", "BUI-CHI-ESD1201"),
            Row("ADCO CONSTRUCTIONS", "Marsden Park", "ADC-MAR-ESD1234"),
        };
        Assert.Equal("BUI-CHI-ESD1235", DrawingRegisterNumbers.Next(rows, "BUILT PTY LTD", "Chifley Tower"));
    }

    [Fact]
    public void DerivesCodesForANewProjectAndPadsTheSequence()
    {
        var rows = new[] { Row("BUILT PTY LTD", "Chifley Tower", "BLT-CHI-ESD0007") };
        Assert.Equal("BLT-CAS-ESD0008", DrawingRegisterNumbers.Next(rows, "Built Pty Ltd", "Castle Hill"));
        Assert.Equal("NEW-PSW-ESD0001", DrawingRegisterNumbers.Next(Array.Empty<DrawingRegisterNumbers.Row>(), "New Co", "Pitt Street West"));
    }

    [Theory]
    [InlineData("The Built Group", "BUI")]
    [InlineData("Maloo Access Group Pty Ltd", "MAL")]
    [InlineData("Sydney Metro West Line", "SMW")]
    [InlineData("AB", "ABX")]
    public void DerivesCodesLikeTheWebForm(string name, string code) => Assert.Equal(code, DrawingRegisterNumbers.DeriveCode(name));

    [Theory]
    [InlineData("Construction", "CONSTRUCTION")]
    [InlineData("as built", "AS-BUILT")]
    [InlineData("PRE", "PRELIMINARY")]
    [InlineData("concept", "CONCEPT")]
    [InlineData("whatever", "")]
    public void ReadsDesignUse(string said, string use) => Assert.Equal(use, DrawingRegisterNumbers.DesignUse(said));

    [Theory]
    [InlineData("2026-11-28", "28/11/2026")]
    [InlineData("1/2/26", "01/02/2026")]
    [InlineData("31/02/2026", "")]
    [InlineData("tomorrow", "")]
    public void FormatsIssueDates(string said, string stored) => Assert.Equal(stored, DrawingRegisterNumbers.DateIssued(said));

    [Fact]
    public void ReadsRowsFromTheRegisterDocument()
    {
        var document = JsonDocument.Parse("""{"drawingRegisterEntries":[{"client":"A","project":"B","drawingNo":"AAA-BBB-ESD0042"}]}""").RootElement;
        Assert.Equal("AAA-BBB-ESD0043", DrawingRegisterNumbers.Next(DrawingRegisterNumbers.Rows(document), "A", "B"));
    }

    [Fact]
    public void KleinCanAddDrawingsWithTheRegisterScope()
    {
        var method = typeof(SiteRegistryController).GetMethod(nameof(SiteRegistryController.AddDrawing))!;
        Assert.Equal("register.write", method.GetCustomAttribute<KleinScopeAttribute>()?.Scope);
        Assert.Equal("drawings", method.GetCustomAttribute<HttpPostAttribute>()?.Template);
    }
}
