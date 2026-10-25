# 行程管理拖选日期不再挤走日历

## 目标

拖选新建订单时，第一次点日期不应让日历跟着面板长高滑走，避免选错天。

## 对应模块

1. 现有模块：`DriverCalendarPage` 行程管理框选建单。
2. 改动：`DriverCalendarPage.tsx`、`driver-calendar.css`、`FRONTEND_DESIGN.md`。
3. 建单仍走 `createOrderWithDays`。
4. 不另开日历或建单接口。
5. 未新增表。
6. 未改 API。

## 原因

第一次 `pointerdown` 就插入「添加…仅日期」，面板变高、滚动区变矮，日期格在屏幕上移。手指还在原地，`pointerenter` 落到别的天。日期按钮被聚焦时，浏览器也可能把格子滚进视口。

## 改动

- 打开行程管理且未在取消时，先占住确认按钮的 36px 高度，未选日期时隐藏。
- 拖选 `pointerdown` 时 `preventDefault`，避免按钮聚焦带动滚动。
- 日历滚动容器关掉 `overflow-anchor`。

## 验证

王司导行程管理：点 11 月 15 日前后，面板高度 224、滚动区 320、该日屏幕 Y 均不变。
