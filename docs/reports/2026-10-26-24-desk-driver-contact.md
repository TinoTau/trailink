# 调度台司导联系方式与行程里的调度员

## 目标

调度台点开司导时，姓名下显示该司导自己填写的联系方式。我的行程点开某一天时，公司订单号下面显示当天调度员的姓名和联系方式。

## 改动

- `GET /api/drivers` 的 `contact` 读已绑定账号的 `users.contact`，不读 `drivers.phone`。
- 订单摘要增加 `assignedDispatcherContact`，行程日增加 `assignedByContact`，都读对应用户的 `users.contact`。没有新表，也没有新迁移。
- 调度台司导卡片在姓名下写「联系方式」，没有则「暂未填写」。派给调度的调度员订单池不显示这一行。
- 我的行程点开日期后，公司订单号下面写「调度员 {姓名} {联系方式}」。当天分配人优先；没有时用整单调度员。分配人就是当前用户时不显示。没有联系方式写「暂未填写」。
- 权威文档已同步：`API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`FRONTEND_DESIGN.md`、`PRD.md`、`DEVELOPMENT_PLAN.md`、`ARCHITECTURE.md`。

## 命令结果

- `Dispatcher_and_driver_can_read_each_others_contact` 通过。调度员名单读到司导联系方式；司导详情读到当天分配人和整单调度员的联系方式。测试订单已删除。
- API 已重启到 `http://localhost:5168`。`npm run api:types` 后 `npx tsc -b` 通过。
- 浏览器：BB 公司账号仍是 `bbboss`。点开司导 Tino，姓名下是「联系方式 暂未填写」。
- 另用 QA 司导 `qadrv023006` 在独立地址登录，点 2026-10-28，公司订单号 `QA-VIEW-1026` 下面是「调度员 QA Disp 023006 调度微信-验证」。验完已删除该单，并把 QA 调度员联系方式清空回原来的空值。BB 登录没有退出。

## 未做事项

没有给 Tino 或 Mason 填写联系方式。

## 阻塞

无。

## 下一步

无。
