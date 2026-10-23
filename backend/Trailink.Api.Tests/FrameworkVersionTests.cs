using System.Reflection;
using System.Runtime.Versioning;

namespace Trailink.Api.Tests;

public class FrameworkVersionTests
{
    [Fact]
    public void Api_targets_net10()
    {
        var framework = typeof(Program).Assembly
            .GetCustomAttribute<TargetFrameworkAttribute>()
            ?.FrameworkName;

        Assert.Contains("NETCoreApp,Version=v10.0", framework);
    }
}
