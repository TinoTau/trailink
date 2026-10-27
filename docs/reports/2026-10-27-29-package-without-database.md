# 只换网页包，不动数据库

## 目标

重新打出可上传的前端包。云端已有真实数据，这次不连接数据库，不跑迁移。

## 改动

- `frontend/src/calendarDay.tsx`：日期拖选在非触屏分支收窄为指针事件，否则 `tsc -b` 无法通过，打不出包。行为不变。
- 桌面 `frontend-dist.tar.gz`（272278 字节）：`index.html`、`favicon.svg`、`icons.svg`、`assets/index-BsOJfUzK.js`、`assets/index-Bn5kmXTT.css`。
- 桌面 `swap-trailink.sh`：只解压到 `~/trailink/frontend/dist`，然后 `docker compose up -d --no-deps --force-recreate web`。不重建接口，不操作 Postgres。
- 桌面 `start-trailink.sh` 改为直接退出。旧内容会执行 `dotnet ef database update`，并在业务表有数据时中止。
- 桌面上一次的 `trailink-deploy.tar.gz` 仍在，里面是旧页面和本机 `docker-compose.yml`。这次不要上传它。

## 命令结果

- `npm run build`：成功。页面文件是 `index-BsOJfUzK.js`、`index-Bn5kmXTT.css`。
- 压缩包清单只有上述 6 个路径，没有数据库导出，没有 `docker-compose.yml`。

## 未做

- 没有上传虚拟机，没有在云端执行脚本。
- 没有 `dotnet ef database update`，没有导出或写入云端数据库。
- 接口代码相对上次上线没有改动，所以没有重建 API 镜像。
- 没有提交。

## 阻塞

无。

## 下一步

把 `frontend-dist.tar.gz` 和 `swap-trailink.sh` 上传到虚拟机家目录，执行 `sh swap-trailink.sh`。不要运行虚拟机上可能还留着的旧启动脚本，不要 `docker compose down -v`。
