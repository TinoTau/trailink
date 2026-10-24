# 关进程、清库与 SSOT 审查

## 目标

关掉本项目应用进程，清空数据库，审查是否符合 SSOT；能收口的平行路径当场删掉。

## 对应模块

1. 现有模块：进程 / 库数据、订单页、司机日历写入。
2. 改动：删除旧 `/orders` `/drivers` 页和 `DriverCalendarController`；`App.tsx` 只留登录、调度台、行程、公司、个人信息；权威文档同步。
3. 旧列表页和 claim/range/preview 是第二套入口，已有调度台与 `orders` API。
4. 不另建表或第二套订单存储。
5. 未新增实体。
6. 旧 URL 重定向到角色首页；日历写只走现有订单接口。

## 进程与数据

- 已停 `Trailink.Api` 和 Vite（5168 / 5173 空闲）。
- 未停 Docker `trailink-postgres`（清库要用）。
- `TRUNCATE` 业务表，行数均为 0。未跑 `--seed-demo`。
- 清掉 `App_Data/files/{avatars,qr,tickets,orders}/`。

## 已收口

- 删除 `OrdersPage`、`DriversPage`、`OrderEditPage`。订单只在调度台 / 行程 / 公司历史里改。
- 删除 `DriverCalendarController`、`CalendarDtos`、`CalendarPreviewTests`。领取、建单、取消只走 `PUT /api/orders/{id}/driver` 与 `createOrderWithDays`。
- `/orders`、`/drivers` 重定向到角色首页。

## 仍符合 SSOT 的分叉

- `dispatcher_applications` 对向公司，`driver_applications` 对向调度员，批准都写 `company_members`。
- 公司页历史单用 `GET /api/company`，调度台用 `GET /api/orders`，不是第二张订单表。
- 历史判定前后端各算一遍（结束日 + 全派），不落库。

## 验证

- `dotnet test`：23 通过（去掉 4 条预览接口测试）。
- 未再启动接口或前端。
