using ESSDesign.Server.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;

namespace ESSDesign.Server.Tests;

public sealed class EmployeePhotoTests
{
    [Theory]
    [InlineData("")]
    [InlineData("Basic invalid")]
    public async Task AdminPhotoUploadRejectsUnauthenticatedRequestsBeforeAccessingStorage(string authorization)
    {
        var controller = new UsersController(null!, NullLogger<UsersController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.Request.Headers.Authorization = authorization;
        var result = await controller.UploadUserProfileImage(Guid.NewGuid().ToString(), null!);
        Assert.IsType<UnauthorizedObjectResult>(result);
    }
}
