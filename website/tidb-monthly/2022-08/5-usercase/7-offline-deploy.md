---
title: 离线部署系列文章之一：TiDBv5.3.0 集群部署&源码部署 Haproxy v2.5.0 - TiDB 社区技术月刊
sidebar_label: 离线部署系列文章之一：TiDBv5.3.0 集群部署&源码部署 Haproxy v2.5.0
hide_title: true
description: 本文主要介绍 TiDBv5.3.0 集群部署&源码部署 Haproxy v2.5.0。
keywords: [TiDB, TiDBv5.3.0, 集群部署, 源码部署, Haproxy v2.5.0]
---

# 离线部署系列文章之一：TiDBv5.3.0集群部署&源码部署 Haproxy v2.5.0

> 作者：OnTheRoad


本文档的部署路线图为：

1. **离线部署 TiDB v5.3.0（TiDB\*3、PD\*3、TiKV\*3）；**
2. **源码部署 Haproxy v2.5.0**
3. 离线升级 TiDB v5.3.0 至 TiDB v5.4.2；
4. 缩扩容 TiDB Server、PD
5. 扩缩容 TiKV、TiFlash
6. 部署 TiSpark（`TiSpark*3`）
7. 离线升级 TiDB v5.4.2 至 TiDB v6.1

## 1. 离线部署

### 1.1. 拓扑规划

| 实例               | 实例数量 | 推荐配置                 | OS                          | IP                | 端口                                                         |
| ------------------ | -------- | ------------------------ | --------------------------- | ----------------- | ------------------------------------------------------------ |
| TiDB               | 3        | `16C/32G/SAS/万兆网卡*2` | CentOS7.3+/RHEL7.3+/OEL7.3+ | 192.168.3.221-223 | 4000：应用及 DBA 工具访问通信端口 10080：TiDB 状态信息上报通信端口 9100：TiDB 集群每个节点的系统信息上报通信端口 |
| PD                 | 3        | `4C/8G/SSD/万兆网卡*2`   | CentOS7.3+/RHEL7.3+/OEL7.3+ | 192.168.3.221-223 | 2379：提供 TiDB 和 PD 通信端口 2380：PD 集群节点间通信端口 9100：TiDB 集群每个节点的系统信息上报通信端口 |
| TiKV               | 3        | `16C/32G/SSD/万兆网卡*2` | CentOS7.3+/RHEL7.3+/OEL7.3+ | 192.168.3.224-226 | 20160：TiKV 通信端口 20180：TiKV 状态信息上报通信端口 9100：TiDB 集群每个节点的系统信息上报通信端口 |
| Monitoring&Grafana | 1        | `8C/16G/SAS/千兆网卡`    | CentOS7.3+/RHEL7.3+/OEL7.3+ | 192.168.3.221     | 9090：Prometheus 服务通信端口 9100：TiDB 集群每个节点的系统信息上报通信端口 3000：Grafana Web访问端口 9093：告警 web 服务端口 9094：告警通信端口 |

其中，192.168.3.221作为中控机，离线部署`TiUP工具`、`TiDB离线镜像包`以及`ToolKit镜像包`。另如未特殊说明，后续操作均在中控机（`192.168.3.221`）由`root`用户执行。

### 1.2. 端口开放

| 组件              | 默认端口 | 说明                                               |
| ----------------- | -------- | -------------------------------------------------- |
| TiDB              | 4000     | 应用及 DBA 工具访问通信端口                        |
| TiDB              | 10080    | TiDB 状态信息上报通信端口                          |
| TiKV              | 20160    | TiKV 通信端口                                      |
| TiKV              | 20180    | TiKV 状态信息上报通信端口                          |
| PD                | 2379     | 提供 TiDB 和 PD 通信端口                           |
| PD                | 2380     | PD 集群节点间通信端口                              |
| TiFlash           | 9000     | TiFlash TCP 服务端口                               |
| TiFlash           | 8123     | TiFlash HTTP 服务端口                              |
| TiFlash           | 3930     | TiFlash RAFT 服务和 Coprocessor 服务端口           |
| TiFlash           | 20170    | TiFlash Proxy 服务端口                             |
| TiFlash           | 20292    | Prometheus 拉取 TiFlash Proxy metrics 端口         |
| TiFlash           | 8234     | Prometheus 拉取 TiFlash metrics 端口               |
| Pump              | 8250     | Pump 通信端口                                      |
| Drainer           | 8249     | Drainer 通信端口                                   |
| CDC               | 8300     | CDC 通信接口                                       |
| Prometheus        | 9090     | Prometheus 服务通信端口                            |
| Node_exporter     | 9100     | TiDB 集群每个节点的系统信息上报通信端口            |
| Blackbox_exporter | 9115     | Blackbox_exporter 通信端口，用于 TiDB 集群端口监控 |
| Grafana           | 3000     | Web 监控服务对外服务和客户端(浏览器)访问端口       |
| Alertmanager      | 9093     | 告警 web 服务端口                                  |
| Alertmanager      | 9094     | 告警通信端口                                       |
| Spark Master      | 7077     | Master 通信端口                                    |
| Spark Master      | 7077     | WebUI端口                                          |
| Spark Worker      | 7078     | Worker 通信端口                                    |

### 1.3. 主机配置

#### 1.3.1. 配置本地 YUM

1. 系统镜像挂载

```
~]# mkdir -p /mnt/yum
~]# mount -o loop /dev/cdrom /mnt/yum
```

