---
title: 如何构建企业内的 TiDB 自运维体系｜得物技术 - TiDB 社区技术月刊
sidebar_label: 如何构建企业内的 TiDB 自运维体系｜得物技术
hide_title: true
description: 本文基于得物内部的实践情况，会从选型策略、运维手段、运营方式、核心场景实践等几个方向讲述TiDB 在得物实践落地过程。
keywords: [TiDB, 数据仓库, TiCDC, 存储服务]
---

# 如何构建企业内的 TiDB 自运维体系｜得物技术

## 前言

得物 App 从创立之初，关系型数据库一直使用的开源数据库产品 MySQL。和绝大部分互联网公司一样，随着业务高速增长、数据量逐步增多，单实例、单库、单表出现性能瓶颈和存储瓶颈。从选型和架构设计角度来看这很符合发展规律，一开始没必要引入过于复杂的架构导致资源成本和开发成本过高，而是逐步随着业务发展速度去迭代架构。为了应对这些问题，我们采取了诸多措施如单库按业务逻辑拆分成多个库的垂直拆分，分库分表的水平拆分、一主多从读写分离等。这些技改同时也使得整个业务层架构更加复杂，且无法做到透明的弹性，因此我们逐步把目光转向了已经趋于成熟的分布式关系型数据库 TiDB。

自 2020 年初开始使用 TiDB，随着运维体系的逐步完善，产品自身能力的逐步提升，接入业务已经涉及得物的多个 业务线，其中个别为关键业务场景。业界关于 TiDB 的功能剖析、场景落地、平台化建设都有很多优秀的文章。本文基于得物内部的实践情况，会从选型策略、运维手段、运营方式、核心场景实践等几个方向讲述TiDB 在得物实践落地过程。

## TiDB 架构

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(8\)-1672726827267.png)

上图是我们目前的接入方式和整体架构。TiDB 的部署架构这里就不做赘述了，需要了解的同学可以参考官方文档。我们之所以采用 SLB 来做 TiDB 的负载均衡接入，就是为了简化接入成本与运维成本，访问流量的负载均衡以及节点扩缩容可以通过调整 SLB 解决。当然如果能够实现 SDK 负载均衡与故障剔除，结合配置中心的流量调度也是非常好的解决方案。得物 TiDB 部署均采用单机单实例部署，TiDB Server、PD 采用无本地 SSD 机型，TiKV 采用本地 SSD 机型。既兼顾了性能，又能降低成本。详细的机型选择会在后面的内容提到。

## MySQL 与 TiDB 的对比

圈内一直流传着一句话，没有一种数据库是"银弹"。绝大部分用户选择 TiDB 就是为了弥补 MySQL 的不足，所以选型阶段对两者做些比较也是在所难免的。本文基于我们内部的现状和场景对两个产品我们关注的点进行了简要对比。对比的目的不是为了去印证那个数据库产品能力更强。而是想通过对比来帮助团队在合适的场景选择合适的产品。

### 扩展性

- MySQL

MySQL 就自身扩展能力而言主要是来自于垂直扩容，但是这个会受限于机器的规格上限。水平扩容涉及业务改造和使用成本提升。改造为分库分表，对研发来说是一个费力度很高的方案。需要引入 Sharding 逻辑，改造完成后需要业务 SQL 必须带 Sharding Key 才能执行或者高效执行。所以并不是说做不到可扩展。

- TiDB

由于 TiDB 是计算存储分离的架构，且有状态的存储层 TiKV 是分布式存储。所以单从上面定义的扩展性来说，确实对比 MySQL 有很大优势。集群处理能力和存储能力，可以通过扩容 TiDB Server、TiKV 简单实现。这里需要注意的是，TiKV 属于有状态服务，扩容会涉及到数据的 Reblance，过程中 TiKV(region 迁移) 和 PD(调度) 产生大量交互，为避免影响业务，扩缩容过程中需要关注集群情况，根据需求适当调整迁移力度。

### 性能

- MySQL

