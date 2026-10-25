# 调度员删除未绑公司订单改为真删

日期：2026-10-25

## 目标

未绑定公司的订单没有公司池可退，调度员删除时应直接删掉。已绑公司的仍退回公司池。不另开接口。

## 对应现有模块

`OrdersController.Delete`、`DispatcherPage` 删除确认。真删复用公司删除的附件清理。

## 改动

- 调度员：有 `companyId` 仍 `ReturnToCompanyPool`；无 `companyId` 走同一套删行和附件。
- 前端：已绑公司「退回公司」；未绑公司「删除订单」和公司确认文案相同。
- `Dispatcher_delete_returns_order_to_company_pool`：未绑公司删除后 404。
- `API_CONTRACT.md`、`PRD.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

## 命令结果

`dotnet test --filter Dispatcher_delete_returns_order_to_company_pool` 通过 1。已重启 API。

## 浏览器

`wang` 打开未绑公司的 11 月 20 日拆分单，按钮为「删除订单」，确认「确定删除这个订单？」后 toast「订单已删除」，调度台只剩 11 月 2 日。`GET /api/orders` 不再有 11 月 20 日。

## 未做

未提交。
