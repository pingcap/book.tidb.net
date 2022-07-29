---
title: PD 源码分析- Checker: region 健康卫士 - TiDB 社区技术月刊
sidebar_label: PD 源码分析- Checker: region 健康卫士
hide_title: true
description: 本文主要介绍关于 PD 作为整个集群的大脑，时刻关注集群的状态，当集群出现非健康状态时产生新的 operator(调度单元) 指导 tikv 进行修复。
keywords: [TiDB, PD, TiKV, operator, region, CheckRegion]
---

# PD 源码分析- Checker: region 健康卫士

> **作者**：Aunt-Shirly

PD 作为整个集群的大脑，时刻关注集群的状态，当集群出现非健康状态时产生新的 operator(调度单元) 指导 tikv 进行修复。针对集群的基本逻辑单元 region, PD 也有一个专门的协程负责检查并生成对应的 operator 指导 tikv 进行自愈。

PD 中负责这部分逻辑的在 checkController 中， 其主要工作为，检查每个 region 的状态，必要时生成 operator. 如

- 当有 region 的副本（peer） 处于非正常状态时，生成 operator 加速其变成正常状态
- 当 region 太大时，触发分裂。
- 当 Region 不符合当前的[副本定义规则](https://docs.pingcap.com/zh/tidb/dev/configure-placement-rules)(placementrule) 时，生成对应调度
- 当前 region 过小时，尝试合并。


## Check 执行主流程

其主流程在 coordinator 中展开，以轮训地方式定期检测所有 region 是否需要生成调度。[相关代码模块参考](https://github.com/tikv/pd/blob/3b3ff6973da682b04970df60c3fd3984aa14a761/server/cluster/coordinator.go#L106-L145)

### [ParalRegions](https://github.com/tikv/pd/blob/3b3ff6973da682b04970df60c3fd3984aa14a761/server/cluster/coordinator.go#L106-L145)

- paralRegions 默认每隔 10ms 顺序扫 region, 检查当前批次 region 是否需要生成调度。

- - 间隔时间 10ms 可通过配置项 patrol-region-interval 进行调整。
  - 每一轮巡检操作如下：
    1. Unsafe recover 检测
       - 如果当前 cluster 处于 recovery 状态，跳过直到 unsafe recovery 完成
    2. checkPriorityRegions
       - Priority region 主要来自于 checkRegion 中发现副本缺失时的 region
    3. checkSuspectRegions
       - Suspect region 主要来自于 [placement-rule](https://docs.pingcap.com/zh/tidb/dev/configure-placement-rules) 发生更新后，会将相关 region 放进来检查
    4. checkWaitingRegions
       - 主要出现在 check region 中发现副本缺失，生成了 operator, 但是发现当前已经达到 storelimit 门槛。
    5. 扫当前集群 region 信息
       - 从上一次 key 往后获取 128(const) 个 region
       - 如果 regions 个数为 0，key 重置到起点 nil, 下一次重头扫
       - 顺序对每一个 region 进行检查，看其是否有必要生成新的 operator
         - 若已经有 pending 中的 operator, 则不需要
         - CheckRegion 检查当前 region 是否需要新的 operator. 具体流程见下文。
         - 将 key 设置为当前 region 的 end-key
         - 检查 [CheckRegion](https://github.com/tikv/pd/blob/3b3ff6973da682b04970df60c3fd3984aa14a761/server/schedule/checker/checker_controller.go#L74) 生成的 operator，检查步骤如下
           - 没有 operator, 继续下一个 region
           - 超过 storeLimit 限制，将当前 region 加入到 waitingRegion, 在下一轮 iv (checkWaitingRegions) 里处理
           - 当前 operator 可以进行
             - 加入到 operatorController 中（opController.AddWaitingOperator）
             - 当前 region 从 waitingRegion 中删除
             - 当前 region 从 suspectRegion 中删除
    6. 更新统计信息
       - 更新 region label 相关统计信息
       - 如果正好扫完了所有 region(len(key)=0), 上报处理完整个集群的使用时间。



### [CheckRegion](https://github.com/tikv/pd/blob/3b3ff6973da682b04970df60c3fd3984aa14a761/server/schedule/checker/checker_controller.go#L74)

CheckRegion 主要用于检查当前 region 是否需要新的 operator，当前版本检查流程如下(其中 红点为诊断需要关注的地方)：

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1658566161880.png)

#### jointStateChecker 副本中间状态安全卫士

如果发现当前 region 有副本（peer）处于中间状态，生成对应 operator 将其切换至正常状态。详细过程如下：

- IsPaused, return
- 检查 region 状态
  - Peers 都不在 joint state,return
    - jointState 状态定义为：当前存在 peer 为 learner<-> voter 切换的中间状态，或新节点刚加入但还在成为 learner , voter 过程中。
- 创建 LeaveJointStateOperator
  - operator builder 检查 region 基本信息，若存在异常，return
  - Peers 离开了 joint state,return
  - 创建 operator ，return
- 该 operator 优先级设置为最高

#### ScheduleDisabled

- 如果当前 region 被标记了 scheduleDisabled 停止调度 label, 返回 nil, 不需要新 operator

#### SplitChecker 

检查当前 region 是否过大，如果过大，则生成对应 operator 指导进行分裂。详细过程如下：

- IsPaused, return
- 准备 split-key
  - Label 中当前 region 所在返回内的所有 key
  - 如果上述 key 个数为 0 且存在 placementrule, 则获取当前 placement rule 对应到本 region 的所有 key.
- splitChecker 根据 label 和 placementrule 检查是否需要 split
  - Any Label 的 range 边界存在在当前 region 中，需要 split
  - Any plancementrule 的 range 边界在当前 region 中，需要 split

#### ruleChecker(Placementrule 启用时副本检测)

Plancement rule 启用时，检查当前 region 在该 plancementrule 下是否需要生成调度。考虑其复杂度，后续会单独给出详细源码分析文章。

#### Palacementrule 不启用时副本检测

- Learnerchecker 会将当前系统中所有 learner 变成 voter.
- ReplicaCHecker 会将缺失副本补全
  - 补副本类的 operator 未到达上限，返回该 operator
  - 补副本类的 operator 已经到达上限，对应 region 加入 regionWaitingList

#### Mergechecker

- 如果启用了 merge-checker, 则开始 merge checker, 如果发现当前 region 过小（比如大量的数据删除导致空 region）,则生成对应的 operator 进行合并。详细过程如下：
  - 检查当前 merge 类的 operator 是否已经到达上限，若是返回 nil
  - 如果系统刚启动或者 merge-checker 新添加，过一段时间才开始工作，返回 nil
  - 更新当前 splitCache 里面的 TTL
  - 检查当前 region 是否符合 merge 条件
    - 如果 splitCache 里面有当前 region, 即当前 region 刚 split 过，不做merge，return nil
    - 如果 region approximate size 为 0，即 PD 还未收集到该 region 的信息，不做 merge, 返回 nil
    - 检查 region 的 size 和 key 个数，如果比较大，不做 merge, 返回 nil
    - 如果当前 region 不处于一个健康状态，如有 pending peer,或 down peer, 不做 merge, 返回 nil
    - 如果当前 region 有副本缺失，不做 merge, 返回 nil
    - 如果当前 region 为热点region，返回 nil
  - 选取该 region 临近的两个 region prev & next
    - 优先检查 next 是否符合 merge 到当前 region 的条件
    - 如果 next 不符合，配置允许向前 merge, 检查 prev 是否符合条件
  - 再次检查 target region 的 size 和 key 个数是否过大
  - 检查 merge 后的新 region 是否会很快被分裂
    - 合并后的 size 是否会过大
    - 合并后的 keys 是否会过多
  - 创建 merge operator
  - 更新统计信息
  - 返回 merge operators

