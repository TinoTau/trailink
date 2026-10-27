# 改用上传方式放置线上 Compose 文件

## 目标

浏览器 SSH 粘贴多行 `docker-compose.yml` 时，后半段换行失效，几行叠成 `EOFaddydata...`。改把完整文件放到本机桌面，让用户上传。

## 改动

- 在桌面写入 `C:\Users\tinot\Desktop\docker-compose.yml`，使用 Unix 换行，1140 字节，不含回车符。
- 没有改仓库里的 `docker-compose.yml`。那份仍是本机数据库配置。
- 没有改虚拟机上的 `.env`。随机密码那条命令已经执行成功。

## 命令结果

- 桌面文件末尾包含 `caddydata` 卷，以及前端目录、Caddyfile、80/443 端口。

## 未做

- 没有上传到虚拟机，没有执行 `docker compose up`。
- 没有提交。
