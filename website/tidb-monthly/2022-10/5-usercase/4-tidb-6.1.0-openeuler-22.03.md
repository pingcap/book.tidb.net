---
title: TiDB v6.1.0 及 TiUniManager 在 openEuler 22.03 中的部署踩坑实践 - TiDB 社区技术月刊
sidebar_label: TiDB v6.1.0 及 TiUniManager 在 openEuler 22.03 中的部署踩坑实践
hide_title: true
description: 本文章主要介绍 TiDB v6.1.0 及 TiUniManager 在 openEuler 22.03 中的部署踩坑实践，将从四个方面展开。
keywords: [TiDB, TiDB v6.1.0, TiUniManager, openEuler 22.03, 部署, 实践]
---

# TiDB v6.1.0 及 TiUniManager 在 openEuler 22.03 中的部署踩坑实践

> [OnTheRoad](https://tidb.net/u/OnTheRoad/answer)

本文档的主要内容为：

1. openEuler 服务器主机设置
2. 离线部署 TiDB v6.1.0（1监控/3TiDB/3PD/3TiKV）以及部署过程中踩到的坑。其中，TiDB 与 PD 为单机混合部署，设置 numa 绑核。
3. TiUniManager 离线部署与升级，以及部署升级过程中踩到的坑。
4. TiUniManager 接管存量 TiDB v6.1.0 集群。

> **【注意事项】**
>
> 1. 文档中为减少文字篇幅，所有软件包都是通过 wget 工具在线下载。在离线生产环境中，需通过其他方式准备软件包。
> 2. openEuler 22.03 LTS 不在 TiDB 及 TiUniManager 支持列表中，因此，在部署时需要做些细微调整，以避坑。本文档总结了部分踩到的坑，仅供参考。

# 1. 服务器准备

## 1.1. 拓扑规划

| 实例                                | 实例数量 | 推荐配置                 | OS                  | IP                    | 说明                                             |
| --------------------------------- | ---- | -------------------- | ------------------- | --------------------- | ---------------------------------------------- |
| Monitoring\&Grafana\&TiUniManager | 1    | `8C/16G/SAS/千兆网卡`    | openEuler 22.03 LTS | 192.168.3.220         | 部署监控、tiup、TiUniManager、br等生态工具。                |
| TiDB/PD                           | 3/3  | `16C/32G/SSD/万兆网卡*2` | openEuler 22.03 LTS | 192.168.3.221/222/223 | TiDB Server 与 PD 混合部署，生产环境中需要设置numa绑核，以避免资源争用。 |
| TiKV                              | 3    | `16C/32G/SSD/万兆网卡*2` | openEuler 22.03 LTS | 192.168.3.224/225/226 |                                                |

## 1.2. 目录规划

针对 PD 及 TiKV 实例，建议为数据目录分配高性能的磁盘。

| IP                    | 目录           | 用途                   | 建议磁盘类型                      |
| --------------------- | ------------ | -------------------- | --------------------------- |
| 192.168.3.220         | /tidb-deploy | 监控组件程序目录             | 无限制                         |
|                       | /tidb-data   | 监控组件数据目录             | 无限制                         |
|                       | /em-deploy   | TiUniManager 组件程序目录  | 无限制                         |
|                       | /em-data     | TiUniManager 组件数据目录  | 无限制                         |
| 192.168.3.221/222/223 | /tidb-deploy | TiDB Server、PD组件程序目录 | 无限制                         |
|                       | /tidb-data   | TiDB Server、PD组件数据目录 | TiDB Server 无限制、PD 组件建议 SSD |
| 192.168.3.224/225/226 | /tidb-deploy | TiKV 组件程序目录          | 无限制                         |
|                       | /tidb-data   | TiKV组件数据目录           | 建议 NVME 或 SSD               |

## 1.3. 系统安装

以下选项使用所有主机

1. 为提高内存性能，禁用 `SWAP` 分区
2. 软件选择：`Minimal Install->Standard`
3. 数据盘格式化为 `ext4`，且为挂载选项增加 `nodelalloc,noatime`

```
## 1. 查看数据盘 UUID
~]# lsblk -f /dev/sdb
NAME   FSTYPE  FSVER            LABEL                      UUID                                 FSAVAIL FSUSE% MOUNTPOINTS
sdb                                                                                                            
└─sdb1 ext4    1.0                                         5d4f7d41-0673-45c7-a118-97f2d614a35f   29.7G     0% /tidb-data

## 2. 挂载数据盘，增加 nodelalloc,noatime 选项
~]# echo "UUID=5d4f7d41-0673-45c7-a118-97f2d614a35f /tidb-data ext4 defaults,nodelalloc,noatime 0 2" >> /etc/fstab
```

## 1.4. 主机配置

### 1.4.1. 网络设置

```
## 1. 查看网卡名称，这里为 ens18
~]# nmcli device status
## 2. 添加静态 IPv4 地址
~]# nmcli con add type ethernet con-name net-static ifname ens18 ip4 192.168.3.220/24 gw4 192.168.3.1
~]# nmcli con mod net-static ipv4.addr "192.168.3.220/24"
~]# nmcli con mod net-static ipv4.dns "223.5.5.5"
~]# nmcli con up net-static ifname ens18
~]# ip -4 a
```

### 1.4.2. 配置本地源

```
## 1. 挂载光盘
~]# mkdir -p /mnt/yum
~]# mount -o loop /dev/cdrom /mnt/yum
## 2. 创建 repo 文件
~]# cat > /etc/yum.repos.d/local.repo << EOF
[Packages]
name=openEuler 22.03 LTS
baseurl=file:///mnt/yum/
enabled=1 
gpgcheck=0 
gpgkey=file:///mnt/yum/RPM-GPG-KEY-openEuler
EOF

## 3. 更新 yum 缓存
~]# yum clean all
~]# yum makecache
```

### 1.4.3. ssh 互信及免密登录

中控机设置 ront 用户互信，免密登录各节点。

```
## 生成 root 密钥
~]# ssh-keygen -t rsa
```

```
## 批量设置 root 互信
~]# 
for NODE_IP in 192.168.3.220 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${NODE_IP}"
    ssh-copy-id root@${NODE_IP}
  done
```

### 1.4.4. 关闭 Swap、内核优化、SELinux、防火墙

```
~]# 
for NODE_IP in 192.168.3.220 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${NODE_IP}"
    ssh root@${NODE_IP} "echo \"vm.swappiness = 0\">> /etc/sysctl.conf"
    ssh root@${NODE_IP} "swapoff -a && swapon -a" 
    ssh root@${node_ip} "echo \"fs.file-max = 1000000\"       >> /etc/sysctl.conf"
    ssh root@${node_ip} "echo \"net.core.somaxconn = 32768\"  >> /etc/sysctl.conf"
    ssh root@${node_ip} "echo \"net.ipv4.tcp_syncookies = 0\" >> /etc/sysctl.conf"
    ssh root@${node_ip} "echo \"vm.overcommit_memory = 1\"    >> /etc/sysctl.conf"
    ssh root@${NODE_IP} "sysctl -p"
    ssh root@${NODE_IP} "setenforce 0"
    ssh root@${NODE_IP} "sed -i 's#SELINUX=enforcing#SELINUX=disabled#g' /etc/selinux/config"
    ssh root@${NODE_IP} "sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config"
    ssh root@${NODE_IP} "systemctl disable --now firewalld.service"
  done
```

一起执行 `swapoff -a` 和 `swapon -a` 命令是为了刷新 swap，将 swap 里的数据转储回内存，并清空 swap 里的数据。

### 1.4.5. 时间同步

```
~]# 
for NODE_IP in 192.168.3.220 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${NODE_IP}"
    ssh root@${NODE_IP} "cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime"
    ssh root@${NODE_IP} "yum install ntp ntpdate -y"
    ssh root@${NODE_IP} "ntpdate pool.ntp.org"
    ssh root@${NODE_IP} "systemctl enable --now ntpd.service"
  done
```

TiDB 是一套分布式数据库系统，需要节点间保证时间的同步，从而确保 ACID 模型的事务线性一致性。可以通过互联网中的 `pool.ntp.org` 授时服务来保证节点的时间同步，离线环境将其替换为自建的 NTP 服务来解决授时。

### 1.4.6. 系统优化

1. 通过 tuned 优化系统

```
## 1. 获取磁盘 ID_SERIAL
~]# udevadm info --name=/dev/sdb | grep ID_SERIAL
E: ID_SERIAL=0QEMU_QEMU_HARDDISK_drive-scsi1

## 2. 创建 tuned 策略，根据磁盘类型选择调度算法。
~]# mkdir /etc/tuned/balanced-tidb-optimal/
~]# vi /etc/tuned/balanced-tidb-optimal/tuned.conf

[main]
include=balanced
[cpu]
governor=performance
[vm]
transparent_hugepages=never
[disk]
devices_udev_regex=(ID_SERIAL=0QEMU_QEMU_HARDDISK_drive-scsi1)
elevator=mq-deadline

## 3. 应用 tuned 策略
~]# tuned-adm profile balanced-tidb-optimal

## 4. 验证优化结果
~]# cat /sys/kernel/mm/transparent_hugepage/enabled && cat /sys/kernel/mm/transparent_hugepage/defrag
~]# cat /sys/block/sdb/queue/scheduler
~]# cpupower frequency-info --policy
```

多个磁盘的 `ID_SERIAL` 用竖线分割，如：

```
[disk]
devices_udev_regex=(ID_SERIAL=0QEMU_QEMU_HARDDISK_drive-scsi1)|(ID_SERIAL=36d0946606d79f90025f3e09a0c1f9e81)
elevator=none
```

2. 若 THP 禁用失败，可通过如下方式禁用。

```
## 1. 立即禁用 THP
~]# echo never > /sys/kernel/mm/transparent_hugepage/enabled && echo never > /sys/kernel/mm/transparent_hugepage/defrag

## 2. 开机禁用 THP
~]# cat >> /etc/rc.d/rc.local << EOF
# Disable Transparent HugePages
if test -f /sys/kernel/mm/transparent_hugepage/enabled; then
echo never > /sys/kernel/mm/transparent_hugepage/enabled
fi

if test -f /sys/kernel/mm/transparent_hugepage/defrag; then
echo never > /sys/kernel/mm/transparent_hugepage/defrag
fi
EOF

~]# chmod +x /etc/rc.d/rc.local
```

> **【注意事项】**
>
> openEuler 中 `/etc/rc.d/rc.local` 文件默认权限为 `-rw-r--r--`，需要为其增加执行权限 `x`，否则无法开机自动禁用 THP。

3. openEuler 中的磁盘调度策略

openEuler 内核在 blk 层加入了多队列功能，可尽情发挥 SSD 的性能。开启多对列之后单队列就无法使用了，相应的单队列算法都看不见了。

```
~]# cat /sys/block/sdb/queue/scheduler 
[none] mq-deadline kyber bfq
```

单队列与多队列调度算法的对应关系如下表所示：

| 单队列      | 多队列         |
| -------- | ----------- |
| deadline | my-deadline |
| cfq      | bfq         |
| noop     | none        |
|          | kyber       |

### 1.4.7. 用户创建及资源限制

#### 1.4.7.1. 创建用户、授权及资源限制

```
~]# 
for NODE_IP in 192.168.3.220 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${NODE_IP}"
    ssh root@${NODE_IP} "useradd -u 1001 tidb -G wheel && echo tidb123 |passwd --stdin tidb"
    ssh root@${NODE_IP} "echo \"tidb ALL=(ALL) NOPASSWD: ALL\" >> /etc/sudoers"
    ssh root@${NODE_IP} "echo \"tidb  soft nofile  1000000\" >> /etc/security/limits.conf"
    ssh root@${NODE_IP} "echo \"tidb  hard nofile  1000000\" >> /etc/security/limits.conf"
    ssh root@${NODE_IP} "echo \"tidb  soft stack   32768\"   >> /etc/security/limits.conf"
    ssh root@${NODE_IP} "echo \"tidb  hard stack   32768\"   >> /etc/security/limits.conf"
  done
```

1. tidb 用户密码 `tidb123`；
2. 【非必须】将用户 tidb 添加到 wheel 组，以使 tidb 用户可执行 su 命令切换用户。
3. tidb用户登录各目标节点，确认执行`sudo - root`无需输入密码，即表示添加成功。

#### 1.4.7.2. 免密登录

tidb 用户登录中控机（192.168.3.220）执行：

```
~]$ id
uid=1001(tidb) gid=1001(tidb) groups=1001(tidb),10(wheel) context=unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023
## 为 tidb 生成密钥
~]$ ssh-keygen -t rsa
```

```
## 1. 分发密钥
for NODE_IP in 192.168.3.220 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${NODE_IP}"
    ssh-copy-id tidb@${NODE_IP}
  done
  
## 2. 验证免密登录
for NODE_IP in 192.168.3.220 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${NODE_IP}"
    ssh tidb@${NODE_IP} "date"    
  done 
```

### 1.4.8. 安装 numactl

针对混合部署的服务器，为避免组件之间的资源争用，建议对组件进行 NUMA 绑核。

#### 1.4.8.1. 安装 numactl

```
~]# 
for NODE_IP in 192.168.3.220 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${NODE_IP}"
    ssh root@${NODE_IP} "mount -o loop /dev/cdrom /mnt/yum"
    ssh root@${NODE_IP} "yum -y install numactl"
  done
```

## 1.5. 离线部署 TiDB

### 1.5.1. 部署 TiUP 组件

可直接在 tidb 官网下载 TiDB 软件包，该软件包中包含 TiUP 组件。将 TiDB 软件包上传至中控机（192.168.3.220）。

<https://pingcap.com/zh/product#SelectProduct>

```
## 1. 下载 TiDB 离线镜像包
~]$ export version=v6.1.0
~]$ wget https://download.pingcap.org/tidb-community-server-${version}-linux-amd64.tar.gz
~]$ chown tidb:tidb tidb-community-server-${version}-linux-amd64.tar.gz

## 2. 部署 TiUP 组件
~]$ tar -xzvf tidb-community-server-${version}-linux-amd64.tar.gz 
~]$ sh tidb-community-server-${version}-linux-amd64/local_install.sh
~]$ source /home/tidb/.bash_profile 

## 3. 查看离线镜像中的组件
~]$ tiup list
```

`local_install.sh` 脚本会自动执行 `tiup mirror set tidb-community-server-${version}-linux-amd64` 命令将当前镜像源设置为本地文件夹 `tidb-community-server-${version}-linux-amd64`。若需切换到在线环境，可执行 `tiup mirror set https://tiup-mirrors.pingcap.com`。

### 1.5.2. 拓扑准备

```
~]$ tiup cluster template |grep -Ev '^\s*#|^$' > topology.yaml
```

生成的默认拓扑配置，根据实际环境修改如下：

```
global:
  user: "tidb"
  ssh_port: 22
  deploy_dir: "/tidb-deploy"
  data_dir: "/tidb-data"
  arch: "amd64"
server_configs:
  tidb:
    new_collations_enabled_on_first_bootstrap: true    # 配置项将写入 /tidb-deploy/tidb-4000/conf/tidb.toml 文件中

monitored:
  node_exporter_port: 9100
  blackbox_exporter_port: 9115
pd_servers:
  - host: 192.168.3.221
    numa_node: "1"        # 配置项将写入 /tidb-deploy/pd-2379/scripts/run_pd.sh 脚本中
  - host: 192.168.3.222
    numa_node: "1"
  - host: 192.168.3.223
    numa_node: "1"
tidb_servers:
  - host: 192.168.3.221
    numa_node: "0"
  - host: 192.168.3.222
    numa_node: "0"
  - host: 192.168.3.223
    numa_node: "0"
tikv_servers:
  - host: 192.168.3.224
  - host: 192.168.3.225
  - host: 192.168.3.226
monitoring_servers:
  - host: 192.168.3.220
grafana_servers:
  - host: 192.168.3.220
alertmanager_servers:
  - host: 192.168.3.220
```

1. `new_collations_enabled_on_first_bootstrap`

从 TiDB v4.0 开始，引入了 TiDB 配置项 `new_collations_enabled_on_first_bootstrap`，用于启用新的排序框架。该配置项只能在TiDB集群初始化时设置，后期修改无效。

在 v4.x-v5.x 中，该配置项默认为 false，即不启用新排序框架，仅支持 utf8mb4\_bin（大小写敏感）排序规则，无法更改。

从 TiDB v6.0.0 版本开始，该配置项的默认值变更为 true ，即在新的排序规则框架下，TiDB 能够支持 utf8\_general\_ci、utf8mb4\_general\_ci、utf8\_unicode\_ci、utf8mb4\_unicode\_ci、gbk\_chinese\_ci 和 gbk\_bin 这几种排序规则，与 MySQL 兼容。

2. 混合部署的 numa 绑核

当前环境 TiDB 与 PD 组件为混合部署，因此为避免资源争用，对其启用 NUMA 绑核。

```
## 查看 numa 信息
~]# numactl --hardware
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3
node 0 size: 1978 MB
node 0 free: 1773 MB
node 1 cpus: 4 5 6 7
node 1 size: 1438 MB
node 1 free: 1082 MB
node distances:
node   0   1 
  0:  10  20 
  1:  20  10 
```

numa 绑核配置，不能设置在全局配置 `server_configs` 中，否则无法识别。

### 1.5.3. 环境校验

生产环境，需确保所有检查项都为 pass

```
## 1. 环境检查
~]$ tiup cluster check ./topology.yaml --user tidb
...
Node           Check       Result  Message
----           -----       ------  -------
192.168.3.223  os-version  Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.223  cpu-cores   Pass    number of CPU cores / threads: 4
192.168.3.223  memory      Pass    memory size is 4096MB
... 省略部分内容 ...
192.168.3.222  command     Pass    numactl: policy: default

## 2. 自动修复
~]$ tiup cluster check ./topology.yaml --apply --user root 
```

> **【注意事项】**
>
> 因 openEuler 不在官方支持的 OS 列表中，因此会有`os-version Fail os vendor openEuler not supported` 的报错提示，可忽略

### 1.5.4. 集群部署

```
~]$ id
uid=1000(tidb) gid=1000(tidb) groups=1000(tidb)
## 1. 部署集群
~]$ export version=v6.1.0
~]$ tiup cluster deploy kruidb ${version} ./topology.yaml --user tidb

Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster deploy kruidb v6.1.0 ./topology.yaml --user tidb
... 省略部分日志内容 ...
Cluster type:    tidb
Cluster name:    kruidb
Cluster version: v6.1.0
Role          Host           Ports        OS/Arch       Directories
----          ----           -----        -------       -----------
pd            192.168.3.221  2379/2380    linux/x86_64  /tidb-deploy/pd-2379,/tidb-data/pd-2379
pd            192.168.3.222  2379/2380    linux/x86_64  /tidb-deploy/pd-2379,/tidb-data/pd-2379
pd            192.168.3.223  2379/2380    linux/x86_64  /tidb-deploy/pd-2379,/tidb-data/pd-2379
tikv          192.168.3.224  20160/20180  linux/x86_64  /tidb-deploy/tikv-20160,/tidb-data/tikv-20160
tikv          192.168.3.225  20160/20180  linux/x86_64  /tidb-deploy/tikv-20160,/tidb-data/tikv-20160
tikv          192.168.3.226  20160/20180  linux/x86_64  /tidb-deploy/tikv-20160,/tidb-data/tikv-20160
tidb          192.168.3.221  4000/10080   linux/x86_64  /tidb-deploy/tidb-4000
tidb          192.168.3.222  4000/10080   linux/x86_64  /tidb-deploy/tidb-4000
tidb          192.168.3.223  4000/10080   linux/x86_64  /tidb-deploy/tidb-4000
prometheus    192.168.3.220  9090/12020   linux/x86_64  /tidb-deploy/prometheus-9090,/tidb-data/prometheus-9090
grafana       192.168.3.220  3000         linux/x86_64  /tidb-deploy/grafana-3000
alertmanager  192.168.3.220  9093/9094    linux/x86_64  /tidb-deploy/alertmanager-9093,/tidb-data/alertmanager-9093
Attention:
    1. If the topology is not what you expected, check your yaml file.
    2. Please confirm there is no port/directory conflicts in same host.
Do you want to continue? [y/N]: (default=N) y
+ Generate SSH keys ... Done
  ... 省略部分日志内容 ...
Enabling component blackbox_exporter
        Enabling instance 192.168.3.220
        ... 省略部分日志内容 ...
        Enable 192.168.3.222 success
Cluster `kruidb` deployed successfully, you can start it with command: `tiup cluster start kruidb --init`

## 2. 初始化集群
~]$ tiup cluster start kruidb --init
... 省略部分日志内容 ...
Started cluster `kruidb` successfully
The root password of TiDB database has been changed.
The new password is: '0y-@6R2gDp45m*3=KC'.
Copy and record it to somewhere safe, it is only displayed once, and will not be stored.
The generated password can NOT be get and shown again.
```

可通过 `tiup cluster start kruidb-cluster --init` 在初始化集群时，为 root 用户生成随机密码（只显示一次）。省略 `--init` 参数，则为root用户指定空密码。

### 1.5.5. 修改默认密码

```
## 1. 中控机 192.168.3.220 安装 MySQL CLI 客户端
~]$ sudo yum install mysql -y

## 2. 默认密码登录 TiDB 并修改密码
~]$ mysql -uroot -P4000 -h192.168.3.221 -p'0y-@6R2gDp45m*3=KC'
mysql> select user,host from mysql.user;
+------+------+
| user | host |
+------+------+
| root | %    |
+------+------+
1 row in set (0.01 sec)

mysql> alter user root identified with mysql_native_password by "root";
Query OK, 0 rows affected (0.07 sec)

mysql> flush privileges;
Query OK, 0 rows affected (0.03 sec)

## 3. 用新密码登录 TiDB 数据库
~]$ mysql -uroot -P4000 -h192.168.3.221 -p'root'
```

## 1.6. 检查 TiDB 集群

### 1.6.1. 查看集群

```
~]$ tiup cluster list
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster list
Name    User  Version  Path                                              PrivateKey
----    ----  -------  ----                                              ----------
kruidb  tidb  v6.1.0   /home/tidb/.tiup/storage/cluster/clusters/kruidb  /home/tidb/.tiup/storage/cluster/clusters/kruidb/ssh/id_rsa
```

```
~]$ tiup cluster display kruidb
tiup is checking updates for component cluster ...
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.10.2/tiup-cluster display kruidb
Cluster type:       tidb
Cluster name:       kruidb
Cluster version:    v6.1.0
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
Grafana URL:        http://192.168.3.220:3000
ID                   Role          Host           Ports        OS/Arch       Status  Data Dir                      Deploy Dir
--                   ----          ----           -----        -------       ------  --------                      ----------
192.168.3.220:9093   alertmanager  192.168.3.220  9093/9094    linux/x86_64  Up      /tidb-data/alertmanager-9093  /tidb-deploy/alertmanager-9093
192.168.3.220:3000   grafana       192.168.3.220  3000         linux/x86_64  Up      -                             /tidb-deploy/grafana-3000
192.168.3.221:2379   pd            192.168.3.221  2379/2380    linux/x86_64  Up      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.222:2379   pd            192.168.3.222  2379/2380    linux/x86_64  Up|UI   /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.223:2379   pd            192.168.3.223  2379/2380    linux/x86_64  Up|L    /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.220:9090   prometheus    192.168.3.220  9090/12020   linux/x86_64  Up      /tidb-data/prometheus-9090    /tidb-deploy/prometheus-9090
192.168.3.221:4000   tidb          192.168.3.221  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.222:4000   tidb          192.168.3.222  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.223:4000   tidb          192.168.3.223  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.224:20160  tikv          192.168.3.224  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.225:20160  tikv          192.168.3.225  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.226:20160  tikv          192.168.3.226  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
```

### 1.6.2. 检查集群配置

可通过 `tiup cluster show-config <集群名>` 查看集群配置；通过 `tiup cluster edit-config <集群名>` 修改集群运行的配置信息，该命令会自动汇总各节点的配置项。

```
~]$ tiup cluster show-config kruidb
global:
  user: tidb
  ssh_port: 22
  ssh_type: builtin
  deploy_dir: /tidb-deploy
  data_dir: /tidb-data
  os: linux
  arch: amd64
monitored:
  node_exporter_port: 9100
  blackbox_exporter_port: 9115
  deploy_dir: /tidb-deploy/monitor-9100
  data_dir: /tidb-data/monitor-9100
  log_dir: /tidb-deploy/monitor-9100/log
server_configs:
  tidb:
    new_collations_enabled_on_first_bootstrap: true
  # ... 省略部分配置内容 ...
tidb_servers:
- host: 192.168.3.221
  ssh_port: 22
  port: 4000
  status_port: 10080
  deploy_dir: /tidb-deploy/tidb-4000
  log_dir: /tidb-deploy/tidb-4000/log
  numa_node: "0"
  arch: amd64
  os: linux
- host: 192.168.3.222
  # ... 省略部分配置内容 ...
- host: 192.168.3.223
  # ... 省略部分配置内容 ...
tikv_servers:
- host: 192.168.3.224
  ssh_port: 22
  port: 20160
  status_port: 20180
  deploy_dir: /tidb-deploy/tikv-20160
  data_dir: /tidb-data/tikv-20160
  log_dir: /tidb-deploy/tikv-20160/log
  arch: amd64
  os: linux
- host: 192.168.3.225
  # ... 省略部分配置内容 ...
- host: 192.168.3.226
  # ... 省略部分配置内容 ...
pd_servers:
- host: 192.168.3.221
  ssh_port: 22
  name: pd-192.168.3.221-2379
  client_port: 2379
  peer_port: 2380
  deploy_dir: /tidb-deploy/pd-2379
  data_dir: /tidb-data/pd-2379
  log_dir: /tidb-deploy/pd-2379/log
  numa_node: "1"
  arch: amd64
  os: linux
- host: 192.168.3.222
  # ... 省略部分配置内容 ...
- host: 192.168.3.223
  # ... 省略部分配置内容 ...
monitoring_servers:
- host: 192.168.3.220
  # ... 省略部分配置内容 ...
grafana_servers:
- host: 192.168.3.220
  # ... 省略部分配置内容 ...
alertmanager_servers:
- host: 192.168.3.220
  # ... 省略部分配置内容 ...
```

## 1.7. 常见问题处理

### 1.7.1. 清理环境

若部署失败，需要清理环境以便重新部署。

```
for NODE_IP in 220 221 222 223 224 225 226
do
    echo ">>> 192.168.3.${NODE_IP} <<<"
    ssh root@192.168.3.${NODE_IP} "rm -rf /tidb-data/*"
    ssh root@192.168.3.${NODE_IP} "rm -rf /tidb-deploy"
    ssh root@192.168.3.${NODE_IP} "find /etc/systemd/system -name "tidb-*" -o -name "tikv-*" -o -name "pd-*"  |xargs rm -rf { };"
    ssh root@192.168.3.${NODE_IP} "find /etc/systemd/system -name "alertmanager-*" -o -name "grafana-*" -o -name "prometheus-*" |xargs rm -rf { };"
done
```

### 1.7.2. openEuler 踩坑

1. 磁盘 IO 调度

openEuler 中启用了多队列调度，可充分发挥固态硬盘的性能。默认的单队列调度算法，如 `noop`、`deadline`、`cfq` 已不可见。可根据磁盘类型，选择合适的多队列IO调度算法，如`none`、`mq-deadline`、`bfq`、`kyber`。

nvme 磁盘适合用 none；ssd 磁盘适合用 mq-deadline；机械磁盘适合用 bfq。

2. 禁用 THP

openEuler 中脚本 `/etc/rc.d/rc.local` 脚本默认权限为 `-rw-r--r--`，需为其增加 `x` 执行权限，否则无法开机自动禁用 THP。

```markdown
~]# chmod +x /etc/rc.d/rc.local
```

### 1.7.3. 忘记密码

登陆一台 TiDB 节点（以 192.168.3.221 为例），修改 TiDB 配置文件，在 security 部分添加 `skip-grant-table`：

1. TiDB 服务重启

```
## 1. 修改配置文件
~]# cat >> /tidb-deploy/tidb-4000/conf/tidb.toml << EOF
[security]
skip-grant-table = true
EOF

## 2. 停止该节点 TiDB 服务
systemctl daemon-reload
systemctl stop tidb-4000.service

## 3. root 用户用脚本启动 TiDB 服务
/tidb-deploy/tidb-4000/scripts/run_tidb.sh &
```

设置 `skip-grant-table` 之后，启动 TiDB 进程会增加操作系统用户检查，只有操作系统的 root 用户才能启动 TiDB 进程。

2. 使用 root 登录后修改密码：

```
~]$ mysql -uroot -h192.168.3.221 -P4000
mysql> alter user root identified with mysql_native_password by "root";
mysql> flush privileges;
```

3. 删除 `skip-grant-table = true` 的设置

```
~]# cat /tidb-deploy/tidb-4000/conf/tidb.toml
new_collations_enabled_on_first_bootstrap = true
```

4. 重启 TiDB 服务

```
## 1. TiDB 节点 192.168.3.221 重启 TiDB 服务
~]# ps -aux | grep "tidb-server" |grep -v grep |cut -c 5-18 |xargs kill -9
~]# systemctl daemon-reload && systemctl start tidb-4000.service

## 2. 中控机 192.168.3.220 查看集群状态
~]$ tiup cluster display kruidb
```

# 2. 部署Haproxy

将 haproxy 部署于 `192.168.3.220` 节点

## 2.1. 安装Haproxy

```
## 1. 下载解压 Haproxy 软件包
~]# export version=2.6.0
~]# wget https://github.com/haproxy/haproxy/archive/refs/tags/v${version}.tar.gz
~]# tar -xzvf v${version}.tar.gz

## 2. 编译安装 Haproxy
~]# cd haproxy-${version}
~]# make clean
~]# make -j 8 TARGET=linux-glibc USE_THREAD=1
~]# make PREFIX=/usr/local/haproxy_v${version} SBINDIR=/usr/local/haproxy_v${version}/bin install

## 3. 安装后配置 Haproxy
～]# ln -s /usr/local/haproxy_v${version} /usr/local/haproxy
～]# echo 'export PATH=/usr/local/haproxy/bin:$PATH' >> /etc/profile
～]# source /etc/profile
～]# which haproxy
/usr/local/haproxy/bin/haproxy
```

## 2.2. 配置Haproxy

通过 YUM 安装，会生成配置模板，也可根据实际场景自定义如下配置项：

```
## 1. 环境准备
~]# mkdir -p /etc/haproxy
~]# mkdir -p /var/lib/haproxy
~]# useradd haproxy

## 2. 新建 haproxy.cfg 配置文件
~]# vi /etc/haproxy/haproxy.cfg
global                                     # 全局配置。
   log         127.0.0.1 local2            # 定义全局的 syslog 服务器，最多可以定义两个。
   chroot      /var/lib/haproxy            # 更改当前目录并为启动进程设置超级用户权限，从而提高安全性。
   pidfile     /var/run/haproxy.pid        # 将 HAProxy 进程的 PID 写入 pidfile。
   maxconn     4096                        # 单个 HAProxy 进程可接受的最大并发连接数，等价于命令行参数 "-n"。
   nbthread    48                          # 最大线程数。线程数的上限与 CPU 数量相同。
   user        haproxy                     # 同 UID 参数。
   group       haproxy                     # 同 GID 参数，建议使用专用用户组。
   daemon                                  # 让 HAProxy 以守护进程的方式工作于后台，等同于命令行参数“-D”的功能。当然，也可以在命令行中用“-db”参数将其禁用。
   stats socket /var/run/haproxy-svc1.sock level admin mode 600 user haproxy expose-fd listeners
defaults                                   # 默认配置。
   log global                              # 日志继承全局配置段的设置。
   retries 2                               # 向上游服务器尝试连接的最大次数，超过此值便认为后端服务器不可用。
   timeout connect  2s                     # HAProxy 与后端服务器连接超时时间。如果在同一个局域网内，可设置成较短的时间。
   timeout client 30000s                   # 客户端非活动连接的超时时间。
   timeout server 30000s                   # 服务器端非活动连接的超时时间。

listen admin_stats                         # frontend 和 backend 的组合体，此监控组的名称可按需进行自定义。
   bind 0.0.0.0:8080                       # 监听端口。
   mode http                               # 监控运行的模式，此处为 `http` 模式。
   option httplog                          # 开始启用记录 HTTP 请求的日志功能。
   maxconn 10                              # 最大并发连接数。
   stats refresh 30s                       # 每隔 30 秒自动刷新监控页面。
   stats uri /haproxy                      # 监控页面的 URL。
   stats realm HAProxy                     # 监控页面的提示信息。
   stats auth admin:pingcap123             # 监控页面的用户和密码，可设置多个用户名。
   stats hide-version                      # 隐藏监控页面上的 HAProxy 版本信息。
   stats  admin if TRUE                    # 手工启用或禁用后端服务器（HAProxy 1.4.9 及之后版本开始支持）。

listen tidb-cluster                        # 配置 database 负载均衡。
   bind 0.0.0.0:13390                      # 浮动 IP 和 监听端口，修改默认端口3390为13390
   mode tcp                                # HAProxy 要使用第 4 层的传输层。
   balance leastconn                       # 优先连接到连接数少的 TiDB 实例。`leastconn` 适用于长会话服务，如 LDAP、SQL、TSE 等；不适用于短会话协议，如 HTTP。该算法是动态的，对于启动慢的服务器，服务器权重会在运行中作调整。
   server tidb-1 192.168.3.221:4000 check inter 2000 rise 2 fall 3      # 监听 4000 端口，频率为 2000ms/次。若 2 次成功，则认为服务可用；若 3 次失败，则认为服务不可用。
   server tidb-2 192.168.3.222:4000 check inter 2000 rise 2 fall 3      # 若为 TiDB 透传客户端真实 IP，需在 check 前增加选项 `send-proxy`，详见 "2.4 透传 IP"
   server tidb-3 192.168.3.223:4000 check inter 2000 rise 2 fall 3
```

将配置文件保存为`/etc/haproxy/haproxy.cfg`，验证配置文件正确性。

```
## 1. 修改 haproxy 配置文件权限
~]# chown -R haproxy:haproxy /etc/haproxy/*
~]# chmod -R 644 /etc/haproxy/*

## 2. 检查配置文件正确性
~]# /usr/local/haproxy/bin/haproxy -f /etc/haproxy/haproxy.cfg -c
Configuration file is valid
```

## 2.3. 启停Haproxy

```
~]# cp /root/haproxy-${version}/examples/haproxy.init /etc/init.d/haproxy
~]# chmod +x /etc/init.d/haproxy
~]# ln -s /usr/local/haproxy/bin/haproxy /usr/sbin/
~]# chkconfig --add haproxy
~]# chkconfig haproxy on
~]# systemctl enable --now haproxy
haproxy.service is not a native service, redirecting to systemd-sysv-install.
Executing: /usr/lib/systemd/systemd-sysv-install enable haproxy
```

```
~]# systemctl restart haproxy
~]# systemctl status  haproxy
~]# systemctl start   haproxy
~]# systemctl stop    haproxy
```

## 2.4. 透传 IP

通常情况下（如 “2.2 配置 Haproxy” 中的配置示例），通过 Haproxy 反向代理使用 TiDB 时，TiDB 会将 Haproxy 的 IP 地址（本例为 192.168.3.220）视为客户端 IP 地址。即在 TiDB 中执行 `show processlist` 显示的 Host 为 Haproxy 的地址，而非真实客户端的地址。若为 TiDB 透传真实的客户端地址，需要为 Haproxy 增加 `send-proxy` 选项，同时为 TiDB Server 增加配置。

1. 为 haproxy.cfg 增加 send-proxy 选项

```
... 省略部分配置内容 ...
listen tidb-cluster                       
   bind 0.0.0.0:13390                     
   mode tcp                               
   balance leastconn                      
   server tidb-1 192.168.3.221:4000 send-proxy check inter 2000 rise 2 fall 3   # 为 TiDB 透传客户端 IP，增加选项 `send-proxy`
   server tidb-2 192.168.3.222:4000 send-proxy check inter 2000 rise 2 fall 3      
   server tidb-3 192.168.3.223:4000 send-proxy check inter 2000 rise 2 fall 3
```

2. 为 TiDB Server 增加 `proxy-protocol.networks` 配置 Haproxy 服务器的地址

```
~]$ tiup cluster edit-config kruidb
# ... 省略部分配置内容 ...
server_configs:
  tidb:
    new_collations_enabled_on_first_bootstrap: true    
    proxy-protocol.networks: 192.168.3.0/24            # 为 TiDB 启用透传客户端 IP，地址范围为 192.168.3.0/24 网段
#... 省略部分配置内容 ...
```

`proxy-protocol.networks` 的地址可使用 IP 格式 (192.168.3.50) 或 CIDR 格式 (192.168.3.0/24)，并可用逗号“,” 分隔多个地址，或用星号 “\*” 代表所有 IP。

# 3. 物理备份与恢复

## 3.1. 存储挂载

本文档以将 TiDB 备份至 `192.168.3.241:/volume4/data1/tidbbak` NFS 共享目录中为例。TiKV

1. TiKV 节点挂载外部存储

首先，在 NFS 服务器创建 tidbbak 共享目录，并分别挂载至每个 TiKV 节点及中控机的 `/tidbbak` 中。首次，批量挂载脚本如下：

```
## 挂载 NFS 共享目录 tidbbak 至 /tidbbak
for NODE_IP in 220 224 225 226
do
    echo ">>> 192.168.3.${NODE_IP} <<<"
    ssh root@192.168.3.${NODE_IP} "yum install -y nfs-utils"
    ssh root@192.168.3.${NODE_IP} "mkdir /tidbbak && chown -R tidb:tidb /tidbbak"
    ssh root@192.168.3.${NODE_IP} "mount -t nfs 192.168.3.241:/volume4/data1/tidbbak /tidbbak"    
    ssh root@192.168.3.${NODE_IP} "mount -t nfs" 
    ssh root@192.168.3.${NODE_IP} "echo \"mount -t nfs 192.168.3.241:/volume4/data1/tidbbak /tidbbak\" >> /etc/rc.local"
    ssh root@192.168.3.${NODE_IP} "cat /etc/rc.local|grep mount"
done
```

将挂载脚本添加至 `/etc/rc.local`，即可开机自动挂载。

## 3.2. br 部署

[官方下载页面](https://pingcap.com/zh/product-community) 下载 TookKit 工具包 `tidb-community-toolkit-v6.1.0-linux-amd64.tar.gz`，按如下方式将 BR 部署至 PD 节点

```
## 1. 部署 br 工具
~]$ export version=v6.1.0
~]$ sudo chown -R tidb:tidb tidb-community-toolkit-${version}-linux-amd64.tar.gz
~]$ tar -xzvf tidb-community-toolkit-${version}-linux-amd64.tar.gz 
~]$ sudo tar -xzvf tidb-community-toolkit-${version}-linux-amd64/br-${version}-linux-amd64.tar.gz -C /usr/local/bin/ 
~]$ whereis br
br: /usr/local/bin/br

## 2. 查看 br 帮助
~]$ br --help
br is a TiDB/TiKV cluster backup restore tool.

Usage:
  br [command]

Available Commands:
  backup      backup a TiDB/TiKV cluster
  completion  Generate the autocompletion script for the specified shell
  help        Help about any command
  restore     restore a TiDB/TiKV cluster
  ... 省略部分帮助内容 ...
```

## 3.3. 物理备份

使用 `br backup full` 可以备份 TiDB 最新的或者通过`--backupts '2022-01-30 07:42:23'` 备份指定时间点的快照数据。

### 3.3.1. 手动备份数据库

```
## 1. 创建存放备份的目录
~]$ mkdir -p /tidbbak/db/fullbak_`date +%Y%m%d`
## 2. 执行全库备份
~]$ br backup full --pd "192.168.3.221:2379" --storage "local:///tidbbak/db/fullbak_`date +%Y%m%d`" --ratelimit 120 --log-file /tidbbak/db/fullbak_`date +%Y%m%d`/fullbak_`date +%Y%m%d`.log
```

> **【注意事项】**
>
> 1. 存放备份文件的目录必须是在执行备份之前已创建的空目录。

编辑如下全库备份脚本，并将其加入系统 crond 定时任务中。因备份时，自动根据日期创建文件夹，因此执行 br 的节点也需挂载存储，并且挂载点与 TiKV 一致。

### 3.3.2. 定时备份数据库

1. 准备备份脚本 `~/scripts/fulldbbak.sh` 内容如下：

```
#!/bin/bash
export DATEDIR=`date +%Y%m%d`
export BASEDIR=/tidbbak/db
mkdir -p $BASEDIR/$DATEDIR
/usr/local/bin/br backup full --pd "192.168.3.221:2379" --storage "local://$BASEDIR/$DATEDIR" --ratelimit 120 --log-file $BASEDIR/$DATEDIR/fullbackup_`date +%Y%m%d`.log
sync
sleep 10
find ${BASEDIR} -type f -mtime +31 -exec rm {} \;
find ${BASEDIR} -type d -empty -delete
```

2. 添加定时任务

```
## 1. 允许 tidb 用户添加 crond 计划任务
~]# echo tidb >> /etc/cron.allow
## 2. 添加 br 备份任务
~]$ crontab -l
30 22 * * * /home/tidb/scripts/fulldbbak.sh > /home/tidb/scripts/fulldb_bak.log 2>&1
```

### 3.3.3. tiup 组件备份

1. 创建备份目录

```
~]$ mkdir -p /tidbbak/tiup
```

```
#!/bin/bash
echo "Begin to tar the tiup component"
tar -czvf /tidbbak/tiup/tiupbak_`date +%Y%m%d`.tar.gz /home/tidb/.tiup
sleep 5

echo "Delete the backup files before 7 days"
find /tidbbak/tiup -type f -mtime +7 -exec rm {} \;
echo "End to backup the tiup component"
```

2. 添加定时任务

```
~]$ crontab -l
0 22 * * * /home/tidb/scripts/tiupbak.sh > /home/tidb/scripts/tiup_bak.log 2>&1
```

## 3.4. 物理恢复

备份文件（sst）文件保存在 `/tidbbak/db/20221013/` 中为例。

```
export PD_ADDR="192.168.3.221:2379"
export BAKDIR="/tidbbak/db/20221013/"
br restore full --pd "${PD_ADDR}" --storage "local://${BAKDIR}" --ratelimit 128 --log-file restorefull_`date +%Y%m%d`.log
```

# 4. TiUniManager 工具

TiUniManager（TiEM）是 6.x 推出的新功能，类似于 Oracle Enterprise Manager（Oracle EM），是为分布式数据库 TiDB 打造的管控平台软件和数据库运维管理平台。早期版本命名为 TiEM，从 v1.0.1 版本开始，更名为 TiUniManager。

本文仅介绍 TiUniManager 工具的部署、升级，以及接管存量 TiDB 数据库集群。至于 TiUniManager 管理集群等高级用法不做详细介绍。

## 4.1. 部署 TiUniManager

为便于编写 TiUniManager 升级的需要，这里部署的 TiUniManager 版本为 v1.0.1 版本。该版本最高仅支持 TiDB v6.0.0，若要管理 TiDB v6.1.0，需升级 TiUniManager 版本至 v1.0.2。

部署 TiUniManager 过程需依赖于 TiUP 1.9+，因此需将其与 tiup 工具部署在同一台服务器中。本文档以将 TiUniManager 部署至 tiup 中控服务器 192.168.3.220 为例。

### 4.1.1. 部署准备

下载 TiUniManager 软件包，链接为： [https://download.pingcap.org/em-enterprise-server-{version}-linux-amd64.tar.gz](https://download.pingcap.org/em-enterprise-server-%7Bversion%7D-linux-amd64.tar.gz)

1. 前期准备

```
## 1. 下载 TiUniManager 包
~]$ export version=v1.0.1
~]$ wget https://download.pingcap.org/em-enterprise-server-${version}-linux-amd64.tar.gz
~]$ tar -xzvf em-enterprise-server-${version}-linux-amd64.tar.gz

## 2. 执行 install.sh 脚本，自动生成 config.yaml 拓扑文件：将 TiUniManager 部署至 192.168.3.220 */
~]$ sudo sh em-enterprise-server-${version}-linux-amd64/install.sh 192.168.3.220
... 省略部分日志输出内容 ...
Installed path: /usr/local/bin/tiup
=====================================================================
Please follow the instruction below to deploy em: 
1. Switch user:  su - tidb
2. source /home/tidb/.bash_profile
3. Have a try:   TIUP_HOME=/home/tidb/.em tiup em list
====================================================================

~]$ source /home/tidb/.bash_profile

## 3. 为 tidb 用户生成密钥（因部署TiDB数据库时已生成密钥，此部可略过）
~]$ ssh-keygen -t rsa

## 4. 复制密钥到 tiup_rsa
~]$ cp /home/tidb/.ssh/id_rsa /home/tidb/.ssh/tiup_rsa
```

2. 准备配置文件

以下配置文件`config.yaml`为执行 `install.sh` 脚本时，自动生成，无需改动，直接使用。

```
global:
  user: "tidb"
  group: "tidb"
  ssh_port: 22
  deploy_dir: "/em-deploy"
  data_dir: "/em-data"
  arch: "amd64"
  log_level: "info"
  external_elasticsearch_url: ""
  login_host_user: ""
  login_private_key_path: ""
  login_public_key_path: ""

monitored:
  node_exporter_port: 4124
em_cluster_servers:
  - host: 192.168.3.220
em_api_servers:
  - host: 192.168.3.220
em_web_servers:
  - host: 192.168.3.220
em_file_servers:
  - host: 192.168.3.220
elasticsearch_servers:
  - host: 192.168.3.220
tracer_servers:
  - host: 192.168.3.220
kibana_servers:
  - host: 192.168.3.220
monitoring_servers:
  - host: 192.168.3.220
alertmanager_servers:
  - host: 192.168.3.220
grafana_servers:
  - host: 192.168.3.220
filebeat_servers:
  - host: 192.168.3.220
```

3. 导入 TiDB Server 镜像包

离线环境中，为了通过 TiUniManager 管理 TiDB 集群，需为 TiEM 导入 TiDB Server 离线镜像包。在部署 TiDB 集群时已下载 并解压 TiDB Server 软件包，这里直接导入。

```
~]$ export version=v6.1.0
~]$ ls -l |grep tidb-community-server-${version}-linux-amd64
drwxr-xr-x. 3 tidb tidb       4096 Jun 22 09:55 tidb-community-server-v6.1.0-linux-amd64

## 1. 导入 TiDB Server 软件包
~]$ TIUP_HOME=/home/tidb/.tiup tiup mirror merge tidb-community-server-${version}-linux-amd64

## 2. 查看离线镜像库位置
~]$ tiup mirror show
/em-data/tidb-repo
```

### 4.1.2. 部署与查看 TiUniManager

1. 部署 TiUniManager

```
~]$ export version=1.0.1
~]$ TIUP_HOME=/home/tidb/.em tiup em deploy em-test ${version} config.yaml -u tidb -p
```

`config.yaml` 为执行 `em-enterprise-server-${version}-linux-amd64/install.sh 192.168.3.220` 命令时，自动生成，无需修改。

> **【注意事项】**
>
> openEuler 22.03 LTS 部署 TiUniManager 时，需要目标主机 `/etc/ssh/sshd_config` 增加配置项 `PubkeyAcceptedKeyTypes=+ssh-rsa`。如下：
>
> ```
> ~]# echo PubkeyAcceptedKeyTypes=+ssh-rsa >> /etc/ssh/sshd_config
> ~]# systemctl restart sshd
> ```
>
> 否则，在 Copy 文件时，会报错 `handshake failed: ssh: unable to authenticate, attempted methods [none publickey], no supported methods remain`。

2. 查看 TiUniManager

```
## 1. 列出 TiUniManager 信息
~]$ TIUP_HOME=/home/tidb/.em tiup em list
tiup is checking updates for component em ...
Starting component `em`: /home/tidb/.em/components/em/v1.0.1/tiup-em /home/tidb/.em/components/em/v1.0.1/tiup-em list
Name     User  Version  Path                                        PrivateKey
----     ----  -------  ----                                        ----------
em-test  tidb  v1.0.1   /home/tidb/.em/storage/em/clusters/em-test  /home/tidb/.em/storage/em/clusters/em-test/ssh/id_rsa

## 2. 展示 TiUniManager 各组件信息
~]$ TIUP_HOME=/home/tidb/.em tiup em display em-test
Starting component `em`: /home/tidb/.em/components/em/v1.0.1/tiup-em /home/tidb/.em/components/em/v1.0.1/tiup-em display em-test
Cluster type:       em
Cluster name:       em-test
Cluster version:    v1.0.1
Deploy user:        tidb
SSH type:           builtin
WebServer URL:      http://192.168.3.220:4180
ID                  Role            Host           Ports                                              OS/Arch       Status  Data Dir                      Deploy Dir
--                  ----            ----           -----                                              -------       ------  --------                      ----------
192.168.3.220:4112  alertmanager    192.168.3.220  4112/4113                                          linux/x86_64  Down    /em-data/alertmanager-4112    /em-deploy/alertmanager-4112
192.168.3.220:4101  cluster-server  192.168.3.220  4101/4104/4106/4107                                linux/x86_64  Down    /em-data/cluster-server-4101  /em-deploy/cluster-server-4101
192.168.3.220:4108  elasticsearch   192.168.3.220  4108                                               linux/x86_64  Down    /em-data/elasticsearch-4108   /em-deploy/elasticsearch-4108
192.168.3.220:4102  file-server     192.168.3.220  4102/4105                                          linux/x86_64  Down    /em-data/file-server-4102     /em-deploy/file-server-4102
192.168.3.220:0     filebeat        192.168.3.220                                                     linux/x86_64  Down    /em-data/filebeat-0           /em-deploy/filebeat-0
192.168.3.220:4111  grafana         192.168.3.220  4111                                               linux/x86_64  Down    /em-data/grafana-4111         /em-deploy/grafana-4111
192.168.3.220:4114  jaeger          192.168.3.220  4114/4115/4116/4117/4118/4119/4120/4121/4122/4123  linux/x86_64  Down    /em-data/jaeger-4114          /em-deploy/jaeger-4114
192.168.3.220:4109  kibana          192.168.3.220  4109                                               linux/x86_64  Down    /em-data/kibana-4109          /em-deploy/kibana-4109
192.168.3.220:4180  nginx           192.168.3.220  4180                                               linux/x86_64  Down    /em-data/nginx-4180           /em-deploy/nginx-4180
192.168.3.220:4100  openapi-server  192.168.3.220  4100/4103                                          linux/x86_64  Down    /em-data/openapi-server-4100  /em-deploy/openapi-server-4100
192.168.3.220:4110  prometheus      192.168.3.220  4110                                               linux/x86_64  Down    /em-data/prometheus-4110      /em-deploy/prometheus-4110
```

### 4.1.3. 启停与销毁 TiUniManager

```
## 1. 启动 TiUniManager
~]$ TIUP_HOME=/home/tidb/.em tiup em start em-test

## 2. 停止 TiUniManager
~]$ TIUP_HOME=/home/tidb/.em tiup em stop em-test

## 3. 查看 tiup em 相关帮助
~]$ TIUP_HOME=/home/tidb/.em tiup em --help
Usage:
  tiup em [command]

Available Commands:
  list        List all clusters
  display     Display information of a EM cluster
  deploy      Deploy a EM cluster
  scale-in    Scale in a EM cluster
  scale-out   Scale out a EM cluster
  start       Start a EM cluster
  stop        Stop a EM cluster
  restart     Restart a EM cluster
  upgrade     Upgrade a specified EM cluster
  destroy     Destroy a specified EM cluster
  backup      Backing up EM cluster metadata information
  restore     Restore EM cluster metadata information
  help        Help about any command
  completion  generate the autocompletion script for the specified shell
  
## 4. 销毁 TiUniManager
~]$ TIUP_HOME=/home/tidb/.em tiup em destroy em-test
```

## 4.2. 使用 TiUniManager

### 4.2.1. 初始化 TiUniManager

登陆 TiUniManager Web 控制台 `http://192.168.3.220:4180/`，初始用户密码:`admin/admin`。首次登陆，需修改密码，这里修改为 `Tidb@123`。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665728001786.png)

另外，首次登陆需完成 TiUniManager 的初始化，包括 TiDB 所在数据中心、TiDB 产品组件、TiDB 版本信息等。

- 数据中心：配置厂商、区域、可用区与实例硬件规格
- 产品组件：配置产品组件基本信息
- 产品版本：启用及禁用产品版本

> **【注意事项】**
>
> TiUniManager v1.0.1 的 TiDB 产品版本最高支持到 TiDB v6.0.0，更高版本的 TiDB 需升级 TiUniManager 版本。

### 4.2.2. 接管 TiDB 集群

1. 进入接管页面

操作步骤：`集群管理->集群->接管集群`：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665728013871.png)

2. 录入 tiup 中控机信息

操作步骤：

- 基本配置：录入 `集群名称、数据库密码`
- 原集群中控机配置：依次录入`中控主机IP（192.168.3.220）、SSH 端口、用户名、密码、tiup部署路径（.tiup 目录，不含末尾的 /）`

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665728029551.png)

