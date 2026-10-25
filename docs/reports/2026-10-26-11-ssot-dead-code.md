# 清理重复订单标签、行程日映射和清空当天司导的请求

## 目标

检查订单、行程日和日历相关代码里的重复实现与死代码，只合并同一条路径上的重复，不改行为，不新增表、接口或页面。

## 改动

- 删除 `orderPoolLabel`。它只转调 `orderDisplayLabel`，调度台两处改回直接用 `orderDisplayLabel`。
- `isIncomplete`、`isInProgress` 从调度台挪到 `orderFlags`，与历史单共用 `orderEndDate`。
- `isOwnAssignment` 改为走内部的 `dayAssigner`，不再自己再写一遍分配人回退。`dayAssigner` 不再对外导出。
- 司导取消整单、解除一天、调度台取消拆单日，清空 `driverId` 的请求体改走 `clearDayDriver`。整单取消仍走原来的 `assignDriver(null)`。
- 订单列表和详情的行程日都用 `ItineraryDaysController.ToRead`。删掉 `OrdersController.ToDetail` 里第二套字段抄写。
- 去掉日历里重复的 `.driver-day.release` 红框声明，保留能压过选中态和今天的那一条。取消整单的红框规则保留。
- 去掉已经没有对应段落的 `.account-days p`。

## 命令结果

- 前端 `npx tsc -b`：通过。
- `dotnet test`：50 通过，0 失败。正在运行的 API（进程 32440）锁住了默认输出里的 exe，测试改在 `backend/.ssot-test` 编译，测完已删除该目录。没有重启正在运行的 API。

## 未做

- 没有删 `GET/DELETE /api/orders/{orderId}/days`。当前页面不调用，但它们仍是契约里的行程日资源。
- 没有合并两个控制器里的 `TrimToNull`。那只是本地去空白，不是第二套业务规则。
- 没有动生成的 OpenAPI 类型、已应用的 Migration，也没有改权威契约。行为没变。
- 没有提交 git。

## 阻塞

无。

## 下一步

无。
