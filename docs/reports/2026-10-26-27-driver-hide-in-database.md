# 隐藏司导写入数据库

## 目标

调度台隐藏司导不再只存在当前浏览器，写进已有的 `driver_notes`，增加 `hidden` 一列。

## 改动

- `driver_notes.hidden` 为 `BOOLEAN NOT NULL DEFAULT false`。迁移 `20261025144523_AddDriverNoteHidden` 只加这一列。
- `PUT /api/drivers/{id}/hidden` 只改当前用户这一行的 `hidden`。没有备注又取消隐藏时删除这一行；只隐藏时备注留空。清空备注不会取消隐藏。
- 调度台隐藏和恢复走这一条。排序和置顶仍在 `localStorage`。旧的本机隐藏名单不再读取，也不迁进数据库。
- 公司账户的已隐藏列表仍只有恢复。调度员解除绑定的行为没有改。
- 权威文档已同步：`API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`FRONTEND_DESIGN.md`、`PRD.md`、`DEVELOPMENT_PLAN.md`、`ARCHITECTURE.md`。

## 命令结果

- `dotnet ef database update` 已应用 `20261025144523_AddDriverNoteHidden`。
- `Driver_hide_is_private_and_kept_when_notes_are_cleared` 通过。另一位用户读到的 `hidden` 为 false；清空备注后仍保持隐藏。
- `npm run api:types` 后 `DriverReadDto` 含 `hidden`。`npx tsc -b` 通过。API 已重启。
- 浏览器：在 `127.0.0.1:5173` 隐藏 Tino 后，`driver_notes` 中 bbboss 对 Tino 的 `hidden` 为 true，备注为空。`127.0.0.1:5174` 没有本机布局，仍显示「已隐藏 1」，名单里没有 Tino，公司账户只有「恢复 Tino」。恢复后两处都回到「已隐藏 0」，Tino 重新出现，数据库里这条隐藏记录已删除。BB 登录没有退出，公司页已回到公司信息。

## 未做事项

没有把以前只存在浏览器里的隐藏名单迁进数据库。

## 阻塞

无。

## 下一步

无。
