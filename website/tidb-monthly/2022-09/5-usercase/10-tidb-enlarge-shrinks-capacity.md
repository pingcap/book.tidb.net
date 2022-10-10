---
title: TiDB监控节点扩缩容操作-是否保留监控数据 - TiDB 社区技术月刊
sidebar_label: TiDB监控节点扩缩容操作-是否保留监控数据
hide_title: true
description: 本文将分析一下缩容监控节点，会涉及到一个问题：是否保留监控数据。
keywords: [TiDB, 监控, 扩缩容,保留监控数据]
---

# TiDB监控节点扩缩容操作-是否保留监控数据

> 作者：[Liuhaoao](https://tidb.net/u/Liuhaoao/answer)

最近在扒官方文档的时候，发现只有扩缩容tikv/pd/tidb/tiflash/ticdc的步骤，并没有讲扩缩容Prometheus/alertmanger/grafana的操作步骤，就想到凭借自己的经验写一篇文章出来，供大家参考。由于本人学识浅薄，难免会有疏漏或错误的地方，还望各位路过的大佬不吝赐教(抱拳!)

缩容监控节点，会涉及到一个问题：是否保留监控数据。至于监控数据存存放位置、怎么保留这部分内容我先单独拿出来讲讲，以防后续在看具体操作步骤的时候会有很凌乱的感觉。

## 1、监控数据存放位置查看方法

数据存放位置（**因为我集群是默认部署，所以存放位置也是默认位置。如果自定义部署目录的话，数据存放位置也会变，不同的集群会有很大的区别，所以这里主要是讲方法**）：

1.1、查看Prometheus部署路径：

```markdown
tiup cluster display test1
```

​      ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662302493762.png)

 1.2、进入Prometheus部署目录，可以看到一个scripts目录，存放了Prometheus启动脚本：

```markdown
cd /tidb-deploy/prometheus-9090/
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662302560667.png)

  1.3、查看脚本，可以看到其中有--storage.tsdb.path这一项，对应的目录就是监控数据存放地址：

```markdown
cat run_prometheus.sh
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662302586301.png)


### 还有一种方法也可以查看监控历史数据存放位置

**在进程中查看**

```markdown
ps -ef |grep prometheus|grep "storage.tsdb.path"
```

对应目录为监控历史数据存放位置

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662302651305.png)

 

## 2、备份历史数据

2.1、进入该目录（这一步也是决定缩容监控节点后历史监控数据是否保留的操作），备份历史监控数据：

```markdown
cd /tidb-data/prometheus-9090/
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662302757860.png)

2.2、因历史数据量较大（默认保留30天的历史数据：--storage.tsdb.retention="30d"，因为我的测试集群新搭建不久，也没什么数据量，所以数据并不是很多），所以进行压缩：

```markdown
tar -zcvf prometheus-9090.tar.gz prometheus-9090/
```

 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662302811559.png)

2.3、将压缩文件拷贝到备份目录，至此完成Prometheus历史数据备份：

```markdown
mv prometheus-9090.tar.gz /root/backup/
```

 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662302888686.png)

## 缩容监控节点操作

上边完成了Prometheus历史数据存放位置及备份的讲解，接下来就该进入正题：缩容监控节点操作

1、查看集群现有节点，确认需要缩容节点（自己部署用于测试的小集群，受限于硬件资源，只能单节点部署）：

```markdown
tiup cluster display test1
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303068638.png)

2、确认需缩容的节点信息：

172.21.0.8:9093、172.21.0.8:3000、172.21.0.8:9090三个节点

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303094938.png)

3、缩容前备份数据（参考文章开头的操作步骤）（如无需保留历史数据，则忽略这一步操作）

4、执行缩容操作：

```markdown
tiup cluster scale-in test1 -N 172.21.0.8:9093,172.21.0.8:3000,172.21.0.8:9090
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303143817.png)

5、查看缩容后集群节点信息，尝试访问grafana，确认缩容符合预期：

```markdown
tiup cluster display test1
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303178457.png)

可以看到集群中现在只有tidb、tikv、pd节点，监控节点已经缩容掉

 

尝试访问grafana：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303190261.png)

可以看到grafana已经无法访问，至此缩容操作完成


### 导入监控数据

至于扩容集群监控节点，与其他扩容操作步骤类似，区别就在于多了**导入监控数据**这一步


扩容集群监控节点：

1、编辑扩容文件：

```markdown
vim scale.yaml
monitoring_servers:
  - host: 172.21.0.8
    ssh_port: 22
    port: 9090
    deploy_dir: "/tidb-deploy/prometheus-8249"
    data_dir: "/tidb-data/prometheus-8249"
    log_dir: "/tidb-deploy/prometheus-8249/log"
    
grafana_servers:
  - host: 172.21.0.8
    port: 3000
    deploy_dir: /tidb-deploy/grafana-3000
    
alertmanager_servers:
  - host: 172.21.0.8
    ssh_port: 22
    web_port: 9093
    cluster_port: 9094
    deploy_dir: "/tidb-deploy/alertmanager-9093"
    data_dir: "/tidb-data/alertmanager-9093"
    log_dir: "/tidb-deploy/alertmanager-9093/log"
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303342464.png)

2、执行扩容命令：

```markdown
tiup cluster scale-out test1 scale.yaml
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303385067.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303391541.png)

3、扩容已经完成，查看集群扩容后节点信息：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303400956.png)

监控节点已扩容完成

尝试访问grafana：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303412947.png)

grafana已经能够访问，但是只有集群监控节点扩容完成后的监控数据，并没有历史监控数据，这时候就需要我们文章开头备份的集群历史监控数据了。

4、将备份的集群历史数据导入新部署的集群监控：

因为我们只需要集群的历史数据，所以将备份中历史数据文件导入新集群的监控数据存放目录即可

4.1、将备份历史数据解压缩：

```markdown
tar -xvf prometheus-9090.tar.gz
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303468092.png)

4.2、将数据文件拷贝到新集群的监控数据存放目录

```markdown
cp 01G* /tidb-data/prometheus-8249/
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303478277.png)

5、reload集群，使新集群加载导入的历史数据文件

```markdown
tiup cluster reload test1
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303583959.png)

6、尝试访问grafana监控，时间选择7day，检验历史数据文件导入是否生效

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662303594611.png)

历史数据导入成功，至此扩容集群监控节点及历史数据导入完成


回顾整个缩容过程，最容易出现问题的步骤就是不会考虑到保留历史数据，这一步其实是很重要重要的，比如说集群需要调整new_collations_enabled_on_first_bootstrap这个参数，只能考虑重新部署集群（version<=6.0），这时候就需要在销毁集群前将历史监控数据备份，集群重新部署完成后将历史监控数据再恢复，如果没有备份历史监控数据，就可能会有问题。就备份历史数据而言，其实操作起来很容易，只需将数据备份，导入到监控数据存放目录，然后reload即可。

以上就是缩容监控节点及历史监控数据备份恢复的操作步骤，希望对大家有所帮助。