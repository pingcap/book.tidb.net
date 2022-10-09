---
title: TiDB跨版本升级--新人首次尝试 - TiDB 社区技术月刊
sidebar_label: TiDB跨版本升级--新人首次尝试
hide_title: true
description: 本文将详细说明采用Dumpling+Lighting+TiDB binlog进行 TiDB 跨版本升级的过程。
keywords: [TiDB, 跨版本, Dumpling, Lighting]
---

# TiDB跨版本升级--新人首次尝试

> 作者： [天蓝色的小九](https://tidb.net/u/%E5%A4%A9%E8%93%9D%E8%89%B2%E7%9A%84%E5%B0%8F%E4%B9%9D/answer)

## 升级背景

1. 原集群版本过低，运维难度大，决定进行版本升级
2. 经过测试发现，v5.4.0版本相对于v3.0.10版本性能有很大提升
3. 决定将TiDB v3.0.10升级到TiDB v5.4.0

## 升级方式

本次升级采用Dumpling+Lighting+TiDB binlog进行

> 【升级方式划分】 大体分为[停机升级](https://docs.pingcap.com/zh/tidb/stable/upgrade-tidb-using-tiup#停机升级) 与[不停机升级](https://docs.pingcap.com/zh/tidb/stable/upgrade-tidb-using-tiup#不停机升级)   根据字面意思理解，我们可以根据业务的要求来进行选择，如果业务允许进行停机升级，那相对来说我们选择停机升级 会更加的安全，快速，如果业务不允许停机的话我们主要选择就是不停机升级
>
> [不停机升级](https://docs.pingcap.com/zh/tidb/stable/upgrade-tidb-using-tiup#不停机升级) 根据官方文档来看，需要通过特定方式来进行滚动升级  滚动升级对于我们来说或许是一个很好的选择，但问题就是： 1、业务需求回滚，我们的回滚方案通常需要针对于全备+增量的方式来进行回滚，回滚进度较慢 2、因版本差距过大的话，连续进行滚动升级，不可控因素增多 3、老版本通常采用Ansible安装，又想让新版本适用tiup进行管理，操作起来较为复杂 #因为种种因素原因，最终决定采用Dumpling+Lightning+TiDB Binlog的方式，可以有效的规避一系列繁琐问题。

- 获取相关信息
- 创建TiDB v5.3.0的目标集群
- Dumpling对原集群进行数据导出
- Lightning对目标集群进行数据导入
- 启动Drainer进行增量同步
- sync-diff-inspector进行数据校验
- 搭建回滚链路
- 切换业务

## 升级步骤

### Ansible安装3.0.8版本TiDB

#### 一、在中控机上安装系统依赖包

```
yum -y install epel-release git curl sshpass && \
yum -y install python2-pip
```

#### 二、在中控机上创建用户，并生成SSH Key

1、创建用户

```
useradd -m -d /home/tidb tidb
```
2、设置用户密码
```
passwd tidb
```

3、配置用户sudo免密码，将tidb ALL=(ALL) NOPASSWD: ALL 添加到文件末尾即可
```
visudo
tidb ALL=(ALL) NOPASSWD: ALL
```

4、生成SSH Key
```
su - tidb
ssh-keygen -t rsa
```

#### 三、在中控机器上下载TiDB Ansible

以创建的用户登录中控机器并进入到/home/tidb目录，使用命令从TiDB Ansible项目上下载相应版本

```
git clone -b 版本 https://github.com/pingcap/tidb-ansible.git
```

部署和升级 TiDB 集群需使用对应的 tidb-ansible 版本，通过改 inventory.ini 文件中的版本来混用可能会产生一些错误。

请务必按文档操作，将 tidb-ansible 下载到 /home/tidb 目录下，权限为 tidb 用户，不要下载到 /root 下，否则会遇到权限问题。

#### 四、在中控机器上安装TiDB Ansible及其依赖

1、在中控机器上安装TiDB Ansible及其依赖

```
cd /home/tidb/tidb-ansible && \
sudo pip install -r ./requirements.txt
```

2、查看Ansible的版本

```
ansible --version
```

#### 五、在中控机器上配置部署机器SSH互信及sudo规则

1、将部署的目标机器ip添加到hosts.ini文件的[servers]区块下

```
cd /home/tidb/tidb-ansible && \
vi hosts.ini

[servers]
172.16.10.1
172.16.10.2
172.16.10.3
172.16.10.4
172.16.10.5
172.16.10.6

[all:vars]
username = tidb
ntp_server = pool.ntp.org
```

2、执行命令，按提示输入部署目标机器的root用户密码

```
ansible-playbook -i hosts.ini create_users.yml -u root -k
```

#### 六、在部署目标机器上安装NTP服务

1、登录中控机器执行命令

```
cd /home/tidb/tidb-ansible && \
ansible-playbook -i hosts.ini deploy_ntp.yml -u tidb -b
```

该步骤将在部署目标机器上使用系统自带软件源联网安装并启动 NTP 服务，服务使用安装包默认的 NTP server 列表，见配置文件 /etc/ntp.conf 中 server 参数。如果使用默认的 NTP server，你的机器需要连接外网。

为了让 NTP 尽快开始同步，启动 NTP 服务前，系统会执行 ntpdate 命令，与用户在 hosts.ini 文件中指定的 ntp_server 同步日期与时间。默认的服务器为 pool.ntp.org，也可替换为你的 NTP server。

#### 七、在部署的目标机器上配置CPUfreq调节器模式

为了让 CPU 发挥最大性能，请将 CPUfreq 调节器模式设置为 performance 模式。

1、查看系统支持的调节器模式

```
cpupower frequency-info --governors
```

如果返回 Not Available，表示当前系统不支持配置 CPUfreq，跳过该步骤即可。

2、查看系统当前的CPUfreq调节器模式

```
cpupower frequency-info --policy
```

3、修改调节器模式
（1）使用cpupower frequency-set --governor命令来修改

```
cpupower frequency-set --governor performance
```
(2)使用命令在部署目标机器上批量设置

```
ansible -i hosts.ini all -m shell -a "cpupower frequency-set --governor performance" -u tidb -b
```

#### 八、在部署的目标机器上添加数据盘ext4文件系统挂在参数

使用 root 用户登录目标机器，将部署目标机器数据盘格式化成 ext4 文件系统，挂载时添加 nodelalloc 和 noatime 挂载参数。nodelalloc 是必选参数，否则 Ansible 安装时检测无法通过；noatime 是可选建议参数

如果你的数据盘已经格式化成 ext4 并挂载了磁盘，可先执行 umount /dev/nvme0n1p1 命令卸载，从编辑 /etc/fstab 文件步骤开始执行，添加挂载参数重新挂载即可。

1、查看数据盘

```
fdisk -l
```

2、创建分区表

```
parted -s -a optimal /dev/nvme0n1 mklabel gpt -- mkpart primary ext4 1 -1
```

3、格式化文件系统

```
mkfs.ext4 /dev/nvme0n1p1
```

4、查看数据盘分区UUID

```
lsblk -f
```

5、编辑/etc/fstab文件，添加nodelalloc参数
```
vi /etc/fstab
UUID=第4步查看到的ID /data1 ext4 defaults,nodelalloc,noatime 0 2
```

6、挂载数据盘

```
mkdir /data1 && \
mount -a
```

7、执行以下命令，如果文件系统为ext4，并且挂载参数中包含nodelalloc，则表示生效

```
mount -t ext4
/dev/nvme0n1p1 on /data1 type ext4 (rw,noatime,nodelalloc,data=ordered)
```

#### 九、编辑inventory.ini文件，分配机器资源

请使用内网 IP 来部署集群，如果部署目标机器 SSH 端口非默认的 22 端口，需添加 ansible_port 变量，如 TiDB1 ansible_host=172.16.10.1 ansible_port=5555。
1、单机单TiKV实例集群拓扑
```
Name  Host IP              Services
node1 172.16.10.1          PD1, TiDB1
node2 172.16.10.2          PD2, TiDB2
node3 172.16.10.3          PD3
node4 172.16.10.4          TiKV1
node5 172.16.10.5          TiKV2
node6 172.16.10.6          TiKV3

[tidb_servers]
172.16.10.1
172.16.10.2

[pd_servers]
172.16.10.1
172.16.10.2
172.16.10.3

[tikv_servers]
172.16.10.4
172.16.10.5
172.16.10.6

[monitoring_servers]
172.16.10.1

[grafana_servers]
172.16.10.1

[monitored_servers]
172.16.10.1
172.16.10.2
172.16.10.3
172.16.10.4
172.16.10.5
172.16.10.6
```

2、单机多TiKV实例集群拓扑

```
Name  Host IP     Services
node1 172.16.10.1   PD1, TiDB1
node2 172.16.10.2   PD2, TiDB2
node3 172.16.10.3   PD3
node4 172.16.10.4   TiKV1-1, TiKV1-2
node5 172.16.10.5   TiKV2-1, TiKV2-2
node6 172.16.10.6   TiKV3-1, TiKV3-2

[tidb_servers]
172.16.10.1
172.16.10.2

[pd_servers]
172.16.10.1
172.16.10.2
172.16.10.3

# 注意：要使用 TiKV 的 labels，必须同时配置 PD 的 location_labels 参数，否则 labels 设置不生效。
[tikv_servers]
TiKV1-1 ansible_host=172.16.10.4 deploy_dir=/data1/deploy tikv_port=20171 labels="host=tikv1"
TiKV1-2 ansible_host=172.16.10.4 deploy_dir=/data2/deploy tikv_port=20172 labels="host=tikv1"
TiKV2-1 ansible_host=172.16.10.5 deploy_dir=/data1/deploy tikv_port=20171 labels="host=tikv2"
TiKV2-2 ansible_host=172.16.10.5 deploy_dir=/data2/deploy tikv_port=20172 labels="host=tikv2"
TiKV3-1 ansible_host=172.16.10.6 deploy_dir=/data1/deploy tikv_port=20171 labels="host=tikv3"
TiKV3-2 ansible_host=172.16.10.6 deploy_dir=/data2/deploy tikv_port=20172 labels="host=tikv3"

# 部署 3.0 版本的 TiDB 集群时，多实例场景需要额外配置 status 端口，示例如下：
# TiKV1-1 ansible_host=172.16.10.4 deploy_dir=/data1/deploy tikv_port=20171 tikv_status_port=20181 labels="host=tikv1"
# TiKV1-2 ansible_host=172.16.10.4 deploy_dir=/data2/deploy tikv_port=20172 tikv_status_port=20182 labels="host=tikv1"
# TiKV2-1 ansible_host=172.16.10.5 deploy_dir=/data1/deploy tikv_port=20171 tikv_status_port=20181 labels="host=tikv2"
# TiKV2-2 ansible_host=172.16.10.5 deploy_dir=/data2/deploy tikv_port=20172 tikv_status_port=20182 labels="host=tikv2"
# TiKV3-1 ansible_host=172.16.10.6 deploy_dir=/data1/deploy tikv_port=20171 tikv_status_port=20181 labels="host=tikv3"
# TiKV3-2 ansible_host=172.16.10.6 deploy_dir=/data2/deploy tikv_port=20172 tikv_status_port=20182 labels="host=tikv3"

[monitoring_servers]
172.16.10.1

[grafana_servers]
172.16.10.1

[monitored_servers]
172.16.10.1
172.16.10.2
172.16.10.3
172.16.10.4
172.16.10.5
172.16.10.6

# 注意：为使 TiKV 的 labels 设置生效，部署集群时必须设置 PD 的 location_labels 参数。
[pd_servers:vars]
location_labels = ["host"]
```

3、服务配置文件参数调整

多实例情况下，需要修改 tidb-ansible/conf/tikv.yml 中 block-cache-size 下面的 capacity 参数：
```
storage:
  block-cache:
    capacity: "1GB"
```

TiKV 实例数量指每个服务器上 TiKV 的进程数量。

推荐设置：capacity = MEM_TOTAL * 0.5 / TiKV 实例数量

多实例情况下，需要修改 tidb-ansible/conf/tikv.yml 中 high-concurrency、normal-concurrency 和 low-concurrency 三个参数：

```
readpool:
  coprocessor:
    # Notice: if CPU_NUM > 8, default thread pool size for coprocessors
    # will be set to CPU_NUM * 0.8.
    # high-concurrency: 8
    # normal-concurrency: 8
    # low-concurrency: 8
#推荐配置：TiKV 实例数量 * 参数值 = CPU 核心数量 * 0.8

#如果多个 TiKV 实例部署在同一块物理磁盘上，需要修改 conf/tikv.yml 中的 capacity 参数：
raftstore:
  capacity: 0
#推荐配置：capacity = 磁盘总容量 / TiKV 实例数量，例如：capacity: "100GB"。
```

#### 十、调整inventory.ini文件中的变量

```
1、调整部署目录
#部署目录通过 deploy_dir 变量控制，默认全局变量已设置为 /home/tidb/deploy，对所有服务生效。如数据盘挂载目录为 /data1，可设置为 /data1/deploy，样例如下
## Global variables
[all:vars]
deploy_dir = /data1/deploy
#如为某一服务单独设置部署目录，可在配置服务主机列表时配置主机变量，以 TiKV 节点为例，其他服务类推，请务必添加第一列别名，以免服务混布时混淆
TiKV1-1 ansible_host=172.16.10.4 deploy_dir=/data1/deploy
```

2、调节其他变量（可选）

\#以下控制变量开启请使用首字母大写 `True`，关闭请使用首字母大写 `False`

| 变量                           | 含义                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `cluster_name`                 | 集群名称，可调整                                             |
| `tidb_version`                 | TiDB 版本，TiDB Ansible 各分支默认已配置                     |
| `process_supervision`          | 进程监管方式，默认为 `systemd`，可选 `supervise`             |
| `timezone`                     | 新安装 TiDB 集群第一次启动 bootstrap（初始化）时，将 TiDB 全局默认时区设置为该值。TiDB 使用的时区后续可通过 `time_zone` 全局变量和 session 变量来修改，参考[时区支持](https://docs.pingcap.com/zh/tidb/v3.0/configure-time-zone)。默认为 `Asia/Shanghai`，可选值参考 [timzone 列表](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)。 |
| `enable_firewalld`             | 开启防火墙，默认不开启，如需开启，请将[部署建议-网络要求](https://docs.pingcap.com/zh/tidb/v3.0/hardware-and-software-requirements#网络要求) 中的端口加入白名单 |
| `enable_ntpd`                  | 检测部署目标机器 NTP 服务，默认为 `True`，请勿关闭           |
| `set_hostname`                 | 根据 IP 修改部署目标机器主机名，默认为 `False`               |
| `enable_binlog`                | 是否部署 Pump 并开启 binlog，默认为 `False`，依赖 Kafka 集群，参见 `zookeeper_addrs` 变量 |
| `zookeeper_addrs`              | binlog Kafka 集群的 zookeeper 地址                           |
| `deploy_without_tidb`          | KV 模式，不部署 TiDB 服务，仅部署 PD、TiKV 及监控服务，请将 `inventory.ini` 文件中 `tidb_servers` 主机组的 IP 设置为空。 |
| `alertmanager_target`          | 可选：如果你已单独部署 alertmanager，可配置该变量，格式：`alertmanager_host:alertmanager_port` |
| `grafana_admin_user`           | Grafana 管理员帐号用户名，默认为 admin                       |
| `grafana_admin_password`       | Grafana 管理员帐号密码，默认为 admin，用于 Ansible 导入 Dashboard 和创建 API Key，如后期通过 grafana web 修改了密码，请更新此变量 |
| `collect_log_recent_hours`     | 采集日志时，采集最近几个小时的日志，默认为 2 小时            |
| `enable_bandwidth_limit`       | 在中控机上从部署目标机器拉取诊断数据时，是否限速，默认为 `True`，与 `collect_bandwidth_limit` 变量结合使用 |
| `collect_bandwidth_limit`      | 在中控机上从部署目标机器拉取诊断数据时限速多少，单位: Kbit/s，默认 10000，即 10Mb/s，如果是单机多 TiKV 实例部署方式，需除以单机实例个数 |
| `prometheus_storage_retention` | Prometheus 监控数据的保留时间（默认为 30 天）；2.1.7、3.0 以及之后的 tidb-ansible 版本中，`group_vars/monitoring_servers.yml` 文件里新增的配置 |

#### 十一、部署TiDB集群

```
#ansible-playbook 执行 Playbook 时，默认并发为 5。部署目标机器较多时，可添加 -f 参数指定并发数，例如 ansible-playbook deploy.yml -f 10。以下示例使用 tidb 用户作为服务运行用户：
1、在 tidb-ansible/inventory.ini 文件中，确认 ansible_user = tidb
## Connection
# ssh via normal user
ansible_user = tidb
#不要将 ansible_user 设置为 root 用户，因为 tidb-ansible 限制了服务以普通用户运行。
执行以下命令，如果所有server返回tidb，表示SSH互信配置成功：
ansible -i inventory.ini all -m shell -a 'whoami'
执行以下命令，如果所有server返回root，表示tidb用户sudo免密码配置成功
ansible -i inventory.ini all -m shell -a 'whoami' -b

2、执行local_prepare.yml playbook，联网下载 TiDB binary 到中控机。
ansible-playbook local_prepare.yml

3、初始化系统环境，修改内核参数。
ansible-playbook bootstrap.yml

4、部署 TiDB 集群软件。
ansible-playbook deploy.yml
#Grafana Dashboard 上的 Report 按钮可用来生成 PDF 文件，此功能依赖 fontconfig 包和英文字体。如需使用该功能，登录 grafana_servers 机器，用以下命令安装：
>
sudo yum install fontconfig open-sans-fonts

5、启动TiDB集群
ansible-playbook start.yml
```

#### 十二、测试集群

```
#TiDB 兼容 MySQL，因此可使用 MySQL 客户端直接连接 TiDB。推荐配置负载均衡以提供统一的 SQL 接口。
1、使用 MySQL 客户端连接 TiDB 集群。TiDB 服务的默认端口为 4000。
mysql -u root -h 172.16.10.1 -P 4000

2、通过浏览器访问监控平台
地址：http://ip:端口
默认帐号与密码：admin；admin
```

### 使用TiUP部署TiDB5.4.0集群

#### 一、在TiKV部署目标机器上添加数据盘EXT4文件系统挂载参数

```
#使用 root 用户登录目标机器，将部署目标机器数据盘格式化成 ext4 文件系统，挂载时添加 nodelalloc 和 noatime 挂载参数。nodelalloc 是必选参数，否则 TiUP 安装时检测无法通过；noatime 是可选建议参数。
1、查看数据盘
fdisk -l

2、创建分区
parted -s -a optimal /dev/nvme0n1 mklabel gpt -- mkpart primary ext4 1 -1
#使用 lsblk 命令查看分区的设备号：对于 nvme 磁盘，生成的分区设备号一般为 nvme0n1p1；对于普通磁盘（例如 /dev/sdb），生成的分区设备号一般为 sdb1

3、格式化文件系统
mkfs.ext4 /dev/nvme0n1p1

4、查看数据盘分区UUID
lsblk -f

5、编辑 /etc/fstab 文件，添加 nodelalloc 挂载参数。
vi /etc/fstab
UUID=第四步查的UUID /data1 ext4 defaults,nodelalloc,noatime 0 2

6、挂载数据盘
mkdir /data1 && \
mount -a

7、执行命令，如果文件系统为 ext4，并且挂载参数中包含 nodelalloc，则表示已生效。
mount -t ext4
```

#### 二、检测及关闭系统swap

```
echo "vm.swappiness = 0">> /etc/sysctl.conf
swapoff -a && swapon -a
sysctl -p
#一起执行 swapoff -a 和 swapon -a 命令是为了刷新 swap，将 swap 里的数据转储回内存，并清空 swap 里的数据。不可省略 swappiness 设置而只执行 swapoff -a；否则，重启后 swap 会再次自动打开，使得操作失效。
#执行 sysctl -p 命令是为了在不重启的情况下使配置生效
```

#### 三、检测即关闭目标部署机器的防火墙

```
1、检查防火墙状态
sudo firewall-cmd --state
sudo systemctl status firewalld.service

2、关闭防火墙服务
sudo systemctl stop firewalld.service

3、关闭防火墙自动启动服务
sudo systemctl disable firewalld.service

4、检查防火墙状态
sudo systemctl status firewalld.service
```

#### 四、检测及安装NTP服务

```
1、执行以下命令，如果输出running表示NTP服务正在运行
sudo systemctl status ntpd.service

ntpd.service - Network Time Service
Loaded: loaded (/usr/lib/systemd/system/ntpd.service; disabled; vendor preset: disabled)
Active: active (running) since 一 2017-12-18 13:13:19 CST; 3s ago
#若返回报错信息 Unit ntpd.service could not be found.，请尝试执行以下命令，以查看与 NTP 进行时钟同步所使用的系统配置是 chronyd 还是 ntpd
sudo systemctl status chronyd.service
#若发现系统既没有配置 chronyd 也没有配置 ntpd ，则表示系统尚未安装任一服务。此时，应先安装其中一个服务，并保证它可以自动启动，默认使用 ntpd
#如果你使用的系统配置是 chronyd，请直接执行步骤 3。

2、执行 ntpstat 命令检测是否与 NTP 服务器同步
ntpstat
#如果输出 synchronised to NTP server，表示正在与 NTP 服务器正常同步
synchronised to NTP server (85.199.214.101) at stratum 2
time correct to within 91 ms
polling server every 1024 s
#以下情况表示 NTP 服务未正常同步：
unsynchronised
#以下情况表示 NTP 服务未正常运行：
Unable to talk to NTP daemon. Is it running?

3、执行 chronyc tracking 命令查看 Chrony 服务是否与 NTP 服务器同步。
#该操作仅适用于使用 Chrony 的系统，不适用于使用 NTPd 的系统
chronyc tracking
#如果该命令返回结果为 Leap status : Normal，则代表同步过程正常
Reference ID    : 5EC69F0A (ntp1.time.nl)
Stratum         : 2
Ref time (UTC)  : Thu May 20 15:19:08 2021
System time     : 0.000022151 seconds slow of NTP time
Last offset     : -0.000041040 seconds
RMS offset      : 0.000053422 seconds
Frequency       : 2.286 ppm slow
Residual freq   : -0.000 ppm
Skew            : 0.012 ppm
Root delay      : 0.012706812 seconds
Root dispersion : 0.000430042 seconds
Update interval : 1029.8 seconds
Leap status     : Normal
#如果该命令返回结果如下，则表示同步过程出错：
Leap status    : Not synchronised
#如果该命令返回结果如下，则表示 Chrony 服务未正常运行：
506 Cannot talk to daemon
#如果要使 NTP 服务尽快开始同步，执行以下命令。可以将 pool.ntp.org 替换为你的 NTP 服务器：
sudo systemctl stop ntpd.service && \
sudo ntpdate pool.ntp.org && \
sudo systemctl start ntpd.service
#如果要在 CentOS 7 系统上手动安装 NTP 服务，可执行以下命令：
sudo yum install ntp ntpdate && \
sudo systemctl start ntpd.service && \
sudo systemctl enable ntpd.service
```

#### 五、检查和配置操作系统优化参数

```
#在生产系统的 TiDB 中，建议对操作系统进行如下的配置优化：
（1）关闭透明大页（即 Transparent Huge Pages，缩写为 THP）。数据库的内存访问模式往往是稀疏的而非连续的。当高阶内存碎片化比较严重时，分配 THP 页面会出现较高的延迟。
（2）将存储介质的 I/O 调度器设置为 noop。对于高速 SSD 存储介质，内核的 I/O 调度操作会导致性能损失。将调度器设置为 noop 后，内核不做任何操作，直接将 I/O 请求下发给硬件，以获取更好的性能。同时，noop 调度器也有较好的普适性。
（3）为调整 CPU 频率的 cpufreq 模块选用 performance 模式。将 CPU 频率固定在其支持的最高运行频率上，不进行动态调节，可获取最佳的性能。

1、执行命令查看透明大页的开启状态
cat /sys/kernel/mm/transparent_hugepage/enabled
#[always] madvise never 表示透明大页处于启用状态，需要关闭。

2、执行以下命令查看数据目录所在磁盘的 I/O 调度器。假设在 sdb、sdc 两个磁盘上创建了数据目录
cat /sys/block/sd[bc]/queue/scheduler
noop [deadline] cfq
noop [deadline] cfq
#noop [deadline] cfq 表示磁盘的 I/O 调度器使用 deadline，需要进行修改。

3、执行以下命令查看磁盘的唯一标识 ID_SERIAL
udevadm info --name=/dev/sdb | grep ID_SERIAL

E: ID_SERIAL=36d0946606d79f90025f3e09a0c1f9e81
E: ID_SERIAL_SHORT=6d0946606d79f90025f3e09a0c1f9e81
#如果多个磁盘都分配了数据目录，需要多次执行以上命令，记录所有磁盘各自的唯一标识。

4、执行以下命令查看cpufreq模块选用的节能策略
cpupower frequency-info --policy

analyzing CPU 0:
current policy: frequency should be within 1.20 GHz and 3.10 GHz.
              The governor "powersave" may decide which speed to use within this range.
#The governor "powersave" 表示 cpufreq 的节能策略使用 powersave，需要调整为 performance 策略。如果是虚拟机或者云主机，则不需要调整，命令输出通常为 Unable to determine current policy。

5、配置系统参数
#方法一：使用tuned（推荐）
（1）、执行tuned-adm list命令查看当前操作系统的tuned策略
tuned-adm list

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
Current active profile: balanced
#Current active profile: balanced 表示当前操作系统的 tuned 策略使用 balanced，建议在当前策略的基础上添加操作系统优化配置

（2）、创建新的tuned策略
mkdir /etc/tuned/balanced-tidb-optimal/
vi /etc/tuned/balanced-tidb-optimal/tuned.conf

[main]
include=balanced
[cpu]
governor=performance
[vm]
transparent_hugepages=never
[disk]
devices_udev_regex=(ID_SERIAL=36d0946606d79f90025f3e09a0c1fc035)|(ID_SERIAL=36d0946606d79f90025f3e09a0c1f9e81)
elevator=noop
#include=balanced 表示在现有的 balanced 策略基础上添加操作系统优化配置。

（3）、应用新的 tuned 策略
tuned-adm profile balanced-tidb-optimal

#方法二：使用脚本方式。如果已经使用 tuned 方法，请跳过本方法
（1）、执行grubby命令查看默认内核版本
#需安装 grubby 软件包。
grubby --default-kernel

（2）、执行 grubby --update-kernel 命令修改内核配置
grubby --args="transparent_hugepage=never" --update-kernel /boot/vmlinuz-3.10.0-957.el7.x86_64
#--update-kernel 后需要使用实际的默认内核版本

（3）、执行 grubby --info 命令查看修改后的默认内核配置
grubby --info /boot/vmlinuz-3.10.0-957.el7.x86_64
#--info 后需要使用实际的默认内核版本
index=0
kernel=/boot/vmlinuz-3.10.0-957.el7.x86_64
args="ro crashkernel=auto rd.lvm.lv=centos/root rd.lvm.lv=centos/swap rhgb quiet LANG=en_US.UTF-8 transparent_hugepage=never"
root=/dev/mapper/centos-root
initrd=/boot/initramfs-3.10.0-957.el7.x86_64.img
title=CentOS Linux (3.10.0-957.el7.x86_64) 7 (Core)

（4）、修改当前的内核配置立即关闭透明大页
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo never > /sys/kernel/mm/transparent_hugepage/defrag

（5）、配置udev脚本应用IO调度器策略
vi /etc/udev/rules.d/60-tidb-schedulers.rules

ACTION=="add|change", SUBSYSTEM=="block", ENV{ID_SERIAL}=="36d0946606d79f90025f3e09a0c1fc035", ATTR{queue/scheduler}="noop"
ACTION=="add|change", SUBSYSTEM=="block", ENV{ID_SERIAL}=="36d0946606d79f90025f3e09a0c1f9e81", ATTR{queue/scheduler}="noop"

（6）、应用udev脚本
udevadm control --reload-rules
udevadm trigger --type=devices --action=change

（7）、创建CPU节能策略配置服务
cat  >> /etc/systemd/system/cpupower.service << EOF
[Unit]
Description=CPU performance
[Service]
Type=oneshot
ExecStart=/usr/bin/cpupower frequency-set --governor performance
[Install]
WantedBy=multi-user.target
EOF

（8）、应用CPU节能策略配置服务
systemctl daemon-reload
systemctl enable cpupower.service
systemctl start cpupower.service

6、执行以下命令验证透明大页的状态
cat /sys/kernel/mm/transparent_hugepage/enabled

7、执行以下命令验证数据目录所在磁盘的IO调度器
cat /sys/block/sd[bc]/queue/scheduler

8、执行以下命令查看cpufreq模块选用的节能策略
cpupower frequency-info --policy

9、执行以下命令修改sysctl参数
echo "fs.file-max = 1000000">> /etc/sysctl.conf
echo "net.core.somaxconn = 32768">> /etc/sysctl.conf
echo "net.ipv4.tcp_tw_recycle = 0">> /etc/sysctl.conf
echo "net.ipv4.tcp_syncookies = 0">> /etc/sysctl.conf
echo "vm.overcommit_memory = 1">> /etc/sysctl.conf
sysctl -p

10、执行以下命令配置用户的limits.conf文件
cat << EOF >>/etc/security/limits.conf
tidb           soft    nofile          1000000
tidb           hard    nofile          1000000
tidb           soft    stack          32768
tidb           hard    stack          32768
EOF
```

#### 六、安装numactl工具

```
#NUMA 绑核是用来隔离 CPU 资源的一种方法，适合高配置物理机环境部署多实例使用。
#通过 tiup cluster deploy 完成部署操作，就可以通过 exec 命令来进行集群级别管理工作
安装numa工具有两种方法：
方法一、登录到目标节点进行安装
sudo yum -y install numactl

方法二、通过 tiup cluster exec 在集群上批量安装 NUMA
#安装集群之后进行
1、执行 tiup cluster exec 命令，以 sudo 权限在 tidb-test 集群所有目标主机上安装 NUMA
tiup cluster exec tidb-test --sudo --command "yum -y install numactl"
#你可以执行 tiup cluster exec --help 查看的 tiup cluster exec 命令的说明信息
```

#### 七、在中控机上部署TiUP组件

```
1、执行如下命令安装tiup工具
curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh

2、执行如下步骤设置tiup环境变量
（1）重新声明全局环境变量
source .bash_profile
（2）确认tiup工具是否安装
which tiup

3、安装tiup cluster组件
tiup cluster

4、如果已经安装，则更新 TiUP cluster 组件至最新版本
tiup update --self && tiup update cluster

5、验证当前 TiUP cluster 版本信息。执行如下命令查看 TiUP cluster 组件版本
tiup --binary cluster
```

#### 八、初始化集群拓扑文件

```
1、执行命令，生成集群初始化配置文件
tiup cluster template > topology.yaml
#针对两种常用的部署场景，也可以通过以下命令生成建议的拓扑模板
  （1）混合部署场景：单台机器部署多个实例
  tiup cluster template --full > topology.yaml
  （2）跨机房部署场景：跨机房部署 TiDB 集群
  tiup cluster template --multi-dc > topology.yaml
#对于需要全局生效的参数，请在配置文件中 server_configs 的对应组件下配置。
#对于需要某个节点生效的参数，请在具体节点的 config 中配置。
```

#### 九、执行部署命令

```
#如果是密钥方式，可以通过 -i 或者 --identity_file 来指定密钥的路径
#如果是密码方式，可以通过 -p 进入密码交互窗口
#如果已经配置免密登录目标机，则不需填写认证
1、检查集群存在的潜在风险
tiup cluster check ./topology.yaml --user root [-p] [-i /home/root/.ssh/gcp_rsa]

2、自动修复集群存在的潜在风险
tiup cluster check ./topology.yaml --apply --user root [-p] [-i /home/root/.ssh/gcp_rsa]

3、部署TiDB集群
tiup cluster deploy tidb-test v5.4.0 ./topology.yaml --user root [-p] [-i /home/root/.ssh/gcp_rsa]
```

#### 十、查看tiup管理的集群情况

```
tiup cluster list
```

#### 十一、检查部署的TiDB集群情况

```
tiup cluster display tidb-test
```

#### 十二、启动集群

```
#使用安全启动方式后，不能通过无密码的 root 用户登录数据库，你需要记录命令行返回的密码进行后续操作。
#自动生成的密码只会返回一次，如果没有记录或者忘记该密码，请参照忘记 root 密码修改密码
方式一、安全启动
tiup cluster start tidb-test --init

方式二、普通启动
tiup cluster start tidb-test
```

#### 十三、验证集群运行状态

```
tiup cluster display tidb-test
```

### 部署数据导出工具Dumpling

#### 1、下载包含Dumpling的tidb-toolkit安装包

```
wget https://download.pingcap.org/tidb-toolkit-v5.4.2-linux-amd64.tar.gz
```

#### 2、从TiDB导出数据

```
1、需要的权限
SELECT
RELOAD
LOCK TABLES
REPLICATION CLIENT
PROCESS

2、导出为SQL文件
#本文假设在 127.0.0.1:4000 有一个 TiDB 实例，并且这个 TiDB 实例中有无密码的 root 用户
#Dumpling 默认导出数据格式为 SQL 文件。也可以通过设置 --filetype sql 导出数据到 SQL 文件
dumpling -u root -P 4000 -h 127.0.0.1 --filetype sql -t 8 -o /tmp/test -r 200000 -F256MiB
#以上命令中：

-h、-P、-u 分别代表地址、端口、用户。如果需要密码验证，可以使用 -p $YOUR_SECRET_PASSWORD 将密码传给 Dumpling。
-o 用于选择存储导出文件的目录，支持本地文件路径或外部存储 URL 格式。
-t 用于指定导出的线程数。增加线程数会增加 Dumpling 并发度提高导出速度，但也会加大数据库内存消耗，因此不宜设置过大。一般不超过 64。
-r 用于指定单个文件的最大行数，指定该参数后 Dumpling 会开启表内并发加速导出，同时减少内存使用。当上游为 TiDB 且版本为 v3.0 或更新版本时，该参数大于 0 表示使用 TiDB region 信息划分表内并发，具体取值将不再生效。
-F 选项用于指定单个文件的最大大小，单位为 MiB，可接受类似 5GiB 或 8KB 的输入。如果你想使用 TiDB Lightning 将该文件加载到 TiDB 实例中，建议将 -F 选项的值保持在 256 MiB 或以下。
#如果导出的单表大小超过 10 GB，强烈建议使用 -r 和 -F 参数。

3、导出为CSV文件
#当你导出 CSV 文件时，你可以使用 --sql <SQL> 导出指定 SQL 选择出来的记录。例如，导出 test.sbtest1 中所有 id < 100 的记录
./dumpling -u root -P 4000 -h 127.0.0.1 -o /tmp/test --filetype csv --sql 'select * from `test`.`sbtest1` where id < 100' -F 100MiB --output-filename-template 'test.sbtest1.{{.Index}}'
#以上命令中：

--sql 选项仅仅可用于导出 CSV 文件的场景。上述命令将在要导出的所有表上执行 SELECT * FROM <table-name> WHERE id < 100 语句。如果部分表没有指定的字段，那么导出会失败。
使用 --sql 配置导出时，Dumpling 无法获知导出的表库信息，此时可以使用 --output-filename-template 选项来指定 CSV 文件的文件名格式，以方便后续使用 TiDB Lightning 导入数据文件。例如 --output-filename-template='test.sbtest1.{{.Index}}' 指定导出的 CSV 文件为 test.sbtest1.000000000、test.sbtest1.000000001 等。
你可以使用 --csv-separator、--csv-delimiter 等选项，配置 CSV 文件的格式。具体信息可查阅 Dumpling 主要选项表。
#Dumpling 导出不区分字符串与关键字。如果导入的数据是 Boolean 类型的 true 和 false，导出时会被转换为 1 和 0 。

#通过并发提高Dumpling的导出效率
-t 用于指定导出的线程数。增加线程数会增加 Dumpling 并发度提高导出速度，但也会加大数据库内存消耗，因此不宜设置过大。
-r 选项用于指定单个文件的最大记录数，或者说，数据库中的行数。开启后 Dumpling 会开启表内并发，提高导出大表的速度。当上游为 TiDB 且版本为 v3.0 或更新版本时，该参数大于 0 表示使用 TiDB region 信息划分表内并发，具体取值将不再生效。
--compress gzip 选项可以用于压缩导出的数据。压缩可以显著降低导出数据的大小，同时如果存储的写入 I/O 带宽不足，可以使用该选项来加速导出。但该选项也有副作用，由于该选项会对每个文件单独压缩，因此会增加 CPU 消耗

#调整 Dumpling 的数据一致性选项
默认auto

#导出大规模数据时的TiDB GC设置
提前调长GC时间，避免因为导出过程中发生GC导致出失败
SET GLOBAL tidb_gc_life_time = '720h';
操作结束之后在恢复GC时间默认是10m
SET GLOBAL tidb_gc_life_time = '10m';
```

### 部署数据导入工具TiDB Lightning

#### 1、下载软件包

```
wget https://download.pingcap.org/tidb-toolkit-v5.4.2-linux-amd64.tar.gz
```

#### 2、配置tidb-lightning.toml

```
[lightning]

# 转换数据的并发数，默认为逻辑 CPU 数量，不需要配置。
# 混合部署的情况下可以配置为逻辑 CPU 的 75% 大小。
# region-concurrency =

# 日志
level = "info"
file = "tidb-lightning.log"

[tikv-importer]
# backend 设置为 local 模式
backend = "local"
# 设置本地临时存储路径
sorted-kv-dir = "/mnt/ssd/sorted-kv-dir"

[mydumper]
# 源数据目录。
data-source-dir = "/data/my_database"

[tidb]
# 目标集群的信息。tidb-server 的监听地址，填一个即可。
host = "172.16.31.1"
port = 4000
user = "root"
password = ""
# 表架构信息在从 TiDB 的“状态端口”获取。
status-port = 10080
# pd-server 的地址，填一个即可
pd-addr = "172.16.31.4:2379"

[checkpoint]
# 是否启用断点续传。
# 导入数据时，TiDB Lightning 会记录当前表导入的进度。
# 所以即使 TiDB Lightning 或其他组件异常退出，在重启时也可以避免重复再导入已完成的数据。
enable = true
# 存储断点的数据库名称。
schema = "tidb_lightning_checkpoint"
# 存储断点的方式。
#  - file：存放在本地文件系统。
#  - mysql：存放在兼容 MySQL 的数据库服务器。
driver = "file"
```

#### 3、运行 `tidb-lightning`。如果直接在命令行中用 `nohup` 启动程序，可能会因为 SIGHUP 信号而退出，建议把 `nohup` 放到脚本里面

```
#!/bin/bash
nohup ./tidb-lightning -config tidb-lightning.toml > nohup.out &
```

### 部署TiDBbinlog进行增量同步

#### 一、部署Pump


1、修改tidb-ansible/inventory.ini文件
  （1）设置enable_binlog = True，表示 TiDB 集群开启 binlog
```
## binlog trigger
enable_binlog = True
```

  （2）为 pump_servers 主机组添加部署机器 IP

```
## Binlog Part
[pump_servers]
172.16.10.72
172.16.10.73
172.16.10.74
```

默认 Pump 保留 7 天数据，如需修改可修改 tidb-ansible/conf/pump.yml（TiDB 3.0.2 及之前版本中为 tidb-ansible/conf/pump-cluster.yml）文件中 gc 变量值，并取消注释。

```
global:
  # an integer value to control the expiry date of the binlog data, which indicates for how long (in days) the binlog data would be stored
  # must be bigger than 0
   gc: 7
#请确保部署目录有足够空间存储 binlog，详见调整部署目录，也可为 Pump 设置单独的部署目录。
## Binlog Part
[pump_servers]
pump1 ansible_host=172.16.10.72 deploy_dir=/data1/pump
pump2 ansible_host=172.16.10.73 deploy_dir=/data2/pump
pump3 ansible_host=172.16.10.74 deploy_dir=/data3/pump
```

#### 二、部署并启动Pump组件的TiDB集群

在已有的TiDB集群上增加Pump组件

1、部署 pump_servers 和 node_exporters
```
ansible-playbook deploy.yml --tags=pump -l ${pump1_ip},${pump2_ip},[${alias1_name},${alias2_name}]
```
#以上命令中，逗号后不要加空格，否则会报错。

2、启动pump_servers
```
ansible-playbook start.yml --tags=pump
```

3、更新并重启tidb集群
```
ansible-playbook rolling_update.yml --tags=tidb
```

4、更新监控信息
```
ansible-playbook rolling_update_monitor.yml --tags=prometheus
```

#### 三、部署Drainer

1、可以在导出目录中找到 metadata 文件，其中的 Pos 字段值即全量备份的时间戳。metadata 文件示例如下：
```
Started dump at: 2019-12-30 13:25:41
SHOW MASTER STATUS:
        Log: tidb-binlog
        Pos: 413580274257362947
        GTID:

Finished dump at: 2019-12-30 13:25:41
```
2、修改tidb-ansible/inventory.ini文件
为 drainer_servers 主机组添加部署机器 IP，initial_commit_ts 请设置为获取的 initial_commit_ts，仅用于 Drainer 第一次启动
```
[drainer_servers]
drainer_tidb ansible_host=172.16.10.71 initial_commit_ts="402899541671542785"
```
3、修改配置文件
配置文件名命名规则为 别名_drainer.toml，否则部署时无法找到自定义配置文件。 但是需要注意 v3.0.0，v3.0.1 的配置文件命名规则与其余版本略有不同，为 别名_drainer-cluster.toml。

```
[syncer]
# downstream storage, equal to --dest-db-type
# Valid values are "mysql", "file", "tidb", "kafka".
db-type = "mysql"

4、部署Draniner
ansible-playbook deploy_drainer.yml

5、启动Draniner
ansible-playbook start_drainer.yml
```

## 部署回滚链路使用tiup部署TiDB Binlog

#### 1、编辑扩容文件.yaml

```
pump_server:
- host: 10.0.0.202
drainer_server:
- host: 10.0.0.201
config:
syncer.db-type: "mysql"
syncer.to.host: "10.0.0.201"
syncer.to.user: "root"
syncer.to.password: "mysql"
syncer.to.port:
```

#### 2、使用tiup对Pump和Drainer组件进行扩容

```
tiup cluster scale-out tidb-test  扩容文件.yaml  -uroot -p
```

#### 3、开启TiDB集群的binlog

```
tiup cluster edit-config 集群名
server_configs:
  tidb:
    binlog.enable: true
    binlog.lgnore-error: true
```

#### 4、使用命令来载入新的配置

```
tiup cluster reload 集群名
```

## 部署sync-diff-inspector进行数据比对

#### sync-diff-inspector的使用限制

1. 对于 MySQL 和 TiDB 之间的数据同步不支持在线校验，需要保证上下游校验的表中没有数据写入，或者保证某个范围内的数据不再变更，通过配置 range 来校验这个范围内的数据。
2. 不支持 JSON 类型的数据，在校验时需要设置 ignore-columns 忽略检查这些类型的数据。
3. FLOAT、DOUBLE 等浮点数类型在 TiDB 和 MySQL 中的实现方式不同，在计算 checksum 时会分别取 6 位和 15 位有效数字。如果不使用该特性，需要设置 ignore-columns 忽略这些列的检查。
4. 支持对不包含主键或者唯一索引的表进行校验，但是如果数据不一致，生成的用于修复的 SQL 可能无法正确修复数据。

#### sync-diff-inspector所需的数据库权限

sync-diff-inspector需要获取表结构信息，查询数据，需要的数据库权限如下：
- 上游数据库
  - SELECT（查询数据进行对比）
  - SHOW_DATABASES（查看库名）
  - RELOAD（查看表结构）
- 下游数据库
  - SELECT（查询数据进行对比）
  - SHOW_DATABASES（查看库名）
  - RELOAD（查看表结构）

#### 配置文件说明

sync-diff-inspector 的配置总共分为五个部分：
1. Global config：通用配置，包括校验的线程数量、是否输出修复SQL、是否比对数据等
2. Datasource config：配置上下游数据库实例
3. Routes：上游多表名通过正则匹配下游单表明的规则（可选）
4. Task config：配置校验哪些表，如果有的表在上下游有一定的映射关系或者有一些特殊要求，则需要对指定的表进行配置
5. Table config：对具体表的特殊配置，例如指定范围，忽略的列等等（可选）

提示：配置名后带 s 的配置项允许拥有多个配置值，因此需要使用方括号 [] 来包含配置值

```
# Diff Configuration.

######################### Global config #########################

# 检查数据的线程数量，上下游数据库的连接数会略大于该值
check-thread-count = 4

# 如果开启，若表存在不一致，则输出用于修复的 SQL 语句。
export-fix-sql = true

# 只对比表结构而不对比数据
check-struct-only = false


######################### Datasource config #########################
[data-sources]
[data-sources.mysql1] # mysql1 是该数据库实例唯一标识的自定义 id，用于下面 task.source-instances/task.target-instance 中
    host = "127.0.0.1"
    port = 3306
    user = "root"
    password = ""

    #（可选）使用映射规则来匹配上游多个分表，其中 rule1 和 rule2 在下面 Routes 配置栏中定义
    route-rules = ["rule1", "rule2"]

[data-sources.tidb0]
    host = "127.0.0.1"
    port = 4000
    user = "root"
    password = ""
    #（可选）使用 TiDB 的 snapshot 功能，如果开启的话会使用历史数据进行对比
    # snapshot = "386902609362944000"

########################### Routes ###########################
# 如果需要对比大量的不同库名或者表名的表的数据，或者用于校验上游多个分表与下游总表的数据，可以通过 table-rule 来设置映射关系
# 可以只配置 schema 或者 table 的映射关系，也可以都配置
[routes]
[routes.rule1] # rule1 是该配置的唯一标识的自定义 id，用于上面 data-sources.route-rules 中
schema-pattern = "test_*"      # 匹配数据源的库名，支持通配符 "*" 和 "?"
table-pattern = "t_*"          # 匹配数据源的表名，支持通配符 "*" 和 "?"
target-schema = "test"         # 目标库名
target-table = "t" # 目标表名

[routes.rule2]
schema-pattern = "test2_*"      # 匹配数据源的库名，支持通配符 "*" 和 "?"
table-pattern = "t2_*"          # 匹配数据源的表名，支持通配符 "*" 和 "?"
target-schema = "test2"         # 目标库名
target-table = "t2" # 目标表名

######################### Task config #########################
# 配置需要对比的*目标数据库*中的表
[task]
    # output-dir 会保存如下信息
    # 1 sql: 检查出错误后生成的修复 SQL 文件，并且一个 chunk 对应一个文件
    # 2 log: sync-diff.log 保存日志信息
    # 3 summary: summary.txt 保存总结
    # 4 checkpoint: a dir 保存断点续传信息
    output-dir = "./output"

    # 上游数据库，内容是 data-sources 声明的唯一标识 id
    source-instances = ["mysql1"]

    # 下游数据库，内容是 data-sources 声明的唯一标识 id
    target-instance = "tidb0"

    # 需要比对的下游数据库的表，每个表需要包含数据库名和表名，两者由 `.` 隔开
    # 使用 ? 来匹配任意一个字符；使用 * 来匹配任意；详细匹配规则参考 golang regexp pkg: https://github.com/google/re2/wiki/Syntax
    target-check-tables = ["schema*.table*", "!c.*", "test2.t2"]

    #（可选）对部分表的额外配置，其中 config1 在下面 Table config 配置栏中定义
    target-configs = ["config1"]

######################### Table config #########################
# 对部分表进行特殊的配置，配置的表必须包含在 task.target-check-tables 中
[table-configs.config1] # config1 是该配置的唯一标识自定义 id，用于上面 task.target-configs 中
# 目标表名称，可以使用正则来匹配多个表，但不允许存在一个表同时被多个特殊配置匹配。
target-tables = ["schema*.test*", "test2.t2"]
#（可选）指定检查的数据的范围，需要符合 sql 中 where 条件的语法
range = "age > 10 AND age < 20"
#（可选）指定用于划分 chunk 的列，如果不配置该项，sync-diff-inspector 会选取一些合适的列（主键／唯一键／索引）
index-fields = ["col1","col2"]
#（可选）忽略某些列的检查，例如 sync-diff-inspector 目前还不支持的一些类型（json，bit，blob 等），
# 或者是浮点类型数据在 TiDB 和 MySQL 中的表现可能存在差异，可以使用 ignore-columns 忽略检查这些列
ignore-columns = ["",""]
#（可选）指定划分该表的 chunk 的大小，若不指定可以删去或者将其配置为 0。
chunk-size = 0
#（可选）指定该表的 collation，若不指定可以删去或者将其配置为空字符串。
collation = ""
```

#### 一、运行sync-diff-inspector

```
./sync_diff_inspector --config=名字.toml
```

该命令最终会在 config.toml 中的 output-dir 输出目录输出本次比对的检查报告 summary.txt 和日志 sync_diff.log。在输出目录下还会生成由 config.toml 文件内容哈希值命名的文件夹，该文件夹下包括断点续传 checkpoint 结点信息以及数据存在不一致时生成的 SQL 修复数据。


#### 二、输出文件目录结构

```
output/
|-- checkpoint # 保存断点续传信息
| |-- bbfec8cc8d1f58a5800e63aa73e5 # config hash 占位文件，标识该输出目录（output/）对应的配置文件
│ |-- DO_NOT_EDIT_THIS_DIR
│ └-- sync_diff_checkpoints.pb # 断点续传信息
|
|-- fix-on-target # 保存用于修复不一致的 SQL 文件
| |-- xxx.sql
| |-- xxx.sql
| └-- xxx.sql
|
|-- summary.txt # 保存校验结果的总结
└-- sync_diff.log # 保存 sync-diff-inspector 执行过程中输出的日志信息
```

#### 三、综合结果

**日志**

sync-diff-inspector 的日志存放在 ${output}/sync_diff.log 中，其中 ${output} 是 config.toml 文件中 output-dir 的值。

**校验进度**

sync-diff-inspector 会在运行时定期（间隔 10s）输出校验进度到checkpoint中(位于 ${output}/checkpoint/sync_diff_checkpoints.pb 中，其中 ${output} 是 config.toml 文件中 output-dir 的值。

**校验结果**

当校验结束时，sync-diff-inspector 会输出一份校验报告，位于 ${output}/summary.txt 中，其中 ${output} 是 config.toml 文件中 output-dir 的值。

```
+---------------------+--------------------+----------------+
|        TABLE        | STRUCTURE EQUALITY | DATA DIFF ROWS |
+---------------------+--------------------+----------------+
| `sbtest`.`sbtest99` | true               | +97/-97        |
| `sbtest`.`sbtest96` | true               | +0/-101        |
+---------------------+--------------------+----------------+
Time Cost: 16.75370462s
Average Speed: 113.277149MB/s

TABLE：该列表示对应的数据库及表明
STRUCTURE EQUALITY：表结构是否相同
DATA DIFF ROWS：即rowAdd / rowDelete，表示该表修复需要增加/删除的行数
```

#### 四、SQL修复

校验过程中遇到不同的行，会生成修复数据的 SQL 语句。一个chunk如果出现数据不一致，就会生成一个以 chunk.Index 命名的 SQL 文件。文件位于 ${output}/fix-on-${instance} 文件夹下。其中 ${instance} 为 config.toml 中 task.target-instance 的值。

一个 SQL 文件会包含该 chunk 的所属表以及表示的范围信息。对每个修复 SQL 语句，有三种情况：

- 下游数据库缺失行，则是 REPLACE 语句
- 下游数据库冗余行，则是 DELETE 语句
- 下游数据库行部分数据不一致，则是 REPLACE 语句，但会在 SQL 文件中通过注释的方法标明不同的列

```
-- table: sbtest.sbtest99
-- range in sequence: (3690708) < (id) <= (3720581)
/*
  DIFF COLUMNS ╏   `K`   ╏                `C`                 ╏               `PAD`
╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍
  source data  ╏ 2501808 ╏ 'hello'                            ╏ 'world'
╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍
  target data  ╏ 5003616 ╏ '0709824117-9809973320-4456050422' ╏ '1714066100-7057807621-1425865505'
╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╋╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍
*/
REPLACE INTO `sbtest`.`sbtest99`(`id`,`k`,`c`,`pad`) VALUES (3700000,2501808,'hello','world');
```

## 升级总结

**相对于v3.0.8版本，v5.4.0版本性能上更加稳定，运维起来也更加方便。**

针对于这种跨版本的数据库升级，我相信它会是一种操作比较多也是比较重要的项目。在这里只是简单的介绍了方法的流程与步骤
具体的操作执行，还需要自己进行相应的测试，毕竟对于我们来说，安全、稳定更为重要。

**有几个地方是我们需要值得注意的：**

1. Dumpling导出数据之前一定要开启Pump和Drainer
2. Dumpling导出数据之前GC时间要进行调整
3. Lightning导入数据会有部分由于版本差距过大导致的不兼容问题，尽量提前测试提前进行避免
4. sync-diff-inspector数据校验，针对于不支持的列提前找出并过滤，进行手工比对
5. 记着获取原集群的用户信息导入到目标集群
6. 回滚链路只需要配置好文件在切换业务时候扩容即可
7. 需求回滚之时把原业务反向切换