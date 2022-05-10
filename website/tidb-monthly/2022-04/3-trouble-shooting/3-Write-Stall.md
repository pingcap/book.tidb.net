---
title: 一次 TiDB 5.1 Write Stall 问题处理
hide_title: true
---

# 一次 TiDB 5.1 Write Stall 问题处理

**作者介绍：靳献旗，汽车之家 DBA**



## 1.背景

五一放假前，业务方告知要往 TiDB 集群刷 17 亿数据(业务端并发十个线程，以 replace 的方式往单张表中刷数据)，计划五一之后项目上线，这个集群上还有少量其它业务已经上线。为了避免刷数据时产生大量告警，我们临时将集群告警关闭了。

四月三十号早上七点多，业务方突然反馈接口超时，我们迅速介入解决了这个问题，本文对本次问题的现象、解决办法做个记录，希望对其他小伙伴有借鉴意义。



## 2.问题现象

- 业务端现象 业务接口读写超时。
- 数据库端现象 show processlist 显示大量读写阻塞，处于 autocommit 状态；TiDB 集群 Duration SQL 999 达到分钟级，QPS 掉底。



## 3.问题分析

因为提前知道业务方在大量刷数据，又通过 show processlist 看到大量读写阻塞，根据经验，怀疑集群出现了 write stall (如果开启告警的话，可以从告警信息中直接得知是否发生了 write stall)，于是顺着这个方向开始排查问题。

- 集群是否出现 Server is busy server is busy 的出现不一定是 write stall 导致的，但是，一旦集群发生 write stall，则必然会出现 server is busy。

监控位置：TiKV-Details ---> Errors ---> Server is busy

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651487126573.png)

从上图监控看到，确实出现了 server is busy，原因是 stall ，且显示除了具体 TiKV 实例。

- 是什么原因引起的 write stall 从上一步分析，我们得知集群出现了 write stall 导致 server is busy 进入了限流模式，究竟是什么原因引起的 write stall 呢？我们继续分析，从下面监控可以得知 write stall 的原因。

监控位置：TiKV-Details ---> RocksDB-kv ---> Write Stall Reason

![image (1).png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image (1)-1651487137979.png)

从上图监控看到，引起 write stall 的原因有两个：

一个是 L1 ~ Ln 层待 Compaction 的 SST 文件的大小过大

一个是 L0 层 SST 文件数量过多

```plain
说明：
这里对上图监控中的几个指标做一下简单解释
(1)pending_compaction_bytes_slowdown：L1 ~ Ln 层待 Compaction 的 SST 文件大小达到阀值后集群会减慢写入速度
(2)pending_compaction_bytes_stop：L1 ~ Ln 层待 Compaction 的 SST 文件大小达到阀值后集群会 stall 住新的写入
(3)level0_file_limit_slowdown：L0 层待 Compaction 的 SST 文件个数达到阀值之后集群会减慢写入
说明：
TiDB 4.0 版本 Write Stall Reason 的监控位置和 5.1 不同： TiKV-Details ---> RocksDB-raft ---> Write Stall Reason
```

- 是否有大量数据处于 compaction pending 状态 其实从以上两步已经分析出来了 write stall 的原因，这里我们辅助验证下，看下处于 compaction pending 状态的数据量。

监控位置：TiKV-Details ---> RocksDB-kv ---> Compaction pending bytes

![image (2).png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image (2)-1651487150016.png)

从上图监控看到，处于 compaction pending 状态的数据量高达 1.1 T，非常高。

```plain
说明：
TiDB 4.0 版本 Compaction pending bytes 的监控位置和 5.1 不同： TiKV-Details ---> RocksDB-raft ---> Compaction pending bytes
```

- 分析 TiKV 日志 这一步也是为了辅助分析。

从本节第一步监控图中我们可以得知是哪个 tikv 实例发生了 stall，如果有多个 tikv 发生 stall，我们可以选择其中一个实例查看日志。

```plain
截取的部分日志内容如下
[root@p-xx-xx-xx data]#grep 'Stalling writes' /data3/tikv20173/data/rocksdb.info
[2022/04/30 07:16:11.145 +08:00][2][WARN] [db/column_family.cc:805] [default] Stalling writes because we have 23 level-0 files rate 5368709120
[2022/04/30 07:43:27.837 +08:00][2][WARN] [db/column_family.cc:830] [default] Stalling writes because of estimated pending compaction bytes 206825160726 rate 4294967296
```

简单解释下这两段日志： 当前 L0 层已经有 23 个 SST 文件，阀值是 20，因此集群减缓写入。

当前处于 pending compaction 的数据量达到了 192.62G (206825160726/1024/1024/1024)，阀值是 192G，因此集群减缓写入。

```plain
特别说明：
TiDB 4.0 write stall 日志文件名和位置
/data3/tikv20173/data/raft/LOG
TiDB 5.1 write stall 日志文件名和位置
/data3/tikv20173/data/rocksdb.info
如果不注意可能会被带偏。
```

- 分析磁盘 IO 通过以上几步，我们已经确认了是 write stall 导致的问题，那么究竟是 TiKV 并发刷盘参数太小导致的还是磁盘 IO 性能跟不上导致的呢？接下来我们看下磁盘 IO 的监控进一步判断。

监控位置：Overview ---> System Info ---> IO Util

![image (3).png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image (3)-1651487160906.png)

从上图监控看到，个别 TiKV 服务器的磁盘 IO 已经达到 100%。

到这里，我们已经分析出结论：业务接口超时是因为读写请求阻塞在了 TiDB ，而 TiDB 由于大量刷数据，磁盘 IO 性能跟不上，导致了 TiKV 数据刷盘(L0 往 L1)不及时和各层之间(L1 ~ Ln)待 compaction 的数据量太多，达到了限流阀值，最终导致了 write stall 问题。



## 4.问题解决

解决问题的过程很简单，让业务方暂停刷数，暂停之后十几分钟集群恢复了正常。

之后，业务将之前的并发十个线程调整为三个线程，观察集群及磁盘 IO 情况，后续增加到了五个线程，集群稳定，数据顺利跑完。

有些时候，当集群发生 write stall 时，我们无法通过通知业务方停止刷数据的方法解决，那么是否有一些应急方案可以缓解 write stall 问题呢？答案是肯定的，详细的应急文档请见专栏里我的另外一篇文章【TiDB 5.1 Write Stalls 应急文档】，里面有 write stall 发生的场景，阀值，缓解方法，详细命令。



## 5.总结

本文从一次解决 write stall 的问题出发，回顾了问题现象、分析过程、如何解决的整个处理流程，同时标记了在 TiDB 4.0 版本中需要注意的地方，比如 write stall 日志文件名、位置、监控在 4.0 和 5.1 版本中完全不同，避免带偏方向。希望对其他小伙伴有借鉴意义。