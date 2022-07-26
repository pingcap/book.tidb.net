---
title: TiDB Sysbench 性能对比测试报告 - v5.1.4 对比 v6.0.0 DMR
hide_title: true
---

# TiDB Sysbench 性能对比测试报告 - v5.1.4 对比 v6.0.0 DMR

> 作者：靳献旗，DBA，2020、2021 MVA，2022 MOA

## 1. 背景

目前我们线上 TiDB 集群统一升级到了 v5.1.4 版本，对于 v6.0.0 版本我们有很多期待，本文不会讨论 v6.0.0 的特性，但打算将其性能与 v5.1.4 进行对比，看看它的性能是否有提升。

## 2. 测试概述

使用 TiUP 部署 TiDB 集群，集群部署规模为 3 TiDB Server、3 PD Server、6 TiKV Server，使用 LVS 作为负载均衡器，Sysbench 测试工具部署在另一台服务器上，作为客户端的压力测试服务器，进行 OLTP 测试。本文主要对 TiDB v5.1.4 版本和 TiDB v6.0.0 DMR 版本进行对比性能测试。

## 3. 测试环境

### 3.1 硬件配置

使用 6 台浪潮服务器，硬件配置如下(服务器 IP 已脱敏)：

| 服务器      | CPU                                             | 内存 | 硬盘                               |
| ----------- | ----------------------------------------------- | ---- | ---------------------------------- |
| 192.168.1.1 | Intel(R) Xeon(R) Gold 5218 CPU @ 2.30GHz 128 核 | 256G | 448GB*2 RAID1 + 3.57T*6 SSD RAID10 |
| 192.168.1.2 | Intel(R) Xeon(R) Gold 5218 CPU @ 2.30GHz 128 核 | 256G | 448GB*2 RAID1 + 3.57T*6 SSD RAID10 |
| 192.168.1.3 | Intel(R) Xeon(R) Gold 5218 CPU @ 2.30GHz 128 核 | 256G | 448GB*2 RAID1 + 3.57T*6 SSD RAID10 |
| 192.168.1.4 | Intel(R) Xeon(R) Gold 5218 CPU @ 2.30GHz 128 核 | 256G | 448GB*2 RAID1 + 3.57T*6 SSD RAID10 |
| 192.168.1.5 | Intel(R) Xeon(R) Gold 5218 CPU @ 2.30GHz 128 核 | 256G | 448GB*2 RAID1 + 3.57T*6 SSD RAID10 |
| 192.168.1.6 | Intel(R) Xeon(R) Gold 5218 CPU @ 2.30GHz 128 核 | 256G | 448GB*2 RAID1 + 3.57T*6 SSD RAID10 |

备注：每台服务器有 4 个 numa node。

### 3.2 软件环境 

安装的主要软件及其版本如下：

| 软件名称  | 软件用途           | 版本                |
| --------- | ------------------ | ------------------- |
| CentOS    | 操作系统           | 7.4                 |
| TiDB 集群 | 开源 NewSQL 数据库 | v5.1.4 / v6.0.0 DMR |
| Sysbench  | 压力测试工具       | 1.0.9               |

### 3.3 参数配置

两个版本使用相同的配置参数。

#### 3.3.1 TiDB 参数配置

```plain
prepared-plan-cache.enabled: true
tikv-client.max-batch-wait-time: 2000000
```

#### 3.3.2 TiKV 参数配置

```plain
raftstore.store-pool-size: 4
raftstore.apply-pool-size: 4
rocksdb.max-background-jobs: 8
raftdb.max-background-jobs: 4
raftdb.allow-concurrent-memtable-write: true
server.grpc-concurrency: 6
pessimistic-txn.pipelined: true
server.enable-request-batch: false
storage.block-cache.capacity: "37GB"
```

#### 3.3.3 TiDB 全局变量配置

```plain
set global tidb_hashagg_final_concurrency=1;
set global tidb_hashagg_partial_concurrency=1;
set global tidb_enable_async_commit = 1;
set global tidb_enable_1pc = 1;
set global tidb_guarantee_linearizability = 0;
set global tidb_enable_clustered_index = 1; 
```

## 4. 测试方案

1. 通过 TiUP 部署 TiDB v5.1.4 和 v6.0.0。
2. 通过 Sysbench 导入 16 张表，每张表有 1000 万行数据。
3. 分别对每个表执行 analyze table 命令。
4. 启动 Sysbench 客户端，进行 oltp_read_write、oltp_point_select、oltp_update_index 和 oltp_update_non_index 测试。通过 LVS 向 TiDB 加压，测试 10 分钟，每一轮测试中间间隔 5 分钟。
5. 测试完 v5.1.4 版本之后，销毁集群，部署 v6.0.0 集群重新测试。

