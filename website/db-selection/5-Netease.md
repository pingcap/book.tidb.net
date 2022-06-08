---
title: 五、网易互娱的数据库选型和 TiDB 应用实践
hide_title: true
---

# 网易互娱的数据库选型和 TiDB 应用实践

> 作者：李文杰，网易互娱计费组，高级数据库管理工程师，TUG Ambassador
> 
> 文章首发于 2019 年 10 月

## 一、业务架构简介

计费组是为网易互娱产品提供统一登录和支付高效解决方案的公共支持部门，对内是互娱的各个游戏工作室，对外是国内外数百个渠道。由于业务场景的特殊性，我们为各个游戏产品部署了不同的应用服务，其中大产品环境独立，小产品集中部署。

随着部门业务量的激增，单机 MySQL 在容量、性能、扩展性等方面都遇到了瓶颈，我们开始对其他数据库产品进行调研选型。本文将详细介绍网易互娱计费组针对自己场景的数据库选型对比方案，以及使用 TiDB 后解决的问题，并分享使用 TiDB 过程中集群管理、监控和数据迁移等方面的最佳实践，以供大家参考和交流。

## 二、MySQL 使用架构

网易互娱计费组线上 MySQL 的基本使用架构，如下图所示，其中箭头方向表示数据或请求的指向：

![img](/img/db-selection/5-image1.jpg)

* 线上应用 Application 通过 Keepalive + 多机部署，流量经过负载均衡，可以有效保障应用服务的高可用；
* 数据库层架构是 Keepalive + 主从结构，利用半同步复制特性可以有效解决延迟和数据一致性的问题；
* Application 通过 VIP 访问后端数据库，在数据库主节点宕机后通过 VIP 漂移到从节
* 点，保证服务正常对外提供；
* 通过 Slave 节点进行数据备份和线上数据采集，经过全量和增量同步方式导出数据到数据中心，然后进行在线和离线计算任务；
* 类似这样的架构组合线上大概有 50+ 套，涉及服务器 200~400 台，日均新增数据 TB 级。

## 三、MySQL 使用的现状与问题

随着业务的发展，部门内各应用服务产生的数据量也在快速增长。业务落地数据量不断激增，导致单机 MySQL 不可避免地会出现性能瓶颈。 主要体现在以下几个方面：

* 容量
 * 单机 MySQL 实例存储空间有限，想要维持现有架构就得删除和轮转旧数据，达到释放空间的目的；
 * 网易互娱某些场景单表容量达到 700GB 以上，订单数据需永久保存，同时也需要保持在线实时查询，按照之前的存储设计会出现明显的瓶颈。
* 性能：最大单表 15 亿行，行数过大，导致读写性能受到影响。
* 扩展性：MySQL 无法在线灵活扩展，无法解决存储瓶颈。
* SQL 复杂
 * 大表轮转后出现多个分表，联合查询时需要 join 多个分表，SQL 非常复杂并难以维护；
 * 单机 MySQL 缺乏大规模数据分析的能力。
* 数据壁垒
 * 不同产品的数据库独立部署；
 * 数据不互通，导致数据相互隔离，形成数据壁垒；
 * 当进行跨产品计算时，需要维护多个异构数据源，访问方式复杂。数据分散在不同的数据孤岛上会增加数据分析难度，不利于共性价值的挖掘。如下图：

![img](/img/db-selection/5-image2.jpg)

## 四、数据库选型

### 1、调研目标

针对目前存储架构存在的问题，有需要使用其他存储方案的可能。考虑到目前的业务与 MySQL 高度耦合，对数据库选型的主要要求有：

* 必须兼容 MySQL 协议；
* 支持事务，保证任务以事务为维度来执行或遇错回滚；
* 支持索引，尤其是二级索引；
* 扩展性，支持灵活在线扩展能力，包括性能扩展和容量扩展。

其他要求：

* 稳定性和可靠性；
* 备份和恢复；
* 容灾等。

### 2、可选方案

![img](/img/db-selection/5-image3.jpg)

### 3、测试

#### 3.1 基于 MySQL 的解决方案
一开始仍然是倾向使用基于 MySQL 的解决方案，比如 MySQL InnoDB Cluster 或 MySQL + 中间件的方案。

我们测试了 MySQL 集群 5.7.25 版本对比 8.0.12 版本，在 128 并发写各 1000 万行的 10 个表，比较单节点、3 节点和 5 节点下的情况，如下图所示：

![img](/img/db-selection/5-image4.jpg)

在测试中发现，使用 MySQL InnoDB 集群的方案写性能比单机 MySQL 差约 30%，其他的读写测试结果也不甚满意。之后陆续测试 MySQL InnoDB Cluster 或 MySQL + 中间件的方案，不是测试结果性能不达要求，就是需要修改大量代码。

