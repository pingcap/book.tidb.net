---
title: MySQL正常执行的SQL在TiDB中变慢了
hide_title: true
---

# MySQL正常执行的SQL在TiDB中变慢了

> 作者：**[HHHHHHULK](https://tidb.net/u/HHHHHHULK/post/all)** 发表于  **2022-05-15**

# 前言

在测试过程中，发现有一部分在MySQL里执行很流畅的SQL，放入TiDB中执行耗时明显变长，有些甚至都跑不出结果。

这里简单总结下，上述情况产生的原因、优化办法、以及遇到无法优化的，如何向社区提供背景资料。

# 情况与方案

表结构以及数据量MySQL和TiDB都是一致的，数据库所在服务器的硬件配置也差不多。

## 一. 统计信息问题

在我们的测试场景中，这类情况很容易出现，因为我们每次跑测试任务前，都是通过br去恢复数据的。

### 如何判断

这类问题也比较好判断，首先就是看执行计划：

```
explain analyze SQL;
```

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1652602896518.png)

可以看到`operator info`这列里出现了`stats:pseudo`，这就代表 paycore_orderinfo 这张表需要重新收集下统计信息。

### 优化方案

重新收集该表的统计信息：

```
analyze table paycore_orderinfo;
```

收集完统计信息后，我们再跑下sql：

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1652602921434.png)

可以看到原本是扫描了paycore_orderinfo全表，现在用到create_time索引了，执行时间从7秒减少到0.15秒。

如果想一次找出所有慢查询里计信息为 pseudo的SQL，可以使用以下语句：

```
select query, query_time, stats from information_schema.slow_query where is_internal = false and stats like '%pseudo%';
```

## 二. 优化器问题一

统计信息的问题比较常见也比较好解决，如果想要解决优化器导致执行计划偏差的问题，就需要下一定功夫了。

### 如何判断

因为整个SQL比较复杂，就截取当中的一小段，先看下这条SQL在MySQL下的执行计划：

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1652602944392.png)

可以看到整个SQL的执行计划还是较好的，运行速度也很快。

相同的SQL放到TiDB中执行，执行计划如下：

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1652602983618.png)

在MySQL里t表用到了primary key，而在TiDB中，t表则使用了idx_ta_ack_2(ta_no)这个索引，导致实际影响的行数actRows达到了200多万行，最终整个SQL执行失败，报错为:

```
[Err] 1105 - Out Of Memory Quota![conn_id=226083]
```

### 优化方案

现在单独把这条SQL表关联的地方拿出来：

```
FROM
t
LEFT JOIN d ON (t.app_no = d.ack_no),
e
WHERE
```

为了让TiDB优化器更好地去判断，把表关联顺序改为：

```
FROM
e
STRAIGHT_JOIN t
LEFT JOIN d ON (t.app_no = d.ack_no)
WHERE
```

执行计划如下：

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1652603014216.png)

t表用回了primary key，跑起来的耗时也比MySQL快了不少。

## 三. 优化器问题二

还有种情况，在MySQL里执行计划正常，但是在TiDB中表关联被转为了全表的hashjoin。

### 如何判断

先看下MySQL中的执行计划：

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1652603038315.png)

TiDB中的执行计划：

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1652603060232.png)

可以看到g表是`TableFullScan`，这样整个SQL的执行时间就变得很长。

### 优化方案

为了让g表能正常的走到索引关联，这边在SQL里加了hint，加完hint的执行计划如下：

![1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1652603087997.png)

SQL执行时间也恢复了正常。

因为SQL实在是太长，不便于放在文章展示，所以只截取了一部分。

这里想说的是，一般优化器的问题会出现很复杂、join关系很密集的SQL中，处理的方式大致有三种：

1. SQL加hint；
2. 通过binding绑定执行计划；
3. 更改表的的连接关系；

大家可以通过实际情况进行优化，如果还是解决不了，可以收集相关信息在社区进行提问。

## 四. 向社区提问

如果想向社区求助，那需要那些东西呢？

### 1. 问题SQL

完整的SQL，如果有隐私信息记得替换掉。

### 2. 表结构

SQL中所有表的建表语句，以及表中所包含的索引。

### 3. 执行计划

通过 explain analyze 执行后输出的执行计划。

如果遇到SQL过大，被kill掉，无发跑出执行计划的情况，那可以通过EXPLAIN FOR CONNECTION命令获取动态的执行计划，命令如下：

```
EXPLAIN FOR CONNECTION ID; #ID为正在执行的SQL ID
```

### 4. 表的统计信息

收集方式：

```
curl http://172.16.XXX.XXX:10080/stats/dump/schema_name/table_name > dump.txt
```

收集完以上四样东西，就可以去社区发帖啦。

# 总结

如果遇到MySQL里执行的话，而在TiDB里跑不动的SQL，可以按以下几个步骤去做：

1. 仔细分析执行计划，执行计划里有足够多的信息。
2. 遇到pseudo，择时进行analyze table操作。
3. 如果是优化器判断的问题，根据统计信息进行sql绑定或更改表连接方式（这个需要非常谨慎，不像加hint，更改连接方式需要动代码，关联逻辑和结果必须得是正确的）。
4. 收集所有相关的信息向社区求助。

个人觉得此类问题大家可以大胆向社区寻求帮助，一来可以解决自己的问题，二来也可以给官方反馈更多的实际案例。

毕竟TiDB目前已兼容了几乎所有的MySQL语法，如果SQL执行也能保证一致或者更优，那整个从MySQL迁移至TiDB的过程将更加丝滑，所需要的测试和验证的成本会更低。