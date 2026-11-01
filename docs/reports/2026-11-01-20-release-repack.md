# 重新打包发布

## 内容

在 `release/` 里重建前后端包，带上今晚的前端改动：活动库管理弹框、已选排序、把手拖动、当日活动紧凑排列、调度台组件拆分。

| 文件 | 处理 |
|---|---|
| `trailink-web-20261101.tar.gz` | 重新构建（入口 `index-DVOXJMNG.js`） |
| `trailink-api-20261101.tar.gz` | 重新打包；后端源码和上次打包时相同，文件清单一致 |
| `trailink-schema-20261101.sql`、`apply-schema-20261101.sh` | 不变。最后一个迁移仍是 `AddActivityLibrary`，`has-pending-model-changes` 确认模型没有未生成的迁移 |
| `update-trailink-20261101.sh` | 不变 |
| 备份脚本 `trailink-backup.sh`、`trailink-restore.sh`、`install-backup-cron.sh` | 不变 |

## 检查

- 后端测试 104 / 104 通过；接口实测 94 个接口全部覆盖（见 `2026-11-01-19-api-test.md`）。
- 前端 `tsc`、`vite build` 通过；包里没有本机地址。
- 写到电脑后核对了 md5，和沙盒里的包一致。

## 发布顺序（不变）

1. 上传 `trailink-schema-20261101.sql`、`apply-schema-20261101.sh`，执行 `sh apply-schema-20261101.sh`。只新增表、列、触发器和 7 个常用目的地，不改已有数据，可以重复执行。
2. 上传两个 tar 包和 `update-trailink-20261101.sh`，执行 `sh update-trailink-20261101.sh`。
3. 需要定时备份时，上传 `trailink-backup.sh`、`trailink-restore.sh`、`install-backup-cron.sh`，执行 `sh install-backup-cron.sh`。

`release/` 里的 `install-trailink-backup.sh` 是早先的旧版安装脚本，已被 `install-backup-cron.sh` 取代，不要上传；`device-md5.txt` 是核对用的临时文件。这两个都不在发布步骤里。

## 没有动的

- 没有连接云端服务器或云端库。
- 未提交、未推送。

## 补充：服务器安装定时备份时的两个问题

1. 服务器（Ubuntu 24.04 精简镜像）没有装 cron，`crontab: not found`。用户已执行 `sudo apt-get install -y cron` 和 `sudo systemctl enable --now cron`。`install-backup-cron.sh` 现在会先检查，没有 cron 时提示这两行命令后退出。
2. 装好 cron 后脚本只打印「crontab：」就停了，备份任务没有加上。原因是脚本里的写法：用户还没有任何定时任务时，`grep` 过滤结果为空返回 1，在 `set -e` 下中断了括号里的命令，结果写进了一个空的 crontab。改为先读出现有任务、再整份写回，并用 `|| true` 接住。在沙盒里用模拟的 crontab 测了四种情况：没有 crontab、空 crontab（服务器当时的状态）、已有其他任务和旧的备份行、重复执行。都只保留一行备份任务，其他任务不受影响。

## 补充：云平台同名文件不覆盖

用户发现：在云平台上重复上传同名文件，不会覆盖之前的文件。以后需要重复上传时，文件要换新名字。

- 这一轮的发布文件另存一份带 `b` 的名字：`trailink-api-20261101b.tar.gz`、`trailink-web-20261101b.tar.gz`、`update-trailink-20261101b.sh`（读带 `b` 的两个包，并检查后端有活动库、前端入口是 `index-DVOXJMNG.js`、活动库接口未登录返回 401）、`install-backup-cron-20261101b.sh`。内容和不带 `b` 的相同。
- 结构脚本 `trailink-schema-20261101.sql`、`apply-schema-20261101.sh` 下午之后没变，服务器上如果已有同名文件可以直接用。
- 确认后端包包含活动库：`LibraryController`、`ActivityLibrary` 服务、模型、迁移 `AddActivityLibrary`、`Program.cs` 注册都在包里；把包解压后单独编译通过。

## 补充：服务器首次全量备份

定时任务已装好（每小时第 7 分钟）。首次全量备份的整库导出已经完成并通过校验（`trailink-full-20261101-223902.dump`，50K），最后一步清理 `backup_deletions` 时报「表不存在」，因为云端库还没执行结构补齐。执行 `apply-schema-20261101.sh` 后再跑一次 `trailink-backup.sh full` 即可。在此之前，每小时的增量备份也会因为缺少 `updated_at` 列失败并记日志，不影响数据库。
