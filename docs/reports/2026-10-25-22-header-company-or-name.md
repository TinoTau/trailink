# 左上角改为公司名或本人姓名

日期：2026-10-25

## 目标

派给调度左上角显示公司名称，调度台左上角显示当前登录用户姓名。不再用本机可改的「调度员」预览名。

## 对应现有模块

`DispatcherPage` 顶栏。读 `user.companyName` / `user.companies` 与 `user.name`，去掉 `localStorage` 的 `trailink.dispatcher.profile`。

## 改动

- 派给调度：本公司名称。
- 调度台：登录用户姓名。
- 不再点击改名。`FRONTEND_DESIGN` 已同步。

## 命令结果

无后端测试。

## 浏览器验证

北岛 `/company/assign` 左上角「北岛旅运 / 派给调度」。`lin` 打开 `/dispatcher` 左上角「林调度 / 调度台」。

## 未做

- 未提交。
