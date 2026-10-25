# 注册时把自己批成自己的司导

## 目标

公司和调度员创建账号后就能在调度台给自己派单，不用再单独申请。普通司导没有调度台。

## 改动

- 注册仍走 `DriverIdentity`。`Attach` 补司机档案，新增 `AttachSelf` 在现有 `driver_applications` 写一条已批准的自指行：`user_id` 与 `dispatcher_user_id` 都是本人。
- 已有账号在登录和 `GET /api/auth/me` 的 `EnsureAsync` 里补上同一行。没有这条时才插入；若是待批准则直接写成已批准。
- 对外申请接口仍拒绝「不能向自己申请」。
- `DELETE /api/dispatchers/drivers/{driverId}` 拒绝解除自己。调度台自己这一行不显示垃圾桶。
- 不新增表，不写 `driver_notes`，因此默认显示。
- 权威文档已同步：`API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`ARCHITECTURE.md`、`PRD.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

## 命令结果

- `dotnet test` 过滤 `AuthFlowTests|OrderLifecycleTests`：通过 24，失败 0。临时输出目录已删除。
- 前端 `tsc --noEmit`：通过。
- 重启 API 后刷新 `http://127.0.0.1:5173/dispatcher`。BB-boss 仍登录，调度台司导区出现 BB-boss，已隐藏 0。未改公司名、简称和密码，未退出登录。

## 未做

- 未提交。
- 未批准 drv05，未改 BB旅运 / BB-dd / bbboss。
- 未把已有 `company_members` 转成申请。

## 下一步

无。公司账户仍不能用垃圾桶解除别人的司导。