关于 RT。MySQL 由于是单机数据库，所以对于点查或简单查询的 RT、热点更新的 RT 与 TPS ，相比分布式数据库有天然优势。数据获取链路短(单机数据库本地调用，分布式数据库涉及存算分离)，且不用考虑分布式事务的冲突检测。所以总体的访问 RT 要低于 TiDB，具体数据这边就不罗列了，社区有不少性能压测的帖子。

关于聚合查询。互联网公司在 C 端基本不存在此类问题，也是不允许的。所以主要是场景在 B 端。解决方法一般是分为几种：1.提供专门的只读实例给 B 端提供查询能力；2.异构数据来解决（MySQL+ES、ADB 等等）。

关于优化器。MySQL 多年的积累，在优化器的稳定性虽然不如商用数据库那么可靠，偶尔也有走错索引的情况。一般只能通过修改 SQL、修改索引来解决，切记别用 force index 这种有坑的解决方案。但是总体来说我们遇到的 MySQL 走错索引的情况要远低于 TiDB。

- TiDB

关于 RT。分布式数据库解决的更多是吞吐量和容量上的需求，比如点查或简单查询的 RT 无法像单机数据库那么短，但是可以通过节点扩容的方式提升 QPS 吞吐量。热点数据这里就不展开讲了，它本身也不是分布式数据库能解决的范畴。如果你的业务场景是一个对 RT 要求很高的场景，那么优先使用 MySQL。如果是高吞吐量需求优先，可以尝试使用 TiDB。

关于聚合查询。由于 TiDB 的存储节点 TiKV 不只是具备存储能力，TiKV 实现了coprocessor 框架来支持分布式计算的能力。所以理论上通过加机器就能扩展计算能力，从我们实际使用的场景来看也是如此，这部分的能力就要优于 MySQL。具体的效果在本文最后的章节会有体现。

关于优化器。这个是大家对 TiDB 一直以来吐槽的点之一，有时候统计信息健康度 90 以上的情况下，还是会走错索引，当然这里有一部分原因可能是条件过多和索引过多导致的。为了解决问题，核心服务上线的 SQL 就必须一一 Review。如果无法正确使用索引的就使用 SPM 绑定，虽然能解决，但是使用成本还是略高。希望官方继续加油。

### 资源成本

- MySQL

如果是一个数据量小且查询模型比较简单的需求(比如：1-2TB，简单查询为主)，那么肯定是 MySQL 成本较低。以我们 TiDB 基础配置为例，相比 MySQL 成本高出 27%(该成本是用高可用的 MySQL 对标3 TiDB、3 TiKV、3 PD 的 TiDB)。所以得物内部选型，单从资源成本角度考虑，还是首选 MySQL。

- TiDB

如果是一个数据量较大且持续增长或查询模型比较复杂的需求(比如：3-5 TB 以上，多条件查询、聚合查询等)。一般该类型的业务都采用分库分表的解决方案。以得物一个分库分表的集群(10个写实例、10个读实例)为例，替换为 TiDB(6 TiDB、12 TiKV、3 PD)，成本相比 MySQL 成本节省 58%。此例子只作为得物一个业务场景的替换结果，不代表所有场景。为了验证这个结论，本文后面的内容会讲到这个核心场景的实践。

### 运维成本

- MySQL

MySQL 作为被使用最多的开源关系型数据库，从社区活跃度、产品成熟度、周边生态工具、解决方案积累等方面来看都是非常优先的产品。主从架构的 MySQL 维护成本极低，当主库异常或无法修复时，我们只需要切换即可。

另外得益于优秀的社区生态，运维工具、数据库接入组件、数据同步组件都有非常多的成熟工具，稍加改造就可以实现本地化适配。

- TiDB

分布式的架构的设计没有像 MySQL 这样的主从，每个存储节点都是提供读写。当一个节点出问题的时候，会影响整个集群的访问。无法实现 MySQL 这样通过主从切换实现快速的故障隔离。

- TiDB 由 3 个角色组成，当出现问题的时候无法快速定位问题(当然也是我们个人能力需要提升的点)，比如当某个时间点的查询超过预期的时候，需要排查执行计划、各个节点的负载情况、各节点的网络情况。虽然提供了完善的监控，但是指标与节点过多需要一一排查才能有结论。不像 MySQL 出现查询超预期的问题，基本上通过几个核心指标就能判断出根因

