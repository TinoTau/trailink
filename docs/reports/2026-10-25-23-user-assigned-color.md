# 已分配颜色按用户落库

日期：2026-10-25

## 目标

已分配颜色每人一条，换账号或换浏览器不再共用本机 `localStorage`。

## 对应现有模块

调度台 / 派给调度的色板、登录会话。颜色是用户一条偏好，写 `users.assigned_color`，不新建颜色表。

## 改动

- `users.assigned_color`；`GET /api/auth/me` 带回，`PUT /api/auth/assigned-color` 只改自己。
- 必须是现有色板。未选过用默认浅绿。
- 前端不再写 `trailink.dispatcher.assignedColor`。
- 测试 `Assigned_color_is_private_to_each_user`。
- 契约、库结构、PRD、FRONTEND_DESIGN、ARCHITECTURE、DEVELOPMENT_PLAN 已同步。

## 命令结果

- `dotnet ef migrations add AddUserAssignedColor` + `database update`：已加列。
- `dotnet test`：通过 34。

## 浏览器验证

北岛调度台点橙色 `#fa8c16` 后刷新仍选中橙色。接口里北岛是 `#fa8c16`，林调度仍是 `#eb2f96`。

## 未做

- 未提交。
- 司导日历颜色仍只在本机。
- 演示账号颜色已改：north `#fa8c16`，lin `#eb2f96`。
