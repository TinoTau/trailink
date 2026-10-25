# 司导日历标出订单来源

## 目标

调度员把公司订单派给司导后，司导日历上的姓名要能看出是哪家公司的哪位调度员。名称放不下时，用本人给这家公司写的缩写。

## SSOT 核对

1. 对应现有司导日历 `CalendarDayCaption` 和公司信息页 `GET/PUT /api/company`。
2. `driver_notes`、`dispatcher_notes`、`order_notes`、`company_members` 都不是「用户对公司」的私人缩写。
3. 新增 `company_notes` 一张表，沿用现有备注表的 `(对象, user_id)` 唯一约束。不另建日历或派单接口。

## 本轮改动

- `company_notes`：每人每家公司一行，最多 20 字。公司信息页可写，只自己可见。
- 订单读取增加 `companyNote`，取当前用户对订单所属公司的这一行。
- 我的行程：已绑公司时日期框显示「公司名+调度员名」；超过 6 个字且写了缩写，改为「缩写-调度员名」。未绑公司仍只显示调度员名。调度台日历不改。

## 验证结果

- 迁移 `20261025105051_AddCompanyNotes` 已应用到本地库。
- `dotnet test`：通过 48，失败 0。其中 `Company_abbreviation_is_private_and_shown_on_the_drivers_order` 覆盖本人可写、外人 403、超过 20 字 400、订单只带本人缩写、清空后消失。

## 未做事项

- 没有缩写时，过长名称仍由日期框省略号截断。
