# 个人信息改密码改为明文

## 目标

个人信息页的「当前密码」和「新密码」改成看得见的明文。两栏都保留：仍要填当前密码，新密码至少 8 位，点保存才提交。不增加「再输入一遍新密码」。登录和注册仍用掩码。

## 改动

- `frontend/src/pages/ProfilePage.tsx`：这两个输入框改为 `type="text"`，`autoComplete="off"`，`spellCheck={false}`。保存条件没变。
- `docs/FRONTEND_DESIGN.md`、`docs/PRD.md`、`docs/DEVELOPMENT_PLAN.md`：写明当前密码和新密码明文显示。接口仍是 `PUT /api/auth/password`。

## 命令结果

- 未跑测试。后端和接口没改。
- 浏览器打开 `http://127.0.0.1:5173/me`，仍是 CC。两栏都显示出试填的 `看得见Ab12`，保存按钮保持禁用，没有点保存。随后两栏已清空。没有点批准，没有退出登录。

## 未做

- 登录页和注册页的密码框仍是掩码。
- 没有改密码，没有提交。
