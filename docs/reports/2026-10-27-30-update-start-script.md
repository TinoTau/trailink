# 以后的部署脚本只更新

## 目标

用一份新的 `start.sh` 代替会在数据库已有数据时中止的启动脚本。以后的部署保留现有数据。

## 改动

- 桌面 `C:\Users\tinot\Desktop\start.sh`，1157 字节，Unix 换行。
- 找不到数据卷 `trailink_pgdata` 时直接退出，避免在空目录里新建一个空库。
- 家目录有 `frontend-dist.tar.gz` 时，只替换 `frontend/dist`。
- Postgres 使用 `docker compose up -d --no-recreate`，沿用原来的数据卷。
- `dotnet ef database update` 只补尚未应用的迁移。
- 然后重新编译接口，并单独重启网页容器。
- 桌面 `start-trailink.sh` 改为转去执行 `start.sh`。

## 命令结果

- 脚本内没有回车符。没有在虚拟机上执行。

## 未做

- 没有 `docker compose down`，没有删除 `pgdata`、`appdata`、`dataprotection`、`caddydata`。
- 没有清空订单、没有写入演示数据、没有“表里有数据就中止”的检查。
- 没有上传，没有提交。

## 阻塞

无。

## 下一步

把 `start.sh` 上传到虚拟机家目录，在 `frontend-dist.tar.gz` 放好后执行 `sh "$HOME/start.sh"`。
