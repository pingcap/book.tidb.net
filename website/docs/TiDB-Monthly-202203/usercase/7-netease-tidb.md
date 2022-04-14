---
title: 网易这么牛的迁移方案你学会了吗？【DDB迁移TiDB方案设计】
hide_title: true
---

# 网易这么牛的迁移方案你学会了吗？【DDB 迁移 TiDB 方案设计】

转载来自：https://mp.weixin.qq.com/s/8JcrLSJQkT2_VKr3i4pgYg

**作者：张振祥**

**公众号：不错技术所**

目前公司已经多个业务上线 TIDB 服务,包括网易支付对账中心,网易云音乐心遇榜单系统等,但这些均是新业务直接上线 TIDB。为探索**已有业务迁移 TIDB**,本文对一些**迁移方案**进行了总结。

**一、TiDB 简介**

![2dc5eeacc22e8ae72fdf4ac581457769.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/2dc5eeacc22e8ae72fdf4ac581457769-1647941326712.png)

- **TiDB Server**：SQL 层，对外暴露 MySQL 协议的连接 endpoint，负责接受客户端的连接，执行 SQL 解析和优化，最终**生成分布式执行计划**。**TiDB 层本身是无状态的**，实践中可以启动多个 TiDB 实例，通过负载均衡组件（如 LVS、HAProxy 或 F5）对外提供统一的接入地址，**客户端的连接可以均匀地分摊在多个 TiDB 实例上以达到负载均衡的效果**。**TiDB Server 本身并不存储数据**，只是解析 SQL，将实际的数据读取请求转发给底层的存储节点 TiKV（或 TiFlash）

- **PD (Placement Driver) Server**：**整个 TiDB 集群的元信息管理模块**，负责存储每个 TiKV 节点实时的数据分布情况和集群的整体拓扑结构，提供 TiDB Dashboard 管控界面，并为分布式事务分配事务 ID。PD 不仅**存储元信息**，同时还会**根据 TiKV 节点实时上报的数据分布状态，下发数据调度命令给具体的 TiKV 节点**，可以说是整个集群的“大脑”。此外，PD 本身也是由至少 3 个节点构成，拥有**高可用**的能力。**建议部署奇数个 PD 节点**

**存储节点**

1. **TiKV Server**：负责存储数据，**从外部看 TiKV 是一个分布式的提供事务的 Key-Value 存储引擎**。存储数据的基本单位是 Region，每个 Region 负责存储一个 Key Range（从 StartKey 到 EndKey 的左闭右开区间）的数据，每个 TiKV 节点会负责多个 Region。
2. TiKV 的 API 在 KV 键值对层面提供对分布式事务的原生支持，**默认提供**了 SI (Snapshot Isolation) 的隔离级别，这也是 **TiDB 在 SQL 层面支持分布式事务的核心**。TiDB 的 SQL 层做完 SQL 解析后，会将 SQL 的执行计划转换为对 TiKV API 的实际调用。所以，**数据都存储在 TiKV 中**。另外，TiKV 中的数据都会自动维护多副本（默认为三副本），**天然支持高可用和自动故障转移**。
3. **TiFlash**：TiFlash 是一类特殊的存储节点。和普通 TiKV 节点不一样的是，**在 TiFlash 内部，数据是以列式的形式进行存储，主要的功能是为分析型的场景加速**

**TIDB 优势**

**1.提供 DDB 同等程度的水平扩容能力**

**2.SQL 支持能力较 DDB 好, 性能相当,DDB SQL 会有很多限制**

比如说查询时要求要带上均衡字段、不建议做表 join 操作等等;均衡字段不可频繁 update, update 需要用 delete+insert;唯一约束限制,所有唯一键均需要加上均很字段,否则无法保证唯一

**3.资源扩缩容粒度更加灵活, 不需要像 DDB, 每次都翻倍扩容**

**4.数据一致性下限提升**

**5.数据存储成本一定程度降低**

P_ABTEST_TEST_AGG 表 1.5 亿行,MySQL 占用空间 337G TiDB 84G ,当然这是比较极端的情况,**一般来讲我们认为 TIDB 磁盘存储 较 DDB 会有下降 30%**。不需要 raid10+rocksdb 压缩-rockdb 写放大

**6.主从复制效率显著提高, 降低写负载下一致性和高可用降级的风险**

**7.扩容行为效率和安全性**

**8.在线 DDL 支持更好, 除了加索引基本都是秒回, 大表增加修改列成本显著降低**

**9.高可用自动恢复可靠性与效率显著提升**

**10.HTAP 能力能够减少数据传输环节的成本和风险, 提供业务更高效的实时分析能力**

某些场景下聚合查询的效率是 MySQL 的 100 倍

https://pingcap.com/blog-cn/tidb-and-tiflash-vs-mysql-mariadb-greenplum-apache-spark/

**二、DDB(QS 模式) 迁移 TIDB 方案设计**

**梳理应用以及表的对应关系**

**确认迁移的业务域**

实际上一般我们以**表维度**来划分，如果**有表级别的耦合**我们会要求**先进行业务改造**

