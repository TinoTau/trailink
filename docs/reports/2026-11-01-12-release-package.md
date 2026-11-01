# 发布打包（2026-11-01）

## 目标

用户要求：重新打包，准备发布。

用户确认：

- 云端库「结构有改动就改，但不要动具体数据」。
- 上一次发布（10-31）不包括车辆功能和天气预报。

## 发布内容

自 10-31 发布以来的全部改动：

- 车辆管理、驾照照片。
- 代码整理（统一规则、拆分大文件）。
- 天气预报（默认 MET Norway）。
- 日历显示调整。

前端和后端必须一起更新：订单接口新增了字段，地点按钮改读 `/api/places`。

## 云端库结构

新后端每个订单页面都会读 `itinerary_days.vehicle_id`，云端没有这一列和车辆、驾照表，整站会报错。所以先补结构：

- 用 `dotnet ef migrations script AddDispatcherNoteHidden AddDriverLicensePhotos --idempotent` 生成 `trailink-schema-20261101.sql`，只新增：
  - `orders.shared_notes`（如果还没有）。
  - `itinerary_days.vehicle_id`（可空）。
  - `vehicles`、`vehicle_photos`、`driver_license_photos` 三张表和索引。
  - `__EFMigrationsHistory` 记录。
- 不改、不删任何已有数据。已经存在的部分按迁移记录跳过，可以重复执行。
- `apply-schema-20261101.sh` 通过 postgres 容器执行，用容器自己的 `POSTGRES_USER` / `POSTGRES_DB`。执行前后打印迁移记录和新表。
- 按 `ARCHITECTURE.md` 第 8 节，结构脚本单独执行，不和前后端发布混在一起。

## 发布包

都放在本机 `release/`，已加进 `.git/info/exclude`。

| 文件 | 内容 |
|------|------|
| `trailink-schema-20261101.sql` | 结构补齐 SQL |
| `apply-schema-20261101.sh` | 执行结构补齐 |
| `trailink-api-20261101.tar.gz` | `backend/Trailink.Api` 源码（不含 bin、obj、App_Data、本机开发配置） |
| `trailink-web-20261101.tar.gz` | `frontend/dist` |
| `update-trailink-20261101.sh` | 后端、前端更新 |

`update-trailink-20261101.sh` 参照上次桌面上的 `update-trailink-20261031.sh`，目录是 `$HOME/trailink`，容器名 `api`、`web`：

- 旧后端源码改名为 `backend/Trailink.Api.bak-时间`；如果服务器有 `appsettings.Production.json`，原样保留。
- 解压新源码，执行 `docker compose build api` 和 `docker compose up -d --no-deps api`。
- 替换 `frontend/dist`，重建 `web`。
- 检查 `https://trailink.cc/api/health`。
- 不连接数据库，不动数据卷。

## 验证

- 发布前确认沙盒和用户本机代码完全一致：215 个文件逐一比对哈希。
- `dotnet test`：100 个全部通过。`dotnet publish -c Release` 成功。
- `npm run build` 成功。
- 结构脚本在沙盒的临时库验证：
  - 先迁移到云端现状（`AddOrderSharedNotes`），连续执行两次 `apply-schema-20261101.sh`（用模拟的 docker 命令）。
  - 两次都成功，第二次自动跳过；三张表和迁移记录都在。
  - `has-pending-model-changes`：没有未生成的模型改动。
- `update-trailink-20261101.sh` 在模拟的家目录里执行：目录替换、配置保留、前端替换都正确。

## 未做

- 没有连接云端，没有执行任何脚本，由用户上传执行。
- 没有提交，没有推送。

## 阻塞

无。