### 4.1 初始化数据

执行以下命令来准备测试数据：

```plain
sysbench oltp_common.lua --db-driver=mysql --mysql-host=192.168.1.8 --mysql-port=4000 --mysql-db=sysbench --mysql-user=username --mysql-password=password --table-size=10000000 --tables=16 --rand-type=uniform --threads=16 prepare
```

### 4.2 测试命令

执行以下命令来执行测试：

```plain
sysbench ${test_type}.lua --db-driver=mysql --mysql-host=192.168.1.8 --mysql-port=4000 --mysql-db=sysbench --mysql-user=username --mysql-password=password --table_size=10000000 --tables=16 --time=600 --report-interval=1 --rand-type=uniform --threads=${thread_num} run 
```

## 5. 测试结果

### 5.1 Point Select 性能

| 压测线程 | v5.1.4 TPS | v6.0.0 TPS | v5.1.4 95% latency (ms) | v6.0.0 95% latency (ms) | TPS 提升(%) |
| -------- | ---------- | ---------- | ----------------------- | ----------------------- | ----------- |
| 150      | 296958     | 291233     | 0.75                    | 0.73                    | -1.93%      |
| 300      | 442315     | 450641     | 1.3                     | 1.06                    | 1.88%       |
| 600      | 536790     | 571275     | 2.61                    | 1.96                    | 6.42%       |
| 900      | 545976     | 592352     | 4.03                    | 3.02                    | 8.49%       |
| 1200     | 551751     | 595144     | 5.37                    | 4.18                    | 7.86%       |
| 1500     | 550086     | 591925     | 6.79                    | 5.47                    | 7.61%       |

v6.0.0 对比 v5.1.4，Point Select 性能提升了 5.055%。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1653576151262.png)

### 5.2 Update Non-index 性能

| 压测线程 | v5.1.4 TPS | v6.0.0 TPS | v5.1.4 95% latency (ms) | v6.0.0 95% latency (ms) | TPS 提升(%) |
| -------- | ---------- | ---------- | ----------------------- | ----------------------- | ----------- |
| 150      | 72033      | 72148      | 3.02                    | 2.86                    | 0.16%       |
| 300      | 107671     | 108816     | 4.25                    | 3.96                    | 1.06%       |
| 600      | 151318     | 152488     | 6.32                    | 5.77                    | 0.77%       |
| 900      | 176967     | 182077     | 8.58                    | 7.56                    | 2.89%       |
| 1200     | 192294     | 196657     | 11.04                   | 9.91                    | 2.27%       |
| 1500     | 199978     | 206365     | 13.70                   | 12.52                   | 3.19%       |

v6.0.0 对比 v5.1.4，Update Non-index 性能提升了 1.72%。

![image (1).png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image%20(1)-1653576160906.png)

### 5.3 Update Index 性能

| 压测线程 | v5.1.4 TPS | v6.0.0 TPS | v5.1.4 95% latency (ms) | v6.0.0 95% latency (ms) | TPS 提升(%) |
| -------- | ---------- | ---------- | ----------------------- | ----------------------- | ----------- |
| 150      | 40980      | 41539      | 5.47                    | 5.09                    | 1.36%       |
| 300      | 56463      | 57782      | 8.58                    | 7.7                     | 2.34%       |
| 600      | 71688      | 75408      | 14.73                   | 12.98                   | 5.19%       |
| 900      | 80166      | 84252      | 20.74                   | 18.95                   | 5.10%       |
| 1200     | 85066      | 90808      | 26.20                   | 24.38                   | 6.75%       |
| 1500     | 90039      | 95682      | 31.37                   | 29.19                   | 6.27%       |

v6.0.0 对比 v5.1.4，Update Index 性能提升了 4.5%。

![image (2).png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image%20(2)-1653576170121.png)

### 5.4 Read Write 性能

```plain
说明：
oltp read write 场景测试时使用的压测线程数和前面三种场景有所不同，原因是：当 tidb-server 绑定到 numa node 之后，在并发 600 线程压测时，cpu 使用率就达到了整个服务器 cpu 资源的 25%，即到达一个 numa node 能使用的 cpu 资源的瓶颈了。因此，针对这个场景，单独设计了压测线程数。
```

