# 用户自己的联系方式

## 目标

公司信息里调度员姓名后面显示该用户自己的联系方式，不再显示登录用户名。每个人在个人信息里填写和修改自己的联系方式。

## 改动

- 新增 `users.contact`，增量迁移 `20261025135708_AddUserContact`。不改 `companies.contact`，也不改 `drivers.phone`。
- `PUT /api/auth/contact` 只改当前用户，最长 200 字，清空即删除。`GET /api/auth/me` 带回这条联系方式。
- 个人信息的资料区增加联系方式。公司信息的调度员名单在姓名后显示 `dispatchers[].contact`，没有则写「暂未填写」。
- 待批准申请仍显示用户名，这次没有改。

## 命令结果

- `dotnet ef database update` 已写入 `users.contact`。
- `User_contact_is_private_and_shown_on_the_company_dispatcher_list` 通过：本人保存后公司名单能看到；旁人不变；超过 200 字返回 400；清空后名单为空。
- `npx tsc -b` 通过。
- 浏览器：调度员 Mason 后面是「暂未填写」，不再是用户名。当前公司账号在个人信息保存并清空了一次联系方式，现在仍是空的。

## 未做事项

没有给 Mason 填写联系方式。

## 阻塞

无。

## 下一步

无。