如果是光盘ISO文件，可通过`mount -o loop /home/hhrs/CentOS-7.9-x86_64-dvd.iso /mnt/yum`挂载。

2. 配置本地 repo 源

```
~]# cat > /etc/yum.repos.d/local.repo << EOF
[Packages]
name=Redhat Enterprise Linux 7.9
baseurl=file:///mnt/yum/
enabled=1 
gpgcheck=0 
gpgkey=file:///mnt/yum/RPM-GPG-KEY-redhat-release
EOF
```

3. 生成 YUM 缓存

```
~]# yum clean all
~]# yum makecache
```

#### 1.3.2. ssh互信及免密登录

中控机（192.168.3.221）创建密钥。设置root用户互信，免密登录各节点。

1. 生成密钥及密钥分发

```
~]# ssh-keygen -t rsa
~]# ssh-copy-id root@192.168.3.221
~]# ssh-copy-id root@192.168.3.222
~]# ssh-copy-id root@192.168.3.223
~]# ssh-copy-id root@192.168.3.224
~]# ssh-copy-id root@192.168.3.225
~]# ssh-copy-id root@192.168.3.226
```

2. 测试免密登陆

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip} Start Login"
    ssh root@${node_ip} "date"
  done
```

输出如下内容，说明免密登陆设置成功。

```
>>> 192.168.3.221 Start Login
Fri Aug 12 20:44:03 CST 2022
>>> 192.168.3.222 Start Login
Fri Aug 12 20:44:03 CST 2022
>>> 192.168.3.223 Start Login
Fri Aug 12 20:44:03 CST 2022
>>> 192.168.3.224 Start Login
Fri Aug 12 20:44:03 CST 2022
>>> 192.168.3.225 Start Login
Fri Aug 12 20:44:04 CST 2022
>>> 192.168.3.226 Start Login
Fri Aug 12 20:44:04 CST 2022
```

#### 1.3.3. TiKV数据盘优化

每个TiKV节点都要操作，本文档以 `/dev/sdb` 为数据盘，进行优化。

1. 分区格式化

```
~]# fdisk -l
Disk /dev/sdb: 21.5 GB, 21474836480 bytes, 41943040 sectors

~]# parted -s -a optimal /dev/sdb mklabel gpt -- mkpart primary ext4 1 -1

[root@localhost ~]# mkfs.ext4 /dev/sdb1 
mke2fs 1.42.9 (28-Dec-2013)
Discarding device blocks: done                            
Filesystem label=
OS type: Linux
Block size=4096 (log=2)
Fragment size=4096 (log=2)
Stride=0 blocks, Stripe width=0 blocks
1310720 inodes, 5242368 blocks
262118 blocks (5.00%) reserved for the super user
First data block=0
Maximum filesystem blocks=2153775104
160 block groups
32768 blocks per group, 32768 fragments per group
8192 inodes per group
Superblock backups stored on blocks: 
        32768, 98304, 163840, 229376, 294912, 819200, 884736, 1605632, 2654208, 
        4096000

Allocating group tables: done                            
Writing inode tables: done                            
Creating journal (32768 blocks): done
Writing superblocks and filesystem accounting information: done
```

2. 查看分区的UUID

这里 `/dev/sdb1` 的 UUID 为 `49e00d02-2f5b-4b05-8e0e-ac2f524a97ae`

```
[root@localhost ~]# lsblk -f
NAME            FSTYPE      LABEL           UUID                                   MOUNTPOINT
sda                                                                                
├─sda1          ext4                        8e0e85e5-fa82-4f2b-a871-26733d6d2995   /boot
└─sda2          LVM2_member                 KKs6SL-IzU3-62b3-KXZd-a2GR-1tvQ-icleoe 
  └─centos-root ext4                        91645e3c-486c-4bd3-8663-aa425bf8d89d   /
sdb                                                                                
└─sdb1          ext4                        49e00d02-2f5b-4b05-8e0e-ac2f524a97ae   
sr0             iso9660     CentOS 7 x86_64 2020-11-04-11-36-43-00
```

3. 分区挂载将数据盘分区`/dev/sdb1`的挂载信息追加到 `/etc/fstab` 文件中，注意添加 `nodelalloc` 挂载参数。

```
~]# echo "UUID=49e00d02-2f5b-4b05-8e0e-ac2f524a97ae /tidb-data ext4 defaults,nodelalloc,noatime 0 2" >> /etc/fstab

~]# mkdir /tidb-data && mount /tidb-data
~]# mount -t ext4
/dev/mapper/centos-root on / type ext4 (rw,relatime,seclabel,data=ordered)
/dev/sda1 on /boot type ext4 (rw,relatime,seclabel,data=ordered)
/dev/sdb1 on /tidb-data type ext4 (rw,noatime,seclabel,nodelalloc,data=ordered)
```

#### 1.3.4. 关闭Swap

中控机（`192.168.3.221`）root用户执行。因已设置免密登陆，因此可通过如下命令可批量关闭各主机的Swap。

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "echo \"vm.swappiness = 0\">> /etc/sysctl.conf"
    ssh root@${node_ip} "swapoff -a && swapon -a" 
    ssh root@${node_ip} "sysctl -p"
  done
```

一起执行 `swapoff -a` 和 `swapon -a` 命令是为了刷新 swap，将 swap 里的数据转储回内存，并清空 swap 里的数据。

#### 1.3.5. 禁用 SElinux

