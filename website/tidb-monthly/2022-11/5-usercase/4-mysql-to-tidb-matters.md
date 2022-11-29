---
title: 将业务从mysql迁移至TIDB，有哪些需要注意的？ - TiDB 社区技术月刊
sidebar_label: 将业务从mysql迁移至TIDB，有哪些需要注意的？
hide_title: true
description: 本文主要是分享一些从mysql迁移到tidb遇到的问题，以及如何解决。
keywords: [TiDB , MySQL,  注意事项, 数据库迁移]
---

# 将业务从mysql迁移至TIDB，有哪些需要注意的？

> 作者：[BraveChen](https://tidb.net/u/BraveChen/answer)

## 背景

双十一刚过，至此，两个月前我们从mysql迁移到TIDB的一套业务算是正式成功了。

集团有一套业务库，对接淘宝流量，据说每年双十一的时候流量过大会导致各种问题，苦不堪言。经过内部评估，我们决定将这套系统从mysql迁移到更适合大数据量的TIDB上。

文章主要是分享一些从mysql迁移到tidb遇到的问题，以及如何解决。

## 一、误设置过长GC

由于这套系统之前是跑在mysql上，所以初期数据库的一些工作，是由mysql的dba和我们tidb团队一起工作，某一天我们突然发现集群的druation突然上升，并且是在没有更多请求的情况下，延迟上升了。后面经过我们排查发现是mysql的dba为了在数据库中保存最近7天的数据，并且实现误操作闪回，将`tidb_gc_life_time` 这个参数由1h改成了7d,从而导致tikv中历史版本过多，导致每次磁盘读取会扫描过多的无用数据，导致的整体变慢。

### 为什么里在mysql里面可以设置保留更多的历史数据，tidb不行？

基于mysqlDBA的操作，我思考了一下为什么他直接就将gc保留的时间设置长了，研究发现mysql的闪回是通过本地保存binlog日志实现的，且mysql中事务的一致性读是通过undo log实现的，所以这里并不会显著的影响正常数据的查询。

而在tidb中的闪回和一致性读是直接依赖本地保留的历史版本数据，直接保存各个版本数据实现mvcc,再通过gc定期清除历史版本数据。

mysql在进行mvcc控制的时候，读取历史的版本，依赖的是：事务开始时间戳、当前的数据、undo log日志链。在事务中中在读取历史版本数据时，会先找到最新的数据，依靠每行数据自带的回滚指针，去undo log 中找到事务开始时间戳前最近的一个版本，按时间有序的链表查找历史数据。![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1668346259945.png)

而在tidb中，所有的dml操作都转化为在磁盘中进行追加一行新的数据，最新的数据和历史版本的数据都保留在了一起，在读取数据时，会先将附近版本的数据全部读取，再根据所需版本进行过滤，这样当保留了过多版本的历史数据时，每次读取都会读取很多无用的数据，造成性能开销

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1668347086364.png)![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1668347182584.png)


### tidb中历史版本过多相关问题，及排查方案

在这篇文章中，就讲到了历史版本过多的一些排查方式，比较全面

[一次TiDB GC阻塞引发的性能问题分析](/4-trouble-shooting/3-tidb-gc-block.md)

文章中比较直观的描述了历史版本数据过多时，对于sql执行直接的影响：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1668347980371.png)

## 二、SQL调优方式对比和SQL调优

sql作为和数据库交互的标准语言，sql调优是dba以及数据库使用者绕不开的东西。

这一小结讲一下相比于mysql的sql调优方式，在tidb中的不同之处，以及讲下将业务从mysql迁移到tidb后，sql方面需要做的一些工作。

### 日常sql调优分析对比

在mysql数据库的日常调优中，免不了的有类似需求：

```markdown
#查询频率
show global status like 'com*'
#查看慢查询日志
cat slow_query.log
#查看sql耗时以及到底耗费在哪里
show profile for query query_id
#查看sql执行计划，分析效率
explain query
```

而在tidb中，集群自带的监控dashboard可以满足所有上述需求，并且还拥有统计功能、top功能、多种条件过滤功能，帮助分析异常以及sql调优，非常方便。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1668362462519.png)


### mysql迁移到tidb后可能会遇到的一些sql调优的工作

在mysql迁移至tidb后，有一部分原来执行没有性能问题的sql,在tidb中出现了性能问题，主要有如下：

- 偶发性的复杂sql的连接算子不合理

这类sql主要表现为比较复杂的sql,且sql中的表连接是隐式连接时出现几率大

