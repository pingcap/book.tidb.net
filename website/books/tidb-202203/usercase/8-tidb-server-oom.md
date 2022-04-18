# tidb server的oom问题优化探索

**作者：数据小黑**



# 概述

最近在做个“枯树逢春”项目，迁移saiku到tidb上。在这个过程中发现并优化了tidb server的oom问题。本文记录了整个oom问题的排查和解决过程。oom问题的解决在社区有一些实践论述了，本文中尝试利用cgroup控制资源和STRAIGHT_JOIN注解优化join顺序实践比较少，撰文共享出来，希望能帮助遇到类似问题的同学选择合适的解决方案。因行业特殊，表的实际表名做了隐藏和转化（转化成A,B,C），带来的阅读体验下降，敬请见谅。

# 问题发现

saiku是个早已经没有维护的项目，由于用户习惯的原因（主要是用户肯付费），现在需要寻找一个数据库能够支撑saiku大数据量的查询，由于成本原因，最好还是开源（免费）的。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316519832.png) 参考：https://github.com/OSBI/saiku

按照单表1.8亿的场景，断断续续测试过很多数据库：

1. Mysql，单表过大，查询时间长，超过用户可忍受范围
2. Mycat+Mysql，saiku的开发人员搞不定分表策略，我也不想搞
3. GreenPlum，saiku存在sql查分，拆分后的sql主要用来进行维度校验，整个查询过程对GP来说不友好，查询也很慢
4. ClickHouse，驱动问题，没有对接成功
5. TiDB，勉强可以，但是三表关联有oom风险

本文描述的就是迁移saiku到TiDB上时，遇到的oom问题，以及解决过程。 问题描述参考：[https://asktug.com/t/topic/574076](https://asktug.com/t/topic/574076/2) 简单描述就是，A，B，C三表关联，A表约2亿数据，按日分区，700+分区，应用触发形如下列查询时：

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

本次迁移中，TiDB部署架构如下： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316536748.png) nginx作为tidb的代理，应用连接nginx，代理到tidb上，tidb server可用资源是16C32G。 上述过程失败后查看了几个监控页面： dashboard->集群信息 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316553784.png) 发现TiDB在查询时全都重启过一遍。 grafana->Overview->TiDB->Memory Usage ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316563255.png)

三台tidb server都是打满机器内存后，断崖式下降，初步怀疑TiDB重启了。 查看三台机器的/var/log/messages,在对应的时间出现明显的oom-killer,主要信息如下：

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

以上日志说明，tidb被系统的oom-killer杀掉了，杀掉的原因是系统内存没有剩余了。 初步判断，TiDB发生oom问题了，继续排查发生的原因。 查看sql的执行计划： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316584094.png) A的扫描结果首先跟C做HashJoin，C做Build，A自拍Probe，然后A和C的结果与B做HashJoin，A和C的结果做build，B做Probe，怀疑，这个步骤出现问题，A和C的结果过大。 怀疑执行计划有问题，查看健康度: SHOW STATS_HEALTHY where Table_NAME = 'A'; ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316598504.png) 看到所有分区健康度都是100，但是注意那个178是个坑，后文详细分析。 由于这个问题，可以反复重现，多次执行相关SQL，并多次执行手动分析： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316611769.png) 直到tidb不能完成heap的分析为止，取最后一次成功的heap分析： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316624120.png)

```
github.com/pingcap/tidb/util/chunk.NewColumn (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/util/chunk/column.go:0)

> github.com/pingcap/tidb/util/chunk.New (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/util/chunk/chunk.go:0)

> github.com/pingcap/tidb/executor.(*HashJoinExec).fetchBuildSideRows (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/executor/join.go:0)

> github.com/pingcap/tidb/executor.(*HashJoinExec).fetchAndBuildHashTable.func2 (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/executor/join.go:0)

> github.com/pingcap/tidb/util.WithRecovery (/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/util/misc.go:0)
```

fetchAndBuildHashTable这个过程占用了绝大多数内存，跟上面的执行计划分析结果吻合，判断是第二步join中build端的表占用内存过大。

# 解决方案

saiku的特点是根据模型定义自动生成查询sql，所以saiku端完全避免这种sql产生不太现实，解决的思路还是从tidb端做一些优化，优化分为三个方向：

1. 优化，尝试调整join时build和probe两个端所对应数据集，节省内存使用，例如：调整join顺序
2. 转化，限制内存使用，或者转化引擎，让sql能够出来结果。例如：尝试调整内存参数、尝试使用TiFlash、尝试非分区表
3. 保护，限制资源占用，必要时牺牲掉其中一个tidb server，但不要影响混部的其他组件

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

调整完成之后，进行回归测试，并没有效果，内存的波动仍然出现三个尖峰，并发现了oom-killer。

## 尝试使用tiflash

考虑到tiflash对ap友好，并且mpp架构正好可以应对这种单节点内存不足的场景，于是部署了tiflash，并增加tiflash的副本：

```
ALTER TABLE `test`.`A` SET TIFLASH REPLICA 1;
```

查看同步状态：

