---
title: 分布式数据库新秀TIDB初探 - TiDB 社区技术月刊
sidebar_label: 分布式数据库新秀TIDB初探
hide_title: true
description: 本文将分享初探TiDB的架构与性能分享。
keywords: [TiDB, 源码解读, 底层架构]
---

# 分布式数据库新秀TiDB初探

> 作者：[凌云Cloud](https://tidb.net/u/%E5%87%8C%E4%BA%91Cloud/answer)

随着社会数字化程度的加深，网络逐渐成为了社会的基础设施。随着互联网渗透程度的不断深入和互联网的进一步下沉，人们会在互联网上面 花费更多的时间，产生更多的数据。作为数据存储基石的DB面临着新的挑战和发展空间，由于数量的增长，之前的单机DB将面临越来越多的挑战，此时就出现数据库扩展的多种方案以满足海量数据的存储。目前主流的应对方案主要是分库分表，但是也存在着分布式事务，跨节点 join，扩容复杂等局限。

## 分布式数据TiDB简介

TiDB是一款同时支持在线事务处理和在线分析处理数据（Hybrid Transactional and Analytical Processing, HTAP）的关系性分布式数据库。在线事务处理，一般日常的事务处理数据库类型。在线分析处理，指由于数据分析的数据库类型，侧重于数据分析与决策，大多是基于MR模型的分布式存储系统或者是列式存储，例如clickhouse。

- **一键水平扩容或者缩容**

由于采用计算与存储分离，可针对不同场景对计算模块或者存储模块快速透明化扩容。

- **金融级高可用**

多副本存储，基于raft协议的事务日志

- **实时 HTAP**

通过基于两种不同的存储模型TIKV和列式存储TiFlash，同时支持OLTP和OLAP，通过raft协议保持两者数据的强一致性。

- **云原生的分布式数据库**

可以基于TIDB生态的 TI oprator，在私有云、公有云或者混合云实现工具化部署。

- **兼容 MySQL 5.7 协议和 MySQL 生态**

兼容大部分Mysql 5.7协议，用户可以在原有代码不做变更的基础上，在Mysql和TIDB之间实现透明化迁移。

## 架构

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1627297463608-fd6faedf-71a1-40a4-ab61-bbaeed104f64-1668044417406.png)

（图片来自Pingcap官网）

TIDB整个集群主要分为TIDB Server、PD Server、TIKV Server 、TIFlash（可选）

TIDB Server：这部分主要负责Sql 解析、优化，生成执行计划，此部分是无状态的。TIDB 还扮演着计算下推的角色，

同步对SQL的解析和分析，推断是适用TIKV还是TIFlash，将数据计算下推到数据存储层。例如要按照某一个字段的一段范围的内单位时间的度量，将会下推给TIflash引擎，利用列式存储提高查询性能。

PD Server:元信息模块。主要负责数据在TIKV的分布情况和集群的拓扑情况，协调数据数据迁移。

并负责生成分布式事务的唯一ID。

TIKV：TIKV是基于rocksdb二次开发的KV存储引擎。Region为最基本数据存储单元，在每一个region中按序存储一段数据，Region的迁移、合并、迁移受PDServer的调控。

TIFlash：列式存储引擎、记得之前是基于clickhouse开发的存储引擎。作为TIKV learner的角色提交数据。异步复制、一致性（读之前会校验与Leader的数据同步状态）。clickhouse特点，多线程并发查询，海量数据情况下并能比较优异，确定就是并发度不高。

## 分布式事务

TIDB的分布式事务是基于Google 的[Percolator](https://research.google.com/pubs/pub36726.html)二阶段提交算法实现的。从3.0开始默认实现是悲观事务,参考[TiDB 新特性漫谈：悲观事务](https://pingcap.com/blog-cn/pessimistic-transaction-the-new-features-of-tidb)。并且基于MVCC多版本控制实现了事务的并发控制，详细可以参考[TiKV 的 MVCC（Multi-Version Concurrency Control）机制](https://pingcap.com/blog-cn/mvcc-in-tikv)。

## Region存储模型

大数据量的KV存储目前有两种存储方案。

1. 基于Hash 的 Map存储方案，例如redis。
2. 基于LSM Tree的有序分块存储的方案，例如mongodb，rocksdb。

TIDB的KV实现 是基于第二种的实现，Region是数据在TIKV中的存储基本数据模型，为了方便数据在rocksdb的存储和迁移，tidb将数据以region为单位组织存储。在每一个region中数据均顺序组织（startKey，endKey），方便PD的调度迁移与写入。并且数据的复制与分发也已region为单位组织。

详细可以参考[TIDB存储-region](https://docs.pingcap.com/zh/tidb/stable/tidb-storage#region)

## 性能分析

下面是之前做的一份压测数据。

- 1 TIDBServer，3 TIKV，同城三机房部署。
- 并发10qps，同时查询数8SQL。
- 工具Jemter
- 数据量200-300G
- TIDB 4.x版本

机器性能暂时没有打满，可以看到响应时间基本在15ms左右

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1627308400875-deb51b7b-f14d-4427-bb08-7af176304de3-1668044488648.png)

除了这份数据和pingcap公布的官方tpc数据，还有其他部分公司DBA在自己测试环境做了压测。得出结论，在数据量达到一定程度下，与mysql性能相比差距不大，并且在某些场景会超过mysql的性能。当然刚刚发布的5.0版本性能又有了一定提升其他以官方公布的数据为准 [TiDB Sysbench 性能对比测试报告 - v5.1.0 对比 v5.0.2](https://docs.pingcap.com/zh/tidb/stable/benchmark-sysbench-v5.1.0-vs-v5.0.2)

## 使用现状

TIDB作为国内公司开发的分布式数据库新秀，受到国内许多互联网、金融、银行等行业公司的关注，并投入了一定的资源参与到了TIDB的生态建设。例如美团、伴鱼、bilibili等。

## 总结

随着数字化加深、数据量的暴增，分布式数据库是未来解决海量数据的唯一途径。同时随着云原生基础设施不断地完善，作为整条链路的最后一块单点土地-**数据库**，基于云设施的分布式方案前景看好。并且随着国内技术行业的升级，相信会有更多像TIDB这种自研的优秀的基础技术产品涌现。去探寻技术附加值更高的市场，打造数据我们自己的技术壁垒。支持国产！
