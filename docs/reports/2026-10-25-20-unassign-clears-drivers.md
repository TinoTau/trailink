# 整单收回同时取消司导

日期：2026-10-25

## 目标

公司把已分给调度员的订单拖回公司池是整单取消。再分给同一位调度员时，不应仍显示「已分配」（池颜色以有没有司导为准）。

## 对应现有模块

`PUT /api/orders/{id}/dispatcher`、`OrdersController.AssignDispatcher`、`itinerary_days.driver_id`。没有新表。

## 改动

- `dispatcherUserId` 为 `null` 时，除清空 `assigned_dispatcher_user_id` 外，同时清空该单各行程日 `driver_id` / `assigned_by_user_id`。
- 测试 `Company_assigns_whole_order_to_one_dispatcher`：收回后 `AssignedDayCount` 为 0，再分给原调度员仍为 0。
- 派给调度提示与 toast：拖回即整单收回，司导一并取消。
- `API_CONTRACT` / `PRD` / `FRONTEND_DESIGN` 已同步。

## 命令结果

- `dotnet test --filter Company_assigns_whole_order_to_one_dispatcher`：通过 1。
- `dotnet test`：通过 32。
- API 已重启 `http://localhost:5168`。

## 浏览器验证

北岛 `/company/assign`：林池「10月30日」原为已派司导的绿色。拖回公司池后变白，接口 `assignedDayCount=0`、各日 `driverId` 为空。再拖给林调度后仍为白底「2 天」，不再是已分配色。同池未拖回的「11月12日」仍绿，作为对照。

## 未做

- 未提交。
- 未重置演示数据。演示单 `e11b3485`（10月30日）现分给林调度，无司导。