### 结构变更(DDL)

- MySQL

这里以我们主要使用的 MySQL 5.7 为例，较大数据量的情况下 DDL 成本较高，为了规避锁表和主从延迟的问题，一般都是用工具去执行。我们通常使用的两个知名开源无锁 DDL 工具：Percona 开源的 pt-osc、Github 开源的 gh-ost。目前我们和大部分公司一样都在通过定制化开发的 gh-ost 来变更。但是用工具只是解决了前面提到的锁表和主从延迟问题，随着数据量规模上升，变更时长也逐步上升。另外工具的 Bug 也会带来数据丢失的风险。当然 MySQL 8.0 的特性 Instant Add Column 推出以后解决了加列的痛点，但是也只解决了一部分。

- TiDB

TiDB 的 DDL 通过实现 Google F1 的在线异步 schema 变更算法，来完成在分布式场景下的无锁，在线 schema 变更。DDL 变更中除过 add index 以外其他都不需要做数据回填，修改完元信息即可，所以可以立即完成。而 add index 会做两件事情：1.修改 table 的元信息，把 indexInfo加入到 table 的元信息中去；2.把 table 中已有了的数据行，把 index columns的值全部回填到 index record中去。变更速度取决于表中的数据和系统负载。所以 TiDB 在 DDL 操作上解决了很多 MySQL 上的痛点，但是与 MySQL 相比，TiDB 的 DDL 还是有些不一样的地方的，也带来了一些限制：

1. 不能在单条 ALTER TABLE 语句中完成多个操作。MySQL 下会把多个同一张表的 DDL 进行合并，然后使用 gh-ost 或者 pt-osc 工具一次性执行。TiDB 里只能一个个单独去执行；(6.2 已经支持了ALTER TABLE语句增删改多个列或索引)

2. 不支持不同类型的索引 (HASH|BTREE|RTREE|FULLTEXT)；

3. 不支持添加 / 删除主键，除非开启了 alter-primary-key 配置项；

4. 不支持将字段类型修改为其超集，例如不支持从 INTEGER 修改为 VARCHAR，或者从 TIMESTAMP 修改为 DATETIME，否则可能输出的错误信息 Unsupported modify column

5. 更改 / 修改数据类型时，尚未支持“有损更改”，例如不支持从 BIGINT 更改为 INT;

6. 更改 / 修改 DECIMAL 类型时，不支持更改精度 ;

7. 更改 / 修改整数列时，不允许更改 UNSIGNED 属性 ;

这里大部分限制可以在结构设计阶段和后期规范来规避掉，比如一个表的多个 DDL 操作无法合并的问题，可以通过自动化手段降低复杂度；BIGINT 更改为 INT 这种长改短的就是日常变更规范中要管控的。

### 产品流行度

- MySQL

如果我们从 MySQL 1.0 开始算起至今已经有 26 年了。这期间几经周转，最终归到了 Oracle 旗下。版本也从 1.0 来到了 8.0。作为一个久经锤炼的数据，特别是作为互联网盛行时期依赖的主流数据库，不论是产品成熟度和社区活跃度都得到了极大的促进。MySQL 在 DB-Engines 的开源数据库中排名久居第一。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(9\)-1672727470969.png)

图片数据来源 DB-engines 官网

- TiDB

TiDB 从 2015 年创立并开源至今已经 7 年，作为一个复杂的基础软件来说确实还比较年轻。依赖早期的 3 个创始人互联网背景出身，深知大家在关系型数据库上的痛点。所以 TiDB 推出后获得了不少用户的推崇，特别是互联网行业。社区在 TiDB 的发展中也起到了至关重要的作用，从打磨产品、需求提炼、落地场景总结等。目前 TiDB 在 DB-Engines 排名为 98，进一步证明了基础软件的难度以及作为一款国产数据库在国际化进程中还有很大的空间。从墨天轮中国数据库排行的情况，可以看到 TiDB 长期以来保持第一的位置。在 12 月跌落榜首，由 OceanBase 取代。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/111-1672727523299.png)

图片数据来源 墨天轮

## TiDB 在得物的运维体系落地及探索

