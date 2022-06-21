---
title: 体验 TiDB v6.0.0 之 Clinic
hide_title: true
---

# 体验 TiDB v6.0.0 之 Clinic

>By [边城元元](https://tidb.net/u/边城元元/post/all)

## 一、背景

TiDB 的生态越来越完善，带来利好的同时，也增加了运维不可确定性。

Clinic 的出现降低了运维成本，可以快速收集帮助定位问题的完整信息。对于使用 TiUP 部署的 TiDB 集群和 DM 集群，PingCAP Clinic 诊断服务（以下简称为 Clinic）可以通过 Diag 诊断客户端（以下简称为 Diag）与 [Clinic Server 云诊断平台](https://clinic.pingcap.com.cn/)（以下简称为 Clinic Server）实现远程定位集群问题和本地快速检查集群状态。基于好奇，对新技术的敬畏，记录 Clinic 之旅。

Clinic 目前支持 TiUP 部署的 v4.0 以上的 TiDB 本地集群和 TiDB Cloud。

## 二、Clinic 工作原理

> 使用 Clinic 需要安装 Diag 组件

1、Diag 首先需要获取集群拓扑信息，然后通过几种不同的数据采集方式进行诊断数据采集。

- 获取集群拓扑信息

从部署工具（ tiup-cluster/tidb-operator) 获取集群拓扑信息。

- 数据采集方式&#x20;

1） scp 方式传输服务器文件

对于 TiUP 部署的集群，通过 scp 方式直接从目标组件节点采集日志文件、配置文件。

2）ssh 远程执行命令采集数据

对于 TiUP 部署的集群，Diag 可以通过 ssh 到目标组件系统，执行 insight 等命令获取系统信息，包括内核日志、内核参数、基础的系统和硬件信息等。

3）http 调用采集数据

调用 TiDB 组件的 http 接口，获取 TiDB、TiKV、PD 等组件的实时配置、实时性能采样信息。调用 Prometheus 的 http 接口，获取 alert 信息和 metrics监控数据。

4）SQL 语句查询数据库参数

通过 SQL 语句，查询 TiDB 数据库的系统参数等信息，该方式需要用户在采集时额外提供访问 TiDB 数据库的用户名和密码。

2、上传采集数据到 Clinic Server 平台

对于使用 TiUP 部署的 TiDB 集群和 DM 集群，Clinic 诊断服务可以通过 Diag 诊断客户端（以下简称为 Diag）与 [Clinic Server 云诊断平台](https://clinic.pingcap.com.cn/) 实现远程定位集群问题和本地快速检查集群状态。

## 三、体验目标

1. 体验 Clinic 基于 TiD v6.0.0 离线安装版
2. 体验 远程协助快速定位集群问题

### 3.1 安装 TiDB 集群（这里不再详细说明）

> cluster111.yml 拓扑参考 <https://tidb.net/blog/af8080f7>

#### 3.1.1 离线安装 TiDB v6.0.0

离线安装 （安装速度快）

```shell

# 载离线包 覆盖TiUP 会完成覆盖升级
tar xzvf tidb-community-server-${version}-linux-amd64.tar.gz
sh tidb-community-server-${version}-linux-amd64/local_install.sh
source /root/.bash_profile

tiup update cluster
tiup cluster check ./cluster111.yml --user root -p --apply 
tiup cluster deploy cluster111 v6.0.0 ./cluster111.yml --user root -p

```

### 3.2 安装 Clinic

#### 3.2.1 安装 Diag

```shell
#在安装了 TiUP 的中控机上，一键安装 Diag
tiup install diag

```

#### 3.2.2 登录 Clinic 站点获取 Token

> <https://clinic.pingcap.com.cn/portal>
> 1. 使用社区账号登录
> 2. 先设置组织
> 3. 右下角获取 Token

<center>
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728143485.png)
</center>

```shell
# 设置上传采集数据的token
# 该 Token 只用于数据上传，访问数据时不需要使用 Token。
tiup diag config clinic.token ${token-value}
```

### 3.3 采集 TiDB 集群数据

例如，如需采集从当前时间的 4 小时前到 2 小时前的诊断数据，可以运行以下命令：

```shell

tiup diag collect ${cluster-name} -f="-4h" -t="-2h"

```

- 运行 Diag 数据采集命令后，Diag 不会立即开始采集数据，而会在输出中提供预估数据量大小和数据存储路径，并询问你是否进行数据收集。如果确认要开始采集数据，请输入 Y。

- 采集完成后，Diag 会提示采集数据所在的文件夹路径。

#### 3.3.1 采集 TiDB 集群 cluster111

采集4 小时前到现在的数据

```shell
# 命令后面加上 -y 后,当执行该命令后,出现 需要选择确认或取消的时候,(即选择y/n的时候),自动选择y
tiup diag collect cluster111 -f="-4h" -y

```

<center>
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728174858.png)
</center>

