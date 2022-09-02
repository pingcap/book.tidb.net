
---
title: 离线部署系列文章之二：TiDB 集群升级（5.3.0->5.4.2）&缩扩容 TiDB Server、PD、TiKV、TiFlash - TiDB 社区技术月刊
sidebar_label: 离线部署系列文章之二：TiDB 集群升级（5.3.0->5.4.2）&缩扩容 TiDB Server、PD、TiKV、TiFlash
hide_title: true
description: 本文主要介绍 TiDB 集群升级（5.3.0->5.4.2）&缩扩容 TiDB Server、PD、TiKV、TiFlash。
keywords: [TiDB, 集群升级, TiDB v5.3.0, TiDB v5.4.2, TiDB Server, PD, TiKV, TiFlash]

---



# 离线部署系列文章之二：TiDB集群升级（5.3.0->5.4.2）&缩扩容 TiDB Server、PD、TiKV、TiFlash



> 作者：OnTheRoad

本文档的部署路线图为：

1. 离线部署 TiDB v5.3.0（`TiDB*3、PD*3、TiKV*3`）；
2. 源码部署 Haproxy v2.5.0与用户管理
3. **离线升级 TiDB v5.3.0 至 TiDB v5.4.2；**
4. **缩扩容 TiDB Server、PD、TiKV、TiFlash**
5. 部署 TiSpark（`TiSpark*3`）
6. 离线升级 TiDB v5.4.2 至 TiDB v6.1

## 3. TiDB集群升级
### 3.1. 升级至 5.4.x 版本

升级文档可参考官网链接： https://docs.pingcap.com/zh/tidb/v5.4/upgrade-tidb-using-tiup﻿

#### 3.1.1. 5.4.x 关键特性

发版日期：2022 年 2 月 15 日，5.4.0 关键特性如下：

1. 支持 GBK 字符集
2. 支持索引合并 (Index Merge) 数据访问方法，能够合并多个列上索引的条件过滤结果
3. 支持通过 session 变量实现有界限过期数据读取
4. 支持统计信息采集配置持久化
5. 支持使用 Raft Engine 作为 TiKV 的日志存储引擎【实验特性】
6. 优化备份对集群的影响
7. 支持 Azure Blob Storage 作为备份目标存储
8. 持续提升 TiFlash 列式存储引擎和 MPP 计算引擎的稳定性和性能
9. 为 TiDB Lightning 增加已存在数据表是否允许导入的开关
10. 优化持续性能分析【实验特性】
11. TiSpark 支持用户认证与鉴权

#### 3.1.2. 兼容性