![21fbf69159762cabb1b1622e2d681455.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/21fbf69159762cabb1b1622e2d681455-1647941394329.png)

**业务兼容性改造**

不支持 FLOAT4/FLOAT8 类型

不支持 XA 语法（TiDB 内部使用两阶段提交，但并没有通过 SQL 接口公开）

不支持 savepoints

不支持 存储过程/触发器

不支持 SELECT ... INTO @变量 语法

不支持 SELECT ... GROUP BY ... WITH ROLLUP 语法

不支持 外键约束

不支持 视图修改,业务需要梳理是否有相关依赖

因 explicit_defaults_for_timestamp 默认值不一致,需要梳理有没有 insert timestamp 字段为 null 的逻辑（TiDB 默认：ON，且仅支持设置该值为 ON。MySQL 5.7 默认：OFF。MySQL 8.0 默认：ON）

自增 ID,自增列仅保证唯一,不保证自增。业务需要梳理是否有依赖自增特性的逻辑（TiDB 的自增列仅保证唯一，也能保证在单个 TiDB server 中自增，但不保证多个 TiDB server 中自增）

指定默认字符集/字符序为 utf8mb4_bin、utf8mb4_general_ci

不支持修改 decimal 类型的精度

不支持有损变更，以及部分数据类型的更改（包括整数改为字符串或 BLOB 格式等）

**连接串修改**

jdbc.dirver=com.mysql.jdbc.Driver jdbc.url=jdbc:mysql://10.170.208.12:6006/tidb_database

**数据同步以及一致性校验**

![d5377cf5748b958ec9c9aadf0338445c.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/d5377cf5748b958ec9c9aadf0338445c-1647941433748.png)

**数据源切换方案**

**非 LBD 模式的 QS**

- **业务切换**

1. 业务改造成**域名访问**的方式
2. **低峰期通过切换域名的方式**切换数据源
3. **源端 rename 表**(为了避免出现双写,确定没有其他业务连该表)
4. 域名切换
5. Kill 老库连接

- **数据回滚**

通过**设置反向同步任务**回滚数据

**优点**：业务除开连接串的修改外无需做任何修改

**LBD/DBI 模式**

- **灰度发布**

业务仅做兼容性改造

**切换方案**：遵循灰度发布程序

**回滚方案**：1.下掉灰度机器;2.新写入的数据做回滚

**优点**：业务改造比较少

**缺点**：可能会出现双写的情况,数据可能会冲突

- **业务热开关切换**

业务需要做兼容性及数据源热切开关改造

**切换方案**：1. 源表 rename，确保没有其他业务使用；2. 业务开启禁写开关；3. 业务流量切换；4. 业务开启读写,完成切换

**回滚方案**：回滚方案需要考虑到**新增数据反向同步**

**优点**：业务改造比较少，无需加入异步写逻辑，也无需关心数据不一致情况，且能保证数据一致性,

**缺点**：切换一刀切，未经灰度验证

- **业务双写方案**

业务通过热开关可以切换成 读写 DDB，读写 DDB+异步写 TiDB ，读写 TiDB + 异步写 DDB，仅读写 TiDB

**读写 DDB+异步写 TiDB 时的切换方案**：1.DDB 中设置 read_only；2. 等等 NDC 增量同步完成；3. DBA 关闭同步任务；4. 业务开启异步写 TiDB；5. DDB 中开启读写

**回滚**：业务直接切换到**仅读写 DDB** 就行

**优点**：经过较长时间的灰度,**稳定性/安全性较高**

如果异常回滚较为迅速无损

**问题**：业务改造较多,**需要加入异步写逻辑,热切开关等逻辑**；另外还需要考虑**异步写的数据一致性**问题

**三、数据同步上下游工具**

数据同步以及回滚数据链路图

![b6f3e22a837c17729697f3189e8164e7.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/b6f3e22a837c17729697f3189e8164e7-1647941475926.png)

TIDB 数据接入 NDC 数据链路图

![c700d1237e6ef74cac4aaee19790a542.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/c700d1237e6ef74cac4aaee19790a542-1647941492244.png)

**TiCDC 监控**详解见：

https://docs.pingcap.com/zh/tidb/v4.0/monitor-ticdc

**●Changefeed table count**：一个同步任务中分配到各个 TiCDC 节点同步的数据表个数

**●Processor resolved ts**：TiCDC 节点内部状态中已同步的时间点

Table resolved ts：同步任务中各数据表的同步进度

**●Changefeed checkpoint**：同步任务同步到下游的进度，正常情况下绿柱应和黄线相接

**● PD etcd requests/s**：TiCDC 节点每秒向 PD 读写数据的次数

**● Exit error count**：每分钟内导致同步中断的错误发生次数

TICDC 报警规则

![4cf56cf402517d3dd9ce04107330da74.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/4cf56cf402517d3dd9ce04107330da74-1647941509808.png)

TIDB 监控报警框架

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/d1b4124c7be541fa23f86185bd1f9119-1647941521010.png)
