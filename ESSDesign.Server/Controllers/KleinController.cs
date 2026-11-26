using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text.Json;
using ESSDesign.Server.Models;
using ESSDesign.Server.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;

namespace ESSDesign.Server.Controllers;

[ApiController, Route("api/klein"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class KleinController(KleinDevices devices, SupabaseService users) : ControllerBase
{
    public record StartRequest([Required, StringLength(100)] string DeviceName, [Required, StringLength(40)] string Platform,
        [RegularExpression("^[A-Za-z0-9_-]{43}$")] string CodeChallenge);
    public record CodeRequest([Required, StringLength(12)] string UserCode, string[]? Scopes = null);
    public record TokenRequest(Guid PairingId, [RegularExpression("^[A-Za-z0-9._~-]{43,128}$")] string CodeVerifier);
    private CancellationToken Ct => HttpContext.RequestAborted;
    private Task<UserInfo?> BrowserUser()
    {
        var header = Request.Headers.Authorization.ToString();
        return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? users.GetAuthUserInfoFromAccessTokenAsync(header[7..].Trim()) : Task.FromResult<UserInfo?>(null);
    }
    private static object Info(KleinIdentity i) => new {
        device = new { i.Device.Id, i.Device.Name }, user = new { i.User.Id, i.User.FullName, i.User.Email, i.User.Role }, scopes = i.Device.Scopes
    };

    [HttpPost("pair/start"), EnableRateLimiting("klein-start")]
    public async Task<IActionResult> Start(StartRequest request)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var code = string.Concat(Enumerable.Range(0,8).Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]));
        var id = await devices.Call("start", new {code, challenge=request.CodeChallenge, name=request.DeviceName.Trim(), platform=request.Platform.Trim()}, Ct);
        return Ok(new { pairingId=id, userCode=code, approveUrl="https://essdesign.app/?page=connect-klein&code="+code, expiresIn=600, interval=5 });
    }

    [HttpGet("pair/details")]
    public async Task<IActionResult> Details([FromQuery] string userCode)
    {
        if (await BrowserUser() == null) return Unauthorized();
        var row = await devices.Call("details", new { code=userCode.Trim().ToUpperInvariant() }, Ct);
        return row == null ? StatusCode(410) : Ok(row);
    }

    [HttpPost("pair/approve")]
    public Task<IActionResult> Approve(CodeRequest request) => Decide("approve",request);
    [HttpPost("pair/deny")]
    public Task<IActionResult> Deny(CodeRequest request) => Decide("deny",request);
    private async Task<IActionResult> Decide(string op, CodeRequest request)
    {
        var user = await BrowserUser();
        if (user == null) return Unauthorized();
        var scopes = (request.Scopes ?? KleinDevices.AllScopes).Distinct().ToArray();
        if (op == "approve" && (scopes.Length == 0 || scopes.Except(KleinDevices.AllScopes).Any())) return BadRequest();
        var row = await devices.Call(op, new {code=request.UserCode.Trim().ToUpperInvariant(), owner=user.Id, scopes}, Ct);
        return row == null ? StatusCode(410) : NoContent();
    }

    [HttpPost("pair/token"), EnableRateLimiting("klein-poll")]
    public async Task<IActionResult> Token(TokenRequest request)
    {
        var key = KleinDevices.NewKey();
        var row = await devices.Call("token", new {id=request.PairingId, challenge=KleinDevices.Hash(request.CodeVerifier), hash=KleinDevices.Hash(key)}, Ct);
        if (row == null) return StatusCode(410);
        if (row.Value.TryGetProperty("status",out _)) return Accepted(new { status="pending" });
        var identity = await devices.Identity(row.Value);
        return Ok(new { key, device=new {identity.Device.Id,identity.Device.Name}, user=new {identity.User.Id,identity.User.FullName,identity.User.Email,identity.User.Role}, scopes=identity.Device.Scopes });
    }

    [HttpGet("me"), KleinScope("")]
    public IActionResult Me() => KleinIdentity.From(HttpContext) is {} i ? Ok(Info(i)) : Unauthorized();

    [HttpGet("devices")]
    public async Task<IActionResult> List()
    {
        var user = await BrowserUser();
        return user == null ? Unauthorized() : Ok(await devices.Call("list",new {owner=user.Id},Ct));
    }

    [HttpDelete("devices/current"), KleinScope("")]
    public async Task<IActionResult> Unlink()
    {
        var identity = KleinIdentity.From(HttpContext);
        return identity == null ? Unauthorized() : await Revoke(identity.User.Id,identity.Device.Id);
    }

    [HttpDelete("devices/{id:guid}")]
    public async Task<IActionResult> Remove(Guid id)
    {
        var user = await BrowserUser();
        return user == null ? Unauthorized() : await Revoke(user.Id,id);
    }
    private async Task<IActionResult> Revoke(string owner, Guid id) =>
        (await devices.Call("revoke",new {owner,id},Ct))?.ValueKind == JsonValueKind.True ? NoContent() : NotFound();
}
