# 调度台订单区：所有订单、已分配颜色与创建订单

## 目标

订单区「所有未完成」改为「所有订单」；「已分配颜色」只在选中「所有订单」时出现；「未分配订单」左侧增加「创建订单」，框选起止日期后走与司导相同的现有建单接口。

## 对应模块与改动

1. 现有模块：调度台 `DispatcherPage` / `DispatcherCalendarCard`，复用司导 `ordersApi.create` + `createDay` 与 `localDate` 日期辅助。
2. 改动文件：`frontend/src/pages/dispatcher/DispatcherPage.tsx`、`DispatcherCalendarCard.tsx`、`dispatcher.css`、`frontend/src/pages/driver/localDate.ts`、`DriverCalendarPage.tsx`（抽出 `orderedRange` / `eachLocalDate`，不另开路径）。
3. 已有类似功能：司导行程管理框选建单。调度台创建不写 `driverId`，新单进未分配。
4. 无第二事实来源、无新实体、无新 API。
5. 文档：`docs/FRONTEND_DESIGN.md`、`PRD.md`、`DEVELOPMENT_PLAN.md`、`API_CONTRACT.md`。

## 行为

- 筛选项：创建订单 / 未分配订单 / 所有订单。
- 「所有订单」列出有行程日的全部订单；未分配仍是未完成且仍有空日期。
- 「已分配颜色」及色点只在「所有订单」出现；切回未分配会收起色点。
- 「创建订单」打开覆盖订单区的日历卡片，按住拖选起止日期，确认按钮文案与司导一致（`添加 x月x日–x月x日 仅日期`）。
- 写入：`POST /api/orders`（`startDate`、`guestCount: 0`）再按日 `POST /api/orders/{id}/days`，不传 `driverId`，最多 31 天。

## 验证

在 `http://localhost:5173/dispatcher` 实测：

- 默认「未分配订单」下按钮为「创建订单 / 未分配订单 / 所有订单」，没有「所有未完成」，也没有「已分配颜色」。
- 点「所有订单」后出现「已分配颜色」，列表含已分配与未完成单；切回「未分配订单」后颜色按钮消失。
- 点「创建订单」打开覆盖日历；点 9 月 1 日出现「添加 9月1日 仅日期」；确认后打开新单日历，当天标「未派」。
- 新单 `TL-20261023-55B0BB 9月1日 1 天` 出现在「所有订单」。因结束日早于今天，按原规则不进「未分配订单」。

## 未做

- 调度台创建不写 `driverId`（与司导自建给自己不同，否则新单不会出现在未分配）。
- 浏览器工具无法 HTML5 拖选，用单击选一天验证写入；拖选起止日期的指针逻辑与司导相同，未再单独拖测。
- 无新 Migration，无新测试。