1. 批量关闭各主机SELinux

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "setenforce 0"
    ssh root@${node_ip} "sed -i 's#SELINUX=enforcing#SELINUX=disabled#g' /etc/selinux/config"
    ssh root@${node_ip} "sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config"
  done
```

2. 验证关闭是否生效

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "getenforce"
  done
```

输出如下内容，说明禁用成功。

```
>>> 192.168.3.221
Disabled
>>> 192.168.3.222
Disabled
>>> 192.168.3.223
Disabled
>>> 192.168.3.224
Disabled
>>> 192.168.3.225
Disabled
>>> 192.168.3.226
Disabled
```

#### 1.3.6. 禁用防火墙

1. 查看防火墙状态

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "firewall-cmd --state"
    ssh root@${node_ip} "systemctl status firewalld.service"
  done
```

2. 关闭防火墙

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "systemctl stop firewalld.service"
    ssh root@${node_ip} "systemctl disable firewalld.service"
  done
```

各主机的预期输出如下：

```
not running
● firewalld.service - firewalld - dynamic firewall daemon
   Loaded: loaded (/usr/lib/systemd/system/firewalld.service; disabled; vendor preset: enabled)
   Active: inactive (dead)
     Docs: man:firewalld(1)
```

#### 1.3.7. 时钟同步

1. 确认时区

将时区调整为东八区北京时间

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime"
  done
```

验证时区，各主机预期的时区输出为`星期 月份 日 时间 CST 年份`,如`Fri Aug 12 21:01:34 CST 2022`。

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "date"
  done
```

2. 时钟同步

TiDB 是一套分布式数据库系统，需要节点间保证时间的同步，从而确保 ACID 模型的事务线性一致性。可以通过互联网中的 [pool.ntp.org](http://pool.ntp.org/) 授时服务来保证节点的时间同步，也可以使用离线环境自己搭建的 NTP 服务来解决授时。

这里以向外网pool.ntp.org时间服务器同步为例，内网NTP服务器同理，只需将`pool.ntp.org`替换为您的NTP服务器主机的IP即可。

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "yum install ntp ntpdate"
    ssh root@${node_ip} "ntpdate pool.ntp.org"
    ssh root@${node_ip} "systemctl start ntpd.service"
    ssh root@${node_ip} "systemctl enable ntpd.service"
  done
```

也可将`ntpdate pool.ntp.org`时钟同步命令加入各主机crond定时任务中。

#### 1.3.8. 系统优化

以下操作，在所有节点上由`root`执行。

1. 关闭透明大页（ Transparent Huge Pages）

```
~]# cat /sys/kernel/mm/transparent_hugepage/enabled
[always] madvise never
```

需使其返回值为`never`

2. 优化IO调度假设数据盘为`/sdb`，需修改调度为`noop`

```
~]# cat /sys/block/sdb/queue/scheduler
noop [deadline] cfq
```

查看数据盘分区的唯一标识 `ID_SERIAL`。

```
~]# udevadm info --name=/dev/sdb | grep ID_SERIAL
E: ID_SERIAL=0QEMU_QEMU_HARDDISK_drive-scsi1
E: ID_SERIAL_SHORT=drive-scsi1
```

3. CPU节能策略`The governor "powersave"`表示 `cpufreq` 的节能策略使用 `powersave`，需要调整为 `performance` 策略。如果是虚拟机或者云主机，则不需要调整，命令输出通常为 `Unable to determine current policy`。

```
~]# cpupower frequency-info --policy
analyzing CPU 0:
current policy: frequency should be within 1.20 GHz and 3.10 GHz.
              The governor "powersave" may decide which speed to use within this range.
```

##### 1.3.8.1. 使用 tuned（推荐）

以下操作，在所有节点上由`root`用户执行。

1. 查看当前tuned策略

```
~]# tuned-adm list
Available profiles:
- balanced                    - General non-specialized tuned profile
- desktop                     - Optimize for the desktop use-case
- hpc-compute                 - Optimize for HPC compute workloads
- latency-performance         - Optimize for deterministic performance at the cost of increased power consumption
- network-latency             - Optimize for deterministic performance at the cost of increased power consumption, focused on low latency network performance
- network-throughput          - Optimize for streaming network throughput, generally only necessary on older CPUs or 40G+ networks
- powersave                   - Optimize for low power consumption
- throughput-performance      - Broadly applicable tuning that provides excellent performance across a variety of common server workloads
- virtual-guest               - Optimize for running inside a virtual guest
- virtual-host                - Optimize for running KVM guests
Current active profile: virtual-guest
```

2. 创建新的tuned策略

在当前的tuned策略`balanced`基础上，追加新的策略。

```
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
elevator=noop
```

多个磁盘的`ID_SERIAL`用竖线分割，如：

```
[disk]
devices_udev_regex=(ID_SERIAL=0QEMU_QEMU_HARDDISK_drive-scsi1)|(ID_SERIAL=36d0946606d79f90025f3e09a0c1f9e81)
elevator=noop
```

3. 应用新的策略

```
~]# tuned-adm profile balanced-tidb-optimal
```

4. 验证优化结果

```
cat /sys/kernel/mm/transparent_hugepage/enabled && \
cat /sys/block/sdb/queue/scheduler && \
cpupower frequency-info --policy
```

> **注意**若tuned关闭THP不生效，可通过如下方式关闭：
>
> 1. 查看默认启动内核
>
> ```
> ~]# grubby --default-kernel
> /boot/vmlinuz-3.10.0-1160.71.1.el7.x86_64
> ```
>
> 1. 追加关闭THP参数
>
> ```
> ~]# grubby --args="transparent_hugepage=never" --update-kernel /boot/vmlinuz-3.10.0-1160.71.1.el7.x86_64
> ~]# grubby --info /boot/vmlinuz-3.10.0-1160.71.1.el7.x86_64
> index=0
> kernel=/boot/vmlinuz-3.10.0-1160.71.1.el7.x86_64
> args="ro crashkernel=auto spectre_v2=retpoline rd.lvm.lv=centos/root rhgb quiet LANG=en_US.UTF-8 >transparent_hugepage=never"
> root=/dev/mapper/centos-root
> initrd=/boot/initramfs-3.10.0-1160.71.1.el7.x86_64.img
> title=CentOS Linux (3.10.0-1160.71.1.el7.x86_64) 7 (Core)
> ```
>
> 1. 立即关闭THP
>
> ```
> ~]# echo never > /sys/kernel/mm/transparent_hugepage/enabled
> ~]# echo never > /sys/kernel/mm/transparent_hugepage/defrag
> ```

##### 1.3.8.2. 内核优化

中控机（`192.168.3.221`）由用户`root`执行。

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "echo \"fs.file-max = 1000000\"       >> /etc/sysctl.conf"
    ssh root@${node_ip} "echo \"net.core.somaxconn = 32768\"  >> /etc/sysctl.conf"
    ssh root@${node_ip} "echo \"net.ipv4.tcp_tw_recycle = 0\" >> /etc/sysctl.conf"
    ssh root@${node_ip} "echo \"net.ipv4.tcp_syncookies = 0\" >> /etc/sysctl.conf"
    ssh root@${node_ip} "echo \"vm.overcommit_memory = 1\"    >> /etc/sysctl.conf"
    ssh root@${node_ip} "sysctl -p"
  done
```

