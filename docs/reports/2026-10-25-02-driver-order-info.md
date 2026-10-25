# 司导点日期复用调度台订单明细

## 目标

司导日历点有行程的日期时，除活动外还要看到并编辑订单号、备注、截图，与调度台订单卡同一套，不另写编辑页。

## 对应模块

1. 现有模块：调度台 `DispatcherCalendarCard` 订单信息、`DriverDayEditor`、`PUT /api/orders/{id}`。
2. 改动：抽出 `OrderInfoFields` / `OrderInfoEditor`、`updateOrderInfo`；调度台与司导共用；权威文档同步。
3. 已有同类能力：调度台笔记图标改公司订单号和备注。
4. 未新增订单表或平行编辑 API。
5. 未新增数据库实体。
6. 未改后端契约。

## 改动

- `frontend/src/pages/OrderInfoFields.tsx`：共用表单（系统订单号、公司订单号、备注、截图、保存）。
- `frontend/src/api/orders.ts`：`updateOrderInfo` 只改 `platformOrderNo` / `notes`，其余字段保持原值。
- 调度台卡片改用 `OrderInfoFields` + `updateOrderInfo`。
- 司导点日期：`DriverDayEditor` 传入 `showOrderInfo`，展开同一套表单后再编辑活动。

## 验证

陈调度「我的行程」点 10 月 28 日：卡片出现 `TL-20261024-D56E04`、日期范围、公司订单号、备注、截图、添加活动。写入 `P-DRV-TEST` / `司导端改备注` 后提示「订单已保存」，`GET /api/orders` 已落库。调度台打开同一单笔记区，字段与保存值一致。

## 未做

- 未改调度台「点某一天只编活动、不和订单信息叠卡」的交互。
- 未提交。
