---
title: TiDB 监控升级解决 panic 的漫漫探索之路
hide_title: true
---

# TiDB 监控升级解决 panic 的漫漫探索之路

> **[俺也一样](https://tidb.net/u/%E4%BF%BA%E4%B9%9F%E4%B8%80%E6%A0%B7/answer)** 发表于  **2022-06-20**

## 故事背景

上周同事收到tidb生产集群告警，node_exporter 组件发生了重启，与同事交流了一下相关历史告警，发现 node_exporter 组件总是时不时的重启，并触发告警，并且整个集群各个节点都有发生过这个现象。

这里先简单介绍下 node_exporter 组件相关背景以及它的作用：TiDB 使用开源时序数据库 [Prometheus](https://prometheus.io/) 作为监控和性能指标信息存储方案，而 node_exporter 是 Prometheus 的指标数据收集组件。它负责从目标Jobs收集数据，并把收集到的数据转换为 Prometheus 支持的时序数据格式。所以在部署集群时，通常**会在集群的每个节点都分发并运行 node_exporter 组件**。

经过我们对重启现象的排查确认，认为是 node_exporter 组件会偶发性的出现 panic，导致节点重启，经过与 PingCAP 原厂的工程师反馈这个问题后，建议我们尝试将 node_exporter 组件的版本进行升级。

我们在本地镜像源里面检查了一下 node_exporter 组件的版本，发现当前版本是 v0.17.0 版本，也是 PingCAP 官方推出的最高版本，而 Prometheus 官方已经推出了 v1.3.1 版本的 node_exporter 组件。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655447294489.png)

因此后面计划从 prometheus 官网下载 v1.3.1 版本的 node_exporter 组件包，去不停机升级到我们的测试集群中，在不影响服务的情况下升级，再观察下能否解决这个 panic 的问题。

> node_exporter组件包下载网址：https://github.com/prometheus/node_exporter

## 初期遇到的问题

当前集群是本地离线镜像源部署的，这种背景下，我初期大致的的实施思路是这样的：

1/ 下载 node_exporter 组件包上传到离线的生产环境中控机

2/ 使用 `tiup mirror publish` 将该组件包发布到本地离线镜像源 [tiup mirror publish | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/tiup-command-mirror-publish#tiup-mirror-publish)

3/ 使用 `tiup install` 或者 `tiup update` 更新 node_exporter 组件到 v1.3.1 版本

按照这种思路操作，我发现所有操作都是报 successfully！，但是去检查各个节点的 node_exporter 二进制文件还是 v0.17.0 版本，并且启动的服务的日志也都是 v0.17.0 版本，后面尝试过更多官方可能的一些可能的操作，例如 `tiup cluster patch` 或者 `tiup cluster upgrade` 等，都没发解决我的问题，后面自己做出了一些猜想：node_exporter 组件不属于 “cluster” 原生组件，所以并不能使用 tiup 的一些相关命令直接去升级，后面去开帖和社区的朋友们讨论了一波，似乎也论证了我的猜想。

讨论的帖子：[如何在线的将本地node_exporter组件从在线的v0.17.0升级到v1.3.1版本（prometheus已经有该版本，但是pingcap只出了0.17.0版本） - TiDB / 部署&运维管理 - TiDB 的问答社区 (asktug.com)](https://asktug.com/t/topic/693303)

## 在线升级node_exporter组件解决方案

### 序言

在前面经过一些尝试与讨论工作之后，个人认为其实官方途径暂时无法解决这个问题，后面我自己采取了一个”挂羊头卖狗肉“的方式去解决了这个问题。由于之前在社区并没有找到相关问题的解决方案，所以记录一下解决过程分享给大家

### 测试环境简介

 1/整个测试用到5台虚拟机，分别用ip最后一位180，190，200，210，220简称，其中190是中控机

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655568156861.png)

2/当前测试中控机有v5.4.0版本的离线镜像源，v1.3.1版本的node_exporter组件包

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655568356760.png)


### 解决方案实施步骤

**1/ 确认当前节点node_exporter组件进程正常，以保证后续流程正常**

命令：`tiup cluster exec tidb-test --command='ps -ef |grep node`

\#`tiup cluster exec `命令可以将要执行的命令，由中控机发送到集群各个节点执行

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655656901556.png)



**2/ 用V1.3.1版本的node_exporter组件二进制文件，去替换掉各节点V0.17.0版本的二进制文件**