#### 1.3.9. 用户创建及资源限制

以下操作，在中控机（`192.168.3.221`）由用户`root`执行。

##### 1.3.9.1. 创建用户

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "useradd tidb && passwd tidb"
  done
```

tidb用户密码`tidb123`

##### 1.3.9.2. 资源限制

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "echo \"tidb  soft nofile  1000000\" >> /etc/security/limits.conf"
    ssh root@${node_ip} "echo \"tidb  hard nofile  1000000\" >> /etc/security/limits.conf"
    ssh root@${node_ip} "echo \"tidb  soft stack   32768\"   >> /etc/security/limits.conf"
    ssh root@${node_ip} "echo \"tidb  hard stack   32768\"   >> /etc/security/limits.conf"
  done
```

##### 1.3.9.3. sudo权限

为 tidb 用户增加免密 sudo 权限

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "echo \"tidb ALL=(ALL) NOPASSWD: ALL\" >> /etc/sudoers"
  done
```

tidb用户登录各目标节点，确认执行`sudo - root`无需输入密码，即表示添加`sudo免密`成功。

##### 1.3.9.4. tidb 免密登录

`tidb`用户登录中控机（`192.168.3.221`）执行：

1. 为`tidb`用户创建密钥，并分发密钥

```
~]$ id
uid=1000(tidb) gid=1000(tidb) groups=1000(tidb) context=unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023
~]$ ssh-keygen -t rsa
~]$ ssh-copy-id tidb@192.168.3.221
~]$ ssh-copy-id tidb@192.168.3.222
~]$ ssh-copy-id tidb@192.168.3.223
~]$ ssh-copy-id tidb@192.168.3.224
~]$ ssh-copy-id tidb@192.168.3.225
~]$ ssh-copy-id tidb@192.168.3.226
```

2. 验证`tidb`免密登录

```
~]$ id
uid=1000(tidb) gid=1000(tidb) groups=1000(tidb) context=unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023

~]$ 
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh tidb@${node_ip} "date"
  done
```

#### 1.3.10. 安装numactl

```
for node_ip in 192.168.3.221 192.168.3.222 192.168.3.223 192.168.3.224 192.168.3.225 192.168.3.226
  do
    echo ">>> ${node_ip}"
    ssh root@${node_ip} "yum -y install numactl"
  done
```

### 1.4. 准备离线镜像包

可直接在tidb官网下载TiDB Server离线镜像包，或根据需要利用打包工具自助打包离线镜像包。

#### 1.4.1. 方式一：下载 TiDB server 离线镜像包（包含 TiUP 离线组件包）

将离线镜像包上传至中控机（`192.168.3.221`）

https://pingcap.com/zh/product#SelectProduct

```
wget https://download.pingcap.org/tidb-community-server-v5.3.0-linux-amd64.tar.gz
```

#### 1.4.2. 方式二：手动打包离线镜像包

在可以上网的主机，执行如下步骤，进行离线镜像的打包。

1. 安装 TiUP 工具：

```
curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh
source .bash_profile
which tiup
```

2. 用 TiUP 制作离线镜像

```
tiup mirror clone tidb-community-server-${version}-linux-amd64 ${version} --os=linux --arch=amd64
tar czvf tidb-community-server-${version}-linux-amd64.tar.gz tidb-community-server-${version}-linux-amd64
```

此时，生成的 tidb-community-server-${version}-linux-amd64.tar.gz 就是一个独立的离线环境包。

##### 1.4.2.1. 调整离线包内容

1. 可通过参数指定具体的组件和版本等信息，获得不完整的离线镜像。

```
~]$ tiup mirror clone tiup-custom-mirror-v1.7.0 --tiup v1.7.0 --cluster v1.7.0
~]$ tar czvf tiup-custom-mirror-v1.7.0.tar.gz tiup-custom-mirror-v1.7.0
```

将定制的离线包上传至离线的中控机

2. 在隔离环境的中控机上，查看当前使用的离线镜像路径。

```
~]$ tiup mirror show
/home/tidb/tidb-community-server-v5.3.0-linux-amd64
```

如果提示 show 命令不存在，可能当前使用的是较老版本的 TiUP。此时可以通过查看 $HOME/.tiup/tiup.toml 获得正在使用的镜像地址。将此镜像地址记录下来，后续步骤中将以变量 ${base_mirror} 指代此镜像地址。

3. 将不完整的离线镜像合并到已有的离线镜像中：

```
# 将当前离线镜像中的 keys 目录复制到 $HOME/.tiup 目录中：
cp -r ${base_mirror}/keys $HOME/.tiup/

