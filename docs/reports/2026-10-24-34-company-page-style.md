# 公司页对齐独立白底

## 目标

公司信息页去掉 Ant Design 顶栏，风格与调度台、司导日历一致。顶栏里的「订单」「司机」不再出现在公司/个人信息入口上。

## 对应模块

1. 现有模块：`CompanyPage`、`ProfilePage`、`App` 路由壳。
2. 改动文件：`CompanyPage.tsx`、`ProfilePage.tsx`、`account.css`、`App.tsx`、`AuthContext.tsx`、`FRONTEND_DESIGN.md`、`PRD.md`。
3. 已有功能：调度台 / 司导日历已是独立白底 + 圆角按钮。
4. 没有第二个事实来源：批准/移除仍走 `/api/company`。
5. 不新增数据库实体。
6. 不改 API；公司登录后首页改为调度台。

## 改动

- `/company`、`/me` 与调度台一样提前返回，不再套深色 `Layout.Header` / `Menu`。
- 右上角只有「调度台」「个人信息」「退出」（个人信息页公司账号多一个「公司信息」）。
- 公司 `homeFor` 从 `/orders` 改为 `/dispatcher`，避免登录后掉进旧订单列表顶栏。
- `/orders`、`/drivers` 旧列表仍保留，不再从公司信息页链过去。

## 命令结果

- 前端 lint：无新增错误。
- 未跑后端测试（无后端改动）。

## 浏览器

- `/company`：白底，标题为公司名，右上角三个圆角按钮，无深色标签栏。
- 「调度台」进入 `/dispatcher`，调度台仍有「公司信息」。
- 「个人信息」进入 `/me`，同样白底圆角按钮，可回到公司信息。

## 未做

- 未重做 `/orders`、`/drivers` 旧列表页的顶栏。
- 未合并 `account-chip` 与调度台 `dispatcher-chip` 的样式文件。

## 下一步

若旧订单/司机列表不再使用，再决定是收敛到调度台还是单独改成同一套白底。
