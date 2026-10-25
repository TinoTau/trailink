# 订单池标题与公司备注隔离

日期：2026-10-25

## 目标

调度员详情订单池：第一行公司备注，没有则公司订单号，都没有就空着；第二行日期；第三行天数。不写「已分配」。公司备注独立，调度员和司导看不到。

## 对应现有模块

`DispatcherPage` 订单池磁贴、`order_notes`、`PUT /api/orders` 的 `notes`。没有新表。

## 改动

- `orderPoolLabel`：备注优先于公司订单号。
- 池里第三行固定 `N 天`。
- 派给调度订单卡备注改称「公司备注」。
- 测试 `Company_order_notes_are_hidden_from_dispatcher_and_driver`。
- 契约与 PRD / FRONTEND_DESIGN 已同步。

## 命令结果

`dotnet test --filter Company_order_notes_are_hidden_from_dispatcher_and_driver`：通过 1。

## 浏览器验证

北岛写入「北岛公司备注」后，`lin` 读同一单 `notes` 为 null。林调度池：有备注的单显示「北岛公司备注 / 12月15日 / 1 天」；无备注无公司订单号的单标题空着，只留日期和天数。没有「已分配」。

## 未做

- 未提交。
- 「公司池验证」现分给林调度，公司备注为「北岛公司备注」。
