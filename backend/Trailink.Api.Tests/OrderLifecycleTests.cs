using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Trailink.Api.Data;
using Trailink.Api.DTOs;
using Trailink.Api.Models;

namespace Trailink.Api.Tests;

public class OrderLifecycleTests : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly ApiFactory _factory;

    public OrderLifecycleTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Bind_assign_dispatch_and_recycle_follow_visibility_rules()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var past = new DateOnly(2020, 3, 11);
        var future = new DateOnly(2037, 3, 12);

        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"lc_{suffix}", "流转公司", "company", $"流转公司{suffix}");

        var otherCompany = _factory.CreateClient();
        var otherCompanyUser = await TestAuth.RegisterAsync(otherCompany, $"lco_{suffix}", "另一公司", "company", $"另一公司{suffix}");

        var dispatcherA = _factory.CreateClient();
        var dispatcherAUser = await TestAuth.RegisterAsync(dispatcherA, $"lda_{suffix}", "调度甲", "driver");
        var dispatcherB = _factory.CreateClient();
        var dispatcherBUser = await TestAuth.RegisterAsync(dispatcherB, $"ldb_{suffix}", "调度乙", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherAUser.Id, companyUser.CompanyId!.Value);
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherBUser.Id, companyUser.CompanyId.Value);

        var driver = _factory.CreateClient();
        var driverUser = await TestAuth.RegisterAsync(driver, $"ldr_{suffix}", "流转司导", "driver");

        var created = await PostAsync<OrderReadDto>(company, "/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = $"P-LIFE-{suffix}",
            StartDate = past,
            GuestCount = 3
        });
        Assert.Equal(companyUser.CompanyId, created.CompanyId);
        Assert.Null(created.AssignedDispatcherUserId);

        var companyKeptId = await company.PutAsJsonAsync($"/api/orders/{created.Id}", new OrderWriteDto
        {
            PlatformOrderNo = created.PlatformOrderNo,
            StartDate = created.StartDate,
            GuestCount = created.GuestCount,
            CompanyId = otherCompanyUser.CompanyId
        });
        companyKeptId.EnsureSuccessStatusCode();
        var afterCompanyRebind = await companyKeptId.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Equal(companyUser.CompanyId, afterCompanyRebind!.CompanyId);

        var companyUnbind = await company.PutAsJsonAsync($"/api/orders/{created.Id}", new OrderWriteDto
        {
            PlatformOrderNo = created.PlatformOrderNo,
            StartDate = created.StartDate,
            GuestCount = created.GuestCount,
            CompanyId = null
        });
        companyUnbind.EnsureSuccessStatusCode();
        var afterCompanyUnbind = await companyUnbind.Content.ReadFromJsonAsync<OrderReadDto>(JsonOptions);
        Assert.Equal(companyUser.CompanyId, afterCompanyUnbind!.CompanyId);

        var pastDay = await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{created.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = past,
            Description = "已过期行程"
        });
        var futureDay = await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{created.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = future,
            Description = "未出行程"
        });
        var activity = await PostAsync<OrderActivityReadDto>(
            company,
            $"/api/orders/{created.Id}/days/{pastDay.Id}/activities",
            new OrderActivityWriteDto { Content = "回收后仍保留" });

        Assert.Contains(created.Id, await OrderIdsAsync(company));
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(otherCompany));
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(dispatcherA));
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(driver));

        var byPlatform = await dispatcherA.GetFromJsonAsync<List<OrderReadDto>>($"/api/orders?orderNo=P-LIFE-{suffix}", JsonOptions);
        Assert.Contains(byPlatform!, item => item.Id == created.Id);
        var byOrderNo = await dispatcherA.GetFromJsonAsync<List<OrderReadDto>>($"/api/orders?orderNo={created.OrderNo}", JsonOptions);
        Assert.Contains(byOrderNo!, item => item.Id == created.Id);

        var outsiderDispatch = await otherCompany.PutAsJsonAsync($"/api/orders/{created.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherAUser.Id
        });
        Assert.Equal(HttpStatusCode.Forbidden, outsiderDispatch.StatusCode);

        var driverDispatch = await driver.PutAsJsonAsync($"/api/orders/{created.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherAUser.Id
        });
        Assert.Equal(HttpStatusCode.Forbidden, driverDispatch.StatusCode);

        var assigned = await PutAsync<OrderReadDto>(company, $"/api/orders/{created.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherAUser.Id
        });
        Assert.Equal(dispatcherAUser.Id, assigned.AssignedDispatcherUserId);
        Assert.Equal(0, assigned.AssignedDayCount);

        Assert.Contains(created.Id, await OrderIdsAsync(company));
        Assert.Contains(created.Id, await OrderIdsAsync(dispatcherA));
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(dispatcherB));
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(driver));

        var otherDispatcherDelete = await dispatcherB.DeleteAsync($"/api/orders/{created.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, otherDispatcherDelete.StatusCode);
        var driverDelete = await driver.DeleteAsync($"/api/orders/{created.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, driverDelete.StatusCode);

        var dispatched = await PutAsync<AssignmentResultDto>(dispatcherA, $"/api/orders/{created.Id}/driver", new AssignDriverDto
        {
            DriverId = driverUser.DriverId
        });
        Assert.Equal(2, dispatched.UpdatedDayCount);

        var driverOrders = await driver.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        var driverView = driverOrders!.Single(item => item.Id == created.Id);
        Assert.Equal(2, driverView.AssignedDayCount);
        Assert.Contains(driverView.Days, day => day.Id == pastDay.Id && day.DriverId == driverUser.DriverId);
        Assert.Contains(driverView.Days, day => day.Id == futureDay.Id);

        var moved = await PutAsync<OrderReadDto>(company, $"/api/orders/{created.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherBUser.Id
        });
        Assert.Equal(dispatcherBUser.Id, moved.AssignedDispatcherUserId);
        Assert.Equal(2, moved.AssignedDayCount);
        Assert.All(moved.Days, day => Assert.Equal(driverUser.DriverId, day.DriverId));
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(dispatcherA));
        Assert.Contains(created.Id, await OrderIdsAsync(dispatcherB));
        Assert.Contains(created.Id, await OrderIdsAsync(driver));

        var recycled = await PutAsync<OrderReadDto>(company, $"/api/orders/{created.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = null
        });
        Assert.Null(recycled.AssignedDispatcherUserId);
        Assert.Equal(companyUser.CompanyId, recycled.CompanyId);
        Assert.Equal(0, recycled.AssignedDayCount);
        Assert.Equal(2, recycled.Days.Count);
        Assert.All(recycled.Days, day =>
        {
            Assert.Null(day.DriverId);
            Assert.Null(day.AssignedByUserId);
        });
        Assert.Equal("已过期行程", recycled.Days.Single(day => day.Id == pastDay.Id).Description);
        Assert.Equal(activity.Id, recycled.Days.Single(day => day.Id == pastDay.Id).Activities.Single().Id);

        Assert.Contains(created.Id, await OrderIdsAsync(company));
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(dispatcherA));
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(dispatcherB));
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(driver));

        var afterRecycleDelete = await dispatcherB.DeleteAsync($"/api/orders/{created.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, afterRecycleDelete.StatusCode);

        var givenBack = await PutAsync<OrderReadDto>(company, $"/api/orders/{created.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherAUser.Id
        });
        Assert.Equal(0, givenBack.AssignedDayCount);

        await company.DeleteAsync($"/api/orders/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, (await company.GetAsync($"/api/orders/{created.Id}")).StatusCode);
    }

    [Fact]
    public async Task Dispatcher_return_and_unbind_follow_company_binding()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"rb_{suffix}", "退回公司", "company", $"退回公司{suffix}");
        var dispatcher = _factory.CreateClient();
        var dispatcherUser = await TestAuth.RegisterAsync(dispatcher, $"rbd_{suffix}", "退回调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherUser.Id, companyUser.CompanyId!.Value);
        var driver = _factory.CreateClient();
        var driverUser = await TestAuth.RegisterAsync(driver, $"rbg_{suffix}", "退回司导", "driver");

        var unbound = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 4, 1),
            GuestCount = 1
        });
        Assert.Null(unbound.CompanyId);
        Assert.Equal(dispatcherUser.Id, unbound.AssignedDispatcherUserId);
        Assert.DoesNotContain(unbound.Id, await OrderIdsAsync(company));
        Assert.Contains(unbound.Id, await OrderIdsAsync(dispatcher));

        var deletedUnbound = await dispatcher.DeleteAsync($"/api/orders/{unbound.Id}");
        deletedUnbound.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await dispatcher.GetAsync($"/api/orders/{unbound.Id}")).StatusCode);
        Assert.DoesNotContain(unbound.Id, await OrderIdsAsync(company));

        var bound = await PostAsync<OrderReadDto>(company, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 4, 2),
            GuestCount = 2
        });
        var day = await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{bound.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 4, 2),
            Description = "退回后保留",
            DriverId = driverUser.DriverId
        });
        await PutAsync<OrderReadDto>(company, $"/api/orders/{bound.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherUser.Id
        });
        Assert.Contains(bound.Id, await OrderIdsAsync(dispatcher));
        Assert.Contains(bound.Id, await OrderIdsAsync(driver));

        var returned = await dispatcher.DeleteAsync($"/api/orders/{bound.Id}");
        returned.EnsureSuccessStatusCode();

        var pooled = await company.GetFromJsonAsync<OrderReadDto>($"/api/orders/{bound.Id}", JsonOptions);
        Assert.Equal(companyUser.CompanyId, pooled!.CompanyId);
        Assert.Null(pooled.AssignedDispatcherUserId);
        Assert.Equal(0, pooled.AssignedDayCount);
        Assert.Equal("退回后保留", Assert.Single(pooled.Days).Description);
        Assert.Null(Assert.Single(pooled.Days).DriverId);
        Assert.Equal(day.Id, Assert.Single(pooled.Days).Id);

        Assert.Contains(bound.Id, await OrderIdsAsync(company));
        Assert.DoesNotContain(bound.Id, await OrderIdsAsync(dispatcher));
        Assert.DoesNotContain(bound.Id, await OrderIdsAsync(driver));

        var secondDelete = await dispatcher.DeleteAsync($"/api/orders/{bound.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, secondDelete.StatusCode);

        await company.DeleteAsync($"/api/orders/{bound.Id}");
    }

    [Fact]
    public async Task Split_assignment_hides_order_from_driver_after_own_day_cleared()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"sp_{suffix}", "拆单公司", "company", $"拆单公司{suffix}");
        var dispatcher = _factory.CreateClient();
        var dispatcherUser = await TestAuth.RegisterAsync(dispatcher, $"spd_{suffix}", "拆单调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherUser.Id, companyUser.CompanyId!.Value);
        var firstDriver = _factory.CreateClient();
        var firstUser = await TestAuth.RegisterAsync(firstDriver, $"spg1_{suffix}", "拆单司导甲", "driver");
        var secondDriver = _factory.CreateClient();
        await TestAuth.RegisterAsync(secondDriver, $"spg2_{suffix}", "拆单司导乙", "driver");

        var order = await PostAsync<OrderReadDto>(company, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 5, 1),
            GuestCount = 2
        });
        var dayOne = await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 5, 1)
        });
        var dayTwo = await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 5, 2)
        });
        await PutAsync<OrderReadDto>(company, $"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherUser.Id
        });

        var split = await PutAsync<ItineraryDayReadDto>(dispatcher, $"/api/orders/{order.Id}/days/{dayOne.Id}", new ItineraryDayWriteDto
        {
            ServiceDate = dayOne.ServiceDate,
            DriverId = firstUser.DriverId
        });
        Assert.Equal(firstUser.DriverId, split.DriverId);
        Assert.Equal(dispatcherUser.Id, split.AssignedByUserId);

        var listed = await dispatcher.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        var summary = listed!.Single(item => item.Id == order.Id);
        Assert.Equal(1, summary.AssignedDayCount);
        Assert.Null(summary.Days.Single(day => day.Id == dayTwo.Id).DriverId);

        Assert.Contains(order.Id, await OrderIdsAsync(firstDriver));
        Assert.DoesNotContain(order.Id, await OrderIdsAsync(secondDriver));

        var cleared = await firstDriver.PutAsJsonAsync($"/api/orders/{order.Id}/days/{dayOne.Id}", new ItineraryDayWriteDto
        {
            ServiceDate = dayOne.ServiceDate,
            DriverId = null
        });
        cleared.EnsureSuccessStatusCode();

        Assert.DoesNotContain(order.Id, await OrderIdsAsync(firstDriver));
        Assert.Contains(order.Id, await OrderIdsAsync(dispatcher));
        var afterClear = await dispatcher.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.Equal(0, afterClear!.AssignedDayCount);

        await company.DeleteAsync($"/api/orders/{order.Id}");
    }

    [Fact]
    public async Task Real_order_overwrites_driver_placeholder_and_unbound_cannot()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"ph_{suffix}", "占位公司", "company", $"占位公司{suffix}");
        var dispatcher = _factory.CreateClient();
        var dispatcherUser = await TestAuth.RegisterAsync(dispatcher, $"phd_{suffix}", "占位调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherUser.Id, companyUser.CompanyId!.Value);
        var driver = _factory.CreateClient();
        var driverUser = await TestAuth.RegisterAsync(driver, $"phg_{suffix}", "占位司导", "driver");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TrailinkDbContext>();
            db.CompanyMembers.Add(new CompanyMember
            {
                Id = Guid.NewGuid(),
                UserId = driverUser.Id,
                CompanyId = companyUser.CompanyId!.Value,
                Role = UserRoles.Driver
            });
            await db.SaveChangesAsync();
        }

        var placeholder = await PostAsync<OrderReadDto>(driver, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 7, 1),
            GuestCount = 0
        });
        Assert.Null(placeholder.CompanyId);
        await PostAsync<ItineraryDayReadDto>(driver, $"/api/orders/{placeholder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 7, 1),
            DriverId = driverUser.DriverId
        });
        await PostAsync<ItineraryDayReadDto>(driver, $"/api/orders/{placeholder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 7, 2),
            DriverId = driverUser.DriverId
        });
        await PostAsync<ItineraryDayReadDto>(driver, $"/api/orders/{placeholder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 7, 3),
            DriverId = driverUser.DriverId
        });

        var unbound = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 7, 1),
            GuestCount = 1
        });
        Assert.Null(unbound.CompanyId);
        await PostAsync<ItineraryDayReadDto>(dispatcher, $"/api/orders/{unbound.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 7, 1)
        });
        await PostAsync<ItineraryDayReadDto>(dispatcher, $"/api/orders/{unbound.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 7, 2)
        });

        var blocked = await dispatcher.PutAsJsonAsync(
            $"/api/orders/{unbound.Id}/driver",
            new AssignDriverDto { DriverId = driverUser.DriverId, FailOnConflict = true });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await driver.GetAsync($"/api/orders/{placeholder.Id}")).StatusCode);

        var real = await PostAsync<OrderReadDto>(company, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 7, 1),
            GuestCount = 4
        });
        Assert.Equal(companyUser.CompanyId, real.CompanyId);
        await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{real.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 7, 2)
        });
        await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{real.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 7, 3)
        });
        await PutAsync<OrderReadDto>(company, $"/api/orders/{real.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherUser.Id
        });

        var overwritten = await PutAsync<AssignmentResultDto>(dispatcher, $"/api/orders/{real.Id}/driver", new AssignDriverDto
        {
            DriverId = driverUser.DriverId,
            FailOnConflict = true
        });
        Assert.Equal(2, overwritten.UpdatedDayCount);
        Assert.Empty(overwritten.Warnings);
        Assert.Equal(HttpStatusCode.NotFound, (await driver.GetAsync($"/api/orders/{placeholder.Id}")).StatusCode);
        Assert.DoesNotContain(placeholder.Id, await OrderIdsAsync(driver));
        Assert.Contains(real.Id, await OrderIdsAsync(driver));

        var stillUnbound = await dispatcher.GetFromJsonAsync<OrderReadDto>($"/api/orders/{unbound.Id}", JsonOptions);
        Assert.All(stillUnbound!.Days, day => Assert.Null(day.DriverId));

        var otherReal = await PostAsync<OrderReadDto>(company, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 7, 2),
            GuestCount = 1
        });
        var otherDay = await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{otherReal.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 7, 2)
        });
        var stillConflict = await dispatcher.PutAsJsonAsync(
            $"/api/orders/{otherReal.Id}/days/{otherDay.Id}",
            new ItineraryDayWriteDto
            {
                ServiceDate = otherDay.ServiceDate,
                DriverId = driverUser.DriverId,
                FailOnConflict = true
            });
        Assert.Equal(HttpStatusCode.Conflict, stillConflict.StatusCode);

        await company.DeleteAsync($"/api/orders/{real.Id}");
        await company.DeleteAsync($"/api/orders/{otherReal.Id}");
        await dispatcher.DeleteAsync($"/api/orders/{unbound.Id}");
    }

    [Fact]
    public async Task Real_order_day_assign_deletes_overlapping_driver_placeholder()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"pd_{suffix}", "按天覆盖公司", "company", $"按天覆盖公司{suffix}");
        var dispatcher = _factory.CreateClient();
        var dispatcherUser = await TestAuth.RegisterAsync(dispatcher, $"pdd_{suffix}", "按天覆盖调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherUser.Id, companyUser.CompanyId!.Value);
        var driver = _factory.CreateClient();
        var driverUser = await TestAuth.RegisterAsync(driver, $"pdg_{suffix}", "按天覆盖司导", "driver");

        var placeholder = await PostAsync<OrderReadDto>(driver, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 8, 10),
            GuestCount = 0
        });
        await PostAsync<ItineraryDayReadDto>(driver, $"/api/orders/{placeholder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 8, 10),
            DriverId = driverUser.DriverId
        });
        await PostAsync<ItineraryDayReadDto>(driver, $"/api/orders/{placeholder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 8, 11),
            DriverId = driverUser.DriverId
        });

        var real = await PostAsync<OrderReadDto>(company, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 8, 11),
            GuestCount = 2
        });
        var realDay = await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{real.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 8, 11)
        });
        await PutAsync<OrderReadDto>(company, $"/api/orders/{real.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherUser.Id
        });

        var assigned = await PutAsync<ItineraryDayReadDto>(dispatcher, $"/api/orders/{real.Id}/days/{realDay.Id}", new ItineraryDayWriteDto
        {
            ServiceDate = realDay.ServiceDate,
            DriverId = driverUser.DriverId,
            FailOnConflict = true
        });
        Assert.Equal(driverUser.DriverId, assigned.DriverId);
        Assert.Empty(assigned.Warnings);
        Assert.Equal(HttpStatusCode.NotFound, (await driver.GetAsync($"/api/orders/{placeholder.Id}")).StatusCode);

        await company.DeleteAsync($"/api/orders/{real.Id}");
    }

    [Fact]
    public async Task Driver_claim_real_order_overwrites_own_placeholder()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"cl_{suffix}", "领取公司", "company", $"领取公司{suffix}");
        var driver = _factory.CreateClient();
        var driverUser = await TestAuth.RegisterAsync(driver, $"clg_{suffix}", "领取司导", "driver");

        var placeholder = await PostAsync<OrderReadDto>(driver, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 9, 1),
            GuestCount = 0
        });
        await PostAsync<ItineraryDayReadDto>(driver, $"/api/orders/{placeholder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 9, 1),
            DriverId = driverUser.DriverId
        });
        await PostAsync<ItineraryDayReadDto>(driver, $"/api/orders/{placeholder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 9, 2),
            DriverId = driverUser.DriverId
        });
        await PostAsync<ItineraryDayReadDto>(driver, $"/api/orders/{placeholder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 9, 3),
            DriverId = driverUser.DriverId
        });

        var real = await PostAsync<OrderReadDto>(company, "/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = $"P-CLAIM-{suffix}",
            StartDate = new DateOnly(2037, 9, 2),
            GuestCount = 3
        });
        Assert.Equal(companyUser.CompanyId, real.CompanyId);
        await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{real.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 9, 2)
        });
        await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{real.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 9, 3)
        });

        var found = await driver.GetFromJsonAsync<List<OrderReadDto>>($"/api/orders?orderNo=P-CLAIM-{suffix}", JsonOptions);
        Assert.Contains(found!, item => item.Id == real.Id);

        var claimed = await driver.PutAsJsonAsync(
            $"/api/orders/{real.Id}/driver",
            new AssignDriverDto { DriverId = driverUser.DriverId });
        claimed.EnsureSuccessStatusCode();
        var result = await claimed.Content.ReadFromJsonAsync<AssignmentResultDto>(JsonOptions);
        Assert.Equal(2, result!.UpdatedDayCount);
        Assert.Empty(result.Warnings);
        Assert.Equal(HttpStatusCode.NotFound, (await driver.GetAsync($"/api/orders/{placeholder.Id}")).StatusCode);
        Assert.DoesNotContain(placeholder.Id, await OrderIdsAsync(driver));
        Assert.Contains(real.Id, await OrderIdsAsync(driver));

        var detail = await driver.GetFromJsonAsync<OrderReadDto>($"/api/orders/{real.Id}", JsonOptions);
        Assert.All(detail!.Days, day => Assert.Equal(driverUser.DriverId, day.DriverId));

        await company.DeleteAsync($"/api/orders/{real.Id}");
    }

    [Fact]
    public async Task Driver_claim_is_assigned_by_the_order_dispatcher()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"ca_{suffix}", "领取归属公司", "company", $"领取归属公司{suffix}");
        var dispatcher = _factory.CreateClient();
        var dispatcherUser = await TestAuth.RegisterAsync(dispatcher, $"cad_{suffix}", "发号调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherUser.Id, companyUser.CompanyId!.Value);
        var other = _factory.CreateClient();
        var otherUser = await TestAuth.RegisterAsync(other, $"cao_{suffix}", "其他调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, otherUser.Id, companyUser.CompanyId.Value);
        var driver = _factory.CreateClient();
        var driverUser = await TestAuth.RegisterAsync(driver, $"cag_{suffix}", "领取归属司导", "driver");

        var order = await PostAsync<OrderReadDto>(company, "/api/orders", new OrderWriteDto
        {
            PlatformOrderNo = $"P-CLAIM-BY-{suffix}",
            StartDate = new DateOnly(2037, 10, 4),
            GuestCount = 2
        });
        await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 10, 4)
        });
        await PostAsync<ItineraryDayReadDto>(company, $"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = new DateOnly(2037, 10, 5)
        });
        await PutAsync<OrderReadDto>(company, $"/api/orders/{order.Id}/dispatcher", new AssignDispatcherDto
        {
            DispatcherUserId = dispatcherUser.Id
        });

        var claimed = await driver.PutAsJsonAsync(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = driverUser.DriverId });
        claimed.EnsureSuccessStatusCode();

        var detail = await dispatcher.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.All(detail!.Days, day =>
        {
            Assert.Equal(driverUser.DriverId, day.DriverId);
            Assert.Equal(dispatcherUser.Id, day.AssignedByUserId);
            Assert.Equal("发号调度", day.AssignedByName);
        });

        var blocked = await other.PutAsJsonAsync(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = null });
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);

        var cleared = await dispatcher.PutAsJsonAsync(
            $"/api/orders/{order.Id}/driver",
            new AssignDriverDto { DriverId = null });
        cleared.EnsureSuccessStatusCode();
        var after = await company.GetFromJsonAsync<OrderReadDto>($"/api/orders/{order.Id}", JsonOptions);
        Assert.All(after!.Days, day =>
        {
            Assert.Null(day.DriverId);
            Assert.Null(day.AssignedByUserId);
        });
        Assert.DoesNotContain(order.Id, await OrderIdsAsync(driver));

        await company.DeleteAsync($"/api/orders/{order.Id}");
    }

    [Fact]
    public async Task Dispatcher_can_bind_then_company_sees_and_unbind_hides()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"bd_{suffix}", "绑定公司", "company", $"绑定公司{suffix}");
        var dispatcher = _factory.CreateClient();
        var dispatcherUser = await TestAuth.RegisterAsync(dispatcher, $"bdd_{suffix}", "绑定调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherUser.Id, companyUser.CompanyId!.Value);

        var created = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto
        {
            StartDate = new DateOnly(2037, 6, 1),
            GuestCount = 1
        });
        Assert.Null(created.CompanyId);
        Assert.Equal(dispatcherUser.Id, created.AssignedDispatcherUserId);
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(company));

        var bound = await PutAsync<OrderReadDto>(dispatcher, $"/api/orders/{created.Id}", new OrderWriteDto
        {
            StartDate = created.StartDate,
            GuestCount = created.GuestCount,
            CompanyId = companyUser.CompanyId
        });
        Assert.Equal(companyUser.CompanyId, bound.CompanyId);
        Assert.Contains(created.Id, await OrderIdsAsync(company));
        Assert.Contains(created.Id, await OrderIdsAsync(dispatcher));

        var missing = await dispatcher.PutAsJsonAsync($"/api/orders/{created.Id}", new OrderWriteDto
        {
            StartDate = created.StartDate,
            GuestCount = created.GuestCount,
            CompanyId = Guid.NewGuid()
        });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Equal(companyUser.CompanyId, (await dispatcher.GetFromJsonAsync<OrderReadDto>($"/api/orders/{created.Id}", JsonOptions))!.CompanyId);

        var unbound = await PutAsync<OrderReadDto>(dispatcher, $"/api/orders/{created.Id}", new OrderWriteDto
        {
            StartDate = created.StartDate,
            GuestCount = created.GuestCount,
            CompanyId = null
        });
        Assert.Null(unbound.CompanyId);
        Assert.Equal(dispatcherUser.Id, unbound.AssignedDispatcherUserId);
        Assert.DoesNotContain(created.Id, await OrderIdsAsync(company));
        Assert.Contains(created.Id, await OrderIdsAsync(dispatcher));

        await dispatcher.DeleteAsync($"/api/orders/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, (await dispatcher.GetAsync($"/api/orders/{created.Id}")).StatusCode);
    }

    [Fact]
    public async Task Company_dispatcher_assigning_a_driver_makes_them_a_member()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var date = new DateOnly(2038, 4, 2);
        var company = _factory.CreateClient();
        var companyUser = await TestAuth.RegisterAsync(company, $"mb_{suffix}", "入会公司", "company", $"入会公司{suffix}");
        var otherCompany = _factory.CreateClient();
        var otherCompanyUser = await TestAuth.RegisterAsync(otherCompany, $"mbo_{suffix}", "外公司", "company", $"外公司{suffix}");
        var dispatcher = _factory.CreateClient();
        var dispatcherUser = await TestAuth.RegisterAsync(dispatcher, $"mbd_{suffix}", "入会调度", "driver");
        await TestAuth.PromoteDispatcherAsync(_factory.Services, dispatcherUser.Id, companyUser.CompanyId!.Value);
        var driver = _factory.CreateClient();
        var driverUser = await TestAuth.RegisterAsync(driver, $"mbg_{suffix}", "入会司导", "driver");
        var claimer = _factory.CreateClient();
        var claimerUser = await TestAuth.RegisterAsync(claimer, $"mbc_{suffix}", "认领司导", "driver");

        Assert.DoesNotContain(driverUser.DriverId!.Value, await DriverIdsAsync(company));

        var order = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto
        {
            StartDate = date,
            GuestCount = 1,
            CompanyId = companyUser.CompanyId
        });
        await PostAsync<ItineraryDayReadDto>(dispatcher, $"/api/orders/{order.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = date
        });
        var assigned = await dispatcher.PutAsJsonAsync($"/api/orders/{order.Id}/driver", new AssignDriverDto
        {
            DriverId = driverUser.DriverId
        });
        assigned.EnsureSuccessStatusCode();
        Assert.Contains(driverUser.DriverId.Value, await DriverIdsAsync(company));

        assigned = await dispatcher.PutAsJsonAsync($"/api/orders/{order.Id}/driver", new AssignDriverDto
        {
            DriverId = driverUser.DriverId
        });
        assigned.EnsureSuccessStatusCode();
        Assert.Equal(1, (await DriverIdsAsync(company)).Count(id => id == driverUser.DriverId));

        var unbound = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto
        {
            StartDate = date.AddDays(3),
            GuestCount = 1
        });
        var outsider = await TestAuth.RegisterAsync(_factory.CreateClient(), $"mbu_{suffix}", "无公司司导", "driver");
        (await dispatcher.PutAsJsonAsync($"/api/orders/{unbound.Id}/driver", new AssignDriverDto
        {
            DriverId = outsider.DriverId
        })).EnsureSuccessStatusCode();
        Assert.DoesNotContain(outsider.DriverId!.Value, await DriverIdsAsync(company));

        var foreign = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto
        {
            StartDate = date.AddDays(6),
            GuestCount = 1,
            CompanyId = otherCompanyUser.CompanyId
        });
        var foreignDriver = await TestAuth.RegisterAsync(_factory.CreateClient(), $"mbf_{suffix}", "外公司司导", "driver");
        (await dispatcher.PutAsJsonAsync($"/api/orders/{foreign.Id}/driver", new AssignDriverDto
        {
            DriverId = foreignDriver.DriverId
        })).EnsureSuccessStatusCode();
        Assert.DoesNotContain(foreignDriver.DriverId!.Value, await DriverIdsAsync(otherCompany));
        Assert.DoesNotContain(foreignDriver.DriverId.Value, await DriverIdsAsync(company));

        var claimOrder = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto
        {
            StartDate = date.AddDays(9),
            GuestCount = 1,
            CompanyId = companyUser.CompanyId
        });
        (await claimer.PutAsJsonAsync($"/api/orders/{claimOrder.Id}/driver", new AssignDriverDto
        {
            DriverId = claimerUser.DriverId
        })).EnsureSuccessStatusCode();
        Assert.Contains(claimerUser.DriverId!.Value, await DriverIdsAsync(company));

        var dayDriver = await TestAuth.RegisterAsync(_factory.CreateClient(), $"mbday_{suffix}", "按天司导", "driver");
        var dayOrder = await PostAsync<OrderReadDto>(dispatcher, "/api/orders", new OrderWriteDto
        {
            StartDate = date.AddDays(12),
            GuestCount = 1,
            CompanyId = companyUser.CompanyId
        });
        var day = await PostAsync<ItineraryDayReadDto>(dispatcher, $"/api/orders/{dayOrder.Id}/days", new ItineraryDayWriteDto
        {
            ServiceDate = date.AddDays(12)
        });
        (await dispatcher.PutAsJsonAsync($"/api/orders/{dayOrder.Id}/days/{day.Id}", new ItineraryDayWriteDto
        {
            ServiceDate = date.AddDays(12),
            DriverId = dayDriver.DriverId
        })).EnsureSuccessStatusCode();
        Assert.Contains(dayDriver.DriverId!.Value, await DriverIdsAsync(company));
    }

    private async Task<List<Guid>> DriverIdsAsync(HttpClient client)
    {
        var drivers = await client.GetFromJsonAsync<List<DriverReadDto>>("/api/drivers", JsonOptions);
        return drivers!.Select(item => item.Id).ToList();
    }

    private async Task<HashSet<Guid>> OrderIdsAsync(HttpClient client)
    {
        var orders = await client.GetFromJsonAsync<List<OrderReadDto>>("/api/orders", JsonOptions);
        return orders!.Select(item => item.Id).ToHashSet();
    }

    private static async Task<T> PostAsync<T>(HttpClient client, string url, object body)
    {
        var response = await client.PostAsJsonAsync(url, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions))!;
    }

    private static async Task<T> PutAsync<T>(HttpClient client, string url, object body)
    {
        var response = await client.PutAsJsonAsync(url, body);
        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync();
            throw new HttpRequestException($"{(int)response.StatusCode} {response.ReasonPhrase} for PUT {url}: {detail}");
        }

        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions))!;
    }
}
