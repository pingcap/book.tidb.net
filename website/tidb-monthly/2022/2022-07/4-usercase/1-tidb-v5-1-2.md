---
title: 麒麟v10上部署TiDBv5.1.2生产环境的最佳实践 - TiDB 社区技术月刊
sidebar_label: 麒麟v10上部署TiDBv5.1.2生产环境的最佳实践
hide_title: true
description: 本文主要介绍关于在麒麟v10上部署TiDBv5.1.2生产环境中需要注意的事项以及部署架构。
keywords: [TiDB, 生产环境, 麒麟v10, PoC, 海光 CPU, numa]
---

# 麒麟v10上部署TiDBv5.1.2生产环境的最佳实践

> **作者**：caiyfc

## 前言

笔者最近在一个银行项目中做 PoC 测试，由于客户选择了使用 TiDB 数据库，于是笔者在 TiDB 中选择了一个相对稳定并且 bug 较少的版本：TiDB v5.1.2。

虽然 bug 较少，但是在测试过程中，还是不可避免的发现了一些问题，并通过参数来调整解决。

经过 PoC 测试和方案的制定，就迎来了生产环境的部署。生产环境的部署就不像是部署测试环境那么简单了。测试环境还能“从简”出发，减少一些非必要的配置项的设置，比如 CPU 频率的 cpufreq 模块是否选用 performance 模式；存储介质的 I/O 调度器是否设置为 noop。但是在生产环境中，我们必须把所有优化项都设置好，哪怕只是优化一点点也不能放过。

本文会把项目中的部署架构以及生产环境中需要注意的事项都整理出来，给大家一些参考。

## 一、同城两中心部署

在项目中，客户对容灾要求较高，希望不管是哪个数据中心出现问题，TiDB 数据库都可以无需人工干预并且无缝切换到另一个中心，直接提供服务。根据官网，目前有两种方案：

