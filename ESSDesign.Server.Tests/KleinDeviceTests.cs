using ESSDesign.Server.Controllers;
using ESSDesign.Server.Services;
using Microsoft.AspNetCore.Http;
using System.Reflection;
using Xunit;

namespace ESSDesign.Server.Tests;

public class KleinDeviceTests
{
    [Fact]
    public void MatchesPkceReferenceVector() =>
        Assert.Equal("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            KleinDevices.Hash("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));

    [Theory]
    [InlineData(typeof(FoldersController),"UploadDocument","design.write")]
    [InlineData(typeof(FoldersController),"ReplaceDocumentFiles","design.write")]
    [InlineData(typeof(FoldersController),"ShareDocument","notify")]
    [InlineData(typeof(SiteRegistryController),"ApplyChange","register.write")]
    [InlineData(typeof(KleinController),"Employees","employees.read")]
    [InlineData(typeof(KleinController),"Approve",null)]
    [InlineData(typeof(KleinController),"Remove",null)]
    public void EndpointsDeclareTheirScope(Type controller, string method, string? scope) =>
        Assert.Equal(scope,controller.GetMethod(method)!.GetCustomAttribute<KleinScopeAttribute>()?.Scope);

    [Fact]
    public async Task DeviceCannotCallUnmarkedEndpoint()
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Headers.Authorization = "Bearer " + KleinDevices.NewKey();
        await KleinDevices.Authenticate(ctx, _ => throw new InvalidOperationException());
        Assert.Equal(403,ctx.Response.StatusCode);
    }
}