3. 查看被接管 TiDB 集群信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665728070490.png)

有关通过 TiUniManager 管理 TIDB 集群，后期单独成文。

## 4.3. 升级 TiUniManager

因 TiUniManager 在 v1.0.0 版本时，名称为 TiEM，从 v1.0.1 开始变更为 TiUniManager。所以，本升级步骤仅适用于从 TiUniManager v1.0.1 升级至 v1.0.2+ 版本，不适用于 v1.0.0 升级至 v1.0.1。

```
## 1. 准备新版 TiUniManager 软件包
~]$ export version=v1.0.2
~]$ wget https://download.pingcap.org/em-enterprise-server-${version}-linux-amd64.tar.gz
~]$ mkdir em-${version}
~]$ tar -xzvf em-enterprise-server-${version}-linux-amd64.tar.gz -C em-v1.0.2

## 2. 更新 TiUniManager REPO，tidb 为之前部署 TiUniManager 时的用户
~]$ sudo sh em-${version}/em-enterprise-server-${version}-linux-amd64/update.sh tidb

## 3. 停止 TiUniManager
~]$ TIUP_HOME=/home/tidb/.em tiup em stop em-test

## 4. 备份 TiUniManager 系统 em-test 元数据到 TiUniManager 中控机
~]$ mkdir /home/tidb/embak && TIUP_HOME=/home/tidb/.em tiup em backup em-test /home/tidb/embak -N 192.168.3.220
+ [ Serial ] - CopyFile: local=/em-data/cluster-server-4101/em.db, remote=192.168.3.220:/home/tidb/embak/em.db

## 5. 升级 TiUniManager 版本至 1.0.2
~]$ TIUP_HOME=/home/tidb/.em tiup em upgrade em-test v1.0.2

## 6. 启动 TiUniManager
~]$ TIUP_HOME=/home/tidb/.em tiup em start em-test 
```

