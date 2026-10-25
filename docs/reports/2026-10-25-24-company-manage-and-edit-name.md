# 公司信息权限与个人信息改名

日期：2026-10-25

## 目标

公司信息页只有公司账号能看到并批准或移除调度员。调度员账号看不到这两项。个人信息可改自己的姓名。

## 对应现有模块

`CompanyPage` / `GET /api/company`、登录会话 `users.name`。不新建公司或用户表。

## 改动

- 公司信息：前端 `user.role === 'company' && desk.canManage` 才渲染「待批准申请」和「调度员」。接口对非公司账户 `canManage=false`，名单为空。
- `PUT /api/auth/name` 只改当前用户 `users.name`，1 到 100 字。不改用户名、不改司导档案姓名。
- 个人信息页可编辑姓名并保存，会话和调度台左上角跟会话走。
- 测试：历史桌面断言调度员/司导看不到名单；新增 `User_can_update_own_name`。
- 契约、PRD、FRONTEND_DESIGN、DEVELOPMENT_PLAN 已同步。

## 命令结果

- `dotnet test`：通过 35。

## 浏览器验证

- 北岛 `/company`：可见「待批准申请」「调度员」和批准/移除。
- 林调度 `/company`：只有公司资料和历史订单，没有申请和调度员名单。
- 林调度 `/me` 把姓名改为「林调度验证」后标题更新；调度台左上角同步。已改回「林调度」。

## 未做

- 未提交。
- 未改 `drivers.name`。
