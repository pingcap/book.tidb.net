---
title: TiDB Server 的 OOM 问题优化探索
hide_title: true
---

# tidb server 的 oom 问题优化探索

**作者：数据小黑**

# 概述

最近在做个“枯树逢春”项目，迁移 saiku 到 tidb 上。在这个过程中发现并优化了 tidb server 的 oom 问题。本文记录了整个 oom 问题的排查和解决过程。oom 问题的解决在社区有一些实践论述了，本文中尝试利用 cgroup 控制资源和 STRAIGHT_JOIN 注解优化 join 顺序实践比较少，撰文共享出来，希望能帮助遇到类似问题的同学选择合适的解决方案。因行业特殊，表的实际表名做了隐藏和转化（转化成 A,B,C），带来的阅读体验下降，敬请见谅。

# 问题发现

saiku 是个早已经没有维护的项目，由于用户习惯的原因（主要是用户肯付费），现在需要寻找一个数据库能够支撑 saiku 大数据量的查询，由于成本原因，最好还是开源（免费）的。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316519832.png) 参考：https://github.com/OSBI/saiku

按照单表 1.8 亿的场景，断断续续测试过很多数据库：

1. Mysql，单表过大，查询时间长，超过用户可忍受范围
2. Mycat+Mysql，saiku 的开发人员搞不定分表策略，我也不想搞
3. GreenPlum，saiku 存在 sql 查分，拆分后的 sql 主要用来进行维度校验，整个查询过程对 GP 来说不友好，查询也很慢
4. ClickHouse，驱动问题，没有对接成功
5. TiDB，勉强可以，但是三表关联有 oom 风险

本文描述的就是迁移 saiku 到 TiDB 上时，遇到的 oom 问题，以及解决过程。 问题描述参考：[https://asktug.com/t/topic/574076](https://asktug.com/t/topic/574076/2) 简单描述就是，A，B，C 三表关联，A 表约 2 亿数据，按日分区，700+分区，应用触发形如下列查询时：

```
select
    `B`.`code` as `c0`,
    `C`.`br_name` as `c1`,
    sum(`A`.`ss_num`) as `m0`,
    sum(`A`.`a_ss_num`) as `m1`,
    sum(`A`.`cb_num`) as `m2`
from
    `test`.`A2` as `A`,
    `test`.`B` as `B`,
    `test`.`C` as `C`
where
    `B`.`code` = '1010'
and
    `A`.`s_id` = `B`.`s_id`
and
    `A`.`b_code` = `C`.`b_code`
group by
    `B`.`code`,
    `C`.`br_name`;
```

此时客户端返回：

```
The last packet successfully received from the server was 86,645 milliseconds ago.  The last packet sent successfully to the server was 86,645 milliseconds ago.
```

# 排查过程

本次迁移中，TiDB 部署架构如下： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316536748.png) nginx 作为 tidb 的代理，应用连接 nginx，代理到 tidb 上，tidb server 可用资源是 16C32G。 上述过程失败后查看了几个监控页面： dashboard->集群信息 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316553784.png) 发现 TiDB 在查询时全都重启过一遍。 grafana->Overview->TiDB->Memory Usage ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316563255.png)

三台 tidb server 都是打满机器内存后，断崖式下降，初步怀疑 TiDB 重启了。 查看三台机器的/var/log/messages,在对应的时间出现明显的 oom-killer,主要信息如下：

