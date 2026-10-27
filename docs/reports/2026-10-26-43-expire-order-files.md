# 订单结束一周后删除电子票和截图

## 目标

电子票和订单截图可能是几 MB 的文件。订单最后一天起满 7 天后删掉这两类文件，避免占满云上的磁盘。订单、活动内容、头像和公司二维码留下。

## 改动

- `OrderScheduling.PurgeExpiredAttachmentsAsync`：结束日取行程最后一天。满 7 天后删除 `order_files` 和电子票文件，并清空 `ticket_path`。没有行程日的单不删。后面又加了更晚的行程日，就按新的最后一天算。
- `ExpiredAttachmentCleanup`：API 启动后立刻清一次，之后每 6 小时再清。仍走现有 `AppFileStore`，不新建表或存储。

## 命令结果

- 先停掉占用 5168 的 `Trailink.Api`（进程 41028），否则编不过。
- `dotnet test` 过滤 `FileUploadTests`：4 通过，0 失败。覆盖满 7 天删除、未满 7 天保留、行程又延长则保留、头像仍在。测试造的三张单已删除。
- API 已重新启动在 `http://localhost:5168`。启动时的清理查询已执行，没有报错。已结束满 7 天的电子票和订单截图会在这次启动时清掉。

## 未做

- 没有改 Oracle 部署，数据库仍是现有 PostgreSQL。
- 没有提交。