```
SELECT * FROM information_schema.tiflash_replica WHERE TABLE_SCHEMA = 'test' and TABLE_NAME = 'A';
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316739772.png) 完成同步后进行回归测试，内存的波动仍然出现三个尖峰，并发现了oom-killer。 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316746618.png)

从执行计划上看，虽然取数据用了tiflash，但是并没有使用mpp模式，即使设置强制使用：

```
set @@session.tidb_allow_mpp=1;
set @@session.tidb_enforce_mpp=1;
```

也没有使用，查找官方文档找到原因： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316763047.png)

## 尝试非分区表

从前一个测试想到，如果非分区表，能否执行完成。 测试非分区表，因在上一步测试tiflash时，也同时为非分区表增加了tiflash副本，sql中增加注解：

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

注意的是，注解需要使用数据库名+表名昵称，例如，A1或者test.A1，在我的测试中都不生效，A在当前session指定的数据库为test的情况下才生效，为了避免不必要的麻烦，采用数据库名+表名昵称，例如test.A 执行计划如下： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316773175.png)

测试非分区表，使用tiflash，执行计划如下： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316778001.png)

此两种方案都能正常运行出结果，跟saiku的研发沟通后发现，非分区表虽然解决三表关联的问题，但普通的按日期的两表关联查询反而变慢，影响了大部分模型，非分区表的方案也不能采用。

## 尝试利用cgroup限制资源使用

在其他项目应用Trino时，出现过Trino混部影响其他组件的问题，当时是采用cgroup相关策略解决的，尝试在tidb server上应用。 其中的关键设置：

- memory.soft_limit_in_bytes:内存软限制，超过此设置会优先回收超过限额的进程占用的内存,使之向限定值靠拢
- memory.limit_in_bytes:内存硬限制，默认超过此设置会触发oom-killer
- memory.oom_control:超过内存硬限制时，系统策略，值为0，则触发oom-killer，值为1，则挂起当前进程，等待有足够的内存后，继续运行。

实测步骤： 准备工作：

```
yum install -y libcgroup-tools.x86_64 libcgroup
cgcreate -g memory:/tidb
```

### 方案1：限制内存使用

```
cgset -r memory.soft_limit_in_bytes=30064771072 /tidb
cgset -r memory.limit_in_bytes=32212254720 /tidb
cgclassify -g memory:/tidb `ps -ef | grep tidb-server | grep -v grep | awk '{printf $2FS}'`
```

此方案中memory.soft_limit_in_bytes限制为28G，memory.limit_in_bytes限制为30G， 实测28G没有效果，内存很快到达30G限制，触发oom-killer，messages显示类似以前的oom日志。

### 方案2：关闭oom-killer行为

```
cgset -r memory.limit_in_bytes=32212254720 /tidb
cgset -r memory.oom_control=1 /tidb
cgclassify -g memory:/tidb `ps -ef | grep tidb-server | grep -v grep | awk '{printf $2FS}'`
```

此方案中 memory.limit_in_bytes限制为30G，内存达到30G之后，tidb server夯住，没有反应，强行重启之后才能继续使用，如图：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316793144.png) ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316806080.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316828064.png)

由于我测试过程中，挂的是第一个tidb server，所以dashboard无反应，查看tidb server进程还存活，处于不可中断的休眠状态。

## 调整join顺序

上述方案都不能达到目的之后，想要从控制执行计划方向，寻找一些方案。经查找，STRAIGHT_JOIN可以达到优化join顺序的目的：

```
STRAIGHT_JOIN 会强制优化器按照 FROM 子句中所使用的表的顺序做联合查询。当优化器选择的 Join 顺序并不优秀时，你可以使用这个语法来加速查询的执行
```

参考：[https://docs.pingcap.com/zh/tidb/stable/sql-statement-select#%E8%AF%AD%E6%B3%95%E5%85%83%E7%B4%A0%E8%AF%B4%E6%98%8E](https://docs.pingcap.com/zh/tidb/stable/sql-statement-select#语法元素说明) saiku在组织sql的时候，也通常会把大表放到第一位，其他维度表依次关联，查看执行计划： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316862680.png) 按照优化后的顺序，A先和B进行join，结果做为probe端和C进行join，能够完成查询，耗时约2m，此方案可以作为一个备选方案。

## 健康度的误读

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316870943.png) 前

面这张图，查看健康度的时候，显示的条数只有178，分析时忽略了这个信息，在整个优化过程复盘过程中，发现了这个问题，猜测是这个表的analyze其实并没有完整执行过一次，导致表的统计信息中只收集了178个分区，这意味着执行计划很可能是不准的，花了一整晚的时间完整的执行了一次analyze：

```
ANALYZE TABLE test.A;
```

查看健康度： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316879265.png) 分区数

达到了732。 再次查看执行计划： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316922473.png) 符合预期，实际执行大约在2m8s，这个时间，基本上能够给用户方解释了。

# 总结

兜兜转转，此次的问题，仍然是个统计信息不准的问题，因为不熟悉分区表的统计信息记录方式，导致了开始的误判。因为正式环境需要混合部署： ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1647316942505.png)

经过此次测试，正式环境调整策略如下：

- 修改nginx配置

```
server {
    listen  4000;
    proxy_pass tidb;
    proxy_next_upstream off;
}
```

关闭nginx失败转移策略，前面表述中，之所以有三个尖峰，是因为nginx的请求失败转移策略，这个慢sql会依次访问所有tidb server，导致tidb server依次重启，整个tidb上的请求会全部失败一次，影响太大。

- 增加cgroup策略

```
cgset -r memory.limit_in_bytes=34359738368 /tidb
cgclassify -g memory:/tidb `ps -ef | grep tidb-server | grep -v grep | awk '{printf $2FS}'`
```

防止有统计信息不准的表，导致oom问题，影响到混合部署的其他组件，最差情况就是单个tidb server重启。

- 设置定时analyze计划

```
ANALYZE TABLE test.A PARTITION prt_20210101;
```

lighting在导数据之后，会有analyze的语句执行，但表比较大，重试三次都是失败。计划在每次导数据之后，定时设置一个analyze，对有变动的分区执行analyze。