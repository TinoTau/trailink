# 执行报告：订单结构调整的 SSOT 核查

日期：2026-10-23  
范围：统一 SSOT 规则、审计订单实现是否只有一条路径  
状态：无结构冲突，本轮未改业务代码

---

## 1. 目标

把订单结构调整约束固化为唯一规则文件，并确认现有实现是原位修改，不是第二套订单系统。

---

## 2. 执行前核对

| 问题 | 结论 |
|------|------|
| 对应哪个现有模块？ | `OrdersController`、`ItineraryDaysController`、现有订单页面 |
| 要改哪些现有文件？ | 本轮只改规则文件；业务代码已在上一轮原位改完 |
| 是否已有类似功能？ | 有。订单 / 行程 CRUD 和派单已存在 |
| 是否会产生第二个事实来源？ | 否。仍读 PostgreSQL 同一套表 |
| 是否需要新增数据库实体？ | 仅已批准的 `order_activities` |
| 是否会破坏现有 API 或数据？ | 否。路径仍是 `/api/orders` |

未发现需要另建替代架构的冲突。

---

## 3. 规则改动

已有同类规则 `.cursor/rules/ssot-minimal-change.mdc`。按「不得创建第二份同类规则」合并为用户指定路径：

- 新增 / 现用：`.cursor/rules/ssot.mdc`（`alwaysApply: true`）
- 删除：`.cursor/rules/ssot-minimal-change.mdc`

规则补入：必须复用的订单实现、十条禁止项、`FRONTEND_DESIGN.md` 作为前端权威文档、禁止改写 `InitialCreate`。

未新建 `PRD_V2` 或 `API_CONTRACT_NEW`。

---

## 4. 实现审计

| 检查项 | 结果 |
|--------|------|
| 订单主表 | 仅 `orders`；实体仅 `Order` |
| 每日行程 | 仅 `itinerary_days`；实体仅 `ItineraryDay` |
| 活动项目 | 仅 `order_activities`；实体仅 `OrderActivity` |
| 订单 Controller | 仅 `OrdersController`，路径 `/api/orders` |
| 行程 Controller | 仅 `ItineraryDaysController`，路径 `/api/orders/{orderId}/days` |
| 活动 Controller | 仅 `OrderActivitiesController`（允许的结构扩展） |
| 派单 | `PUT /api/orders/{orderId}/driver` 和按天更新 `driver_id`，无派单表 |
| DbContext | 仅 `TrailinkDbContext` |
| 前端页面 | `/orders`、`/orders/:orderId`，无平行订单页 |
| 前端 API | 仅 `frontend/src/api/orders.ts` |
| 日历表 | 不存在；日历未实现，契约仍规定读行程数据 |
| Migration | `InitialCreate` 保留；增量 `AdjustOrderStructure` 已应用 |
| 权威文档 | PRD / 数据库契约 / API 契约 / 前端设计已反映三层结构 |

当前模型无 `title`、`status`、`end_date` 业务字段。`EndDate` 只作为订单详情只读计算结果。

---

## 5. 构建与测试

- `dotnet test Trailink.slnx`：8 通过 / 0 失败
- `npm run build`：通过

本轮未再次执行数据库迁移。库已应用 `InitialCreate` 与 `AdjustOrderStructure`。

---

## 6. 未做事项

- 未改业务代码、实体、API 或权威需求文档（上一轮已对齐，本轮无冲突可改）
- 日历 API / 页面仍未实现
- 附件与电子票上传仍未实现

---

## 7. 下一步建议

后续日历直接查询 `itinerary_days` 与订单、司机数据，不要建日历表。附件继续扩展现有 `order_files` 和 `ticket_path`，不要另建文件系统。
