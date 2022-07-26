---
title: TiKV 节点重启后业务恢复速度（leader 平衡速度）v6.0 vs v5.1.2 对比测试
hide_title: true
---

# TiKV 节点重启后业务恢复速度（leader 平衡速度）v6.0 vs v5.1.2 对比测试

作者: 杨端端，开发，获得 PCTP，TiDB-Contributor，关注 TiDB 社区。

## 1. 目标:

对比 TiDB  v6.0 与 v5.1.2  中 TiKV 节点重启后 leader 平衡加速，提升业务恢复速度。

## 2. 硬件配置:

| 角色    | CPU/ 内存/ 硬盘           |      |
| ------- | ------------------------- | ---- |
| TiDB&PD | 16 核/ 16G 内存/ SSD 200G | 3 台 |
| TiKV    | 16 核/ 32G 内存/ SSD 500G | 3 台 |
| Monitor | 16 核/ 16G 内存/ SSD 50G  | 1 台 |

## 3. 拓扑文件配置

###   TiDB v5.1.2 拓扑文件参数配置

```
server_configs:
  pd:
    replication.enable-placement-rules: true
  tikv:
    server.grpc-concurrency: 8
    server.enable-request-batch: false
    storage.scheduler-worker-pool-size: 8
    raftstore.store-pool-size: 5
    raftstore.apply-pool-size: 5
    rocksdb.max-background-jobs: 12
    raftdb.max-background-jobs: 12
    rocksdb.defaultcf.compression-per-level: ["no","no","zstd","zstd","zstd","zstd","zstd"]
    raftdb.defaultcf.compression-per-level: ["no","no","zstd","zstd","zstd","zstd","zstd"]
    rocksdb.defaultcf.block-cache-size: 12GB
    raftdb.defaultcf.block-cache-size: 2GB
    rocksdb.writecf.block-cache-size: 6GB
    readpool.unified.min-thread-count: 8
    readpool.unified.max-thread-count: 16
    readpool.storage.normal-concurrency: 12
    raftdb.allow-concurrent-memtable-write: true
    pessimistic-txn.pipelined: true
  tidb:
    prepared-plan-cache.enabled: true
    tikv-client.max-batch-wait-time: 2000000
```

### TiDB v6.0 拓扑文件参数配置

只比 TiDB v5.1.2 拓扑文件中多了 tikv : storage.reserve-space: 0MB 的参数配置，可以忽略这个参数的设置，这是一个BUG，后续官方会修复，如果您使用时没有出现这个BUG就不用设置，官方可能已修复,如果想看为什么要设置 storage.reserve-space: 0MB 的详情，请看 [asktug 问题帖](https://asktug.com/t/topic/665348)。

## 4. TiUP 部署 TiDB v5.1.2 和 TiDB v6.0.0

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-20220509234811503-1652885902882.png)

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-20220517223503425-1652885995958.png)


## 5. 测试TiKV 节点重启后 leader 平衡时间方法

给集群 TiDB v5.1.2 和 TiDB v6.0 插入不同数据（分别是 100万, 400万, 700万, 1000万），并查看 TiKV  节点重启后 leader 平衡时间：

1. 使用 sysbench 工具给集群插入数据,样例如下：

```
sysbench oltp_common \
    --threads=16 \
    --rand-type=uniform \
    --db-driver=mysql \
    --mysql-db=sbtest \
    --mysql-host=$host \
    --mysql-port=$port \
    --mysql-user=root \
    --mysql-password=password \
    prepare --tables=16 --table-size=10000000
```

2. 可通过以下这种方式查询 sbtest 数据库中 16 张表的数据统计,样例如下：

