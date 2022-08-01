---
title: TiKV主要内存结构和OOM排查总结 - TiDB 社区技术月刊
sidebar_label: TiKV主要内存结构和OOM排查总结
hide_title: true
description: 本文主要介绍 TiKV 主要内存结构和 OOM 排查总结。
keywords: [TiDB, TiKV, block cache, write buffer, raftstore, coprocessor task, cdc  component, BR, OOM, TiKV Detail]
---

# TiKV主要内存结构和OOM排查总结

> **作者**：h5n1

## 1 tikv主要内存

### 1.1 block cache

TiKV 底层使用 rocskdb 作为存储引擎，block cache 用于缓存从 sst 文件读取的block，采用 LRU 方式管理。TiKV底层包含2个 rocksdb 实例一个用于存储 raftlog 叫raftdb(参数中为raftdb)，仅包含一个 default CF 。另一个存储实际数据和锁信息叫 kvdb(参数中为rocksdb),包含 default、write、lock、raft 4 个 CF。每个 CF 可通过相应的 block-cache-size 参数调整大小，当设置 storage.block-cache.shared=true 时2个 rocksdb 实例会中所有 CF 使用共享的 block cache 区域，自动调整每个 CF 使用的内存大小。通过参数 storage.block-cache.capacity 设置这个共享区的大小，默认为内存的45%，该参数并非硬限制，会出现实际使用内存超出参数设置大小的情况。

### 1.2  write buffer

数据写入时会先写入 rocksdb 的 write buffer，每个 CF 使用不同的 write buffer，write buffer 的最大大小由 CF 相应的 write-buffer-size 参数控制，最大 write buffer数量由 max-write-buffer-number 参数控制，当等待 flush 的 write buffer 数量达到最大值时会触发 write stall 而停止写入。

### 1.3 raftstore

raftstore 包含2个 BatchSystem 用于实现 raft 消息的批量处理，RaftBatchSystem 用于接收、分发、落盘 raftlog，对应于 raftdb。ApplyBatchSystem 用于取出 raftlog 解析后应用于 kvdb，将最终数据落盘。对于每个 region 在 RaftBatchSystem 中有一个 mailbox 用于存储 raft 消息，之后由 raft_router 模块进行分发，当 raft log 完成commit 后会由 apply_router 将 commited raftlog 发送给 apply 线程，待 apply 的 raft 消息会放在 entry cache 内。

当 apply 速度慢时则会导致 entry cache 内条目堆积，cache 不断增长，当达到系统内存的 evict-cache-on-memory-ratio 比例(默认0.2)时则会 evtict entry cache，如果待 apply 的 log 没有在 cache 内则会从 ratdb 内读取 raftlog，这样会增加 apply 的延迟。

### 1.4 Coprocessor & gRPC

TiDB 会构建 coprocessor task 下发到 tikv,由 unified-pool 中线程完成( 5.0版本后)，每个 cop task 处理1个 region 的数据，之后将读取的数据或中间结果以gRPC response 形式放入内存，等待 gRPC 向 tidb 返回。如果 gRPC 的发送速度慢于 coprocessor 数据的产生速度会导致大量内存占用，gRPC 发送慢可能是gRPC 线程出现瓶颈或网络出现问题。

Tikv 内可通过 server.max-grpc-send-msg-len 参数控制发送的消息最大大小，server.grpc-memory-pool-quota 控制 gRPC 能够使用的内存大小，目前无限制，调低 gRPC 内存可能引起性能降低或其他问题。

### 1.5 transaction

sceduler 线程负责处理 tidb 的写请求，同时进行事务冲突检测，冲突检测通过一个叫 latch 的结构实现，每个 key 会根据 hash 值在 latch 内分配一个 slot，slot 包含 key 的 hashvlaue 和 command id。如果某个 slot 被占用则说明有事务冲突，等待的事务会加入到 waitlist。Latch 结构及相关的 context 会占用一部分内存，slot 的数量可通过 scheduler-concurrency 参数设置。

### 1.6 CDC

在 TiKV 侧有 cdc component 组件用于跟踪 tikv 的变化和向下游 ticdc 发送数据，可通过参数 cdc.old-value-cache-memory-quota 控制 old value 缓存的大小，cdc.sink-memory-quota 控制缓存在tikv中等待下发的 cdc change event 所占的内存大小。

### 1.7 BR

BR 备份时会读取 region 数据到 tikv 内存中然后由 sst writer 写出，若果存在 huge region 则可能会占用大量内存导致 oom。

### 1.8 tikv内存上限

memory-usage-high-water 参数控制 tikv 内存上限，默认为系统内存的 90%。

## 2 确认oom

   1、 检查 tikv 相关监控 ，如 uptime 、leader、memory 等是否出现掉零情况。

   2、 检查 tikv.log 中 Weclom 关键字。

   3、 检查操作系统日志是否出现 oom。

