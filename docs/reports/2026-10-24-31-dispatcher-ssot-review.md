# 调度台代码审查：重复、死代码、SSOT

## 目标

审查今日完成的调度员界面及相关订单/司导写入，找出重复实现、死代码和不符合 SSOT 的路径。未改业务代码。

## 总评

没有第二条订单系统，没有平行订单表或平行 Controller。调度台只走 `ordersApi` / `driversApi`，派单只写 `itinerary_days.driver_id`。问题主要是前端实现复制，以及旧日历客户端还留着。

## 优先

1. `frontend/src/api/driverCalendar.ts` 无人引用。页面已改走 `ordersApi`。再接回去会变成第二套写入口。后端 `GET /api/driver-calendar/preview` 仍是保留接口，不是死代码。
2. `createOrderRange` 与司导 `createRange` 整段复制：31 天上限、`POST /api/orders`、循环 `createDay`。差别只在是否写 `driverId`。

## 中等

- 月历 `monthCells` / `WEEKDAYS`、对比色、月日文案、色板各写两份。
- `isSplitOrder`（多司机或未派完）与 `DriverDayEditor.splitHint`（只看多司机）不是同一条定义。
- 整单 `failOnConflict`：调度台 true，领取/订单编辑默认 false。
- `AssignAsync` 与按天 Update 先改 tracked `DriverId` 再查冲突；409 不落库，但未回滚实体。
- `POST /api/driver-calendar/claim`、`/range` 前端不用；`range` 还绕过 `OrderDriverAssignment`。
- 订单卡 `selectedDate` 从未传入，`.dispatcher-day.selected` 不生效。

## 低

- `reloadCalendar` 只是 `loadBoard` 别名。
- `App.tsx` 里 `/dispatcher` 已提前返回，后面的 selected 分支走不到 dispatcher。
- 部分 CSS（`h1`、`avatar em`）无对应 DOM；`assigned` class 无样式。
- `parseYmd` / `toDateOnly` 与 `localDate.ts` 重复。

## 不要误删

- 公开预览 API、司机/行程日 GET。
- `DriverDayEditor` 被调度台复用是正确的单一当日编辑。
- `/orders` 与 `/dispatcher` 并存是产品分层。

## 未做

- 未重构、未删文件。