#### 4.1 选型

关于数据库选型，我们一向非常谨慎，会根据具体的业务情况来推荐合适的数据库。要避免陷入“**手拿铁锤的人,看什么都像钉子**”的误区。不是为了使用 TiDB 而使用，要去解决一些 MySQL 无法满足或者改造成本比较高的场景。关系型数据库我们还是优先推荐MySQL。能用分库分表能解决的问题尽量选择 MySQL。毕竟运维成本相对较低、数据库版本更加稳定、单点查询速度更快、单机QPS性能更高这些特性是分布式数据库无法满足的。以下是我们总结的关于选型的两个大方向。

**适合接入的场景：**

- 分库分表场景:上游 MySQL 分库分表，业务查询时无法使用到分片
- 磁盘使用大场景: CPU 和内存使用率低但磁盘容量达到 MySQL 瓶颈
- 分析 SQL 多场景:业务逻辑比较复杂，存在并发查询+分析查询
- 数据归档场景:数据冷热分离、定期归档、数据重要，不能丢失
- 日志流水场景:日志流水业务、单表较大、写入平稳、查询不多

**不适合接入的场景：**

- 数据抽取场景:下游存在大数据或者其他业务部门进行数据抽取
- 读写分离的场景: TIDB 没有主从的概念，无法进行读写分离
- 指定点恢复场景:指定时间点级别恢复，需要恢复到某个时间点
- 数据热点场景:高并发单行更新、热点小表、热点库存

#### 4.2 运维标准化

- **业务接入**

场景：当业务选型考虑TiDB时，我们会根据业务的使用场景和业务特点综合评估是否适合TiDB(优先 推荐使用MySQL)。

配置：评估业务成本压力和未来一年数据量、TPS，选择合适的TiDB集群配置。

使用：给使用方提供 MySQL 和 TiDB 的差异及其规范，避免增加开发周期和成本。

- **资源规格**

根据不同业务场景，我们定义了不同的服务器配置。由于借助云上的资源交付能力和隔离能力， 我们无需像 IDC 那样，在高规格机器上采用多实例部署。这样避免了混部带来两个问题：1.多个实例之间的资源争夺；2.高规则机器部署密度与稳定性的权衡。

|              |    |                                               |
| ------------ | -- | --------------------------------------------- |
| 节点           | 数量 | 配置                                            |
| TIDB         | 3  | 基础规格：8C32G200GB(云盘)高配规格：16C64G200GB(云盘)       |
| PD           | 3  | 基础规格：8C16G200GB(云盘)高配规格：16C64G200G(云盘)        |
| Monitor      | 1  | 4C16G200GB(云盘)                                |
| TIKV/TIFLASH | 3  | 基础规格：8C32G1788G(本地SSD)高配规格：16C64G1788G(本地SSD) |

- **数据库备份**

备份工具：BR\[官方物理备份工具]

备份策略：凌晨低峰期进行数据全量备份

备份保留周期：7天

1. 在线业务

对于在线业务，除了常规的BR备份外会额外调整 tikv_gc_life_time 时间为 1-3 天，当业务出现误操作时可以恢复三天内任意时间的数据。

2. 离线业务

TiDB集群离线业务大部分是从上游RDS同步到TiDB的场景。上游RDS会有一份最近的数据，所以对于离线业务只有常规的BR备份。

#### 4.3 稳定性治理

- **变更管理**

1. 面向 DBA 的流程管控

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/22222-1672727777258.png)

上图的流程主要是用于管控非白屏化的 TiDB 基础设施变更。通过变更文档整理、运维小组 Review 的机制，确保复杂变更的规范化。

2. 面向研发变更的系统管控

DML\DDL 变更工单风险自动化识别

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(11\)-1672727888743.png)

**语法检查：**

1. DDL 与 DML 类型判断，确保每次执行的内容是同一个类型
2. SQL 语法检查，确保提交的 SQL 语法是正确的

**合规检查：**

变更合规性检查，确保提交的 SQL 是可以按照 DBA 定义的规范设计(可以使用的字段类型、字段命名、索引命名、索引数量，字段长度由长修改短等限制)，简单说就是要么允许，要么不允许

