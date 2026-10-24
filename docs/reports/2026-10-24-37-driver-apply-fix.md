# 司导成员申请调度员报错

## 目标

刘司导已是公司司导成员，申请成为调度员时被误判为「已经是调度员」。改为只拦截真正的调度员成员。

## 对应模块

1. 现有模块：`POST /api/companies/applications`、批准/移除。
2. 改动文件：`CompaniesController`、`CompanyDeskController`、`AuthFlowTests`、`API_CONTRACT.md`。
3. 不新增表。成员行仍是 `company_members`，申请升格只改 `role`。

## 改动

- 申请：仅当该用户在该公司已是 `dispatcher` 才拒绝。
- 批准：已有司导成员行则改成调度员，不插入第二行。
- 移除：有 `driver_id` 的人降回司导成员，仍属于该公司；没有司导身份的才删成员行。

## 命令结果

- `AuthFlowTests` 3 项通过。

## 浏览器

- `drv05` 申请北岛旅运返回 200；个人信息显示「已申请加入北岛旅运，等待公司批准」。
