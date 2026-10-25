# 解除司导时收回未完成日期，并用红框确认

## 目标

调度员彻底解除司导时，收回未完成订单里分给这位司导的日期，有几天收几天。确认改成红框再点一次，不再弹框。

## 改动

- `DELETE /api/dispatchers/drivers/{driverId}` 仍删除当前调度员与这位司导已批准的 `driver_applications` 行。
- 同时清空未完成订单里、由该调度员派出或挂在该调度员名下、且 `driver_id` 是这位司导的行程日。其他司导的日期不动。最后一天早于今天的订单不动。不删司导账号，不改 `company_members`。
- 已隐藏列表里的垃圾桶第一次点击只给这一行套红框。再点一次才解除。点这一行以外取消红框。
- 权威文档已同步：`API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`FRONTEND_DESIGN.md`、`PRD.md`、`ARCHITECTURE.md`、`DEVELOPMENT_PLAN.md`。

## 命令结果

- `Dispatcher_unbind_reclaims_unfinished_days_only` 通过。未完成订单里这位司导的那一天被清空，同一单另一天保留；已结束的一天保留；司导自己的未来行程保留。
- `npx tsc -b` 通过。`DispatcherPage.tsx` 的 `oxlint` 无警告。API 已重启。
- 浏览器：调度员账号把 QA Driver2 隐藏后，点垃圾桶出现红框，按钮变为「确认解除绑定」，没有弹框。点到这一行以外，红框取消，绑定还在。随后恢复显示。BB 登录没有退出。

## 未做事项

没有在浏览器里把一位真实司导彻底删掉。收回日期由接口测试覆盖。

## 阻塞

无。

## 下一步

无。