# 使用 TiUP 命令将不完整的离线镜像合并到当前使用的镜像中：
tiup mirror merge tiup-custom-mirror-v1.7.0
```

通过`tiup list` 命令检查执行结果

[1.5. 离线部署TiDB集群](https://tidb.net/blog/48ba5d91#1. 离线部署/1.5. 离线部署TiDB集群)[1.5.1. 部署TiUP组件](https://tidb.net/blog/48ba5d91#1. 离线部署/1.5. 离线部署TiDB集群/1.5.1. 部署TiUP组件)

tidb用户进行TiUP组件部署

```
~]$ id
uid=1000(tidb) gid=1000(tidb) groups=1000(tidb) context=unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023

~]$ sudo chown tidb:tidb tidb-community-server-v5.3.0-linux-amd64.tar.gz 
~]$ ll
total 1942000
-rw-r--r--. 1 tidb tidb 1988601700 Nov 29  2021 tidb-community-server-v5.3.0-linux-amd64.tar.gz

~]$ tar -xzvf tidb-community-server-v5.3.0-linux-amd64.tar.gz 
~]$ sh tidb-community-server-v5.3.0-linux-amd64/local_install.sh
~]$ source /home/tidb/.bash_profile
```

local_install.sh 脚本会自动执行 `tiup mirror set tidb-community-server-v5.3.0-linux-amd64` 命令将当前镜像地址设置为 tidb-community-server-v5.3.0-linux-amd64。

若需将镜像切换到其他目录，可以通过手动执行 `tiup mirror set <TiDB离线镜像包目录>` 进行切换。如果需要切换到在线环境，可执行 `tiup mirror set https://tiup-mirrors.pingcap.com`。

#### 1.5.2. 准备拓扑文件

1. 过滤掉拓扑模板的空白行及注释行，生成拓扑配置`topology.yaml`

```
~]$ tiup cluster template |grep -Ev '^\s*#|^$' > topology.yaml
```

> - ‘^\s*#’ 匹配注释行；
> - ‘^$’ 匹配空白行
> - -E 表示匹配多个条件。多个条件通过 | 分隔。

生成的默认拓扑配置如下：

```
global:
  user: "tidb"
  ssh_port: 22
  deploy_dir: "/tidb-deploy"
  data_dir: "/tidb-data"
  arch: "amd64"
monitored:
  node_exporter_port: 9100
  blackbox_exporter_port: 9115
pd_servers:
  - host: 10.0.1.11
  - host: 10.0.1.12
  - host: 10.0.1.13
tidb_servers:
  - host: 10.0.1.14
  - host: 10.0.1.15
  - host: 10.0.1.16
tikv_servers:
  - host: 10.0.1.17
  - host: 10.0.1.18
  - host: 10.0.1.19
tiflash_servers:
  - host: 10.0.1.20
  - host: 10.0.1.21
monitoring_servers:
  - host: 10.0.1.22
grafana_servers:
  - host: 10.0.1.22
alertmanager_servers:
  - host: 10.0.1.22
```

根据实际环境，修改配置文件。

```
global:
  user: "tidb"
  ssh_port: 22
  deploy_dir: "/tidb-deploy"
  data_dir: "/tidb-data"
  arch: "amd64"
monitored:
  node_exporter_port: 9100
  blackbox_exporter_port: 9115
pd_servers:
  - host: 192.168.3.221
  - host: 192.168.3.222
  - host: 192.168.3.223
tidb_servers:
  - host: 192.168.3.221
  - host: 192.168.3.222
  - host: 192.168.3.223
tikv_servers:
  - host: 192.168.3.224
  - host: 192.168.3.225
  - host: 192.168.3.226
monitoring_servers:
  - host: 192.168.3.221
grafana_servers:
  - host: 192.168.3.221
alertmanager_servers:
  - host: 192.168.3.221
```

#### 1.5.3. 环境校验

1. 环境检查

生产环境，需确保所有检查项都为pass。以下命令在中控机（`192.168.3.221`）执行。

