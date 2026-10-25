# 修显示名、退出、公司闪屏并继测派给调度

日期：2026-10-25

## 目标

修上一轮观察到的三个问题，并补公司台把 11 月 25 日新单派给调度再收回。不另开订单系统，不 seed，不提交。

## 对应现有模块

1. 改名 / 司导卡：现有 `AuthController.UpdateName`、`DriversController`、`users.name` / `drivers.name`。
2. 退出：现有 `AccountMenu`。
3. 公司闪屏：现有 `CompanyPage`。
4. 继测：现有 `/company/assign` 的 `DispatcherPage`。

已有 `PUT /api/auth/name`，此前故意不改 `drivers.name`，造成第二事实来源。本次在原接口同步本人司导档案名，列表优先返回账号姓名。不新增实体、表或平行 API。

## 改动

- `PUT /api/auth/name` 有本人 `driver_id` 时同时写 `drivers.name`。
- `GET /api/drivers` 对已绑定账号优先返回 `users.name`；`PUT /api/drivers/{id}` 改备注/电话时不覆盖账号姓名。
- `AccountMenu` 仅在打开后监听外部 pointerdown；「退出」在 `pointerdown` 立即登出，避免菜单先卸掉导致点一次只收起。
- `CompanyPage` 桌面数据返回前显示「加载中…」，不再先闪「还没有加入公司」。
- 契约：`API_CONTRACT.md`、`PRD.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

## 命令结果

- 停掉占用 5168 的旧 API 后重启。
- `dotnet test --filter User_can_update_own_name`：通过 1。该测试打在当前 PostgreSQL，调度台多出「新名字」「原名乙」两张卡（测试账号残留，未删）。

## 浏览器验证

- `GET /api/drivers` 中 lisi 为 `LiDriverUI`；调度台头像 `aria-label` 为 `LiDriverUI`（头像下方仍优先显示备注 `note-for-li`）。
- `lisi`、`wang` 点「更多」再点「退出」一次即到 `/login`（导航约 1s）。
- `acme` 打开 `/company` 首帧是「加载中…」，随后 TestCo + 二维码，没有「还没有加入公司」。
- `/company/assign` 把 `11月25日 1 天` 整单拖给 WangDisp，未分配只剩 `9月1日`；再从 Wang 池拖回，未分配恢复 `9月1日` + `11月25日`。`TL-20261025-B679D9` 的 `assignedDispatcherName` 为 `null`，公司仍是 TestCo。

## 未做

- 未清理测试留下的「新名字 / 原名乙」账号。
- 未改订单 DTO 里行程日 `driverName` 的 join（改名写入 `drivers.name` 后新读会一致；lisi 已由列表优先账号名覆盖）。
- 未提交。

## 下一步

需要的话清掉测试残留用户，或把行程日 `driverName` 也改成读 `users.name`。
