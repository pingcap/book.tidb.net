---
title: TiDB Operator--K8S集群基础环境配置 - TiDB 社区技术月刊
sidebar_label: TiDB Operator--K8S集群基础环境配置
hide_title: true
description: 在通过TiDB Operator进行TiDB集群管理时，需要对K8S集群做软硬件环境的相关配置，保证TiDB集群在容器环境下发挥更好的性能，减少一些不必要的错误，保障服务的稳定性。本文将介绍 K8s 的集群基础环境配置。
keywords: [TiDB, TiDB Operator, K8s, 集群, 配置]
---

# TiDB Operator--K8S集群基础环境配置

> 作者：[lqbyz](https://tidb.net/u/lqbyz/answer)

在通过TiDB Operator进行TiDB集群管理时，需要对K8S集群做软硬件环境的相关配置，保证TiDB集群在容器环境下发挥更好的性能，减少一些不必要的错误，保障服务的稳定性。

## 软件版本要求

| 软件名称       | 版本                                |
| ---------- | --------------------------------- |
| Docker     | Docker CE 18.09.6                 |
| Kubernetes | v1.12.5+                          |
| CentOS     | CentOS 7.6，内核要求为 3.10.0-957 或之后版本 |
| Helm       | v3.0.0+                           |

## 防火墙配置

### 建议关闭防火墙

```Bash
systemctl stop firewalld
systemctl disable firewalld
```

### 若无法关闭 firewalld 服务，需打开以下端口：

#### 在Master节点上

```Bash
firewall-cmd --permanent --add-port=6443/tcp
firewall-cmd --permanent --add-port=2379-2380/tcp
firewall-cmd --permanent --add-port=10250/tcp
firewall-cmd --permanent --add-port=10251/tcp
firewall-cmd --permanent --add-port=10252/tcp
firewall-cmd --permanent --add-port=10255/tcp
firewall-cmd --permanent --add-port=8472/udp
firewall-cmd --add-masquerade --permanent

# 当需要在 Master 节点上暴露 NodePort 时候设置
firewall-cmd --permanent --add-port=30000-32767/tcp

systemctl restart firewalld
```

#### 在计算节点上

```Bash
firewall-cmd --permanent --add-port=10250/tcp
firewall-cmd --permanent --add-port=10255/tcp
firewall-cmd --permanent --add-port=8472/udp
firewall-cmd --permanent --add-port=30000-32767/tcp
firewall-cmd --add-masquerade --permanent

systemctl restart firewalld
```

## 配置 Iptables

FORWARD 链默认配置成 ACCEPT，并将其设置到开机启动脚本里：

```Bash
iptables -P FORWARD ACCEPT
```

## 禁用 SELinux

```Bash
setenforce 0
sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config
```

## 关闭 Swap

```Bash
swapoff -a
sed -i 's/^\(.*swap.*\)$/#\1/' /etc/fstab
```

## 内核参数设置

```Bash
modprobe br_netfilter

cat <<EOF >  /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-arptables = 1
net.core.somaxconn = 32768
vm.swappiness = 0
net.ipv4.tcp_syncookies = 0
net.ipv4.ip_forward = 1
fs.file-max = 1000000
fs.inotify.max_user_watches = 1048576
fs.inotify.max_user_instances = 1024
net.ipv4.conf.all.rp_filter = 1
net.ipv4.neigh.default.gc_thresh1 = 80000
net.ipv4.neigh.default.gc_thresh2 = 90000
net.ipv4.neigh.default.gc_thresh3 = 100000
EOF

sysctl --system
```

## 配置 Irqbalance 服务

[Irqbalance](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/performance_tuning_guide/sect-red_hat_enterprise_linux-performance_tuning_guide-tool_reference-irqbalance) 服务可以将各个设备对应的中断号分别绑定到不同的 CPU 上，以防止所有中断请求都落在同一个 CPU 上而引发性能瓶颈。

```Bash
systemctl enable irqbalance
systemctl start irqbalance
```

## CPUfreq 调节器模式设置

为了让 CPU 发挥最大性能，请将 CPUfreq 调节器模式设置为 performance 模式。详细参考[在部署目标机器上配置 CPUfreq 调节器模式](https://docs.pingcap.com/zh/tidb/stable/check-before-deployment#%E6%A3%80%E6%9F%A5%E5%92%8C%E9%85%8D%E7%BD%AE%E6%93%8D%E4%BD%9C%E7%B3%BB%E7%BB%9F%E4%BC%98%E5%8C%96%E5%8F%82%E6%95%B0)。

```Bash
cpupower frequency-set --governor performance
```

## Ulimit 设置

```Bash
cat <<EOF >>  /etc/security/limits.conf
root        soft        nofile        1048576
root        hard        nofile        1048576
root        soft        stack         10240
EOF

sysctl --system
```

## Docker 服务

### Docker 的数据目录设置，`--data-root`*通过来设置*

```Bash
cat > /etc/docker/daemon.json <<EOF
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m"
  },
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ],
  "data-root": "/data1/docker"
}
EOF
```

### 设置 Docker daemon 的 ulimit。

- 创建 docker service 的 systemd drop-in 目录 `/etc/systemd/system/docker.service.d`：

```Bash
mkdir -p /etc/systemd/system/docker.service.d
```

- 创建 `/etc/systemd/system/docker.service.d/limit-nofile.conf` 文件，并配置 `LimitNOFILE` 参数的值，取值范围为大于等于 `1048576` 的数字即可

```Bash
cat > /etc/systemd/system/docker.service.d/limit-nofile.conf <<EOF
[Service]
LimitNOFILE=1048576
EOF
```

- 重新加载配置

```Bash
systemctl daemon-reload && systemctl restart docker
```

## Kubernetes 服务

### 修改kubelet的数据目录

```Bash
echo "KUBELET_EXTRA_ARGS=--root-dir=/data1/kubelet" > /etc/sysconfig/kubelet
systemctl restart kubelet
```

### 通过 kubelet 设置[预留资源](https://kubernetes.io/docs/tasks/administer-cluster/reserve-compute-resources/)。

保证机器上的系统进程以及 Kubernetes 的核心进程在工作负载很高的情况下仍然有足够的资源来运行，从而保证整个系统的稳定。

```Bash
--system-reserved=cpu=200m,memory=1Gi,ephemeral-storage=5Gi \
--eviction-hard=memory.available<2Gi,nodefs.available<1Gi,imagefs.available<1Gi \
--eviction-minimum-reclaim=memory.available=1Gi,nodefs.available=500Mi,imagefs.available=1Gi \
--node-status-update-frequency=10s --eviction-pressure-transition-period=30s"
```

## TiDB 集群资源需求

请根据[服务器建议配置](https://docs.pingcap.com/zh/tidb/stable/hardware-and-software-requirements#%E7%94%9F%E4%BA%A7%E7%8E%AF%E5%A2%83)来规划机器的配置。

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1675304790905.png)

## TiDB存储类型推荐

### TiKV存储推荐

TiKV 自身借助 Raft 实现了数据复制，出现节点故障后，PD 会自动进行数据调度补齐缺失的数据副本，同时 TiKV 要求存储有较低的读写延迟，所以生产环境强烈推荐使用**本地 SSD 存**储。

### PD存储推荐

PD 同样借助 Raft 实现了数据复制，但作为存储集群元信息的数据库，并不是 IO 密集型应用，所以**一般本地普通 SAS 盘或网络 SSD 存储**（例如 AWS 上 gp2 类型的 EBS 存储卷，GCP 上的持久化 SSD 盘）就可以满足要求。

### 监控和其他组件

监控组件以及 TiDB Binlog、备份等工具，由于自身没有做多副本冗余，所以为保证可用性，**推荐用网络存储**。其中 TiDB Binlog 的 pump 和 drainer 组件属于 IO 密集型应用，需要较低的读写延迟，所以推荐用高性能的网络存储（例如 AWS 上的 io1 类型的 EBS 存储卷，GCP 上的持久化 SSD 盘）。

在利用 TiDB Operator 部署 TiDB 集群或者备份工具的时候，需要持久化存储的组件都可以通过 values.yaml 配置文件中对应的 `storageClassName` 设置存储类型。不设置时默认都使用 `local-storage`。