<center>
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728193065.png)
</center>

#### 3.3.2 上传采集数据

```shell
# 将采集到的数据上传到 Clinic Server。
# 2.1 在线上传
#上传数据（数据包文件夹）的大小不得超过 10 GB，否则会导致上传失败。
# tiup diag upload ${filepath}
tiup diag upload /usr/local0/webserver/tidb/diag-fSk85byRYW6

# 使用该方式进行上传时，你需要使用 Diag v0.7.0 及以上版本。

# 2.2 上传方式 2：打包后上传。
tiup install diag
tiup diag collect cluster111 -f="-4h" -y
tiup diag package ${filepath}
#打包时，Diag 会同时对数据进行压缩和加密。
# 会生成.diag文件

# 使用可以访问互联网的机器上传数据压缩包。

tiup diag upload ${filepath}
```

<center>
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728215744.png)
</center>

#### 3.3.3 登录 Clinic 服务验证采数据

##### 3.3.3.1 集群数据的上报情况

<center>
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655719964734.png)
</center>

完成数据上传后，通过上传输出结果中的 Download URL 获取诊断数据的链接。

##### 3.3.3.2 Clinic Server 中数据展示

**1、默认页**

![1.PNG](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1655396603159.png)

**2、Metrics**

使用在线的 grafana 展示 Metrics 指标数据

![4.PNG](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/4-1655396742770.png)

![5.PNG](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/5-1655396769120.png)

**3、Instance Logs**

可以对日志进行在线日志检索

![2.PNG](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/2-1655396885384.png)

![3.PNG](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/3-1655396913016.png)

**4、Show Queries**

可以进行在线 SQL 分析

![6.PNG](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/6-1655397056598.png)

![7.PNG](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/7-1655397093244.png)

**5、Download Data**

官方授权开发专家可以下载采集数据，协助诊断。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655397326036.png)

#### 3.3.4 体验过程中遇到的问题

##### 3.3.4.1 如果集群停止了 Clinic 将不可用

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728262909.png)

##### 3.3.4.2 如果 PD 挂掉 Clinic 将不可用

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728273552.png)

**提醒：**

1、 Clinic 需要从 PD 获取集群拓扑。

2、 PD 正常的情况下可以收集集群信息

3、本地快速检查集群状态

只能检测 --include ="config"

```markdown
tiup diag collect ${cluster-name} --include="config"
tiup diag collect cluster111 --include="config"
tiup diag check ${filepath}
```

##### 3.3.4.3 PD 正常 如果 TiKV 挂掉

- 1）收集信息成功

- 2）tiup diag check 失败

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728284251.png)

##### 3.3.4.4 PD 正常如果 TiDB 挂掉

- 1）收集信息成功

- 2）tiup diag check 失败

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728294818.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728300001.png)

##### 3.3.4.5 PD 正常，有一个节点异常

将无法在本地 使用 tiup diag check ${filepath}

- 1）收集信息成功

- 2）tiup diag check 失败

- 3）可以upload

#####

```shell
tiup diag package 
tiup diag upload ${filepath}

#如果修改token 需要删除原来的.diag文件，重新 package
tiup diag config clinic.token  ${token}
```

##### 3.3.4.6 节点都正常启动的情况下