```
Mar 14 16:55:03 localhost kernel: tidb-server invoked oom-killer: gfp_mask=0x201da, order=0, oom_score_adj=0
Mar 14 16:55:03 localhost kernel: tidb-server cpuset=/ mems_allowed=0
Mar 14 16:55:03 localhost kernel: CPU: 14 PID: 21966 Comm: tidb-server Kdump: loaded Not tainted 3.10.0-1160.el7.x86_64 #1
Mar 14 16:55:03 localhost kernel: Hardware name: QEMU Standard PC (i440FX + PIIX, 1996), BIOS rel-1.14.0-0-g155821a1990b-prebuilt.qemu.org 04/01/2014
......
Mar 14 16:55:03 localhost kernel: Out of memory: Kill process 21945 (tidb-server) score 956 or sacrifice child
Mar 14 16:55:03 localhost kernel: Killed process 21945 (tidb-server), UID 1000, total-vm:33027492kB, anon-rss:31303276kB, file-rss:0kB, shmem-rss:0kB
Mar 14 16:55:07 localhost systemd: tidb-4000.service: main process exited, code=killed, status=9/KILL
Mar 14 16:55:07 localhost systemd: Unit tidb-4000.service entered failed state.
Mar 14 16:55:07 localhost systemd: tidb-4000.service failed.
Mar 14 16:55:22 localhost systemd: tidb-4000.service holdoff time over, scheduling restart.
Mar 14 16:55:22 localhost systemd: Stopped tidb service.
Mar 14 16:55:22 localhost systemd: Started tidb service.
Mar 14 16:55:26 localhost run_tidb.sh: [2022/03/14 16:55:26.327 +08:00] [INFO] [cpuprofile.go:111] ["parallel cpu profiler started"]
Mar 14 17:01:03 localhost systemd: Started Session 1108 of user root.
Mar 14 17:18:44 localhost systemd-logind: New session 1109 of user root.
Mar 14 17:18:44 localhost systemd: Started Session 1109 of user root.
```

以上日志说明，tidb 被系统的 oom-killer 杀掉了，杀掉的原因是系统内存没有剩余了。 初步判断，TiDB 发生 oom 问题了，继续排查发生的原因。 查看 sql 的执行计划： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316584094.png) A 的扫描结果首先跟 C 做 HashJoin，C 做 Build，A 自拍 Probe，然后 A 和 C 的结果与 B 做 HashJoin，A 和 C 的结果做 build，B 做 Probe，怀疑，这个步骤出现问题，A 和 C 的结果过大。 怀疑执行计划有问题，查看健康度: SHOW STATS_HEALTHY where Table_NAME = 'A'; ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316598504.png) 看到所有分区健康度都是 100，但是注意那个 178 是个坑，后文详细分析。 由于这个问题，可以反复重现，多次执行相关 SQL，并多次执行手动分析： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316611769.png) 直到 tidb 不能完成 heap 的分析为止，取最后一次成功的 heap 分析： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316624120.png)

```
github.com/pingcap/tidb/util/chunk.NewColumn (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/util/chunk/column.go:0)

> github.com/pingcap/tidb/util/chunk.New (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/util/chunk/chunk.go:0)

> github.com/pingcap/tidb/executor.(*HashJoinExec).fetchBuildSideRows (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/executor/join.go:0)

> github.com/pingcap/tidb/executor.(*HashJoinExec).fetchAndBuildHashTable.func2 (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/executor/join.go:0)

> github.com/pingcap/tidb/util.WithRecovery (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/util/misc.go:0)
```

fetchAndBuildHashTable 这个过程占用了绝大多数内存，跟上面的执行计划分析结果吻合，判断是第二步 join 中 build 端的表占用内存过大。

# 解决方案

saiku 的特点是根据模型定义自动生成查询 sql，所以 saiku 端完全避免这种 sql 产生不太现实，解决的思路还是从 tidb 端做一些优化，优化分为三个方向：

1. 优化，尝试调整 join 时 build 和 probe 两个端所对应数据集，节省内存使用，例如：调整 join 顺序
2. 转化，限制内存使用，或者转化引擎，让 sql 能够出来结果。例如：尝试调整内存参数、尝试使用 TiFlash、尝试非分区表
3. 保护，限制资源占用，必要时牺牲掉其中一个 tidb server，但不要影响混部的其他组件

解决方案的描述按照解决问题时尝试的顺序编写，并不按照以上分类顺序。

## 尝试调整内存参数

