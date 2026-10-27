# 域名已指向虚拟机，HTTPS 证书尚未握手成功

## 目标

确认 Cloudflare 的 A 记录，并检查外网能否打开网站。

## 改动

- 没有改代码，也没有改虚拟机。

## 命令结果

- Cloudflare 记录为 `trailink.cc` A `8.231.163.175`，代理状态 `DNS only`。
- 本机解析结果已是 `8.231.163.175`。80 和 443 端口均可连接。
- `http://trailink.cc` 返回 `308`，服务器是 Caddy，跳转到 `https://trailink.cc/`。
- `https://trailink.cc` 在 TLS 握手阶段失败，错误为 `SEC_E_INTERNAL_ERROR`。

## 未做

- 没有重启 Caddy，没有查看网站容器日志。
- 没有提交。