1. 同城两中心自适应同步模式部署：在官网中的 [同城两中心自适应同步模式部署](https://docs.pingcap.com/zh/tidb/stable/two-data-centers-in-one-city-deployment) 文档中是实现不了的，因为从数据中心虽然有完整数据，但是需要人工介入才能让 TiDB 恢复并提供服务。
2. 两地三中心部署：[两地三中心部署](https://docs.pingcap.com/zh/tidb/stable/three-data-centers-in-two-cities-deployment) 虽然可以满足客户的需求，不管哪个数据中心出现问题，TiDB 集群都可以正常对外提供服务，但是这就必须有三个数据中心才能够满足条件。现实的情况是，客户只有两个数据中心，所以这个方案也不行。

最后，根据目前的情况，商量出来了一个方案：在两个数据中心部署两套 TiDB 集群，用 TiCDC 组件同步两个集群的数据。由于是两个不同的集群，万一主数据中心出现问题，也不会影响到从数据中心。利用 F5 负载均衡实现主数据中心故障后，自动切换到从数据中心，达到无需人工干预就可以无缝切换到从数据中心的需求。

![image-20220706150555738](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/rWnXGHjdsPYN4Kz-1657164163688.png)

## 二、环境检查

生产环境检查和测试环境检查就有很大的区别了，主要体现在检查项目变多和检查更加细节，本文只列举，除官方文档之外需要检查的部分：

### 1、物理机配置查看

主要是查看物理机配置是否与客户给的一致，包括 CPU （观察核数以及是否开启超线程），网卡（是否万兆网卡），硬盘（数据盘是否为 NVME SSD 磁盘）等等。并且需要确认 NVME 磁盘使用率不能超过 5%。这些配置一般都没啥问题，但是该检查还是得检查一下，万一出现配置不对的情况，这个锅我们不背！

### 2、网络环境检查

网络环境一定要检查！网络环境一定要检查！网络环境一定要检查！

重要的事情一定要多说几遍。生产环境中的网络一般很复杂，所以一定要检查集群中网络是否符合要求。如果网络不到万兆，或者网络波动很大，都会对 TiDB 集群产生不好的影响。

- 推荐服务器双网卡做 bond1(master-salve) 或多网卡 team0(activebackup)，保障网卡高可用
- 主机间网络延迟：同机房内网络 < 0.5ms，同城 <1.5ms，异地 <20ms
- 主机间网络吞吐流量：若网络间吞吐远低于万兆网(1GB/S)，沟通用户、协同排查
- 主机间防火墙策略：TiUP 及各个节点需要开放的端口需要一一排查是否开放

### 3、磁盘环境检查

磁盘除了要使用 NVME 和检查挂载方式以外，还需要检查磁盘 IO 是否达到 TiDB 集群的最低要求：

| **指标**                                  | **标准值**    |
| ----------------------------------------- | ------------- |
| 随机读测试 read iops                      | 不低于 40000  |
| 随机读与顺序写混合测试 read iops          | 不低于 10000  |
| 随机读与顺序写混合测试 write iops         | 不低于 10000  |
| 随机读与顺序写混合测试 read latency (ns)  | 不高于 250000 |
| 随机读与顺序写混合测试 write latency (ns) | 不高于 30000  |

测试方法：

```
# 测试脚本准备
wget http://download.pingcap.org/fio-3.8.tar.gz
tar -xzvf fio-3.8.tar.gz
cd fio-3.8
ls
fio  parse_fio_output.py
# 包含fio测试文件以及解析测试结果的python脚本
```

#### 1、随机读测试

随机读测试 read iops 不低于 40000

```
[root@tikv01 ~]# ./fio -ioengine=psync -bs=32k -fdatasync=1 -thread -rw=randread -size=10G -filename=fio_randread_test.txt -name='fio randread test' -iodepth=4 -runtime=60 -numjobs=4 -group_reporting --output-format=json --output=fio_randread_result.json
[root@tikv01 ~]# rm fio_randread_test.txt
[root@tikv01 ~]# python parse_fio_output.py --target='fio_randread_result.json' --read-iops
```

#### 2、随机读与顺序写混合测试

- 随机读与顺序写混合测试 read iops 不低于 10000
- 随机读与顺序写混合测试 write iops 不低于 10000

```
[root@tikv01 ~]# ./fio -ioengine=psync -bs=32k -fdatasync=1 -thread -rw=randrw -percentage_random=100,0 -size=10G -filename=fio_randread_write_test.txt -name='fio mixed randread and sequential write test' -iodepth=4 -runtime=60 -numjobs=4 -group_reporting --output-format=json --output=fio_randread_write_test.json
[root@tikv01 ~]# rm fio_randread_write_test.txt
[root@tikv01 ~]# python parse_fio_output.py --target='fio_randread_write_test.json' --read-iops
[root@tikv01 ~]# python parse_fio_output.py --target='fio_randread_write_test.json' --write-iops
```

- 随机读与顺序写混合测试 read latency (ns) 不高于 250000
- 随机读与顺序写混合测试 write latency (ns) 不高于 30000

```
[root@tikv01 ~]# ./fio -ioengine=psync -bs=32k -fdatasync=1 -thread -rw=randrw -percentage_random=100,0 -size=10G -filename=fio_randread_write_latency_test.txt -name='fio mixed randread and sequential write test' -iodepth=1 -runtime=60 -numjobs=1 -group_reporting --output-format=json --output=fio_randread_write_latency_test.json
[root@tikv01 ~]# rm fio_randread_write_latency_test.txt
[root@tikv01 ~]# python parse_fio_output.py --target='fio_randread_write_latency_test.json' --read-lat
[root@tikv01 ~]# python parse_fio_output.py --target='fio_randread_write_latency_test.json' --write-lat
```

### 4、关于配置互信

关于互信，这里的操作与官方文档稍有不同。为了避免人为配置互信出现问题，笔者在这一步只创建了 tidb 用户，并且按照官方文档赋予了最高权限，并没有手动去配置互信。笔者在最后的部署阶段，是默认用 tiup 自动去配置各个主机间的互信的，这一步不需要人为干预。

## 三、NUMA 绑核

这次是把 TiDB 集群部署在国产海光 CPU 上，所以一定需要用 numa 绑核才能发挥出完全的性能。为什么一定要绑定 numa 才能发挥出应有的性能呢？这个可以看看秦老师的一篇文章：

[专栏 - 单机 8 个 NUMA node 如何玩转 TiDB - AMD EPYC 服务器上的 TiDB 集群最优部署拓扑探索](https://tidb.net/blog/c2edb2e5)

关于 numa 绑核，笔者这次也是踩了坑。说说这是个什么坑吧，一句话概括就是，两个 NVME 硬盘都挂载到同一个物理 CPU 上了，而且想要挂载到不同的物理 CPU 上，条件还不允许。最优的情况是，两个 NVME 硬盘平均挂载到两个不同的物理 CPU 上，这样 CPU 去调用磁盘会更快。

为什么笔者的情况无法解决呢？因为物理机上有一个东西：背板。磁盘是先插到背板上的，由背板走线直接连接到不同的物理 CPU 上。但是背板是有不同型号的，笔者遇到的物理机背板只有两块，一块是只能插 sata 接口的，另一块是只能插 NVME 接口的，这种情况下，两块 NVME 只能插在同一个背板上，而背板只能连接到某一个物理 CPU 上，所以无法分开。所以，在前期规划部署的时候，这一点需要注意。

关于两块 NVME 连接到一个物理 CPU 的性能损耗，得到厂商回复：

> 连接到两块CPU和连接到一块CPU，访问延迟最多多了240纳秒，这240纳秒主要是CPU到CPU之间的访问延迟。

还有一个小坑要注意一下，麒麟v10是默认开启 numa 自动均衡的，所以一定要手动关闭：

```
sysctl -w kernel.numa_balancing=0
```

## 四、配置相关

目前来看，TiDB v5.1.2 的版本也算是有点老了，所以不可避免的还是有点小 bug 的，但是这些 bug 都可以根据参数的设置而避免。那么这个配置参数就非常重要了。根据 PoC 测试和从社区整理的拓扑配置最佳实践如下：

```log
server_configs:
    tidb:
      # 日志最大保留的天数
      log.file.max-days: 15
      # 日志的输出级别
      log.level: info
      # 最长的 SQL 输出长度
      log.query-log-max-len: 65536
      # 输出慢日志的耗时阈值
      log.slow-threshold: 300
      # 用于设置新建索引的长度限制
      max-index-length: 12288
      # 单条 SQL 语句可以占用的最大内存阈值
      mem-quota-query: 10737418240
      # 单条 SQL 超过内存限制时，取消执行该 SQL 操作
      oom-action: cancel
      # 在单个事务的提交阶段，用于执行提交操作相关请求的 goroutine 数量
      performance.committer-concurrency: 128
      # 关闭对查询收集统计信息反馈
      performance.feedback-probability: 0
      # 单个事务允许的最大语句条数限制
      performance.stmt-count-limit: 50000
      # 单个事务大小限制
      performance.txn-total-size-limit: 10737418240
      # 缓存语句的数量
      prepared-plan-cache.capacity: 100
      # 开启 prepare 语句的 plan cache
      prepared-plan-cache.enabled: true
      # 防止 prepare plan cache 的内存用量过大
      prepared-plan-cache.memory-guard-ratio: 0.1
      # 关闭批量发送 rpc 封包（解决 Compaction Filter GC 可能不删除 MVCC deletion 信息的问题，v5.1.3 修复）
      tikv-client.max-batch-size: 0
    tikv:
      # 关闭 GC in Compaction Filter 特性（解决 Compaction Filter GC 可能不删除 MVCC deletion 信息的问题，v5.1.3 修复）
      gc.enable-compaction-filter: false
      # 日志等级
      log-level: info
    tiflash:
      # 解决因大量 delete 导致 tiflash 无法使用的 bug
      profiles.default.dt_enable_skippable_place: 0
```

系统参数最佳实践如下：

```sql
# 统计信息版本设置
set global tidb_analyze_version=1;
# 关闭 Async Commit 特性
set global tidb_enable_async_commit=0; 
# 关闭一阶段提交特性
set global tidb_enable_1pc=0;
# 唯一索引的重复值检查不推迟到事务提交时进行
set global tidb_constraint_check_in_place = 1;
# 垃圾回收 (GC) 时保留数据的时限
Set global tidb_gc_life_time = '8h';
# sql mode设置
set global sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION';
```

笔者只写出了基本需要调整的参数，参数数值可以根据项目情况来更改。也可以增加一些笔者没写出来的参数并进行调整。

配置文件参数详情：[TiDB 配置文件描述](https://docs.pingcap.com/zh/tidb/v5.1/tidb-configuration-file) ，[TiKV 配置文件描述](https://docs.pingcap.com/zh/tidb/v5.1/tikv-configuration-file)，[PD 配置文件描述](https://docs.pingcap.com/zh/tidb/v5.1/pd-configuration-file)，[TiFlash 配置参数](https://docs.pingcap.com/zh/tidb/v5.1/tiflash-configuration)

系统变量参数详情：[系统变量](https://docs.pingcap.com/zh/tidb/v5.1/system-variables)

## 总结

1. 规划好一个最适合的架构，现有的方案都不满足需求的话，那就到社区找找有没有同样需求的小伙伴，一起讨论讨论。
2. 生产环境部署 TiDB 集群最重要的就是仔细。硬件和环境检查一定要全面，万一以后 TiDB 集群性能出现问题，也不至于说再去说是硬件或者是环境的锅。
3. numa 绑核要提前想好如何绑定，以及该如何规划磁盘的挂载。
4. 配置文件尽量避免现有版本 bug，根据项目情况设置好最优参数。