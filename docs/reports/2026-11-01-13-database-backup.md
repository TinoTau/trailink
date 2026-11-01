# 数据库定时备份

## 目标

用户要求：

- 每天全量备份数据库一次，保存在指定路径，最多保存一周，滚动删除。
- 订单相关信息每小时增量备份一次，每天全量备份之后删除增量文件。

用户选定：

- 增量方式：给订单相关表加修改时间，只导出改动。
- 存放位置：服务器的 `~/trailink-backups`，用 crontab 定时。
- 只备份数据库，不含上传的文件。

## 设计

- 增量依据（迁移 `AddBackupChangeTracking`，只新增，不改已有数据）：
  - `orders`、`itinerary_days`、`order_activities`、`order_files`、`order_notes` 加 `updated_at`。
  - 修改时由数据库触发器自动更新。后端有几处原生 SQL 写入（备注的写入、清空），放在数据库层才能全部覆盖。EF 模型和后端代码不用改。
  - 新增 `backup_deletions`：上述表删除行（含级联）时由触发器记下，增量备份据此还原删除。用户选择的方案原本记不到删除，加这张表补上，避免还原后已删除的订单又出现。
- `trailink-backup.sh auto`：crontab 每小时第 7 分钟执行。
  - 新西兰 03 点做全量：`pg_dump -Fc`，校验通过后保留最新 7 份，清空增量，从这一刻重新开始增量。
  - 其他时间做增量：五张表的改动行和删除记录，各一个 CSV，打成一个 tar.gz。起点往前多取 10 分钟，避免漏掉未提交的事务。没有改动不生成文件。
  - 文件锁防止重叠，失败写日志。
- `trailink-restore.sh`：只还原到新建的 `trailink_restore_时间` 库。
  - 先还原全量，再按时间顺序应用增量：按主键覆盖，再删除；关闭触发器，保留原始 `updated_at`。
  - 不碰正在用的库，是否切换由人工决定。
- `install-backup-cron.sh`：
  - 复制脚本到 `~/trailink-backups/`。
  - 在 crontab 加一行，重复执行不会重复添加。
  - 立即做一次全量。

## 改动

- 后端：
  - 新增迁移 `Data/Migrations/20261031222756_AddBackupChangeTracking`（含 Designer）。
  - 新增测试 `BackupTrackingTests`：修改会刷新 `updated_at`；删除订单时，订单和级联删除的行程日都记入 `backup_deletions`。
- 文档：
  - `DATABASE_CONTRACT.md` 新增 10d 节。
  - `ARCHITECTURE.md` 第 8 节新增「备份」。
  - `DEVELOPMENT_PLAN.md` 新增 4b。
- 发布包（`release/`）：
  - `trailink-schema-20261101.sql` 重新生成，包含这个迁移。
  - `apply-schema-20261101.sh` 多检查一张表和 10 个触发器。
  - `trailink-api-20261101.tar.gz` 重新打包。
  - 新增 `trailink-backup.sh`、`trailink-restore.sh`、`install-backup-cron.sh`。

## 验证

- `dotnet test`：101 个全部通过。`has-pending-model-changes`：没有。
- 结构脚本：从云端现状（`AddOrderSharedNotes`）开始连续执行两次都成功，迁移记录到 `AddBackupChangeTracking`，触发器 10 个。
- 备份脚本在沙盒里用模拟的 docker 命令跑：
  - 全量，然后改订单、删订单（级联删行程日）、改行程日、新增备注，再做两次增量。
  - 用全量加两份增量还原到新库：五张表逐行比对（含 `updated_at`），和原库完全一致。
  - 已有 9 份全量时再做一次全量：只剩最新 7 份，增量清空。
  - `auto` 在非 03 点做增量；上一次还在运行时跳过并记日志。

## 注意

- 用户本机的开发库也要执行一次 `dotnet ef database update`，否则本机跑测试时 `BackupTrackingTests` 会失败。
- 备份和数据库在同一台虚拟机上，整机丢失时备份也会丢。
- 迁移执行时，已有行的 `updated_at` 都是迁移时间，所以迁移后第一次增量会包含全部订单数据；第一次全量之后恢复正常。

## 未做

没有连接云端，没有执行任何脚本，没有提交。
