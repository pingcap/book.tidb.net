 ---
 title: 欢迎投稿
 hide_title: true
 ---

# tiflash 6.0 on K8s 扩容与新特性实践

## 概述

TiFlash 的升级与扩缩容已经有很多同学实践了，随着 TiDB 的普及，这方面也不适合连篇累牍的描述，但是在这次测试 6.0 on K8s 的过程中也确实遇到了一些坎坷。本文首先讲解 TiFlash 6.0 on K8s 扩容的注意事项，然后描述在新扩容的机器上的一些新特性实践。此次发布的分区表动态裁剪等特性都在 6.1 GA 了，且 6.1 是 LTS 版本，生产环境建议直接升级 6.1 使用。

## TiFlash 6.0 on K8s 扩容

我们有多个 TiDB 环境，一个实验性 TiDB 环境在 K8s 上，一个开发 TiDB 环境用的虚拟机部署的，给研发的同学提供支撑，一个是生产环境。开发环境为了保持研发同学的一致性体验，暂时不升级 6.0，使用实验性 TiDB 环境进行测试。实验性 TiDB 环境已经升级为 6.0，但是没有部署 TiFlash，TiDB on K8s 的升级暂不描述。

### 扩容 TiFlash 6.0 on K8s

按照官方文档描述，在 tc 中增加 TiFlash 的配置：

```
kubectl edit tc basic -n TiDB-cluster
```

在 spec.timezone: UTC 之前增加 TiFlash 配置：

```
  TiFlash:
    baseImage: uhub.service.ucloud.cn/pingcap/TiFlash
    maxFailoverCount: 3
    replicas: 3
    storageClaims:
    - resources:
        requests:
          storage: 10Gi
```

其中，需要注意的是 TiFlash 的存储设置稍有不同，要配置成如下形式：

```
    storageClaims:
    - resources:
        requests:
          storage: 10Gi
```

如此配置是因为 TiFlash 支持挂载多个 pv，如果要为 TiFlash 配置多个 PV，可以在 TiFlash.storageClaims 下面配置多项，每一项可以分别配置 storage request 和 storageClassName，例如：

```
  TiFlash:
    baseImage: pingcap/TiFlash
    maxFailoverCount: 0
    replicas: 1
    storageClaims:
    - resources:
        requests:
          storage: 100Gi
      storageClassName: local-storage
    - resources:
        requests:
          storage: 100Gi
      storageClassName: local-storage
```

#### core dump 设置过大错误

保存当前配置后，等待 pod 部署，此时会发现 tifalsh 起不来，日志报错如下：

```
Poco::Exception. Code: 1000, e.code()= 0, e.displayText() = Exception: Cannot set max size of core file to 1073741824, e.what() = Exception
```

从 Rancher 的 console 上看，如下图：
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652695469018-1656042427005.png)
在社区求助获取大神的指点后，翻阅源码发现问题：

```
struct rlimit rlim;
        if (getrlimit(RLIMIT_CORE, &rlim))
            throw Poco::Exception("Cannot getrlimit");
        /// 1 GiB by default. If more - it writes to disk too long.
        rlim.rlim_cur = config().getUInt64("core_dump.size_limit", 1024 * 1024 * 1024);

        if (setrlimit(RLIMIT_CORE, &rlim))
        {std::string message = "Cannot set max size of core file to" + std::to_string(rlim.rlim_cur);
#if !defined(ADDRESS_SANITIZER) && !defined(THREAD_SANITIZER) && !defined(MEMORY_SANITIZER) && !defined(SANITIZER)
            throw Poco::Exception(message);
#else
            /// It doesn't work under address/thread sanitizer. http://lists.llvm.org/pipermail/llvm-bugs/2013-April/027880.html
            std::cerr << message << std::endl;
#endif
        }
```

简单说明就是 TiFlash 启动时，需要设置 core dump 的大小为 1G，经过一些调试，获取容器启动时默认的限制为：

```
[root@host ~]# ulimit -c
1024
```

由于超过了系统限制所以报错且无法启动。
此时需要在 /etc/systemd/system/docker.service.d/ 中增加：
limit-core.conf
内容：

```
[Service]
LimitCORE=infinity
```

然后执行如下命令：

```
systemctl daemon-reload
systemctl restart docker.service
```

#### 默认配置格式错误

上述操作重启后，发现上述错误已经没有了，但是在日志中出现了新的错误：
TiFlash:

