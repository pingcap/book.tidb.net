---
title: 生产环境TiDB集群缩容TiKV操作步骤
hide_title: true
---

# 生产环境TiDB集群缩容TiKV操作步骤

**Liuhaoao** 发表于  **2022-06-02**

​        最近做了个集群TiKV节点缩容的操作，开始前本来是信心满满，毕竟当初刚接触TiDB的时候，这缩容操作做的次数可不少，本以为是个手到擒来的工作，可是在实际操作过程中，还是遇到了不少自己在初学的时候没有注意到的点，比如说tikv的Tombstone状态、修改PD参数、在PD中删除Tombstone状态的TiKV节点等，写操作文档的时候遇到各种磕磕绊绊，请教前辈、查官网一步步做下来。不过好在实际操作过程中一切顺利。在此将缩容TiKV的操作步骤分享出来，给和我一样的各位初学者和没有做过类似操作的同学一个参考。也希望如果有幸被哪位大佬看到，辛苦帮我查漏补缺

​        集群架构：

​        `缩容前集群架构：9TiDB server + 3PD server + 14TiKV server`

​        `预期缩容后集群架构： 9TiDB server + 3PD server + 10TiKV server`

​        需求背景：因生产环境资源较紧张，经评估集群的数据量不是很大，可以缩容出来几个TiKV节点临时挪用，待集群的数据量增长到一定程度，再把TiKV给扩容出来。

​        整个缩容步骤做完大概花了6小时左右，之前在学习TiDB的时候，做个缩容TiKV的操作，可能也就是一小时不到。之所以耗费了这么久的时间，主要是在等待集群balance。balance这一步，主要是TiKV节点缩容命令执行完成后，这些节点中的数据将被调度到其他节点，如果数据量大的话，就需要等待久一些（我在做的时候，集群的数据量是7T左右，balance阶段耗时在五小时左右）。接下来我先讲讲缩容的具体过程，有一些注意事项，或者是在做实验的时候不会去关注到的点，我放在文章的最后。

1、**查看现有集群节点及其状态：**

```
su - tidb
tiup cluster display tidb-test
```

2、**确认需缩容的节点实例情况：**

确认需缩容的节点为10.3.65.141:20161

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654076477802.png)

3、**缩容前，登录grafana监控界面，检查检查集群region health、region leader分布情况，磁盘io、内存、cpu及集群负载等各项关键指标是否正常。**

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654082230594.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654076055223.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654076128292.png)

（因为需要缩容的节点是我刚才在测试集群扩容出来的，所以监控曲线有些升高，对缩容无影响，暂且忽略。如果是在生产环境操作，需排查清楚各项指标升高原因，确认处理完毕恢复正常或对缩容无影响再做操作）

4、**修改PD参数，加快balance进度**

```
/tidb-data1/pd/tidb-deploy/pd-2379/bin/pd-ctl -i -u http://127.0.0.1:2379
```

\#查看参数

```
» config show » store limit（将集群原参数设置保留一份，修改如果出现问题可迅速修改回原参数）
```

\#修改参数

```
» config set max-pending-peer-count 256（控制单个 store 的 pending peer 上限，防止在部分节点产生大量日志落后的 Region。需要加快补副本或 balance 速度可以适当调大这个值，设置为 0 则表示不限制。）
» config set replica-schedule-limit 512 （可以控制同时进行 replica 调度的任务个数。这个配置主要控制节点挂掉或者下线的时候进行调度的速度，值越大调度得越快，设置为 0 则关闭调度。Replica 调度的开销较大，一般不建议将此值设置过大，但我这是测试集群，设置值大一些加快速度。）
» store limit all 800 add-peer（设置所有 store 添加 peer 的速度上限为每分钟 800 个）
» store limit all 20000 remove-peer（设置所有 store 删除 peer 的速度上限为每分钟20000个）
```

\#如有问题，回滚原参数

5、**开始缩容：**

使用screen工具执行，因为缩容过程命令可能会执行很久，防止因意外导致链接断开，命令执行失败：

```
screen -S test
tiup cluster scale-in tidb-test -N 10.3.65.141:20161
```

**命令执行过程中，关注集群监控，检查leader与region是否平滑迁出缩容的tkv实例，region health、leader region分布状态，磁盘io使用状态，内存使用情况。**

**缩容前集群各项监控指标：**

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654076294243.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654082995001.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654083021614.png)

**缩容命令执行完成后集群各项监控指标：**

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654083067038.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654083093851.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654083131451.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654076728952.png)

从监控图可以看出，集群已经开始迁移副本，数据量越大，迁移副本耗时越久。迁移副本过程中，需要关注集群关键指标，出现问题及时处理。

6、**节点缩容完成后，检查集群状态：**

tiup cluster display tidb-test

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654078781854.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654079050028.png)

确认已经缩容的节点状态为Tombstone，同时登录grafana监控界面，进入overview-->TiKV面板，查看leader及region分布情况，确认迁移副本调度完成。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654078960828.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654079290775.png)

确认balance完成，开始执行清理命令

```
tiup cluster prune tidb-test
tiup cluster display tidb-test
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654079788523.png)

至此集群已经缩容完成，缩容后的集群符合预期，但还需进入pd删除tombstone组件，否则grafana监控还会记录tombstone kv。

检查是否有tombstone组件：

./pd-ctl store --state Tombstone

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654080258289.png)

./pd-ctl store remove-tombstone

./pd-ctl store --state Tombstone

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654080318563.png)

**清理完成：**

登录grafana监控面板，查看集群各项健康指标是否正常，节点数量是否符合预期。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654080612458.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1654080456661.png)

集群组件状态正常，节点数量符合预期。



最后将PD参数调整回集群原参数。

```
#将PD参数调整回原参数
/tidb-data/pd/tidb-deploy/pd-2379/bin/pd-ctl -i -u http://127.0.0.1::2379
» config set max-pending-peer-count 16
» config set replica-schedule-limit 64
» store limit all 15 add-peer
» store limit all 15 remove-peer
#检查参数
» config show » store limit
```

确认集群参数已经修改至缩容前状态。至此，TiKV节点已缩容完毕。



​        我在最后做总结的时候，发现一部分操作步骤比较重要，或者说是像我一样初学者在做实验的时候，比较容易遗漏的几个点：

​        1、在缩容开始之前，如果集群的数据量较大，可以去调整一些PD参数，来加快迁移副本进度。具体的参数因人而异，大家可以去[官方文档](https://docs.pingcap.com/zh/tidb/stable/pd-control#config-show--set-option-value--placement-rules) 中找找。我调整的那部分参数，也可以拿来参考，但是在调整参数之前，一定得将原参数值保留一份，以防万一参数调整出问题的话，及时回退。

​        2、需要等待集群迁移副本，这一步是比较容易遗漏的操作，因为我们用来做实验的集群，可能没什么数据量，这一步耗时很短，不会去刻意等待，或者是在做的时候，就不会想到这一步。

​        3、在缩容完成之后，需要在PD中删除状态为Tombstone的节点，否则grafana监控还会记录tombstone kv，这一步我们在做实验的时候，也是不会去特别关注的点。



**至此，我的这个缩容操作已经讲完了，中间添加了一些做的时候自己的理解，各位大佬如果有什么想要补充的，或者是发现我有写的不对的地方，欢迎补充**