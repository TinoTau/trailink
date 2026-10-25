# 司导自建单不再默认绑公司

## 目标

调度员用已绑公司的订单覆盖司导自建单时提示当日已有行程。原因是司导只属于一家公司时，建单被写成了公司订单，覆盖逻辑不把它当占位单。

## SSOT 核对

1. 对应现有 `POST /api/orders` 的 `ResolveCreateCompanyIdAsync`，以及现有派单覆盖 `OrderDriverAssignment`。
2. 未新增接口、表或页面。真实订单仍以 `company_id` 是否为空判断。
3. 调度员未绑公司的自建单仍不能覆盖占位单。

## 本轮改动

- 调度员和司导建单、且请求未带 `companyId` 时，所属公司保持空，即使只属于一家。
- 覆盖测试先把司导加入该公司成员，再断言自建单 `companyId` 为空，公司单仍能删掉天数不一致的占位单。
- 库里已有的司导自建单 `TL-20261025-A0EA5C`（Tino，11 月 1–5 日）把误写的 `company_id` 置空。Mason 的公司单 `TL-20261025-A59FF3` 未改。
- 同步 API、数据库、架构、产品和前端说明。

## 验证结果

- `dotnet test --filter Real_order_overwrites_driver_placeholder_and_unbound_cannot`：通过 1，失败 0。
- `UPDATE ... RETURNING`：只改了 `TL-20261025-A0EA5C` / Tino 这一行。
- API 已重新启动在 `http://localhost:5168`。

## 未做事项

- 未在浏览器里重新拖一次 Mason 的 11 月单到 Tino。用户可再试；成功后 Tino 的 11 月 1–5 日自建单会被删除。