> 可以使用tiup diag check ${filepath}

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728313290.png)

### 3.4 采集 DM 集群的数据

#### 3.4.1 安装 DM 组件

```shell
# 方式1 

tar xzvf  dm-v1.9.4-linux-amd64.tar.gz
chmod +x ./tiup-dm && mv ./tiup-dm /root/.tiup/bin/
tiup-dm list

# 方式2 （推荐）
tiup list dm
tiup install dm:v1.9.4
```

#### 3.4.2 安装 DM 集群

（略）。

#### 3.4.3 采集 DM 集群数据

##### 1、采集 DM 集群数据常用命令

```shell
# 采集 DM 数据的常用命令
tiup diag collectdm <dm-custername>
tiup diag package ${filepath}
# 上传 采集数据
tiup upload ${filepath}.diag

```

##### 2、采集 DM 集群数据

```shell
[root@bogon vagrant]# tiup diag collectdm dm-cluster111
tiup is checking updates for component diag ...
Starting component `diag`: /root/.tiup/components/diag/v0.7.0/diag /root/.tiup/components/diag/v0.7.0/diag collectdm dm-cluster111
Detecting metadata of the cluster...

Detecting alert lists from Prometheus node...

Detecting metrics from Prometheus node...

No Prometheus node found in topology, skip.
Detecting basic system information of servers...

Detecting logs of components...

+ Download necessary tools
  - Downloading collecting tools for linux/amd64 ... Done
+ Collect host information
  - Scraping log files on 10.0.2.15:22 ... ⠧ CopyComponent: component=diag, version=, remote=10.0.2.15:/tmp/tiup os=linux, arch=amd64
+ Collect host information
  - Scraping log files on 10.0.2.15:22 ... ⠹ Shell: host=10.0.2.15, sudo=false, command=`/tmp/tiup/bin/scraper --log '/home/tidb/deploy/dm-master-8261/log/*,/hom...
+ Collect host information
  - Scraping log files on 10.0.2.15:22 ... Done
Detecting config files of components...

+ Download necessary tools
  - Downloading collecting tools for linux/amd64 ... Done
+ Collect host information
  - Scraping log files on 10.0.2.15:22 ... ⠋ CopyComponent: component=diag, version=, remote=10.0.2.15:/tmp/tiup os=linux, arch=amd64
+ Collect host information
  - Scraping log files on 10.0.2.15:22 ... Done
Detecting dm audit logs of components...

+ Collect TiUP dm audit log information
  - Scraping TiUP dm audit log ... Done
Time range:
  2022-05-02T07:12:52Z - 2022-05-02T09:12:52Z (Local)
  2022-05-02T07:12:52Z - 2022-05-02T09:12:52Z (UTC)
  (total 7200 seconds)

Estimated size of data to collect:
Host       Size       Target
----       ----       ------
10.0.2.15  392.19 kB  /home/tidb/deploy/dm-worker-8262/log/dm-worker.log
10.0.2.15  106.28 kB  /home/tidb/deploy/dm-worker-8262/log/dm-worker_stderr.log
10.0.2.15  11.08 kB   /home/tidb/deploy/dm-worker-8262/log/dm-worker_stdout.log
10.0.2.15  383.89 kB  /home/tidb/deploy/dm-master-8261/log/dm-master.log
10.0.2.15  1.80 kB    /home/tidb/deploy/dm-master-8261/log/dm-master_stderr.log
10.0.2.15  330 B      /home/tidb/deploy/dm-worker-8262/conf/dm-worker.toml
10.0.2.15  345 B      /home/tidb/deploy/dm-master-8261/conf/dm-master.toml
localhost  2.30 kB    1 TiUP dm audit logs
Total      898.20 kB  (inaccurate)
These data will be stored in /home/vagrant/diag-fSwQn7ZDb6f
Do you want to continue? [y/N]: (default=N) y
Collecting metadata of the cluster...

Error collecting metadata of the cluster: no endpoint available, the data might be incomplete.
Collecting alert lists from Prometheus node...

