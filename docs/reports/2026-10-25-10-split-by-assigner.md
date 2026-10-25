# 执行报告：多人派给同一司导按拆单解绑

## 目标

不同调度员把同一订单的不同天派给同一司导时，各自能拖回自己那天；司导在「我的行程」可取消本人名下任意行程，不必三方同时在场。

## 对应模块与改动

现有订单派单 / `isSplitOrder` / `CanClearAssignment`，不另开路径。

- `frontend/src/orderFlags.ts`：拆单判定增加多个分配人；「尚未派完」提示仍只看未派完。
- `backend/Trailink.Api/Services/OrderDriverAssignment.cs`：本人 `driver_id` 名下日期优先可解绑，不看分配人。
- `backend/Trailink.Api.Tests/CrudApiTests.cs`：补两人同司导、各自解自己的天、司导可解两天。
- 权威文档：`PRD.md`、`FRONTEND_DESIGN.md`、`API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`ARCHITECTURE.md`、`DEVELOPMENT_PLAN.md`。

未新增表、Controller 或平行页面。

## 命令结果

- `dotnet test`：27 通过。
- 浏览器接口：林+陈各派一天给王司导后，`isSplit=true`；林整单解绑 403，解自己那天 200，解陈那天 403；王司导两天均 200。验证单已删除，会话回到林调度。

## 未做

- 未重播种、未提交。
- 司导日历取消按钮未再点一遍（与接口同一条 `PUT` 当天 `driverId: null`）。

## 下一步

无阻塞。
