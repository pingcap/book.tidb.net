---
title: TiDB 6.1 单机环境 On openEular 2003 SP3 
hide_title: true
---

# TiDB 6.1 单机环境 On openEular 2003 SP3

> 作者：[数据小黑](https://tidb.net/u/%E6%95%B0%E6%8D%AE%E5%B0%8F%E9%BB%91/post/all)，Senior Architect，TiDB Fans。

## 背景

最近对国产操作系统很感兴趣，也有一些场景需要验证落地，官方支持银河麒麟 V10（X86，ARM），统信 UOS 等国产操作系统，但上述系统不是开源操作系统，使用上存在一些障碍，经过朋友推荐，选择华为的 openEular 进行验证测试。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655281386619.png)

目前 openEular 的 LTS 版本主要是 2003 和 2203 两个版本，2003 是 gcc 7+ 和 python 2.X 的环境，2203 是 gcc 10+ 和 python 3.X 的环境，理论上讲 2003 更接近目前所使用的 CentOS 7，兄弟组用 2203 编译 Doris 也遇到一些问题，因此选择 openEular 2003 SP3 进行测试。本次测试主要验证功能，分为部署过程测试和基本 SQL 查询测试，不做性能测试。openEular 同时支持 X86 和 ARM 架构，TiDB 也支持上述两种架构，本次测试中采用 X86\_64 架构硬件设备进行测试。

本文使用 TiDB 6.1 作为测试版本，验证结果不保证可复现在 6.X 之前的版本上。

## 阅读受益

本文参照官方文档操作，验证 TiDB 运行在 openEular 上的可行性，为有选型需求的同学做一些参考。

本文记录了整个部署过程中的标准输出，对于只是想了解 TiDB 部署安装过程的同学，有一定参考价值。

经过本文的验证，在 openEular 部署使用 TiDB 与在 Centos 7 部署使用 TiDB 基本一致。部署过程中遇到的问题见最后的错误排查。

## 单机环境部署

### 部署环境

openEular 2003 SP3
4C8G Vmware 虚拟机 x86\_64 环境

### 系统组件准备

由于系统的原因，需要提前安装以下组件：

```
yum -y install bc
```

### 集群拓扑

最小规模的 TiDB 集群拓扑：

| 实例      | 个数 | IP              | 配置   |
| ------- | -- | --------------- | :--- |
| TiKV    | 3  | 192.168.180.140 | 修改端口 |
| TiDB    | 1  | 192.168.180.140 | 默认配置 |
| PD      | 1  | 192.168.180.140 | 默认配置 |
| TiFlash | 1  | 192.168.180.140 | 默认配置 |
| Monitor | 1  | 192.168.180.140 | 默认配置 |

### 部署过程

1. 下载并安装 TiUP：

```
[root@localhost tidb]## curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 6968k  100 6968k    0     0   600k      0  0:00:11  0:00:11 --:--:-- 1129k
WARN: adding root certificate via internet: https://tiup-mirrors.pingcap.com/root.json
You can revoke this by remove /root/.tiup/bin/7b8e153f2e2d0928.root.json
Successfully set mirror to https://tiup-mirrors.pingcap.com
Detected shell: bash
Shell profile:  /root/.bash_profile
/root/.bash_profile has been modified to add tiup to PATH
open a new terminal or source /root/.bash_profile to use it
Installed path: /root/.tiup/bin/tiup
===============================================
Have a try:     tiup playground
===============================================
```

2. 声明全局环境变量：

```
[root@localhost tidb]## source /root/.bash_profile
```

3. 安装 TiUP 的 cluster 组件：

```
[root@localhost tidb]## tiup cluster
tiup is checking updates for component cluster ...timeout!
The component `cluster` version  is not installed; downloading from repository.
download https://tiup-mirrors.pingcap.com/cluster-v1.10.1-linux-amd64.tar.gz 8.28 MiB / 8.28 MiB 100.00% 1.05 MiB/s
Starting component `cluster`: /root/.tiup/components/cluster/v1.10.1/tiup-cluster
Deploy a TiDB cluster for production

......

Use "tiup cluster help [command]" for more information about a command.
```

