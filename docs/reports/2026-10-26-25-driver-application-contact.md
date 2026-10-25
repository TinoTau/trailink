# 个人信息司导申请显示联系方式

## 目标

个人信息里的司导申请栏显示申请人姓名和本人联系方式，不再显示登录用户名。

## 改动

- `GET /api/dispatchers/applications` 的 `DriverApplicantDto` 增加 `contact`，读申请人 `users.contact`。没有新表或迁移。
- 个人信息「司导申请」在姓名后显示这条联系方式，没有则「暂未填写」。
- 公司信息的待批准申请仍显示用户名。
- 权威文档已同步：`API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`FRONTEND_DESIGN.md`、`PRD.md`、`DEVELOPMENT_PLAN.md`、`ARCHITECTURE.md`。

## 命令结果

- `Dispatcher_and_driver_can_read_each_others_contact` 通过。待批准申请返回姓名「联系司导」和联系方式「司导微信」。
- API 已重启。`npm run api:types` 后 `npx tsc -b` 通过。
- 浏览器：调度员个人信息的司导申请显示「验证司导 司导微信-验证」，没有用户名。用完已删掉这条临时申请和临时账号。BB 登录仍是 `bbboss`。

## 未做事项

公司信息页的待批准申请仍显示用户名。

## 阻塞

无。

## 下一步

无。
