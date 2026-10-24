# 统一本地文件存储与头像上传

## 目标

个人信息可上传头像。二维码、用户头像、电子票、订单截图四种文件走同一套独立存储，不另开第二条上传路径。

## 对应模块

1. 现有模块：公司二维码、`order_files`、`ticket_path`、个人信息页。
2. 改动：新增 `AppFileStore`；增量迁移 `users.avatar_path`；原位改 `AuthController`、`CompanyDeskController`、`OrdersController`、`OrderActivitiesController`、个人信息 / 行程 / 调度台 / 公司 / 订单编辑页。
3. 已有二维码上传，抽出为统一存储。
4. 不产生第二套文件服务或平行 API。
5. 只新增 `users.avatar_path`，未改 `InitialCreate`。
6. 现有订单 / 活动 / 二维码接口保持，文件接口为增量。

## 改动

- 存储根目录：`App_Data/files/{qr,avatars,tickets,orders}/`。库里只存相对路径。旧 `company-qr/` 仍可读取。
- `POST/GET /api/auth/avatar`；会话增加 `hasAvatar`。
- 二维码写入 `files/qr/`。
- 电子票 `POST/GET/DELETE .../activities/{id}/ticket`；活动更新不再改写 `ticket_path`。
- 订单截图实现已有 `order_files` 接口，并补 `GET` 下载。
- 个人信息上传头像；行程/订单编辑上传电子票；调度台订单信息、公司订单卡、订单编辑页上传截图。

## 命令结果

- `dotnet ef migrations add AddUserAvatarPath` 成功。
- `dotnet ef database update` 成功，写入 `avatar_path`。
- `dotnet test`：23 通过（含 `FileUploadTests`）。
- 浏览器 `/me`：北岛管理上传头像后显示 `/api/auth/avatar`。
- `/company`：上传二维码与订单截图成功。磁盘已有 `files/qr`、`files/avatars`、`files/tickets`、`files/orders`。

## 未做

- 未重新 seed。
- 未做 S3。存储层可替换。
- `claim/range` 仍按预览司机分配，前端不调用。

## 下一步

按公司隔离订单、收费 AWS 资源仍后置。
