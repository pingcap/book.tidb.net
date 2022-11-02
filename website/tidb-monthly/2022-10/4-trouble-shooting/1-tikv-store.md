---
title: TiKV缩容下线异常处理的三板斧 - TiDB 社区技术月刊
sidebar_label: TiKV缩容下线异常处理的三板斧
hide_title: true
description: 本文介绍TiKV缩容过程中常见处理方式，适用于4.X或以上版本使用tiup管理的集群，由于版本差异可能不同版本的执行结果有差异，TiDB一直在不断完善下线处理过程。
keywords: [TiKV, 扩缩容, TiDB, 缩容]
---

# TiDB分布式事务—写写冲突

> 作者：[h5n1](https://tidb.net/u/h5n1/answer)

## 1   概述

TiKV/TiFlash 缩容是TiDB运维中经常执行的操作，由于系统本身或缩容过程中操作不当，容易导致TiKV处于offline状态无法成为tombestone，造成缩容过程失败。

本文介绍TiKV缩容过程中常见处理方式，适用于4.X或以上版本使用tiup管理的集群，由于版本差异可能不同版本的执行结果有差异，TiDB一直在不断完善下线处理过程。

以下内容为个人经验总结，不当之处还请指正，有其他处理方法也请分享一下。

## 2   Store状态转换

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664883884592.png)

在了解store状态转换过程前，先了解2个基本概念。

peer：region是一个虚拟的逻辑概念，每个region分配一个id是 region_id，一个region下默认有3个副本，每个副本叫做peer，各分配一个peer_id，每个peer位于不同的tikv实例。

store: 指的是TiDB集群中的1个TiKV或TiFlash实例

store的生命周期中包含有多种状态：

- **Up **

表示当前的 Store 处于提供服务的正常状态。

- **Disconnect**

当 PD 和 TiKV 的心跳信息丢失超过 20s 后，该 TiKV 的状态会变为 Disconnect 状态。

- **Down**

表示该 TiKV 与集群失去连接的时间已经超过了 max-store-down-time 定义的时间，超过该时间后，相应的 TiKV 会变为 Down，并且开始在存活的 TiKV 上补足各个 Region 的副本。

- **Offline**

当对某个 TiKV 缩容后，该 TiKV 会变为 Offline 状态，该状态只是 TiKV 下线的中间状态，处于该状态的 TiKV 会进行 leader 的    transfter 和 region balance ，当 leader_count/region_count  均显示 transfter 或 balance 完毕后，该 TiKV 会由 Offline 转为 Tombstone。在 Offline 状态时，TiKV仍能提供服务、进行GC等操作，**禁止**关闭该 TiKV 服务以及其所在的物理服务器或删除数据文件。

-   **Tombstone**

表示该 TiKV 已处于完全下线状态，可以使用 remove-tombstone 接口安全的清理该状态的 TiKV。

TiKV 节点的状态可通过以下三种方式查询：

（1）使用tiup cluster display cluster_name 命令

（2）使用pd-ctl –u pd_addr store命令

（3）查询information_schema.tikv_store_status

## 3   TiKV下线流程

Tikv 下线为异步过程，其状态过程会经历UP、Offline、Tombstone 3个阶段。

**(1)   手动转移leader和region**

Tikv 下线过程中最耗时的就是在offline阶段的leader和region转移过程，也是最容易出问题的阶段，为了使下线过程更加可控，建议下线tikv节点前先手动转移。

使用`pd-ctl store weight <store_id> <leader_weight> <region_weight> `设置待下线节点的`leader_weight/region_weight` 为0。

对于leader转移也可以使用 `pd-ctl scheduler add evict-leader-scheduler store_id`  添加evict调度方式驱逐待下线store上的Leader。

使用`pd-ctl store`或`information_schema.tikv_store_status`检查待下线节点leader_count、region_count。

**注意**：设置`leader_weight/ region_weight`为0并不能保证全部的laeder/region都能转移完。若果有少量的遗留可使用第后面章节中的手动添加调度方式进行转移

**（2）开始缩容**

缩容命令使用`tiup cluster scale-in cluster_name –N xxx`方式，该命令会调用PD API开始下线流程，之后tikv状态变为offline，进行leader和region转移，当全部转移完成后tikv就会转为tombstone状态。

在store未转换为tombstone状态前**禁止**使用--force选项强制缩容，强制缩容只是不等的leader/region转移完成就将tikv节点从集群中移除，虽然tiup cluster display已无法看到下线的节点但region信息依然残留，此时store处于offline状态、region无法完成转移。--force仅适用于tikv节点完全宕机或数据目录被删除的极端情况。

对于UP状态的store **pd-ctl store delete 命令也仅仅是将tikv设置为offline状态**，并不是删除store。在5.x版本前可以使用命令强制将store转为tombstone状态，该命令仅在全部完成leader/region转移后才可使用，否则的话会引起异常，因此5.X版本后禁止了该命令。