**风险识别：**

1. 该项的作用是将允许执行的进行风险识别，研发可以根据风险等级选择执行时间，DBA 也能在审批阶段判断是否合理，并修改执行时间。
2. 相关风险定义

|      |                      |                         |
| ---- | -------------------- | ----------------------- |
| 变更类型 | 变更项                  | 风险提示                    |
| DDL  | Create table         | 低                       |
|      | Add index            | 测试环境(低)生产环境(表大小，低/中/高)  |
|      | Add column           | 低                       |
|      | Modify column 类型有限修改 | 高                       |
|      | Modify column 长度 变长  | 低                       |
|      | Drop index           | 测试环境(低)生产环境(高)          |
|      | Truncate table       | 测试环境(低)生产环境(高)          |
| DML  | update/delete        | 测试环境(低)生产环境(修改数量，低/中/高) |
|      | insert               | 低                       |

下图是基于以上提到的能力，实现的 TiDB 变更管控功能。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(12\)-1672727961140.png)

- **稳定性巡检**

数据库巡检手段是相当于告警比较前置的一个动作，巡检阈值相比告警较低，目的是为了提前发现问题并跟进解决。收益是：1.降低告警数量；2.避免小问题逐步积累导致大问题。我们的做法是按照自定义的评分规则，双日晨会对焦，对有风险的服务进行问题跟进。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(13\)-1672728014716.png)

巡检指标的数据采集来自于监控系统，我们会统计相关指标的峰值。每天记录一个点，展示近 30 天内的指标值。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(14\)-1672728038309.png)

某集群的巡检情况

- **慢查治理**

虽然 TiDB 自带的 Dashboard 可以提供慢查的白屏化，但是这需要提供账号密码给研发，5.0 之前的版本还必须使用 root 账号登录，另外就是我们希望慢查治理可以结合内部系统进行管理。所以对于这部分做了些自研工作，将日志采集并加工后存入 ES。DBA 平台可以通过报表等手段进行推进治理。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(15\)-1672728078461.png)

下面两张图就是我们内部的平台对慢查治理的闭环管理方案。DBA 或者研发 TL 在平台指派 SQL，处理人就会收到治理消息，处理完成后可以在后台进行状态变更。然后基于这些数据可以做报表优化治理效果。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(16\)-1672728093834.png)

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(17\)-1672728110377.png)

- **告警管理**

基于 TiDB 官方的监控方案，我们在告警部分做了些定制化，Prometheus 中配置的 rule 触发后会把告警信息推送至我们自己的数据库管理平台 OneDBA，由平台处理后进行发送。平台的告警管理模块的实现类似于 Alertmanager，不同的我们新增了自定义的需求，比如元信息关联、支持集群指标级别的阈值定义、告警沉默、告警降噪、告警治理闭环(有告警通知和认领，确保及时跟进处理)。另外这里的 Prometheus 主要功能是做数据采集与告警，数据存储与趋势图查看在公司统一监控平台，降低不必要的存储资源投入。由于我们管理的数据库类型比较多，所以在告警方案上做了收敛。这里讲到的方案就是得物数据库团队目前针对负责的所有数据库的管理方案。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(18\)-1672728148273.png)

阈值管理

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(19\)-1672728166617.png)

- **故障演练**

故障演练的目的是为了巩固目前的系统高可用。我们针对 TiDB 制定了一套故意演练流程，包含了 8 个场景。

【演练场景1】TiKV Server 1 个节点宕机

【演练场景2】TiDB Server 1 个节点宕机

【演练场景3】PD Server  1 个节点宕机

【演练场景4】PD Server 节点重启

【演练场景5】TiKV Server 节点重启

【演练场景6】应用高并发写入，CPU、IO告警是否及时发送

【演练场景7】PD Server Leader、follow节点重启

【演练场景8】TiDB 集群 宕机一个TiDB Server节点

以上的场景我们通过 ChaosBlade 实现了 100% 自动化故障注入。故障演练也促使我们达成整个技术部的目标：1 分钟发现，5 分钟止损，10 分钟定位。目前也正在计划将该流程引入新集群交付前以及版本升级后的标准化流程。

