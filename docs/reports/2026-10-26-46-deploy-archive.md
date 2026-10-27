# 打好桌面部署压缩包

## 目标

本机 `npm ci` 再次因文件占用失败。不再让用户在终端编译，直接确认并重新打出可上传的桌面压缩包。

## 改动

- 没有改业务代码。
- 使用已经编译成功的 `frontend/dist`，从仓库根目录重打 `C:\Users\tinot\Desktop\trailink-deploy.tar.gz`。排除 `node_modules`、`bin`、`obj`、`.git`。
- 本地两个 Vite 仍在运行，没有为打包停掉它们。

## 命令结果

- 压缩包大小 890361 字节，时间 2026-10-26 15:30。
- 包内含 `frontend/dist/index.html`、`frontend/dist/assets/index-B3Jc6LqK.js`、`frontend/dist/assets/index-Ck8DT9WR.css`、`backend/Trailink.Api/Dockerfile`、`docker-compose.yml`。
- 用户 15:26 的 `npm ci` 仍是 `EPERM -4048`，类型定义再次缺失。这次失败没有进入压缩包。

## 未做

- 没有上传到虚拟机，没有在虚拟机启动服务。
- 仓库里的 `docker-compose.yml` 仍是本机数据库配置，没有改成线上那份。
- 没有提交。
