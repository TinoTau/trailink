# 打包网页和接口，准备重新发布

## 目标

把当前调度台和公司头像改动打成可上传的网页包和接口包。云端已有数据，这次不改表、不清库。

## 改动

- 桌面 `frontend-dist-20261029.tar.gz`，276270 字节。内含 `index.html`、`favicon.svg`、`icons.svg`、`assets/index-hNqZKGd5.js`、`assets/index-H4_e90ou.css`。
- 桌面 `api-update-20261029.tar.gz`，10810 字节。内含 `CompanyDeskController.cs`、`DriversController.cs`、`ItineraryDaysController.cs`、`OrdersController.cs`、`AuthDtos.cs`、`DriverDtos.cs`、`TextValue.cs`。
- 桌面 `update-trailink-20261029.sh`，525 字节，Unix 换行。解压这两个包，只重建 API 镜像和 web 容器。

## 命令结果

- `npm run build` 成功。页面引用 `index-hNqZKGd5.js`、`index-H4_e90ou.css`。
- 网页包能搜到「只能移除自己分配的订单」「上传公司头像」「不能拖动，也不能移除」。
- 接口源码里校验句是「公司头像请上传 1MB 以内的 jpg / png / webp。」
- 两个压缩包清单与上面一致。没有数据库导出，没有 `docker-compose.yml`。更新脚本没有回车符。

## 未做

- 没有上传，没有在虚拟机执行。
- 没有跑迁移。这次没有新的 Migration。
- 没有提交。

## 阻塞

无。

## 下一步

把 `frontend-dist-20261029.tar.gz`、`api-update-20261029.tar.gz` 和 `update-trailink-20261029.sh` 上传到虚拟机家目录，执行 `sh "$HOME/update-trailink-20261029.sh"`。不要用 `start.sh`，不要用更早的 `frontend-dist-20261028-desk.tar.gz`，不要 `docker compose down -v`。脚本跑完后，`grep` 应看到 `index-hNqZKGd5.js`。