> **【注意事项】**
>
> 需将 `em-enterprise-server-${version}-linux-amd64.tar.gz` 解压至非 `/home/tidb/`目录，否则 `update.sh` 脚本会提示 `temp EM REPO ${em_temp_repo_dir} has already existed, which means ${em_repo_dir} might have already been updated.`，详见 `4.4.3 TiUniManager 升级的坑`。

## 4.4. TiUniManager 踩坑

### 4.4.1. handshake failed: ssh: unable to authenticate

1. 问题描述

openEuler 22.03 LTS 部署 TiUniManager，在 Copy 文件时，会报如下错误：

```
+ Copy files
  - Copy nginx -> 192.168.3.220 ... Error
  - Copy prometheus -> 192.168.3.220 ... Error
  - Copy grafana -> 192.168.3.220 ... Error
  - Copy alertmanager -> 192.168.3.220 ... Error
  - Copy jaeger -> 192.168.3.220 ... Error
  - Copy cluster-server -> 192.168.3.220 ... Error
  - Copy openapi-server -> 192.168.3.220 ... Error
  - Copy file-server -> 192.168.3.220 ... Error
  - Copy elasticsearch -> 192.168.3.220 ... Error
  - Copy filebeat -> 192.168.3.220 ... Error
  - Copy kibana -> 192.168.3.220 ... Error
  - Copy node-exporter -> 192.168.3.220 ... Error

Error: executor.ssh.execute_failed: Failed to execute command over SSH for 'tidb@192.168.3.220:22' {ssh_stderr: , ssh_stdout: , ssh_command: export LANG=C; PATH=$PATH:/bin:/sbin:/usr/bin:/usr/sbin /usr/bin/sudo -H bash -c "test -d /em-deploy || (mkdir -p /em-deploy && chown tidb:$(id -g -n tidb) /em-deploy)"}, cause: ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey], no supported methods remain
```