4. 调大 sshd 服务的连接数限制：

```
[root@localhost tidb]## sed -i 's/##MaxSessions 10/MaxSessions 20/g' /etc/ssh/sshd_config
[root@localhost tidb]## service sshd restart
Redirecting to /bin/systemctl restart sshd.service
```

5. 创建并启动集群
   创建配置文件 topo.yaml：

```
## ## Global variables are applied to all deployments and used as the default value of
## ## the deployments if a specific deployment value is missing.
global:
 user: "tidb"
 ssh_port: 22
 deploy_dir: "/tidb-deploy"
 data_dir: "/tidb-data"

## ## Monitored variables are applied to all the machines.
monitored:
 node_exporter_port: 9100
 blackbox_exporter_port: 9115

server_configs:
 tidb:
   log.slow-threshold: 300
 tikv:
   readpool.storage.use-unified-pool: false
   readpool.coprocessor.use-unified-pool: true
 pd:
   replication.enable-placement-rules: true
   replication.location-labels: ["host"]
 tiflash:
   logger.level: "info"

pd_servers:
 - host: 192.168.180.140

tidb_servers:
 - host: 192.168.180.140

tikv_servers:
 - host: 192.168.180.140
   port: 20160
   status_port: 20180
   config:
     server.labels: {host: "logic-host-1"}

 - host: 192.168.180.140
   port: 20161
   status_port: 20181
   config:
     server.labels: {host: "logic-host-2"}

 - host: 192.168.180.140
   port: 20162
   status_port: 20182
   config:
     server.labels: {host: "logic-host-3"}

tiflash_servers:
 - host: 192.168.180.140

monitoring_servers:
 - host: 192.168.180.140

grafana_servers:
 - host: 192.168.180.140
```

部署集群：

```
[root@localhost tidb]## tiup cluster deploy tidb61 v6.1.0 ./topo.yaml --user root -p
tiup is checking updates for component cluster ...
Starting component `cluster`: /root/.tiup/components/cluster/v1.10.1/tiup-cluster deploy tidb61 v6.1.0 ./topo.yaml --user root -p
Input SSH password:

+ Detect CPU Arch Name
  - Detecting node 192.168.180.140 Arch info ... Done

+ Detect CPU OS Name
  - Detecting node 192.168.180.140 OS info ... Done
Please confirm your topology:
Cluster type:    tidb
Cluster name:    tidb61
Cluster version: v6.1.0

......

Attention:
    1. If the topology is not what you expected, check your yaml file.
    2. Please confirm there is no port/directory conflicts in same host.
Do you want to continue? [y/N]: (default=N) y
+ Generate SSH keys ... Done
+ Download TiDB components
+ Download TiDB components
+ Initialize target host environments
+ Deploy TiDB instance
+ Copy certificate to remote host
+ Init instance configs
+ Init monitor configs
+ Check status
Enabling component pd
Enabling component tikv
Enabling component tidb
Enabling component tiflash
Enabling component prometheus
Enabling component grafana
Enabling component node_exporter
Enabling component blackbox_exporter
Cluster `tidb61` deployed successfully, you can start it with command: `tiup cluster start tidb61 --init`
```

启动集群：

```
[root@ecs-5842 ~]## tiup cluster start tidb61 --init
tiup is checking updates for component cluster ...
Starting component `cluster`: /root/.tiup/components/cluster/v1.10.1/tiup-cluster start tidb61 --init
Starting cluster tidb61...

......

Started cluster `tidb61` successfully
The root password of TiDB database has been changed.
The new password is: '5%thkE=sL6^-1382wV'.
Copy and record it to somewhere safe, it is only displayed once, and will not be stored.
The generated password can NOT be get and shown again.
```

查看集群状态：