对于正常操作缩容的节点如果leader/region无法正常转移，导致长时间处于offline常见的原因有： 其他接的磁盘满了或达到high-space-ratio上限导致不能被调度；raft group工作异常比如无法选主导致无法执行调度。

**（3）调整下线速度**

通过pd-ctl config set 命令可以增大leader-schedule-limit、replica-schedule-limit、region-schedule-limit等参数增加leader/region的调度速度，加快下线过程，上述命令是用于控制PD侧调度命令的产生速度，实际的执行还收tikv侧的消费速度限制，通过`pd-ctl store limit <store_id> <limit> `增加消费速度。

**（4）清理tombstone节点**

当tikv节点转变为tombstone状态后，使用tiup cluster display 时会提示使用tiup cluster prune命令完成集群清理Tombstone 节点，该命令会执行以下操作：

- 停止已经下线tikv节点的进程
- 清理已经下线掉的节点的相关数据文件
- 更新元数据信息和集群拓扑，移除已经下线掉的节点

**（5）再次清理**

有时通过tiup cluster prune清理完下线节点后在集群里已经清理完，但监控中仍然会显示tombone store，可以使用如下命令进行清理：

```markdown
       pd-ctl -u http://pd_ip:2379 store remove-tombstone
```

       或 &#x20;

```markdown
           curl -X DELETE pd-addr:port/pd/api/v1/stores/remove-tombstone
```

**（6） 终止下线过程**

处于offline状态的节点未成为tombstone前可以通过以下命令终止其下线过程(需在PD所在节点执行)，使tikv重新成为UP状态，不适用已经删除tikv 数据目录或宕机的情况，部分情况该tikv可能需要重启。

```markdown
       curl -X  POST http://pd_ip:pd_port /pd/api/v1/store/{store_id}/state\?state=Up
```

       上述的下线流程为首先使用tiup cluster scale-in方式，缩容操作时也可以使用如下流程：

(1)    使用pd-ctl store delete 开始下线过程，store变为offline。

(2)    待状态变为tombstone后使用store remove-tombstone清理

(3)    使用tiup cluster scale-in --force 清理下线节点信息。

## 4   异常处理三板斧

### 4.1 第一招：手动调度

Leader/region的迁移过程其实就是PD下发的一系列operator，当出现store长时间处于offline时，可首先尝试使用下面的命令手工添加调度移除待下线store上的副本：pd-ctl operator add remove-peer \<region\_id> \<from\_store\_id>。

可以参考下面脚本，批量的将store上region做remove-peer：

```markdown
 for i in { <offline_store_id> }
 do
    for j in pd-ctl region store $i | jq ".regions[] | {id: .id}"|grep id|awk '{print $2}'
    do
     pd-ctl operator add remove-peer $j $i
     done
    pd-ctl store $i
 done
```

手工添加调度方式适合于tikv节点上所涉及region的raft工作正常情况，region中存在leader接收operator调度，对于选不出leader的情况使用该命令会报cannot build operator for region with no leader 错误。当出现此类问题时则需要进行多副本失败恢复或重建region的操作。

可使用如下命令找到没有leader的region:

```markdown
pd-ctl  region --jq='.regions[]|select(has("leader")|not)|{id: .id,peer_stores: [.peers[].store_id]}'
```

### 4.2 第二招：多副本失败恢复

region默认为3副本，当有2个tikv实例出现故障时则会有region出现半数以上副本不可用的情况，因此整个region变为不可用状态，次数查询该region数据会报Region is unavailable错误，此时需要进行region多副本失败恢复，强制将故障tikv上的region信息移除，然后由tikv自动根据最后剩余的region副本进行补齐。

多副本失败恢复主要步骤如下：

(1)    停止region调度，将limit相关参数调整为0

使用pd-ctl config show|grep limit > limit.config记录当前配置

使用pd-ctl config set region-schedule-limit 0 设置limit相关参数为0

(2)    停止待下线节点上region涉及的所有的tikv实例，一般情况涉及region数量较多需要停止所有tikv实例。

可使用如下命令查找故障节点上多数副本失败的region(if里指定store_id列表):

```markdown
pd-ctl   region --jq='.regions[] | {id: .id, peer_stores: [.peers[].store_id] | select(length as $total | map(if .==( 4,5,7) then . else empty end) | length>=$total-length)}'
```

(3)    在正常的tikv节点上执行恢复命令

```markdown
tikv-ctl --db /data/v5.0.3/tikv/data/db unsafe-recover remove-fail-stores -s 3 -r 1001,1002
```

当问题tikv上仅有少量region时可以使用上述命令，并且仅需关闭region涉及的tikv并执行。其中-s 为待下线的问题store_id，-r为该store上的region。如果想要移除store上的region可使用--all-regions 选项

