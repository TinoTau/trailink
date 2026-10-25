using Microsoft.EntityFrameworkCore;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Data;

public static class DemoDataSeeder
{
    public const string Password = "Passw0rd!";

    public static async Task WipeAsync(TrailinkDbContext db, TextWriter output)
    {
        await db.Database.ExecuteSqlRawAsync("""
            TRUNCATE TABLE
                order_activities,
                order_files,
                order_notes,
                dispatcher_notes,
                driver_notes,
                company_notes,
                itinerary_days,
                orders,
                dispatcher_applications,
                driver_applications,
                company_members,
                users,
                companies,
                drivers
            RESTART IDENTITY CASCADE
            """);
        await output.WriteLineAsync("已清空业务表，未写入演示数据。");
    }

    public static async Task WipeOrdersAsync(TrailinkDbContext db, TextWriter output)
    {
        await db.Database.ExecuteSqlRawAsync("""
            TRUNCATE TABLE
                order_activities,
                order_files,
                order_notes,
                itinerary_days,
                orders
            RESTART IDENTITY CASCADE
            """);
        var users = await db.Users.CountAsync();
        var companies = await db.Companies.CountAsync();
        await output.WriteLineAsync($"已清空订单、行程、活动和订单附件记录。用户 {users}，公司 {companies}。");
    }

    public static async Task ResetAsync(TrailinkDbContext db, TextWriter output)
    {
        await WipeAsync(db, TextWriter.Null);

        var hash = PasswordHashing.Hash(Password);

        var north = Company("北岛旅运", "021-111-0001");
        var south = Company("南岛旅运", "03-222-0002");
        var central = Company("中部旅运", "07-333-0003");
        db.Companies.AddRange(north, south, central);

        var northStaff = new Driver { Id = Guid.NewGuid(), Name = "北岛管理" };
        var southStaff = new Driver { Id = Guid.NewGuid(), Name = "南岛管理" };
        var centralStaff = new Driver { Id = Guid.NewGuid(), Name = "中部管理" };
        var chenStaff = new Driver { Id = Guid.NewGuid(), Name = "陈调度" };
        var linStaff = new Driver { Id = Guid.NewGuid(), Name = "林调度" };
        var huangStaff = new Driver { Id = Guid.NewGuid(), Name = "黄调度" };
        var wuStaff = new Driver { Id = Guid.NewGuid(), Name = "吴调度" };
        db.Drivers.AddRange(northStaff, southStaff, centralStaff, chenStaff, linStaff, huangStaff, wuStaff);

        var northOwner = Account("north", "北岛管理", UserRoles.Company, hash, companyId: north.Id, driverId: northStaff.Id);
        var southOwner = Account("south", "南岛管理", UserRoles.Company, hash, companyId: south.Id, driverId: southStaff.Id);
        var centralOwner = Account("central", "中部管理", UserRoles.Company, hash, companyId: central.Id, driverId: centralStaff.Id);

        var chen = Account("chen", "陈调度", UserRoles.Dispatcher, hash, driverId: chenStaff.Id);
        var lin = Account("lin", "林调度", UserRoles.Dispatcher, hash, driverId: linStaff.Id);
        var huang = Account("huang", "黄调度", UserRoles.Dispatcher, hash, driverId: huangStaff.Id);
        var wu = Account("wu", "吴调度", UserRoles.Dispatcher, hash, driverId: wuStaff.Id);

        var driverSpecs = new (string Username, string Name)[]
        {
            ("drv01", "王司导"),
            ("drv02", "李司导"),
            ("drv03", "张司导"),
            ("drv04", "赵司导"),
            ("drv05", "刘司导"),
            ("drv06", "孙司导"),
            ("drv07", "周司导"),
            ("drv08", "吴司导"),
            ("drv09", "郑司导"),
            ("drv10", "冯司导"),
            ("drv11", "陈司导"),
            ("drv12", "褚司导"),
            ("drv13", "卫司导")
        };

        var driverRows = driverSpecs.Select(spec => new Driver { Id = Guid.NewGuid(), Name = spec.Name }).ToArray();
        var driverUsers = driverSpecs.Select((spec, index) =>
            Account(spec.Username, spec.Name, UserRoles.Driver, hash, driverId: driverRows[index].Id)).ToArray();

        db.Drivers.AddRange(driverRows);
        db.Users.AddRange(northOwner, southOwner, centralOwner, chen, lin, huang, wu);
        db.Users.AddRange(driverUsers);

        db.CompanyMembers.AddRange(
            Member(chen, north), Member(chen, central),
            Member(lin, north),
            Member(huang, south), Member(huang, central),
            Member(wu, south));

        // 每名调度员 5 名司导；drv03-05 / drv05 / drv09-11 交叉归属
        var driverCompanies = new Dictionary<int, Company[]>
        {
            [0] = [north, central],
            [1] = [north, central],
            [2] = [north],
            [3] = [north],
            [4] = [north, south, central],
            [5] = [north],
            [6] = [north],
            [7] = [south, central],
            [8] = [south],
            [9] = [south],
            [10] = [south, central],
            [11] = [south],
            [12] = [south]
        };
        foreach (var (index, companies) in driverCompanies)
        {
            foreach (var company in companies)
            {
                db.CompanyMembers.Add(Member(driverUsers[index], company, UserRoles.Driver));
            }
        }

        var now = DateTimeOffset.UtcNow;
        var driverLinks = new (int Index, User Dispatcher)[]
        {
            (0, chen),
            (1, chen), (1, lin),
            (2, chen), (2, lin),
            (3, chen), (3, lin),
            (4, chen), (4, lin), (4, huang),
            (5, chen),
            (6, lin),
            (7, huang),
            (8, huang), (8, wu),
            (9, huang), (9, wu),
            (10, huang), (10, wu),
            (11, wu),
            (12, wu)
        };
        foreach (var (index, dispatcher) in driverLinks)
        {
            db.DriverApplications.Add(new DriverApplication
            {
                Id = Guid.NewGuid(),
                UserId = driverUsers[index].Id,
                DispatcherUserId = dispatcher.Id,
                CreatedAt = now,
                ApprovedAt = now
            });
        }

        db.DispatcherApplications.Add(new DispatcherApplication
        {
            Id = Guid.NewGuid(),
            UserId = driverUsers[4].Id,
            CompanyId = north.Id,
            CreatedAt = now
        });

        await db.SaveChangesAsync();

        await output.WriteLineAsync("账号已按名单重建，订单为空。密码均为 Passw0rd!");
        await output.WriteLineAsync("公司  north / south / central");
        await output.WriteLineAsync("调度  chen(北岛+中部) lin(北岛) huang(南岛+中部) wu(南岛)");
        await output.WriteLineAsync("司导  drv01-drv13；drv05 属三家公司，已向北岛申请调度员");
    }

    private static Company Company(string name, string contact) => new()
    {
        Id = Guid.NewGuid(),
        Name = name,
        Contact = contact
    };

    private static User Account(
        string username,
        string name,
        string role,
        string hash,
        Guid? companyId = null,
        Guid? driverId = null) => new()
    {
        Id = Guid.NewGuid(),
        Username = username,
        PasswordHash = hash,
        Name = name,
        Role = role,
        CompanyId = companyId,
        DriverId = driverId
    };

    private static CompanyMember Member(User user, Company company, string role = UserRoles.Dispatcher) => new()
    {
        Id = Guid.NewGuid(),
        UserId = user.Id,
        CompanyId = company.Id,
        Role = role
    };

}