2. 解决方案

需要目标主机 `/etc/ssh/sshd_config` 增加配置项 `PubkeyAcceptedKeyTypes=+ssh-rsa`，并重启 sshd 服务。如下：

```
~]# echo PubkeyAcceptedKeyTypes=+ssh-rsa >> /etc/ssh/sshd_config
~]# systemctl restart sshd
```

### 4.4.2. nginx 组件启动失败

1. 问题描述

执行 `TIUP_HOME=/home/tidb/.em tiup em start em-test` 启动 TiUniManager 时，nginx 组件启动失败。如下：

```
~]$ TIUP_HOME=/home/tidb/.em tiup em start  em-test

... 省略部分输出日志 ...
Error: failed to start nginx: failed to start: 192.168.3.220 nginx-4180.service, please check the instance's log(/em-deploy/nginx-4180/log) for more detail.: executor.ssh.execute_failed: Failed to execute command over SSH for 'tidb@192.168.3.220:22' {ssh_stderr: Job for nginx-4180.service failed because the control process exited with error code.
See "systemctl status nginx-4180.service" and "journalctl -xeu nginx-4180.service" for details.
, ssh_stdout: , ssh_command: export LANG=C; PATH=$PATH:/bin:/sbin:/usr/bin:/usr/sbin /usr/bin/sudo -H bash -c "systemctl daemon-reload && systemctl start nginx-4180.service"}, cause: Process exited with status 1
Verbose debug logs has been written to /home/tidb/.em/logs/tiup-cluster-debug-2022-10-13-23-24-44.log.
```