| 变量名                                                       | 修改类型 | 描述                                                         |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------------ |
| [`tidb_enable_column_tracking`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_enable_column_tracking-从-v540-版本开始引入) | 新增     | 用于控制是否开启 TiDB 对 `PREDICATE COLUMNS` 的收集，默认值为 `OFF`。 |
| [`tidb_enable_paging`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_enable_paging-从-v540-版本开始引入) | 新增     | 此变量用于控制 `IndexLookUp` 算子是否使用分页 (paging) 方式发送 Coprocessor 请求，默认值为 `OFF`。对于使用 `IndexLookUp` 和 `Limit` 并且 `Limit` 无法下推到 `IndexScan` 上的读请求，可能会出现读请求的延迟高、TiKV 的 Unified read pool CPU 使用率高的情况。在这种情况下，由于 `Limit` 算子只需要少部分数据，开启 `tidb_enable_paging`，能够减少处理数据的数量，从而降低延迟、减少资源消耗。 |
| [`tidb_enable_top_sql`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_enable_top_sql-从-v540-版本开始引入) | 新增     | 用于控制是否开启 Top SQL 特性，默认值为 OFF。                |
| [`tidb_persist_analyze_options`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_persist_analyze_options-从-v540-版本开始引入) | 新增     | 用于控制是否开启 [ANALYZE 配置持久化](https://docs.pingcap.com/zh/tidb/v5.4/statistics#analyze-配置持久化)特性，默认值为 `ON`。 |
| [`tidb_read_staleness`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_read_staleness-从-v540-版本开始引入) | 新增     | 用于设置当前会话允许读取的历史数据范围，默认值为 `0`。       |
| [`tidb_regard_null_as_point`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_regard_null_as_point-从-v540-版本开始引入) | 新增     | 用于控制优化器是否可以将包含 null 的等值条件作为前缀条件来访问索引。 |
| [`tidb_stats_load_sync_wait`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_stats_load_sync_wait-从-v540-版本开始引入) | 新增     | 这个变量用于控制是否开启统计信息的同步加载模式（默认为 `0` 代表不开启，即为异步加载模式），以及开启的情况下，SQL 执行同步加载完整统计信息等待多久后会超时。 |
| [`tidb_stats_load_pseudo_timeout`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_stats_load_pseudo_timeout-从-v540-版本开始引入) | 新增     | 用于控制统计信息同步加载超时后，SQL 是执行失败 (`OFF`) 还是退回使用 pseudo 的统计信息 (`ON`)，默认值为 `OFF`。 |
| [`tidb_backoff_lock_fast`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_backoff_lock_fast) | 修改     | 默认值由 `100` 修改为 `10`。                                 |
| [`tidb_enable_index_merge`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_enable_index_merge-从-v40-版本开始引入) | 修改     | 默认值由 `OFF` 改为 `ON`。如果从低于 v4.0.0 版本升级到 v5.4.0 及以上版本的集群，该变量值默认保持 `OFF`。如果从 v4.0.0 及以上版本升级到 v5.4.0 及以上版本的集群，该变量开关保持升级前的状态。对于 v5.4.0 及以上版本的新建集群，该变量开关默认保持 `ON`。 |
| [`tidb_store_limit`](https://docs.pingcap.com/zh/tidb/v5.4/system-variables#tidb_store_limit-从-v304-和-v40-版本开始引入) | 修改     | v5.4.0 前支持实例级别及集群级别的设置，现在只支持集群级别的设置。 |

### 3.2. 升级前准备

#### 3.2.1. 更新 TiUP 离线镜像

可参考 `1.5.1. 部署TiUP组件`，部署新版 TiUP 离线镜像。上传到中控机。在执行 `local_install.sh` 后，TiUP 会执行 `tiup mirror set tidb-community-server-$version-linux-amd64` 指定新版离线镜像源。

离线镜像包下载地址 https://pingcap.com/zh/product-community﻿

```
~]$ id
uid=1000(tidb) gid=1000(tidb) groups=1000(tidb)

~]$ tar -xzvf tidb-community-server-v5.4.2-linux-amd64.tar.gz
~]$ sh tidb-community-server-v5.4.2-linux-amd64/local_install.sh
~]$ source /home/tidb/.bash_profile

~]$ tiup update cluster
Updated successfully!
```

此时离线镜像已经更新成功。如果覆盖后发现 TiUP 运行报错，可尝试 `rm -rf ~/.tiup/manifests/*` 后再使用。

#### 3.2.2. 修改存在冲突的配置项

通过命令 `tiup cluster edit-config <集群名>` 载入 TiDB 集群配置，修改存在冲突的配置项。若原集群未修改过默认的配置参数，可忽略此步骤。

```
~]$ tiup cluster edit-config kruidb-cluster
```

> **注意**以下 TiKV 参数在 TiDB v5.0 已废弃。如果在原集群配置过以下参数，需要通过 edit-config 编辑模式删除这些参数：
>
> 1. pessimistic-txn.enabled
> 2. server.request-batch-enable-cross-command
> 3. server.request-batch-wait-duration

#### 3.2.3. 集群健康检查

升级前，通过 `tiup cluster check <集群名> --cluster` 对集群当前的 region 健康状态进行检查。

```
~]$ tiup cluster check kruidb-cluster --cluster

...
192.168.3.225  cpu-governor  Warn    Unable to determine current CPU frequency governor policy
192.168.3.225  memory        Pass    memory size is 4096MB
Checking region status of the cluster kruidb-cluster...
All regions are healthy.
```

如果结果为 “`All regions are healthy`”，则说明当前集群中所有 region 均为健康状态，可以继续执行升级；

如果结果为 “`Regions are not fully healthy: m miss-peer, n pending-peer`” 并提示 “`Please fix unhealthy regions before other operations.`”，则说明当前集群中有 region 处在异常状态，应先排除相应异常状态。

### 3.3. 升级集群

TiUP Cluster 包括不停机升级与停机升级两种方式。

默认为不停机升级，即升级过程中集群仍然可以对外提供服务。升级时会对各 TiKV 节点逐个迁移 Leader 后再升级和重启，因此对于大规模集群需要较长时间才能完成整个升级操作。

停机升级则避免了调度 Leader 的过程，若业务可停机，则可以使用停机升级的方式快速进行升级操作。

#### 3.3.1. 停机升级

```
# 1. 关闭 TiDB 集群
~]$ tiup cluster stop kruidb-cluster

# 2. 升级 TiDB 集群
~]$ tiup cluster upgrade kruidb-cluster v5.4.2 --offline

# 3. 启动 TiDB 集群
~]$ tiup cluster start kruidb-cluster
```

#### 3.3.2. 不停机升级

```
# 不停机升级 TiDB 集群
~]$ tiup cluster upgrade kruidb-cluster v5.4.2

tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster upgrade kruidb-cluster v5.4.2
This operation will upgrade tidb v5.3.0 cluster kruidb-cluster to v5.4.2.
Do you want to continue? [y/N]:(default=N)y

......
Upgrading component pd
        Restarting instance 192.168.3.221:2379
        Restart instance 192.168.3.221:2379 success
        Restarting instance 192.168.3.222:2379
        Restart instance 192.168.3.222:2379 success
        Restarting instance 192.168.3.223:2379
        Restart instance 192.168.3.223:2379 success
Upgrading component tikv
        Evicting 4 leaders from store 192.168.3.224:20160...
          Still waitting for 4 store leaders to transfer...
          Still waitting for 4 store leaders to transfer...         
          ......
        Restarting instance 192.168.3.224:20160   
Upgrading component tidb
        Restarting instance 192.168.3.221:4000
        ......
        
Starting component blackbox_exporter        
        Start 192.168.3.221 success
        ......
Upgraded cluster `kruidb-cluster` successfully          
```

升级 TiKV 期间，会逐个将 TiKV 上的所有 Leader 切走再停止该 TiKV 实例。默认超时时间为 5 分钟（300 秒），超时后会直接停止该实例。可通过 `--transfer-timeout` 将超时时间指定为一个更大的值，如 `--transfer-timeout 3600`，单位为秒。

> **注意**若想将 TiFlash 从 5.3 之前的版本升级到 5.3 及之后的版本，必须进行 TiFlash 的停机升级。步骤如下：
>
> ```
> # 1. 关闭 TiFlash 实例
> ~]$ tiup cluster stop kruidb-cluster -R tiflash
> 
> # 2. --offline 以不重启的方式，升级 TiDB 集群
> ~]$ tiup cluster upgrade kruidb-cluster v5.4.2 --offline
> 
> # 3. reload 集群，TiFlash 也会正常启动
> ~]$ tiup cluster reload kruidb-cluster
> ```

### 3.4. 升级验证

```
~]$ tiup cluster display kruidb-cluster

tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb-cluster
Cluster type:       tidb
Cluster name:       kruidb-cluster
Cluster version:    v5.4.2
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
Grafana URL:        http://192.168.3.221:3000
......
```

### 3.5. 升级FAQ

#### 3.5.1. 升级中断后继续升级

升级报错中断，排错后重新执行 `tiup cluster upgrade` 命令，继续升级。

若不希望重启已升级过的节点，可按如下步骤进行。

1. 确定失败的节点 ID，记为 `<Audit ID>`

```
~]$ tiup cluster audit

tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster audit
ID           Time                       Command
--           ----                       -------
fWDnXxZpQ5G  2022-07-25T17:02:32+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster template
fWDnZLRQttJ  2022-07-25T17:03:11+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster template
fWDp44XHFw7  2022-07-25T17:04:27+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster template
fWDpyj6Qbcq  2022-07-25T17:11:33+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster check ./topology.yaml --user tidb
fWDpKg3hbwg  2022-07-25T17:14:11+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster check ./topology.yaml --apply --user root
fWDpNrc8pn1  2022-07-25T17:15:06+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster check ./topology.yaml --user tidb
fWDq5SPjQsW  2022-07-25T17:19:56+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster check ./topology.yaml --user tidb
fWDqcJwFnB3  2022-07-25T17:21:38+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster check ./topology.yaml --user tidb
fWDqsr5r9zF  2022-07-25T17:25:05+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster check ./topology.yaml --user tidb
fWDr9dxMr6F  2022-07-25T17:35:52+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster check ./topology.yaml --user tidb
fWDrH4pJjpm  2022-07-25T17:43:27+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster deploy kruidb-cluster v5.3.0 ./topology.yaml --user tidb
fWDrMwhrcL3  2022-07-25T17:44:45+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster display kruidb-cluster
fWDrQCMcGdM  2022-07-25T17:45:40+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster start kruidb-cluster
fWDrSX3Djmk  2022-07-25T17:46:20+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster display kruidb-cluster
fWDs1sMGK7m  2022-07-25T17:48:33+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster edit-config kruidb-cluster
fWDs6Tk2kdB  2022-07-25T17:50:08+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster list
fWDMzrPWZ21  2022-07-25T21:56:04+08:00  /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster display kruidb-cluster
fWGm3DMvvkR  2022-07-26T18:00:00+08:00  /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster edit-config kruidb-cluster
fWGm48bVhDw  2022-07-26T18:00:09+08:00  /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster check kruidb-cluster --cluster
fWGp8JYqVFL  2022-07-26T18:31:24+08:00  /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster upgrade kruidb-cluster v5.4.2
fWGpwx1834M  2022-07-26T18:36:38+08:00  /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb-cluster
```

1. 重试失败的节点

```
~]$ tiup cluster replay <Audit ID>
```

#### 3.5.2. evict leader 等待时间过长

```
~]$ tiup cluster upgrade kruidb-cluster v5.4.2 --force
```

> **注意**`--force` 参数可以不驱逐 Leader，直接快速升级集群至新版本，但是该方式会忽略所有升级中的错误，在升级失败后得不到有效提示，需谨慎使用。

#### 3.5.3. 更新 pd-ctl 等周边工具版本

通过 TiUP 安装对应版本的 ctl 组件来更新相关工具版本。

```
~]$ tiup install ctl:v5.4.2
~]$ tiup list --installed --verbose

Available components:
Name     Owner    Installed       Platforms    Description
----     -----    ---------       ---------    -----------
bench    pingcap  v1.7.0          linux/amd64  Benchmark database with different workloads
cluster  pingcap  v1.10.2,v1.7.0  linux/amd64  Deploy a TiDB cluster for production
ctl      pingcap  v5.4.2          linux/amd64  TiDB controller suite
```

关于 TiUP 组件的使用，可参考官网 https://docs.pingcap.com/zh/tidb/v5.4/tiup-component-management


## 4. 扩缩容TiDB/PD/TiKV/TiFlash

### 4.1. 扩容 TiDB/PD/TiKV

#### 4.1.1. 节点配置

1. 按 `1.3 主机配置` 章节，为待扩容节点创建 tidb 用户、免密登录、系统优化等。

#### 4.1.2. 节点配置文件

编辑扩容配置文件 tidb-scale-out.yaml，添加扩容的 TiDB 配置参数。可通过 `tiup cluster edit-config <集群名>` 载入已有的配置信息，对照填写。

- TiDB Server 配置文件

```
~]$ cat tidb-scale-out.yaml
tidb_servers:
  - host: 192.168.3.227
```

- PD 配置文件

```
~]$ cat pd-scale-out.yaml
pd_servers:
  - host: 192.168.3.228
```

- TiKV 配置文件

```
~]$ cat tikv-scale-out.yaml
tikv_servers:
  - host: 192.168.3.229
```

这里为节省时间，同时扩容三类（TiDB、PD、TiKV）节点，准备扩容配置文件 `scale-out.yaml` 内容如下：

```
pd_servers:
  - host: 192.168.3.228
tidb_servers:
  - host: 192.168.3.227
tikv_servers:
  - host: 192.168.3.229
```

生产环境扩容，建议针对没类节点分别扩容。

#### 4.1.3. 扩容检查

- 扩容检查

以扩容 TiDB（192.168.3.227）为例。

```
~]$ tiup cluster check kruidb-cluster scale-out.yaml --cluster

Node           Check         Result  Message
----           -----         ------  -------
192.168.3.228  selinux       Pass    SELinux is disabled
192.168.3.228  thp           Pass    THP is disabled
192.168.3.228  command       Pass    numactl: policy: default
192.168.3.228  os-version    Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.228  cpu-cores     Pass    number of CPU cores / threads: 4
192.168.3.228  cpu-governor  Warn    Unable to determine current CPU frequency governor policy
192.168.3.228  memory        Pass    memory size is 4096MB
192.168.3.229  cpu-governor  Warn    Unable to determine current CPU frequency governor policy
192.168.3.229  memory        Pass    memory size is 4096MB
192.168.3.229  selinux       Pass    SELinux is disabled
192.168.3.229  thp           Pass    THP is disabled
192.168.3.229  command       Pass    numactl: policy: default
192.168.3.229  timezone      Pass    time zone is the same as the first PD machine: America/New_York
192.168.3.229  os-version    Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.229  cpu-cores     Pass    number of CPU cores / threads: 4
192.168.3.227  memory        Pass    memory size is 4096MB
192.168.3.227  selinux       Pass    SELinux is disabled
192.168.3.227  thp           Pass    THP is disabled
192.168.3.227  command       Pass    numactl: policy: default
192.168.3.227  timezone      Pass    time zone is the same as the first PD machine: America/New_York
192.168.3.227  os-version    Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.227  cpu-cores     Pass    number of CPU cores / threads: 4
192.168.3.227  cpu-governor  Warn    Unable to determine current CPU frequency governor policy
```

- 风险修复

应用如下命令，可修复大部分的风险。针对无法自动修复的风险，可手动修复。如下示例，需手动安装 numactl 包。

```
~]$ tiup cluster check kruidb-cluster scale-out.yaml --cluster --apply --user root -p

192.168.3.228  memory        Pass    memory size is 4096MB
192.168.3.228  selinux       Pass    SELinux is disabled
192.168.3.228  thp           Pass    THP is disabled
192.168.3.228  command       Pass    numactl: policy: default
+ Try to apply changes to fix failed checks
  - Applying changes on 192.168.3.229 ... Done
  - Applying changes on 192.168.3.227 ... Done
  - Applying changes on 192.168.3.228 ... Done
```

#### 4.1.4. 执行扩容

1. 执行扩容 TiDB

```
~]$ tiup cluster scale-out kruidb-cluster scale-out.yaml

tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster scale-out kruidb-cluster scale-out.yaml

+ Detect CPU Arch Name
  - Detecting node 192.168.3.228 Arch info ... Done
  - Detecting node 192.168.3.229 Arch info ... Done
  - Detecting node 192.168.3.227 Arch info ... Done

+ Detect CPU OS Name
  - Detecting node 192.168.3.228 OS info ... Done
  - Detecting node 192.168.3.229 OS info ... Done
  - Detecting node 192.168.3.227 OS info ... Done
Please confirm your topology:
Cluster type:    tidb
Cluster name:    kruidb-cluster
Cluster version: v5.4.2
Role  Host           Ports        OS/Arch       Directories
----  ----           -----        -------       -----------
pd    192.168.3.228  2379/2380    linux/x86_64  /tidb-deploy/pd-2379,/tidb-data/pd-2379
tikv  192.168.3.229  20160/20180  linux/x86_64  /tidb-deploy/tikv-20160,/tidb-data/tikv-20160
tidb  192.168.3.227  4000/10080   linux/x86_64  /tidb-deploy/tidb-4000
Attention:
    1. If the topology is not what you expected, check your yaml file.
    2. Please confirm there is no port/directory conflicts in same host.
Do you want to continue? [y/N]: (default=N) y

......
+ Refresh components conifgs
  ......
  - Generate config prometheus -> 192.168.3.221:9090 ... Done
  - Generate config grafana -> 192.168.3.221:3000 ... Done
  - Generate config alertmanager -> 192.168.3.221:9093 ... Done
+ Reload prometheus and grafana
  - Reload prometheus -> 192.168.3.221:9090 ... Done
  - Reload grafana -> 192.168.3.221:3000 ... Done
+ [ Serial ] - UpdateTopology: cluster=kruidb-cluster
Scaled cluster `kruidb-cluster` out successfully
```

2. 检查集群状态

```
 ~]$ tiup cluster display kruidb-cluster
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb-cluster
Cluster type:       tidb
Cluster name:       kruidb-cluster
Cluster version:    v5.4.2
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
Grafana URL:        http://192.168.3.221:3000
ID                   Role          Host           Ports        OS/Arch       Status  Data Dir                      Deploy Dir
--                   ----          ----           -----        -------       ------  --------                      ----------
192.168.3.221:9093   alertmanager  192.168.3.221  9093/9094    linux/x86_64  Up      /tidb-data/alertmanager-9093  /tidb-deploy/alertmanager-9093
192.168.3.221:3000   grafana       192.168.3.221  3000         linux/x86_64  Up      -                             /tidb-deploy/grafana-3000
192.168.3.221:2379   pd            192.168.3.221  2379/2380    linux/x86_64  Up      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.222:2379   pd            192.168.3.222  2379/2380    linux/x86_64  Up|UI   /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.223:2379   pd            192.168.3.223  2379/2380    linux/x86_64  Up|L    /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.228:2379   pd            192.168.3.228  2379/2380    linux/x86_64  Up      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.221:9090   prometheus    192.168.3.221  9090/12020   linux/x86_64  Up      /tidb-data/prometheus-9090    /tidb-deploy/prometheus-9090
192.168.3.221:4000   tidb          192.168.3.221  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.222:4000   tidb          192.168.3.222  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.223:4000   tidb          192.168.3.223  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.227:4000   tidb          192.168.3.227  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.224:20160  tikv          192.168.3.224  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.225:20160  tikv          192.168.3.225  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.226:20160  tikv          192.168.3.226  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.229:20160  tikv          192.168.3.229  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
Total nodes: 15
```

3. 为 Haproxy 增加扩容的 TiDB 节点

```
~]# echo "server tidb-4 192.168.3.228:4000 check inter 2000 rise 2 fall 3" >> /etc/haproxy/haproxy.cfg
~]# systemctl stop haproxy
~]# systemctl start haproxy
```

### 4.2. 缩容TiDB/PD/TiKV

`tiup cluster scale-in` 命令用于 TiDB 集群的缩容操作。TiDB 针对不同节点的缩容，进行不同的处理：

1. 对 TiKV，TiFlash 及 TiDB Binlog 组件的操作:
   - `tiup-cluster` 通过 API 将 TiKV，TiFlash 及 TiDB Binlog 下线后，直接退出而不等待下线完成。TiKV，TiFlash 及 TiDB Binlog 组件异步下线完成后，状态变为 `Tombstone`
   - `tiup cluster display` 查看下线节点的状态，等待其状态变为 Tombstone。
   - `tiup cluster prune` 命令清理 Tombstone 节点。该命令会停止已下线的节点的服务；清理已经下线掉的节点的相关数据文件；更新集群的拓扑，移除已经下线掉的节点。
2. 对其他组件的操作
   - 下线 PD 组件时，会通过 API 将指定节点从集群中删除掉（这个过程很快），然后停掉指定 PD 的服务并且清除该节点的相关数据文件；
   - 下线其他组件时，直接停止并且清除节点的相关数据文件

#### 4.2.1. 缩容 TiDB/PD

若集群应用了 Haproxy，需先修改 Haproxy 配置，路径为 `/etc/haproxy/haprox.cfg`，删除待缩容的 TiDB 节点，并重启 Haproxy 服务。

1. 查看节点 ID 信息

```
~]$ tiup cluster display kruidb-cluster 
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb-cluster
Cluster type:       tidb
Cluster name:       kruidb-cluster
Cluster version:    v5.4.2
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
Grafana URL:        http://192.168.3.221:3000
ID                   Role          Host           Ports        OS/Arch       Status  Data Dir                      Deploy Dir
--                   ----          ----           -----        -------       ------  --------                      ----------
192.168.3.221:9093   alertmanager  192.168.3.221  9093/9094    linux/x86_64  Up      /tidb-data/alertmanager-9093  /tidb-deploy/alertmanager-9093
192.168.3.221:3000   grafana       192.168.3.221  3000         linux/x86_64  Up      -                             /tidb-deploy/grafana-3000
192.168.3.221:2379   pd            192.168.3.221  2379/2380    linux/x86_64  Up      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.222:2379   pd            192.168.3.222  2379/2380    linux/x86_64  Up|UI   /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.223:2379   pd            192.168.3.223  2379/2380    linux/x86_64  Up|L    /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.228:2379   pd            192.168.3.228  2379/2380    linux/x86_64  Up      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.221:9090   prometheus    192.168.3.221  9090/12020   linux/x86_64  Up      /tidb-data/prometheus-9090    /tidb-deploy/prometheus-9090
192.168.3.221:4000   tidb          192.168.3.221  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.222:4000   tidb          192.168.3.222  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.223:4000   tidb          192.168.3.223  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.227:4000   tidb          192.168.3.227  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.224:20160  tikv          192.168.3.224  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.225:20160  tikv          192.168.3.225  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.226:20160  tikv          192.168.3.226  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
```

2. 执行缩容

以同时缩容 ID 为 `192.168.3.227:4000` 的 TiDB 节点和 ID 为 `192.168.3.228:2379` 的 PD 节点为例。生产环境建议每个节点单独缩容。

```
~]$ tiup cluster scale-in kruidb-cluster --node 192.168.3.227:4000 --node 192.168.3.228:2379 --node 192.168.3.229:20160
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster scale-in kruidb-cluster --node 192.168.3.227:4000 --node 192.168.3.228:2379 --node 192.168.3.229:20160
This operation will delete the 192.168.3.227:4000,192.168.3.228:2379,192.168.3.229:20160 nodes in `kruidb-cluster` and all their data.
Do you want to continue? [y/N]:(default=N) y
The component `[tikv]` will become tombstone, maybe exists in several minutes or hours, after that you can use the prune command to clean it
Do you want to continue? [y/N]:(default=N) y
Scale-in nodes...

...
+ Reload prometheus and grafana
  - Reload prometheus -> 192.168.3.221:9090 ... Done
  - Reload grafana -> 192.168.3.221:3000 ... Done
Scaled cluster `kruidb-cluster` in successfully
```

3. 检查集群状态

```
~]$ tiup cluster display kruidb-cluster
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb-cluster
Cluster type:       tidb
Cluster name:       kruidb-cluster
Cluster version:    v5.4.2
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
Grafana URL:        http://192.168.3.221:3000
ID                   Role          Host           Ports        OS/Arch       Status           Data Dir                      Deploy Dir
--                   ----          ----           -----        -------       ------           --------                      ----------
192.168.3.221:9093   alertmanager  192.168.3.221  9093/9094    linux/x86_64  Up               /tidb-data/alertmanager-9093  /tidb-deploy/alertmanager-9093
192.168.3.221:3000   grafana       192.168.3.221  3000         linux/x86_64  Up               -                             /tidb-deploy/grafana-3000
192.168.3.221:2379   pd            192.168.3.221  2379/2380    linux/x86_64  Up               /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.222:2379   pd            192.168.3.222  2379/2380    linux/x86_64  Up|UI            /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.223:2379   pd            192.168.3.223  2379/2380    linux/x86_64  Up|L             /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.221:9090   prometheus    192.168.3.221  9090/12020   linux/x86_64  Up               /tidb-data/prometheus-9090    /tidb-deploy/prometheus-9090
192.168.3.221:4000   tidb          192.168.3.221  4000/10080   linux/x86_64  Up               -                             /tidb-deploy/tidb-4000
192.168.3.222:4000   tidb          192.168.3.222  4000/10080   linux/x86_64  Up               -                             /tidb-deploy/tidb-4000
192.168.3.223:4000   tidb          192.168.3.223  4000/10080   linux/x86_64  Up               -                             /tidb-deploy/tidb-4000
192.168.3.224:20160  tikv          192.168.3.224  20160/20180  linux/x86_64  Up               /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.225:20160  tikv          192.168.3.225  20160/20180  linux/x86_64  Up               /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.226:20160  tikv          192.168.3.226  20160/20180  linux/x86_64  Up               /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.229:20160  tikv          192.168.3.229  20160/20180  linux/x86_64  Pending Offline  /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
Total nodes: 13
```

4. 清理 Tombstone 节点

待 TiKV 节点由 `Pending Offline` 状态，转变为 `Tombstone` 状态后，即可执行 `tiup cluster prune <集群名>` 清理已下线的 TiKV节点，更新集群拓扑。

```
~]$ tiup cluster prune kruidb-cluster

tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster prune kruidb-cluster
+ [ Serial ] - SSHKeySet: privateKey=/home/tidb/.tiup/storage/cluster/clusters/kruidb-cluster/ssh/id_rsa, publicKey=/home/tidb/.tiup/storage/cluster/clusters/kruidb-cluster/ssh/id_rsa.pub
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.225
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.226
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.222
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.229
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.223
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.222
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.221
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.224
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.223
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.221
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.221
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.221
+ [Parallel] - UserSSH: user=tidb, host=192.168.3.221
+ [ Serial ] - FindTomestoneNodes
Will destroy these nodes: [192.168.3.229:20160]
Do you confirm this action? [y/N]:(default=N) y 
Start destroy Tombstone nodes: [192.168.3.229:20160] ...
......
+ Reload prometheus and grafana
  - Reload prometheus -> 192.168.3.221:9090 ... Done
  - Reload grafana -> 192.168.3.221:3000 ... Done
Destroy success
```

5. 检查集群状态

```
~]$ tiup cluster display kruidb-cluster
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb-cluster
Cluster type:       tidb
Cluster name:       kruidb-cluster
Cluster version:    v5.4.2
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
Grafana URL:        http://192.168.3.221:3000
ID                   Role          Host           Ports        OS/Arch       Status  Data Dir                      Deploy Dir
--                   ----          ----           -----        -------       ------  --------                      ----------
192.168.3.221:9093   alertmanager  192.168.3.221  9093/9094    linux/x86_64  Up      /tidb-data/alertmanager-9093  /tidb-deploy/alertmanager-9093
192.168.3.221:3000   grafana       192.168.3.221  3000         linux/x86_64  Up      -                             /tidb-deploy/grafana-3000
192.168.3.221:2379   pd            192.168.3.221  2379/2380    linux/x86_64  Up      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.222:2379   pd            192.168.3.222  2379/2380    linux/x86_64  Up|UI   /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.223:2379   pd            192.168.3.223  2379/2380    linux/x86_64  Up|L    /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.221:9090   prometheus    192.168.3.221  9090/12020   linux/x86_64  Up      /tidb-data/prometheus-9090    /tidb-deploy/prometheus-9090
192.168.3.221:4000   tidb          192.168.3.221  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.222:4000   tidb          192.168.3.222  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.223:4000   tidb          192.168.3.223  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.224:20160  tikv          192.168.3.224  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.225:20160  tikv          192.168.3.225  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.226:20160  tikv          192.168.3.226  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
Total nodes: 12
```

### 4.3. 扩容 TiFlash

#### 4.3.1. 扩容 TiFlash 步骤

在原有集群上新增 TiFlash 组件，需要确保 TiDB 集群版本为 v5.0 以上，并且需要开启 PD 的 Placement Rules（5.0及以上默认开启） 功能。

1. 确认开启 PD 的 Placement Rules

进入 pd-ctl 交互模式查看 placement-rules 启用状态。

```
~]$ tiup ctl:v5.4.2 pd -u http://192.168.3.222:2379 -i
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v5.4.2/ctl pd -u http://192.168.3.222:2379 -i
» config show replication
{
  "max-replicas": 3,
  "location-labels": "",
  "strictly-match-label": "false",
  "enable-placement-rules": "true",
  "enable-placement-rules-cache": "false",
  "isolation-level": ""
}
```

若未开启，可在 pd-ctl 交互模式中执行 `config set enable-placement-rules true` 开启 Placement Rules。也可通过 tiup 组件调用 pd-ctl 开启 Placement Rules。

```
~]$ tiup ctl:v5.4.2 pd -u http://192.168.3.222:2379 -i
>> config set enable-placement-rules true
~]$ tiup ctl:v5.4.2 pd -u http://192.168.3.222:2379 config set enable-placement-rules true
```

2. 编辑 TiFlash 节点配置文件 tiflash-out.yaml

```
~]$ cat tiflash-out.yaml
tiflash_servers:
  - host: 192.168.3.228
  - host: 192.168.3.229
```

3. 扩容检查及修复

```
~]$ tiup cluster check kruidb-cluster tiflash-out.yaml --cluster

~]$ tiup cluster check kruidb-cluster tiflash-out.yaml --cluster --apply --user root -p
```

4. 执行扩容

```
~]$ tiup cluster scale-out kruidb-cluster tiflash-out.yaml
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster scale-out kruidb-cluster tiflash-out.yaml

+ Detect CPU Arch Name
  - Detecting node 192.168.3.228 Arch info ... Done
  - Detecting node 192.168.3.229 Arch info ... Done

+ Detect CPU OS Name
  - Detecting node 192.168.3.228 OS info ... Done
  - Detecting node 192.168.3.229 OS info ... Done
Please confirm your topology:
Cluster type:    tidb
Cluster name:    kruidb-cluster
Cluster version: v5.4.2
Role     Host           Ports                            OS/Arch       Directories
----     ----           -----                            -------       -----------
tiflash  192.168.3.228  9000/8123/3930/20170/20292/8234  linux/x86_64  /tidb-deploy/tiflash-9000,/tidb-data/tiflash-9000
tiflash  192.168.3.229  9000/8123/3930/20170/20292/8234  linux/x86_64  /tidb-deploy/tiflash-9000,/tidb-data/tiflash-9000
Attention:
    1. If the topology is not what you expected, check your yaml file.
    2. Please confirm there is no port/directory conflicts in same host.
Do you want to continue? [y/N]: (default=N) y 
......
+ Reload prometheus and grafana
  - Reload prometheus -> 192.168.3.221:9090 ... Done
  - Reload grafana -> 192.168.3.221:3000 ... Done
+ [ Serial ] - UpdateTopology: cluster=kruidb-cluster
Scaled cluster `kruidb-cluster` out successfully
```

5. 检查集群

```
~]$ tiup cluster display kruidb-cluster

tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb-cluster
Cluster type:       tidb
Cluster name:       kruidb-cluster
Cluster version:    v5.4.2
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
Grafana URL:        http://192.168.3.221:3000
ID                   Role          Host           Ports                            OS/Arch       Status  Data Dir                      Deploy Dir
--                   ----          ----           -----                            -------       ------  --------                      ----------
192.168.3.221:9093   alertmanager  192.168.3.221  9093/9094                        linux/x86_64  Up      /tidb-data/alertmanager-9093  /tidb-deploy/alertmanager-9093
192.168.3.221:3000   grafana       192.168.3.221  3000                             linux/x86_64  Up      -                             /tidb-deploy/grafana-3000
192.168.3.221:2379   pd            192.168.3.221  2379/2380                        linux/x86_64  Up      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.222:2379   pd            192.168.3.222  2379/2380                        linux/x86_64  Up|UI   /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.223:2379   pd            192.168.3.223  2379/2380                        linux/x86_64  Up|L    /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.221:9090   prometheus    192.168.3.221  9090/12020                       linux/x86_64  Up      /tidb-data/prometheus-9090    /tidb-deploy/prometheus-9090
192.168.3.221:4000   tidb          192.168.3.221  4000/10080                       linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.222:4000   tidb          192.168.3.222  4000/10080                       linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.223:4000   tidb          192.168.3.223  4000/10080                       linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.228:9000   tiflash       192.168.3.228  9000/8123/3930/20170/20292/8234  linux/x86_64  Up      /tidb-data/tiflash-9000       /tidb-deploy/tiflash-9000
192.168.3.229:9000   tiflash       192.168.3.229  9000/8123/3930/20170/20292/8234  linux/x86_64  Up      /tidb-data/tiflash-9000       /tidb-deploy/tiflash-9000
192.168.3.224:20160  tikv          192.168.3.224  20160/20180                      linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.225:20160  tikv          192.168.3.225  20160/20180                      linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.226:20160  tikv          192.168.3.226  20160/20180                      linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
Total nodes: 14
```

#### 4.3.2. 列存验证

1. 创建测试表

```
~]$ mysql -uroot -h 192.168.3.221 -P 4000 -proot

mysql> use test;
Database changed

mysql> create table t_test(id int, name varchar(32));
Query OK, 0 rows affected (0.55 sec)

mysql> insert into t_test values(1,'zhang3');
Query OK, 1 row affected (0.03 sec)
```

2. 为测试表添加 TiFlash 列存副本

```
mysql> alter table test.t_test set tiflash replica 2;
Query OK, 0 rows affected (0.51 sec)
```

也可按库创建 TiFlash 列存副本，语法为 `alter table <数据库名> set tiflash replica <副本数>;`

3. 查看列存副本同步进度

```
mysql> select table_schema,table_name,replica_count,progress from information_schema.tiflash_replica;
+--------------+------------+---------------+----------+
| table_schema | table_name | replica_count | progress |
+--------------+------------+---------------+----------+
| test         | t_test     |             2 |        1 |
+--------------+------------+---------------+----------+
1 row in set (0.01 sec)
```

AVAILABLE 字段表示该表的 TiFlash 副本是否可用。1 代表可用，0 代表不可用。副本状态为可用之后就不再改变，如果通过 DDL 命令修改副本数则会重新计算同步进度。

PROGRESS 字段代表同步进度，在 0.0~1.0 之间，1 代表至少 1 个副本已经完成同步。

### 4.4. 缩容 TiFlash

#### 4.4.1. 调整列存副本数

在缩容 TiFlash 节点之前，需确保 TiFlash 集群剩余节点数大于等于所有数据表的最大副本数，否则需要修改相关表的副本数。

```
~]$ mysql -uroot -h 192.168.3.221 -P 4000 -proot

mysql> SELECT * FROM information_schema.tiflash_replica WHERE TABLE_SCHEMA = 'test' and TABLE_NAME = 't_test';
+--------------+------------+----------+---------------+-----------------+-----------+----------+
| TABLE_SCHEMA | TABLE_NAME | TABLE_ID | REPLICA_COUNT | LOCATION_LABELS | AVAILABLE | PROGRESS |
+--------------+------------+----------+---------------+-----------------+-----------+----------+
| test         | t_test     |      111 |             2 |                 |         1 |        1 |
+--------------+------------+----------+---------------+-----------------+-----------+----------+
1 row in set (0.00 sec)

mysql> alter table test.t_test set tiflash replica 1;
```

#### 4.4.2. 缩容 TiFlash 节点

##### 4.4.2.1. 通过 TiUP 缩容 TiFlash 节点

1. 查看 TiFlash 节点 ID

```
~]$ tiup cluster display kruidb-cluster

tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb-cluster
Cluster type:       tidb
Cluster name:       kruidb-cluster
Cluster version:    v5.4.2
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
Grafana URL:        http://192.168.3.221:3000
ID                   Role          Host           Ports                            OS/Arch       Status  Data Dir                      Deploy Dir
--                   ----          ----           -----                            -------       ------  --------                      ----------
192.168.3.221:9093   alertmanager  192.168.3.221  9093/9094                        linux/x86_64  Up      /tidb-data/alertmanager-9093  /tidb-deploy/alertmanager-9093
192.168.3.221:3000   grafana       192.168.3.221  3000                             linux/x86_64  Up      -                             /tidb-deploy/grafana-3000
192.168.3.221:2379   pd            192.168.3.221  2379/2380                        linux/x86_64  Up      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.222:2379   pd            192.168.3.222  2379/2380                        linux/x86_64  Up|UI   /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.223:2379   pd            192.168.3.223  2379/2380                        linux/x86_64  Up|L    /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.221:9090   prometheus    192.168.3.221  9090/12020                       linux/x86_64  Up      /tidb-data/prometheus-9090    /tidb-deploy/prometheus-9090
192.168.3.221:4000   tidb          192.168.3.221  4000/10080                       linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.222:4000   tidb          192.168.3.222  4000/10080                       linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.223:4000   tidb          192.168.3.223  4000/10080                       linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.228:9000   tiflash       192.168.3.228  9000/8123/3930/20170/20292/8234  linux/x86_64  Up      /tidb-data/tiflash-9000       /tidb-deploy/tiflash-9000
192.168.3.229:9000   tiflash       192.168.3.229  9000/8123/3930/20170/20292/8234  linux/x86_64  Up      /tidb-data/tiflash-9000       /tidb-deploy/tiflash-9000
192.168.3.224:20160  tikv          192.168.3.224  20160/20180                      linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.225:20160  tikv          192.168.3.225  20160/20180                      linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.226:20160  tikv          192.168.3.226  20160/20180                      linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
Total nodes: 14
```

1. 执行缩容

```
~]$ tiup cluster scale-in kruidb-cluster --node 192.168.3.228:9000
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster scale-in kruidb-cluster --node 192.168.3.228:9000
This operation will delete the 192.168.3.228:9000 nodes in `kruidb-cluster` and all their data.
Do you want to continue? [y/N]:(default=N) y
The component `[tiflash]` will become tombstone, maybe exists in several minutes or hours, after that you can use the prune command to clean it
Do you want to continue? [y/N]:(default=N) y
Scale-in nodes...
```

2. 清理集群

待缩容后的 TiFlash 节点状态变为 `Tombstone` 时，执行如下语句清理集群，更新拓扑。

```
~]$ tiup cluster prune kruidb-cluster
```

#### 4.4.2.2. 手动强制缩容 TiFlash 节点

在特殊情况下（比如需要强制下线节点），或者 TiUP 操作失败的情况下，可以使用以下方法手动下线 TiFlash 节点。

3. 调整列存副本数

```
~]$ mysql -uroot -h 192.168.3.221 -P 4000 -proot

mysql> alter table test.t_test set tiflash replica 0;
Query OK, 0 rows affected (0.52 sec)

mysql> SELECT * FROM information_schema.tiflash_replica WHERE TABLE_SCHEMA = 'test' and TABLE_NAME = 't_test';
Empty set (0.00 sec)
```

4. pd-ctl 查看 TiFlash 节点的 Store ID

```
~]$ tiup ctl:v5.4.2 pd -u http://192.168.3.221:2379 store

Starting component `ctl`: /home/tidb/.tiup/components/ctl/v5.4.2/ctl pd -u http://192.168.3.221:2379 store
{
  "count": 4,
  "stores": [
  {
      "store": {
        "id": 5761,                           # 这里为 TiFlash 的 Store ID
        "address": "192.168.3.229:3930",
        "labels": [
          {
            "key": "engine",
            "value": "tiflash"
          }
        ],
        "version": "v5.4.2",
        "peer_address": "192.168.3.229:20170",
        "status_address": "192.168.3.229:20292",
        "git_hash": "82c1eae6ad21a2367b19029ece53ffce428df165",
        "start_timestamp": 1659013449,
        "deploy_path": "/tidb-deploy/tiflash-9000/bin/tiflash",
        "last_heartbeat": 1659015359358123962,
        "state_name": "Up"
      },
      "status": {
        "capacity": "19.56GiB",
        "available": "17.22GiB",
        "used_size": "29.79KiB",
        "leader_count": 0,
        "leader_weight": 1,
        "leader_score": 0,
        "leader_size": 0,
        "region_count": 0,
        "region_weight": 1,
        "region_score": 6556466030.143202,
        "region_size": 0,
        "slow_score": 0,
        "start_ts": "2022-07-28T21:04:09+08:00",
        "last_heartbeat_ts": "2022-07-28T21:35:59.358123962+08:00",
        "uptime": "31m50.358123962s"
      }
    },
    ......
    ]
}
```

也可用如下命令获取 store ID

```
v5.4.2]$ pwd
/home/tidb/.tiup/components/ctl/v5.4.2
v5.4.2]$ ./pd-ctl -u http://192.168.3.221:2379 store
```

5. pd-ctl 下线 TiFlash 节点

```
～]$ tiup ctl:v5.4.2 pd -u http://192.168.3.221:2379 store delete 5761

Starting component `ctl`: /home/tidb/.tiup/components/ctl/v5.4.2/ctl pd -u http://192.168.3.221:2379 store delete 5761
Success!
```

6. 等待该 TiFlash 节点对应的 store 消失或 state_name 变为 Tombstone，再关闭 TiFlash 进程。

```
~]$ tiup cluster display kruidb-cluster
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb-cluster
Cluster type:       tidb
Cluster name:       kruidb-cluster
Cluster version:    v5.4.2
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
Grafana URL:        http://192.168.3.221:3000
ID                   Role          Host           Ports                            OS/Arch       Status     Data Dir                      Deploy Dir
--                   ----          ----           -----                            -------       ------     --------                      ----------
192.168.3.221:9093   alertmanager  192.168.3.221  9093/9094                        linux/x86_64  Up         /tidb-data/alertmanager-9093  /tidb-deploy/alertmanager-9093
192.168.3.221:3000   grafana       192.168.3.221  3000                             linux/x86_64  Up         -                             /tidb-deploy/grafana-3000
192.168.3.221:2379   pd            192.168.3.221  2379/2380                        linux/x86_64  Up         /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.222:2379   pd            192.168.3.222  2379/2380                        linux/x86_64  Up|UI      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.223:2379   pd            192.168.3.223  2379/2380                        linux/x86_64  Up|L       /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.221:9090   prometheus    192.168.3.221  9090/12020                       linux/x86_64  Up         /tidb-data/prometheus-9090    /tidb-deploy/prometheus-9090
192.168.3.221:4000   tidb          192.168.3.221  4000/10080                       linux/x86_64  Up         -                             /tidb-deploy/tidb-4000
192.168.3.222:4000   tidb          192.168.3.222  4000/10080                       linux/x86_64  Up         -                             /tidb-deploy/tidb-4000
192.168.3.223:4000   tidb          192.168.3.223  4000/10080                       linux/x86_64  Up         -                             /tidb-deploy/tidb-4000
192.168.3.229:9000   tiflash       192.168.3.229  9000/8123/3930/20170/20292/8234  linux/x86_64  Tombstone  /tidb-data/tiflash-9000       /tidb-deploy/tiflash-9000
192.168.3.224:20160  tikv          192.168.3.224  20160/20180                      linux/x86_64  Up         /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.225:20160  tikv          192.168.3.225  20160/20180                      linux/x86_64  Up         /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.226:20160  tikv          192.168.3.226  20160/20180                      linux/x86_64  Up         /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
Total nodes: 13
```

7. 删除 TiFlash 节点的数据文件
8. 手动更新集群配置文件，删除已下线的 TiFlash 节点信息

官方文档 [手动缩容 TiFlash 节点](https://docs.pingcap.com/zh/tidb/v5.4/scale-tidb-using-tiup#方案二手动缩容-tiflash-节点)中介绍通过 `tiup cluster edit-config <cluster-name>` 手动删除 TiFlash 相关信息。但是，经过实践发现删除 TIFlash 信息后，无法 wq 保存退出。最终通过如下方式清理掉 TiFlash 相关信息。

> **注意**
>
> ```
> ~]$ tiup cluster scale-in kruidb-cluster --node 192.168.3.229:9000 --force
> ```
>
> 手动缩容 TiFlash 是为了应对 TiUP 缩容失败时的备选方案，如果仍然需要通过 `tiup cluster scale-in` 清理掉 TiFlash 信息，这也失去了手动缩>容的意义。

#### 4.4.3. 清除同步规则

在TiFlash停止运行之前，若未取消所有同步到TiFlash的表，则需要手动在PD中清除同步规则，否则无法成功完成TiFlash节点的下线。清除步骤如下：

1. 查询当前PD实例中所有与TiFlash相关的数据同步规则

```
~]$ curl http://192.168.3.221:2379/pd/api/v1/config/rules/group/tiflash
null
```

返回为空，说明已取消所有表的TiFlash同步规则。若有未取消的同步规则，则返回的内容形式如下，表示id为table-45-r的表，未取消同步规则：

```
[
  {
    "group_id": "tiflash",
    "id": "table-45-r",
    "override": true,
    "start_key": "7480000000000000FF2D5F720000000000FA",
    "end_key": "7480000000000000FF2E00000000000000F8",
    "role": "learner",
    "count": 1,
    "label_constraints": [
      {
        "key": "engine",
        "op": "in",
        "values": [
          "tiflash"
        ]
      }
    ]
  }
]
```

2. 删除id为table-45-r的表的同步规则

```
~]$  curl -v -X DELETE http://192.168.3.221:2379/pd/api/v1/config/rule/tiflash/table-45-r
```