# 订单流转全量测试执行报告

## 目标

- 跑现有后端全量测试，覆盖认证、公司、文件、订单、活动与派单。
- 在现有 `Trailink.Api.Tests` 中补齐订单绑定、派给调度、派给司导、回收的业务用例。
- 不新增平行 Controller、API、表或测试框架。

## SSOT 核对

1. 对应现有 `OrdersController`、`ItineraryDaysController`、现有订单 DTO 与 `Trailink.Api.Tests`。
2. 改动：`TestAuth.cs` 抽出注册/升调度辅助方法；新增 `OrderLifecycleTests.cs`。
3. 已有碎片规则测试保留在 `CrudApiTests` / `AuthFlowTests`；本轮只补完整流转与可见性断言。
4. 未产生第二套订单或派单事实来源。
5. 未新增数据库实体或 Migration。
6. 未改运行时 API；权威契约未改。

## 本轮用例设计

| 用例 | 业务规则 | 测试 |
| --- | --- | --- |
| 公司建单即绑定 | 公司账户创建强制写本公司；改绑或 `companyId: null` 无效 | `Bind_assign_dispatch_and_recycle_follow_visibility_rules` |
| 未派调度不可见 | 调度员列表只看 `assignedDispatcherUserId` 是自己的单；公司列表只看本公司 | 同上 |
| 订单号查找 | `?orderNo=` 可按系统号或平台号精确命中，不受列表角色过滤 | 同上 |
| 外公司不能派调度 | 已绑其他公司的单，外公司 `PUT /dispatcher` 为 403 | 同上 |
| 司导不能派调度/删除 | 司导 `PUT /dispatcher`、`DELETE` 为 403 | 同上 |
| 整单派调度 | 仅公司可写；目标必须是本公司调度员；同时只有一位 | 同上 |
| 过期行程仍可见 | 已派司导后，过去日期仍出现在司导 `GET /api/orders` | 同上 |
| 改派调度不拆司导 | 公司把单从甲改到乙，已派司导和 `assignedDayCount` 保留 | 同上 |
| 公司收回清空司导 | `dispatcherUserId: null` 清空调度员和各日司导，保留行程与活动 | 同上 |
| 收回后不可再删 | 已退回公司池后，原调度员 `DELETE` 为 403 | 同上 |
| 再派从零开始 | 收回后再派给调度员，`assignedDayCount` 为 0 | 同上 |
| 未绑公司真删 | 调度员删除未绑公司的单，行消失 | `Dispatcher_return_and_unbind_follow_company_binding` |
| 已绑公司退回 | 调度员删除已绑且分给自己的单，回到公司池，司导清空 | 同上 |
| 退回后司导看不见 | 退回后司导列表不再包含该单，公司仍能看到 | 同上 |
| 拆单可见性 | 只派一天时 `assignedDayCount=1`；该司导取消自己那天后面单从列表消失 | `Split_assignment_hides_order_from_driver_after_own_day_cleared` |
| 调度员绑定/解绑 | 调度员建单不绑公司；绑定后公司可见；`null` 解绑后公司列表消失 | `Dispatcher_can_bind_then_company_sees_and_unbind_hides` |
| 不存在的公司 | 调度员写入无效 `companyId` 返回 400，原绑定不变 | 同上 |

## 现有全量覆盖（未改，本轮一并执行）

- 认证：登录登出、申请调度/司导、历史订单桌面、颜色、改名。
- 司机与备注：CRUD、私密备注、并发写入。
- 订单/行程/活动：建单、按天派单、冲突警告与 409、本地日期时间、活动排序、时区拒绝。
- 权限：非分配人不能整单解绑；双分配人各清自己那天；司导可清本人行程。
- 文件：头像、二维码、订单截图、电子票共用存储。
- 模型：核心表、行程日唯一、订单号唯一；API 目标 `net10`。

## 验证结果

- `dotnet test --filter OrderLifecycleTests`：4/4 通过。
- `dotnet test`：42/42 通过，0 失败，0 跳过。
- `npm run lint`：通过，0 warning。
- `npm run build`：通过；仅有现存单 chunk 超过 500 kB 提示。

## 未做事项

- 前端没有独立单测；本轮未新增前端测试框架。
- 未在浏览器里再跑一遍拖拽派单；对应规则由 API 用例覆盖。
- 未执行真实文件删除或生产数据破坏。

## 下一步

- 后续改派单/绑定/回收规则时，先改 `OrderLifecycleTests` 与现有 Controller，再跑 `dotnet test`。