2.1、确认节点node_exporter可执行文件位置（如各节点部署目录不同，后续命令需调整）

命令：`tiup cluster exec tidb-test --command='ls /tidb-deploy/monitor-9100/bin/node_exporter'`

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655657134716.png)



2.2、删除个节点node_exporter组件的二进制文件

命令：`tiup cluster exec tidb-test --command='rm -rf /tidb-deploy/monitor-9100/bin/node_exporter/node_exporter'`

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655657260303.png)



2.3、将中控机v1.3.1版本node_expor二进制文件分发到各个节点

命令：`tiup cluster push tidb-test /home/tidb/node_exporter-1.3.1.linux-amd64/node_exporter /tidb-deploy/monitor-9100/bin/node_exporter/node_exporter`

\#这里需要确认命令中的目录是否需要调整

\#`tiup cluster push` 指令可用来将中控机的文件批量分发到集群各个节点，这里相当于分别执行了cp、scp命令复制传输文件

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655657474810.png)



2.4、赋予可执行权限

命令：`tiup cluster exec tidb-test --command='chmod u+x /tidb-deploy/monitor-9100/bin/node_exporter/node_exporter'`



**3/ kill各个节点node_exporter进程，自动拉起进程后，验证各节点启动的node_exporter组件版本**

3.1、先确认下之前分发到各个节点的可执行文件版本

命令：`tiup cluster exec tidb-test --command='/tidb-deploy/monitor-9100/bin/node_exporter/node_exporter --version'`

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655657896348.png)



3.2、Kill 各节点node_exporter进程：

命令：`tiup cluster exec tidb-test --command='pkill -9 node_exporter '`

\#这里我直接将进程名中含node_exporter的所有进程全部kill了，执行前请先确认自己当前环境进程，是否会误操作

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655658051059.png)



3.3、短暂时间后（我这里通常1min内），进程自己恢复，去检查启动日志，验证启动的node_exporter版本

\#启动日志位置

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655658143966.png)

命令：`tiup cluster exec tidb-test --command='tail -n 100 /tidb-deploy/monitor-9100/log/node_exporter.log'`

\#日志中的时间为标准时间，比北京时间早8小时，因此日志中的06：43：33实际上是北京时间14：43：33

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655658189341.png)



观察日志：我在14：47看到日志中记录在14：43：33启动了node_exporter组件，且启动的版本是1.3.1，说明：**在线升级node_exporter组件成功！**



## 解决扩容节点使用新版本的 node_exporter 组件的问题

### 序言

前面章节讲述到，如何在线升级集群 node_exporter 组件，但是作为一个优秀的 DBA，我们需要可持续性的解决问题，这里很容易想到在未来如果该集群进行了扩容，是否还会使用高版本的 node_exporter 组件呢？很显然答案是否定的！

本章节就是讲述如何保障后续扩容时也会使用高版本的组件



### 解决方案实施步骤

**1/ 重新设置node_exporter-v1.3.1-linux-amd64.tar.gz包**

\#这一步重新设置的作用，会在后续FAQ专门解答



1.1、解压node_exporter-v1.3.1-linux-amd64.tar.gz包

命令：`tar -zxvf node_exporter-v1.3.1-linux-amd64.tar.gz`

解压后发现，会得到文件夹node_exporter-v1.3.1.linux-amd64



1.2、将文件夹node_exporter-v1.3.1.linux-amd64改名为node_exporter

命令：`mv node_exporter-v1.3.1.linux-amd64 node_exporter`



1.3、重新将node_exporter文件夹打包成tar.gz包

命令：`tar zcvf node_exporter-v1.3.1-linux-amd64.tar.gz node_exporter`

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655660633619.png)



**2/ 发布&更换中控环境中的node_exporter组件的tar.gz包**

2.1将当前镜像源里的key目录发送到.tiup文件夹下

命令：`cp -r /home/tidb/tidb-community-server-v5.1.3-linux-amd64/keys /home/tidb/.tiup/`

\#这里为什么要发送keys目录,请参考：[tiup mirror merge | PingCAP Docs](https://docs.pingcap.com/zh/tidb/v5.4/tiup-command-mirror-merge)



2.2、将新版本的组件包发布到本地离线镜像源

命令：`tiup mirror publish node_exporter v1.3.1 ./node_exporter-v1.3.1-linux-amd64.tar.gz node_exporter/node_exporter --key ./.tiup/keys/4d418a71219c1935-pingcap.json`

