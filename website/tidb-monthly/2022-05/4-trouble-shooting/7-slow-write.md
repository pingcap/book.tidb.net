---
title: TiDB 集群一次诡异的写入慢问题排查经历
hide_title: true
---

# TiDB 集群一次诡异的写入慢问题排查经历

> 作者：**[mydb](https://tidb.net/u/mydb/post/all)** 发表于  **2022-05-10**

# 1.背景

最近处理了一个 TiDB 集群写入慢的问题，虽然问题解决了，但是背后的一些疑问还是没彻底搞明白，本文算是对本次问题处理的一个总结，同时记录一下相关疑惑，如果有遇到类似问题的小伙伴，可以帮忙一起看下。

集群基本信息：TiDB 4.0.9 版本，9 个 TiKV 实例，3 个 TiDB Server，3 个 PD Server，集群开启了 Binlog 同步数据到跨机房 TiDB 集群，服务器磁盘是普通 SSD ，做的 RAID 10。

# 2.问题描述

2022 年 5 月 2 号 12:24 DBA 收到 TiDB 集群告警，紧接着，业务方反馈数据库写入变慢，消息有堆积。

# 3.问题分析

## 3.1基础分析

习惯性的看下集群 SQL 99 响应时间，升高非常明显

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652149197642.png)

查看 show processlist ，看到大量不同表的，各种各样的 insert 语句，执行很慢

分析慢日志，排名前 10 的慢 SQL 基本全是各类表的 insert 语句，没发现任何规律

集群未出现 Server is busy 异常

## 3.2热点分析

分析集群基础监控，发现有一台服务器的 CPU 资源使用很高，而且明显高于其它服务器。其它指标，比如内存、网卡流量、IO Util 等均正常。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652149210149.png)

到这里怀疑是热点导致的这台服务器 CPU 资源明显高于其它服务器，继续看下 raft store cpu 监控，判断是读热点还是写热点

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652149221643.png)

从上图 raft store cpu 监控看到，有2个tikv实例的raft store cpu 明显高于其它 tikv 实例，且这2台 tikv 实例在同一台服务器上，一个是 store 1 (192.168.1.1:20180)，一个是 store 2 (192.168.1.1:20181)

到这里我们初步判断集群写入慢是因为写入热点导致的，是哪个表导致的写入热点？业务是否有刷数？

(1)业务是否有刷数 

因为我们部署了 pump ，分析磁盘上产生的 binlog 量，相比前几天相同时间段并没有增加；QPS 没有增加；而且和业务确认没有刷数据；

(2)哪个表导致的写入热点

通过热力图没发现有热点现象。

通过以上分析得知，应该不是热点写入导致的集群写入慢。

## 3.3解决问题

在未找到原因的情况下，为了尽快解决集群写入慢的问题，再次使用了屡试不爽的 scheduler add evict-leader-scheduler 1 操作，将 192.168.1.1 服务器上的 2 个 TiKV 的 region leader 做驱逐。做完驱逐操作，十几分钟后，集群恢复正常，业务反馈消息无堆积。

```plain
scheduler add evict-leader-scheduler 命令很不错，几年来多次救集群于水火之中
```

## 3.4推测结论

虽然写入慢的问题解决了，但是为什么突然变慢这个问题一直困扰着我，然后反复看集群监控，集群日志，操作系统日志，硬件日志等信息，这里将分析结论记录在此，正确性仅供参考。下面主要列一些分析过程中的重点信息：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652149235904.png)

从上图看到，大概 12:30 ，store 1 (192.168.1.1:20180) 上的 region leader 发生了大量切换，导致 9000 个 leader 瞬间变为 0 了。

具体切换时间通过分析 PD 的日志得知是 12:30:03，日志如下，从 PD 日志中统计的 region 切换个数大概是 9000 个，和上图一致。

grep 'from=1' pd-2022-05-05T17-02-15.373.log | grep '2022/05/02 12:30:' | wc -l

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652149250419.png)

到这里，严重怀疑是 192.168.1.1 这台服务器或者这台服务器上的 TiKV 出现了什么问题，接下来重点分析这台服务器。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652149303841.png)

从上图磁盘监控看到，在 IOPS 降低的情况下，写入延时竟然增加了，平均达到1.48ms。事后对这块盘使用 fio 工具进行了测试，在 IOPS 达到 8K 的情况下，写入延迟不到 50 us，说明平时磁盘是 OK 的。

同时查看了出问题时间段其他 TiKV 服务器的磁盘 IO 写入延迟，平均都在 100us 以下。

根据以上提到的所有信息得出如下推理：