```
[root@ecs-5842 ~]## tiup cluster display tidb61
tiup is checking updates for component cluster ...timeout!
Starting component `cluster`: /root/.tiup/components/cluster/v1.10.1/tiup-cluster display tidb61
Cluster type:       tidb
Cluster name:       tidb61
Cluster version:    v6.1.0
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.0.141:2379/dashboard
Grafana URL:        http://192.168.0.141:3000
ID                   Role        Host           Ports                            OS/Arch       Status   Data Dir                    Deploy Dir
--                   ----        ----           -----                            -------       ------   --------                    ----------
192.168.0.141:3000   grafana     192.168.0.141  3000                             linux/x86_64  Up       -                           /tidb-deploy/grafana-3000
192.168.0.141:2379   pd          192.168.0.141  2379/2380                        linux/x86_64  Up|L|UI  /tidb-data/pd-2379          /tidb-deploy/pd-2379
192.168.0.141:9090   prometheus  192.168.0.141  9090/12020                       linux/x86_64  Up       /tidb-data/prometheus-9090  /tidb-deploy/prometheus-9090
192.168.0.141:4000   tidb        192.168.0.141  4000/10080                       linux/x86_64  Up       -                           /tidb-deploy/tidb-4000
192.168.0.141:9000   tiflash     192.168.0.141  9000/8123/3930/20170/20292/8234  linux/x86_64  Up       /tidb-data/tiflash-9000     /tidb-deploy/tiflash-9000
192.168.0.141:20160  tikv        192.168.0.141  20160/20180                      linux/x86_64  Up       /tidb-data/tikv-20160       /tidb-deploy/tikv-20160
192.168.0.141:20161  tikv        192.168.0.141  20161/20181                      linux/x86_64  Up       /tidb-data/tikv-20161       /tidb-deploy/tikv-20161
192.168.0.141:20162  tikv        192.168.0.141  20162/20182                      linux/x86_64  Up       /tidb-data/tikv-20162       /tidb-deploy/tikv-20162
Total nodes: 8
```

## 测试 TiKV 和 TiFlash 查询

### 生成基础环境

```
[root@ecs-5842 ~]## tiup install bench
[root@ecs-5842 ~]## tiup bench tpch prepare -p 5%thkE=sL6^-1382wV
tiup is checking updates for component bench ...
Starting component `bench`: /root/.tiup/components/bench/v1.10.1/tiup-bench tpch prepare -p 5%thkE=sL6^-1382wV
creating nation
creating region
creating part
creating supplier
creating partsupp
creating customer
creating orders
creating lineitem
generating nation table
generate nation table done
generating region table
generate region table done
generating customers table
generate customers table done
generating suppliers table
generate suppliers table done
generating part/partsupplier tables
generate part/partsupplier tables done
generating orders/lineitem tables
generate orders/lineitem tables done
Finished
```

下载并安装一下 rpm 包：

```
mysql-community-client-5.7.35-1.el7.x86_64.rpm                
mysql-community-common-5.7.35-1.el7.x86_64.rpm                
mysql-community-libs-5.7.35-1.el7.x86_64.rpm                  
```

```
[root@ecs-5842 ~]## rpm -ivh mysql-community-*
warning: mysql-community-client-5.7.35-1.el7.x86_64.rpm: Header V3 DSA/SHA256 Signature, key ID 5072e1f5: NOKEY
Verifying...                          ################################################################## [100%]
Preparing...                          ################################################################## [100%]
Updating / installing...
   1:mysql-community-common-5.7.35-1.e################################################################## [33%]
   2:mysql-community-libs-5.7.35-1.el7################################################################## [67%]
   3:mysql-community-client-5.7.35-1.e################################################################## [100%]
```

### TiKV 查询

