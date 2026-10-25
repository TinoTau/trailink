# 浏览器继测：上传、多日、拆单、领取

日期：2026-10-25

## 目标

接着 `2026-10-25-27-manual-ui-e2e.md` 未做项，在同一清空库账号上补文件上传、多日建单、拆单拖回、领取订单号、已分配颜色、公司台自动绑本公司。不新建订单系统，不 seed，不提交。

## 对应现有模块

`DispatcherPage`（`/dispatcher` 与 `/company/assign`）、`DriverCalendarPage`、`DriverDayEditor`、`CompanyPage`、`ProfilePage`、`FileField`、现有 `OrdersController` / `orders.ts` / `auth.ts`。未新增 Controller、表或平行页面。

## 账号

密码均为 `Passw0rd!`。本轮结束时浏览器停在 `lisi` 的 `/driver/calendar`。

| 用户名 | 姓名 | 角色 | 公司 |
|--------|------|------|------|
| wang | WangDisp | 调度员 | TestCo |
| acme | AcmeBoss | 公司 | TestCo |
| lisi | LiDriverUI（`users.name`） | 司导 | TestCo |

## 司导补测（lisi）

- 个人信息上传头像成功（1×1 PNG，隐藏 `input[type=file]` + `change`）。
- 未完成颜色改为 `#fa8c16` 并持久化。
- 领取 `P-UI-1105`：取消后按订单号领回，11 月 5 日格标 `LiDriverUI`。
- 11 月 5 日活动「接机 AKL」上传电子票 `e-ticket.png`；按钮变为「电子票 / 更换」；`GET` 票文件 `200`、`image/png`。

## 调度员 `/dispatcher`（wang）

- 创建 11 月 20–22 日三天单（React `onPointerDown`/`onPointerEnter` 框选，页脚「添加 11月20日–11月22日 仅日期」）。
- 订单截图 `order-shot.png` 上传成功，卡片可见下载链接。
- 整单拖到 LiDriver：20 / 21 / 22 均标 `L`。
- 从订单日历把 21 日拖到 WangDisp：副标题「拆分」，20 `L` / 21 `W` / 22 `L`。
- 从 Wang 卡把 21 日拖回订单区：21 `未派`，20 / 22 仍为 `L`；拆单只取消当天。
- 「所有订单」打开已分配颜色，选 `#eb2f96`；`GET /api/auth/me` 为 `assignedColor: #eb2f96`。

## 公司（acme）

- `/company` 先闪「还没有加入公司」，随后出现 TestCo。上传二维码后 toast「已更新二维码」，`img.account-qr` 出现，「暂无二维码」消失。
- `/company/assign` 新建 11 月 25 日 1 天：`GET /api/orders` 中 `TL-20261025-B679D9` 的 `companyId` 为 TestCo（`50c1229c-fc79-40ee-b98a-4c444224dcaf`），`assignedDispatcher` 为空。派给调度台不显示公司搜索框（`onCompanyChange` 关闭），但新建单已绑本公司。

## 命令结果

无新的 `dotnet test` / 迁移。本轮只操作已运行的 Vite `http://localhost:5173` 与 API `http://localhost:5168`。

## 未做

- 司导卡标题仍显示 `LiDriver`（`drivers.name`），与 `users.name` `LiDriverUI` 不一致；未改代码。
- 未再测电子票 PDF、头像替换、二维码替换。
- 未把 11 月 25 日公司新单派给调度员。

## 交互观察（不是新需求）

- 菜单「退出」点第一次有时只收起菜单，需再开一次或等展开后再点。
- 派单 / 取消仍是自定义 pointer（阈值 8px），不是 HTML5 `draggable`。
- 多日框选的 `pointerenter` 对原生事件不更新 React range，须走组件 handler。

## 下一步

需要的话修司导卡显示名与 `users.name` 不同步，或把公司新单派给调度再收回。不提交代码。