根据日志 `/home/tidb/.em/logs/tiup-cluster-debug-2022-10-13-23-24-44.log` 中的提示 `journalctl -xeu nginx-4180.service` 可看到如下报错：

```
~]$ journalctl -xeu nginx-4180.service

... 省略部分内容 ...
Oct 13 23:55:54 localhost.localdomain run_nginx.sh[70305]: bin/sbin/nginx: error while loading shared libraries: libssl.so.10: cannot open shared object file: No such file or directory
Oct 13 23:52:21 localhost.localdomain run_nginx.sh[70081]: bin/sbin/nginx: error while loading shared libraries: libcrypto.so.10: cannot open shared object file: No such file or directory
```

2. 解决方案

TiUniManager v1.0.1 中的 nginx 组件版本为 v1.0.1，需依赖 `/usr/lib64/libssl.so.10` 与 `/usr/lib64/libcrypto.so.10` 库文件，而 openEuler 22.03 LTS 中的库文件版本过高。

从 CentOS 7.9 系统中拷贝 `/usr/lib64/libssl.so.10` 与 `/usr/lib64/libcrypto.so.10` 库文件至 openEuler 22.03 LTS 系统的 `/usr/lib64/` 目录中，并授权 `777`。

```
~]# ls -l /usr/lib64 |grep -E 'libssl.so.10|libcrypto.so.10'
-rwxrwxrwx   1 root root  2520920 Oct 14 01:23 libcrypto.so.10
-rwxrwxrwx   1 root root   470328 Oct 14 01:21 libssl.so.10
```

