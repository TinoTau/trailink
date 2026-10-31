# 未置顶车辆按车牌字母顺序

## 目标

车辆区里没有置顶的图标按车牌字母顺序排列。置顶的仍按置顶顺序。

## 改动

- 车辆排序仍走 `sortDrivers`。未置顶不再沿用拖动留下的顺序，按车牌比较，不区分大小写。
- 只有两辆都已置顶时，拖动才改顺序。
- 说明文字和 `FRONTEND_DESIGN.md`、`ARCHITECTURE.md`、`DEVELOPMENT_PLAN.md` 已写成同一条规则。

## 命令结果

- `npx tsc -b --pretty false --noEmit`：通过。
- 浏览器：按 ZZZ901、AAA901、mmm901 的先后添加，图标顺序是 AAA901、mmm901、ZZZ901。置顶 ZZZ901 后它排到最前，剩下两辆仍按字母。取消置顶后回到 AAA901、mmm901、ZZZ901。三辆临时车已删除。调度台回到所有订单，仍是 CC-test001、CC-test002、CC-test003。没有点 Mason。

## 未做

- 没有重新打包。桌面上的 `frontend-dist-20261031.tar.gz` 不含这次排序。
- 没有提交。

## 阻塞

无。

## 下一步

要上云端需要再打一个网页包。