(1)192.168.1.1 服务器上 store 1 的 region leader 大量切换时间是 12:30:03，和监控图上 store 1 leader 数量变为 0 的时间吻合。

(2)监控图上 store 1 raft store cpu 开始升高的时间是 12:24，12:30 达到峰值 182.9%，这个时间和第(1)步中 store 1 大量 region leader 切换时间吻合。

从上面 2 个信息可以得出结论：因为 store 1 的 raft store cpu 已经达到瓶颈(raft store 默认 2 个线程，本案例峰值已经达到 182.9%)，导致 raft store 无法及时处理 region 心跳消息，进而导致的 store 1 region leader 大量切换。 

(3)store 1 部署在了 sdb 盘上，12:24 左右开始， sdb iops 从 1000 多降低到 100 左右，但是写入延迟确从 70us 以下升高到了1ms 以上，这个有点违反常理，为什么 iops 变少了，写入延迟反而升高了。sdb 写入延迟开始升高的时间和第(1)步中 store 1 raft store cpu 开始升高的时间是吻合的。难道磁盘写入慢影响了 raft store cpu ？磁盘为什么会写入突然变慢？这两个问题一直没搞明白。

```plain
说明：
(1)查看了出问题这段时间内服务器磁盘监控，操作系统日志，硬件日志，RAID 卡日志，并提供了 TSR 日志给戴尔厂家，均未发现异常
(2)使用 fio 工具对磁盘进行测试，iops 达到 8K 时写入延迟 50us 左右，说明平时磁盘正常
(3)当天集群稳定数个小时后之后，晚上 23 点，将驱逐操作取消后，让 store 1 接受读写，集群依然正常，截止目前未出现类似问题
以下内容来自官方文档：
(1)通常在有负载的情况下，如果 Raftstore 的 CPU 使用率达到了 85% 以上，即可视为达到繁忙状态且成为了瓶颈，同时 propose wait duration 可能会高达百毫秒级别。
(2)Raftstore 的 CPU 使用率是指单线程的情况。如果是多线程 Raftstore，可等比例放大使用率。由于 Raftstore 线程中有 I/O 操作，所以 CPU 使用率不可能达到 100%。
```

最后，理一下问题的整个过程： 从 12:24 开始，磁盘 iops 降低，磁盘写入延迟升高，同时伴随着 raft store cpu 升高，到 12:30 ，raft store cpu 达到峰值（出现瓶颈），导致 raft store 无法及时处理 reigon 心跳，最终导致了这个 tikv 上所有 region leader 的切换，切换后，raft store cpu 开始稍微下降(依然很高)，然后部分 region leader 又切回到这个 store 1 上，形成恶性循环，集群持续写入变慢。此时，DBA 执行了驱逐 store 1 和 2 上的 region leader 操作，随后，之前的恶性循环消失，集群也恢复正常。

这里对本文刚开始怀疑的热点问题再补充说明一下：

集群刚出现问题时，分析监控看到 store 1 的 raft store cpu 远远高于其他 store 的 cpu ，会让人觉得可能是热点问题，从而导致了这台服务器磁盘 IO 写入延迟增加，实际上通过分析磁盘监控，iops 并没有增加，反而减少了。一般情况下，当某个 TiKV 出现写入热点时，伴随着的是磁盘 iops 的升高，从这一点来说，也不符合写入热点的现象。

# 4.相关疑惑

问题虽然解决了，但是有两个疑问一直困扰着我，希望有遇到类似的小伙伴帮忙一起看下。

- 为什么磁盘 iops 突然降低，而写入延迟反而升高
- 监控中出现过 write stall，为什么日志中搜不到 Stalling 关键字 在 14:08 时，我执行过 scheduler remove evict-leader-scheduler ，将驱逐操作删除了，随后集群又出现写入慢的问题了，查看监控，在 14:24 集群出现过 write stall ，但是在 tikv 服务器相关日志中却搜不到 Stalling 关键字，很郁闷。

# 5.总结

本文对五一期间遇到的一起 TiDB 集群写入慢的诡异问题做了一个总结和回顾，并给出了解决方法，同时提出了两个一直没解决的疑问。

值得一提的是，scheduler add evict-leader-scheduler 真是一个很有用的命令，几年来，多次救集群于水火，屡试不爽。

由于本人水平有限，分析的内容难免错误，请多多包涵。

【参考文档】

[https://docs.pingcap.com/zh/tidb/v5.1/massive-regions-best-practices#raftstore-%E7%9A%84%E5%B7%A5%E4%BD%9C%E6%B5%81%E7%A8%8B](https://docs.pingcap.com/zh/tidb/v5.1/massive-regions-best-practices#raftstore-的工作流程)

https://asktug.com/t/topic/68072