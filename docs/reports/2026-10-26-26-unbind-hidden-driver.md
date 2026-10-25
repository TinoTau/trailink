# 已隐藏司导可恢复，也可解除绑定

## 目标

调度台把司导隐藏后，仍可以恢复。隐藏列表里再加垃圾桶，用来解除这位调度员和司导的绑定。

## 改动

- 卡片里的移除仍只写入本机已隐藏。已隐藏列表保留「恢复」。
- 调度员在恢复旁边看到垃圾桶。确认后调用 `DELETE /api/dispatchers/drivers/{driverId}`，删除自己与这位司导已批准的 `driver_applications` 行。
- 不删司导账号，不改 `company_members`，不取消已经派出的行程。对方可以重新申请。公司账户的已隐藏列表只有恢复。
- 权威文档已同步：`API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`FRONTEND_DESIGN.md`、`PRD.md`、`DEVELOPMENT_PLAN.md`、`ARCHITECTURE.md`。

## 命令结果

- `Driver_can_apply_to_dispatcher_and_dispatcher_can_approve` 通过。公司账户调用解除返回 403。调度员解除后自己的司导名单不再包含对方，公司名单仍在，对方可以重新申请。
- `npx tsc -b` 通过。API 已重启。
- 浏览器：公司账号隐藏 Tino 后能恢复，没有垃圾桶，随后已恢复。调度员账号隐藏 QA Driver2 后，旁边有恢复和「解除绑定」。确认后这位司导从调度台消失。验完已让对方重新申请并批准，绑定恢复。BB 登录没有退出。

## 未做事项

没有取消已派出的行程。

## 阻塞

无。

## 下一步

无。
