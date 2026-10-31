# 我的行程日期下显示车辆

## 目标

司导点开某一天时，在住宿位置按钮下面显示这辆车的车牌和型号，下一行显示共用备注。没有绑定车辆时不显示。

## 改动

- 行程日读取仍走 `ItineraryDayReadDto`。绑定车辆时带出 `vehiclePlate`、`vehicleInfo`（`vehicles.info`）、`vehicleSharedNotes`。不另存一份，也不新开接口。
- 我的行程当日卡片里，住宿位置按钮下方增加紧凑的两行。未绑定，或这三项都是空的，整块不渲染。
- `PRD.md`、`API_CONTRACT.md`、`FRONTEND_DESIGN.md`、`ARCHITECTURE.md`、`DEVELOPMENT_PLAN.md` 已写成同一条。

## 命令结果

- `npx tsc -b --pretty false --noEmit`：通过。
- `dotnet test` 过滤 `VehicleTests`：通过 1。绑定后的行程日读到车牌、七座、共用；没绑定的这三项为空。
- 本地 API 曾锁住可执行文件。已停掉旧进程，测试后再启动 `http://localhost:5168`。
- 浏览器：我的行程仍是 CC-boss，名下没有行程日，所以页面上没有可点开的日期卡片。调度台回到所有订单，仍是 CC-test001、CC-test002、CC-test003。没有新建订单，没有点 Mason。

## 未做

- 没有在页面上点开一张已绑车的日期。当前账号没有这样的行程。
- 没有打包，没有提交。

## 阻塞

无。

## 下一步

有一张已绑车的行程后，点开那一天即可看到按钮下的两行。