#### 4.4 人才储备

- **专业认证**

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(20\)-1672728333033.png)

PingCAP 目前有三个认证，分别是 PCTA、PCTP、PCSD。前两个是早期推出面向 DBA 从业者岗位初高级认证。得物 DBA  团队有 6 位同学获得TiDB的 PCTA 认证考试、其中 5 位同学获得了进阶的 PCTP (TiDB专家)认证考试。认证虽然不能完全代表实力，但是代表了 DBA 团队对技术的追求和 DBA 团队在得物做好 TiDB 服务支持的决心与态度。

通过PCTP认证学习，团队成员深入了解TiDB数据库的体系架构、设计理念与各个组件的运行原理。学习并掌握 TiDB 数据库的体系架构，设计实践，性能监控、参数优化、故障排除、SQL优化和高可用设计。这个对于公司和团队来说就是人才和技术上的储备。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(21\)-1672728362742.png)

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(22\)-1672728381561.png)

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(23\)-1672728707551.png)

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(24\)-1672728720863.png)

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(25\)-1672728733243.png)

部分在职的 PCTP 得物 DBA 证书截图

- **运维小组**

对自建数据库服务我们采用了小组负责制，以 TiDB 为例，会有 3 名同学负责基础设施运维的工作(资源评估、变更流程评估、二线问题处理等)，其中一名是 Owner。关于日常业务侧的变更、SQL 优化等由具体对接业务的 DBA 负责处理。这样既解决了人员互备问题，又解决了变更风险评估问题，还解决了运维小组运维压力的问题。

#### 4.5 技术运营

对于一个新兴数据库，DBA 基于产品特性介绍、场景分析、案例分享等，在公司内部的技术运营也非常重要。它决定了研发同学对这个产品的认知和信心。好的技术氛围一定是得益于公司内部完善的机制和平台，同时你也能合理的加以利用。这里没有讲到对外分享，是因为我们的原则是先内部沉淀修炼，然后再对外分享。以下是我们对于 TiDB 的技术运营在公司内部的 3 个主战场。

- **技术分享**

技术夜校是得物技术部技术文化的特色之一。为技术部有意分享的同学提供一个平台，就现有技术实战经验、技术研究成果、重点项目回顾等，在技术部与同学们做分享和交流，营造浓厚的技术分享氛围，形成技术知识沉淀，打造学习型组织，提升技术影响力，拓宽技术同学的知识面。

这是一个能够有力促进技术影响力和产品影响力的机会，我们当然也不能错过。本文的作者在刚入职得物的时候就分享了《分布式数据库 TiDB 的设计和架构》，培训教室座无虚席，参与人次创下新高。这次分享让研发对 TiDB 也有了一个全面的认识。所以技术分享一定程度上解决了前面说的产品能力认知问题。

- **技术博客**

"毒"家博客也是得物技术部技术文化的特色之一。初衷是为了各位同学们交流技术心得，通过输入与输出的方式促进进步、相互成长。很多高质量文章也被推送到了得物技术公众号。

DBA 团队借助内部的技术博客平台，输出了多篇有关 TiDB 的技术文章。内容涵盖核心原理分析、优化案例、故障 case 分析、业务场景落地等。在整个氛围的带动下，不少研发同学也发表了关于 TiDB 的学习和落地的技术文章。

- **课程录制**

组织内部的技术分享的投入较大，分享的频次不宜太高，否则参与度也会比较低。而且从内容深度、知识获取效率、自助学习来看，分享也不是长期的方案。录制视频课程的事情就提上日程了，视频课程的好处是可以浓缩知识点，将技术分享 40 分钟的内容(有一些不必要的内容，比如重复的话、口头语等)压缩至 15 分钟。完美解决了前面提到的问题。正好公司内部有一个自研的学习平台，日常就用于发布各种培训、学习的视频。为确保录制效果和效率我们前期的课程都准备了稿件。我们基于这个平台也发布了一期( 5 节)课程，最近已经在筹备第二期的课程内容了。

课程录制也可以使 DBA 再一次复习细节知识，因为要讲清楚知识点，就必须自己深入理解。这个一定程度上表明了我们对 TiDB 的了解程度和做好它的决心，也给了研发使用的信心。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(26\)-1672728861032.png)

