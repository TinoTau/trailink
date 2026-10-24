# 本人行程 SSOT 复核

## 目标

复核已完成的公司/调度员行程代码：逻辑只留一条路径，去掉死代码和重复事实来源。

## 对应模块

1. 现有模块：登录身份、`/driver/calendar`、公司页。
2. 改动文件：`DriverIdentity`、`AuthController`、`AuthDtos`、`DriverCalendarPage`、`driver-calendar.css`、`CompanyPage`、`ProfilePage`、`types.ts`、`FRONTEND_DESIGN.md`、`API_CONTRACT.md`。
3. 已有 `DriverIdentity` 与日历页，不另开路径。
4. 日历身份只认 `users.driver_id`；行程只读 `GET /api/orders`。
5. 不新增表。
6. 现有订单写入不变。

## 发现与处理

- 注册手写 `drivers` 行，登录/`me` 又走 `EnsureAsync`。合并为 `Attach` / `EnsureAsync`。
- 全员已有 `driverId` 后，日历下拉、`localStorage` 预览司导、`pickDriverId`、`GET /api/drivers` 已无入口。全部删除，领取/建单只写登录 `driverId`。
- 会话同时返回 `pendingApplication` 与列表。去掉单数字段，个人信息只读列表。
- 公司页 `load` 与 `applyHome` 各写一遍状态。合并到 `applyHome`。

## 未改（有意留下）

- `POST /api/driver-calendar/claim|range` 与预览接口仍按旧「预览司机」分配。前端不调用；契约写明保留。
- `/orders`、`/drivers` 旧列表仍给公司账号直开 URL，调度台和日历不链过去。

## 命令结果

- `dotnet test`：22 通过。

## 浏览器

- `/driver/calendar`（北岛管理）：标题本人，无司导下拉，有调度台/行程管理。