No monitoring node (prometheus) found in topology, skip.
Collecting metrics from Prometheus node...

No Prometheus node found in topology, skip.
Collecting basic system information of servers...

+ Download necessary tools
  - Downloading check tools for linux/amd64 ... Done
+ Collect host information
+ Collect host information
  - Getting system info of 10.0.2.15:22 ... Done

+ Collect system information
  - Collecting system info of node 10.0.2.15 ... Done
+ Cleanup temp files
  - Cleanup temp files on 10.0.2.15:22 ... Done
  - Cleanup temp files on 10.0.2.15:22 ... Done
Collecting logs of components...

+ Scrap files on nodes
  - Downloading log files from node 10.0.2.15 ... Done
+ Cleanup temp files
  - Cleanup temp files on 10.0.2.15:22 ... Done
Collecting config files of components...

+ Scrap files on nodes
  - Downloading config files from node 10.0.2.15 ... Done
+ Cleanup temp files
  - Cleanup temp files on 10.0.2.15:22 ... Done


+ Query realtime configs
  - Querying configs for tikv 10.0.2.15:8261 ... Error
  - Querying configs for tikv 10.0.2.15:8262 ... Error
Error collecting config files of components: Get "http:?full=true": http: no Host in request URL, the data might be incomplete.
Collecting dm audit logs of components...

+ Scrap TiUP audit logs
  - copy TiUP dm audit log files ... Done
Some errors occurred during the process, please check if data needed are complete:
metadata of the cluster:        no endpoint available

config files of components:     Get "http:?full=true": http: no Host in request URL

Collected data are stored in /home/vagrant/diag-fSwQn7ZDb6f


```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728337265.png)

### 3.5 采集 TiFlash 数据

> Clinic 对 TiFlash 的信息收集集成在 TiDB 集群里
> 通过 tiup diag collect  即可收集到

```shell
# 扩容 tiflash （本地测试内存要大于4G）
tiup cluster scale-out cluster111 ./scale-out-${nodename}.yml -uroot -p 


# 按库构建 TiFlash 副本
ALTER DATABASE db_name SET TIFLASH REPLICA count;

```

### 3.6 采集 TiCDC

> Clinic 对 TiCDC 的信息收集集成在 TiDB 集群里
> 通过 tiup diag collect  即可收集到

```shell
# 扩容 ticdc
tiup cluster scale-out cluster111 ./scale-out-${nodename}.yml -uroot -p 

```

> 注意使用cdc server 增加的ticdc节点将无法使用clinic收集到信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728350945.png)

## 四、信息安全

- 1、Clinic 采集的诊断数据类型包括（配置、拓扑，日志），详情见 <https://docs.pingcap.com/zh/tidb/v6.0/clinic-data-instruction-for-tiup>

- 2、通过 PingCAP Clinic 在使用 TiUP 部署的集群中采集的数据**仅**用于诊断和分析集群问题。

- 3、Clinic 上传数据采用认证或加密上传到 Clinic server，Clinic Server 是部署在云端的云服务，位于 PingCAP 内网（中国境内），只有经授权的内部技术人员可以访问该数据；

## 五、总结

1、Clinic 简化了日志收集和协助分析，非常感谢 PingCAP 带来这样工具！

2、对 Clinic 的期许

- Clinic 如果 PD 挂掉的情况下，如何收集 信息上传，即对异常集群的收集和分析

3、发稿后 TiDB 的大佬告知可以通过 tiup diag collect -R=（组件）来收集指定组件的信息，这个功能太棒了！

再次谢谢 PingCAP，感谢 TiDB 社区！

## 六、参考

- [【SOP 系列 22】TiDB 集群诊断信息收集 Clinic 使用指南 & 资料大全](https://asktug.com/t/topic/272957)
- [Clinic 数据采集说明](https://docs.pingcap.com/zh/tidb/v6.0/clinic-data-instruction-for-tiup#Clinic)
- [Clinic 快速上手指南](https://docs.pingcap.com/zh/tidb/v6.0/quick-start-with-clinic)
- [Clinic 使用指南](https://asktug.com/t/topic/664214)