using Microsoft.EntityFrameworkCore;
using Trailink.Api.Data;
using Trailink.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddDbContext<TrailinkDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddScoped<OrderScheduling>();
builder.Services.AddScoped<OrderDriverAssignment>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin());
});

var app = builder.Build();

app.MapOpenApi();
app.UseCors();
app.MapControllers();
app.Run();

public partial class Program;
