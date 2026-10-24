using Microsoft.EntityFrameworkCore;
using Trailink.Api.Models;
using Trailink.Api.Services;

namespace Trailink.Api.Data;

public static class DemoDataSeeder
{
    public const string Password = "Passw0rd!";

    public static async Task ResetAsync(TrailinkDbContext db, TextWriter output)
    {
        await db.Database.ExecuteSqlRawAsync("""
            TRUNCATE TABLE
                order_activities,
                order_files,
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
            ("drv13", "卫司导"),
            ("drv14", "蒋司导")
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

        db.DispatcherApplications.Add(new DispatcherApplication
        {
            Id = Guid.NewGuid(),
            UserId = driverUsers[13].Id,
            CompanyId = north.Id,
            CreatedAt = DateTimeOffset.UtcNow
        });

        Guid? D(int index) => driverRows[index].Id;

        // 未分配
        AddOrder(db, north, chen, "2026-11-02", 3, null, "未派 · 奥克兰接机");
        AddOrder(db, north, lin, "2026-11-12", 2, null, "未派 · 霍比特村");
        AddOrder(db, north, chen, "2026-11-20", 4, null, "未派 · 北岛环线");
        AddOrder(db, south, huang, "2026-11-05", 3, null, "未派 · 皇后镇");
        AddOrder(db, south, wu, "2026-11-18", 2, null, "未派 · 米尔福德");
        AddOrder(db, south, huang, "2026-12-02", 3, null, "未派 · 蒂卡波");
        AddOrder(db, central, chen, "2026-11-08", 2, null, "未派 · 陶波");
        AddOrder(db, central, huang, "2026-12-06", 3, null, "未派 · 朗吉蒂基");

        // 历史已完成（结束早于今天）
        AddOrder(db, north, chen, "2026-09-02", 2, D(0), "已完成 · 陈→王");
        AddOrder(db, north, chen, "2026-09-06", 2, D(1), "已完成 · 陈→李");
        AddOrder(db, north, chen, "2026-09-10", 3, D(2), "已完成 · 陈→张");
        AddOrder(db, central, chen, "2026-09-16", 2, D(3), "已完成 · 陈→赵");
        AddOrder(db, central, chen, "2026-09-20", 2, D(4), "已完成 · 陈→刘");
        AddOrder(db, north, lin, "2026-09-04", 2, D(2), "已完成 · 林→张");
        AddOrder(db, north, lin, "2026-09-08", 2, D(3), "已完成 · 林→赵");
        AddOrder(db, north, lin, "2026-09-12", 2, D(4), "已完成 · 林→刘");
        AddOrder(db, north, lin, "2026-09-18", 2, D(5), "已完成 · 林→孙");
        AddOrder(db, north, lin, "2026-09-22", 2, D(6), "已完成 · 林→周");
        AddOrder(db, south, huang, "2026-09-03", 2, D(7), "已完成 · 黄→吴");
        AddOrder(db, south, huang, "2026-09-07", 3, D(8), "已完成 · 黄→郑");
        AddOrder(db, south, huang, "2026-09-14", 2, D(9), "已完成 · 黄→冯");
        AddOrder(db, central, huang, "2026-09-19", 2, D(4), "已完成 · 黄→刘");
        AddOrder(db, central, huang, "2026-09-24", 2, D(10), "已完成 · 黄→陈");
        AddOrder(db, south, wu, "2026-09-05", 2, D(8), "已完成 · 吴→郑");
        AddOrder(db, south, wu, "2026-09-09", 2, D(9), "已完成 · 吴→冯");
        AddOrder(db, south, wu, "2026-09-13", 2, D(10), "已完成 · 吴→陈");
        AddOrder(db, south, wu, "2026-09-17", 2, D(11), "已完成 · 吴→褚");
        AddOrder(db, south, wu, "2026-09-21", 3, D(12), "已完成 · 吴→卫");

        // 未完成已派，方便司导日历和调度台对照
        AddOrder(db, north, chen, "2026-10-28", 3, D(0), "进行中 · 陈→王");
        AddOrder(db, north, lin, "2026-10-30", 2, D(5), "进行中 · 林→孙");
        AddOrder(db, south, huang, "2026-11-01", 2, D(7), "进行中 · 黄→吴");
        AddOrder(db, south, wu, "2026-11-03", 2, D(11), "进行中 · 吴→褚");
        AddOrder(db, central, chen, "2026-10-26", 2, D(4), "进行中 · 陈→刘");

        await db.SaveChangesAsync();

        await output.WriteLineAsync("演示数据已重置。密码均为 Passw0rd!");
        await output.WriteLineAsync("公司  north / south / central");
        await output.WriteLineAsync("调度  chen(北岛+中部) lin(北岛) huang(南岛+中部) wu(南岛)");
        await output.WriteLineAsync("司导  drv01-drv13；drv05 属三家公司；drv14 已申请北岛待批");
        await output.WriteLineAsync("陈: drv01-05  林: drv03-07  黄: drv05,08-11  吴: drv09-13");
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

    private static void AddOrder(
        TrailinkDbContext db,
        Company company,
        User creator,
        string start,
        int dayCount,
        Guid? driverId,
        string notes)
    {
        var startDate = DateOnly.Parse(start);
        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNo = Order.NewOrderNo(),
            StartDate = startDate,
            GuestCount = 4,
            Notes = notes,
            CompanyId = company.Id,
            CreatedByUserId = creator.Id
        };
        db.Orders.Add(order);
        for (var offset = 0; offset < dayCount; offset++)
        {
            db.ItineraryDays.Add(new ItineraryDay
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ServiceDate = startDate.AddDays(offset),
                Description = notes,
                DriverId = driverId
            });
        }
    }
}
