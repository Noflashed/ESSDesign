using Microsoft.AspNetCore.Mvc;
using ESSDesign.Server.Services;

namespace ESSDesign.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private readonly SupabaseService _supabaseService;
        private readonly ILogger<UsersController> _logger;

        public UsersController(SupabaseService supabaseService, ILogger<UsersController> logger)
        {
            _supabaseService = supabaseService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<ActionResult> GetAllUsers()
        {
            try
            {
                var users = await _supabaseService.GetAllUsersAsync();
                return Ok(users);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting users");
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
}