```
~]$ id
uid=1000(tidb) gid=1000(tidb) groups=1000(tidb)

~]$ tiup cluster check ./topology.yaml --user tidb
...
Node           Check       Result  Message
----           -----       ------  -------
192.168.3.223  os-version  Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.223  cpu-cores   Pass    number of CPU cores / threads: 4
192.168.3.223  memory      Pass    memory size is 4096MB
192.168.3.223  selinux     Fail    SELinux is not disabled
192.168.3.223  thp         Fail    THP is enabled, please disable it for best performance
192.168.3.223  command     Pass    numactl: policy: default
192.168.3.224  os-version  Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.224  cpu-cores   Pass    number of CPU cores / threads: 4
192.168.3.224  memory      Pass    memory size is 4096MB
192.168.3.224  selinux     Fail    SELinux is not disabled
192.168.3.224  thp         Fail    THP is enabled, please disable it for best performance
192.168.3.224  command     Pass    numactl: policy: default
192.168.3.225  os-version  Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.225  cpu-cores   Pass    number of CPU cores / threads: 4
192.168.3.225  memory      Pass    memory size is 4096MB
192.168.3.225  selinux     Fail    SELinux is not disabled
192.168.3.225  thp         Fail    THP is enabled, please disable it for best performance
192.168.3.225  command     Pass    numactl: policy: default
192.168.3.226  os-version  Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.226  cpu-cores   Pass    number of CPU cores / threads: 4
192.168.3.226  memory      Pass    memory size is 4096MB
192.168.3.226  selinux     Fail    SELinux is not disabled
192.168.3.226  thp         Fail    THP is enabled, please disable it for best performance
192.168.3.226  command     Pass    numactl: policy: default
192.168.3.221  os-version  Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.221  cpu-cores   Pass    number of CPU cores / threads: 4
192.168.3.221  memory      Pass    memory size is 4096MB
192.168.3.221  selinux     Fail    SELinux is not disabled
192.168.3.221  thp         Fail    THP is enabled, please disable it for best performance
192.168.3.221  command     Pass    numactl: policy: default
192.168.3.222  os-version  Pass    OS is CentOS Linux 7 (Core) 7.9.2009
192.168.3.222  cpu-cores   Pass    number of CPU cores / threads: 4
192.168.3.222  memory      Pass    memory size is 4096MB
192.168.3.222  selinux     Fail    SELinux is not disabled
192.168.3.222  thp         Fail    THP is enabled, please disable it for best performance
192.168.3.222  command     Pass    numactl: policy: default
```

- 环境自动修复

```
~]$ tiup cluster check ./topology.yaml --apply --user root 
```

若无无法自动修复，则参照前面章节内容，逐个手动修复。

#### 1.5.4. 集群部署

在中控机（`192.168.3.221`）执行。

```
~]$ id
uid=1000(tidb) gid=1000(tidb) groups=1000(tidb)

~]$ tiup cluster deploy kruidb-cluster v5.3.0 ./topology.yaml --user tidb
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster deploy kruidb-cluster v5.3.0 ./topology.yaml --user tidb

+ Detect CPU Arch
+ Detect CPU Arch
  - Detecting node 192.168.3.221 ... Done
  - Detecting node 192.168.3.222 ... Done
  - Detecting node 192.168.3.223 ... Done
  - Detecting node 192.168.3.224 ... Done
  - Detecting node 192.168.3.225 ... Done
  - Detecting node 192.168.3.226 ... Done
Please confirm your topology:
Cluster type:    tidb
Cluster name:    kruidb-cluster
Cluster version: v5.3.0
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
prometheus    192.168.3.221  9090         linux/x86_64  /tidb-deploy/prometheus-9090,/tidb-data/prometheus-9090
grafana       192.168.3.221  3000         linux/x86_64  /tidb-deploy/grafana-3000
alertmanager  192.168.3.221  9093/9094    linux/x86_64  /tidb-deploy/alertmanager-9093,/tidb-data/alertmanager-9093
Attention:
    1. If the topology is not what you expected, check your yaml file.
    2. Please confirm there is no port/directory conflicts in same host.
Do you want to continue? [y/N]: (default=N) y 
...

        Enable 192.168.3.226 success
        Enable 192.168.3.224 success
        Enable 192.168.3.225 success
        Enable 192.168.3.222 success
Cluster `kruidb-cluster` deployed successfully, you can start it with command: `tiup cluster start kruidb-cluster`
```

### 1.6. 初始化集群

在中控机（`192.168.3.221`）执行。

```
~]$ tiup cluster start kruidb-cluster

...
+ [ Serial ] - UpdateTopology: cluster=kruidb-cluster
Started cluster `kruidb-cluster` successfully
```

可通过 `tiup cluster start kruidb-cluster --init` 在初始化集群时，为`root`用户生成随机密码（只显示一次）。省略 `--init` 参数，则为`root`用户指定空密码。

### 1.7. 检查TiDB集群

#### 1.7.1. 查看集群

在中控机（`192.168.3.221`）执行。

