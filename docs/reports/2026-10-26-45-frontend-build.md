# 修复前端生产构建

## 目标

`npm ci` 被占用文件打断后，`npm run build` 报找不到 `vite/client` 和 `node` 类型。重新装齐依赖并打出可部署的 `frontend/dist`。

## 改动

- 停掉占用 `node_modules` 的两个本地 Vite（5173、5174），在 `frontend` 重新执行 `npm ci`。
- 构建成功后，用新的 `frontend/dist` 重打桌面压缩包 `trailink-deploy.tar.gz`。
- 构建结束后把两个本地 Vite 重新拉起。
- 没有改业务代码，没有执行 `npm audit fix`。

## 命令结果

- `npm ci`：成功，191 个包。
- `npm run build`：成功。产物为 `frontend/dist/assets/index-B3Jc6LqK.js`、`frontend/dist/assets/index-Ck8DT9WR.css`。
- 桌面压缩包已换成上述产物。压缩前那份里是旧文件 `index-CQ-7UB-q.js`。
- 本地站点已恢复：`http://127.0.0.1:5173/`、`http://127.0.0.1:5174/`。

## 未做

- 没有把压缩包上传到虚拟机，也没有在虚拟机上启动服务。
- 没有提交。