## 3 TiKV OOM排查

### 3.1 检查内存使用

监控：TiKV Detail -> Clusters -> Memory

### 3.2 检查block cache

监控：TiKV Detail -> RocksDB KV -> Block cache size

使用的大小和 block cache 参数，确认实际使用大小是否超过参数设置值，如果 block cache 超过参数设置大小则说明有大量的大查询。

​                         ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658125225166.png)

### 3.3 检查write buffer

检查大小和最大数量设置是否过大，是否出现因 memtable 导致的 write stall,如果 memtable 设置过大出现 write stall 时则占用大量内存。  

监控：TiKV Detail -> RocksDB KV -> Write Stall Reason  

write buffer 大量积压可检查是否存在磁盘问题导致flush速度较慢。   

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658125246632.png)

### 3.4 检查 coprocessor是否积压

  TiKV Detail -> Coprocessor Overview -> Total Response Size ，该监控表示 所有 tikv 上 coprocessor 向上层返回 response 的大小。

  Node_exporter -> Network -> Network IN/OUT Traffice -> Outbound指标，使用该监控检查每个 tikv 节点的出站流量。

  TiKV Detail -> Thread CPU -> gRPC poll CPU，检查 gRPC 线程是否繁忙。

   如果所有TiKV的出站流量之和比response速度小很多则说明 coprocessor 数据有积压。如果 gRPC CPU 线程存在瓶颈可考虑增加gRPC线程数。

  网络问题可通过 Node_expoter/Black_exporter 监控查看。   

​ ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658125300635.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658125315125.png)

### 3.5 检查 raft store内存占用

5.2 版本的 tikv 监控中增加了 Memory Trace 面板，可监控 raftstore 的相关内存使用。

监控：TiKV Detail -> Server -> Memory Trace   

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658125359738.png)

### 3.6 检查apply延迟和线程繁忙度

TiKV Detail -> Raft IO -> 99% Apply log duration per server。检查 apply 延迟，延迟较高检查 apply 线程是否瓶颈、检查磁盘 IO 性能。

TiKV Detail -> Thread CPU -> Async apply CPU 。检查 apply 线程是否存在瓶颈，如果是可考虑增加 apply 线程数。

TiKV Detail -> Cluster -> IO utilization 检查磁盘 IO 利用率，通过disk-performane/node_exporter 检查磁盘其他指标。

### 3.7 检查 CDC

检查 TikV 侧 CDC 模块中 oldvalue、sink 使用的内存参数设置和实际使用大小

监控：TiCDC -> TiKV -> CDC memory

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658125385658.png)

### 3.8 检查是否有Huge Region

监控：TiKV-Trouble-Shooting -> Huge Region

可通过 TIKV_REGION_STATUS 表或 pd-ctl region 查看top size region。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658125412555.png)


### 3.9 检查透明大页是否关闭

Hugepage 是 Linux 内存管理系统中的一种优化特性，它通过使用较大的内存页面来降低大内存服务器环境下的 TLB (Translation Lookaside Buffer )查询开销和内存占用。对于标准内存大页使用预分配的方式供应用使用，比如像 oracle 可以根据 SGA 大小配置使用的huge page数量，对于大多数应用程序来说很难手动管理，因此 Linux 推出了Transparent Huge Pages 为程序动态分配 huge page，但 THP 本身动态分配过程、内存碎片等问题也对应用程序带来了负面影响，TiDB 要求关闭THP功能，在使用tiup cluster check时会进行检查。可参考文档：https://pingcap.com/zh/blog/why-should-we-disable-thp

正在运行中的系统可通过/sys/kernel/mm/transparent_hugepage/enabled,/sys/kernel/mm/transparent_hugepage/defrag 文件内容检查是否启用了THP，如为never则表示已禁用。

建议通过grub.conf添加transparent_hugepage=never方式在内核禁用THP，相关可参考文档https://access.redhat.com/solutions/46111

### 3.10 检查numa设置

(1) 检查 numa node 数量和每个 Node 的内存大小： numactl -H

(2) 检查是否绑定 Numa_node(tiup cluster edit-config检查或部署目录scripts下的run_xxxx.sh脚本)，tikv相关内存参数设置是否超过numa node的内存大小

(3) TiDB内未绑定numa时检查默认策略： numactl --show，常见策略内存分配：

strict/default: 仅在进程运行的Numa node上分配内存

interleave: 在所有的numa node上交叉分配

preferred: 在进程运行的numa node上分配，不足时在去其他node分配。

### 3.11 检查是否设置资源限制

使用tiup cluster edit-config 检查是否设置 resource_control: memory_limit 限制了内存大小。

## 参考文档：

[TiKV 源码解析系列文章（十七）raftstore 概览](https://pingcap.com/zh/blog/tikv-source-code-reading-17)

[raft: cache raft log to avoid getting from rocksdb #1418](https://github.com/tikv/tikv/issues/1418)