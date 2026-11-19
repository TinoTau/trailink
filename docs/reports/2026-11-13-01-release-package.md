# 发布包 20261113 2026-11-13

## 文件（在 `release/`）

| 文件 | 说明 |
| --- | --- |
| `trailink-api-20261113.tar.gz` | 后端源码（不含 bin、obj、App_Data、Properties、appsettings.Development.json、*.http） |
| `trailink-web-20261113.tar.gz` | 前端 dist，入口 `index-1cCILfZy.js` |
| `update-trailink-20261113.sh` | 发布脚本 |

文件名都是新的，不会和服务器上已有的包重名。

## 这一版包含

- 20261111 那版的全部内容（订单记录导出、AI 建单粘贴文字、订单图标、人数和车型下拉框等）。那版没发成功也没关系，这一版一起带上。
- 新增：导出表格按「系统订单号」更新表里已有的单，包括司导、车辆和订单信息（见 `2026-11-12-01-export-update-by-order-no.md`）。

## 数据库

- 没有结构改动，也不动数据。
- 脚本先检查 orders 表已有车型、南/北岛两列；没有就停下，什么都不改。

## 检查

- 本机和沙盒的 backend / frontend / docs 逐个文件比对（去掉 CR 后 md5），636 个文件完全一致。
- `dotnet test`：136 个全部通过；`tsc -b`、lint、生产构建通过。
- 后端包解压后 `dotnet publish -c Release` 成功；包里没有密钥。
- 用假的 docker、curl 在假家目录里演练脚本：检查数据库列、沿用 claude.env、备份旧源码、保留 appsettings.Production.json、前端入口 `index-1cCILfZy.js`、各项接口检查，全部按预期。

## 用法

1. 把三个文件上传到服务器家目录。
2. 用 nohup 运行，关掉窗口也不会中断：
   - `cd ~ && nohup sh update-trailink-20261113.sh > ~/update-20261113.log 2>&1 &`
   - `tail -f ~/update-20261113.log`（Ctrl+C 只是停止查看）
3. 最后出现入口 `index-1cCILfZy.js`、健康检查 ok、几个接口 401、「完成。」就好了。
