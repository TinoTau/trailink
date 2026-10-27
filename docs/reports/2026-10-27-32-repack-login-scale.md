# 重新打包登录页修复

## 目标

把包含手机登录缩放修复的网页打成可上传的包，并给出不重置数据库的部署命令。

## 改动

- 没有改业务代码。
- 重新编译 `frontend/dist`。
- 覆盖桌面 `C:\Users\tinot\Desktop\frontend-dist.tar.gz`，272422 字节。
- 部署仍用桌面 `start.sh`。它沿用数据卷 `trailink_pgdata`，只补尚未应用的迁移，然后重建接口并重启网页容器。

## 命令结果

- `npm run build` 成功。
- 包内页面文件是 `assets/index-B_nlZpps.js`、`assets/index-ClfsDoU0.css`。
- 没有数据库导出，没有本机 `docker-compose.yml`。
- 没有上传，没有在虚拟机执行。

## 未做

- 没有提交。

## 阻塞

无。

## 下一步

把 `frontend-dist.tar.gz` 和 `start.sh` 上传到虚拟机家目录，执行 `sh "$HOME/start.sh"`。不要使用旧的 `trailink-deploy.tar.gz`，不要 `docker compose down -v`。
