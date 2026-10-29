# 打包前端：详情拖动与冲突日期

## 目标

把调度台司导详情拖动、派给调度的调度员详情拖动，以及我的行程冲突日期文案，打成可上传的网页包。这些都不改接口。

## 改动

- 桌面 `frontend-dist-20261028-desk.tar.gz`，274874 字节，2026-10-28 10:05:37。
- 包内是 `index.html`、`favicon.svg`、`icons.svg`、`assets/index-CrzRUkS9.js`、`assets/index-DFUuY4ol.css`。
- 脚本里有「拖动调整司导详情高度」和「拖动调整调度员详情高度」。样式里有 `liftable` 的 0.18s 收回。

## 命令结果

- `npm run build` 成功。
- 压缩包没有数据库导出，没有 `docker-compose.yml`，没有接口源码。

## 未做

- 没有上传，没有在虚拟机执行。
- 没有重建接口，没有跑迁移，没有提交。

## 下一步

把 `frontend-dist-20261028-desk.tar.gz` 上传到虚拟机家目录，只重建 web 容器。上传后 `grep` 应看到 `index-CrzRUkS9.js`。
