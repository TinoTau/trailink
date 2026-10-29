# 我的行程冲突日期显示调度员

## 目标

我的行程里，重复日期弹出的几个按钮要显示调度员名字，规则与普通日期格相同，不再写「订单」。这些按钮不画背景图案。同一天里的几张订单按各自起始日期从早到晚排列。

## 改动

- `DriverCalendarPage.tsx`：冲突日期仍用 `conflictDateChoices` 和 `ConflictDatePopover`。文字改为 `driverAssignerCaption`。传入的订单先按 `orderSpan` 的起始日排序，同一天再按订单 id。`patterns: false`。
- `ConflictDatePopover.tsx`：图案改为可选。不传图案时按钮不设置背景图。调度台调用不传这个选项，仍画图案。
- `docs/PRD.md`、`docs/FRONTEND_DESIGN.md`：写明我的行程的同日按钮不画图案，并按起始日期排序。

## 验证

林调度的我的行程，11 月 5 日冲突格普通显示是「NL林调度」。点开后两个按钮都没有背景图，文字分别是「好 11月5日 NL林调度」和「11月5日 NL林调度」。对应订单起始日是 11 月 3 日和 11 月 5 日，弹框顺序与此一致。没有点第二次，没有解除行程。

未打包，未改数据库。
