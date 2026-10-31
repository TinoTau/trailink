# 只打前端，不动数据库

## 目标

把当前页面打成可上传的网页包。云端已有真实数据，这次不连接数据库，不跑迁移，不重建接口。

## 改动

- 桌面 `frontend-dist-20261031.tar.gz`，288260 字节。内含 `index.html`、`favicon.svg`、`icons.svg`、`assets/index-DrHdmfQl.js`、`assets/index-HWLy4pzj.css`。
- 桌面 `update-trailink-20261031.sh`，297 字节，Unix 换行，回车符 0。只解压网页包，然后 `docker compose up -d --no-deps --force-recreate web`。

## 命令结果

- `npm run build` 成功。页面引用 `index-DrHdmfQl.js`、`index-HWLy4pzj.css`。
- 包内脚本有「一次最多添加三个月」「拖到上下边缘」「半年前」。没有「一次最多添加 31」。
- 压缩包清单只有上述路径。没有数据库导出，没有 `docker-compose.yml`。更新脚本没有 `docker compose down`，没有 SQL。

## 未做

- 没有上传，没有在虚拟机执行。
- 没有打接口包。车辆表、车辆照片和行程日 `vehicle_id` 的迁移 `20261030091300_AddVehicles` 没有放进这次发布。
- 没有提交。

## 阻塞

- 新页面打开调度台时会请求车辆列表。云端还没有这个接口，换页后会提示「加载车辆失败」。订单日历仍走原来的接口。

## 下一步

把 `frontend-dist-20261031.tar.gz` 和 `update-trailink-20261031.sh` 上传到虚拟机家目录，执行 `sh "$HOME/update-trailink-20261031.sh"`。不要用 `start.sh`，不要用 `update-trailink-20261030-detail.sh` 或更早的更新脚本，不要 `docker compose down -v`。脚本跑完后，`grep` 应看到 `index-DrHdmfQl.js`。

车辆要在云端可用，需要另一次发布带上接口，并只新增车辆相关的表和列。那一次才会动库结构，不能和这次混在同一个脚本里。