```
[root@ecs-5842 ~]## mysql -h 192.168.0.141 -P 4000 -u root -p
Enter password:
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 421
Server version: 5.7.25-TiDB-v6.1.0 TiDB Server (Apache License 2.0) Community Edition, MySQL 5.7 compatible

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> use test;
Reading table information for completion of table and column names
You can turn off this feature to get a quicker startup with -A

Database changed
mysql> SELECT
    ->     l_orderkey,
    ->     SUM(->         l_extendedprice * (1 - l_discount)
    ->     ) AS revenue,
    ->     o_orderdate,
    ->     o_shippriority
    -> FROM
    ->     customer,
    ->     orders,
    ->     lineitem
    -> WHERE
    ->     c_mktsegment = 'BUILDING'
    -> AND c_custkey = o_custkey
    -> AND l_orderkey = o_orderkey
    -> AND o_orderdate < DATE '1996-01-01'
    -> AND l_shipdate > DATE '1996-02-01'
    -> GROUP BY
    ->     l_orderkey,
    ->     o_orderdate,
    ->     o_shippriority
    -> ORDER BY
    ->     revenue DESC,
    ->     o_orderdate
    -> limit 10;
+------------+-------------+-------------+----------------+
| l_orderkey | revenue     | o_orderdate | o_shippriority |
+------------+-------------+-------------+----------------+
|    5828933 | 386117.1688 | 1995-12-03  |              0 |
|    1648647 | 373096.8642 | 1995-12-06  |              0 |
|    1364641 | 352640.6056 | 1995-12-19  |              0 |
|    3949606 | 347750.4435 | 1995-12-23  |              0 |
|    4792161 | 347715.0509 | 1995-12-30  |              0 |
|    4340739 | 347490.5251 | 1995-12-06  |              0 |
|    1609574 | 342497.8886 | 1995-12-31  |              0 |
|    3076934 | 338202.3259 | 1995-12-24  |              0 |
|    3232933 | 337349.2536 | 1995-12-26  |              0 |
|    2345058 | 335142.6104 | 1995-12-31  |              0 |
+------------+-------------+-------------+----------------+
10 rows in set (1.71 sec)
```

### TiFlash 查询

```
mysql> ALTER TABLE test.customer SET TIFLASH REPLICA 1;
Query OK, 0 rows affected (0.07 sec)

mysql> ALTER TABLE test.orders SET TIFLASH REPLICA 1;
Query OK, 0 rows affected (0.08 sec)

mysql> ALTER TABLE test.lineitem SET TIFLASH REPLICA 1;
Query OK, 0 rows affected (0.08 sec)

mysql> SELECT * FROM information_schema.tiflash_replica WHERE TABLE_SCHEMA = 'test' ;
+--------------+------------+----------+---------------+-----------------+-----------+----------+
| TABLE_SCHEMA | TABLE_NAME | TABLE_ID | REPLICA_COUNT | LOCATION_LABELS | AVAILABLE | PROGRESS |
+--------------+------------+----------+---------------+-----------------+-----------+----------+
| test         | customer   |       79 |             1 |                 |         1 |        1 |
| test         | orders     |       81 |             1 |                 |         1 |        1 |
| test         | lineitem   |       83 |             1 |                 |         1 |        1 |
+--------------+------------+----------+---------------+-----------------+-----------+----------+
3 rows in set (0.00 sec)

mysql> SELECT
    ->     l_orderkey,
    ->     SUM(->         l_extendedprice * (1 - l_discount)
    ->     ) AS revenue,
    ->     o_orderdate,
    ->     o_shippriority
    -> FROM
    ->     customer,
    ->     orders,
    ->     lineitem
    -> WHERE
    ->     c_mktsegment = 'BUILDING'
    -> AND c_custkey = o_custkey
    -> AND l_orderkey = o_orderkey
    -> AND o_orderdate < DATE '1996-01-01'
    -> AND l_shipdate > DATE '1996-02-01'
    -> GROUP BY
    ->     l_orderkey,
    ->     o_orderdate,
    ->     o_shippriority
    -> ORDER BY
    ->     revenue DESC,
    ->     o_orderdate
    -> limit 10;
+------------+-------------+-------------+----------------+
| l_orderkey | revenue     | o_orderdate | o_shippriority |
+------------+-------------+-------------+----------------+
|    5828933 | 386117.1688 | 1995-12-03  |              0 |
|    1648647 | 373096.8642 | 1995-12-06  |              0 |
|    1364641 | 352640.6056 | 1995-12-19  |              0 |
|    3949606 | 347750.4435 | 1995-12-23  |              0 |
|    4792161 | 347715.0509 | 1995-12-30  |              0 |
|    4340739 | 347490.5251 | 1995-12-06  |              0 |
|    1609574 | 342497.8886 | 1995-12-31  |              0 |
|    3076934 | 338202.3259 | 1995-12-24  |              0 |
|    3232933 | 337349.2536 | 1995-12-26  |              0 |
|    2345058 | 335142.6104 | 1995-12-31  |              0 |
+------------+-------------+-------------+----------------+
10 rows in set (0.40 sec)
```

