# 执行报告：我的行程日期框展示派出人

## 目标

司导界面每个有行程的日期框标出订单派出人，观感与调度台司导日历日期框一致，复用同一套渲染。

## 对照

1. 现有模块：`/driver/calendar` 日期格，调度台司导日历 `CalendarMark` 标签。
2. 改动文件：`OrdersController` / `OrderReadDto` 补 `createdByName`；共用 `CalendarDayCaption`；`DispatcherCalendarCard`、`DriverCalendarPage`、`orderFlags`、`types`；权威文档。
3. 已有类似功能：调度台用 `createdByUserId` 决定是否显示姓名。
4. 没有第二个事实来源：姓名来自现有 `orders.created_by` → `users.name`。
5. 不新增数据库实体或表。
6. 读模型多一个只读字段，不改写入。

## 改动

- 订单列表/详情带上 `createdByName`。
- 抽出 `CalendarDayCaption`（数字 + 可选姓名），调度台与我的行程共用。
- 我的行程有行程日期显示实际派出人；调度台司导日历仍只显示自己派出的姓名。

## 命令结果

- `dotnet test`：25 通过。
- 浏览器：陈调度「我的行程」10 月 28–29 显示「陈调度」。
- 王司导「我的行程」11 月 2–4 显示「陈调度」，11 月 12–13 显示「林调度」；点 11 月 2 日仍展开当日卡片。

## 未做

- 未改派单规则，未重新 seed，未提交。
