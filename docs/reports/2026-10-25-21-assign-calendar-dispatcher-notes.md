# 派给调度：日历标司导与调度员备注

日期：2026-10-25

## 目标

公司在派给调度点开订单时，日历按天标注司导。公司可以给每位调度员写备注，调度员自己看不到。

## 对应现有模块

`GET /api/orders` 行程日、`DispatcherPage` 派给调度日历、`GET /api/company` 调度员列表。公司给调度员的备注不能复用 `driver_notes`（主键是司导），因此新增 `dispatcher_notes`。

## 改动

- 订单列表带上行程日 `driverName`。派给调度订单日历按 `driver_id` 着色，格子标司导姓。
- 新表 `dispatcher_notes`（`user_id` + `dispatcher_user_id`）。`GET /api/company` 的 `dispatchers[].notes` 与 `PUT /api/company/dispatchers/{userId}/notes` 只读写当前公司账户。
- 派给调度头像优先显示公司给该调度的备注；点开订单池可改。
- 契约、库结构、PRD、FRONTEND_DESIGN、ARCHITECTURE、DEVELOPMENT_PLAN 已同步。

## 命令结果

- `dotnet ef migrations add AddDispatcherViewerNotes`：已生成 `20261025014841_AddDispatcherViewerNotes`。
- `dotnet ef database update`：已建 `dispatcher_notes`。
- `dotnet test`：通过 33。

## 浏览器验证

北岛 `/company/assign` 点「11月2日」：11 月 2 / 3 / 4 日标「王」，不是调度员姓。给林调度写入「北岛给林的备注」后，头像下方显示该备注。`lin` 读 `GET /api/company` 的 `dispatchers` 为空，看不到这条。

## 未做

- 未提交。
- 未重置演示数据。林调度现有公司备注「北岛给林的备注」。
