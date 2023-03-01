---
title: 新扩容节点与集群版本不一致处理 - TiDB 社区技术月刊
sidebar_label: 新扩容节点与集群版本不一致处理
hide_title: true
description: 在使用 tiup 进行扩容的时候，等待半天新节点都没有正常启动，直到 tiup 操作终端报错退出。本文将详细看看我们是怎么通过它来解决扩容失败的问题的。
keywords: [TiDB, 扩容, 集群版本, TiUP]
---

# 新扩容节点与集群版本不一致处理

> 作者：[Jellybean](https://tidb.net/u/Jellybean/answer)

## 问题背景

正在对一个万级 QPS 的线上集群进行存储层在线换盘处理，操作原理和方案步骤类似于文章[百TB级TiDB集群在线更换NVME磁盘优化实践](https://tidb.net/blog/0e6180d0)，都是先扩容新 TiKV 节点，再缩容下线旧的节点。然而，在使用 tiup 进行扩容的时候，等待半天新节点都没有正常启动，直到 tiup 操作终端报错退出。

顺着报错信息去排查 tiup 和 tikv-serer 的日志，找到一条关键的 error：`version should compatible with version 5.3.1, got 4.0.6`，下面看看我们是怎么通过它来解决扩容失败的问题的。

## 原因分析

### 1.报错信息解读

这一条关键的 error：`version should compatible with version 5.3.1, got 4.0.6`是来自扩容失败的 tikv-server 节点，其他同一批要扩容的新节点上都有相同的报错信息，且都是在 Welcome 关键字之后出现。这里它的含义是当前 tikv-server 实例在启动的时候，它的版本信息是 v4.0.6，检查到与集群本身的版本 v5.3.1 不一致，所以为了避免出现版本不一致而导致的其他问题，直接报错并启动失败。

从 tiup 中控机 display 集群可以看到，这一批扩容的集群都没有正常启动，都是 N/A 的状态，如下图所示。

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/649264386798e3e578b69ccc9fd3cfbfcbf566ef-1675763973300.png)

问题来了，好好的集群 tiup 扩容出来的节点，版本怎么会不一样呢？

### 2.原因排查

1）组件的bug？

对 TiDB 集群和 tiup 组件的版本分别在官网、论坛排查，没有证据表明是组件自身的版本bug问题。

```
 TiDB集群版本：Server version: 5.7.25-TiDB-v5.3.1
 tiup版本：Local installed version: v1.11.1
```

2） 改变一下排查思路，v4.0.6 在哪里出现过？

- 打开 TiDB Dashboard， 里面展示的版本是 v5.3.1，版本是正确的。

&#x20;![image](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/8548f0c402dd22e057be6bc52aacd7cab2caa9f4-1675763973190.png)

- 分别查看集群的 tidb-server、tikv-server、tipd-server 实例bin目录下的二进制文件，查看 -V 的输出内容，都是 v5.3.1，说明集群核心组件的版本也是正确的，没有问题。

<!---->

- 使用 tiup cluster display online1 查看集群信息，其展示的集群版本是旧的版本号 **v4.0.6** ！这个版本正是我们扩容失败的tikv 节点所用的版本号，它们大概率有一定的联系。

```
 Cluster name: online1
 Cluster version: v4.0.6
```

3） tiup cluster display 为何是旧版本号？

- 看到 v4.0.6 这个版本号，第一印象是它是我们这个集群上一次升级前的版本，最近一次升级前操作在半年前，集群正是从 v4.0.6 直接升级到 v5.3.1 版本，立即推测是上次升级时 tiup 这里的版本信息更新过程出了问题。
- 距离上次升级已有半年之久，且集群也一直在稳定运行，排查这么长时间之前的操作问题看起来比较困难。在这里不得不夸赞一下 tiup 的 audit log 功能，它的存在让我们排查这个问题变得很轻松。二话不说马上执行 tiup cluster audit 看看之前 upgrade 的 audit log ，通过 audit id 找到了半年前对应的操作日志。

```
 #寻找历史上通过tiup升级集群的操作命令
 $ tiup cluster audit |grep upgrade
 fxw5PHDyRQH 2021-01-28T01:39:16+08:00 /home/fdc/.tiup/components/cluster/v1.3.1/tiup-cluster upgrade online1  v4.0.6
 fTQt5sbrCBF 2022-06-07T00:27:10+08:00 /home/fdc/.tiup/components/cluster/v1.9.6/tiup-cluster upgrade online1  v5.3.1
 fTQv2V0csc7 2022-06-07T00:41:22+08:00 /home/fdc/.tiup/components/cluster/v1.9.6/tiup-cluster upgrade online1  v5.3.1
 fTQBhcVB75L 2022-06-07T01:59:46+08:00 /home/fdc/.tiup/components/cluster/v1.9.6/tiup-cluster upgrade online1  v5.3.1
 ​
 #查看最后一次升级的执行日志，在最后发现一条 DEBUG 日志里的 error
 $ tiup cluster audit fTQBhcVB75L | less 
 DEBUG   TaskFinish  {"task": "UpgradeCluster", "error": "failed to start: x.x.x.207 node_exporter-9100.service, 
 please check the instance's log() for more detail.
 timed out waiting for port 9100 to be started after 2m0s", 
 "errorVerbose": "timed out waiting for port 9100 to be started after 2m0s"
```

查看最后一次升级的执行日志，我们发现在升级完集群核心组件之后，有个 node\_exporter 启动等待超时了，从而中断了 tiup 的执行。

原来，在使用 tiup upgrade 过程中 node\_exporter 启动超时了，由于核心组件已升级所以对集群可用性没有影响，但作为tiup cluster upgrade 的一个步骤，node\_exporter 启动的执行失败也代表了整个任务失败，tiup 也不会修改自身维护的集群版本信息的，即不会修改 `~/.tiup/storage/cluster/clusters/tidbonline/meta.yaml` 的版本到目标版本号。

这里也说明了前面为什么 TiDB Dashboard 的版本是正确的，而 tiup cluster display 显示的是旧版本。tiup 是读取自己meta.yaml 文件里的 version，而TiDB Dashboard 是读取的 PD 集群真正运行时的 version，两者读取源不是同一个地方，所以不一样。

知道了原因后，如何处理问题？

## 处理操作

- 首先，先下线用了旧版本号扩容的 tikv-servre 实例

尝试使用 tiup cluster prune 清理下指定的节点，失败报错了`Error: no store matching address “x.x.x.x:20171” found`，原来这些节点是目前的状态是 N/A，它们没有启动起来，所以状态也不是timestone，不能用 prune 处理。

仔细查看了 tiup 的操作手册，对这些节点执行 scale-in --force 成功把它们清理下线了。

- 其次，手动调整 tiup 的 meta 配置文件为集群当前版本号

手动修改 `~/.tiup/storage/cluster/clusters/tidbonline/meta.yaml`文件，找到文件开头的集群版本号，将 v4.0.6 修改为 v5.3.1，保存退出。

- 最后，执行扩容操作，看到 scale-out 输出成功，通过 grafana 和 tiup cluster display 确认扩容正常，问题得到解决

上面的操作，对集群上的访问业务是透明的，无影响。

## 总结反思

- 对于扩容过程启动失败而处于 N/A 状态的节点，需要用 scale-in --force 才能将节点从集群清理掉，prune 不行
- 在升级集群时如果遇到任何问题，尽可能在当时解决好，在长时间运行后再排查，难度可能会很大。
- tiup 中控机的数据很重要，包含了集群的拓扑、运维操作、关键操作日志等，尽量定期备份 \~/.tiup 目录
- 线上操作出现任何问题，务必冷静，仔细排查日志和梳理操作，也可以在论坛或向官方咨询相关问题，社区论坛里随时都有大佬拔刀相助，帮助快速定位和处理问题