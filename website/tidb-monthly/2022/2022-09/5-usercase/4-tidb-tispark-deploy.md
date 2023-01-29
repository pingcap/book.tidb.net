---
title: TiDB+TiSpark部署--安装，扩缩容及升级操作 - TiDB 社区技术月刊
sidebar_label:  TiDB+TiSpark部署--安装，扩缩容及升级操作
hide_title: true
description: 本文记录了在虚机环境下，完整的TiDBv5.3.0数据库的安装，扩缩容和升级过程，也记录了TiSark的部署过程。
keywords: [TiDB, TiSpark, 部署, 安装, 扩缩容, 升级操作]
---

# TiDB+TiSpark部署--安装，扩缩容及升级操作

> 作者：[tracy0984](https://tidb.net/u/tracy0984/answer)

## 背景

随着业务的变更，可能经常会遇到TiDB数据库的TiKV或TIDB Server节点扩缩容的需求。下面记录了在虚机环境下，完整的TiDBv5.3.0数据库的安装，扩缩容和升级过程，也记录了TiSark的部署过程。给有需要的小伙伴提供个参考。

## 安装TiDBv5.3.0

为了方便后面的升级测试，选择安装了较低版本的TiDB-v5.3.0。

### 安装环境

操作系统版本：CentOS 7.9

TiDB数据库版本：TIDB v5.3.0

TIDB数据库安装拓扑：

PD：3节点

TiDB：1节点（这里安装了最小节点数，原因是想后面进行TiDB节点扩容操作）

TiKV：3节点

*PS: 以上PD,TiDB和TiKV的最小安装节点个数都是1节点。* 

### 系统配置

安装TiDB前要进行一些准备工作，创建安装目录，创建安装用户以及系统参数优化等工作。

#### 挂载数据盘

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

本例中 nvme0n1p1 的 UUID 为 87d0467c-d3a1-4916-8112-aed259bf8c8c。

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
mkdir /data1 && mount -a
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

#### 开启时钟同步

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
-- 检查系统时钟同步状态：Leap status = Normal表示状态正常
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
-- 设置chronyd服务开机自启动
# systemctl enable chronyd.service
Created symlink from /etc/systemd/system/multi-user.target.wants/chronyd.service to /usr/lib/systemd/system/chronyd.service.
```

#### 优化系统参数

在生产系统的 TiDB 中，建议按照官方文档[TiDB 环境与系统配置检查 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/check-before-deployment#检查和配置操作系统优化参数)对操作系统进行配置优化。

本次在虚机环境进行安装测试，只关闭了透明大页：

```
-- 检查操作系统时候关闭透明大页：
# cat /sys/kernel/mm/transparent_hugepage/enabled
# cat /sys/kernel/mm/transparent_hugepage/defrag
如果查询为：
[always] madvise never 
表示透明大页处于启用状态，需要关闭。
-- 关闭操作系统的透明大页方法：
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo never > /sys/kernel/mm/transparent_hugepage/defrag
-- 永久关闭操作系统的透明大页方法：
# vi /etc/rc.d/rc.local 
-- 在文件尾追加如下内容
if test -f /sys/kernel/mm/transparent_hugepage/enabled; then
echo never > /sys/kernel/mm/transparent_hugepage/enabled
fi
if test -f /sys/kernel/mm/transparent_hugepage/defrag; then
echo never > /sys/kernel/mm/transparent_hugepage/defrag
fi
# chmod +x /etc/rc.d/rc.local
```

#### 创建TiDB用户

```
# groupadd tidb
# useradd -g tidb tidb
# passwd tidb
Changing password for user tidb.
New password:-- 输入tidb用户密码 
BAD PASSWORD: The password is shorter than 8 characters
Retype new password: -- 再次输入tidb用户密码 
passwd: all authentication tokens updated successfully.
-- 创建数据库安装目录，并赋权
# mkdir /u02/tidb-data
# mkdir /u02/tidb-deploy
# chown -R tidb: /u02
```

#### 修改 sysctl 参数

```
--修改/etc/sysctl.conf 设置操作系统参数
# echo "fs.file-max = 1000000">> /etc/sysctl.conf
# echo "net.core.somaxconn = 32768">> /etc/sysctl.conf
# echo "net.ipv4.tcp_tw_recycle = 0">> /etc/sysctl.conf
# echo "net.ipv4.tcp_syncookies = 0">> /etc/sysctl.conf
# echo "vm.overcommit_memory = 1">> /etc/sysctl.conf
-- 使修改生效
# sysctl -p
```

#### 配置tidb用户的 limits.conf 文件

```
# cat << EOF >>/etc/security/limits.conf
tidb soft nofile 1000000
tidb hard nofile 1000000
tidb soft stack 32768
tidb hard stack 32768
EOF
```

### 安装TiDB

#### 部署离线环境 TiUP 组件

```
-- 解压TIDB安装文件
# tar -zxf tidb-community-server-v5.3.0-linux-amd64.tar.gz 
# tar -zxf tidb-community-toolkit-v5.3.0-linux-amd64.tar.gz 
# chown -R tidb: /u01/soft/ti*
# su - tidb
-- 配置TIDB相关环境变量
$ cd /u01/soft/tidb-community-server-v5.3.0-linux-amd64/
$ sh ./local_install.sh && source /home/tidb/.bash_profile
Disable telemetry success
Successfully set mirror to /u01/soft/tidb-community-server-v5.3.0-linux-amd64
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
~/.tiup/bin/tiup
```

#### 创建安装拓扑文件

```
$ vi topology.yaml
global:
  user: "tidb"
  ssh_port: 22
  deploy_dir: "/u02/tidb-deploy"
  data_dir: "/u02/tidb-data"
#server_configs: {}
pd_servers:
- host: 192.168.56.10
- host: 192.168.56.11
- host: 192.168.56.12
tidb_servers:
- host: 192.168.56.10
tikv_servers:
- host: 192.168.56.10
- host: 192.168.56.11
- host: 192.168.56.12
monitoring_servers:
- host: 192.168.56.10
grafana_servers:
- host: 192.168.56.10
alertmanager_servers:
- host: 192.168.56.10
```

#### 安装tidb集群

这里使用TiUP离线部署方式安装TIDB：

```
-- 安装环境检查
$ tiup cluster check ./topology.yaml --user root -p
详细的检查结果已省略
在日志的最后可以看到哪些检查项未通过
-- 修复系统环境中存在的问题
$ tiup cluster deploy tidb-test v5.3.0 ./topology.yaml --user root -p
详细的检查结果已省略
在日志的最后如果看到的所有- Apply change on <IP> 的结果都为Done,表示修复成功
-- 开始安装TIDB集群
$ tiup cluster deploy tidb-test v5.3.0 ./topology.yaml --user root -p
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster deploy tidb-test v5.3.0 ./topology.yaml --user root -p
Input SSH password: root密码

+ Detect CPU Arch
  - Detecting node 192.168.56.10 ... Done
  - Detecting node 192.168.56.11 ... Done
  - Detecting node 192.168.56.12 ... Done
Please confirm your topology:
Cluster type:    tidb
Cluster name:    tidb-test
Cluster version: v5.3.0
Role          Host           Ports        OS/Arch       Directories
----          ----           -----        -------       -----------
pd            192.168.56.10  2379/2380    linux/x86_64  /u02/tidb-deploy/pd-2379,/u02/tidb-data/pd-2379
pd            192.168.56.11  2379/2380    linux/x86_64  /u02/tidb-deploy/pd-2379,/u02/tidb-data/pd-2379
pd            192.168.56.12  2379/2380    linux/x86_64  /u02/tidb-deploy/pd-2379,/u02/tidb-data/pd-2379
tikv          192.168.56.10  20160/20180  linux/x86_64  /u02/tidb-deploy/tikv-20160,/u02/tidb-data/tikv-20160
tikv          192.168.56.11  20160/20180  linux/x86_64  /u02/tidb-deploy/tikv-20160,/u02/tidb-data/tikv-20160
tikv          192.168.56.12  20160/20180  linux/x86_64  /u02/tidb-deploy/tikv-20160,/u02/tidb-data/tikv-20160
tidb          192.168.56.10  4000/10080   linux/x86_64  /u02/tidb-deploy/tidb-4000
prometheus    192.168.56.10  9090         linux/x86_64  /u02/tidb-deploy/prometheus-9090,/u02/tidb-data/prometheus-9090
grafana       192.168.56.10  3000         linux/x86_64  /u02/tidb-deploy/grafana-3000
alertmanager  192.168.56.10  9093/9094    linux/x86_64  /u02/tidb-deploy/alertmanager-9093,/u02/tidb-data/alertmanager-9093
Attention:
    1. If the topology is not what you expected, check your yaml file.
    2. Please confirm there is no port/directory conflicts in same host.
Do you want to continue? [y/N]: (default=N) y  --按照提示输入y,继续安装
...这里省略部分日志
Cluster `tidb-test` deployed successfully, you can start it with command: `tiup cluster start tidb-test`
看到安装过程最后一行提示‘deployed successfully’，表示安装成功
```

#### 启动tidb集群

```
-- 查看当前从系统中的TiDB集群列表
$ tiup cluster list
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster list
Name       User  Version  Path                                                 PrivateKey
----       ----  -------  ----                                                 ----------
tidb-test  tidb  v5.3.0   /home/tidb/.tiup/storage/cluster/clusters/tidb-test  /home/tidb/.tiup/storage/cluster/clusters/tidb-test/ssh/id_rsa
-- 启动tidb-test集群
$ tiup cluster start tidb-test
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster start tidb-test
Starting cluster tidb-test...
......中间的日志已省略
+ [ Serial ] - UpdateTopology: cluster=tidb-test
Started cluster `tidb-test` successfully
-- 查看集群状态
$ tiup cluster display tidb-test
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster display tidb-test
Cluster type:       tidb
Cluster name:       tidb-test
Cluster version:    v5.3.0
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.56.11:2379/dashboard
ID                   Role          Host           Ports        OS/Arch       Status  Data Dir                          Deploy Dir
--                   ----          ----           -----        -------       ------  --------                          ----------
192.168.56.10:9093   alertmanager  192.168.56.10  9093/9094    linux/x86_64  Up      /u02/tidb-data/alertmanager-9093  /u02/tidb-deploy/alertmanager-9093
192.168.56.10:3000   grafana       192.168.56.10  3000         linux/x86_64  Up      -                                 /u02/tidb-deploy/grafana-3000
192.168.56.10:2379   pd            192.168.56.10  2379/2380    linux/x86_64  Up|L    /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.11:2379   pd            192.168.56.11  2379/2380    linux/x86_64  Up|UI   /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.12:2379   pd            192.168.56.12  2379/2380    linux/x86_64  Up      /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.10:9090   prometheus    192.168.56.10  9090         linux/x86_64  Up      /u02/tidb-data/prometheus-9090    /u02/tidb-deploy/prometheus-9090
192.168.56.10:4000   tidb          192.168.56.10  4000/10080   linux/x86_64  Up      -                                 /u02/tidb-deploy/tidb-4000
192.168.56.10:20160  tikv          192.168.56.10  20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.11:20160  tikv          192.168.56.11  20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.12:20160  tikv          192.168.56.12  20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
Total nodes: 10
以上集群状态正常。
```

至此，TiDB集群安装完毕。

我们可以使用mysql 客户端工具连接TIDB数据库，进行数据库操作。

### TIDB集群部署总结

在CentOS7.9 操作系统上进行TiDB v5.3.0数据库安装操作，参考官方文档的操作步骤基本可以顺利完成安装：

[TiDB 软件和硬件环境建议配置 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/v5.3/hardware-and-software-requirements)

其中，TiDB 环境与系统配置检查部分，需要根据实际的安装环境进行调整。

### 附，安装TiDBv5.3.0过程中遇到的问题

按照官方文档将 server 和 toolkit 两个离线镜像合并时，报错了。但是不进行server 和 toolkit 的合并操作也可以顺利完成安装过程。

报错信息如下:

```
$ cd /u01/soft/tidb-community-server-v5.3.0-linux-amd64/
$ cp -rp keys ~/.tiup/
$ tiup mirror merge ../tidb-community-toolkit-v5.3.0-linux-amd64
Error: resource snapshot.json: not found
```

## TiDB集群扩缩容

TiDB 集群可以在不中断线上服务的情况下进行扩容和缩容。

扩缩容操作参考官方文档：[使用 TiUP 扩容缩容 TiDB 集群 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/scale-tidb-using-tiup)

### 扩容

#### 修改扩容配置文件，扩容一个tidb server节点和一个tikv节点

注：这里如果新TiDB节点信息中存在新加入TiDB集群的主机，在扩容前，需要按照上面TIDB安装步骤中系统配置部分的内容对新节点进行配置。

```
vi scale-out.yaml
tidb_servers:
  - host: 192.168.56.11
tikv_servers:
  - host: 192.168.56.150

```

#### 进行扩容操作

```
--使用tiup cluster scale-out命令进行TiDB集群扩容
$ tiup cluster scale-out tidb-test ./scale-out.yaml -p -u root
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster scale-out tidb-test ./scale-out.yaml -p -u root
Input SSH password: root密码

+ Detect CPU Arch
  - Detecting node 192.168.56.150 ... Done
...省略中间日志
+ [ Serial ] - UpdateTopology: cluster=tidb-test
Scaled cluster `tidb-test` out successfully
--看到扩容过程最后一行提示'Scaled cluster `集群名称` out successfully',表示扩容成功

-- 扩容后再次查看集群状态，确认新节点已经成功加入集群
$ tiup cluster display tidb-test
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster display tidb-test
Cluster type:       tidb
Cluster name:       tidb-test
Cluster version:    v5.3.0
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.56.11:2379/dashboard
ID                    Role          Host            Ports        OS/Arch       Status  Data Dir                          Deploy Dir
--                    ----          ----            -----        -------       ------  --------                          ----------
192.168.56.10:9093    alertmanager  192.168.56.10   9093/9094    linux/x86_64  Up      /u02/tidb-data/alertmanager-9093  /u02/tidb-deploy/alertmanager-9093
192.168.56.10:3000    grafana       192.168.56.10   3000         linux/x86_64  Up      -                                 /u02/tidb-deploy/grafana-3000
192.168.56.10:2379    pd            192.168.56.10   2379/2380    linux/x86_64  Up      /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.11:2379    pd            192.168.56.11   2379/2380    linux/x86_64  Up|UI   /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.12:2379    pd            192.168.56.12   2379/2380    linux/x86_64  Up|L    /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.10:9090    prometheus    192.168.56.10   9090         linux/x86_64  Up      /u02/tidb-data/prometheus-9090    /u02/tidb-deploy/prometheus-9090
192.168.56.10:4000    tidb          192.168.56.10   4000/10080   linux/x86_64  Up      -                                 /u02/tidb-deploy/tidb-4000
192.168.56.11:4000    tidb          192.168.56.11   4000/10080   linux/x86_64  Up      -                                 /u02/tidb-deploy/tidb-4000
192.168.56.10:20160   tikv          192.168.56.10   20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.11:20160   tikv          192.168.56.11   20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.12:20160   tikv          192.168.56.12   20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.150:20160  tikv          192.168.56.150  20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
Total nodes: 12
```

### 缩容

```
-- 使用tiup cluster scale-in命令进行TiDB集群缩容操作，--node参数指定要移除的节点的IP和端口号
$ tiup cluster scale-in tidb-test --node 192.168.56.150:20160
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster scale-in tidb-test --node 192.168.56.150:20160
This operation will delete the 192.168.56.150:20160 nodes in `tidb-test` and all their data.
Do you want to continue? [y/N]:(default=N) y
Scale-in nodes...
...省略中间日志
Scaled cluster `tidb-test` in successfully
--看到缩容过程最后一行提示'Scaled cluster `集群名称` in successfully',表示缩容成功
-- 扩容后再次查看集群状态，确认被移除节点状态已经更改为Tombstone
$ tiup cluster display tidb-test
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster display tidb-test
Cluster type:       tidb
Cluster name:       tidb-test
Cluster version:    v5.3.0
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.56.11:2379/dashboard
ID                    Role          Host            Ports        OS/Arch       Status     Data Dir                          Deploy Dir
--                    ----          ----            -----        -------       ------     --------                          ----------
192.168.56.10:9093    alertmanager  192.168.56.10   9093/9094    linux/x86_64  Up         /u02/tidb-data/alertmanager-9093  /u02/tidb-deploy/alertmanager-9093
192.168.56.10:3000    grafana       192.168.56.10   3000         linux/x86_64  Up         -                                 /u02/tidb-deploy/grafana-3000
192.168.56.10:2379    pd            192.168.56.10   2379/2380    linux/x86_64  Up         /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.11:2379    pd            192.168.56.11   2379/2380    linux/x86_64  Up|UI      /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.12:2379    pd            192.168.56.12   2379/2380    linux/x86_64  Up|L       /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.10:9090    prometheus    192.168.56.10   9090         linux/x86_64  Up         /u02/tidb-data/prometheus-9090    /u02/tidb-deploy/prometheus-9090
192.168.56.10:4000    tidb          192.168.56.10   4000/10080   linux/x86_64  Up         -                                 /u02/tidb-deploy/tidb-4000
192.168.56.11:4000    tidb          192.168.56.11   4000/10080   linux/x86_64  Up         -                                 /u02/tidb-deploy/tidb-4000
192.168.56.10:20160   tikv          192.168.56.10   20160/20180  linux/x86_64  Up         /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.11:20160   tikv          192.168.56.11   20160/20180  linux/x86_64  Up         /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.12:20160   tikv          192.168.56.12   20160/20180  linux/x86_64  Up         /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.150:20160  tikv          192.168.56.150  20160/20180  linux/x86_64  Tombstone  /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
Total nodes: 12
There are some nodes can be pruned: 
        Nodes: [192.168.56.150:20160]
        You can destroy them with the command: `tiup cluster prune tidb-test`
-- 根据上面提示，我们使用tiup cluster prune <集群名称> 命令，彻底删除已被移除集群的节点
$ tiup cluster prune tidb-test
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster prune tidb-test
...省略中间日志
Destroy success
-- 看到命令最后一行提示'Destroy success'.可再次查询集群状态，确认被移除节点信息已被清理
```

## TiSpark部署方法

这里介绍两种部署TiSpark的方法

### 方法一，Tiup Cluster部署TiSpark

关于使用Tiup工具安装TiSpark的部署说明可参考官方文档：

[TiSpark 部署拓扑 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/tispark-deployment-topology#tispark-部署拓扑)

#### 首先安装系统java环境

```
--安装jdk8过程略
```

#### 修改扩容配置文件](#TiSpark部署方法/方法一，Tiup Cluster部署TiSpark/修改扩容配置文件)

注：这里如果新TiSpark节点信息中存在新加入TiDB集群的主机，在扩容前，需要按照上面TIDB安装步骤中系统配置部分的内容对新节点进行配置。

```
$ vi scale-out.yaml
tispark_masters:
  - host: 192.168.56.150
tispark_workers:
  - host: 192.168.56.12
```

#### 使用Tiup工具部署TiSpark（目前官方还是实验阶段）

```
[tidb@cen7-pg-01 bin]$ pwd
/u02/tidb-deploy/tispark-worker-7078/bin
[tidb@cen7-mysql-01 ~]$ tiup cluster scale-out tidb-test ./scale-out.yaml -p -u root
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster scale-out tidb-test ./scale-out.yaml -p -u root
Input SSH password: 
.........此处省略较长的输出日志
Scaled cluster `tidb-test` out successfully

-- 扩容后查看集群状态
[tidb@cen7-mysql-01 ~]$ tiup cluster display tidb-test
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster display tidb-test
Cluster type:       tidb
Cluster name:       tidb-test
Cluster version:    v5.3.0
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.56.11:2379/dashboard
ID                   Role            Host            Ports        OS/Arch       Status  Data Dir                          Deploy Dir
--                   ----            ----            -----        -------       ------  --------                          ----------
192.168.56.10:9093   alertmanager    192.168.56.10   9093/9094    linux/x86_64  Up      /u02/tidb-data/alertmanager-9093  /u02/tidb-deploy/alertmanager-9093
192.168.56.10:3000   grafana         192.168.56.10   3000         linux/x86_64  Up      -                                 /u02/tidb-deploy/grafana-3000
192.168.56.10:2379   pd              192.168.56.10   2379/2380    linux/x86_64  Up      /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.11:2379   pd              192.168.56.11   2379/2380    linux/x86_64  Up|UI   /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.12:2379   pd              192.168.56.12   2379/2380    linux/x86_64  Up|L    /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.10:9090   prometheus      192.168.56.10   9090         linux/x86_64  Up      /u02/tidb-data/prometheus-9090    /u02/tidb-deploy/prometheus-9090
192.168.56.10:4000   tidb            192.168.56.10   4000/10080   linux/x86_64  Up      -                                 /u02/tidb-deploy/tidb-4000
192.168.56.11:4000   tidb            192.168.56.11   4000/10080   linux/x86_64  Up      -                                 /u02/tidb-deploy/tidb-4000
192.168.56.10:20160  tikv            192.168.56.10   20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.11:20160  tikv            192.168.56.11   20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.12:20160  tikv            192.168.56.12   20160/20180  linux/x86_64  Up      /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.150:7077  tispark-master  192.168.56.150  7077/8080    linux/x86_64  Up      -                                 /u02/tidb-deploy/tispark-master-7077
192.168.56.12:7078   tispark-worker  192.168.56.12   7078/8081    linux/x86_64  Up      -                                 /u02/tidb-deploy/tispark-worker-7078
Total nodes: 13
-- tispark已成功部署
```

#### tispark查询测试

```
-- 测试使用spark-sql工具连接TiDB数据库
[tidb@cen7-pg-01 bin]$ pwd
/u02/tidb-deploy/tispark-worker-7078/bin
[tidb@cen7-pg-01 bin]$ ./spark-sql 
......省略过长的输出日志
spark-sql> show databases;
22/07/28 10:17:27 INFO PDClient: Switched to new leader: [leaderInfo: 192.168.56.11:2379]
22/07/28 10:17:29 INFO ReflectionUtil$: tispark class url: file:/u02/tidb-deploy/tispark-worker-7078/jars/tispark-assembly-2.4.1.jar
22/07/28 10:17:29 INFO ReflectionUtil$: spark wrapper class url: jar:file:/u02/tidb-deploy/tispark-worker-7078/jars/tispark-assembly-2.4.1.jar!/resources/spark-wrapper-spark-2_4/
22/07/28 10:17:29 INFO HiveMetaStore: 0: get_databases: *
22/07/28 10:17:29 INFO audit: ugi=tidb  ip=unknown-ip-addr      cmd=get_databases: *
22/07/28 10:17:29 INFO CodeGenerator: Code generated in 342.766519 ms
default
test
mysql
Time taken: 4.469 seconds, Fetched 3 row(s)
22/07/28 10:17:29 INFO SparkSQLCLIDriver: Time taken: 4.469 seconds, Fetched 3 row(s)
--设置当前数据库
spark-sql> use test;
22/07/28 10:17:35 INFO HiveMetaStore: 0: get_database: test
22/07/28 10:17:35 INFO audit: ugi=tidb  ip=unknown-ip-addr      cmd=get_database: test
Time taken: 0.081 seconds
22/07/28 10:17:35 INFO SparkSQLCLIDriver: Time taken: 0.081 seconds
-- 查询t1表内容
spark-sql> select * from t1;
....省略中间日志
1       a
2       c
3       e
4       f
5       g
Time taken: 0.245 seconds, Fetched 5 row(s)
22/07/28 10:25:22 INFO SparkSQLCLIDriver: Time taken: 0.245 seconds, Fetched 5 row(s)
22/07/28 10:25:22 INFO TaskSchedulerImpl: Removed TaskSet 1.0, whose tasks have all completed, from pool 
spark-sql> 
```

### 方法二，在Tiup Cluster外单独部署TiSpark

参考文档：

官方文档中单独部署TiSpark指南:[TiSpark 用户指南 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/tispark-overview) 

GitHub中TiSpark的UserGuide:[tispark/userguide.md at master · pingcap/tispark · GitHub](https://github.com/pingcap/tispark/blob/master/docs/userguide.md#prerequisites-for-setting-up-tispark)

安装时要注意根据spark的安装版本，选择对应的TiSpark版本：[TiSpark 用户指南 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/tispark-overview#环境准备)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1663645440131.png)

#### 安装Spark3.1.3+TiSpark3.1
```
-- 在安装spark之前要先搭建将Java环境
安装jdk8过程略

-- 修改 /etc/hosts文件，配置Spark节点的主机名
# vi /etc/hosts
127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
192.168.56.18 TiSpark01
192.168.56.19 TiSpark02

-- 创建spark 安装目录并设置访问权限
# mkdir /tidb-data
# groupadd tidb
# useradd -g tidb tidb
# chown -R tidb: /tidb-data

-- 解压Spark安装包
$ tar -zxf /tidb-data/spark-3.1.3-bin-hadoop3.2.tgz -C /home/tidb

-- 将tispark的jar包复制到到spark的jars目录中
$ cp /tidb-data/tispark-assembly-3.1-2.5.1.jar /home/tidb/spark-3.1.3-bin-hadoop3.2/jars/

-- 修改环境变量
$ vim .bash_profile
export SPARK_HOME=/home/tidb/spark-3.1.3-bin-hadoop3.2
export PATH=$SPARK_HOME/bin:$SPARK_HOME/sbin:$PATH

--修改spark配置文件
$ cd spark-3.1.3-bin-hadoop3.2/conf/
$ ls -ltr
total 36
-rw-r--r-- 1 tidb tidb  865 Feb  6 18:05 workers.template
-rwxr-xr-x 1 tidb tidb 4428 Feb  6 18:05 spark-env.sh.template
-rw-r--r-- 1 tidb tidb 1292 Feb  6 18:05 spark-defaults.conf.template
-rw-r--r-- 1 tidb tidb 9141 Feb  6 18:05 metrics.properties.template
-rw-r--r-- 1 tidb tidb 2371 Feb  6 18:05 log4j.properties.template
-rw-r--r-- 1 tidb tidb 1105 Feb  6 18:05 fairscheduler.xml.template

-- 配置worker节点信息
$ mv spark-env.sh.template spark-env.sh
$ mv spark-defaults.conf.template spark-defaults.conf
$ mv workers.template workers
$ vi workers 
注释localhost行
添加行：
192.168.56.19
-- 修改spark默认配置
--在spark-defaults.conf文件中添加TiSpark配置参数：
  -- spark.tispark.pd.addresses 允许输入按逗号 (',') 分隔的多个 PD 服务器，请指定每个服务器的端口号。
[tidb@TiSpark01 conf]$ vi spark-defaults.conf
spark.tispark.pd.addresses 192.168.56.11:2379,192.168.56.13:2379,192.168.56.14:2379 
spark.sql.extensions org.apache.spark.sql.TiExtensions
##对于 TiSpark 版本 >= 2.5.0，请添加以下附加配置以启用catalog 
spark.sql.catalog.tidb_catalog  org.apache.spark.sql.catalyst.catalog.TiCatalog
spark.sql.catalog.tidb_catalog.pd.addresses  192.168.56.11:2379,192.168.56.13:2379,192.168.56.14:2379

-- 设置spark运行参数
$  vi spark-env.sh 
#设置运行master进程的节点
export SPARK_MASTER_HOST=master 
#设置master的通信端口
export SPARK_MASTER_PORT=7077 
#每个worker使用的核数
export SPARK_WORKER_CORES=1 
#每个worker使用的内存大小
export SPARK_WORKER_MEMORY=1024M 
#master的webui端口
export SPARK_MASTER_WEBUI_PORT=8080 
#spark的配置文件目录 
export SPARK_CONF_DIR=/home/tidb/spark-3.1.3-bin-hadoop3.2/conf 
#jdk安装路径
export JAVA_HOME=/home/tidb/java/jdk1.8 
-- 将修改后的spark目录复制到worker节点
$ scp -r ~/spark-3.1.3-bin-hadoop3.2/ 192.168.56.19:/home/tidb/

--启动spark
$  ~/spark-3.1.3-bin-hadoop3.2/sbin/start-all.sh 
starting org.apache.spark.deploy.master.Master, logging to /home/tidb/spark-3.1.3-bin-hadoop3.2/logs/spark-tidb-org.apache.spark.deploy.master.Master-1-TiSpark01.out
192.168.56.19:  Welcome to SjCredit 
192.168.56.19: starting org.apache.spark.deploy.worker.Worker, logging to /home/tidb/spark-3.1.3-bin-hadoop3.2/logs/spark-tidb-org.apache.spark.deploy.worker.Worker-1-TiSpark02.out

--查看spark进程，正常启动
$     ps -ef|grep spark
tidb     11868     1 16 04:55 ?        00:00:05 /home/ysops/java/jdk1.8/bin/java -cp /home/tidb/spark-3.1.3-bin-hadoop3.2/conf/:/home/tidb/spark-3.1.3-bin-hadoop3.2/jars/* -Xmx1g org.apache.spark.deploy.worker.Worker --webui-port 8081 spark://master:7077
tidb     11910 11823  0 04:56 pts/0    00:00:00 grep --color=auto spark

-- 分别在spark master和worker节点查看进程日志,确认spark正常运行
$ tail -100f /home/tidb/spark-3.1.3-bin-hadoop3.2/logs/spark-tidb-org.apache.spark.deploy.master.Master-1-TiSpark01.out
Spark Command: /home/ysops/java/jdk1.8/bin/java -cp /home/tidb/spark-3.1.3-bin-hadoop3.2/conf/:/home/tidb/spark-3.1.3-bin-hadoop3.2/jars/* -Xmx1g org.apache.spark.deploy.master.Master --host TiSpark01 --port 7077 --webui-port 8080
========================================
Using Spark's default log4j profile: org/apache/spark/log4j-defaults.properties
22/07/26 05:31:49 INFO Master: Started daemon with process name: 12394@TiSpark01
22/07/26 05:31:49 INFO SignalUtils: Registering signal handler for TERM
22/07/26 05:31:49 INFO SignalUtils: Registering signal handler for HUP
22/07/26 05:31:49 INFO SignalUtils: Registering signal handler for INT
22/07/26 05:31:49 WARN NativeCodeLoader: Unable to load native-hadoop library for your platform... using builtin-java classes where applicable
22/07/26 05:31:49 INFO SecurityManager: Changing view acls to: tidb
22/07/26 05:31:49 INFO SecurityManager: Changing modify acls to: tidb
22/07/26 05:31:49 INFO SecurityManager: Changing view acls groups to: 
22/07/26 05:31:49 INFO SecurityManager: Changing modify acls groups to: 
22/07/26 05:31:49 INFO SecurityManager: SecurityManager: authentication disabled; ui acls disabled; users  with view permissions: Set(tidb); groups with view permissions: Set(); users  with modify permissions: Set(tidb); groups with modify permissions: Set()
22/07/26 05:31:50 INFO Utils: Successfully started service 'sparkMaster' on port 7077.
22/07/26 05:31:50 INFO Master: Starting Spark master at spark://TiSpark01:7077
22/07/26 05:31:50 INFO Master: Running Spark version 3.1.3
22/07/26 05:31:50 INFO Utils: Successfully started service 'MasterUI' on port 8080.
22/07/26 05:31:50 INFO MasterWebUI: Bound MasterWebUI to 0.0.0.0, and started at http://TiSpark01:8080
22/07/26 05:31:51 INFO Master: I have been elected leader! New state: ALIVE
22/07/26 05:31:57 INFO Master: Registering worker 192.168.56.19:45587 with 1 cores, 1024.0 MiB RAM

$ tail -100f /home/tidb/spark-3.1.3-bin-hadoop3.2/logs/spark-tidb-org.apache.spark.deploy.worker.Worker-1-TiSpark02.out
Spark Command: /home/ysops/tidb/jdk1.8/bin/java -cp /home/tidb/spark-3.1.3-bin-hadoop3.2/conf/:/home/tidb/spark-3.1.3-bin-hadoop3.2/jars/* -Xmx1g org.apache.spark.deploy.worker.Worker --webui-port 8081 spark://TiSpark01:7077
========================================
Using Spark's default log4j profile: org/apache/spark/log4j-defaults.properties
22/07/26 05:31:53 INFO Worker: Started daemon with process name: 12418@TiSpark02
22/07/26 05:31:53 INFO SignalUtils: Registering signal handler for TERM
22/07/26 05:31:53 INFO SignalUtils: Registering signal handler for HUP
22/07/26 05:31:53 INFO SignalUtils: Registering signal handler for INT
22/07/26 05:31:54 WARN NativeCodeLoader: Unable to load native-hadoop library for your platform... using builtin-java classes where applicable
22/07/26 05:31:54 INFO SecurityManager: Changing view acls to: tidb
22/07/26 05:31:54 INFO SecurityManager: Changing modify acls to: tidb
22/07/26 05:31:54 INFO SecurityManager: Changing view acls groups to: 
22/07/26 05:31:54 INFO SecurityManager: Changing modify acls groups to: 
22/07/26 05:31:54 INFO SecurityManager: SecurityManager: authentication disabled; ui acls disabled; users  with view permissions: Set(tidb); groups with view permissions: Set(); users  with modify permissions: Set(tidb); groups with modify permissions: Set()
22/07/26 05:31:55 INFO Utils: Successfully started service 'sparkWorker' on port 45587.
22/07/26 05:31:55 INFO Worker: Worker decommissioning not enabled, SIGPWR will result in exiting.
22/07/26 05:31:56 INFO Worker: Starting Spark worker 192.168.56.19:45587 with 1 cores, 1024.0 MiB RAM
22/07/26 05:31:56 INFO Worker: Running Spark version 3.1.3
22/07/26 05:31:56 INFO Worker: Spark home: /home/tidb/spark-3.1.3-bin-hadoop3.2
22/07/26 05:31:56 INFO ResourceUtils: ==============================================================
22/07/26 05:31:56 INFO ResourceUtils: No custom resources configured for spark.worker.
22/07/26 05:31:56 INFO ResourceUtils: ==============================================================
22/07/26 05:31:57 INFO Utils: Successfully started service 'WorkerUI' on port 8081.
22/07/26 05:31:57 INFO WorkerWebUI: Bound WorkerWebUI to 0.0.0.0, and started at http://TiSpark02:8081
22/07/26 05:31:57 INFO Worker: Connecting to master TiSpark01:7077...
22/07/26 05:31:57 INFO TransportClientFactory: Successfully created connection to TiSpark01/192.168.56.18:7077 after 125 ms (0 ms spent in bootstraps)
22/07/26 05:31:57 INFO Worker: Successfully registered with master spark://TiSpark01:7077
-- 到此Spark+TiSpark部署成功完成。
```

#### 使用TiSpark连接TiDB数据库测试

```
-- 使用spark-shell工具连接TiDB数据库
$ spark-shell 
.....省略输出日志
scala> spark.sql("use tidb_catalog.test")
......省略输出日志
scala> spark.sql("show tables").show
+---------+---------+
|namespace|tableName|
+---------+---------+
|     test|   nation|
|     test|   region|
|     test|     part|
|     test| supplier|
|     test| partsupp|
|     test| customer|
|     test|   orders|
|     test| lineitem|
+---------+---------+
scala>  spark.sql("select count (*) from lineitem").show
+--------+                                                                      
|count(1)|
+--------+
| 1818624|
+--------+
scala> 

-- 使用spark-sql工具连接TiDB数据库
$ spark-sql 
......省略输出日志
spark-sql> use tidb_catalog.test;
Time taken: 0.333 seconds
spark-sql> show tables;
test    nation
test    region
test    part
test    supplier
test    partsupp
test    customer
test    orders
test    lineitem
Time taken: 1.454 seconds, Fetched 8 row(s)
spark-sql> select count (*) from lineitem;
1941504
Time taken: 2.808 seconds, Fetched 1 row(s)
spark-sql> 
```

### TiSpark部署总结

两种部署方法的比对，很显然，使用TiUP工具部署TiSpark的操作会简易很多。但是在目前的6.1版本中TiUP Cluster 的 TiSpark 支持目前为实验特性，不建议在生产环境中使用。

## TiDB5.3升级到TiDB6.1

升级的方式有两种：不停机升级和停机升级。TiUP Cluster 默认的升级 TiDB 集群的方式是不停机升级，即升级过程中集群仍然可以对外提供服务。升级时会对各节点逐个迁移 leader 后再升级和重启，因此对于大规模集群需要较长时间才能完成整个升级操作。如果业务有维护窗口可供数据库停机维护，则可以使用停机升级的方式快速进行升级操作。

升级操作参考官方文档：[使用 TiUP 升级 TiDB | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/upgrade-tidb-using-tiup#3-升级-tidb-集群)

下面是采用不停机升级的方式的操作过程。

### 解压安装包，更新 TiUP 离线镜像

```
-- 解压新版本的安装包和工具包
# tar -zxf tidb-community-server-v6.1.0-linux-amd64.tar.gz
# tar -zxf tidb-community-toolkit-v6.1.0-linux-amd64.tar.gz 

-- 修改目录权限
# chown -R tidb: /u01/soft/tidb*

-- 配置环境变量
$ sh tidb-community-server-v6.1.0-linux-amd64/local_install.sh && source /home/tidb/.bash_profile
Disable telemetry success
Successfully set mirror to /u01/soft/tidb-community-server-v6.1.0-linux-amd64
Detected shell: bash
Shell profile:  /home/tidb/.bash_profile
Installed path: /home/tidb/.tiup/bin/tiup
===============================================
1. source /home/tidb/.bash_profile
2. Have a try:   tiup playground
===============================================

-- 合并server 和 toolkit 两个离线镜像
$ cd tidb-community-server-v6.1.0-linux-amd64/
$ cp -rp keys ~/.tiup/
$ tiup mirror merge ../tidb-community-toolkit-v6.1.0-linux-amd64

--  升级cluster组件
$ tiup update cluster
Updated successfully!
```

### 升级TiDB集群

```
-- 编辑 TiUP Cluster 拓扑配置文件（测试环境没有修改过参数，所以升级测试时就没有对配置文件做任何修改）
$ tiup cluster edit-config tidb-test
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster edit-config tidb-test
The file has nothing changed

-- 检查当前集群的健康状况
$ tiup cluster check tidb-test --cluster
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster check tidb-test --cluster
+ Download necessary tools
  - Downloading check tools for linux/amd64 ... Done
...省略中间日志
Checking region status of the cluster tidb-test...
All regions are healthy.
-- 输出结果最后一行‘All regions are healthy.’，表示集群状态正常，可以进行后续升级操作。

-- 使用tiup cluster upgrade 命令将集群升级到指定版本
$ tiup cluster upgrade tidb-test v6.1.0
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster upgrade tidb-test v6.1.0
This operation will upgrade tidb v5.3.0 cluster tidb-test to v6.1.0.
Do you want to continue? [y/N]:(default=N) y
Upgrading cluster...
...省略中间日志
Upgraded cluster `tidb-test` successfully
-- 输出结果最后一行‘Upgraded cluster `集群名称` successfully’，表示集群升级正常完成。

-- 查看集群状态：
$ tiup cluster display tidb-test
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display tidb-test
Cluster type:       tidb
Cluster name:       tidb-test
Cluster version:    v6.1.0
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.56.11:2379/dashboard
Grafana URL:        http://192.168.56.10:3000
ID                   Role            Host            Ports        OS/Arch       Status   Data Dir                          Deploy Dir
--                   ----            ----            -----        -------       ------   --------                          ----------
192.168.56.10:9093   alertmanager    192.168.56.10   9093/9094    linux/x86_64  Up       /u02/tidb-data/alertmanager-9093  /u02/tidb-deploy/alertmanager-9093
192.168.56.10:3000   grafana         192.168.56.10   3000         linux/x86_64  Up       -                                 /u02/tidb-deploy/grafana-3000
192.168.56.10:2379   pd              192.168.56.10   2379/2380    linux/x86_64  Up       /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.11:2379   pd              192.168.56.11   2379/2380    linux/x86_64  Up|L|UI  /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.12:2379   pd              192.168.56.12   2379/2380    linux/x86_64  Up       /u02/tidb-data/pd-2379            /u02/tidb-deploy/pd-2379
192.168.56.10:9090   prometheus      192.168.56.10   9090/12020   linux/x86_64  Up       /u02/tidb-data/prometheus-9090    /u02/tidb-deploy/prometheus-9090
192.168.56.10:4000   tidb            192.168.56.10   4000/10080   linux/x86_64  Up       -                                 /u02/tidb-deploy/tidb-4000
192.168.56.11:4000   tidb            192.168.56.11   4000/10080   linux/x86_64  Up       -                                 /u02/tidb-deploy/tidb-4000
192.168.56.10:20160  tikv            192.168.56.10   20160/20180  linux/x86_64  Up       /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.11:20160  tikv            192.168.56.11   20160/20180  linux/x86_64  Up       /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.12:20160  tikv            192.168.56.12   20160/20180  linux/x86_64  Up       /u02/tidb-data/tikv-20160         /u02/tidb-deploy/tikv-20160
192.168.56.150:7077  tispark-master  192.168.56.150  7077/8080    linux/x86_64  Up       -                                 /u02/tidb-deploy/tispark-master-7077
192.168.56.12:7078   tispark-worker  192.168.56.12   7078/8081    linux/x86_64  Up       -                                 /u02/tidb-deploy/tispark-worker-7078
Total nodes: 13
-- 集群状态正常，成功升级到6.1.0
```

### 升级总结

由于是测试环境，升级前没有对数据库参数做过调整。所以本文章中没有比对新旧版本数据库参数的过程。

但是正式环境，升级前一定要确认旧版本到新版本之间所有数据库参数的变化，是否会对升级后数据库的使用产生不良影响。

参考官方文档的相关版本的ReleaseNote，比如6.1版本：

[TiDB 6.1.0 Release Notes | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/release-6.1.0)

个人觉得，如果官方可以给提供个，可以在升级操作前比对升级前后数据库参数变化的脚本，就会方便很多。
