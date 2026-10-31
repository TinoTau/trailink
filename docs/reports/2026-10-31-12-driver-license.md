# 司导驾照正反面

## 目标

司导在个人信息上传驾照正面和反面。已批准过这位司导的调度员和公司，在调度台编辑司导备注时看到小图，点开看大图。未申请或未批准的人看不到。

## 改动

- 新表 `driver_license_photos`，挂在 `users` 上。`side` 0 为正面，1 为反面，同一用户同一面唯一。删除用户时级联删除。迁移 `20261031101429_AddDriverLicensePhotos`，已应用到本地库。
- 文件进 `App_Data/files/licenses/`。本人 `GET/POST/PUT/DELETE /api/auth/license-photos`。上级只读 `GET /api/drivers/{driverId}/license-photos`，能否看见沿用 `DriverRoster.Visible`。
- 个人信息有司导身份时出现「正面」「反面」两个槽。压缩、小图、大图、滑动、横杠、点空白关闭、下载、两步删除、更新照片与车辆照片同一套。调度台备注里上级只能查看和下载。
- 从挂起清单和后续版本里拿掉司导资质这一项，并改了契约和设计文档。

## 命令

- `dotnet ef migrations add AddDriverLicensePhotos` 成功。
- `dotnet ef database update` 成功，已建表。
- `dotnet test --filter LicensePhotoTests`：通过 1。
- 前端 `tsc --noEmit`：通过。

## 未做

- 浏览器里没能点上传。重启本地 API 后，127.0.0.1 的登录态失效，页面回到登录。没有重新登录。
- 没有打包，没有提交。

## 阻塞

无。

## 下一步

重新登录后，在个人信息上传正反面，再到调度台打开这位司导的备注核对小图和大图。用完删除测试照片。
