# 重新打包准备发布

## 目标

把订单名称、备注保存和司导详情箭头打进新的发布包。云端若还没有 `orders.shared_notes`，脚本只加这一列。不改已有订单，不清库。

## 改动

- 桌面 `frontend-dist-20261029-publish.tar.gz`，277410 字节。内含 `index.html`、`favicon.svg`、`icons.svg`、`assets/index-DzJzRrgz.js`、`assets/index-Cn7Wsclr.css`。
- 桌面 `api-update-20261029-publish.tar.gz`，17619 字节。在共用备注那次的接口文件之外，加上当前的 `CompanyDeskController.cs`、`ItineraryDaysController.cs`、`OrdersController.cs`、`AuthDtos.cs`、`OrderScheduling.cs`、`OrderDriverAssignment.cs`。
- 桌面 `add-order-shared-notes.sql`，316 字节，Unix 换行。内容和上次相同：`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shared_notes text`，迁移历史里没有 `20261028122754_AddOrderSharedNotes` 才插入。
- 桌面 `update-trailink-20261029-publish.sh`，769 字节，Unix 换行，回车符 0。先执行上面的 SQL，再解压两个包，只重建 API 镜像和 web 容器。

## 命令结果

- `npm run build` 成功。页面引用 `index-DzJzRrgz.js`、`index-Cn7Wsclr.css`。
- `dotnet build backend/Trailink.Api/Trailink.Api.csproj -c Release` 成功，0 警告 0 错误。
- 网页包能搜到「订单详情在下方」「共用备注」「公司、调度员和司导都能看到」，样式里有 `field-sizing:content`。
- 本机库试跑 SQL：列已存在所以跳过，迁移记录已在所以插入 0 行，订单仍是 288 条。没有连云端。
- 更新脚本没有回车符，没有 `docker compose down`。

## 未做

- 没有上传，没有在虚拟机执行。
- 没有提交。

## 阻塞

- 无。

## 下一步

把 `frontend-dist-20261029-publish.tar.gz`、`api-update-20261029-publish.tar.gz`、`add-order-shared-notes.sql` 和 `update-trailink-20261029-publish.sh` 上传到虚拟机家目录，执行 `sh "$HOME/update-trailink-20261029-publish.sh"`。不要用 `start.sh`，不要用 `update-trailink-20261029-notes.sh` 或 `update-trailink-20261029.sh`，不要 `docker compose down -v`。脚本跑完后，`grep` 应看到 `index-DzJzRrgz.js`。已有订单内容还在。
