# 司导和调度按申请关系可见

## 目标

调度台把全部司导都列出来，公司也能在调度台上看到别的公司的人。批准前双方不应互相出现在名单里。

## SSOT 核对

1. 对应现有 `GET /api/drivers`、`GET /api/company` 的调度员名单，以及现有 `driver_applications`。
2. 未新增人员表或平行名单接口。公司看调度仍写 `company_members.role=dispatcher`。
3. 司导对某一位调度员的可见关系，批准后原来会删掉申请行，现有表留不住。增量列 `driver_applications.approved_at` 保留这一条，不另建表。

## 本轮改动

- 批准司导申请不再删除该行，改为写入 `approved_at`。待批准列表仍只含空的 `approved_at`。
- 调度员 `GET /api/drivers` 只返回向自己申请且已批准的司导。同公司的另一位调度员看不到，除非司导也向他申请并被批准。
- 公司账户的司导名单只含本公司 `role=driver` 的成员。调度员名单和派给调度仍只含本公司 `role=dispatcher` 的成员。
- 已经属于同一家公司，仍可向另一位调度员单独申请。
- 名单种子按原名单补上已批准关系：陈 6、林 5、黄 5、吴 5。当前库同样补了这 21 条。Mason 与 Tino 没有申请记录，不会互相出现。

## 验证结果

- `dotnet test`：通过 47，失败 0。其中 `People_stay_hidden_until_their_application_is_approved` 覆盖批准前双方都看不见、同公司另一位调度看不见、批准后才能共用。
- 迁移 `20261025102820_AddDriverApplicationApprovedAt` 已应用到本地库。
- API 已重新启动在 `http://localhost:5168`。

## 未做事项

- 个人信息里按姓名搜索公司或调度员仍可用，否则无法提交申请。搜索结果不会进入调度台或派给调度。
