---
title: 《TiDB 跨版本升级》 --流程概述 - TiDB 社区技术月刊
sidebar_label: 《TiDB 跨版本升级》 --流程概述
hide_title: true
description: 原集群版本过低，运维难度大，决定进行版本升级，经过测试发现，v5.3.0版本相对于v3.0.10版本性能有很大提升，决定将TiDB v3.0.10升级到TiDB v5.3.0。
keywords: [TiDB, 跨版本升级, TiDB v3.0.10, TiDB v5.3.0]
---

# 《TiDB跨版本升级》 --流程概述

> 作者：[Ming](https://tidb.net/u/Ming/answer)

## 升级背景

1. 原集群版本过低，运维难度大，决定进行版本升级
2. 经过测试发现，v5.3.0版本相对于v3.0.10版本性能有很大提升
3. 决定将TiDB v3.0.10升级到TiDB v5.3.0

## 升级方式

```markdown
本方案采用Dumpling+Lightning+TiDB Binlog的方式进行
```

> 【升级方式划分】 大体分为[停机升级](https://docs.pingcap.com/zh/tidb/stable/upgrade-tidb-using-tiup#停机升级) 与[不停机升级](https://docs.pingcap.com/zh/tidb/stable/upgrade-tidb-using-tiup#不停机升级)   根据字面意思理解，我们可以根据业务的要求来进行选择，如果业务允许进行停机升级，那相对来说我们选择停机升级 会更加的安全，快速，如果业务不允许停机的话我们主要选择就是不停机升级
>
> [不停机升级](https://docs.pingcap.com/zh/tidb/stable/upgrade-tidb-using-tiup#不停机升级) 根据官方文档来看，需要通过特定方式来进行滚动升级  滚动升级对于我们来说或许是一个很好的选择，但问题就是： 1、业务需求回滚，我们的回滚方案通常需要针对于全备+增量的方式来进行回滚，回滚进度较慢 2、因版本差距过大的话，连续进行滚动升级，不可控因素增多 3、老版本通常采用Ansible安装，又想让新版本适用tiup进行管理，操作起来较为复杂 #因为种种因素原因，最终决定采用Dumpling+Lightning+TiDB Binlog的方式，可以有效的规避一系列繁琐问题。

- 获取相关信息
- 创建TiDB v5.3.0的目标集群
- Dumpling对原集群进行数据导出
- Lightning对目标集群进行数据导入
- 启动Drainer进行增量同步
- sync-diff-inspector进行数据校验
- 搭建回滚链路
- 切换业务

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/%E8%B7%A8%E7%89%88%E6%9C%AC%E5%8D%87%E7%BA%A7-1661847901243.png)


## 详细过程

### 一、获取相关信息

```markdown
#针对兼容性问题，进行详细的调查与测试
当从一个早期的 TiDB 版本升级到 TiDB v5.3.0 时，如需了解所有中间版本对应的兼容性更改说明，请查看对应版本的 Release Notes。
```

### 二、搭建TiDB v5.3.0的目标集群

1、编辑拓扑文件topology.yaml

```markdown
#混合部署与跨机房部署见官方文档
tiup cluster template > topology.yaml

vim topology.yaml
#详细配置信息参考官方文档
```

2、部署TiDB集群

```markdown
#-p/-i 二选一
tiup cluster deploy cluster_name v5.3.0 ./topology.yaml --user root [-p] [-i /home/root/.ssh/gcp_rsa]
```

3、启动TiDB集群

```markdown
#新部署集群默认关闭状态，需要将其启动
tiup cluster start cluster_name
```

4、验证集群状态

```markdown
tiup cluster display cluster_name
```

### 三、Dumpling对原集群进行数据导出

```markdown
数据导出工具Dumpling可以把存储在TiDB/MySQL中的数据导出为SQL或这CSV格式，可以用于完成逻辑上的全量备份或者导出
#适用场景
1、导出数据量小
2、需要导出SQL语句或者CSV的场景，可以在异构数据库或者系统中进行迁移
3、对于导出效率要求不高，由于需要读取数据和转换，所以比起物理导出效率低下
#选择导出数据的一致性方式
flush    （执行时会出现一句 flush table with read olck）只能读不能写（锁全库）
snapshot （会获取指定时间戳的一致性快照并导出）
lock      （备份什么锁什么）
none      （数据穿越）不用
auto      （根据数据库不同选择方式，TiDB选择snapshot  Mysql会选择flush）
```

> 【注意事项】 1、确定原集群数据量大小，来判断导出数据所需要的磁盘大小，防止导出数据量过大导致磁盘容量不够报错 2、因为我们后续需要搭建Drainer进行增量同步，所以需要在导出之前进行Pump部署和开启Binlog 3、为确保导出数据的可用性，判断导入与导出时间，调长GC时间

1、编写Dumpling脚本

```markdown
vim dumpling.sh

#!/bin/bash
nohup ./dumpling -u  -P  -h  --filetype sql -t 8 -o /data/dumpling -r 200000 -F 256MiB > nohup_dumpling.out &
```

2、执行Dumpling脚本，并观察日志

```markdown
sh dumpling.sh
tail -50f nohup_dumpling.out
```

### 四、Lightning对目标集群进行数据导入

```markdown
TiDB Lightning是TiDB数据库的生态工具之一，可以将全量数据高速导入到TiDB集群中
#使用场景
大量新的数据需要迅速导入到TiDB数据库中
#Lightning流程
（1）启动Lightning，TiKV会切换到导入模式（他可以对写入进行优化，并且停止数据的压缩）
（2）建立schema和表 （就是连接到TiDB Server执行DDL语句，建立相关库和表）
（3）分割表 （将表分成一个一个的，做增量的并行导入，提高效率）
（4）读取SQL dump （并发的读取，给转化成键值对）
（5）写入本地临时存储文件 （将数据转换成TiDB想通的键值对，然后存储在本地TiKV文件中）
（6）导入数据到TiKV集群 （将数据加载到TiKV当中）

（7）检验分析
（8）导入完毕退出并且TiKV切换回普通模式
```

> 【注意事项】 1、注意sorted-kv-dir目录大小，防止导入时候磁盘空间不够 2、若 `tidb-lightning` 因不可恢复的错误而退出（例如数据出错），重启时不会使用断点，而是直接报错离开。为保证已导入的数据安全，这些错误必须先解决掉才能继续。使用 `tidb-lightning-ctl` 工具可以标示已经恢复 3、可以关注progress来查看剩余时间与导入效率

1、编辑Lightning配置文件

```markdown
vim lightning.toml
#详细配置文件查看官方文档
https://docs.pingcap.com/zh/tidb/v5.3/tidb-lightning-configuration
```

2、编辑执行Lightning脚本

```markdown
vim lightning.sh
#!/bin/bash
nohup ./tidb-lightning -config lightning.toml > nohup-lightning.out &
```

3、执行Lightning脚本并查看运行情况

```markdown
sh lightning.sh
tail -50f tidb-lightning.log
egrep "progress" lightning.log
```

### 五、启动Drainer进行增量同步

```markdown
TiDB Binlog工具可以收集TiDB数据库的日志（binlog），并且提供数据同步和准实时备份功能。
#TiDB Binlog流程
（1）PD获取上游数据库TiDB Server的binlog日志
（2）分散写入到Pump Cluster（里面有多个Pump组件）（它负责存储自己接收的binlog，并且按时间顺序进行排序）
（3）在由Drainer进行总排序（一个Drainer对应一个下游数据库或者存储日志或者Apache Karka）
#Pump组件用于实时记录上游数据库传过来的binlog
（1）多个Pump形成一个集群，可以水平扩容
（2）TiDB通过内置的Pump Client将Binlog分发到各个Pump
（3）Pump负责存储Binlog，并将Binlog按顺序提供给Drainer
#Drainer组件收集Pump组件发送过来的Binlog进行归并然后进行排序然后发送给下游数据库
（1）Drainer负责读取各个Pump的Binlog，归并排序后发送到下游
（2）Drainer支持relay log功能，通过relay log保证下游集群的一致性状态
（3）Drainer支持将Binlog同步到MySQL、TiDB、Kafka或者本地文件当中
#TiDB数据库的Binlog格式
（1）与MySQL Binlog的Row格式类似（按事务提交的顺序记录，并且只记增删改，记录每一行的改变）
（2）以每一行数据的变更为最小单位进行记录
（3）只有被提交的事务才会被记录，且记录的是完整事务
     在Binlog中会记录主键和开始的时间戳
     在Binlog中会记录提交的时间戳 
```

> 【注意事项】 1、在导出数据之前要部署好Pump组件和开启Binlog 2、commit_ts通过dumpling导出数据的目录的metadata获取 3、部署完毕查看Pump、Drainer运行状态和checkpoint

1、TiDB Binlog集群监控

**Pump状态**

| metric名称             | 说明                                                         |
| ---------------------- | ------------------------------------------------------------ |
| Storage Size           | 记录磁盘的总空间大小（capacity），以及可用磁盘空间大小（available） |
| Metadata               | 记录每个Pump的可删除binlog的最大TSO（gc_tso）,以及保存的binlog的最大的commit tso |
| Write Binlog QPS by ln | 每个Pump接收到的写binlog请求的QPS                            |
| Write Binlog Latency   | 记录每个Pump写binlog的延迟时间                               |
| Storage Write Binlog S | Pump写binlog数据的大小                                       |
| Storage Write Binlog L | Pump中的storage模块写binlog数据的延迟                        |
| Pump Storage Error By  | Pump遇到的error数量，按照error的类型进行统计                 |
| Query TiKV             | Pump通过TiKV查询事务状态的次数                               |

**Drainer状态**

| metric名称                        | 说明                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| Checkpoint TSO                    | Drainer已经同步到下游的binlog的最大TSO对应的时间，通过该指标估算同步延迟时间 |
| Pump Handle TSO                   | 记录Drainer从各个Pump获取到binlog的最大TSO对应的时间         |
| Pull Binlog QPS by Pump NodeID    | Drainer从每个Pump获取binlog的QPS                             |
| 95% Binlog Reach Duration By Pump | 记录binlog从写入Pump到被Drainer获取到这个过程的延迟时间      |
| Error By Type                     | Drainer遇到的error数量，按照error的类型进行统计              |
| SQL Query Time                    | Drainer在下游执行SQL的耗时                                   |
| Drainer Event                     | 各种类型event的数量，event包括（ddl，insert，delete，update，flush，savepoint） |
| Execute Time                      | 写入binlog到同步下游模块所消耗的时间                         |
| 95% Binlog Size                   | Drainer从各个Pump获取到binlog数据的大小                      |
| DDL job Cout                      | Drainer处理的DDL的数量                                       |
| Queue Size                        | Drainer内部工作队列大小                                      |

2、编辑Ansible集群文件inventory.ini文件

```markdown
#原端集群由Ansible完成
详细配置参数参考官方文档
https://docs.pingcap.com/zh/tidb/v3.0/deploy-tidb-binlog#%E7%AC%AC-3-%E6%AD%A5%E9%83%A8%E7%BD%B2-drainer
```

3、修改drainer.toml配置文件

```markdown
cd /home/tidb/tidb-ansible/conf &&
cp drainer.toml drainer_mysql_drainer.toml &&
vi drainer_mysql_drainer.toml
#配置文件名命名规则为 ，否则部署时无法找到自定义配置文件。 但是需要注意 v3.0.0，v3.0.1 的配置文件命名规则与其余版本略有不同，为别名_drainer.toml别名_drainer-cluster.toml
详细参数参考官方文档
https://docs.pingcap.com/zh/tidb/v3.0/deploy-tidb-binlog#%E7%AC%AC-3-%E6%AD%A5%E9%83%A8%E7%BD%B2-drainer
```

4、部署Drainer

```markdown
ansible-playbook deploy_drainer.yml
#单独创建部署文件的inventory.ini的需要-i指定
```

5、启动Drainer

```markdown
ansible-playbook start_drainer.yml
#单独创建部署文件的inventory.ini的需要-i指定
```

### 六、sync-diff-inspector进行数据校验

```markdown
sync-diff-inspector 是一个用于校验 MySQL／TiDB 中两份数据是否一致的工具。该工具提供了修复数据的功能（适用于修复少量不一致的数据）
#主要功能
1、对比表结构和数据
2、如果数据不一致，则生成用于修复数据的 SQL 语句
3、支持不同库名或表名的数据校验
4、支持分库分表场景下的数据校验
5、支持 TiDB 主从集群的数据校验
6、支持从 TiDB DM 拉取配置的数据校验
```

> 【注意事项】 1、个别数据类型目前不支持比对，需要过滤出来不可比对的列进行过滤掉并进行手工比对 2、对于 MySQL 和 TiDB 之间的数据同步不支持在线校验，需要保证上下游校验的表中没有数据写入，或者保证某个范围内的数据不再变更 3、支持对不包含主键或者唯一索引的表进行校验，但是如果数据不一致，生成的用于修复的 SQL 可能无法正确修复数据 4、snapshot配置通过checkpoint获得

1、获取ts-map

```markdown
select * from tidb_binlog.checkpoint;
```

2、编辑sync-diff-inspector

```markdown
vim sync-diff-inspector.toml
#详细配置参数参考官方文档
```

> - https://docs.pingcap.com/zh/tidb/v5.3/sync-diff-inspector-overview 

3、创建sync-diff-inspector启动脚本

```markdown
vim sync-diff-inspector.sh

#!/bin/bash
nohup ./sync-diff-inspector --config=./sync-diff-inspector.toml > nohup_sync-diff-inspector.out &
```

4、运行sync-diff-inspector脚本

```markdown
sh sync-diff-inspector.sh
```

### 七、搭建回滚链路

```markdown
回滚链路通过TiDB Binlog来完成
#反向搭建一套TiDB Binlog来完成业务的回滚
```

> 【注意事项】 1、回滚链路的Binlog与Pump需要在搭建集群时候同步搭建 2、只需要配置好Drainer扩容文件即可，需要回滚时在扩容上去

## 升级总结

```markdown
#相对于v3.0.10版本，v5.4.0版本性能上更加稳定，运维起来也更加方便
  针对于这种跨版本的数据库升级，我相信它会是一种操作比较多也是比较重要的项目。在这里只是简单的介绍了方法的流程与步骤
具体的操作执行，还需要自己进行相应的测试，毕竟对于我们来说，安全、稳定更为重要。
#有几个地方是我们需要值得注意的：
1、Dumpling导出数据之前一定要开启Pump和Drainer
2、Dumpling导出数据之前GC时间要进行调整
3、Lightning导入数据会有部分由于版本差距过大导致的不兼容问题，尽量提前测试提前进行避免
4、sync-diff-inspector数据校验，针对于不支持的列提前找出并过滤，进行手工比对
5、记着获取原集群的用户信息导入到目标集群
6、回滚链路只需要配置好文件在切换业务时候扩容即可
7、需求回滚之时把原业务反向切换
```