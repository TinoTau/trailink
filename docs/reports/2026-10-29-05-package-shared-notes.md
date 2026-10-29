# 打包网页、接口和加列脚本

## 目标

把共用备注和备注框高度打成可上传的包。云端需要多一列 `orders.shared_notes`。脚本只加这一列，不改已有订单，不清库。

## 改动

- 桌面 `frontend-dist-20261029-notes.tar.gz`，276832 字节。内含 `index.html`、`favicon.svg`、`icons.svg`、`assets/index-Dep-2ofE.js`、`assets/index-casZYc4n.css`。
- 桌面 `api-update-20261029-notes.tar.gz`，15462 字节。在上次接口文件之外，加上 `Order.cs`、`OrderDtos.cs`、`TrailinkDbContext.cs`、共用备注迁移和模型快照。
- 桌面 `add-order-shared-notes.sql`，316 字节。`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shared_notes text`，并在迁移历史里补上 `20261028122754_AddOrderSharedNotes`（已有则跳过）。
- 桌面 `update-trailink-20261029-notes.sh`，757 字节，Unix 换行。先执行上面的 SQL，再解压两个包，只重建 API 镜像和 web 容器。

## 命令结果

- `npm run build` 成功。页面引用 `index-Dep-2ofE.js`、`index-casZYc4n.css`。
- 网页包能搜到「共用备注」「公司、调度员和司导都能看到」「只能移除自己分配的订单」，样式里有 `field-sizing:content`。
- 本机库试跑 SQL：列已存在所以跳过，迁移记录已在所以插入 0 行，订单仍是 288 条。没有连云端。
- 更新脚本没有回车符，没有 `docker compose down`。

## 未做

- 没有上传，没有在虚拟机执行。
- 没有提交。

## 阻塞

无。

## 下一步

把 `frontend-dist-20261029-notes.tar.gz`、`api-update-20261029-notes.tar.gz`、`add-order-shared-notes.sql` 和 `update-trailink-20261029-notes.sh` 上传到虚拟机家目录，执行 `sh "$HOME/update-trailink-20261029-notes.sh"`。不要用 `start.sh`，不要用更早的 `frontend-dist-20261029.tar.gz` 或 `update-trailink-20261029.sh`，不要 `docker compose down -v`。脚本跑完后，`grep` 应看到 `index-Dep-2ofE.js`。已有订单的共用备注是空的，原来的订单内容还在。
