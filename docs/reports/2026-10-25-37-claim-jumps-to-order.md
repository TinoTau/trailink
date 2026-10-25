# 领取后跳到订单日期

## 目标

司导领取订单成功后，日历立刻落到该单对应日期，展开当日详情，方便确认领取结果。

## SSOT 核对

1. 对应现有 `DriverCalendarPage` 与领取入口 `claimOrder`。
2. 只改该页滚动/选中；领取仍走 `PUT /api/orders/{id}/driver`。
3. 未新增日历页、领取接口或日期表。

## 本轮改动

- 领取成功后按该单最早行程日（没有行程日则用 `startDate`）重建附近月份窗口。
- 选中该日并滚到格子，展开当日卡片。
- 月份内日期格子统一用 `driver-day-YYYY-MM-DD`，供滚动定位。
- 同步 `FRONTEND_DESIGN.md`、`PRD.md`。

## 验证结果

- `npx oxlint src/pages/driver/DriverCalendarPage.tsx`：通过。
- 已准备领取数据：`P-JUMP-a7bfc162` / `TL-20261025-D1335B`，日期 2027-03-18～19。
- 浏览器登录密码输入被自动拦截，本轮未能在页面上点领取确认滚动。

## 未做事项

- 需在司导日历用订单号领取后，目视确认落到 2027-03-18 并展开当日卡片。
