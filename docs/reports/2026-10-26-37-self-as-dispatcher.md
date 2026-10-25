# 公司账户默认成为自己的调度员

## 目标

公司账户注册后就能在「派给调度」里把自己当成调度员。隐藏和解除绑定与调度台管理司导同一套交互。不能解除自己的司导或调度员身份。

## 改动

- 公司注册写入 `company_members.role=dispatcher`，账号角色仍是公司。登录和 `GET /api/auth/me` 给已有公司账号补上这一行。司导和调度员账号不写。
- `dispatcher_notes` 增加 `hidden`，迁移 `20261026022400_AddDispatcherNoteHidden`。`PUT /api/company/dispatchers/{userId}/hidden` 只给本公司调度员写这一列。
- `DELETE /api/company/dispatchers/{userId}` 拒绝删除自己，返回「不能解除自己的调度员身份。」删掉别人时，未完成且分给他的本公司订单退回公司池；最后一天早于今天的订单保留。
- 「派给调度」可隐藏、恢复。已隐藏列表里别人有红框垃圾桶，自己这一行没有。公司信息页调度员名单包含公司账户自己，自己这一行没有移除。
- 不能解除自己的司导身份仍是上一轮的 `DELETE /api/dispatchers/drivers/{driverId}`。

## 命令结果

- `dotnet ef database update`：已应用 `20261026022400_AddDispatcherNoteHidden`。
- `dotnet test` 过滤 `AuthFlowTests|OrderLifecycle`：26 通过，0 失败。
- `npx tsc --noEmit`：通过。
- 临时输出目录 `backend/.desk37` 已删除。
- API 已重新启动在 `http://localhost:5168`。

## 页面核对

当前登录仍是 CC。打开「派给调度」后名单里有 CC-boss、Mason、Mason1。CC-boss 可以隐藏并恢复，已隐藏一行没有垃圾桶。Mason 隐藏后有「解除绑定」，没有点下去，随后恢复。公司信息页 CC-boss 没有「移除」，Mason 和 Mason1 仍有。没有退出登录，没有改公司名称，没有批准申请。

## 未做

- 没有提交代码。
- 没有在页面上真正解除任何调度员。未完成订单退回公司池由测试覆盖。