```
[2022/05/16 07:53:23.808 +00:00] [INFO] [mod.rs:118] ["encryption: none of key dictionary and file dictionary are found."]
[2022/05/16 07:53:23.808 +00:00] [INFO] [mod.rs:479] ["encryption is disabled."]
[2022/05/16 07:53:23.808 +00:00] [INFO] [server.rs:231] ["set raft-store proxy helper"]
[2022/05/16 07:53:23.808 +00:00] [INFO] [server.rs:231] ["wait for engine-store server to start"]
[2022/05/16 07:53:24.009 +00:00] [INFO] [server.rs:231] ["engine-store server is not running, make proxy exit"]
```

errorlog:

```
[2022/05/16 07:53:07.000 +00:00] [ERROR] [StorageConfigParser.cpp:73] ["Application:The configuration \"storage.raft.dir\"should be an array of strings. Please check your configuration file."] [thread_id=1]
[2022/05/16 07:53:07.100 +00:00] [ERROR] [<unknown>] ["Application:DB::Exception: The configuration \"storage.raft.dir\"should be an array of strings. Please check your configuration file."] [thread_id=1]
```

推断是 configmap 中的 storage.raft.dir 配置有问题，执行：

```
kubectl edit tc basic -n TiDB-cluster
```

修改 TiFlash 的配置如下：

```
  TiFlash:
    baseImage: uhub.service.ucloud.cn/pingcap/TiFlash
    config:
      config: |
        [storage]
          [storage.main]
            dir = ["/data0/db"]
          [storage.raft]
            dir = ["/data0/kvstore"]
    maxFailoverCount: 3
    replicas: 3
    storageClaims:
    - resources:
        requests:
          storage: 10Gi
```

增加 config，其中注意：

1. 两次嵌套 config
2. storage 下面如果有配置，需要全部在配置中指定，在实践中常常漏掉 storage.main 配置，要注意检查。
   2022 年 6 月 24 日
   等待 pod 重新部署之后，TiFlash 成功启动。
   查看实例，已经部署成功：
   ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652695484724-1656042426983.png)

## TiFlash 6.0 新特性解读

6.0 版本下 TiFlash 新增特性如下：

