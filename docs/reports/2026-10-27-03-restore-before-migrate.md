# 迁移前先还原 NuGet 包

## 目标

虚拟机上的数据库已启动，但 `dotnet ef database update` 因缺少 `project.assets.json` 失败。修正启动脚本，先还原包再建表。

## 改动

- 重写桌面 `C:\Users\tinot\Desktop\start-trailink.sh`，729 字节，Unix 换行。
- 迁移改在容器内的 `/work` 进行，先 `dotnet restore` 再 `dotnet ef database update`。源码目录只读挂载，避免把编译中间文件写回项目。
- 编译接口前删除项目下可能残留的 `obj` 和 `bin`。

## 命令结果

- 用户执行旧脚本后：Postgres 镜像已拉取，`trailink-postgres-1` 为 Healthy，.NET SDK 10.0 已下载，`dotnet-ef` 10.0.13 已安装。
- 失败信息：`NETSDK1004`，`/src/obj/project.assets.json` 不存在。脚本在编译接口之前退出。

## 未做

- 没有在虚拟机上重新执行新脚本。
- 没有提交。
