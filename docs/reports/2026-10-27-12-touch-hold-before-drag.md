# 触屏按住 0.5 秒后再拖选日期

## 目标

避免滑动页面和拖选日期抢同一下手指。触屏按住不动约 0.5 秒后才开始拖选；未满时滑动仍滚动页面。鼠标按下即拖。

## 改动

- `frontend/src/calendarDay.tsx`：长按 500 毫秒、约 10 像素抖动阈值。只有拖选已经开始后，`touchmove` 才 `preventDefault`。
- `frontend/src/pages/driver/DriverCalendarPage.tsx`、`driver-calendar.css`：行程管理触屏走长按；日期格不再使用 `touch-action: none`。
- `frontend/src/pages/dispatcher/DispatcherPage.tsx`、`DispatcherCalendarCard.tsx`、`dispatcher.css`：创建订单同一套长按。订单卡片拖动未改。
- `docs/FRONTEND_DESIGN.md` 与页面提示：写明触屏长按、短滑滚动、点一下只选当天、鼠标按下即拖。

## 验证

本地 `http://127.0.0.1:5173`，合成触控事件，未点添加，未创建订单。

- 司导行程管理：立即滑过 11 月 10–13 日没有选中，且没有锁住滚动；按住 11 月 16 日超过 0.5 秒后拖到 19 日，选中 16–19 日并锁住这次滑动；鼠标按下 11 月 24 日立即选中；短按 11 月 3 日只选当天。
- 调度台创建订单：立即滑过 9 月 3–6 日没有选中；按住 9 月 9 日超过 0.5 秒后拖到 12 日，选中 9–12 日；鼠标按下 9 月 15 日立即选中；短按 9 月 19 日只选当天。随后关闭创建卡片。

## 未做

没有重新打包，没有上传。线上 `https://trailink.cc` 仍是旧前端。真机滑动手感未在手机上确认。