```markdown
tikv-ctl --db /data/v5.0.3/tikv/data/db unsafe-recover remove-fail-stores -s 4,5,7 --all-regions
```

使用时需注意以下几点：

- 涉及的region所在的正常tikv 必须关闭方可进行，如果使用--all-regions则必须关闭所有正常的tikv实例，然后在所有的正常节点上执行

- 不同版本命令有差异--data-dir时需要为部署时的data-dir目录，使用--db时为data-dir下的db目录

(4)    重启tidb集群

做完多副本失败后使用pd-ctl store检查刚才处理的store会，不同的TIDB版本会出现如下不同的情况

- 故障节点的tikv会从集群正常移除，系统正常运行。

- 如果为tombstone状态，此时可以按照前面的操作remove-tombstone。

- 如果为down状态则可以store delete使其成为tombstone后清理。

- 如果状态仍为offline且leader/region count不为0可再次进行unsafe-recover直到为0。如果有全副本丢失的话则可能leader/region count为0后仍然为offline状态，需要重建region，所涉及的region重建后就会变为tombstone，具体操作见下一节。

如果由于多个store故障导致某些region的副本全部丢失可能会无法正常启动tikv此时需要recreate-region方式创建空region，如果很不幸这些region是系统表使用由于数据丢失还会有其他问题。

(5)    恢复limit调度参数

恢复调度后会为缺失副本的region补充副本，可使用如下命令检查副本数为1的region(length指定副本数)：

```markdown
pd-ctl region --jq='.regions[] | {id: .id, peer_stores: [.peers[].store_id] | select(length==1) } '
```

多副本失败恢复也适用于仅1个tikv实例故障时的处理，缺点是需要停止所有tikv实例影响系统可用性，**因此6.x版TiDB支持在线的多副本失败自动处理，详细过程可参考[官方文档](https://docs.pingcap.com/zh/tidb/stable/online-unsafe-recovery)**

更多关于多副本失败恢复的过程文章可在asktug搜索。

### 4.3 第三招：重建region

如果region的副本全部丢失或仅少量的几个无数据空region无法选出leader时可以使用recreate-region方式重建region。

(1)    副本全部丢失，执行了多副本失败恢复

检查副本全部丢失的region，if内指定故障tikv的store_id

```markdown
pd-ctl region --jq='.regions[] | {id: .id, peer_stores: [.peers[].store_id] | select(length as $total |map(if .==(4,5,7) then . else empty end)|length>$total-length)}' |sort
```

(2)    少量region无数据且无法选主，未对集群做任何处理

使用curl [http://tidb_ip:10080/regions/{region_id}](http://tidb_ip:10080/regions/%7bregion_id%7d) 检查该region上的对象信息，如果frames 字段为空的话则说明该region为无数据的空region，重建无影响，否则会丢失数据。

(3)    重建region

关闭region涉及的存活tikv实例，然后在其中一个正常tikv上执行：

```markdown
    tikv-ctl --data-dir /data/tidb-data/tikv-20160 recreate-region -p 'pd_ip:pd_port' -r  <region_id>
```

**注意：**以前版本使用--db参数而非--data-dir，指定目录为正常tikv的。另外复制命令时注意引号、单横线是否是中文格式。

(4)    重启tikv

如果之前unsafe-recover后store状态仍为offline，重启后正常tikv会成为tombstone状态(有时需要pd-ctl直接指定下线store_id查看)，然后remove-tombstone即可。

除了使用recreate-region重建外，也可以尝试tombstone region方式：

```markdown
tikv-ctl --db /path/to/tikv/db tombstone -p 127.0.0.1:2379 -r <region_id>,<region_id> --force
```

## 5   总结

TiDB支持在线扩缩容，在缩容时如果理解store状态转变和每步处理过程并按流程操作出现异常情况的概率相对较小，随着版本的变化也在一直不断改善缩容过程的处理，降低系统自身问题的概率，针对缩容时的操作建议如下：

(1)    系统部署时对于单机多tikv的情况一定要打上label标签，保障同一服务器上不同的tikv实例在isolation-level具有相同的label，避免将相同region的多个副本调度到同一服务器，从而因服务器故障造成多副本丢失。

(2)    缩容tikv时应尽量提前进行leader/region转移，使缩容过程更加可控。

(3)    缩容时、store处于offline状态时禁止使用--force参数，仅对宕机无法修复、数据目录被删除的场景使用。

(4)    缩容多个tikv时要尽量一个一个的进行处理，避免一次下线多个时出现问题，尤其是同一服务器上的多个tikv。

(5)    缩容时要保障其他的tikv节点有足够的磁盘空间接收转移的region。

(6)    如果允许尽量使用高版本数据量。

(7)    做完多副本失败恢复后要检查数据是否一致。

(8)    注意使用tikv-ctl等工具时要不同的版本会有不一样的参数，如--db或--data-dir。