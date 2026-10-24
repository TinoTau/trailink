# 调度台 SSOT 收敛

## 目标

按审查清单收敛重复实现和死代码：共用建单、月历/色板、拆单判断；去掉未用客户端和死样式。不另开订单路径。

## 对应模块

1. 现有模块：调度台、司导日历、订单 API、行程日派单。
2. 改动文件：`orders.ts`、`localDate.ts`（从 `pages/driver` 上移）、`calendarUi.ts`、`orderFlags.ts`、调度台/司导页面、`App.tsx`、`dispatcher.css`、`OrderDriverAssignment`、`ItineraryDaysController`、权威文档。
3. 已有功能：框选建单、月历格子、拆单判断原先各写一份。
4. 没有第二个事实来源：建单仍走 `POST /api/orders` + `POST days`。
5. 不新增数据库实体。
6. HTTP 契约不变；前端不再封装 `claim` / `range`。

## 改动

- `createOrderWithDays`：调度台不传 `driverId`，司导传当前司导。
- 日期格子、`WEEKDAYS`、`formatMonthDay`、`toDateOnly` 并进 `src/localDate.ts`；色板进 `calendarUi.ts`。
- `isSplitOrder` / `splitOrderHint` 只留 `orderFlags.ts`。
- 删除无人引用的 `frontend/src/api/driverCalendar.ts`。后端 preview / claim / range 仍保留。
- 去掉订单卡未传入的 `selectedDate`、死 CSS、`reloadCalendar` 别名、`App` 不可达的 dispatcher 选中分支。
- 整单/按天冲突：先查再改 tracked 实体，409 不脏写。

## 命令结果

- `npm run lint`：仅原有 warning。
- `npm run build`：通过（顺带修了 `--assigned-color` 与笔记开关的类型错误）。
- `dotnet test`：18 通过；`Preview_returns_only_server_chosen_driver_and_ignores_client_driver_id` 失败。该测试按全库派单天数选预览司机，共享库里已有司机天数超过本用例的 10 天，与本次改动无关。

## 浏览器

- `/dispatcher` 框选 2027-01-28 建单：出现 `TL-20261024-7713E1`，日历显示「未派」。
- `/driver/calendar` 框选 2026-12-31 建单：`TL-20261024-5769A1` 已绑「李师傅-派单」，格子 `has-trip`。
- 验证后已删除这两笔订单。

## 未做

- 未改领取/订单编辑的 `failOnConflict` 默认 false。
- 未让后端 `POST /api/driver-calendar/range` 改走 `OrderDriverAssignment`。
- 未合并 `OrderEditPage` 的 dayjs 日期辅助。

## 下一步

预览测试若要稳定，需与共享库隔离，或按用例自己指定 `Calendar:PreviewDriverId`。