查看执行计划：
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655284624830.png)
经过分析发现，查询走的 tiflash，因为出现 ExchangeSender 和 ExchangeReceiver 算子，表明 MPP 已生效。

## 错误排查

### sudo 权限

当遇到如下错误时：

```
Error: executor.ssh.execute_failed: Failed to execute command over SSH for 'tidb@192.168.0.141:22' {ssh_stderr: We trust you have received the usual lecture from the local System
Administrator. It usually boils down to these three things:
    ##1) Respect the privacy of others.
    ##2) Think before you type.
    ##3) With great power comes great responsibility.
sudo: no tty present and no askpass program specified
, ssh_stdout: , ssh_command: export LANG=C; PATH=$PATH:/bin:/sbin:/usr/bin:/usr/sbin /usr/bin/sudo -H bash -c "test -d /tidb-deploy || (mkdir -p /tidb-deploy && chown tidb:$(id -g -n tidb) /tidb-deploy)"}, cause: Process exited with status 1
```

需要添加 sudo 权限：

```
visudo
tidb ALL=(ALL) NOPASSWD: ALL
```

### 内存问题

当发现以下错误时：

```
goroutine 1 [running]:
runtime/debug.Stack()
	/usr/local/go/src/runtime/debug/stack.go:24 +0x65
runtime/debug.PrintStack()
	/usr/local/go/src/runtime/debug/stack.go:16 +0x19
github.com/pingcap/tidb/session.mustExecute({0x42f39c0?, 0xc001078480?}, {0x3dd5b11?, 0x145e707?}, {0xc0016c9780?, 0x37741a0?, 0x1?})
	/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/session/bootstrap.go:2087 +0x8a
github.com/pingcap/tidb/session.insertBuiltinBindInfoRow(...)
	/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/session/bootstrap.go:1461
github.com/pingcap/tidb/session.initBindInfoTable({0x42f39c0, 0xc001078480})
	/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/session/bootstrap.go:1457 +0xb1
github.com/pingcap/tidb/session.doDDLWorks({0x42f39c0, 0xc001078480})
	/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/session/bootstrap.go:1941 +0x2c9
github.com/pingcap/tidb/session.bootstrap({0x42f39c0?, 0xc001078480?})
	/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/session/bootstrap.go:445 +0x2ab
github.com/pingcap/tidb/session.runInBootstrapSession({0x42b5ff0, 0xc000b825a0}, 0x3e27620)
	/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/session/session.go:2941 +0x1ff
github.com/pingcap/tidb/session.BootstrapSession({0x42b5ff0, 0xc000b825a0})
	/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/session/session.go:2829 +0x216
main.createStoreAndDomain()
	/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/tidb-server/main.go:296 +0x114
main.main()
	/home/jenkins/agent/workspace/build-common/go/src/github.com/pingcap/tidb/tidb-server/main.go:202 +0x4ca
```

可能是内存不足，由原有的 8G 扩展到 32G 后，问题没有复现。

## 总结

经过以上验证，用最简单的方式验证了 openEular 2003 SP3 系统下 TiDB 的部署安装和简单的功能验证。由于环境所限，没有经过更多的功能测试和性能测试，在充分的使用和验证后，再行文贡献给大家。
