# 公司与调度员看本人行程

## 目标

调度员和公司账号也要能看自己的日历，因为这些角色也要跑单。继续用 `/driver/calendar`，给账户补 `drivers` 行，不另做调度员日历。

## 对应模块

1. 现有模块：登录、`/driver/calendar`、调度台/公司/个人信息入口。
2. 改动文件：`DriverIdentity.cs`（新）、`AuthController`、`App.tsx`、`DriverCalendarPage`、调度台/公司/个人信息页、`DemoDataSeeder`、`AuthFlowTests`、权威文档。
3. 已有同一套行程日历与派单写入，不另开日历产品。
4. 不产生第二事实来源：日历仍按 `users.driver_id` 过滤 `itinerary_days.driver_id`。
5. 不新增表；公司/调度员复用现有 `drivers`。
6. 现有订单 API 不变。

## 改动

- 注册公司或司导时写 `drivers`；已有账户登录或 `me` 时若没有 `driver_id` 则补写。
- 调度员可进 `/driver`；日历锁定登录用户 `driverId`，不再出现切换其他司导的下拉。
- 调度台、公司信息、个人信息增加「我的行程」；非司导另有「调度台」。
- 演示种子为 7 名公司/调度员预写司机行；本轮未重跑种子，避免清掉现有申请数据。陈调度、北岛管理登录后已由 `EnsureAsync` 补出行。

## 命令结果

- `dotnet test --filter AuthFlowTests`：3 通过，含公司注册必有 `DriverId`。
- API 已重启到 `http://localhost:5168`。

## 浏览器

- 陈调度：调度台出现「陈调度」司导图标；「我的行程」标题为本人，无司导下拉，有「调度台」；行程管理可领取/框选。
- 北岛管理：公司页有「调度台」「我的行程」；日历锁定「北岛管理」，无司导下拉。

## 未做

- 未重跑 `--seed-demo`。
- 未按公司隔离订单。
- 未做订单附件上传。