```
select
(select count(1) from sbtest1)  "sbtest1",
(select count(1) from sbtest2)  "sbtest2",
(select count(1) from sbtest3)  "sbtest3",
(select count(1) from sbtest4)  "sbtest4",
(select count(1) from sbtest5)  "sbtest5",
(select count(1) from sbtest6)  "sbtest6",
(select count(1) from sbtest7)  "sbtest7",
(select count(1) from sbtest8)  "sbtest8",
(select count(1) from sbtest9)  "sbtest9",
(select count(1) from sbtest10)  "sbtest10",
(select count(1) from sbtest11)  "sbtest11",
(select count(1) from sbtest12)  "sbtest12",
(select count(1) from sbtest13)  "sbtest13",
(select count(1) from sbtest14)  "sbtest14",
(select count(1) from sbtest15)  "sbtest15",
(select count(1) from sbtest16)  "sbtest16"
FROM  dual
```

3. 等待数据插入完成后，查看 Grafana 监控，所需要监控图表路径是:  PD -> Statistics-balance -> Store leader count，等待各个 TiKV leader 平均后，重启其中一台 TiKV，通过 Grafana 监控图表中 Store leader count表格看 leader 平衡时间，如下图:

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655133225848.png)﻿﻿

横坐标代表时间，纵坐标是leader的个数，不同颜色的线代表不同的tikv实例。

```
注:
tikv 是作为一个进程服务在节点上,所以可以通过 systemctl 管理 tikv 服务的启动、重启、停止、重载、查看状态命令；
标题中的重启可以通过 systemctl stop tikv-20160.service 和 systemctl start tikv-20160.service 模拟实现。
```

## 6. 测试结果

### 对比数据图

 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654686734357.png)﻿ 

从表中对比数据得到:

1. 从表格的数据看到 TiDB v6.0 TiKV 节点重启后 leader 平衡时间是 30s 的时间，比 TiDB v5.1.2 多了不少，TiDB v5.1.2  30s 出现了3次，TiDB v6.0 30s 出现了 7 次 ；
2. 从表格的数据看到 TiDB v6.0 TiKV 节点重启后 leader 平衡时间 没有出现 360s，少有出现90s的时间；

3. 从表中的数据看到: TiDB v6.0 TiKV 节点重启后，不管数据多少，基本时间都是 30s 就完成了 leader 平衡（包括 30s 后少量调整的数据)。

4. 从表中也可以看到 TiDB v6.0 leader 平衡完了后，也会出现少量 leader 调整,这种情况少有。

5. TiDB v6.0 TiKV关闭后，leader 平衡时间基本上与 TiDB v5.1.2 没 变化。


以上TiDB v5.1.2 与 TiDB v6.0.0 TiKV 节点重启后 leader 平衡加速, 提升业务恢复速度的对比,是没有修改`balance-leader-scheduler` 策略的情况下做的,可以看到默认情况下是有提升的,如想要获取更大的加速效果,请按以下操作:

1.通过 PD Control 调整集群参数。

2.`scheduler config balance-leader-scheduler`介绍

用于查看和控制 `balance-leader-scheduler` 策略。

从 TiDB v6.0.0 起，PD 为 `balance-leader-scheduler` 引入了 `Batch` 参数，用于控制 balance-leader 执行任务的速度。你可以通过 pd-ctl 修改 `balance-leader batch` 配置项设置该功能。

在 v6.0.0 前，PD 不带有该配置（即 `balance-leader batch=1`）。在 v6.0.0 或更高版本中，`balance-leader batch` 的默认值为 `4`。如果你想为该配置项设置大于 `4` 的值，你需要同时调大 [`scheduler-max-waiting-operator`](https://docs.pingcap.com/zh/tidb/v6.0/pd-control#config-show--set-option-value--placement-rules)（默认值 `5`）。同时调大两个配置项后，你才能体验预期的加速效果。

```
>> scheduler config balance-leader-scheduler set batch 3  // 将 balance-leader 调度器可以批量执行的算子大小设置为 3
```

参考文档：https://docs.pingcap.com/zh/tidb/v6.0/pd-control#scheduler-config-balance-leader-scheduler
