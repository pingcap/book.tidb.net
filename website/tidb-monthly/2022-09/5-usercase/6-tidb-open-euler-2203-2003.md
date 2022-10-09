---
title: TiDB部署--openEuler2203/2003 单机部署TiDB 6.1.1 - TiDB 社区技术月刊
sidebar_label:  TiDB部署--openEuler2203/2003 单机部署TiDB 6.1.1
hide_title: true
description: 
keywords: [TiDB, 监控, 多集群, 大屏]
---

# TiDB部署--openEuler2203/2003 单机部署TiDB 6.1.1

> 作者：[tracy0984](https://tidb.net/u/tracy0984/answer)

## 背景

TiDB 6.1.1 版本发布之后，已经支持在正式环境下将tidb部署到麒麟V10系统。 一直想在openEuler系统行运行TiDB，就进行了新版本的安装测试。给大家提供参考。

## 安装环境

操作系统：openEuler2203或openEuler2003 SP3

TiDB数据库版本：TiDB v6.1.1

### 系统配置

1. 查看数据盘。/dev/sdb

```
fdisk -l
```

2. 创建分区。

```
parted -s -a optimal /dev/sdb mklabel gpt -- mkpart primary ext4 1 -1
```

3. 格式化文件系统。

```
mkfs.ext4 /dev/sdb1
```

4. 查看数据盘分区 UUID。

```
# lsblk -f
NAME            FSTYPE      LABEL UUID                                   MOUNTPOINT
sda                                                                      
├─sda1          xfs               278ae69e-30a6-40ca-a764-cd8862ef1527   /boot
└─sda2          LVM2_member       tIRIrI-soRh-5TBf-q6tn-cMTd-DMdZ-FucCk7 
  ├─centos-root xfs               13d08fa9-88bc-4b0a-bcab-4e1c1072afd2   /
  └─centos-swap swap              488f568c-b72f-414e-9394-0765cbb9e5a2   [SWAP]
sdb                                                                      
└─sdb1          ext4              87d0467c-d3a1-4916-8112-aed259bf8c8c
```

本例中 sdb1 的 UUID 为 87d0467c-d3a1-4916-8112-aed259bf8c8c。

1. 编辑 /etc/fstab 文件，添加 nodelalloc 挂载参数。

```
# cat /etc/fstab

#
# /etc/fstab
# Created by anaconda on Wed Apr  7 15:27:42 2021
#
# Accessible filesystems, by reference, are maintained under '/dev/disk'
# See man pages fstab(5), findfs(8), mount(8) and/or blkid(8) for more info
#
/dev/mapper/centos-root /                       xfs     defaults        0 0
UUID=278ae69e-30a6-40ca-a764-cd8862ef1527 /boot                   xfs     defaults        0 0
/dev/mapper/centos-swap swap                    swap    defaults        0 0
UUID=87d0467c-d3a1-4916-8112-aed259bf8c8c /u02 ext4 defaults,nodelalloc,noatime 0 2
```

2. 挂载数据盘。

```
mkdir /u02 && mount -a
```

3. 执行以下命令，如果文件系统为 ext4，并且挂载参数中包含 nodelalloc，则表示已生效。

```
# mount -t ext4
/dev/sdb1 on /u02 type ext4 (rw,noatime,nodelalloc,data=ordered)
```

#### 关闭防火墙

1. 检查防火墙状态（以 CentOS Linux release 7.7.1908 (Core) 为例）

```
sudo firewall-cmd --state
sudo systemctl status firewalld.service
```

2. 关闭防火墙服务

```
sudo systemctl stop firewalld.service
```

3. 关闭防火墙自动启动服务

```
sudo systemctl disable firewalld.service
```

4. 检查防火墙状态

```
sudo systemctl status firewalld.service
```

### 开启时钟同步

检查chronyd服务状态

```
[root@cen7-pg-01 ~]# systemctl status chronyd.service
● chronyd.service - NTP client/server
   Loaded: loaded (/usr/lib/systemd/system/chronyd.service; disabled; vendor preset: enabled)
   Active: inactive (dead)
     Docs: man:chronyd(8)
           man:chrony.conf(5)
[root@cen7-pg-01 ~]# chronyc tracking
506 Cannot talk to daemon
```

设置chronyd同步服务器，开启所有节点时钟同步功能

```
# 修改同步服务器配置文件：
# vi /etc/chrony.conf 
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
#server 0.centos.pool.ntp.org iburst
#server 1.centos.pool.ntp.org iburst
#server 2.centos.pool.ntp.org iburst
#server 3.centos.pool.ntp.org iburst
server 192.168.56.10 iburst
# Allow NTP client access from local network.
allow 192.168.0.0/16
# Serve time even if not synchronized to a time source.
local stratum 10

# 修改其他节点chronyd服务配置文件：
# vi /etc/chrony.conf 
# Use public servers from the pool.ntp.org project.
# Please consider joining the pool (http://www.pool.ntp.org/join.html).
#server 0.centos.pool.ntp.org iburst
#server 1.centos.pool.ntp.org iburst
#server 2.centos.pool.ntp.org iburst
#server 3.centos.pool.ntp.org iburst
server 192.168.56.10 iburst

# 启动chronyd服务:
# systemctl start chronyd.service
# systemctl status chronyd.service
● chronyd.service - NTP client/server
   Loaded: loaded (/usr/lib/systemd/system/chronyd.service; disabled; vendor preset: enabled)
   Active: active (running) since Fri 2022-07-22 14:39:39 CST; 4s ago
     Docs: man:chronyd(8)
           man:chrony.conf(5)
  Process: 5505 ExecStartPost=/usr/libexec/chrony-helper update-daemon (code=exited, status=0/SUCCESS)
  Process: 5501 ExecStart=/usr/sbin/chronyd $OPTIONS (code=exited, status=0/SUCCESS)
 Main PID: 5504 (chronyd)
    Tasks: 1
   CGroup: /system.slice/chronyd.service
           └─5504 /usr/sbin/chronyd
Jul 22 14:39:39 cen7-mysql-01 systemd[1]: Stopped NTP client/server.
Jul 22 14:39:39 cen7-mysql-01 systemd[1]: Starting NTP client/server...
Jul 22 14:39:39 cen7-mysql-01 chronyd[5504]: chronyd version 3.4 starting (+CMDMON +NTP +REFCLOCK +RTC +PRIVDROP +SCFILTER +SIGND +ASYNCDNS +SECHASH +IPV6 +DEBUG)
Jul 22 14:39:39 cen7-mysql-01 chronyd[5504]: Frequency 0.156 +/- 235.611 ppm read from /var/lib/chrony/drift
Jul 22 14:39:39 cen7-mysql-01 systemd[1]: Started NTP client/server.
Jul 22 14:39:44 cen7-mysql-01 chronyd[5504]: Selected source 192.168.56.10
[root@cen7-mysql-01 ~]# chronyc tracking
Reference ID    : C0A8380A (cen7-mysql-01)
Stratum         : 11
Ref time (UTC)  : Fri Jul 22 06:39:43 2022
System time     : 0.000000000 seconds fast of NTP time
Last offset     : -0.000003156 seconds
RMS offset      : 0.000003156 seconds
Frequency       : 0.107 ppm fast
Residual freq   : -0.019 ppm
Skew            : 250.864 ppm
Root delay      : 0.000026199 seconds
Root dispersion : 0.001826834 seconds
Update interval : 0.0 seconds
Leap status     : Normal
# systemctl enable chronyd.service
Created symlink from /etc/systemd/system/multi-user.target.wants/chronyd.service to /usr/lib/systemd/system/chronyd.service.
```

### 优化系统参数

在生产系统的 TiDB 中，建议按照官方文档对操作系统进行配置优化 

[TiDB 环境与系统配置检查 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/check-before-deployment#检查和配置操作系统优化参数)

 在虚机环境下只进行了关闭透明大页操作：

1. 查看透明大页的开启状态。

```
# cat /sys/kernel/mm/transparent_hugepage/enabled
[always] madvise never
# cat /sys/kernel/mm/transparent_hugepage/defrag
always defer defer+madvise [madvise] never
以上结果表明透明大页处于启用状态，需要关闭。
```

手动关闭操作：

```
-- 临时关闭透明大页：
# echo never > /sys/kernel/mm/transparent_hugepage/enabled
# echo never > /sys/kernel/mm/transparent_hugepage/defrag 
# cat /sys/kernel/mm/transparent_hugepage/enabled
always madvise [never]
# cat /sys/kernel/mm/transparent_hugepage/defrag 
always defer defer+madvise madvise [never]

-- 下面是永久关闭透明大页操作方法：
# vi /etc/rc.d/rc.local 
-- 在文件尾最佳下面内容
if test -f /sys/kernel/mm/transparent_hugepage/enabled; then
echo never > /sys/kernel/mm/transparent_hugepage/enabled
fi
if test -f /sys/kernel/mm/transparent_hugepage/defrag; then
echo never > /sys/kernel/mm/transparent_hugepage/defrag
fi
-- 赋予/etc/rc.d/rc.local可执行权限
# chmod +x /etc/rc.d/rc.local
```

### 修改操作系统参数

修改/etc/sysctl.conf，设置操作系统相关参数

```
# echo "fs.file-max = 1000000">> /etc/sysctl.conf
# echo "net.core.somaxconn = 32768">> /etc/sysctl.conf
# echo "net.ipv4.tcp_tw_recycle = 0">> /etc/sysctl.conf
# echo "net.ipv4.tcp_syncookies = 0">> /etc/sysctl.conf
# echo "vm.overcommit_memory = 1">> /etc/sysctl.conf
-- 使修改生效
# sysctl -p
```

### openEuler2203系统修改修改sshd服务配置文件，支持ssh-rsa

```
-- 修改sshd服务配置文件
# echo “PubkeyAcceptedKeyTypes=+ssh-rsa” >>/etc/ssh/sshd_config
-- 重启sshd服务
# systemctl restart sshd
```

### 创建TiDB用户并赋权

```
# groupadd tidb
# useradd -g tidb tidb
# passwd tidb
Changing password for user tidb.
New password: tidb
BAD PASSWORD: The password is shorter than 8 characters
Retype new password: tidb
passwd: all authentication tokens updated successfully.

-- 赋予tidb用户在/u02创建目录的权限,用于创建tidb的安装目录和数据目录
# chown -R tidb: /u02

-- 赋予 tidb用户sudo权限
# visudo
-- 添加一行：tidb        ALL=(ALL)       NOPASSWD: ALL
## Same thing without a password
# %wheel        ALL=(ALL)       NOPASSWD: ALL
tidb        ALL=(ALL)       NOPASSWD: ALL

--修改/etc/security/limits.conf文件， 配置tidb用户的操作资源系统限制
cat << EOF >>/etc/security/limits.conf
tidb soft nofile 1000000
tidb hard nofile 1000000
tidb soft stack 32768
tidb hard stack 32768
EOF
```

## 安装TiDB

### 部署离线环境 TiUP 组件

```
-- 解压安装包
# tar -zxf tidb-community-server-v6.1.1-linux-amd64.tar.gz 
# tar -zxf tidb-community-toolkit-v6.1.1-linux-amd64.tar.gz 
# chown -R tidb: /u02/soft/ti*
-- 配置环境变量
# su - tidb
$ cd /u02/soft/tidb-community-server-v6.1.1-linux-amd64/
$ sh ./local_install.sh && source ~/.bash_profile
Disable telemetry success
Successfully set mirror to /u02/soft/tidb-community-server-v6.1.1-linux-amd64
Detected shell: bash
Shell profile:  /home/tidb/.bash_profile
/home/tidb/.bash_profile has been modified to to add tiup to PATH
open a new terminal or source /home/tidb/.bash_profile to use it
Installed path: /home/tidb/.tiup/bin/tiup
===============================================
1. source /home/tidb/.bash_profile
2. Have a try:   tiup playground
===============================================
$ which tiup
/home/tidb/.tiup/bin/tiup
```

### 合并toolkit包

```
$ cd /u02/soft/tidb-community-server-v6.1.1-linux-amd64/
$ cp -rp keys ~/.tiup/
$ tiup mirror merge ../tidb-community-toolkit-v6.1.1-linux-amd64
```

创建安装拓扑文件 这里由于测试条件限制，pd,tidb server和tikv 都设置为了单节点...

```
$ vi topology.yaml
global:
  user: "tidb"  --数据库安装用户
  ssh_port: 22  --ssh 端口号
  deploy_dir: "/u02/tidb-deploy" -- TiDB安装目录
  data_dir: "/u02/tidb-data"  -- TiDB数据目录
#server_configs: {}
pd_servers:  -- pd节点配置
- host: 192.168.56.11
tidb_servers:  -- tidb server节点配置
- host: 192.168.56.11
tikv_servers:  -- tikv 节点配置
- host: 192.168.56.11
monitoring_servers: -- 监控节点配置
- host: 192.168.56.11
grafana_servers:  -- 监控节点配置
- host: 192.168.56.11
alertmanager_servers: -- 监控节点配置
- host: 192.168.56.11
```

### 安装tidb集群

```
-- tidb安装环境检查
$ tiup cluster check  /home/tidb/topology.yaml -p
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.3/tiup-cluster check /home/tidb/topology.yaml -p
Input SSH password: 输入安装用户密码

+ Detect CPU Arch Name
  - Detecting node 192.168.56.11 Arch info ... Done

+ Detect CPU OS Name
  - Detecting node 192.168.56.11 OS info ... Done
+ Download necessary tools
  - Downloading check tools for linux/amd64 ... Done
+ Collect basic system information
+ Collect basic system information
  - Getting system info of 192.168.56.11:22 ... Done
+ Check time zone
  - Checking node 192.168.56.11 ... Done
+ Check system requirements
+ Check system requirements
+ Check system requirements
+ Check system requirements
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
+ Cleanup check files
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
Node           Check         Result  Message
----           -----         ------  -------
192.168.56.11  cpu-cores     Pass    number of CPU cores / threads: 1
192.168.56.11  command       Fail    numactl not usable, bash: line 1: numactl: command not found
192.168.56.11  thp           Pass    THP is disabled
192.168.56.11  service       Fail    service irqbalance is not running
192.168.56.11  os-version    Fail    os vendor openEuler not supported
192.168.56.11  cpu-governor  Warn    Unable to determine current CPU frequency governor policy
192.168.56.11  swap          Warn    swap is enabled, please disable it for best performance
192.168.56.11  memory        Pass    memory size is 0MB
192.168.56.11  network       Pass    network speed of enp0s3 is 1000MB
192.168.56.11  selinux       Pass    SELinux is disabled
-- TiDB集群安装环境问题修复
$ tiup cluster check  /home/tidb/topology.yaml --apply -p
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.3/tiup-cluster check /home/tidb/topology.yaml --apply -p
Input SSH password: 输入安装用户密码

+ Detect CPU Arch Name
  - Detecting node 192.168.56.11 Arch info ... Done

+ Detect CPU OS Name
  - Detecting node 192.168.56.11 OS info ... Done
+ Download necessary tools
  - Downloading check tools for linux/amd64 ... Done
+ Collect basic system information
+ Collect basic system information
  - Getting system info of 192.168.56.11:22 ... Done
+ Check time zone
  - Checking node 192.168.56.11 ... Done
+ Check system requirements
+ Check system requirements
+ Check system requirements
+ Check system requirements
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
  - Checking node 192.168.56.11 ... Done
+ Cleanup check files
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
  - Cleanup check files on 192.168.56.11:22 ... Done
Node           Check         Result  Message
----           -----         ------  -------
192.168.56.11  cpu-governor  Warn    Unable to determine current CPU frequency governor policy, auto fixing not supported
192.168.56.11  memory        Pass    memory size is 0MB
192.168.56.11  selinux       Pass    SELinux is disabled
192.168.56.11  thp           Pass    THP is disabled
192.168.56.11  command       Fail    numactl not usable, bash: line 1: numactl: command not found, auto fixing not supported
192.168.56.11  os-version    Fail    os vendor openEuler not supported, auto fixing not supported
192.168.56.11  cpu-cores     Pass    number of CPU cores / threads: 1
192.168.56.11  swap          Warn    will try to disable swap, please also check /etc/fstab manually
192.168.56.11  network       Pass    network speed of enp0s3 is 1000MB
192.168.56.11  service       Fail    will try to 'start irqbalance.service'

+ Try to apply changes to fix failed checks
  - Applying changes on 192.168.56.11 ... Done
-- TiDB集群安装
$ ]$ tiup cluster deploy tidb-v611 v6.1.1 /home/tidb/topology.yaml -p
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.3/tiup-cluster deploy tidb-v611 v6.1.1 /home/tidb/topology.yaml -p
Input SSH password: 

+ Detect CPU Arch Name
  - Detecting node 192.168.56.11 Arch info ... Done

+ Detect CPU OS Name
  - Detecting node 192.168.56.11 OS info ... Done
Please confirm your topology:
Cluster type:    tidb
Cluster name:    tidb-v611
Cluster version: v6.1.1
Role          Host           Ports        OS/Arch       Directories
----          ----           -----        -------       -----------
pd            192.168.56.11  2379/2380    linux/x86_64  /u02/tidb-deploy/pd-2379,/u02/tidb-data/pd-2379
tikv          192.168.56.11  20160/20180  linux/x86_64  /u02/tidb-deploy/tikv-20160,/u02/tidb-data/tikv-20160
tidb          192.168.56.11  4000/10080   linux/x86_64  /u02/tidb-deploy/tidb-4000
prometheus    192.168.56.11  9090/12020   linux/x86_64  /u02/tidb-deploy/prometheus-9090,/u02/tidb-data/prometheus-9090
grafana       192.168.56.11  3000         linux/x86_64  /u02/tidb-deploy/grafana-3000
alertmanager  192.168.56.11  9093/9094    linux/x86_64  /u02/tidb-deploy/alertmanager-9093,/u02/tidb-data/alertmanager-9093
Attention:
    1. If the topology is not what you expected, check your yaml file.
    2. Please confirm there is no port/directory conflicts in same host.
Do you want to continue? [y/N]: (default=N) y
+ Generate SSH keys ... Done
+ Download TiDB components
  - Download pd:v6.1.1 (linux/amd64) ... Done
  - Download tikv:v6.1.1 (linux/amd64) ... Done
  - Download tidb:v6.1.1 (linux/amd64) ... Done
  - Download prometheus:v6.1.1 (linux/amd64) ... Done
  - Download grafana:v6.1.1 (linux/amd64) ... Done
  - Download alertmanager: (linux/amd64) ... Done
  - Download node_exporter: (linux/amd64) ... Done
  - Download blackbox_exporter: (linux/amd64) ... Done
+ Initialize target host environments
  - Prepare 192.168.56.11:22 ... Done
+ Deploy TiDB instance
  - Copy pd -> 192.168.56.11 ... Done
  - Copy tikv -> 192.168.56.11 ... Done
  - Copy tidb -> 192.168.56.11 ... Done
  - Copy prometheus -> 192.168.56.11 ... Done
  - Copy grafana -> 192.168.56.11 ... Done
  - Copy alertmanager -> 192.168.56.11 ... Done
  - Deploy node_exporter -> 192.168.56.11 ... Done
  - Deploy blackbox_exporter -> 192.168.56.11 ... Done
+ Copy certificate to remote host
+ Init instance configs
  - Generate config pd -> 192.168.56.11:2379 ... Done
  - Generate config tikv -> 192.168.56.11:20160 ... Done
  - Generate config tidb -> 192.168.56.11:4000 ... Done
  - Generate config prometheus -> 192.168.56.11:9090 ... Done
  - Generate config grafana -> 192.168.56.11:3000 ... Done
  - Generate config alertmanager -> 192.168.56.11:9093 ... Done
+ Init monitor configs
  - Generate config node_exporter -> 192.168.56.11 ... Done
  - Generate config blackbox_exporter -> 192.168.56.11 ... Done
Enabling component pd
        Enabling instance 192.168.56.11:2379
        Enable instance 192.168.56.11:2379 success
Enabling component tikv
        Enabling instance 192.168.56.11:20160
        Enable instance 192.168.56.11:20160 success
Enabling component tidb
        Enabling instance 192.168.56.11:4000
        Enable instance 192.168.56.11:4000 success
Enabling component prometheus
        Enabling instance 192.168.56.11:9090
        Enable instance 192.168.56.11:9090 success
Enabling component grafana
        Enabling instance 192.168.56.11:3000
        Enable instance 192.168.56.11:3000 success
Enabling component alertmanager
        Enabling instance 192.168.56.11:9093
        Enable instance 192.168.56.11:9093 success
Enabling component node_exporter
        Enabling instance 192.168.56.11
        Enable 192.168.56.11 success
Enabling component blackbox_exporter
        Enabling instance 192.168.56.11
        Enable 192.168.56.11 success
Cluster `tidb-v611` deployed successfully, you can start it with command: `tiup cluster start tidb-v611 --init`

-- 查看TiDB集群信息
$ tiup cluster list
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.3/tiup-cluster list
Name       User  Version  Path                                                 PrivateKey
----       ----  -------  ----                                                 ----------
tidb-v611  tidb  v6.1.1   /home/tidb/.tiup/storage/cluster/clusters/tidb-v611  /home/tidb/.tiup/storage/cluster/clusters/tidb-v611/ssh/id_rsa

-- 启动TiDB集群
$ tiup cluster start tidb-v611 --init
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.3/tiup-cluster start tidb-v611 --init
Starting cluster tidb-v611...
+ [ Serial ] - SSHKeySet: privateKey=/home/tidb/.tiup/storage/cluster/clusters/tidb-v611/ssh/id_rsa, publicKey=/home/tidb/.tiup/storage/cluster/clusters/tidb-v611/ssh/id_rsa.pub
+ [Parallel] - UserSSH: user=tidb, host=192.168.56.11
+ [Parallel] - UserSSH: user=tidb, host=192.168.56.11
+ [Parallel] - UserSSH: user=tidb, host=192.168.56.11
+ [Parallel] - UserSSH: user=tidb, host=192.168.56.11
+ [Parallel] - UserSSH: user=tidb, host=192.168.56.11
+ [Parallel] - UserSSH: user=tidb, host=192.168.56.11
+ [ Serial ] - StartCluster
Starting component pd
        Starting instance 192.168.56.11:2379
        Start instance 192.168.56.11:2379 success
Starting component tikv
        Starting instance 192.168.56.11:20160
        Start instance 192.168.56.11:20160 success
Starting component tidb
        Starting instance 192.168.56.11:4000
        Start instance 192.168.56.11:4000 success
Starting component prometheus
        Starting instance 192.168.56.11:9090
        Start instance 192.168.56.11:9090 success
Starting component grafana
        Starting instance 192.168.56.11:3000
        Start instance 192.168.56.11:3000 success
Starting component alertmanager
        Starting instance 192.168.56.11:9093
        Start instance 192.168.56.11:9093 success
Starting component node_exporter
        Starting instance 192.168.56.11
        Start 192.168.56.11 success
Starting component blackbox_exporter
        Starting instance 192.168.56.11
        Start 192.168.56.11 success
+ [ Serial ] - UpdateTopology: cluster=tidb-v611
Started cluster `tidb-v611` successfully
The root password of TiDB database has been changed.
The new password is: '097zS8&!1@Vmc+x5Ug'.
Copy and record it to somewhere safe, it is only displayed once, and will not be stored.
The generated password can NOT be get and shown again.

-- 查看TiDB集群状态
$ tiup cluster display tidb-v611 
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.3/tiup-cluster display tidb-v611
Cluster type:       tidb
Cluster name:       tidb-v611
Cluster version:    v6.1.1
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.56.11:2379/dashboard
Grafana URL:        http://192.168.56.11:3000
ID                   Role          Host           Ports        OS/Arch       Status   Data Dir                          Deploy Dir
--                   ----          ----           -----        -------       ------   --------                          ----------
192.168.56.11:9093   alertmanager  192.168.56.11  9093/9094    linux/x86_64  Up       /u02/tidb-data/alertmanager-9093  /u02/tidb-deploy/alertmanager-9093
192.168.56.11:3000   grafana       192.168.56.11  3000         linux/x86_64  Up       -                                 /u02/tidb-deploy/grafana-3000
192.168.56.11:2379   pd            192.168.56.11  2379/2380    linux/x86_64  Up|L|UI  /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.11:9090   prometheus    192.168.56.11  9090/12020   linux/x86_64  Up       /u02/tidb-data/prometheus-9090    /u02/tidb-deploy/prometheus-9090
192.168.56.11:4000   tidb          192.168.56.11  4000/10080   linux/x86_64  Up       -                                 /u02/tidb-deploy/tidb-4000
192.168.56.11:20160  tikv          192.168.56.11  20160/20180  linux/x86_64  Up       /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
Total nodes: 6

-- 附，测试后，可以使用下面命令删除集群：
tiup cluster destroy tidb-v611
```

## 总结

在openEuler2203和openEuler2003SP3系统都进行了测试,均能正常完成tidbv6.1.1的安装，不过目前官方还未支持建正式环境使用openEuler系统。

注意事项：

1.在openEuler2203系统中，普通用户不再具有systemctl命令的执行权限。

 在安装过程中，tidb cluster check、deploy 命令建议不要指定--user 参数为root以外的用户。

 如果想指定--user为其他用户，可以提前修改/usr/share/polkit-1/actions/org.freedesktop.systemd1.policy的配置。

```
# vi /usr/share/polkit-1/actions/org.freedesktop.systemd1.policy
--修改action-id为 org.freedesktop.systemd1.manage-units，org.freedesktop.systemd1.manage-unit-files，org.freedesktop.systemd1.set-environment和org.freedesktop.systemd1.reload-daemon的项中
<defaults>部分内容如下：
           <defaults>
                       <!--
                        <allow_any>auth_admin</allow_any>
                        <allow_inactive>auth_admin</allow_inactive>
                        <allow_active>auth_admin_keep</allow_active>
                        -->
                        <allow_any>yes</allow_any>
                        <allow_inactive>yes</allow_inactive>
                        <allow_active>yes</allow_active>
            </defaults>
```

期待官方早日支持TiDB正式环境可以部署到openEuler2203/2003系统。

## 附，安装过程报错处理

### 1. tidb cluster check 命令报错：failed to fetch cpu-arch or kernel-name

```
$ tiup cluster check  /home/tidb/topology.yaml -p
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.3/tiup-cluster check /home/tidb/topology.yaml -p
Input SSH password: 

+ Detect CPU Arch Name
  - Detecting node 192.168.56.12 Arch info ... Error

Error: failed to fetch cpu-arch or kernel-name: executor.ssh.execute_failed: Failed to execute command over SSH for 'tidb@192.168.56.12:22' {ssh_stderr: We trust you have received the usual lecture from the local System
Administrator. It usually boils down to these three things:
    #1) Respect the privacy of others.
    #2) Think before you type.
    #3) With great power comes great responsibility.
sudo: a terminal is required to read the password; either use the -S option to read from standard input or configure an askpass helper
, ssh_stdout: , ssh_command: export LANG=C; PATH=$PATH:/bin:/sbin:/usr/bin:/usr/sbin /usr/bin/sudo -H bash -c "uname -m"}, cause: Process exited with status 1

Verbose debug logs has been written to /home/tidb/.tiup/logs/tiup-cluster-debug-2022-09-11-02-11-58.log.
```

问题原因：tidb用户没有sudo权限

解决方法：

```
# visudo
-- 添加一行：tidb        ALL=(ALL)       NOPASSWD: ALL
## Same thing without a password
# %wheel        ALL=(ALL)       NOPASSWD: ALL
tidb        ALL=(ALL)       NOPASSWD: ALL
```

### 2. tidb cluster deploy 命令报错：failed to enable/disable pd: failed to enable: 192.168.56.11 pd-2379.service

```
# tiup cluster deploy tidb-v530 v5.3.0 /home/tidb/topology.yaml --user root -p
Starting component `cluster`: /root/.tiup/components/cluster/v1.7.0/tiup-cluster deploy tidb-v530 v5.3.0 /home/tidb/topology.yaml --user root -p
Input SSH password: 


Run command on 192.168.56.11(sudo:false): uname -m
Please confirm your topology:
Cluster type:    tidb
Cluster name:    tidb-v530
Cluster version: v5.3.0
Role          Host           Ports        OS/Arch  Directories
----          ----           -----        -------  -----------
pd            192.168.56.11  2379/2380    linux/   /u02/tidb-deploy/pd-2379,/u02/tidb-data/pd-2379
tikv          192.168.56.11  20160/20180  linux/   /u02/tidb-deploy/tikv-20160,/u02/tidb-data/tikv-20160
tidb          192.168.56.11  4000/10080   linux/   /u02/tidb-deploy/tidb-4000
prometheus    192.168.56.11  9090         linux/   /u02/tidb-deploy/prometheus-9090,/u02/tidb-data/prometheus-9090
grafana       192.168.56.11  3000         linux/   /u02/tidb-deploy/grafana-3000
alertmanager  192.168.56.11  9093/9094    linux/   /u02/tidb-deploy/alertmanager-9093,/u02/tidb-data/alertmanager-9093
Attention:
    1. If the topology is not what you expected, check your yaml file.
    2. Please confirm there is no port/directory conflicts in same host.
Do you want to continue? [y/N]: (default=N) y

......
Enabling component pd
        Enabling instance 192.168.56.11:2379

Error: failed to enable/disable pd: failed to enable: 192.168.56.11 pd-2379.service, please check the instance's log(/u02/tidb-deploy/pd-2379/log) for more detail.: executor.ssh.execute_failed: Failed to execute command over SSH for 'tidb@192.168.56.11:22' {ssh_stderr: , ssh_stdout: , ssh_command: export LANG=C; PATH=$PATH:/bin:/sbin:/usr/bin:/usr/sbin /usr/bin/sudo -H bash -c "systemctl daemon-reload && systemctl enable pd-2379.service"}, cause: ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey], no supported methods remain

Verbose debug logs has been written to /root/.tiup/logs/tiup-cluster-debug-2022-09-10-17-11-50.log.
Error: run `/root/.tiup/components/cluster/v1.7.0/tiup-cluster` (wd:/root/.tiup/data/TH1LwcK) failed: exit status 1
```

问题原因：sshd服务不支持ssh-rsa

解决方法：

```
-- 修改sshd服务配置文件
# echo “PubkeyAcceptedKeyTypes=+ssh-rsa” >>/etc/ssh/sshd_config
-- 重启sshd服务
# systemctl restart sshd
```