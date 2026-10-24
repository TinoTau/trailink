# 一人多公司与公司信息页

## 目标

调度员/司导可同时属于多家公司。公司信息页用下拉切换，展示名称、负责人、联系方式（可改手机/微信、上传二维码），以及自己分配或跑过的订单；点图标再出卡片。

## 对应模块

1. 现有模块：公司桌面、申请批准、订单创建、公司信息页。
2. 改动文件：`Company` / `CompanyMember` / `Order`、`CompanyDeskController`、`OrdersController`、增量 Migration、`CompanyPage`、`ProfilePage`、调度台/司导入口、权威文档。
3. 已有功能：申请/批准仍走 `dispatcher_applications`；订单仍走 `orders`。
4. 没有第二个事实来源：所属关系只写 `company_members`；订单归属只写 `orders.company_id`。调度台仍读全库订单。
5. 新增表：`company_members`。`companies` 增加 `contact`、`qr_path`。未改 `InitialCreate`。
6. 现有订单 API 路径不变；创建时可带 `companyId`。

## 改动

- 批准写入成员行，不再占用 `users.company_id`（该字段只给公司账户）。可同时向多家公司申请。
- 公司信息页对所有登录角色开放。持有者可改联系方式、上传二维码、批准/移除调度员。
- 成员看到自己创建的订单；司导还看到自己跑过的该公司订单。图标点击后用现有 `GET /api/orders/{id}` 出卡片。
- 调度台/司导建单会带上当前公司；调度台列表不按公司过滤。

## 命令结果

- Migration `20261024012541_AddCompanyMembersAndOrderCompany` 已应用，并把原调度员 `company_id` 回填到成员表。
- `dotnet test`：21 通过（含一人加入两家公司后再移除一家）。

## 浏览器

- `/company`：白底，公司名、负责人、联系方式输入、上传二维码、订单区。
- 保存联系方式 `0211234567` 后刷新仍在。
- 创建带 `companyId` 的订单后出现圆角图标；点击弹出卡片，显示订单号、日期、备注和行程日。

## 未做

- 未做独立文件服务；二维码存在 `App_Data/company-qr`。
- 调度台订单列表仍不按公司隔离。
- 未做微信登录或邀请链接。

## 下一步

若调度员经常在多家公司之间建单，可在调度台也放同一个公司下拉，与公司信息页共用 `trailink.currentCompanyId`。
