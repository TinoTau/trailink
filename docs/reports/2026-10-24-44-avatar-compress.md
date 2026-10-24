# 头像自动压缩

## 目标

用户上传的头像写入前自动缩小压缩，页面加载不再下原图。

## 对应模块

1. 现有模块：`POST /api/auth/avatar`、`AppFileStore`。
2. 改动：`AvatarImage`、`AppFileStore` 头像分支、`AuthController`、个人信息提示、契约文档、`FileUploadTests`。
3. 已有统一存储，不另开路径。
4. 二维码 / 电子票 / 订单截图仍存原图。
5. 不新增表。
6. 同一套上传接口，只改写入内容。

## 改动

- 头像上传上限 8MB，便于选手机原图。
- 写入前用 SkiaSharp 缩到最长边 256，压成 JPEG 质量 72。
- 磁盘路径变为 `files/avatars/{userId}.jpg`。
- `GET /api/auth/avatar` 增加 `Cache-Control: private, max-age=86400`。
- 未用 ImageSharp 4（正式构建要许可证）。

## 命令结果

- `dotnet test`：24 通过。其中 `Avatar_is_resized_and_compressed`：800×600 PNG 变为 256×192 JPEG。
- 浏览器 `/me`：800×800 PNG 上传后 GET 为 `image/jpeg`，约 1.3KB。

## 未做

- 未回压已经存在的旧头像，重新上传即可。
- 未处理手机照片 EXIF 旋转。
