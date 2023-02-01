---
title: TiDB 数据冷热存储分离测试 - TiDB 社区技术月刊
sidebar_label: TiDB 数据冷热存储分离测试
hide_title: true
description: 对于有些历史数据可能业务使用很少且不适合进行应用改造的情况下就需要将历史数据和近期的业务数据保存在同一库中。这样就会形成了一个数据库内既有近期经常使用的热数据和长期很少使用的冷数据，对于冷的数据适合使用大容量的SAS磁盘进行存储，以降低系统成本。本文将对 TiDB 冷热存储分离进行实现。
keywords: [TiDB, 冷热存储分离, 数据, 测试, 实践]
---

# TiDB 数据冷热存储分离测试

> 作者：[h5n1](https://tidb.net/u/h5n1/answer)

## 1 前言

随着业务的发展累积的历史数据越来越多，对于常用业务范围外的历史数据查询很少 ，有些历史数据可以通过归档到其他数据库方式进行解决，在不改造现有业务的前提下，维护人员可通过查询归档库解决。但是对于有些历史数据可能业务使用很少且不适合进行应用改造的情况下就需要将历史数据和近期的业务数据保存在同一库中。这样就会形成了一个数据库内既有近期经常使用的热数据和长期很少使用的冷数据，对于冷的数据适合使用大容量的SAS磁盘进行存储，以降低系统成本。

## 2 TiDB 冷热存储分离实现

TiDB 4.0版本开始推出Placement Rule(放置规则)功能，是用于控制region副本调度的一套规则系统，通过Placement Rule可以控制某段连续数据的副本数、位置、region类型等，以满足不同的数据分布需求。Placement Rules配置使用pd-ctl工具较为复杂、友好性较差，因此从5.3版本开始支持Placement Rules in SQL功能，即通过一条SQL命令即可定义库、表、分区不同级的数据放置规则，比如在create table时指定表的放置规则、使用alter table 改变表的放置规则等。

TiDB 支持tikv存储节点label标签设置，通过多级label可以实现不同级别的region副本隔离，以保证数据的安全性，比如保证同一region不同副本在不同的数据中心、机房、机架或服务器上。TiDB的冷热存储方案就是利用每个tikv存储节点设置不同的label标签实现，通过Placement Rules in SQL 功能来进行自定义的数据放置。

冷热存储分离实际使用时常见的有以下2种方式:

（1）直接使用alter命令将历史表或分区(比如按天建立) 迁移到冷数据存储节点。

（2）历史表数据直接建立在冷数据存储节点，根据业务规则将历史数据从生产表写入历史表。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884721582.png) 

## 3 冷热分离配置

本环境中使用3台物理机，数据库版本v6.2.0，每台物理上配置2个tikv实例，共6个实例，分别使用2块不同的磁盘(sdb和sdc)分别模拟SSD和HDD磁盘。使用{city、host、disk} 3级标签，设置使用sdb磁盘的tikv实例disk: ssd标签(对应端口20162),表示使用高性能SSD磁盘。设置使用sdc磁盘的tikv实例disk: hdd标签(对应端口20163)，表示使用普通HDD磁盘。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884754502.png)

使用下面的命令创建2条数据放置策略用于在不同的磁盘上存储不同的数据， onssd策略:所有的数据副本存储到disk标签为ssd的tikv，onhdd策略:所有的数据副本存储到disk标签为hdd的tikv。

```markdown
    CREATE PLACEMENT POLICY  onssd CONSTRAINTS="[+disk=ssd]";
```

```markdown
    CREATE PLACEMENT POLICY  onhdd CONSTRAINTS="[+disk=hdd]";
```

放置策略创建完成后就可以在库、表、分区级设置放置策略。

```markdown
    Alter  table test PLACEMENT POLICY = onssd;
```

也可以在建表时直接指定表的放置策略。

```markdown
    Create table test (id bigint auto_increment  primary key, name varchar(10)) PLACEMENT POLICY = onssd;
```

## 4 冷热分离测试

### 4.1 冷热资源隔离

- **测试内容**

使用sysbench初始化了3张10亿条记录的表，之后调整表的放置策略为onssd，数据应仅存在指定的tikv节点，不会被调度到其他tikv节点。使用sysbench进行128线程读写压测，应仅有3个tikv的CPU、IO出现增高的情况，另外3个tikv保持很低的利用率。

- **测试结果**

使用show placment命令查看目前放置策略，此时放置策略调度状态为SCHEDULED，表示已经完成调度。完成调度后可以看到3张表的region全部在3个ssd磁盘tikv上。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884769924.png)

3张表的region peer在tikv节点的具体分布数量如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884779351.png)

通过监控页面也可以看到目前的region分布情况：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884792561.png)

通过监控可以看到压测期间仅使用ssd磁盘的tikv实例的CPU、IO利用率有增高而HDD磁盘几乎无压力，说明通过设置数据放置策略能够很好的实现资源隔离，相互之间无影响。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884810419.png)

### 4.2    冷热数据迁移

- **测试内容**

使用alter命令更改3张表的存储策略为onhdd，模拟整表冷数据迁移到hdd磁盘过程，迁移完成后原ssd存储上的数据副本数量应为0。

- **测试结果**

通过SQL命令更改数据放置位置为HDD盘后，数据开始进行调度往hdd盘上迁移，调度状态为INPROGRESS，表示调度正在进行。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884829048.png)

通过region监控可以看到整个迁移过程

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884841148.png)

完成调度后各节点数据副本数量

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884849987.png)

### 4.3  region优化测试

TiDB 将数据以range范围方式划分成多个region ，每个region默认96M，通过负载均衡策略在tikv节点点均衡region分布,region间和PD控制节点保持心跳，当数据量很大时大量的心跳请求可能会对PD造成压力。开启静默region特性后降低心跳数量，减少压力。除此之外还可以通过增大region大小，减少region数量从而减少心跳数量。

- **测试内容**

3个tikv实例使用144M region-max-size，另外3个tikv实例使用384M region-max-size，分别使用sysbench初始化10张1亿的表，每种region size配置下使用128线程连续3次进行多种类型测试，每种类型压测20分钟，检查TPS和平均延时是否有明显降低。调整的参数如下：

coprocessor.region-max-size: 384MB，region的最大大小。

coprocessor.region-max-keys: 3839999，region的最大key数量，以默认数量为基础，按照设置最大region\_size和默认region\_size的比例计算。

coprocessor.region-split-size: 256MB，region 分裂后默认大小。

raftstore.region-split-check-diff: 32MB，触发region 分裂检查的写入阈值。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884862690.png)

- **测试结果**

不同max-region-size下的region数量如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884870314.png)

sysbench 压测TPS和平均延迟如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1664884879918.png)

通过上面的测试结果可以看到在没有热点的情况下，大region-size对高并发TPS和延迟几乎无影响，同时随着压测的持续进行TPS在不断增长，这也反应了TiDB的自动负载均衡能力。

## 5 总结

前面对TiDB冷热存储分离方式的资源隔离性、迁移的便捷性、大region优化下性能进行了测试，测试结果都符合预期，冷热存储使用方式也很简单，在使用时应在库级包括mysql设置放置策略为ssd盘，以避免region分散到hdd盘而影响性能。