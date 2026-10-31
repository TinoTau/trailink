using Microsoft.AspNetCore.Mvc;
using Trailink.Api.DTOs;
using Trailink.Api.Services.Weather;

namespace Trailink.Api.Controllers;

[ApiController]
[Route("api/places")]
public class PlacesController : ControllerBase
{
    /// <summary>常用住宿地点（当日详情里的地点按钮），顺序即按钮顺序。</summary>
    [HttpGet]
    public ActionResult<List<PlaceDto>> List() =>
        Ok(Places.All.Select(place => new PlaceDto { Mark = place.Mark, Name = place.Name }).ToList());
}
