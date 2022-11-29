---
title: 使用Online unsafe recovery恢复v6.2同城应急集群 - TiDB 社区技术月刊
sidebar_label: 使用Online unsafe recovery恢复v6.2同城应急集群
hide_title: true
description: 本文将详细介绍如何使用Online unsafe recovery恢复v6.2同城应急集群
keywords: [TiDB, 6.2.0, Online unsafe recovery, TiKV]
---

# 使用Online unsafe recovery恢复v6.2同城应急集群

> 作者：[cchouqiang](https://tidb.net/u/cchouqiang/answer)

## 环境准备

### 安装介质

tikv 6.2.0 release

[https://download.pingcap.org/tidb-community-server-v6.2.0-linux-amd64.tar.gz](https://download.pingcap.org/tidb-community-server-v5.0.4-linux-amd64.tar.gz)

## 背景

对于rawkv来说，无法使用binlog进行数据同步，但可以采用raft协议进行数据同步。主集群tikv的角色为voter，提供读写服务；同城应急的tikv角色为learner，通过raft协议同步主集群数据，提供灾备能力。当主集群出现问题，可以将灾备节点的learner角色升级为voter角色，对外提供服务。

若整个主生产出现问题，使用online unsafe recovery恢复同城应急集群，让同城应急集群对外提供服务。

## 集群拓扑

主生产拓扑为:

- 2个pd节点
- 5个tikv节点（5个voter副本）

同城应急拓扑为：

-  1个pd节点
-  1个tikv节点（1个learner副本）


整个集群拓扑如下图所示：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666685203604.jpg)

同城应急的节点为：172.16.11.113:2379、172.16.11.120:20160

其余节点均为主生产的节点。


## online unsafe recovery恢复步骤

### 1、模拟主生产故障，整个集群down

使用 `tiup cluster stop <cluster-name>`命令，将整个集群关闭

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666683621861.png)

### 2、启动同城应急的pd

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666683623449.jpg)

由于pd高可用限制，必须启动多数派时，才能正常启动pd对外服务。

此时无法使用tiup命令将单个pd启动。

### 3、使用`force-new-cluster`参数强制启动一个pd节点

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666683620399.png)

若想单独启动一个pd，需要修改pd的启动脚本。

在同城应急的pd部署目录，修改run_pd.sh脚本，添加 `force-new-cluster: true`

### 4、启动同城应急的pd

手动启动一个pd节点：

`$ nohup sh run_pd.sh &`

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1666685683840.png)

### 5、启动同城应急的tikv

使用`tiup cluster start <cluster-name> -N xx.xx.xx.xx:20160`命令启动某个tikv节点

启动172.16.11.120:20160节点：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666683622534.png)

使用`tiup cluster display <cluster-name>`命令查看集群状态：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666683622981.png)

此时同城应急的pd和tikv均启动

### 6、进行online unsafe recovery

使用online unsafe recovery将同城应急的tikv learner角色提升为voter角色。

online unsafe recovery文档如下：

<https://docs.pingcap.com/zh/tidb/dev/online-unsafe-recovery>

```TypeScript
[cdacs@centos76_vm ~]$ tiup ctl:v6.2.0 pd -u http://172.16.11.113:2379 unsafe remove-failed-stores 1,2,6,9,12
Starting component `ctl`: /home/cdacs/.tiup/components/ctl/v6.2.0/ctl pd -u http://172.16.11.113:2379 unsafe remove-failed-stores 1,2,6,9,12
Success!
[cdacs@centos76_vm ~]$
[cdacs@centos76_vm ~]$ tiup ctl:v6.2.0 pd -u http://172.16.11.113:2379 unsafe remove-failed-stores show
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666683619932.png)

### 7、使用show命令查看恢复进度

使用如下命令进行查看online unsafe recovery恢复进度：

```TypeScript
[cdacs@centos76_vm ~]$ tiup ctl:v6.2.0 pd -u http://172.16.11.113:2379 unsafe remove-failed-stores show
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666683621289.png)

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666683616649.png)

当出现“unsafe recovery finished”时，恢复完成。

### 8、对pd和tikv进行扩缩容操作

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1666683622981.png)

此时tikv变为Tombstone，可以使用tiup cluster prune tidb-test命令删除Tombstone状态的节点。

并针对实际情况进行扩缩容操作。

## 总结和思考

- 灵活运用raft协议来提供rawkv的容灾能力；

- 在v5版本下可以使用Learner recover，但在v6版本下，Learner recover则无法使用，因为v5和v6的raft engine不同；

- 使用 Online Unsafe Recovery 功能来实现learner角色升级成voter角色，在主集群出现问题的情况下，同城应急集群可以对外提供服务。