- 新增按库构建 TiFlash 副本功能。用户仅需使用一条 SQL 即可对某一个数据库中所有的表添加 TiFlash 副本，极大地节约了运维成本。[使用文档](https://docs.pingcap.com/zh/TiDB/v6.0/use-TiFlash#%25E6%258C%2589%25E5%25BA%2593%25E6%259E%2584%25E5%25BB%25BA-TiFlash-%25E5%2589%25AF%25E6%259C%25AC)
- TiFlash MPP 引擎支持分区表的动态裁剪模式。[使用文档](https://docs.pingcap.com/zh/TiDB/v6.0/use-TiFlash#MPP-%25E6%25A8%25A1%25E5%25BC%258F%25E8%25AE%25BF%25E9%2597%25AE%25E5%2588%2586%25E5%258C%25BA%25E8%25A1%25A8)
  在该模式下，TiDB 也可以使用 TiFlash MPP 引擎读取和计算分区表的数据，从而大大提升分区表的查询性能。
- TiFlash 新增支持 zstd 压缩算法。[使用文档](https://docs.pingcap.com/zh/TiDB/v6.0/TiFlash-configuration#%25E9%2585%258D%25E7%25BD%25AE%25E6%2596%2587%25E4%25BB%25B6-TiFlashtoml)
  新增 profiles.default.dt\_compression\_method 和 profiles.default.dt\_compression\_level 两个参数，用户可根据对性能和容量的平衡，选择不同的压缩算法。
- TiFlash 默认开启支持所有 I/O 的校验 (Checksum)。[使用文档](https://docs.pingcap.com/zh/TiDB/v6.0/use-TiFlash#%25E4%25BD%25BF%25E7%2594%25A8%25E6%2595%25B0%25E6%258D%25AE%25E6%25A0%25A1%25E9%25AA%258C)
  此项功能曾作为实验特性在 v5.4 释出。除增强了数据的正确性安全性外，对用户使用不产生明显的直接影响。
- TiFlash 引入异步 gRPC 和 Min-TSO 调度机制，更好的管理线程使用，防止线程数过高导致的系统崩溃。[使用文档](https://docs.pingcap.com/zh/TiDB/v6.0/monitor-TiFlash#coprocessor)

其中，按库构建 TiFlash 副本，TiFlash MPP 引擎支持分区表正好符合了作者的需求，此文中做一些评测，加入数据和效果展示，方便各位评估。

## 新增按库构建 TiFlash 副本功能

### 按库构建的方便之处

我们设置数据层次如下所示：
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652695495005-1656042426976.png)
其实从明细层开始，就已经是 TiFlash 比较喜欢的宽表了，对于明细、汇总、萃取层的数据我们期望都用 TiDB 体系替代，所以这三层中的表都希望有 TiFlash 副本。

### 操作实践

#### 测试环境描述

构建一个测试库，库中有 23 张表，其中最大的表有 3 千万数据，为非分区表，另外还有一张分区表，180 万数据，7 张空表，没有数据。

#### 执行按库构建 TiFlash 副本

```
ALTER DATABASE TESTDB SET TiFlash REPLICA 1;
```

脚本交互过程长达 30 秒，时间并不短，通过执行脚本：

```
SELECT * FROM INFORMATION_SCHEMA.TIFLASH_REPLICA WHERE TABLE_SCHEMA = 'TESTDB';
```

看看副本同步情况：
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652695505565-1656042427008.png)
所有的表都已经创建了 TiFlash 副本，包括空表，部分大表已经开始同步，目前空表和部分小表的 AVAILABLE 和 PROGRESS 都为 0，等待同步完成之后，再查看状态：
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652695511673-1656042427020.png)
全部的表都建立了 TiFlash 副本。
此时新建一张表：

```
CREATE TABLE ADCM_P2 LIKE ADCM_P;
```

再次通过：

```
SELECT * FROM INFORMATION_SCHEMA.TIFLASH_REPLICA WHERE TABLE_SCHEMA = 'TESTDB';
```

查询， TiFlash 表增加了一张，数量为 24 张，新建的表也创建了 TiFlash 副本。
[官方文档](https://docs.pingcap.com/zh/tidb/stable/use-tiflash) 提示如下：

- 按库构建 TiFlash 副本命令实际是为用户执行一系列 DDL 操作，对资源要求比较高。如果在执行过程中出现中断，已经执行成功的操作不会回退，未执行的操作不会继续执行。
- 从按库构建 TiFlash 副本命令执行开始到该库中所有表都已同步完成之前，不建议执行和该库相关的 TiFlash 副本数量设置或其他 DDL 操作，否则最终状态可能非预期。非预期场景包括：
  - 先设置 TiFlash 副本数量为 2，在库中所有的表都同步完成前，再设置 TiFlash 副本数量为 1，不能保证最终所有表的 TiFlash 副本数量都为 1 或都为 2。
  - 在命令执行到结束期间，如果在该库下创建表，则可能会对这些新增表创建 TiFlash 副本。
  - 在命令执行到结束期间，如果为该库下的表添加索引，则该命令可能陷入等待，直到添加索引完成。
- 按库构建 TiFlash 副本命令会跳过系统表、视图、临时表以及包含了 TiFlash 不支持字符集的表。

在实际操作过程中，要考虑以上提示信息。其中在按库构建 TiFlash 副本命令执行到结束期间，如果在目标库下创建表，则可能会对这些新增表创建 TiFlash 副本，存在不确定性；全部同步执行之后，再创建表，则确定会为这些新增表创建 TiFlash 副本。

## TiFlash MPP 引擎支持分区表的动态裁剪模式

### 支持分区表的方便之处

我们的很多事实表都会分区，分区在表的使用中会使用动态分区裁剪缩小数据扫描范围，有效的提高查询效率。在 5.4.0 版本中，分区表无法应用 MPP 计算，只是在 TiFlash 完成下推的算子之后，把数据汇总到 TiDB 中进行计算，因为这种计算方式还引起了一些问题，参考：[TiDB server 的 oom 问题优化探索](https://TiDB.net/blog/de9bf174)。

### 操作实践

#### 操作环境介绍

设计一个实验用分区表 cust\_partiton，一个非分区表 cust，一个维度表 info, 执行如下查询：

```
-- 非分区表
select
    `info`.`code` as `c0`,
    sum(`cust`.`sn`) as `m0`,
    sum(`cust`.`cbn`) as `m2`
from
    `cust` as `cust`,
    `info` as `info`
where
    `info`.`code` = '88888888'
and
    `cust`.`id` = `info`.`id`
group by
    `info`.`code`;
-- 分区表
select
    `info`.`code` as `c0`,
    sum(`cust`.`sn`) as `m0`,
    sum(`cust`.`cbn`) as `m2`
from
    `cust_partiton` as `cust`,
    `info` as `info`
where
    `info`.`code` = '88888888'
and
    `cust`.`id` = `info`.`id`
group by
    `info`.`code`;
```

按照如下顺序执行：

1. 非分区表查询
2. 默认参数分区表查询
3. 开启动态剪裁分区表查询

实验结果如下：

#### 非分区表查询

执行计划：

```
id                                            |estRows  |task             
----------------------------------------------+---------+-----------------
Projection_9                                  |1.00     |root             
└─TableReader_52                              |1.00     |root             
  └─ExchangeSender_51                         |1.00     |batchCop[TiFlash]
    └─Projection_47                           |1.00     |batchCop[TiFlash]
      └─HashAgg_48                            |1.00     |batchCop[TiFlash]
        └─ExchangeReceiver_50                 |1.00     |batchCop[TiFlash]
          └─ExchangeSender_49                 |1.00     |batchCop[TiFlash]
            └─HashAgg_14                      |1.00     |batchCop[TiFlash]
              └─Projection_46                 |137289.74|batchCop[TiFlash]
                └─HashJoin_40                 |137289.74|batchCop[TiFlash]
                  ├─ExchangeReceiver_25(Build)|6436.00  |batchCop[TiFlash]
                  │ └─ExchangeSender_24       |6436.00  |batchCop[TiFlash]
                  │   └─Selection_23          |6436.00  |batchCop[TiFlash]
                  │     └─TableFullScan_22    |6436.00  |batchCop[TiFlash]
                  └─TableFullScan_26(Probe)   |180388.00|batchCop[TiFlash]   
```

执行时间：54ms

#### 默认参数分区表查询

执行计划如下（因分区太多，部分执行计划被折叠）：

```
id                              |estRows  |task        
--------------------------------+---------+------------
Projection_51                   |1.00     |root        
└─HashAgg_54                    |1.00     |root        
  └─Projection_60               |7242.04  |root        
    └─HashJoin_63               |7242.04  |root        
      ├─TableReader_72(Build)   |6436.00  |root        
      │ └─Selection_71          |6436.00  |cop[TiFlash]
      │   └─TableFullScan_70    |6436.00  |cop[TiFlash]
      └─PartitionUnion_75(Probe)|200388.00|root        
        ├─TableReader_80        |10000.00 |root        
        │ └─TableFullScan_79    |10000.00 |cop[TiFlash]        
....................................
        ├─TableReader_232       |6480.00  |root        
        │ └─TableFullScan_231   |6480.00  |cop[TiFlash]
        └─TableReader_236       |10000.00 |root        
          └─TableFullScan_235   |10000.00 |cop[TiFlash]
```

执行时间：146ms

#### 开启动态剪裁分区表查询

开启动态剪裁模式，执行如下 SQL：

```
set @@session.TiDB_partition_prune_mode = 'dynamic';
```

执行计划如下：

```
id                                            |estRows |task             
----------------------------------------------+--------+-----------------
Projection_9                                  |1.00    |root             
└─TableReader_52                              |1.00    |root             
  └─ExchangeSender_51                         |1.00    |batchCop[TiFlash]
    └─Projection_47                           |1.00    |batchCop[TiFlash]
      └─HashAgg_48                            |1.00    |batchCop[TiFlash]
        └─ExchangeReceiver_50                 |1.00    |batchCop[TiFlash]
          └─ExchangeSender_49                 |1.00    |batchCop[TiFlash]
            └─HashAgg_14                      |1.00    |batchCop[TiFlash]
              └─Projection_46                 |8045.00 |batchCop[TiFlash]
                └─HashJoin_40                 |8045.00 |batchCop[TiFlash]
                  ├─ExchangeReceiver_25(Build)|6436.00 |batchCop[TiFlash]
                  │ └─ExchangeSender_24       |6436.00 |batchCop[TiFlash]
                  │   └─Selection_23          |6436.00 |batchCop[TiFlash]
                  │     └─TableFullScan_22    |6436.00 |batchCop[TiFlash]
                  └─TableFullScan_26(Probe)   |10000.00|batchCop[TiFlash]
```

执行时间：53ms

#### 总结

可以看到非分区表的执行计划中出现了 ExchangeSender 和 ExchangeReceiver，说明是走了 MPP 模式了，执行时间为 53ms。分区表默认参数执行计划中，没有出现 ExchangeSender 和 ExchangeReceiver，只是出现了 cop\[TiFlash]，说明走了 TiFlash 扫描，但是没走 MPP 模式执行时间为 146ms，修改为动态裁剪模式之后，执行计划与非分区表比较相似，因为在动态裁剪模式下，每个算子都支持直接访问多个分区，PartitionUnion 消失了，所以执行计划更简洁。在我的测试用例中，因为数据量和分区数量的关系，当增加 where 条件，减少分区扫描范围时没有获得执行效率上的明显提升，在此不做描述了。

## 展望

作者截稿时，6.1 LTS 版本已经发布，TiDB 具备更成熟的 HTAP 与容灾能力，加入多项云原生数据库所需的基础特性，对我关注的分区表处理也更加成熟，包括修复了以前提的很多个关于分区剪裁方面的 issue，相信 TiDB 作为 HTAP 已经有了更宽广的适应场景，希望将来的一天 TiDB 可以作为全场景、开箱即用的数据库产品创造辉煌。
