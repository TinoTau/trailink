# 执行报告：调度台派单界面

## 目标

实现调度员派单台：上半未完成/未分配订单，下半司导大图标，拖拽整单分配，冲突拒绝；司导置顶、排序、移出展示区；已分配颜色可改。

## 改动

1. 对应现有订单 / 司机 / 整单派单模块，不新建订单系统或派单表。
2. `OrderReadDto` 增加 `assignedDriverId`；`AssignDriverDto` 增加 `failOnConflict`（默认 false）。
3. `OrderDriverAssignment`：冲突且 `failOnConflict` 时不保存。
4. 前端新页 `/dispatcher`（独立白底，不复制订单列表）。置顶/排序/隐藏/颜色/姓名走 localStorage。
5. 权威文档已同步。测试覆盖列表分配字段、冲突仍可保存（旧语义）、`failOnConflict` 返回 409。

## 命令结果

- `npm run lint`：通过（既有 warning + 调度台 ref 已改到 effect）。
- `npm run build`：通过。
- 首次 `dotnet test`：Postgres 未启动，4 个相关测试 500。启动 Docker / postgres 后 `--no-build` 复跑：通过 4。
- 前端 `http://localhost:5173/`，API `http://localhost:5168`，调度台 `/dispatcher`。

## 未做

- 无登录，姓名只是本机预览。
- 未做调度员日历。
- 已分配订单不可再从调度台拖去改派。

## 阻塞

无。

## 下一步

启动或确认 API / 前端，打开 `/dispatcher`。