```
~]$ tiup cluster list
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster list
Name            User  Version  Path                                                      PrivateKey
----            ----  -------  ----                                                      ----------
kruidb-cluster  tidb  v5.3.0   /home/tidb/.tiup/storage/cluster/clusters/kruidb-cluster  /home/tidb/.tiup/storage/cluster/clusters/kruidb-cluster/ssh/id_rsa
~]$ tiup cluster display kruidb-cluster
Starting component `cluster`: /home/tidb/.tiup/components/cluster/v1.7.0/tiup-cluster display kruidb-cluster
Cluster type:       tidb
Cluster name:       kruidb-cluster
Cluster version:    v5.3.0
Deploy user:        tidb
SSH type:           builtin
Dashboard URL:      http://192.168.3.222:2379/dashboard
ID                   Role          Host           Ports        OS/Arch       Status  Data Dir                      Deploy Dir
--                   ----          ----           -----        -------       ------  --------                      ----------
192.168.3.221:9093   alertmanager  192.168.3.221  9093/9094    linux/x86_64  Up      /tidb-data/alertmanager-9093  /tidb-deploy/alertmanager-9093
192.168.3.221:3000   grafana       192.168.3.221  3000         linux/x86_64  Up      -                             /tidb-deploy/grafana-3000
192.168.3.221:2379   pd            192.168.3.221  2379/2380    linux/x86_64  Up      /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.222:2379   pd            192.168.3.222  2379/2380    linux/x86_64  Up|UI   /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.223:2379   pd            192.168.3.223  2379/2380    linux/x86_64  Up|L    /tidb-data/pd-2379            /tidb-deploy/pd-2379
192.168.3.221:9090   prometheus    192.168.3.221  9090         linux/x86_64  Up      /tidb-data/prometheus-9090    /tidb-deploy/prometheus-9090
192.168.3.221:4000   tidb          192.168.3.221  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.222:4000   tidb          192.168.3.222  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.223:4000   tidb          192.168.3.223  4000/10080   linux/x86_64  Up      -                             /tidb-deploy/tidb-4000
192.168.3.224:20160  tikv          192.168.3.224  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.225:20160  tikv          192.168.3.225  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
192.168.3.226:20160  tikv          192.168.3.226  20160/20180  linux/x86_64  Up      /tidb-data/tikv-20160         /tidb-deploy/tikv-20160
```

#### 1.7.2. 检查集群配置

在中控机（`192.168.3.221`）执行。

可通过`tiup cluster edit-config <集群名>`修改集群运行的配置信息，该命令会自动收集各节点的配置项。

```
~]$ tiup cluster edit-config kruidb-cluster

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
tidb_servers:
- host: 192.168.3.221
  ssh_port: 22
  port: 4000
  status_port: 10080
  deploy_dir: /tidb-deploy/tidb-4000
  log_dir: /tidb-deploy/tidb-4000/log
  arch: amd64
  os: linux
- host: 192.168.3.222
  ssh_port: 22
  port: 4000
  status_port: 10080
  deploy_dir: /tidb-deploy/tidb-4000
  log_dir: /tidb-deploy/tidb-4000/log
  arch: amd64
  os: linux
- host: 192.168.3.223
  ssh_port: 22
  port: 4000
  status_port: 10080
  deploy_dir: /tidb-deploy/tidb-4000
  ...
grafana_servers:
- host: 192.168.3.221
  ssh_port: 22
  port: 3000
  deploy_dir: /tidb-deploy/grafana-3000
  arch: amd64
  os: linux
  username: admin
  password: admin
  anonymous_enable: false
  root_url: ""
  domain: ""
alertmanager_servers:
- host: 192.168.3.221
  ssh_port: 22
  web_port: 9093
  cluster_port: 9094
  deploy_dir: /tidb-deploy/alertmanager-9093
  data_dir: /tidb-data/alertmanager-9093
  log_dir: /tidb-deploy/alertmanager-9093/log
  arch: amd64
  os: linux
```

## 2. Haproxy高可用与连接数据库

将`haproxy`部署于`192.168.3.221`节点

### 2.1. 依赖包安装

```
~]# yum -y install epel-release gcc systemd-devel

Installed:
  epel-release.noarch 0:7-11                      gcc.x86_64 0:4.8.5-44.el7                      systemd-devel.x86_64 0:219-78.el7_9.5                     

Dependency Installed:
  cpp.x86_64 0:4.8.5-44.el7     glibc-devel.x86_64 0:2.17-326.el7_9   glibc-headers.x86_64 0:2.17-326.el7_9   kernel-headers.x86_64 0:3.10.0-1160.71.1.el7  
  libmpc.x86_64 0:1.0.1-3.el7   mpfr.x86_64 0:3.1.1-4.el7            

Complete!
```

### 2.2. 安装Haproxy

1. 下载源码包

```
~]# wget https://github.com/haproxy/haproxy/archive/refs/tags/v2.5.0.zip
~]# unzip v2.5.0
```

2. 编译安装

```
~]# cd haproxy-2.5.0
~]# make clean
~]# make -j 8 TARGET=linux-glibc USE_THREAD=1
~]# make PREFIX=/usr/local/haproxy_v2.5.0 SBINDIR=/usr/local/haproxy_v2.5.0/bin install
```

3. 安装后配置

```
～]# ln -s /usr/local/haproxy_v2.5.0 /usr/local/haproxy
～]# echo 'export PATH=/usr/local/haproxy/bin:$PATH' >> /etc/profile
～]# source /etc/profile
～]# which haproxy
/usr/local/haproxy/bin/haproxy
```

### 2.3. 配置Haproxy

通过YUM安装，会生成配置模板，也可根据实际场景自定义如下配置项：