| 压测线程 | v5.1.4 TPS | v6.0.0 TPS | v5.1.4 95% latency (ms) | v6.0.0 95% latency (ms) | TPS 提升(%) |
| -------- | ---------- | ---------- | ----------------------- | ----------------------- | ----------- |
| 32       | 2521       | 2569       | 15.83                   | 14.73                   | 1.90%       |
| 64       | 4360       | 4533       | 18.61                   | 17.32                   | 3.97%       |
| 128      | 6728       | 6943       | 23.95                   | 22.69                   | 3.20%       |
| 200      | 8450       | 8577       | 29.72                   | 29.72                   | 1.50%       |
| 256      | 9311       | 9516       | 34.95                   | 36.89                   | 2.20%       |
| 300      | 9822       | 10142      | 40.37                   | 42.61                   | 3.26%       |

v6.0.0 对比 v5.1.4，Read Write 性能提升了 2.67%。

![image (3).png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image%20(3)-1653576179608.png)

## 6. 测试中遇到的问题和建议

### 6.1 遇到问题

- v6.0.0 相比 v5.1.4 在 point select 场景下性能下降严重 在测试 point select 场景时，v6.0.0 版本相比 v5.1.4 版本性能下降高达 38% 之多，经过分析是 tidb-server 跨 NUMA 访问内存导致的问题，将 tidb-server 绑定到 numa node 之后重新测试，性能从未绑定时的 -38% 到绑定之后的 5.055%，差异巨大。因此，部署集群时，强烈建议将 TiDB、PD、TiKV 与 NUMA node 一对一绑定，否则测试中可能遇到各种奇怪的问题，详情可以参考文末参考文档中的文章。
- 在 read write 场景下，并发达到 900 时 TPS 达到瓶颈 在测试 read write 场景时，当并发压测线程数为 900 时，v6.0.0 和 v5.1.4 的 TPS 不再增加，但是 latency 增加，像是某种资源达到了瓶颈导致的。经过分析得知：当 tidb-server 绑定到 numa node 之后，在并发 900 线程压测时，cpu 使用率就达到了整个服务器 cpu 资源的 25%，即到达一个 numa node 能使用的 cpu 资源的瓶颈了，此时，如果想获得更高的性能，提升 TPS，需要扩容 TiDB。这里有一个建议：在 OLTP 场景的压测下，要合理设计并发线程数，观察 TiDB CPU 资源使用率，尽量控制 TiDB CPU 使用率在 60% 以下。

- TPS 掉底 在测试 update non index  场景时，TPS 不稳定，出现掉底现象，经过分析，原因是当 TiKV 绑定到 NUMA node 之后，相应的 storage.block-cache.capacity 没调整，导致 TiKV 出现 OOM 。假设一个 numa node 绑定一个 TiKV 实例，则单个 TiKV 实例的  storage.block-cache.capacity 配置应当小于 (服务器总内存* 0.6) / numa node 个数，否则 TiKV 可能出现 OOM 问题，影响测试结果。
- raft store cpu 使用率高 v6.0.0 版本相比 v5.1.4 版本，raft store cpu 和 async apply cpu 的使用率要高点，建议线上使用时可以根据实际情况调整 raftstore.store-pool-size 和 raftstore.apply-pool-size 的个数，避免达到瓶颈，影响性能。

### 6.2 测试建议

- 强烈建议 TiDB、PD、TiKV 绑 Numa，压测期间遇到过不绑 Numa 和绑 Numa 相差 5 倍以上的 TPS，在相同并发压测线程数下。
- 注意分析监控、保留监控，便于对比分析性能瓶颈。
- 建议先看一遍本文参考文档中的几位大佬写的文章，受益匪浅。

## 7. 测试小结

| 测试场景              | v6.0.0 相比 v5.1.4 提升百分比 |
| --------------------- | ----------------------------- |
| oltp point select     | 5.06%                         |
| oltp update non index | 1.72%                         |
| oltp update index     | 4.50%                         |
| oltp read write       | 2.67%                         |

本次测试对比了 TiDB v6.0.0 和 v5.1.4 在 OLTP 场景下的 Sysbench 性能表现。结果显示，相比于 v5.1.4，v6.0.0 在  oltp_read_write、oltp_point_select、oltp_update_index 和 oltp_update_non_index 几种场景性能均有提升，具体内容可以参考上述表格，v6.0.0 版本还是很值得我们期待的。

本文主要测试了在相同硬件和配置下 v6.0.0 和 v5.1.4 的性能，不代表最佳性能实践和部署。

【参考文档】

https://cn.pingcap.com/zh/blog/database-performance-optimisation

https://tidb.net/blog/c2edb2e5
