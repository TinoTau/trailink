# 发布包 20261120 2026-11-20

## 文件（在 `release/`）

| 文件 | 说明 |
| --- | --- |
| `trailink-api-20261120.tar.gz` | 后端源码（不含 bin、obj、App_Data、Properties、appsettings.Development.json、*.http） |
| `trailink-web-20261120.tar.gz` | 前端 dist，入口 `index-D-rYBnCY.js` |
| `update-trailink-20261120.sh` | 发布脚本 |

文件名都是新的，不会和服务器上已有的包重名。

## 这一版包含

- 20261113 那版的全部内容（订单记录导出 Excel、AI 建单粘贴文字、订单图标统一、人数和车型下拉框等）。没发过也没关系，这一版一起带上。
- 新增（见 `2026-11-19-01-itinerary-fill-and-login.md`）：
  - 粗单「填入行程明细」；
  - 手机保持登录。

## 数据库

- 没有结构改动，也不动数据。
- 脚本先检查 orders 表已有车型、南/北岛两列（20261110 已发过）；没有就停下，什么都不改。

## 检查

- 本机和沙盒的 backend / frontend / docs 逐个文件比对，640 个文件完全一致。
- `dotnet test`：139 个全部通过；`tsc -b`、lint、生产构建通过。
- 后端包解压后 `dotnet publish -c Release` 成功；包里没有密钥。
- 本地 api：未登录调填入行程明细的接口返回 401。
- 用假的 docker、curl 在假家目录里演练脚本，全部按预期：
  - 检查数据库列、沿用 claude.env；
  - 备份旧源码、保留 appsettings.Production.json；
  - 前端入口 `index-D-rYBnCY.js`；
  - 各项接口检查，包括新加的「填入行程明细接口 401」。

## 用法

1. 把三个文件上传到服务器家目录。
2. 用 nohup 运行，关掉窗口也不会中断：
   - `cd ~ && nohup sh update-trailink-20261120.sh > ~/update-20261120.log 2>&1 &`
   - `tail -f ~/update-20261120.log`（Ctrl+C 只是停止查看）
3. 最后出现入口 `index-D-rYBnCY.js`、健康检查 ok、几个接口 401、「完成。」就好了。

## 上线后

- 保持登录从各人下次登录起生效。之前的登录在浏览器关掉后要再登录一次，之后就一直保持。
- 如果发版后所有人都被登出，说明服务器上登录密钥的数据卷没挂对，把 `docker compose config` 里 api 的 volumes 部分发过来再查。
