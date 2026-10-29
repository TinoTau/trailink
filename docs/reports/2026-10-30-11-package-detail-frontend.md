# 只打前端：司导详情着色和滚动

## 目标

这次没有接口改动，也没有库改动。打一个新的网页包，云端只换页面。

## 改动

- 桌面 `frontend-dist-20261030-detail.tar.gz`，278928 字节。内含 `index.html`、`favicon.svg`、`icons.svg`、`assets/index-BI-RtJ2u.js`、`assets/index-C9YVIe-o.css`。
- 桌面 `update-trailink-20261030-detail.sh`，362 字节，Unix 换行，回车符 0。只解压网页包，然后 `docker compose up -d --no-deps --force-recreate web`。

## 命令结果

- `npm run build` 成功。页面引用 `index-BI-RtJ2u.js`、`index-C9YVIe-o.css`。
- 脚本里有 `trailink.driverCalendar.colors.v2`、`trailink.calendar.inkBalance`、`trailink.calendar.inkSide`、「订单没打开时」。样式里有 `calendar-ink-bar` 和 `opacity:.75`。
- 更新脚本没有 `docker compose down`，没有重建 API，没有 SQL。

## 未做

- 没有上传，没有在虚拟机执行。
- 没有改接口，没有提交。
- 上次的 `frontend-dist-20261029-ink.tar.gz` 不含这次的司导详情着色、滚动，也不含滑条后来的位置和默认值。

## 阻塞

- 无。

## 下一步

把 `frontend-dist-20261030-detail.tar.gz` 和 `update-trailink-20261030-detail.sh` 上传到虚拟机家目录，执行 `sh "$HOME/update-trailink-20261030-detail.sh"`。不要用 `start.sh`，不要用 `update-trailink-20261029-ink.sh` 或更早的更新脚本，不要 `docker compose down -v`。脚本跑完后，`grep` 应看到 `index-BI-RtJ2u.js`。