\#该命令详解请参考：[tiup mirror publish | PingCAP Docs](https://docs.pingcap.com/zh/tidb/v5.4/tiup-command-mirror-publish)



2.3、将中控机将.tiup中下原来0.17.0版本的tar.gz包删除

命令：`rm -rf /home/tidb/.tiup/storage/cluster/packages/node_exporter-v0.17.0-linux-amd64.tar.gz`



2.4、将之前重新设置的1.3.1版本的node_exporter的tar.gz包发送到.tiup下

命令：`cp node_exporter-v1.3.1-linux-amd64.tar.gz /home/tidb/.tiup/storage/cluster/packages/node_exporter-v1.3.1-linux-amd64.tar.gz`



2.5、赋予可执行权限

命令：`chmod u+x /home/tidb/.tiup/storage/cluster/packages/node_exporter-v1.3.1-linux-amd64.tar.gz`

最后效果：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655661621182.png)



### FAQ

**问题一：**为什么要重新设置v1.3.1版本node_exporter组件的tar.gz包？直接git_hub下载的不能用吗？

**解答：**因为在后续进行扩容的过程中，会将`/home/tidb/.tiup/storage/cluster/packages/` 下的node_exporter组件包发送到新增节点，而启动时，会通过脚本调用启动组件包中的node_exporter二进制文件，而脚本中写死的的调用路径为node_exporter/node_exporter,第一个node_exporter为该组件包解压后目录的名字，所以我需要专门提前把解压后的目录名改成node_exporter

**验证方式：**

1/找一个pingcap官方的node_exporter组件包解压，你会发现解压后目录名是node_exporter

2/直接去查看各节点调node_exporter的脚本内容，发现是写死的

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655664306280.png)



### 扩容测试

1/ 编辑扩容文件（扩容一个220节点），执行扩容命令

命令： `vi scale-out-tikv.yaml`

扩容命令：tiup cluster scale-out tidb-test scale-out-tikv.yaml 

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655661740189.png)



2/ 到扩容的220上确认 node_exporter 进程正常

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655661861049.png)



3/ 查看220上 node_exporter 组件的启动日志，验证启动的 node_exporter 版本

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655661927287.png)



4/ 验证分发到220这个节点的可执行文件 node_exporter 组件版本

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655662041918.png)



**测试结论：**

经过之前的解决步骤后，***后续的扩容完全会使用1.3.1版本的node_exporter组件，解决方案能解决扩容的问题！\***



## 其他相关FAQ

**问题一：**集群版本进行升级后（离线升级），是否会将各个节点的已升级的node_exporter组件给覆盖掉？升级后再扩容还会使用高版本的node_exporter组件吗？

**解答一：**集群升级后，已升级的各个节点的node_exporter组件并不会被覆盖掉导致版本回退，但是由于本地离线升级后镜像源更换，会重新从新镜像源里面加载该镜像源里面node_exporter组件到.tiup下，导致后面扩容使用低版本组件，这里需要执行以下上一章节《解决扩容节点使用新版本的node_exporter组件的问题》，可解决未来的扩容问题。



**问题二：**我们是否可以直接部署集群前，就定制包含高版本，例如v1.3.1版本的node_exporter组件的镜像源使用？

**解答二：**可以！

**实现步骤简介：**

1/直接将镜像源里面的node_exporter组件包删除

2/使用publish将高版本的组件包发布到镜像源

\#作者认为：看过文章前面部分，就会知道这两步具体怎么操作，我就不再复述啦！


## 作者想说：

1/ 文章篇幅太长，难免出现纰漏，阅读过程中有任何疑问，欢迎直接在评论区提出来进行讨论

2/ 在背景故事中，我们最终目的其实是为了解决 node_exporter 组件的 "panic"，目前已经在测试环境进行升级，一段时间后观察到问题解决了，会在文章评论区答复，欢迎关注本文章

3/ 其实作者希望这篇文章能帮助解决组件相关的一类的问题，不仅仅是 node_exporter 组件，希望以后碰到类似问题也可以用本文章相关内容，进行类比尝试

4/ 关于组件的其他改造使用可以参考另一篇：[专栏 - 记一次tidb离线环境下安装非本地镜像源组件的过程 | TiDB 社区](https://tidb.net/blog/348a4307)

