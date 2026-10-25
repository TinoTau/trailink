# 真实订单覆盖司导占位单

## 目标

调度员把已绑定公司的真实订单派给司导时，覆盖该司导自己创建、未绑公司的占位单，不再提示「当日已有行程」。天数不符时删除整张占位单。未绑定公司的调度员自建单不能覆盖。

## SSOT 核对

1. 对应现有 `OrderScheduling`、`OrderDriverAssignment`、`OrdersController`、`ItineraryDaysController`。
2. 改动落在上述服务与现有删除附件路径；未新增 Controller、API、表或平行派单。
3. 真实订单仍以 `orders.company_id` 为准；占位单仍是司导自建且未绑公司的同一套 `orders`。
4. 未产生第二套冲突或覆盖接口。
5. 未新增数据库实体或 Migration。
6. 未改前端调用；调度台仍走现有 `failOnConflict: true`。

## 本轮改动

- `OrderScheduling`：已绑公司的来源单在冲突检测中忽略司导自建占位单；提供占位单查询。
- `OrderDriverAssignment`：整单派真实订单前删除重叠占位单及其附件。
- `ItineraryDaysController`：按天派真实订单时同样覆盖并删除占位单。
- `AppFileStore.DeleteOrderAttachments` 作为订单附件删除的唯一实现，`OrdersController` 复用。
- 占位单判定：`company_id` 为空，且创建人 `users.driver_id` 就是被派司导。
- 同步 `API_CONTRACT.md`、`PRD.md`、`ARCHITECTURE.md`、`FRONTEND_DESIGN.md`、`DATABASE_CONTRACT.md`、`DEVELOPMENT_PLAN.md`。

## 验证结果

- `dotnet test`：44/44 通过。
- 新增用例：
  - 未绑公司的调度员自建单 `failOnConflict: true` 仍 409，占位单保留。
  - 已绑公司的真实订单整单派发成功，天数不符的占位单被删除，司导列表只剩真实订单。
  - 另一张真实订单同日再派仍 409。
  - 按天派真实订单也会删除重叠占位单。

## 未做事项

- 未在浏览器里再跑拖拽派单；前端仍用原接口，由后端改变冲突结果。
- 未给覆盖动作单独加前端提示。