### 4.4.3. TiUniManager 升级的坑

1. 问题描述

在进行 TiUniManager v1.0.1->v1.0.2 版本升级时，`update.sh` 脚本总提示 `temp EM REPO ${em_temp_repo_dir} has already existed, which means ${em_repo_dir} might have already been updated.`

2. 问题复现

以下操作，均在TiUniManager 中控机（192.168.3.220）中执行。

```
## 1. 确认当前用户及路径
[tidb@localhost ~]$ id
uid=1001(tidb) gid=1001(tidb) groups=1001(tidb),10(wheel)
[tidb@localhost ~]$ pwd
/home/tidb

## 2. 准备新版 TiUniManager 软件包
~]$ export version=v1.0.2
~]$ wget https://download.pingcap.org/em-enterprise-server-${version}-linux-amd64.tar.gz
~]$ tar -xzvf em-enterprise-server-${version}-linux-amd64.tar.gz
~]$ sudo sh em-enterprise-server-${version}-linux-amd64/update.sh tidb

... 省略部分输出 ...
start updating
##### prepare temp EM REPO /home/tidb/em-enterprise-server-v1.0.2-linux-amd64 started #####
temp EM REPO /home/tidb/em-enterprise-server-v1.0.2-linux-amd64 has already existed, which means /home/tidb/em-repo might have already been updated.
```

