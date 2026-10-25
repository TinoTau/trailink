# 执行报告：调度员订单备注按人隔离

## 目标

每个调度员给同一订单的调度备注互相独立、只自己可见。

## 对应模块与改动

`orders.notes` 是全员共享的一条，无法按人隔离，因此新增 `order_notes`（`user_id` + `order_id`），仍走现有 `GET/PUT /api/orders` 的 `notes`。司导备注仍是 `orders.driver_notes`。不是派单表。

- 模型 / Fluent / `OrdersController`：读写当前用户自己的调度备注；写入用 `ON CONFLICT` 更新。
- 迁移 `20261025003802_AddOrderViewerNotes`：旧 `orders.notes` 回填给 `created_by_user_id`，再删列。
- 演示种子改为给创建人写 `order_notes`。
- 测试：`Order_notes_are_private_to_each_dispatcher`。
- 文档：`DATABASE_CONTRACT.md`、`API_CONTRACT.md`、`PRD.md`、`FRONTEND_DESIGN.md`、`ARCHITECTURE.md`、`DEVELOPMENT_PLAN.md`。

## 命令结果

- `dotnet test`：29 通过。
- 库：霍比特村备注属 `lin`，奥克兰接机属 `chen`。
- 浏览器北岛管理：`GET /api/orders` 看不到陈/林的调度备注。

## 未做

- 未重播种、未提交。
