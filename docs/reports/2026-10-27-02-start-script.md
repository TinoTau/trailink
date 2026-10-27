# 准备虚拟机启动脚本

## 目标

检查已经通过。把数据库启动、迁移和编译写成一个脚本，避免在浏览器 SSH 里粘贴长命令。

## 改动

- 在桌面写入 `C:\Users\tinot\Desktop\start-trailink.sh`，Unix 换行，558 字节。
- 脚本先等待 Postgres 健康，再在一次性的 .NET SDK 容器里执行 `dotnet ef database update`，然后 `docker compose up -d --build`。
- 没有改仓库文件，没有把数据库密码写进脚本。

## 命令结果

- 用户在虚拟机上的检查结果：`Caddyfile-ok`、`dist-ok`、Docker Compose 2.40.3、2 GB 交换空间已启用、`compose-ok`。

## 未做

- 没有在虚拟机上执行这个脚本。
- 没有提交。
