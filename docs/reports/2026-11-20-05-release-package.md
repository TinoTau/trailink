# 发布包 20261120c 2026-11-20

## 文件（在 `release/`）

| 文件 | 说明 |
| --- | --- |
| `trailink-api-20261120c.tar.gz` | 后端源码（内容和 20261120b 相同） |
| `trailink-web-20261120c.tar.gz` | 前端 dist，入口 `index-BTIYF04U.js` |
| `update-trailink-20261120c.sh` | 发布脚本 |

这个包代替 20261120 和 20261120b，那两套不用再发。

## 这一版包含

- 20261120b 的全部内容：
  - 20261113 的全部内容；
  - 粗单「填入行程明细」；
  - 手机保持登录；
  - AI 建单年份。
- 新增（只有前端，见 `2026-11-20-04-ended-orders.md`）：
  - 「所有订单」显示已结束的单（灰色、排最后）；
  - 开着订单点司导，日历滚到订单日期；
  - 没绑公司的单删除按钮写「删除」。

## 数据库

没有结构改动，也不动数据。脚本先检查 orders 表已有车型、南/北岛两列。

## 检查

- 本机和沙盒逐个文件比对一致。
- `dotnet test`：140 个全部通过；`tsc -b`、lint、生产构建通过。
- 后端包 `dotnet publish -c Release` 成功；没有密钥。
- 用假的 docker、curl 演练脚本：备份、保留 appsettings.Production.json、前端入口 `index-BTIYF04U.js`、各项检查，全部按预期。

## 用法

1. 把三个文件上传到服务器家目录。
2. `cd ~ && nohup sh update-trailink-20261120c.sh > ~/update-20261120c.log 2>&1 &`
3. `tail -f ~/update-20261120c.log`。看到入口 `index-BTIYF04U.js`、健康检查 ok、几个接口 401、「完成。」就好了。
