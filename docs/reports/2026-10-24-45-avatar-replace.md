# 覆盖头像时删除旧文件

## 目标

用户再次上传头像后，服务器上的旧头像文件要删掉，不占空间。

## 对应模块

1. 现有模块：`AppFileStore` 头像写入。
2. 改动：`AppFileStore.RemoveReplaced`、`FileUploadTests`、契约文档。
3. 已有 `Delete(previousPath)`，但同用户换扩展名（`.png` → `.jpg`）时旧文件会留下。
4. 不另开存储。
5. 不新增表。
6. 同一套 `POST /api/auth/avatar`。

## 改动

- 写入新头像后删除 `avatar_path` 指向的旧文件。
- 再清掉同用户 `files/avatars/{userId}.*` 里除新文件外的其他扩展名。
- 压缩后的原图本来就不落盘。

## 命令结果

- `dotnet test --filter FileUploadTests`：3 通过。`Replacing_avatar_deletes_previous_file` 确认残留 `.png` 被删，只留一个 `.jpg`。

## 未做

- 未批量清已有测试残留文件；对应用户再传一次头像即可清掉。
