# 调度台和派给调度显示头像

## 目标

司导图标圆圈和调度员图标圆圈显示对方在个人信息里上传的头像。没有上传时仍显示姓名第一个字。

## 改动

仍用 `users.avatar_path` 和 `App_Data/files/avatars/`，没有新表，也没有第二套存储。

- `DriverReadDto`、`CompanyMemberDto` 增加 `hasAvatar`。
- `GET /api/drivers/{id}/avatar`：只有能在司导名单里看到这位司导的登录用户可以读。
- `GET /api/company/dispatchers/{userId}/avatar`：只有本公司账户可以读已列入本公司调度员名单的人。
- 调度台和派给调度的圆圈在 `hasAvatar` 时显示这张图，加载失败则退回姓名第一个字。圆圈下方仍优先显示备注。
- 同步 `API_CONTRACT.md`、`FRONTEND_DESIGN.md`、`PRD.md`、`ARCHITECTURE.md`、`DEVELOPMENT_PLAN.md`，并重新生成前端 OpenAPI 类型。

## 命令结果

- `dotnet test --filter Desk_reads_avatar_only_for_people_it_can_see`：通过。公司能读到已批准司导和本公司调度员的 JPEG；未批准、外人读司导头像为 404；非公司账户读调度员头像为 403。
- `npx tsc --noEmit`：通过。
- `npm run api:types`：成功，生成结果含两个新的头像地址和 `hasAvatar`。

测试在本地库注册了用于验证的公司、调度员和司导，没有留下订单。

## 浏览器

`127.0.0.1:5173` 上的公司账号打开了调度台和派给调度。接口里这些司导和调度员的 `hasAvatar` 都是 false，圆圈仍是姓名第一个字，没有裂图。没有在这个账号上上传头像。派给调度看完后已回到调度台。

## 未做

没有打发布包。这次要同时更新接口和前端，只换上次的前端包看不到头像。

## 下一步

对方在个人信息上传头像后，重新打开调度台或派给调度即可看到。云端发布时接口和前端一起换。
