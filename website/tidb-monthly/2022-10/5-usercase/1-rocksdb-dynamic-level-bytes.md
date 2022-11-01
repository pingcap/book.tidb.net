---
title: Rocksdb dynamic-level-bytes测试简单记录 - TiDB 社区技术月刊
sidebar_label: Rocksdb dynamic-level-bytes测试简单记录
hide_title: true
description: 本文简单记录dynamic-level-bytes在开启和关闭状态下的2个tikv集群测试结果供大家参考
keywords: [TiDB, Rocksdb, dynamic-level-bytes, 测试]
---

# Rocksdb dynamic-level-bytes测试简单记录

>  作者：[h5n1](https://tidb.net/u/h5n1/answer)

Rocksdb的leveled compaction 有2种计算level target size方式：第一种是静态计算方式，根据max-bytes-for-level-base和max-bytes-for-level-multiplier从L1层逐层往下按倍数计算每层target size。第二种是动态计算方式需开启dynamic-level-bytes参数，以最后一层实际大小为base，逐层向上计算每层target size，数据主要写入最后一层和最后-1层，前面会有部分层没有数据，大约有90%数据在最后一层。

因为delete后的数据要到最后一层后才能被真正清理，因此动态模式下能更快的完成delete数据清理，减少空间放大，理想状态下动态计算方式空间放大可达到1.11倍。

本文简单记录dynamic-level-bytes在开启和关闭状态下的2个tikv集群测试结果供大家参考，[dynamic-level-bytes相关内容可点击阅读](https://github.com/facebook/rocksdb/blob/v3.11/include/rocksdb/options.h#L366-L423)，compaction 相关内容可阅读[官方文档](https://github.com/facebook/rocksdb/wiki/Compaction)或<https://tidb.net/blog/eedf77ff> 。

## 1、 测试环境

2套v6.3.0集群初始化时分别设置dynamic-level-bytes为true(3.0版本后默认为true)和false，保持默认gc设置。使用sysbench 初始化10张1亿条记录的表，之后使用128线程连续3次压测记录TPS/平均延迟，每项压测10分钟。

## 2、初始化后tikv大小

以下截图为完成初始后14小时后截图，期间未进行任何操作。

dynamic-level-bytes: true，总空间大小为402.9G。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665999785225.png)

dynamic-level-bytes: false，总空间大小为599.8G。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665999793465.png)

## 3、 各层sst文件数量**

dynamic-level-bytes: true，数据主要写入了writecf，集中在leve 6/5 两层，level 1/2层没数据。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665999801790.png)

dynamic-level-bytes: false，数据主要写入了writecf，集中在leve 4/3 两层，level 5层没数据。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665999821863.png)

## 4、sysbench 压测

从每次压测结果对来看dynamic-level-bytes为true时TPS/平均延迟均好于参数为false时。(可能压测时间延长指标会有变化)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665999831591.png)

## 5、压测期间各层文件变化

dynamic-level-bytes: true时压测期间6/5层sst文件均有明显减少，从4.24k/1.04k左右降到3.69k/0.97K左右。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665999840141.png)

dynamic-level-bytes: false时压测期间4层文件数有一定增高，由压测前4.45k左右增加到4.51k，最终结束是回落到4.27K，相比动态方式sst文件减少不大。

 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665999847539.png)

## 6、压测结束3小时后sst文件数量

dynamic-level-bytes: true（压测结束时间11:56），最终4/5/6层文件数为4.81K

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665999860731.png)

dynamic-level-bytes: false（压测结束时间14:36），压测结束后由于compaction sst file逐渐减少，最终2/3/4层文件数为5.0K

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665999868888.png)

## 7、tikv 手动compact测试

设置dynamic-level-bytes: true、GC safe point为24h避免compaction-filter影响，delete一张表的全部数据，待各层sst文件稳定后手动在线对tikv进行compact，命令如下,相关参数可参考[官方文档](https://docs.pingcap.com/zh/tidb/v6.3/tikv-control#%E6%89%8B%E5%8A%A8-compact-%E5%8D%95%E4%B8%AA-tikv-%E7%9A%84%E6%95%B0%E6%8D%AE)： tikv-ctl --host xxxxxx:20160 compact --bottommost force -c write -d kv

可以看到delete期间各层sst file有一定增长，手动compact时6层以下文件逐渐降低。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1666153800194.png)

Delete期间的compact和手动compact的速率，手动compact的默认并发--threads=8，生产中避免影响时可降低该参数值。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1666153918553.png)

SST文件读写延迟对比：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1666154559309.png)

查询表中数据，确认delete是否被GC。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1666154328190.png)