3. 原因分析

查看了 update.sh 脚本，主要逻辑如下：

```
script_dir=$(cd $(dirname $0) && pwd)                    # $0 为脚本本身所在的路径， script_dir = /home/tidb/em-enterprise-server-v1.0.2-linux-amd64

EM_PACKAGE_PATH=${script_dir}.tar.gz                     # EM_PACKAGE_PATH 为含完整路径名的 em 压缩包名，即 /home/tidb/em-enterprise-server-v1.0.2-linux-amd64.tar.gz
EM_PACKAGE_NAME=$(basename -s .tar.gz $EM_PACKAGE_PATH)  # EM_PACKAGE_NAME为 em 压缩包去后缀的名字，即 em-enterprise-server-v1.0.2-linux-amd64

echo "##### prepare temp EM REPO /home/${USER}/${EM_PACKAGE_NAME} started #####" 
em_repo_dir=/home/${USER}/em-repo                        # em_repo_dir = /home/tidb/em-repo
if [ ! -d "$em_repo_dir" ]; then                         # 如果 em_repo_dir = /home/tidb/em-repo 不存在，提示执行 install.sh 脚本
    echo "EM REPO ${em_repo_dir} does not exist, you might need to use install.sh." 
    exit 1
fi

em_temp_repo_dir=/home/${USER}/${EM_PACKAGE_NAME}        # em_temp_repo_dir = /home/tidb/em-enterprise-server-v1.0.2-linux-amd64
if [ -d "$em_temp_repo_dir" ]; then                      # 如果 em_temp_repo_dir（ /home/tidb/em-enterprise-server-v1.0.2-linux-amd64）目录存在，则提示 em_repo_dir（/home/tidb/em-repo） 已更新，异常退出。
    echo "temp EM REPO ${em_temp_repo_dir} has already existed, which means ${em_repo_dir} might have already been updated." 
    exit 1
fi
cp -r $script_dir $em_temp_repo_dir                      # 将 /home/tidb/em-enterprise-server-v1.0.2-linux-amd64 内容拷贝至 /home/tidb/em-enterprise-server-v1.0.2-linux-amd64

... 省略部分内容 ...
rm -rf ${em_temp_repo_dir}                               # 删除目录 /home/tidb/em-enterprise-server-v1.0.2-linux-amd64
```

示例中的解释，以在 `/home/tidb` 目录中执行`tar -xzvf em-enterprise-server-v1.0.2-linux-amd64.tar.gz` 为例。

`update.sh` 在更新 `temp EM REPO` 时，会检查 `/home/tidb/em-enterprise-server-v1.0.2-linux-amd64` 是否存在？若已存在，则认为已完成 `temp EM REPO` 更新。

当在 `/home/tidb` 目录中执行`tar -xzvf em-enterprise-server-v1.0.2-linux-amd64.tar.gz` 时，会将压缩包解压到 `/home/tidb/em-enterprise-server-v1.0.2-linux-amd64`。因此，当 update.sh 执行到 `if [ -d "$em_temp_repo_dir" ];` 时，认为 `temp EM REPO` 已完成更新，随即退出。

4. 解决方案

将 `em-enterprise-server-${version}-linux-amd64.tar.gz` 解压至非 `/home/tidb/` 目录即可。

```
~]$ export version=v1.0.2
~]$ mkdir em-${version}
~]$ tar -xzvf em-enterprise-server-${version}-linux-amd64.tar.gz -C em-v1.0.2
~]$ sudo sh em-${version}/em-enterprise-server-${version}-linux-amd64/update.sh tidb
```
