# 发布包 20261120b 2026-11-20

## 文件（在 `release/`）

| 文件 | 说明 |
| --- | --- |
| `trailink-api-20261120b.tar.gz` | 后端源码（不含 bin、obj、App_Data、Properties、appsettings.Development.json、*.http） |
| `trailink-web-20261120b.tar.gz` | 前端 dist，入口 `index-p-pryX1f.js` |
| `update-trailink-20261120b.sh` | 发布脚本 |

文件名都是新的。这个包代替上午的 20261120（那一套不用再发）。

## 这一版包含

- 20261120 的全部内容：
  - 20261113 的全部内容；
  - 粗单「填入行程明细」；
  - 手机保持登录。
- 新增：AI 建单年份（见 `2026-11-20-02-ai-year.md`）：
  - 原文没写年份时日期优先取将来，跨年被写成同一年的、整段在一个多月以前的，都挪到下一年，并提醒；
  - 核对页可以选年份。

## 数据库

- 没有结构改动，也不动数据。
- 脚本先检查 orders 表已有车型、南/北岛两列；没有就停下。

## 检查

- 本机和沙盒逐个文件比对一致。
- `dotnet test`：140 个全部通过；`tsc -b`、lint、生产构建通过。
- 后端包解压后 `dotnet publish -c Release` 成功；没有密钥。
- 用假的 docker、curl 演练脚本：
  - 备份旧源码、保留 appsettings.Production.json；
  - 前端入口 `index-p-pryX1f.js`；
  - 各项检查（含填入行程明细接口 401）全部按预期。

## 用法

1. 把三个文件上传到服务器家目录。
2. `cd ~ && nohup sh update-trailink-20261120b.sh > ~/update-20261120b.log 2>&1 &`
3. `tail -f ~/update-20261120b.log`。看到入口 `index-p-pryX1f.js`、健康检查 ok、几个接口 401、「完成。」就好了。
