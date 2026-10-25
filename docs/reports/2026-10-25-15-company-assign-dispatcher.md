# 公司整单分配给调度员

日期：2026-10-25

## 目标

公司账户有类似调度台的界面，把订单整单分给调度员。同一时间只能分给一位。复用现有订单，不另建订单系统。

## 对应现有模块

`OrdersController` / `Order` / 现有订单 DTO / `DispatcherPage` / `frontend/src/api/orders.ts`。新增的是订单上一层 `assigned_dispatcher_user_id` 和 `PUT /api/orders/{id}/dispatcher`。页面复用 `/company/assign` 的同一套调度台。

## 改动

- `orders.assigned_dispatcher_user_id`：`NULL` 在公司池；调度员建单默认写自己。
- 迁移 `20261025005144_AddOrderAssignedDispatcher`：回填创建人角色为 dispatcher 的旧单。
- `GET /api/orders` 无 `orderNo` 时，调度员只看分给自己的单。
- 公司菜单「派给调度」打开 `DispatcherPage`，右侧是本公司调度员，拖订单或拖天都整单写入该字段。
- 测试 `Company_assigns_whole_order_to_one_dispatcher`。
- 权威文档已同步。

## 命令结果

- `dotnet ef database update`：已应用 `AddOrderAssignedDispatcher`。
- `dotnet test`：通过 30，失败 0。

## 浏览器验证

北岛管理 `/company/assign`：标题「派给调度」，右侧陈调度 / 林调度。未分配放入 `公司池验证` 后拖到林调度，提示「已整单分配给调度员」。所有订单显示「公司池验证 12月15日 林调度」。林卡片「已分给 林调度 3 单」，12 月 15 日有标记。`lin` 的 `GET /api/orders` 看得到该单，`chen` 看不到。验证后已收回公司池。

## 未做

- 未提交。
- 未重新 seed。
- 验证单 `TL-20261025-5CFBD2`（公司池验证）仍在公司池，未删除。
- 未做按天拆给多个调度员（按需求禁止）。

## 下一步

公司可在「派给调度」把池里的单分给调度员；调度员再在调度台把行程日派给司导。