## TiDB 在核心业务场景实践

### 5.1 业务痛点

得物商家订单库由早期 MySQL 单库进阶到 MySQL 分库分表，这个方案支撑了业务的高速发展。而以商家 ID 做 shareding-key，会使的同一个商家的订单数据都会在一个表中，随着订单量的逐步提升，最终大商家的查询会形成了单点性能问题。主要体现在慢 SQL 较多和 数据库负载上升，每天约 1W 条慢 SQL，部分统计类查询已经超 10S。另外就是单机容量也有上限，垂直扩容受限。随着订单量的上升，系统整体的性能和容量需要最进一步的规划。

### 5.2 解决思路

|        |                                        |                                                |
| ------ | -------------------------------------- | ---------------------------------------------- |
|        | 优点                                     | 缺点                                             |
| 规格调整   | - 简单快速                                 | - 治标不治本
- 成本高                                  |
| 数据归档   | - 减少单表数据量                              | - 治标不治本
- 成本高                                  |
| 调整分片规则 | - 解决数据分布问题                             | - 数据需要按新的逻辑灌入新集群
- 业务代码需要适配新的分片规则
- 分库分片水平扩展复杂 |
| 分布式数据库 | - 解决上面提到的数据分布问题
- 扩容简单，无需业务感知
- 聚合查询能力 | - 新存储的引入需要验证稳定性、性能、兼容性                         |

基于以上提到的问题，我们对所有的解决方案都做了对比。表格中是对四种解决方案的关键信息提炼。我们希望能够选择一个比较长期的方案，可以支撑未来 3-5 年的需求，既要解决性能问题，还要解决容量问题，又要比较低的研发成本。所以最终选择了引入分布式数据库的方案。

### 5.3 数据库选型

基于目前得物在使用的数据库进行了评估，主要包含以下三种选择。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(27\)-1672728934226.png)

由于得物在 2020 年就引入了 TiDB。虽然没有大规模推广，但是陆续也有不少业务接入。大部分的业务把它作为 MySQL 分库分表的聚合库使用，有一小部分业务是直接接入了读写需求。基于之前的实践经验和业务需求，经过和研发团队的协商，直接采用的读写库的使用方案。另外一个方面是从只读过渡到全量读写的周期会比较长，会产生不必要的并行成本和延迟项目时间。

### 5.4 兼容性&性能测试

- **兼容性测试**

SQL 兼容性的问题，我们并没有完全依赖后期的业务测试来验证。而是通过获取 MySQL 上的全量 SQL 的方式进行验证。由于我们将全量 SQL 存储在了 Clickhouse，并且存储前做了SQL 指纹提取。所以很容易可以获得去重后的业务 SQL。然后将所有类型的 SQL  样本在 TiDB 中进行回放，这里主要针对 Select。最终测试所有业务 SQL 100% 兼容。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(28\)-1672728981787.png)

SQL 指纹

#### 性能测试

- 单量较少的商家场景性能测试

和预期的结果一样，由于 TiDB 分布式的架构，数据获取路径比 MySQL 要长，所以 RT 上相比 MySQL 分别多出 91%、76%、52%。从这里可以看出随着并发的上升，TiDB 和 MySQL 之间的  RT 差距也逐步缩短。由于 TiDB 可以通过扩展 DB 和 KV 节点提升 QPS 能力，我们在压测中也做了相关验证，符合预期。包括现有数据量翻一倍的基础上对性能的影响也做了验证，结论是无影响。为了方便和后面的内容对比，我们这里只提供了 RT 的指标。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(29\)-1672729041465.png)

- 单量较多的商家场景性能测试

我们挑了几个出现频率较高且查询较慢的 SQL进行测试，详情参照以下内容。

SQL1

```

SELECT *
  FROM table_name
 WHERE xx_id= 1203030
   AND xx_status IN(4000, 3040)
   AND is_del= 0 ORDER BY id DESC,
         create_time DESC  LIMIT 20
```

SQL2

