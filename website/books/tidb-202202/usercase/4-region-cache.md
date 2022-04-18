---
title: 原理解读 | Region Cache 缓存和清理逻辑解释
hide_title: true
---

# 原理解读 | Region Cache 缓存和清理逻辑解释

## 作者介绍：

苏立，TiDB 内核研发

## **缓存概述**

在 TiDB 中每个 kv 请求都需要根据 Key 定位到能处理该 Key 请求所在的 Store 地址， 而 Key 到 Store 的映射信息实际存分散存在于每个 kv 中且集中收集于 PD 中， 理论上对于每个请求 TiDB 可以通过每次向 PD 查询 Key 对应哪个 Store 的信息， 但出于性能考虑在 TiDB 侧测我们维护了一个内存 Cache 来缓存映射信息避免重复的查询。

### **缓存填充**

目前 TiDB 的 Region Cache 缓存更新机制是类似 [Cache Aside Pattern](https://dzone.com/articles/cache-aside-pattern) 的方式，即 TiDB 进程启动后为空 Cache，在通过 Key(或 Key Range) 查询 Cache 查询时，首先查询 Cache，Cache Hit 直接返回 Cache 的结果，如果发生 Miss 则向 PD 通过 Key (Key Range)获取涉及的 Region 信息并回填到 Cache 中。

因为 Region 信息可以理解为 {key-start, key-end} ---> peers + leader 的信息映射，使用 start 到 end 中的任意一个 key 到 PD 查询回填后，后续 start 到 end 内的所有请求都不需要再访问 PD，通过本地内存查询即可完成 Key 到 peers + leader 信息的查询。

### **缓存清理**

信息被填充到缓存中后，在以下三种情况需要清理:

1. Region 在 10min 内没有任何访问
2. TiKV 提示 Region 信息发生变更
3. Region 给出的 TiKV 节点不可达

在 TiDB 中 region 的清理实现目前使用的是标记清理，即标记删除，等下次查询到达时看到删除标记会当做不存在处理， 触发 Cache Miss。(这样实现主要为了减少锁竞争和实现简单可靠)

对于第一种情况:**Region 在 10min 内没有任何访问**， Cache 通过维护记录缓存项目的上次访问时间实现，访问时查看如果超过 10min 没访问，则将当前 Region 标记删除返回空。这个主要处理如果长期缓存未访问 region 信息大概率已经变更的假设。

对于第二种情况:**TiKV** **提示 Region 信息发生变更**， TiDB 目前的架构原则是 PD 和 TiKV 不会主动向上游 TiDB 通知信息变更， TiDB 需要通过访问 TiKV， TiKV 检查请求中的 Region 信息，如果发现请求的 Region 信息不对或已过期通过 Region Error 的形式，告知 TiDB 更新根据 KV 给出的信息更新当前 Region 的 Cache 或过期 Cache 并重试从 PD 获取新的 Region 信息。

对于第三种情况:**Region 给出的** **TiKV** **节点不可**达，即到 TiKV 的请求发送网络错误或超时错误，这种情况会对当前请求 Store 的所有 Region 标记删除，这个 Store 的所有 Region 的后续请求都会先尝试从 PD 获取一次最新的 Region 再进行 KV 请求。因为从 TiDB 侧并不能确定目标 TiKV 是宕机还是被分区所以只能尝试从 PD 获取从 PD 视角看到的 Region 情况，另外为了解决 TiKV 突然宕机 Store 上的所有 Region 都需要失败一次才能去 PD 重新拉取的效率问题，这里会标记的是当前请求 Store 上的所有 Region。(实现上为了避免扫 Store 上的 Region 的长期持锁使用的标记 Store 的方式实现，只有 Region 用(或尝试用)这个 Store 做 leader 时才会触发 Reload，如果 Region 目前用其他节点正常做 leader 正常工作，其中某个 follower 挂了 region 不会有任何性能损失)。

## **TiKV** **的 RegionError 和处理**

在 TiKV store 还活着且网络可达的情况，KV 在收到 TiDB 请求并发现请求中的 Region 信息不准确时，会通过返回 RegionError 来告知 TiDB 对 Cache 进行信息修正，目前 KV 会返回以下 RegionError:

### **NotLeader**

TiKV 检查:

该错误在 RaftStore 中报出，为当前请求的 peer 不是 Leader，引起该错误的原因如下：

1. 缓存过期，Region 的 Leader 确实已经更换, 返回错误中会包含新 Leader
2. 当前 Region 的 Leader 缺失，需要等待选举出新 leader 后再向 PD 获取 Region 信息，返回给 TiDB 的错误中没有 Leader

TiDB 处理:

- 如果收到的 NotLeader 报错中有告知新 Leader

  - 新 Leader 在 Region 已知的 Store 列表中，则直接修改 Cache 中的 Leader 为新 Leader，并重试使用新 Leader。(即: Region 切换 Leader)

- 新 Leader 不在 Region 已知 Store 列表中 ，淘汰当前 Region 的缓存重试重新从 PD 获取包含新 Store 的 Region 信息。(即: Region 添加新节点且 Leader 切换到新节点)

- 如果收到 NotLeader 报错中没有告知新 Leader，即 Region 在进行选举，则在 backoff 后尝试当前已知该 Region 的其他 Store(因为 TiKV 的信息是最准的如果 KV 反馈说没有 leader ，去 PD 获取也没用，此外就是考虑 PD 和 TiDB 被短暂分区但 KV 和 TiDB 可达的情况尝试其他节点可以不依赖 PD 更快发现新 Leader)。如果所有节点都尝试一圈(一般 3 副本)会触发一次 PD reload 当前 region 的尝试。

### **StoreNotMatch**

TiKV 检查:

该错误在 RaftStore 中报出，为当前请求地址的 store_id 与期待的不一致。

TiDB 处理:

向 PD 重新获取 store_id 对应的 store 地址， 然后更新 store_id 到 store 地址的缓存信息。

在 Region 信息中只会维护 store_id (可以理解为域名)， 进而实际的 store 的地址需要将 store_id 做一个 resolve 为实际地址进行请求(可以理解为 IP)，这个错误一般是 store 换了地址(比如换网卡)，只会简单更新 store_id -> store 的映射不会影响已经缓存的 region 信息。

### **RegionNotFound**

TiKV 检查:

该错误在 RaftStore 报出，为当前 Store 中没有找到指定的 Region。

TiDB 处理:

引发该错误可能是 TiDB 的 Region 缓存过期，会清理当前 Region 缓存，并重试向 PD 获取再次发送请求。

### **KeyNotInRegion**

TiKV 检查:

该错误在 RaftStore 中报出，为请求的 key 不在指定 region 中。

TiDB 处理:

引发该错误可能是 TiDB 的 Region 缓存过期，会清理当前 Region 缓存，并重试向 PD 获取再次发送请求。

### **EpochNotMatch**

TiKV 检查:

该错误在 RaftStore 中报出，Region 的版本过期，请稍后重试。

检查机制实现是，每个 Region 信息都有 Epoch 信息，包括两个字段:

- conf_ver 代表配置项版本，新增或删除 peer 时，该属性会自增

- version 代表 region 的版本，当 region 被合并或拆分时，该值会自增

TiDB 的在请求 TiKV 时会在请求中附上 Epoch，KV 会校验 Epoch 如果不匹配则返回 EpochNotMatch 错误, 并在错误中附带自己知道的最新 Region 信息。

Attention: 对于 get/set/delete 请求 kv 只会校验 version 不会检查 conf_ver, 所以在增减 follower 或 leaner 不会导致这些非 admin 请求报 EpochNotMatch

TiDB 处理:

TiDB 在收到 EpochNotMatch 后：

- 如果 EpochNotMatch 中提供的 region 信息比当前 TiDB 已知的 region epoch 还老会 backoff 一会儿后重试

- 如果 EpochNotMatch 中提供的 region 信息比当前新则会用 EpochNotMatch 中的 region 信息更新当前 region cache

- 如果 EpochNotMatch 提供的 region 信息中没有包含当前 region(即给的 region 换了)，除了将提供的新 region 更新到 cache 外，还会将这个缺失的 region 对应的 cache 清理，后续如再用到会到 PD reload

因为 kv 提供的信息理论上更准确，这个错误正常都是会直接更新 cache，不用请求 PD。

### **ServerIsBusy**

该错误在 kv 层报出，当写压力过大时，会出现该错误，会 backoff 后重试，和 Region Cache 无关。

### **StaleCommand**

该错误在 RaftStore 中报出，操作过期，会 backoff 后重试，和 Region Cache 无关。

### **RaftEntryTooLarge**

RaftEntry 过大会返回用户错误不会重试，和 Region Cache 无关。

### **TiKV** **不可达**

在前面“缓存清理-第三种情况”那已有描述，在发 TiKV 不可达无法提供响应的情况下(可能是: 建立连接超时或错误或连接已建立但单次请求超时或错误或 kv 临时或长期不可用)， TiDB 不能收到任何收到来自 KV 对 Region 的错误提示，只能假设 KV 可能不可用，对当前请求 Store 的所有 Region 标记 schedule 一次到 PD 的 reload，后续请求在使用到这个 Store 时会 lazy 触发对 Region 的重新拉取，希望通过 PD 能获取到可用 KV 的信息。
