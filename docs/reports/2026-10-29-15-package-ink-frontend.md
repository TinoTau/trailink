# 只打前端：日历滑条

## 目标

日历滑条不改接口、不改库。打一个新的网页包，云端只换页面。

## 改动

- 桌面 `frontend-dist-20261029-ink.tar.gz`，278666 字节。内含 `index.html`、`favicon.svg`、`icons.svg`、`assets/index-BpoNfMAA.js`、`assets/index-DgPXqGrb.css`。
- 桌面 `update-trailink-20261029-ink.sh`，353 字节，Unix 换行，回车符 0。只解压网页包，然后 `docker compose up -d --no-deps --force-recreate web`。

## 命令结果

- `npm run build` 成功。页面引用 `index-BpoNfMAA.js`、`index-DgPXqGrb.css`。
- 脚本里有 `trailink.calendar.inkBalance`、`trailink.calendar.inkSide`、「浮雕字和日期文字」。样式里有 `calendar-ink-bar` 和 `opacity:.75`。
- 更新脚本没有 `docker compose down`，没有重建 API，没有 SQL。

## 未做

- 没有上传，没有在虚拟机执行。
- 没有改接口，没有提交。

## 阻塞

- 无。

## 下一步

把 `frontend-dist-20261029-ink.tar.gz` 和 `update-trailink-20261029-ink.sh` 上传到虚拟机家目录，执行 `sh "$HOME/update-trailink-20261029-ink.sh"`。不要用 `start.sh`，不要用 `update-trailink-20261029-publish.sh`、`update-trailink-20261029-notes.sh` 或 `update-trailink-20261029.sh`，不要 `docker compose down -v`。脚本跑完后，`grep` 应看到 `index-BpoNfMAA.js`。
