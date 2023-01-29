---
title: PD-Server GRPC 接口图解 - TiDB 社区技术月刊
sidebar_label: PD-Server GRPC 接口图解
hide_title: true
description: 本文主要介绍 PD-Server GRPC 的接口图解。
keywords: [TiDB, PD, GRPC, HTTP restful API, GetMemebers, TSO, Raft Cluster, GC, GlobalConfig]
---

# PD-Server GRPC 接口图解

> **作者**：Aunt-Shirly

PD GRPC Service

## PD GRPC 接口图解

目前 PD 对外暴露的接口主要分为两类：

- GRPC
- HTTP restful API

本文主要介绍 PD [6.0.0](https://github.com/tikv/pd/tree/v6.0.0) 对外暴露的 GRPC 接口信息，通过本文，你可以：

- 通过接口，全面了解 PD 提供的服务内容
- 可以作为一个导读入口，开始源码阅读，深入了解某个部分或开启 PD developer 之旅。

## 概览

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678766418.png)

## 详细接口分类

### GetMemebers

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678764648.png)

- 接口说明： 该接口主要用于获取当前 PD 的实例信息，包括PD 的 leader 信息、子服务信息。
- 请求参数：无
- 请求返回：
  - Member：当前集群中所有实例的基本信息

- etcd_leader: 当前 etcd 集群所在 leader 节点信息。

- Leader: 当前 PD 集群的 leader 节点信息。 pd 选 leader 时，只有 etcd 的 leader 参会参与 leader 的竞选，因此该理论上与 pd leader 节点保持一致，但存在极端情况。

- tso_allocator_leaders: tso 各个 location 对应的 tso 分配器的 leader 信息

### TSO

#### TSO (Get)

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678764648.png)

- 接口说明： 按数据中心获取全局唯一递增时间戳
- 请求参数：
  - dc_location 数据中心位置
  - count 当前想要获取的时间戳个数
- 请求返回
  - count 当前给出的时间戳个数
  - timestamp 时间戳信息
    - physical 逻辑时间戳
    - logical 逻辑时间戳
    - suffix_bits 用于计算 logical 的后缀长度, 主要用作全局区分。

#### SyncMaxTs

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678764649.png)

- 请求说明：同步所有 DC 之间的 MaxTS. 主要实现两个需求：
  - 获取当前系统中最大 localTSO
  - 确保当前系统中的 localTSO 都大于 req.MaxTS
- 请求参数：
  - MaxTs 当前要设置的 maxts 值
  - Skip-check: 是否跳过检查，若为 false, 会
- 请求返回：
  - maxLocalTS
    - 如果 skip-check = false, 则尝试获取当前系统最大 TS
      - 如果发现当前系统的 max-ts 大于 req.max-ts, 则不做更新，并获取当前系统最大的 local-max-ts.
      - 否则，尝试将所有 DC 的时间更新到 req.max-ts,若 dc.current-ts > req.max-ts , 则无需更新。
  - SyncdDcs 数据中心列表

#### GetDCLocationInfo

- 请求说明：获取指定 dc-location 的 信息
- 请求参数： string dc-location
- 请求返回：dc-location 基本信息
  - Suffix int
  - max_ts timestamp

### 集群管理

#### 启动

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678764649.png)

#### Bootstrap

- 接口说明：启动当前集群
- 请求参数:
  - store：集群中 store 基本信息
  - region: 集群中 region 基本信息
- 请求返回

#### IsBootstrapped

接口说明：咨询当前集群是否启动成功

请求参数：

请求返回：当前集群是否已启动成功


### Raft Cluster

#### ClusterConfig

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678764890.png)

##### GetClusterConfig

- 请求说明：获取集群基本信息
- 请求返回：cluster 信息，主要包括
  - Id 集群唯一 ID
  - MaxpeerCount 每个 region 最多的 peer 数，不足时会自动 balance

##### PutClusterConfig

- 请求说明：配置 cluster 的副本数
- 请求参数：cluster 信息，同 Get 请求的返回值
- Question：
  - 这里副本数这个参数看起来外面 tikv 在用？PD 未找到具体使用的地方
  - 处理请求时只对 cluster ID 做了校验，是否需要检查 maxpeercount 是否合理？

#### Stores

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678765046.png)

##### PutStore

接口说明： 创建 store。关键检查条件：

