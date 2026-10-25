# 司导领取也覆盖占位单

## 目标

司导按订单号领取已绑定公司的真实订单时，使用与调度台派单同一套覆盖、删除未绑公司占位单的逻辑。

## SSOT 核对

1. 领取本来就走现有 `PUT /api/orders/{id}/driver` → `OrderDriverAssignment.AssignAsync`，没有第二套领取接口。
2. 未新增 Controller、API、表或平行覆盖路径。
3. 真实订单仍以 `company_id` 为准；占位单仍是司导自建且未绑公司的订单。
4. 本轮补领取用例和权威文档说明，不另写领取实现。

## 本轮改动

- 新增测试 `Driver_claim_real_order_overwrites_own_placeholder`：司导先自建 3 天占位单，再按平台订单号领取 2 天已绑公司订单；领取无冲突提示，占位单 404，日历只剩真实订单。
- 同步 `API_CONTRACT.md`、`PRD.md`、`ARCHITECTURE.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`，写明领取与派单共用覆盖规则。

## 验证结果

- `dotnet test --filter Driver_claim_real_order_overwrites_own_placeholder`：通过。
- `dotnet test`：45/45 通过。

## 未做事项

- 未改前端领取调用；仍是 `ordersApi.assignDriver`，由后端同一套服务处理。
- 领取未绑定公司的订单仍按普通冲突处理，不删除占位单。