首先尝试调整了内存的相关参数：

```
server_configs:
  tidb:
    enable-batch-dml: true
    mem-quota-query: 4294967296
    performance.server-memory-quota: 30064771072
    performance.txn-total-size-limit: 1073741824s
```

调整完成之后，进行回归测试，并没有效果，内存的波动仍然出现三个尖峰，并发现了 oom-killer。

## 尝试使用 tiflash

考虑到 tiflash 对 ap 友好，并且 mpp 架构正好可以应对这种单节点内存不足的场景，于是部署了 tiflash，并增加 tiflash 的副本：

```
ALTER TABLE `test`.`A` SET TIFLASH REPLICA 1;
```

查看同步状态：

```
SELECT * FROM information_schema.tiflash_replica WHERE TABLE_SCHEMA = 'test' and TABLE_NAME = 'A';
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316739772.png) 完成同步后进行回归测试，内存的波动仍然出现三个尖峰，并发现了 oom-killer。 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316746618.png)

从执行计划上看，虽然取数据用了 tiflash，但是并没有使用 mpp 模式，即使设置强制使用：

```
set @@session.tidb_allow_mpp=1;
set @@session.tidb_enforce_mpp=1;
```

也没有使用，查找官方文档找到原因： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316763047.png)

## 尝试非分区表

从前一个测试想到，如果非分区表，能否执行完成。 测试非分区表，因在上一步测试 tiflash 时，也同时为非分区表增加了 tiflash 副本，sql 中增加注解：

```
select
    /*+ read_from_storage(tikv[test.A]) */
    `B`.`code` as `c0`,
    `C`.`br_name` as `c1`,
    sum(`A`.`ss_num`) as `m0`,
    sum(`A`.`a_ss_num`) as `m1`,
    sum(`A`.`cb_num`) as `m2`
from
    `test`.`A1` as `A`,
    `test`.`B` as `B`,
    `test`.`C` as `C`
where
    `B`.`code` = '1010'
and
    `A`.`s_id` = `B`.`s_id`
and
    `A`.`b_code` = `C`.`b_code`
group by
    `B`.`code`,
    `C`.`br_name`;