```
global                                     # 全局配置。
   log         127.0.0.1 local2            # 定义全局的 syslog 服务器，最多可以定义两个。
   chroot      /var/lib/haproxy            # 更改当前目录并为启动进程设置超级用户权限，从而提高安全性。
   pidfile     /var/run/haproxy.pid        # 将 HAProxy 进程的 PID 写入 pidfile。
   maxconn     4096                        # 单个 HAProxy 进程可接受的最大并发连接数，等价于命令行参数 "-n"。
   nbthread    48                          # 最大线程数。线程数的上限与 CPU 数量相同。
   user        haproxy                     # 同 UID 参数。
   group       haproxy                     # 同 GID 参数，建议使用专用用户组。
   daemon                                  # 让 HAProxy 以守护进程的方式工作于后台，等同于命令行参数“-D”的功能。当然，也可以在命令行中用“-db”参数将其禁用。
   stats socket /var/lib/haproxy/stats mode 600 level admin  # 统计信息保存位置。

defaults                                   # 默认配置。
   log global                              # 日志继承全局配置段的设置。
   retries 2                               # 向上游服务器尝试连接的最大次数，超过此值便认为后端服务器不可用。
   timeout connect  2s                     # HAProxy 与后端服务器连接超时时间。如果在同一个局域网内，可设置成较短的时间。
   timeout client 30000s                   # 客户端与 HAProxy 连接后，数据传输完毕，即非活动连接的超时时间。
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
   balance leastconn                       # 连接数最少的服务器优先接收连接。`leastconn` 建议用于长会话服务，例如 LDAP、SQL、TSE 等，而不是短会话协议，如 HTTP。该算法是动态的，对于启动慢的服务器，服务器权重会在运行中作调整。
   server tidb-1 192.168.3.221:4000 check inter 2000 rise 2 fall 3      # 检测 4000 端口，检测频率为每 2000 毫秒一次。如果 2 次检测为成功，则认为服务器可用；如果 3 次检测为失败，则认为服务器不可用。
   server tidb-2 192.168.3.222:4000 check inter 2000 rise 2 fall 3
   server tidb-3 192.168.3.223:4000 check inter 2000 rise 2 fall 3
```

将配置文件保存为`/etc/haproxy/haproxy.cfg`，验证配置文件正确性。

```
~]# mkdir -p /var/lib/haproxy
~]# /usr/local/haproxy/bin/haproxy -f haproxy.cfg -c
Configuration file is valid
```

### 2.4. 启停Haproxy

```
~]# /usr/local/haproxy/bin/haproxy -f haproxy.cfg
```

#### 2.4.1. 设置开机自启

```
~]# cp /root/haproxy-2.5.0/examples/haproxy.init /etc/init.d/haproxy
~]# chmod +x /etc/init.d/haproxy
~]# ln -s /usr/local/haproxy/bin/haproxy /usr/sbin/
~]# chkconfig --add haproxy
~]# chkconfig haproxy on
~]# systemctl enable haproxy
haproxy.service is not a native service, redirecting to /sbin/chkconfig.
Executing /sbin/chkconfig haproxy on
~]# systemctl restart haproxy
~]# systemctl status haproxy
~]# systemctl start haproxy
~]# systemctl stop haproxy
```

### 2.5. 安装mysql客户端

```
~]# wget https://dev.mysql.com/get/mysql80-community-release-el7-6.noarch.rpm
~]# rpm -ivh mysql80-community-release-el7-6.noarch.rpm
~]# rpm --import https://repo.mysql.com/RPM-GPG-KEY-mysql-2022
~]# yum makecache
~]# yum install -y mysql
```

### 2.6. 连接 TiDB

#### 2.6.1. 直连tidb

tidb默认用户root，密码为空。

```
~]# mysql -P4000 -uroot -h 192.168.3.222
Welcome to the MySQL monitor.  Commands end with ; or \g.
......
Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> show databases;
+--------------------+
| Database           |
+--------------------+
| INFORMATION_SCHEMA |
| METRICS_SCHEMA     |
| PERFORMANCE_SCHEMA |
| mysql              |
| test               |
+--------------------+
8 rows in set (0.00 sec)
```

#### 2.6.2. 通过 haproxy 连接

```
~]# mysql -P13390 -uroot -h 192.168.3.221
```

### 2.7. 用户管理

#### 2.7.1. 修改密码

```
~]# mysql -P13390 -uroot -h 192.168.3.221
mysql> CREATE USER 'admin'@'%' IDENTIFIED BY 'admin';
mysql> GRANT ALL PRIVILEGES ON *.* TO 'admin'@'%' WITH GRANT OPTION;
mysql> ALTER USER 'root'@'%' IDENTIFIED BY 'root';
mysql> FLUSH PRIVILEGES;
```

#### 2.7.2. 限制用户登陆IP

创建用户时，通过在host中应用标识符`%`或`_`，可以达到限制IP连接数据库的目的。

> 1. `%`表示匹配多个字符。
>
> - ‘admin’@’%'表示admin用户可以从任意主机，连接数据库服务器；
> - ‘admin’@'192.168.3.%'表示admin用户可以从192.168.3.x网段的主机，连接数据库服务器
>
> 1. `_`表示匹配一个字符。
>
> - ‘admin’@'192.168.3.1_'表示admin用户可以从IP为192.168.3.10~192.168.3.19的主机，连接数据库服务器
> - ‘admin’@'192.168.3._4’表示admin用户可以从IP为192.168.3.14/24/34/44/54/64/74/84/94的主机，连接数据库服务器

关于TiDB用户权限管理，可参考官方文档[https://docs.pingcap.com/zh/tidb/stable/privilege-management#%E6%9D%83%E9%99%90%E7%AE%A1%E7%90%86](https://docs.pingcap.com/zh/tidb/stable/privilege-management#权限管理)

#### 2.7.3. 忘记密码

修改配置文件，在 security 部分添加 `skip-grant-table`：

```
[security]
skip-grant-table = true
```

使用修改之后的配置启动 TiDB，然后使用 root 登录后修改密码：

```
~]# mysql -h 127.0.0.1 -P 4000 -u root
```

设置 `skip-grant-table` 之后，启动 TiDB 进程会增加操作系统用户检查，只有操作系统的 root 用户才能启动 TiDB 进程。