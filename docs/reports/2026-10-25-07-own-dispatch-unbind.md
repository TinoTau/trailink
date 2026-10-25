# 执行报告：调度员只能从司导日历移除自己派出的单

## 目标

调度台司导日历上，调度员只能取消自己派出的订单；其他人派出的日期仍显示，但不能移除。

## 对照

1. 现有模块：调度台司导日历拖回解绑，`PUT /api/orders/{id}/driver` 与 `PUT /api/orders/{id}/days/{dayId}`。
2. 改动文件：`DispatcherPage`、`DispatcherCalendarCard`、`dispatcher.css`、`OrderDriverAssignment`、`OrdersController`、`ItineraryDaysController`、`CrudApiTests`，以及 `PRD` / `FRONTEND_DESIGN` / `API_CONTRACT` / `DEVELOPMENT_PLAN`。
3. 已有类似功能：上一轮已用 `createdByUserId` 判断是否显示本人姓名。
4. 没有第二个事实来源：继续用 `orders.created_by_user_id`，不新增派单人字段或历史表。
5. 不新增数据库实体。
6. 解绑他人派出单改为 403；派单、司导取消自己名下行程仍可用。

## 改动

- 前端：自己派出的日期可拖回订单区；其他人派出的日期加 `locked`，按下即提示「只能移除自己派出的订单」，不开始拖拽。
- 后端：调度员/公司把已派 `driverId` 置空时，仅 `created_by` 是本人，或该日属于本人司导身份，才允许。司导角色取消自己行程不受限。
- 测试：`Other_user_cannot_clear_assignment_but_owner_and_driver_can`。

## 命令结果

- `dotnet test`：25 通过。
- 浏览器：陈调度打开王司导卡。10 月 28–30 显示「陈调度」；林调度派出的霍比特村 11 月 12–13 只着色、带 locked。
- 陈调度对霍比特村整单/按天解绑均为 403「只能取消自己派出的订单。」；对自己的陈→王整单解绑 200，随后已重新派回王司导。
- 自动化点击不走 `pointerdown`，未能截到前端 toast；真实拖拽仍走 pointer 事件。

## 未做

- 未另记派单人。谁创建派出，谁才能从调度台摘掉。
- 未重新 seed。验证时把霍比特村派给了王司导，现仍挂在其日历上。
- 未提交。
