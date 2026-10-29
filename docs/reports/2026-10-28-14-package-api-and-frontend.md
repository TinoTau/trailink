# 打包网页和接口更新

## 目标

打出可上传的网页包和接口源码包。云端已有真实数据，这次不改表、不清库。

## 改动

- 桌面 `frontend-dist-20261028.tar.gz`，273723 字节。内含 `index.html`、`favicon.svg`、`icons.svg`、`assets/index-CijmdPj5.js`、`assets/index-BKlE4Fgx.css`。
- 桌面 `api-update-20261028.tar.gz`，5778 字节。内含 `ItineraryDaysController.cs`、`OrdersController.cs`、`TextValue.cs`。
- 桌面 `update-trailink-20261028.sh`：解压这两个包，只重建 API 镜像和 web 容器。

## 命令结果

- `npm run build` 成功。页面引用 `index-CijmdPj5.js`、`index-BKlE4Fgx.css`。包内能搜到「蒂阿瑙」。
- 两个压缩包的清单与上面一致，没有数据库导出，没有 `docker-compose.yml`。

## 未做

- 没有上传，没有在虚拟机执行。
- 没有跑数据库迁移，没有提交。

## 阻塞

无。

## 下一步

把两个压缩包上传到虚拟机家目录，执行 `update-trailink-20261028.sh`。不要 `docker compose down -v`，不要只跑 `swap-trailink.sh`。