- 如果当前集群中存在相同 ID 的 store 且状态为已删除，返回失败
- 如果 placementrule 未打开，但 store 为 tiflash node 失败（使用 tiflash 需要 placement-rule 启用）
- 如果存在相同 address 但 ID 不同的 store, 返回失败
- 集群中定义的 location - label 未配置全，返回失败。

请求参数：store 基本信息

请求返回：告知 tikv 当前集群的 replication-mode，目前支持两种模式：

- 标准模式：MAJORITY
- DR_AUTO_SYNC：Replicate logs among 2 DCs.

##### GetStore

- 接口说明：根据 ID 获取集群中对应 store 的信息
- 请求参数：store_id
- 请求返回：
  - 当前 store 基本信息
  - 当前 store 统计信息, 如容量，region 个数，SendingSnapCount，KeysWritten，CpuUsages 等基本信息

##### GetAllStores

- 接口说明：获取当前系统中的 store 列表
- 请求参数：exclude_tombstone_stores 是否包含 tombstone 的 store
- 请求返回: store 的原信息列表，同 GetStore

##### StoreHeartbeat

- 接口说明：store 日常心跳上报，确保 store 处于活跃状态
- 请求参数：
  - StoreStats stats 基本状态，基本信息如 capacity,Available,region_count,sending_snap_count,receiving_snap_count, start_time ...
  - StoreReport store_report store 当前的副本列表及状态，只有在 unsafe recovery 才会有此项内容
  - replication_modepb.StoreDRAutoSyncStatus dr_autosync_status 当前系统恢复的状态
- 请求返回：
  - replication_status： 当前集群的 replication-mode
  - cluster_version： 当前集群版本号
  - require_detailed_report unsafecovery 时返回
  - recovery_plan，unsaferecovery 时返回

##### ReportMinResolvedTS

- 请求说明：上报 store 的最小 resolvedTS, 会落到 store 的属性里
- 请求参数：
  - storeID
  - minResolvedTS

#### Cluster

##### RegionHeartbeat

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678765049.png)

- 接口说明：Region 心跳上报, 同步 region 基本信息(只有 **region leader** 会上报心跳, stream req, 一次可能上报多个 region 的心跳)
- 请求参数： Region 基本信息，如：
  - Region: 基本信息，ID,start_key,end_key,epoch,peers
  - Leader: region 的 leader 基本信息（ID，storeID,role）
  - Peer 基本信息，主要分两类
    - Pending peers 还没到 follower 状态的 peer
    - DownPeers: leader 认为挂掉的 peer 信息，包括：
      - Peer 基本信息（ID,storeID,role）
      - downSeconds
  - Region 本身的数据写入情况，如
    - bytes_written/read 当前时间窗口
    - keys_wrritted/read 当前时间窗口
    - Approximate size/keys 总
  - term 当前 raft group 的 term
  - Replication-status
  - Cpu-usage
  - ...
- 请求返回：如果发现当前 region 需要调度，返回对应调度指令, 每个 region 一次只会下发一个 operator
  - ChangePeer： RemovePeer/AddNode/AddLearnerNode
  - TransferLeader
  - Merge
  - Split-region
  - ChangePeerV2: replacing peers/demoting voter directly

##### Region 基本信息读请求

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678765008.png)

###### GetRegion/GetPrevRegion

- 接口说明： 获取当前/前一个 region 基本信息、状态、负载情况
- 请求参数： region-key, 是否需要 buckets 信息
- 请求返回
  - Region: 基本信息
  - Leader
  - down_peers/pending_peers
  - buckets(if needed): 按 bucket 为最小单位的负载情况信息（write/read-key/size）

###### GetRegionByID

- 接口说明：同 GetRegion，区别是通过 region-id 获取

###### ScanRegions

- 接口说明：根据指定的 key 返回获取 region 列表
- 请求参数：
  - start-key/end-key
  - Limit, 为空时，返回所有
- 请求返回
  - Region-metas
  - Region-leaders
  - Regions

说明：这里请求返回的组织形式有点奇怪

###### ReportBuckets

- 请求说明：上报 bucket 基本信息
- 请求参数（stream）：buckets 基本信息
  - region_id
  - Keys []string
  - BucketStats []stat
  - period_in_ms: 数据采集的间隔

##### Split Region

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678764940.png)

###### AskBatchSplit

请求说明：发起将 region 切成指定份数的请求，请求返回成功后，最终 split 不一定成功。

请求参数：region 基本信息，split-count

请求返回：预切分好的 region ID 及peer ID 列表：split-ID (peers-ids,region-id) list