```

注意的是，注解需要使用数据库名+表名昵称，例如，A1 或者 test.A1，在我的测试中都不生效，A 在当前 session 指定的数据库为 test 的情况下才生效，为了避免不必要的麻烦，采用数据库名+表名昵称，例如 test.A 执行计划如下： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316773175.png)

测试非分区表，使用 tiflash，执行计划如下： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316778001.png)

此两种方案都能正常运行出结果，跟 saiku 的研发沟通后发现，非分区表虽然解决三表关联的问题，但普通的按日期的两表关联查询反而变慢，影响了大部分模型，非分区表的方案也不能采用。

## 尝试利用 cgroup 限制资源使用

在其他项目应用 Trino 时，出现过 Trino 混部影响其他组件的问题，当时是采用 cgroup 相关策略解决的，尝试在 tidb server 上应用。 其中的关键设置：

- memory.soft_limit_in_bytes:内存软限制，超过此设置会优先回收超过限额的进程占用的内存,使之向限定值靠拢
- memory.limit_in_bytes:内存硬限制，默认超过此设置会触发 oom-killer
- memory.oom_control:超过内存硬限制时，系统策略，值为 0，则触发 oom-killer，值为 1，则挂起当前进程，等待有足够的内存后，继续运行。

实测步骤： 准备工作：

```
yum install -y libcgroup-tools.x86_64 libcgroup
cgcreate -g memory:/tidb
```

### 方案 1：限制内存使用

```
cgset -r memory.soft_limit_in_bytes=30064771072 /tidb
cgset -r memory.limit_in_bytes=32212254720 /tidb
cgclassify -g memory:/tidb `ps -ef | grep tidb-server | grep -v grep | awk '{printf $2FS}'`
```

此方案中 memory.soft_limit_in_bytes 限制为 28G，memory.limit_in_bytes 限制为 30G， 实测 28G 没有效果，内存很快到达 30G 限制，触发 oom-killer，messages 显示类似以前的 oom 日志。

### 方案 2：关闭 oom-killer 行为

```
cgset -r memory.limit_in_bytes=32212254720 /tidb
cgset -r memory.oom_control=1 /tidb
cgclassify -g memory:/tidb `ps -ef | grep tidb-server | grep -v grep | awk '{printf $2FS}'`
```

此方案中 memory.limit_in_bytes 限制为 30G，内存达到 30G 之后，tidb server 夯住，没有反应，强行重启之后才能继续使用，如图：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316793144.png) ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316806080.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316828064.png)

由于我测试过程中，挂的是第一个 tidb server，所以 dashboard 无反应，查看 tidb server 进程还存活，处于不可中断的休眠状态。

## 调整 join 顺序

上述方案都不能达到目的之后，想要从控制执行计划方向，寻找一些方案。经查找，STRAIGHT_JOIN 可以达到优化 join 顺序的目的：

```
STRAIGHT_JOIN 会强制优化器按照 FROM 子句中所使用的表的顺序做联合查询。当优化器选择的 Join 顺序并不优秀时，你可以使用这个语法来加速查询的执行
```

参考：[https://docs.pingcap.com/zh/tidb/stable/sql-statement-select#%E8%AF%AD%E6%B3%95%E5%85%83%E7%B4%A0%E8%AF%B4%E6%98%8E](https://docs.pingcap.com/zh/tidb/stable/sql-statement-select#语法元素说明) saiku 在组织 sql 的时候，也通常会把大表放到第一位，其他维度表依次关联，查看执行计划： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316862680.png) 按照优化后的顺序，A 先和 B 进行 join，结果做为 probe 端和 C 进行 join，能够完成查询，耗时约 2m，此方案可以作为一个备选方案。

## 健康度的误读

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316870943.png) 前

面这张图，查看健康度的时候，显示的条数只有 178，分析时忽略了这个信息，在整个优化过程复盘过程中，发现了这个问题，猜测是这个表的 analyze 其实并没有完整执行过一次，导致表的统计信息中只收集了 178 个分区，这意味着执行计划很可能是不准的，花了一整晚的时间完整的执行了一次 analyze：

```
ANALYZE TABLE test.A;
```

查看健康度： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316879265.png) 分区数

达到了 732。 再次查看执行计划： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316922473.png) 符合预期，实际执行大约在 2m8s，这个时间，基本上能够给用户方解释了。

# 总结

兜兜转转，此次的问题，仍然是个统计信息不准的问题，因为不熟悉分区表的统计信息记录方式，导致了开始的误判。因为正式环境需要混合部署： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316942505.png)

经过此次测试，正式环境调整策略如下：

- 修改 nginx 配置

```
server {
    listen  4000;
    proxy_pass tidb;
    proxy_next_upstream off;
}
```

关闭 nginx 失败转移策略，前面表述中，之所以有三个尖峰，是因为 nginx 的请求失败转移策略，这个慢 sql 会依次访问所有 tidb server，导致 tidb server 依次重启，整个 tidb 上的请求会全部失败一次，影响太大。

- 增加 cgroup 策略

```
cgset -r memory.limit_in_bytes=34359738368 /tidb
cgclassify -g memory:/tidb `ps -ef | grep tidb-server | grep -v grep | awk '{printf $2FS}'`
```

防止有统计信息不准的表，导致 oom 问题，影响到混合部署的其他组件，最差情况就是单个 tidb server 重启。

- 设置定时 analyze 计划

```
ANALYZE TABLE test.A PARTITION prt_20210101;
```

Lightning 在导数据之后，会有 analyze 的语句执行，但表比较大，重试三次都是失败。计划在每次导数据之后，定时设置一个 analyze，对有变动的分区执行 analyze。