```markdown

SELECT [column_name] FROM table_name
WHERE xx_id = 1203030
        AND xx_status = 8010
        AND close_type = 13
        AND close_time > ‘2022-06-19 18:16:24.519'
LIMIT 0, 30000
```

SQL3

```markdown

SELECT * FROM table_name
 WHERE xx_id= 1203030
   AND xx_status IN(7000, 8000, 8010)
   AND is_del= 0
ORDER BY id DESC,create_time DESC 

LIMIT 20
```

SQL4

```markdown

select count(*)  from table_name
 WHERE(seller_id= 1203030
   and is_del= 0
   and biz_type in('0', '12')
   and create_time>= '2021-11-01 00:00:00.0'
   and create_time< '2021-11-30 23:59:59.0'
   and(xx_status<> 1000 R biz_type<> 21))
```

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(30\)-1672729166701.png)

关于 xxDB 特别做了处理，大家可以忽略，因为我们主要对比的是 MySQL 和 TiDB。从测试结果来看效果很好，完全满足业务侧的要求。

### 5.5  遇到的一些问题

- SQL 执行计划

**问题：**

首先说明一下，统计信息健康度是 90 以上。SQL 还是会选错索引。我们分析了一下，主要是两个问题：1.查询条件比较多，索引也比较多；2.优化器的能力待提升。

**解决方案：**

上线前和研发对已有 SQL 进行了全面的 Review，如果执行计划不对，就通过 SPM 解决。

- Bug

**问题1：**

Update 语句并发执行耗时 3S，经过排查是由于研发未使用显示事务，所以第一次执行是乐观事务，第二次重试才是悲观事务。调整以后遇到了悲观事务下，偶发性的写写冲突的问题。经排查是由于悲观锁未获取到导致的写写冲突，需要升级到 5.3.2 才能解决。

**解决方案：**

升级版本到 5.3.2 解决

**问题 2：**

TiDB出现部分节点不可用，SQL执行报 Region is unavailable 错误。经排查是 5.3.2 引入的 TiKV  bug。

PD leader 发生切换后，TiKV 向 PD client 发送心跳请求失败后不会重试，只能等待与 PD client 重连。

这样，故障 TiKV 节点上的 Region 的信息会逐步变旧，使得 TiDB 无法获取最新的 Region 信息，导致 SQL 执行出错。

**解决方案：**

这是一个让人后背发凉的 bug。当时的判断是由于 PD 切换导致的，但是不清楚是 bug。我们采用了影响最小的故障恢复方案(把 PD leader 切回去，因为原 PD Leader 没有挂，只是发生了切换)。问题解决后在官方发现了这个bug fix。所以又安排了升级。

这是我们上线过程中遇到的几个典型问题。总体来说引入一个新数据库就会带来一定的试错成本，所以我们依然处于谨慎选型的状态。另外就是吐槽一下，就上面的问题 2，建议官方要加强 Code Review 和混沌工程演练。

### 5.6 上线效果

- 性能收益

为了确保上线稳定性，我们通过灰度切流的方式逐步放量。完全切流后成果显著，慢 SQL 几乎全部消失，如下图所示。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(31\)-1672729269163.png)

- 成本收益

由于 MySQL 的分库分表集群由 10个写实例、10个读实例构成，迁移至 TiDB 后的集群规模为 TiDB\*6、TiKV\*12。成本下降了58%。所以再重复说一下选对了场景，TiDB 也能顺带节省成本。

- 大促考验

项目上线后轻松应对了今年的双 11、双 12，大促中的系统 RT表现稳定。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/640\(32\)-1672729299738.png)

## 总结

最后特别说明下，文章中涉及一些产品的对比只是基于我们当时的场景和需求进行的分析，并不代表某个数据库产品的好坏。写这篇文章的目的是想把我们 TiDB 落地经验做个阶段性总结，顺便也能给同行们做个大方向上的参考。我们的这套方法论，理论上适用于任何一个需要再企业内部引入新型数据，并且推广的场景。本文涉及的内容和方向比较多，无法每个模块都做深入的探讨。后面我们也会把大家感兴趣的模块单独拆分出来做几期深入分享。

> 声明：本文转载于 https://mp.weixin.qq.com/s/sOihaTdyo9oYzGtauTTBwg