# 调度备注与司导备注分开

## 目标

订单备注按调度 / 司导分开，各自只看自己写的。不另建备注表或接口。

## 对应模块

1. 现有模块：`orders.notes`、调度台订单卡、`OrderInfoFields`、`PUT /api/orders/{id}`。
2. 改动：增量迁移加 `orders.driver_notes`；读写仍走现有订单更新。
3. 已有同类能力：同一套订单信息表单，只是备注字段拆开。
4. 未形成第二套备注系统。
5. 未新增实体表。
6. 司导身份读取时不再返回调度备注；司导写入不能改 `notes`。

## 改动

- 迁移 `20261024175449_AddOrderDriverNotes`：`ALTER TABLE orders ADD driver_notes text`。
- 调度台只读写 `notes`（调度备注）；我的行程只读写 `driverNotes`（司导备注）。
- 表单仍共用 `OrderInfoFields` / `updateOrderInfo`。

## 验证

- `dotnet test --filter Order_dispatcher_and_driver_notes_stay_separate`：通过。
- 我的行程点 10 月 28 日：标签为「司导备注」，看不到原先调度备注「司导端改备注」；写入「仅司导可见的备注」后落库 `driver_notes`。
- 调度台同一单：标签为「调度备注」，内容仍是「司导端改备注」，没有司导刚写的那条。

## 未做

- 未重新 seed。
- 未提交。
