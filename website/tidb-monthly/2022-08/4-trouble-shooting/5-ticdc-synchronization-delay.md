---
title: TiCDC同步延迟问题处理 - TiDB 社区技术月刊
sidebar_label: TiCDC同步延迟问题处理
hide_title: true
description: 本文分享一个前几周遇到的一个 TiCDC 同步 MySQL 数据延迟的问题，处理过程一波三折，希望对大家有所帮助。
keywords: [TiCDC, 同步延迟, TiDB,  MySQL 数据延迟]
---

# TiCDC同步延迟问题处理

> 作者：[seiang](https://tidb.net/u/seiang/answer)

今天分享一个前几周遇到的一个 TiCDC 同步 MySQL 数据延迟的问题，处理过程一波三折，希望对大家有所帮助；

（**笔者能力有限，文章中如果存在技术性或描述性等错误，请大家及时指正，非常感谢！**）

## 背景介绍

首先，简单介绍一下该 TiCDC 同步任务大概的应用场景和同步的链路，如下图所示：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658231849346.png)

TiDB集群中存储待同步的表数据，单日数据量在 2.5 亿左右，单日的数据存储大小在 80G 左右，数据由于存储空间的限制，需要对历史的数据每天定时的进行清理，但是这些历史数据需要保存下来供业务及客服人员查询，需要永久保存；

所以针对该表数据通过 TiCDC 的方式实时的将数据从 TiDB 同步到 MySQL，然后将 MySQL 的数据在同步到 Hive 中进行永久保存；

## 分析解决过程

该同步任务已经稳定运行一个多月，期间没有出现过任何的问题；但是在 2022-06-28 08:16 点开始不断收到 TiCDC 同步延迟的告警，监控如下所示：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658749664204.png)

1、首先检查是否是同步任务中断，发现同步任务是正常的，并且 tso 和 checkpoint 也是一直变化的，但是延迟在不断的增加

```markdown
$ tiup ctl:v5.0.3 cdc changefeed list --pd=http://10.xx.xx.xx:2379
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v5.0.3/ctl cdc changefeed list --pd=http://10.xx.xx.xx:2379
[
  {
    "id": "xx-xx-task",
    "summary": {
      "state": "normal",
      "tso": 434212451741859960,
      "checkpoint": "2022-06-28 09:04:12.360",
      "error": null
    }
  }
]
```

2、从监控信息，Unified Sort on disk一直在增长，感觉是不是有大事务导致的同步延迟

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658749786522.png)

通过查看CDC节点日志、以及TiDB Server的节点日志，并且和业务人员确认，该时间范围内，业务侧并没有进行调整，业务量也没有突增

**下面先补充一个TiCDC相关重要的监控说明：**

- Changefeed checkpoint lag：同步任务上下游数据的进度差（以时间计算）

- Changefeed checkpoint：同步任务同步到下游的进度，正常情况下绿柱应和黄线相接

- Sink write duration：TiCDC 将一个事务的更改写到下游的耗时直方图

### 第一波定位：在CDC或是TiDB集群层面并没有发现相关异常的情况

3、接下来，排查一下下游MySQL是否出现的了问题，导致消费数据比较慢，如下是MySQL近几天相关监控

**平均负载：**

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658750323234.png)

**IO Util：**

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658750308010.png)

从监控层面看，发现MySQL主机负载确实存在异常，比之前高了很多，并且IO基本上打满；

但是为什么MySQL的负载为何突然就变大了，IO突然就打满了呢？上层TiDB的业务查看近几天的业务都正常，业务量也正常；

接下来分析下同步的周期日表，在下游MySQL最近两天是否有变化：

**备注：问题原因和字段并无直接联系，这里具体的表结构隐藏了相关字段；**

```markdown
mysql>show create table reXXX_20220627\G
*************************** 1. row ***************************
       Table: reXXX20220627
Create Table: CREATE TABLE `reXXX20220627` (
  `pid` int(10) unsigned NOT NULL,
  `tid` int(10) unsigned NOT NULL,
  ....
   PRIMARY KEY (`pid`,`mpid`,`mid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin ROW_FORMAT=COMPRESSED;
1 row in set (0.00 sec)


mysql>show create table reXXX_20220628\G
*************************** 1. row ***************************
       Table: reXXX20220628
Create Table: CREATE TABLE `reXXX20220628` (
  `pid` int(10) unsigned NOT NULL,
  `tid` int(10) unsigned NOT NULL,
  ....
  PRIMARY KEY (`pid`,`mpid`,`mid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
1 row in set (0.00 sec)
```

对比下游MySQL近两天的周期表结构，发现上一天的表和当天的表结构是一样的，具体体现在：

（1）上一天的表是COMPRESSED行格式，而当天的表是默认的DYNAMIC行格式

（2）上一天的表是utf8_bin字符排序规则，而当天的表是默认的utf8_general_ci字符排序规则

### 第二波定位：发现下游MySQL的表结构不一致问题

4、下面，根据上述发现的问题，首先将下游MySQL的表结构的行格式调整为COMPRESSED，调整完整之后，在第二天的业务高峰时间又出现了下游CDC同步延迟，下游MySQL的负载相比于昨天缓解很多，但是相比之前依旧比较高，如下所示：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658921720534.png)

从上述的结果看，下游MySQL调整完表结构的行格式为COMPRESSED可以缓解下游在业务高峰时间的消费延迟问题，仅仅是缓解，但是问题以及存在；

### 第三波定位：下游MySQL的表结构不一致问题，通过将表行格式调整为COMPRESSED可以缓解下游在业务高峰时间的消费延迟问题，但是高峰时间延迟依旧存在

5、接下来，继续调整表的排序规则，将表的排序规则，从utf8_general_ci调整为utf8_bin，经过几天对比发现，在业务高峰期间延迟基本在1s左右；下游的MySQL负载也下降非常多，基本稳定；

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658923031243.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658922506090.png)

下面补充一下，MySQL表结构的行格式在COMPRESSED同等情况下，utf8_general_ci和utf8_bin排序规则的性能对比：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658923213255.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1658923223319.png)

从对比结果看，同等配置情况下，utf8_bin排序规则要比utf8_general_ci性能略好一些；

## 总结

目前 TiCDC 在大部分场景下是可以满足业务场景的，包括目前有部分集群数据通过 TiCDC 同步数据到Kafka，目前运行一年多的时间还算问题；期待未来TiCDC能够更加稳定高效，并且可以支持多种大数据业务场景；