###### ReportBatchSplit

请求说明：tikv 汇报 split region 成功，PD 这边打印日志，方便查询 split region 请求是否已经生效成功。

请求参数：regions 被切分的 regions 信息

请求返回：基本认证 header.

###### SplitRegion

- 请求说明：根据指定 key 列表分裂相关 regions，请求返回时，split 已经物理完成。
- 请求参数：
  - splitkeys: 指定 key 列表
  - retry_limit: 重试次数
- 请求返回：
  - regions_id: 新生成的 region 列表
  - finished_percentage: 完成率

##### ScatterRegion

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678764899.png)

- 请求说明：打散 region
- 请求参数：
  - Group 组名，如果非空，则会在 group 级别进行打散，不存在，则整个集群级别打散。
  - regions_id 需要打散的 region 编号
  - Retry-limit 每个 region 重试次数
  - Region-id 历史参数，当 regions-id 为空时，当前 region 为需要打散的 region
  - region,leader ：需要打散的 regiion 信息，当 PD 找不到需要打散的 regiion 时（region-id) 使用。举例：PD 尚未收到 regiion 的心跳上报。处理逻辑如下：当 regions-id 为空，region-id 为空时，当前信息组织成新的 region 进行打散。
- 请求返回：finished-percentage: 请求完成率，成功的 regions 个数/总 regions 个数

##### SplitAndScatterRegions

- 请求说明：根据指定的 key 切分 region 且打散 SplitRegions+ScatterRegion
- 请求参数:
  - splitkeys: 指定需要切分的 key 列表
  - Group 组名，如果非空，则会在 group 级别进行打散，不存在，则整个集群级别打散。
  - Retry-limit 重试次数
- 请求返回
  - regions_id: 新生成的 region 列表
  - split_finished-percentage: 请求完成率
  - scatter_finished-percentage: 请求完成率

##### SyncRegions（stream）

请求说明：向 PD 发起同步 region 信息的请求，一般用于大集群处理, 以及当 pd 中使用 levelDB 替代 ETCD 存储 region 信息时，PD 间 region 信息的同步。无法保证强一致性。

请求返回：各个 region 信息。。同步 region 基本信息

##### GetOperatorRequest

- 请求说明：获取指定 region 正在执行的 operator 状态
- 请求参数：region_id
- 请求返回：当前 operator 的基本信息和状态
  - region_id
  - Desc
  - status(success,timeout,cancel,replace,running)
  - kind(是否是 admin 发起的，优先级等)

#### GC

![img](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1657678765260.png)

##### GetGCSafePoint

- 请求说明： 获取当前系统的 gc safepoint, 该值通过接口 UpdateGCSafePoint 接口设置
- 请求返回：safe-point

##### UpdateGCSafePoint

- 请求说明：设置 gc safepoint 信息，只有当需要设置的 safepoint 大于当前系统中的 safepoint 时，才会设置成功。
- 请求参数：
  - safe_point 当前要设置的 safepoint.
- 请求返回：
  - new_safe_point 当前系统中的 safepoint

##### UpdateServiceGCSafePoint

- 请求说明：为指定 service 存储可安全 gc 的 safepoint. 成功的条件是当前要设置的 safepoint 大于等于 service 中最小的 safepoint
- 请求参数：
  - service_id
  - TTL，TTL 为负数表示删除对应的 safepoint.
  - safe_point, 表示对 service 来说，当前 safepoint 之前的数据可以 GC 掉
- 请求返回：当前系统中 safepoint 最小的那个 service 信息, 该 minsafepoint 会永远向前滑动不会回退
  - service_id
  - ttl
  - MinSafepoint

### GlobalConfig

看起来这里是对 ETCD 的简单封装，将需要的配置项放在 /global/config 下面，通过下面三个接口来实现查询、更新及服务发现的功能。

#### StoreGlobalConfig

- 接口定义：存储 key-value 配置项到 PD
- 参数：items []items,items 内容包括
  - Key
  - Value
  - error(没有使用)

#### LoadGlobalConfig

- 接口定义：获取 /global/config 下指定 keys 对应 的 values
- 请求参数：
  - Names []string 需要的 key 的名称
- 请求返回：当前需要的 keys 对应信息
  - Key
  - Value
  - error(查询该 key 过程中遇到的错误或 NOT found)

#### WatchGlobalConfig

请求说明：监听 /global/config 目录

请求返回：当前目录下发生变化的 key-value 信息