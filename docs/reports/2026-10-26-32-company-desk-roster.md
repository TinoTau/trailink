# 公司调度台只看向公司账户申请的司导

## 目标

公司账户的调度台不再列出调度员带来的司导，也不因派单把司导放进这份名单。只有司导向公司账户申请并被批准后才显示。隐藏继续只读数据库。

## 改动

- `GET /api/drivers` 对公司账户和调度员使用同一条规则：已批准、且 `driver_applications.dispatcher_user_id` 是当前用户。公司账户不再按 `company_members.role=driver` 列人。
- 司导可以按姓名搜索公司账户，并用现有 `driver_applications` 向该公司账户申请。公司账户在个人信息批准。批准后写入本公司的 `company_members`，调度台靠申请行显示。没有 `driver_notes` 行时 `hidden` 为 false。
- 调度员批准仍把司导写进他所在公司的 `company_members`。派公司订单仍可能补这一行。这两处都不进入公司账户的调度台。
- 权威文档已同步。隐藏没有改存储：调度台读接口返回的 `hidden`，置顶和排序仍在本机。

## 命令结果

- `dotnet test` 过滤 `AuthFlowTests` 与 `OrderLifecycleTests`：23 通过，0 失败。输出目录 `backend/.roster30` 已删除。
- 前端 `npx tsc -b`：通过。
- 重启 `http://localhost:5168` 后，BB-boss 的调度台显示「暂无司导」「已隐藏 0」。Tino、Tino1 仍只属于向其申请过的调度员，没有向公司账户申请，所以不出现。BB-boss 仍保持登录。

## 未做

- 没有把已有 `company_members` 行改写成向公司账户的申请。
- 公司账户还不能用垃圾桶解除自己批准的司导。解除绑定仍只给调度员。
- 没有提交 git。

## 阻塞

无。

## 下一步

司导要出现在公司账户的调度台，需在个人信息搜索该公司账户的姓名并申请，由公司账户批准。