因此我们得出了基于 MySQL InnoDB Cluster 或 MySQL + 中间件的方案的不满足我们的业务场景的结论。总结来说，我们不使用 MySQL 分库分表、中间件或 MySQL 集群，原因主要是以下两点：

* 方案过于复杂
* 需要改业务代码

仔细分析来看，基于 MySQL InnoDB Cluster 或 MySQL + 中间件的方案，本质上是 MySQL 主从结构的延伸，并非真正的分布式拓展，像是以打“补丁”的方式来实现横向扩展，很多功能特性自然也难以让人满意。

#### 3.2 CockroachDB VS TiDB

在开源的分布式 NewSQL 领域，知名的有 TiDB 和 CockroachDB（简称 CRDB），二者都是基于 Google Spanner 论文的开源实现。我们对这两种数据库的功能和性能做了大量的调研和测试。

* TiDB 天然兼容 MySQL 协议，而 CRDB 兼容 PostgreSQL ；
* 如果业务以 MySQL 为主，那 TiDB 可能是比较好的选择；如果是 PostgreSQL，那 CRDB 可能是优先的选择。

测试方面，我们也进行了全面地对比和测试。这里说其中一个测试案例：10 台机器 5 存储节点，160 并发访问单表 2 亿行，我们于 2018 年 7 月，对 CRDB-v2.1.0 版本和 TiDB-v2.0.5 版本进行了读写测试（CRDB 和 TiDB 集群均使用默认配置，未进行调优）。

集群拓扑

![img](/img/db-selection/5-image5.jpg)

![img](/img/db-selection/5-image6.jpg)

测试语句

* 范围查询：

```
SELECT c FROM sbtest%u WHERE id BETWEEN ? AND ? SELECT SUM(k) FROM sbtest%u WHERE id BETWEEN ? AND ? SELECT c FROM sbtest WHERE id BETWEEN ? AND ? ORDER BY c SELECT DISTINCT c FROM sbtest%u WHERE id BETWEEN ? AND ? ORDER BY c
```
* 随机 IN 查询：

```
SELECT id, k, c, pad FROM sbtest1 WHERE k IN (?)
```

* 随机范围查询：

```
SELECT count(k) FROM sbtest1 WHERE k BETWEEN ? AND ? OR k BETWEEN ? AND ?
```

* 更新索引列：

```
UPDATE sbtest%u SET k=k+1 WHERE id=?
```

* 更新非索引列：

```
UPDATE sbtest%u SET c=? WHERE id=?
```

* 读写混合：范围查询 + 更删改混合

其中一个重要的测试结果如下：

![img](/img/db-selection/5-image7.jpg)

结论

1. CRDB 和 TiDB 在性能表现上不相上下（注：上面是 2018 年 7 月的基于 TiDB 2.0.5 版本的测试结果）；
1. CRDB 兼容 PostgreSQL，如果需要迁移则需要转协议，需 MySQL → PostgreSQL → CRDB。迁移过程复杂，成本高；
1. TiDB 兼容 MySQL，代码修改量不多，迁移成本低。

## 五、最终选型

综合对比结果如下表，经过谨慎地考量，我们选择了 TiDB。

![img](/img/db-selection/5-image8.jpg)

## 六、TiDB 在网易互娱计费组的使用

### 1、TiDB 使用架构

网易互娱使用 TiDB 的架构设计如下：

![img](/img/db-selection/5-image9.jpg)

* 整个集群分为 TiDB、TiKV 和 PD 3 个模块分层部署；
* 使用 Nginx 作为前端负载均衡。

### 2、TiDB 解决了哪些需求

![img](/img/db-selection/5-image10.jpg)

### 3、TiDB 使用现状

* 业务
 * TiDB 作为线上 MySQL 数据镜像，负责线上数据的收集和集中管理，形成数据湖泊；
 * 应用于数据平台服务，包括了报表、监控、运营、用户画像、大数据计算等场景；
 * HTAP：OLTP + OLAP。
* 集群
 * 测试集群：v2.1.15，用于功能测试、特性尝鲜；
 * 线上集群：v2.1.15，80% 离线大数据计算任务 + 20% 线上业务。
* 规模
 * 41 台服务器，88 个实例节点，38 个 Syncer 实时同步流（将升级为 DM）；
 * 存储：20TB/总 50TB，230 万个 Region；
 * QPS 均值 4k/s，高峰期万级 QPS，读写比约 1:5；
 * 延迟时间：80% 在 8ms 以内，95% 在 125ms 以下，99.9% 在 500ms 以下。

## 七、总结与展望

TiDB 兼容 MySQL 协议，支持 TP/AP 事务且扩展性好，能很好地解决网易互娱计费组业务大容量、高可用等问题。 

根据网易互娱计费组已有的使用情况，我们计划继续加大、加深 TiDB 的使用场景，丰富业务类型和使用规模，期待 TiDB 给我们的业务带来更多便利。
