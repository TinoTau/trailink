# 调度员删除改为退回公司池

日期：2026-10-25

## 目标

调度员点删除时不删订单，只与调度员和已派司导解绑，订单回到公司池。公司账户删除才真正删掉。不另开接口或表。

## 对应现有模块

`OrdersController.Delete`、已有 `PUT /api/orders/{id}/dispatcher` 传 `null` 的收回逻辑、`DispatcherPage` 订单卡删除。未新增 Controller / 表 / 平行删除 API。

## 改动

- 抽出 `ReturnToCompanyPool`：清空 `assigned_dispatcher_user_id` 和各行程日 `driver_id` / `assigned_by_user_id`。公司收回与调度员删除共用。
- `DELETE /api/orders/{id}`：调度员只退回分给自己且已绑公司的单（204，行仍在）；未绑公司 400；别人的单 403。公司账户才删订单和附件。司导 403。
- 调度员按钮「退回公司」，确认「确定退回公司池？」。公司仍是「删除订单」。
- `API_CONTRACT.md`、`PRD.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

## 命令结果

停掉 5168 后：`dotnet test --filter Dispatcher_delete_returns_order_to_company_pool|Company_assigns_whole_order_to_one_dispatcher` 通过 2。已重启 API。

## 浏览器

- `acme` 派给调度：11 月 25 日确认「确定删除这个订单？」后 toast「订单已删除」，列表只剩 9 月 1 日；公司订单列表不再有 `TL-20261025-B679D9`。
- `wang` 调度台：P-UI-1105 按钮为「退回公司」；确认后退回，toast「已退回公司池」，调度台不再出现该单。`GET ?orderNo=P-UI-1105` 仍在，公司 TestCo，调度员空，11 月 5 日 `driver` 空。
- 未绑公司的 11 月 20 日单 `DELETE` 返回 400「尚未绑定公司，无法退回公司池。」

## 未做

- 未提交。
- 调度台测试残留账号仍在。

## 下一步

无。
