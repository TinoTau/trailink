# 申请成为司导

## 目标

个人信息页增加「申请成为司导」：按调度员姓名搜索并提交申请；调度员在同一页看到申请人并手动批准。

## 对应模块

1. 现有模块：登录 / 个人信息、`company_members`。
2. 改动：新增 `driver_applications` 与 `DispatchersController`，个人信息页增加申请/批准栏；增量 Migration `AddDriverApplications`。
3. 已有「申请成为调度员」（搜公司、公司页批准），方向相反，不能混进 `dispatcher_applications`。
4. 批准只写现有 `company_members`（`role=driver`），不另建归属表。
5. 新增表 `driver_applications` 一条。
6. 现有订单 / 调度员申请 API 不变。

## 改动

- `GET /api/dispatchers?name=` 按调度员姓名模糊查找。
- `POST /api/dispatchers/applications` 向指定调度员申请。
- `GET /api/dispatchers/applications` 调度员收件箱。
- `POST /api/dispatchers/applications/{id}/approve` 为申请人补齐该调度员所属公司的 `company_members`，并删除申请。
- `/api/auth/me` 增加 `pendingDriverApplications`。
- 个人信息页：司导/调度员可搜索申请；调度员可见「司导申请」并批准。
- 未重新 seed。

## 命令结果

- `dotnet ef migrations add AddDriverApplications` + `database update`：已建 `driver_applications`。
- `dotnet test`：26 通过（含 `Driver_can_apply_to_dispatcher_and_dispatcher_can_approve`）。

## 浏览器验证

- 新注册司导 `applydrv` / 测申请，搜索「陈调度」并申请，页上显示等待批准。
- 调度员 `chen` 在 `/me` 看到申请人，点击批准后收件箱清空。
- 申请人再登录，所属公司为北岛旅运、中部旅运，待批申请消失。

## 未做

- 未做拒绝申请；未改用户角色（已是调度员的人批准后仍是调度员）。
- 未重新生成演示数据。
