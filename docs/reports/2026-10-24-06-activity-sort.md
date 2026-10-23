# 活动改为手动拖动排序

## 目标

行程详情活动按拖动顺序展示，不再按预订时间排序。

## 改动

- `order_activities` 新增 `sort_order`；增量 Migration `AddActivitySortOrder`，已有数据按原时间+内容回填。
- 列表/订单详情/日历预览一律按 `sort_order`。
- `PUT /api/orders/{orderId}/days/{dayId}/activities/reorder` 写入顺序。
- 司机日历详情可拖动；新建活动排到当天末尾。
- 同步 `API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`FRONTEND_DESIGN.md`、`PRD.md`。
- 测试 `Activity_order_is_manual_not_by_time`。

## 验证

- `dotnet ef database update` 成功。
- API 测试：15 通过；`CalendarPreviewTests` 1 个失败（预览司机选择与本改动无关，库里已有「日历预览司机」天数更多）。
- 11 月 1 日重排后顺序为 观鲸3 / 观鲸2 / 观鲸4 / 观鲸1；无时间的 观鲸3 可排在有时间的项目之前。

## 未做

- 调度端订单页未加拖动手势，但读取同一 `sort_order`。
- 未修预览司机测试的既有数据依赖。

## 下一步

无阻塞。
