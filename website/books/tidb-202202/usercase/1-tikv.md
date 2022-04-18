# 诊断 SOP | TiKV/TiFlash 下线慢

## 作者介绍

耿海直，TiDB 内核研发，主要负责 PD 调度相关组件的设计，研发工作



## **术语列表**

- Store：指代 TiKV 或 TiFlash 实例

- Region：TiDB 进行数据存储的基本单位，代表了一段范围内的二进制数据，默认一个 Region 的大小为 96 MB

- Leader：Region 通过 Raft 共识算法在不同 Store 之间完成满足线性一致性的复制，从而达成数据上的冗余以备高可用，过程中的任意时刻一个 Region 可能是四个角色中的一种：leader，follower，candidate 和 learner。其中大多数情况下由 Region leader 负责对外提供读写服务；follower 负则同步数据，以便当 leader 宕机时随时顶替成为新的 leader 对外服务



## **下线流程概述**

TiKV 和 TiFlash 的下线是异步的，整个过程会分为多个环节，大致流程如下：

1. 使用 tiup cluster scale-in 命令通过 PD API 开始下线流程，此操作仅是一个 “触发开关”，API 成功返回仅代表**开始下线**。
2. PD 在通过 API 收到下线请求后，会触发下线流程，首先会将对应的 Store 的状态从 **Up —> Offline**。
3. 对应的 Store 在状态变为 Offline 后，会开始：
   1. 将其上的 leader 转移到其他 Store（Evict leader，由 TiUP 手动添加）
   2. 将其上的 Region 转移到其他 Store
4.  在当前 Store 的 Region 全部被驱逐完毕后，PD 会将对应 Store 的状态从 **Offline —> Tombstone**。
5. 过程中可以使用 tiup cluster display 命令查看下线节点的状态，等待其变为 Tombstone。
6. 使用 tiup cluster prune 命令清理 Tombstone 节点，该命令会执行以下操作：
   1. 停止已经下线掉的节点的服务
   2. 清理已经下线掉的节点的相关数据文件
   3. 更新集群的拓扑，移除已经下线掉的节点

其中，步骤 3 受数据量影响，耗时一般会比较久，因为系统中会同时运行有其他的调度任务从而产生竞争，比如下线迁移的 Scheduler 要和 Region balance scheduler 抢占资源，导致下线速度慢或 Balance 速度上不去。



## **常见操作**

上述为一次正常的，没有任何例外的下线流程，实际情况中可能遇到各种各样的额外情况。对于不同的情况，我们也会有各种各样的“工具”去应对。下面会列举一些我们可能会进行的有用操作。

- 待下线节点已经宕机

在某些情况下，有可能被缩容的节点宿主机已经宕机，导致无法通过 SSH 连接到节点进行操作，这个时候可以通过给缩容命令加上 [--force](https://docs.pingcap.com/zh/tidb/stable/tiup-component-cluster-scale-in#--force) 选项强制将其从集群中移除。强制移除 TiKV 节点不会等待数据调度，移除一个以上正在提供服务的 TiKV 节点会有数据丢失的风险。

- 加速下线

如前所述，下线 Store 会先将其上的 leader 和 Region 迁移至其他 Store，而这个迁移的过程本质上也是调度行为，所以会和系统中的其他调度任务产生冲突，如果下线是当务之急，可以通过[调整 PD 的相关参数来加速下线调度](https://docs.pingcap.com/zh/tidb/stable/pd-scheduling-best-practices#节点下线速度慢) ，当然这样修改可能会对集群状态产生扰动，所以需要在修改前评估权衡集群对外服务和下线任务的轻重缓急。

- 终止下线

根据下线流程，触发一个 Store 的下线操作本质上是将其 Store 状态设置成 Offline，所以如果我们想在其状态变为 Tombstone 之前终止下线操作，可以通过 PD API 进行设置，把对应 Store 的状态改回 Up

```Bash
curl -X POST http://{pd_address}:{pd_port}/pd/api/v1/store/{store_id}/state\?state=Up
```



## **案例汇总**

- 案例一：下线过程未等调度完成就使用 API 强行设置 Store 为 Tombstone 并 delete store

根据下线流程概述我们可以得知，下线的过程中对于 PD 来说，一个 Store 的状态有两次转变，一次是 Up 到 Offline，一次是 Offline 到 Tombstone，前者代表着一次下线的开始，后者代表着一次下线的结束。正常情况下，只有前者是需要我们或客户手动触发的，即下线的开始是我们进行操作的，而后者是由 PD 通过收集检查 Store 信息自动进行处理的。然而在实际使用中，存在人为地将未下线完成 Store 状态设置成 Tombstone 的情况（最新版本已经不允许通过 API 手动将 Store 的状态设置为 Tombstone，详见：[tikv/pd#3407](https://github.com/tikv/pd/pull/3407) ）。

在一个 Store 被正常的设为 Tombstone 并 delete 前，至少两个事情是需要被保证的

- 其上已经没有任何 Region leader，亦即它不会对外提供服务

- 其上已经没有任何 Region 副本，亦即它不会提供多余的副本冗余

然而不等下线完成，手动强制地将一个节点设置为 Tombstone 并移除则会打破上述约束，一个直接的表现就是会有 Region 残留在这个 Store 上，而与此同时 PD 已经不再存有该 Store 的信息。这会造成这些 Region 始终把该 Store 当成它的所在地之一，从而把相关信息残留到了 Region 的元信息里。这可能会导致以下问题：

- Region 上报给 PD 的信息里面会有一个对 PD 来说并不存在的 Store

- PD 试图通过调度清除这个不存在 Store 上的 peer 却迟迟得不到回应

-  TiDB 可能通过 Region 里残留的 Store 信息错误地发送请求

一般遇到这种情况，需要我们手动的添加 operator 来告诉 Region 应该 “忘记” 这个不存在的 Store 信息，可以通过 pd-ctl 来生成移除 Store 信息的脚本，注意，使用这个方法前需要留意是否删除后 Region 的可用副本会低于多数：

```Markdown
pd-ctl region --jq=".regions[] | {id: .id, peer_stores: [.peers[].store_id] | select(any(.=={store_id}))  } | .id" | awk '{if($0!=""){print "pd-ctl operator add remove-peer",$0,"{store_id}"}}'
```

或者

```Markdown
pd-ctl region --jq=".regions[] | {id: .id, peer_stores: [.peers[].store_id] | select(any(.=={store_id})) | select(length>1) } | .id" | sed -e "s/^/pd-ctl operator add remove-peer /" | sed -e "s/$/ {store_id}/"
```

还有一个方法，但是由于需要停机所有 TiKV，并不推荐使用：[强制 Region 从多副本失败状态恢复服务](https://docs.pingcap.com/zh/tidb/stable/tikv-control#强制-region-从多副本失败状态恢复服务) 