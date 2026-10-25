# 调度员申请显示联系方式

## 目标

司导申请成为调度员后，公司账号的待批准申请显示姓名和联系方式，不再显示用户名。

## 改动

- `GET /api/company` 的 `desk.applications` 改为返回申请人的 `users.contact`。`CompanyApplicationDto` 去掉 `username`。
- 公司信息页待批准申请与调度员名单同一写法：姓名后是联系方式，没有则写「暂未填写」。
- 权威文档已同步：`API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`ARCHITECTURE.md`、`PRD.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

## 命令结果

- `User_contact_is_private_and_shown_on_the_company_dispatcher_list`：通过。待批准申请的姓名是「联系调度」，联系方式是「微信-甲」。
- 前端 `tsc --noEmit`：通过。
- 重启 API 后打开公司信息。当前公司账号的待批准申请显示 Mason 和已保存的联系方式，没有用户名。未点保存，未退出登录。

## 未做

- 未提交。
- 未批准这条申请。

## 下一步

无。
