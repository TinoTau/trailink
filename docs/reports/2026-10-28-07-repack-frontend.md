# 重新打包前端

## 目标

打出可上传的网页包，供云端只换页面、不碰数据库。

## 改动

- 重新编译 `frontend/dist`。
- 覆盖桌面 `C:\Users\tinot\Desktop\frontend-dist.tar.gz`，272846 字节。
- 包内是 `index.html`、`favicon.svg`、`icons.svg`、`assets/index-DFZmLm23.js`、`assets/index-m9NwwWhm.css`。
- 桌面 `swap-trailink.sh` 未改，仍只解压页面并重建 web 容器。

## 命令结果

- `npm run build` 成功。
- 压缩包清单只有上述页面文件，没有数据库导出，没有 `docker-compose.yml`。

## 未做

- 没有上传，没有在虚拟机执行。
- 没有重建接口，没有跑迁移。
- 没有提交。

## 阻塞

无。

## 下一步

把新的 `frontend-dist.tar.gz` 上传到虚拟机家目录，执行 `sh "$HOME/swap-trailink.sh"`。不要运行 `start.sh`，不要 `docker compose down -v`。