解决方案：绑定执行计划，此方案对应用代码没有侵入性，且方便快捷，参考：[执行计划管理 (SPM) | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/sql-plan-management#%E6%89%A7%E8%A1%8C%E8%AE%A1%E5%88%92%E7%BB%91%E5%AE%9A-sql-binding)

- sql执行逻辑不佳

通常指的是在部分复杂sql中，在不影响sql最终结果的前提下，先过滤计算某一部分结果作为临时表，会使整个sql的效率提高，在部分场景中mysql优化器能够自动优化处理，tidb的执行计划不太合理

解决方案：这种通常只有改写sql,在sql中去显示的制作临时表

- 部分小bug

这种问题通常指某些sql导致的异常行为，多在后续版本中被修复了。

例如某些场景下index hash join算子会存在一些问题，通过hint其他算子可绕过

解决方案：在github搜索相关issue或者pr,或者社区提问

## 热点问题

相比于单机的mysql数据库，分布式tidb优势的一点就是可以利用分布式集群多机器的能力来突破单机的io瓶颈，但是在某些时候，由于数据分布不合理，或者是业务专一的访问某一小部分的数据，这种时候可能会导致分布式集群中单机的瓶颈成为整个集群的瓶颈，这就是热点问题。

### 热点的排查与解决

通常我们排查热点最常见的方法就是dashboard中的热力图来确认排查热点，越亮的区域，表示流量越高

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1668368741553.png)

但是有时候我们很难去确认哪些流量才是真的达到了某一单机器的瓶颈，我这里提供一个方法

```markdown
1、查询都热点，得到region_id和都流量数值
（在一般系统中，70%以上的请求为读请求）
SELECT DISTINCT region_id ,read_bytes 
FROM INFORMATION_SCHEMA.tikv_region_status WHERE ORDER BY READ_BYTES DESC

2、尝试去切分热点region
tiup ctl:v5.3.2 pd -u http://10.0.*.*:2379 operator add split-region $id --policy=scan

3、若观察到切分该region后duration有比较明显的下降，则说明该流量比较容易达到机器瓶颈
（当然一台机器肯定不止只有一个region被访问，所以这里其实是一个观察性质的经验，不是具体某一个数值）
```

结合确定的流量瓶颈，我写了个简单的脚本挂在crontab,每隔20分钟执行一次，效果不错

```markdown
#!/bin/bash

#打印当前时间
echo "############################################">>/home/tidb/log/split-hot-region.log
date>>/home/tidb/log/split-hot-region.log

#查找读流量大于5G的region
hot_id=`mysql -h10.0.*.* -P4000 -uroot -p* -e"SELECT DISTINCT region_id  FROM INFORMATION_SCHEMA.tikv_region_status WHERE  READ_BYTES >5368709120 ORDER BY READ_BYTES DESC"`

#打印热点region_id和读流量到日志
echo "当前读热点为：">>/home/tidb/log/split-hot-region.log
mysql -h10.0.*.* -P4000 -uroot -p**** -e"SELECT DISTINCT region_id ,read_bytes FROM INFORMATION_SCHEMA.tikv_region_status WHERE  READ_BYTES >5368709120 ORDER BY READ_BYTES DESC
">>/home/tidb/log/split-hot-region.log

source  /home/tidb/.bash_profile
for id in $hot_id
do
if [ $id != 'region_id' ];
then
tiup ctl:v5.3.2 pd -u http://10.0.*.*:2379 operator add split-region $id --policy=scan
sleep 1s
tiup ctl:v5.3.2 pd -u http://10.0.*.*:2379 operator add split-region $id --policy=scan
sleep 1s
tiup ctl:v5.3.2 pd -u http://10.0.*.*:2379 operator add split-region $id --policy=scan
sleep 1s
tiup ctl:v5.3.2 pd -u http://10.0.*.*:2379 operator add split-region $id --policy=scan
sleep 1s
tiup ctl:v5.3.2 pd -u http://10.0.*.*:2379 operator add split-region $id --policy=scan
    if [ $? -eq 0 ]; then
        echo "已成功切分region "$id>>/home/tidb/log/split-hot-region.log
    else
        echo "切分region"$id"失败">>/home/tidb/log/split-hot-region.log
    fi
fi
done

```

当然也可以通过调整系统参数实现，[Load Base Split | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/configure-load-base-split#%E4%BD%BF%E7%94%A8%E6%96%B9%E6%B3%95)

（某次设置这两个参数不小心搞错，碰到一些问题，有阴影了，现在不想用）

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1668369473463.png)

### 大范围热点处理

有些时候，热点可能是由于sql不合理所导致的，例如对某张表的查询没有建立索引，导致每次都是全表扫之后再过滤，导致的大块热点。(如果有索引，每次定向读取少量数据，就不会有热点）

排查与解决方案：

这种通常的碰到之后，根据热力图中的表名去查询相关的sql，去验证执行计划中是否走了索引，后续添加索引。

也有一部分为sql写的不合理，每次请求大量的数据，到应用服务器之后再进行过滤，这种就需要与开发进行讨论添加过滤条件。

## 其他问题处理

一个比较久远的帖子，写的内容比较全面和基础，可以参考一下

[专栏 - 迁移 MySQL 集群到 TiDB 相关问题整理 | TiDB 社区](https://tidb.net/blog/f6ed790c)

## 作者看法

tidb作为兼容mysql的分布式数据库，未来必然会有越来越多的业务从mysql上面迁移到tidb,我希望有越来越多的案例和经验可以被分享出来，作为参考。