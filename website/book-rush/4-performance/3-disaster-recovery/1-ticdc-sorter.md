---
title: TiCDC 6.0 原理之 Sorter 演进
hide_title: true
---

# TiCDC 6.0 原理之 Sorter 演进

> 作者简介：[eastfisher](https://tidb.net/u/eastfisher/answer)，软件开发工程师，TiDB 爱好者。

## 产生背景

TiCDC 是一款 TiDB 增量数据同步工具，通过拉取上游 TiKV 的数据变更日志，TiCDC 可以将数据解析为有序的行级变更数据，之后输出到下游。TiCDC 的典型应用场景包括数据库灾备，数据集成等。

TiCDC 处理 TiDB 增量数据同步时，需要经过 `CDCKVClient` 拉取 TiKV Change Log，`Sorter` 数据排序，`Mounter` 消息格式转换后经 `Sink` 发送到下游数据源的过程。其中的 Sorter 模块对保证消息有序性起着重要作用，本文主要介绍 Sorter 模块的基本原理和演进过程。

## 处理流程

TiCDC 的 CDC 任务的逻辑单元是 Changefeed，用户可以通过 cdc cli 或者 OpenAPI 向 TiCDC 提交 Changefeed 任务，TiCDC 集群中的 Owner 会处理对 Changefeed 任务进行解析，将其拆解为针对每张数据表的 TablePipeline 交给各个 Proessor 处理。Processor 内部会首先由 Puller 通过连接到 TiKV 集群的 CDCKVClient 拉取 TiKV Change Log（RawKVEntry）并根据 OpType 简单转换成 PolymorphicEvent，交给 Sorter 进行排序，排序完成后再由 Mounter 对消息进行解析，然后交给 Sink 发送给下游数据源。

import useBaseUrl from '@docusaurus/useBaseUrl';

<center>
    <img src={useBaseUrl('https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/tablepipeline%E5%A4%84%E7%90%86%E6%B5%81%E7%A8%8B(1)-1657260852358.png')} width="80%" />
</center>

Sorter 的排序实现逻辑被封装在 `EventSorter` 接口中：

```
type EventSorter interface {
    Run(ctx context.Context) error
    // 输入侧, 供上游Actor (也就是Puller) 调用, 把无序CDC数据放入Sorter
    AddEntry(ctx context.Context, entry *model.PolymorphicEvent)
    TryAddEntry(ctx context.Context, entry *model.PolymorphicEvent) (bool, error)
    // 输出侧, 得到排好序的CDC数据
    Output() <-chan *model.PolymorphicEvent
}
```

## Sorter模块演进

TiCDC 的 Sorter 模块经历了多次演进，从最初的基于内存的 Memory Sorter，再发展到基于文件的 Unified Sorter，最终演进为目前 6.0 版本基于 Key-Value 存储的 DB Sorter。

### Memory Sorter

Memory Sorter 用两个 Go Slice 分别将未排序的数据变更事件和 Resolved 事件缓存到内存中。如果遇到 Resolved 事件，则异步发起一次 **排序** 和 **合并** 操作。

排序操作使用 Go 标准库的 `sort` 中的快速排序算法来实现，排序规则定义在 `ComparePolymorphicEvents` 函数中，按以下顺序进行排序：

1. Commited / Resolved TS 较小的排在前面
1. Commited / Resolved TS 相同，则：
   1. Resolved 事件排在最后
   1. Start TS 较小的排在前面
   1. Start TS 相同，DELETE 事件排在 PUT 事件前面

<center>
    <img src={useBaseUrl('https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/sort1-1656381637600.png')} width="65%" />
</center>

排序完成后，从 `resolvedTsGroup` 中取最后一个作为 maxResolvedTs，然后开始执行 Merge 操作。将上一次排好序的事件与本次排好序的事件做二路归并排序，如果事件的 Commited / Resolved TS 小于 maxResolvedTs，则直接发送到下游，剩余事件重新缓存到内存中，等待下一个 Resolved TS 事件的到来。

<center>
    <img src={useBaseUrl('https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/sort2-1656381650830.png')} width="80%" />
</center>

由于 Memory Sorter 完全使用内存来存储等待排序的事件，当上游出现大量数据写入，而此时如果下游写入速度较慢，导致 Memory Sorter 的 Output 环节出现消息堆积时，会导致数据在 Memory Sorter 的内存中堆积，而在缺少 Back Pressure 机制的情况下，容易引发 OOM。此外，TiCDC 的增量扫环节如果有大量 Unresolved 数据堆积在 Memory Sorter，也易引发OOM。另一方面，Memory Sorter 是 table 级别的，每个 Changefeed 中的每个 TablePipeline 都需要创建一个 Sorter 实例，而 Sorter 内部又会开启多个 Goroutine 进行排序，当表数量较多时，Goroutine 数量也会成倍增多，给 Go Runtime 调度带来压力.

### Unified Sorter

Unified Sorter 的出现，在一定程度上解决了 Memory Sorter 的问题。该 Sorter 被称为 **Unified** 的主要原因在于会在全局层面对事件排序所需资源进行管理。而 Memory Sorter 的资源粒度是 Table 级别的。

Unified Sorter 在初始化时，会开启多个 `heapSorter` 实例（通过 `sorter-num-concurrent-worker` 参数控制实例数，默认值为4），并注册到全局的 `heapSorterPool` 中。Unified Sorter 在接收到上游发送的 `PolymorphicEvent` 事件后，会按消息类型执行不同的分发策略。对于 Resolved 类型事件，Unified Sorter 会将该事件广播到所有的 `heapSorter` 实例中。而对 DELETE / PUT 事件，则会以 round-robin 策略将消息路由到对应的 `heapSorter` 实例。

`heapSorter` 实例借助内部 heap 对事件进行排序（排序规则与 Memory Sorter 相同），当遇到 Resolved 事件或 heap 内存超过阈值时，会执行一次 Flush 操作，对整个 Heap 做一次 Dump。Flush 操作由全局单例 backEndPool 统一管理存储资源，并由全局单例 `heapSorterIOPool` 统一管理计算资源。

<center>
    <img src={useBaseUrl('https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unified1-1656381489439.png')} width="70%" />
</center>

`backEndPool` 提供了基于内存的 `memoryBackEnd` 和基于文件系统的 `fileBackEnd` 两种存储实现，当内存空间足够时，优先使用 `memoryBackEnd，`而当内存空间不足时，会新建一个文件，使用该文件作为 `fileBackEnd` 写入排好序的事件消息。文件名的格式为： `${指定路径名}/sort-pid-${counter}.tmp`，如 `/data/sort-10501-1.tmp`。写入完成后会将 `flushTask` 发送至 Merger 等待进一步处理。

经过这一步操作，事件在内存 Heap 进行堆排序，再刷出到内存或文件，形成一个个的静态 Heap（这里没有用持久化 Heap 来表述）。在 Merge 阶段，Merger 会再创建一个内存 Heap，对当前有效的 `flushTask` 进行多路归并排序后，将事件消息 Output 到下游。

<center>
    <img src={useBaseUrl('https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unified2-1656381515771.png')} width="65%" />
</center>

相比 Memory Sorter，Unified Sorter 解决了排序事件全部缓存在内存中，有可能引起OOM的问题，但仍然存在计算资源与表数量成线性关系的问题，资源利用率不高。

### DB Sorter

DB Sorter 在 TiCDC 6.0 版本已经默认开启，相关配置项参数名称为 `enable-db-sorter` 。DB Sorter 底层使用了基于 LSM Tree 的 Key-Value 实现 PebbleDB，并抽象出了类似 Level DB 的接口，包括 DB、Batch、Iterator 这3个接口 (在 [db.go](https://github.com/pingcap/tiflow/blob/master/pkg/db/db.go) 定义)，方便今后替换实现或进行测试。几个比较核心的操作包括 Put、Delete、Iterator、Compact 等。

DB Sorter 采用新的 Actor 框架，以事件驱动的方式执行整个数据排序处理流程。关于 Actor 框架的更多设计可通过阅读 [actor doc](https://github.com/pingcap/tiflow/blob/master/pkg/actor/doc.go) 进行了解。

DB Sorter 由以下核心模块组成：

- Sorter：实现 `EventSorter` 接口，作为连接 TablePipeline 与 Sorter Actor 的桥梁，是 Actor 的入口；将事件 Output 到下游，也是 Actor 的出口。
- Writer：解析 PolymorphicEvent，进行 key 统一编码后发送给 DBActor。
- DBActor：将底层 DB 接口封装成 Actor，以事件驱动方式执行 KV 读写操作。可通过配置指定数量，默认16。
- Reader：读取排好序的事件消息，Output 到下游，并把这些事件消息从 DB 中删除。
- CompactActor：将底层 DB 接口的 Compact 操作封装成 Actor，并由 CompactScheduler 统一调度。

以上模块中，Sorter、Writer、Reader 是每张表对应1个，而 DBActor、CompactActor 是配置指定的固定数量，默认16个。

与 Unified Sorter 类似，DB Sorter 也是全局唯一的单例，System 在启动时，会默认创建 16 个 DB 实例和对应的 Compactor。将 N 张表的 CDC 事件消息映射到 M 个 DB 上，并且 DB 只支持读写 Key-Value 数据，因此需要对 Key 编码做一定设计。DB Sorter 的 Key 编码格式为：

<center>
    <img src={useBaseUrl('https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/20220627194955-1656380709070.png')} width="80%" />
</center>

采用这样的 Key 编码方式是与之前提到的事件排序规则密切相关，Commited / Resolved TS 在最前，Start TS 其次，最后是事件类型。此外，由于 DBActor 并不是每张表独享的，因此还需要为每张表划分一个 Namespace，Key 编码的 Unique ID 和 Table ID 就唯一确定了当前 DBActor 中这张表对应的 Namespace.

整个排序处理流程与 Unified Sorter 比较相似但略有不同，主要区别在于 DB Sorter 会将同一张表的所有事件消息路由到同一个 DB 实例上，这样就不再需要在 Output 之前进行多路归并排序了。

DB Sorter 解决了 Unified Sorter 排序时的资源使用与表数量成线性关系导致的资源占用大，资源利用率不高的问题，官方的性能测试表明，在使用 DB Sorter 的情况下，十万张表同步到下游可以稳定运行。但是目前 DB Sorter 并没有像 Unified Sorter 采用内存缓存，导致同步延迟有毫秒级的增加。相信未来可采用 Unified Sorter 类似的实现机制解决该问题。

## 总结

伴随着 TiCDC 应用场景，数据规模不断扩大，TiCDC的性能也受到了越来越严苛的考验。其中的 Sorter 数据排序模块作为整条数据处理链路的核心模块之一，经过 Memory Sorter -> Unified Sorter -> DB Sorter 3个版本的演进优化，现在已经能够适应各种常见的典型应用场景。Unified Sorter 适用于对同步延迟有严格要求的场景，而 TiCDC 6.0 新增加的 DB Sorter 更加适合大规模集群下的数据同步，支持高达 10 万张表的同时同步，对支持数据集成，实时数仓等场景有着重要意义。

## 参考资料

1. [db sorter design doc](https://github.com/pingcap/tiflow/blob/master/docs/design/2022-03-16-ticdc-db-sorter.md)
1. [sorter issue](https://github.com/pingcap/tiflow/issues/2698)
1. [Unified Sorter]([https://docs.pingcap.com/zh/tidb/v5.3/manage-ticdc](https://docs.pingcap.com/zh/tidb/v6.0/manage-ticdc#unified-sorter-%E5%8A%9F%E8%83%BD))
1. [TiDB 6.0 Book Rush 文章构思指南](https://tidb.net/book/book-rush/event-guide/article-guide)
1. [TiCDC系列分享-02-剖析同步模型与基本架构](https://tidb.net/blog/9568ace1)
1. [TiCDC简介](https://docs.pingcap.com/zh/tidb/stable/ticdc-overview#ticdc-%E7%AE%80%E4%BB%8B)
