---
title: TiDB 6.0 离线包变更
hide_title: true
---

# TiDB 6.0 离线包变更

> 作者：[ShawnYan](https://tidb.net/u/ShawnYan/post/all), DBA, TiDB Fans.

## 背景

TiDB 6.0 已发版一月有余，相信很多 TiDBer 已经对新版本做了升级测试。对于初装或者升级，都离不开安装介质。而针对数据库这种对信息安全要求级别很高的软件系统，绝大部分场景都应该部署在私有云环境，或者说是内网环境中。那么如何能够顺利、快速地在离线状态下进行安装也是很重要的，伴随着 TiDB 6.0 的发版，离线包也发生了一些变化。本文将对 TiDB 6.0 离线安装包的变更进行分析，希望对读者在准备离线部署时有所提示或帮助。

## 离线包变更

先来看下官方文档对 [离线包变更](https://docs.pingcap.com/zh/tidb/v6.0/release-6.0.0-dmr#%E7%A6%BB%E7%BA%BF%E5%8C%85%E5%8F%98%E6%9B%B4) 的表述：

> 离线包变更
>
> TiDB 提供两个离线包下载：v6.0.0 TiDB-community-server 软件包和 v6.0.0 TiDB-community-toolkit 软件包。
>
> 在 6.0.0-DMR 版本中，两个离线包的内容物做了一些调整。

接下来，将对 TiDB v6.0 和 v5.4 的离线包进行比对，并具体分析新版本都做了哪些调整。

### 离线包的内容物

分别下载 TiDB v6.0 和 v5.4 两个版本的离线包，共 4 个压缩包。

- [tidb-community-server-v6.0.0-linux-amd64.tar.gz](https://download.pingcap.org/tidb-community-server-v6.0.0-linux-amd64.tar.gz)
- [tidb-community-toolkit-v6.0.0-linux-amd64.tar.gz](https://download.pingcap.org/tidb-community-toolkit-v6.0.0-linux-amd64.tar.gz)
- [tidb-community-server-v5.4.0-linux-amd64.tar.gz](https://download.pingcap.org/tidb-community-server-v5.4.0-linux-amd64.tar.gz)
- [tidb-community-toolkit-v5.4.0-linux-amd64.tar.gz](https://download.pingcap.org/tidb-community-toolkit-v5.4.0-linux-amd64.tar.gz)

下载链接可从 [社区版软件包](https://pingcap.com/zh/product-community/) 页面获取。将这四个压缩包分别解压，并查看解压后的文件。

```
for i in `ls tidb-*`; do tar zxf $i; done
ls tidb-*
```

汇总成如下表格。从表格中可以看出新版本的离线包内容物做了明显调整。分别从 server, toolkit 两个方面展开讲。

![1.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1-1652250982476.jpg)

### `tidb-community-server-{version}-linux-amd64.tar.gz` 的变化

除常规的组件版本升级之外，有三点主要的变化：

1. 从表格里可以看出，原先 `tidb-community-server-v5.4.0` 里的工具，已全部移动到了 `tidb-community-toolkit-v6.0.0`，只保留基础核心组件。
2. 组件 `diag` 的版本号从 v0.5.1 升级到 v0.7.0，超越了其他组件的版本号升级幅度。
3. 较 v5.4.0 而言，v6.0.0 的离线包中移除了3个组件，`client`, `server` 和 `pushgateway`。

#### diag

我们知道，TiDB v6.0 新增了 Clinic 诊断服务，而 diag 是该诊断服务的重要组件，负责收集、汇总整个集群的诊断数据，同时可以将诊断数据上报到 Clinic Server，以供技术支持人员远程定位问题。

但由于 diag 目前尚未开源，具体变更不得而知，但我们有理由相信，diag 是为了更好地配合 clinic 的发布而进行了大版本升级。这从 diag 的具体命令和使用方式上可窥视一般。

比较两个版本的 diag 命令，可以看到移除了一个命令 `download`，新增了一个命令 `config`。

```
diag help
< download    download file
> config      set an individual value in diag configuration file
```

`diag config` 用于配置上传数据到 Clinic Server 的 Access Token。获取方式和配置方式请参考[官方文档](https://docs.pingcap.com/zh/tidb/dev/quick-start-with-clinic#%E5%87%86%E5%A4%87%E5%B7%A5%E4%BD%9C)。

> 使用 Diag 上传数据时，你需要通过 Token 进行用户认证，以保证数据上传到组织后被安全地隔离。获取一个 Token 后，你可以重复使用该 Token。Token 只用于上传数据。

在命令行中，对 diag 配置 Token：

```
shawnyan@centos7:~$ tiup diag config clinic.token eyJ***
tiup is checking updates for component diag ...
Starting component `diag`: /home/shawnyan/.tiup/components/diag/v0.7.0/diag /home/shawnyan/.tiup/components/diag/v0.7.0/diag config clinic.token eyJ***
shawnyan@centos7:~$
```

由于篇幅有限，diag 后接命令的详细参数这里就不展开讲解了，感兴趣的读者可以自行比对。

此外，用于收集操作系统和硬件信息的 `insight` 工具也已并入 `diag` 包，便于 Clinic 收集集群节点信息，并输出到 `insight.json` 文件中。

```
tiup diag collect shawnyan-cluster --include="system"
```

#### 移除 `client`, `server` 和 `pushgateway`

- client-v1.9.0-linux-amd64.tar.gz

`tiup client` 用于连接 TiDB，移除后建议用户使用 mysql client。

- server-v1.9.0-linux-amd64.tar.gz

`tiup server` 用于搭建私有仓库，已在之前的文章 [TiUP：TiDBAer 必备利器](https://tidb.net/blog/a0d37d88) 中详细介绍过，这里不再赘述。

但是，个人认为这个组件应该保留在离线包中，因为内网环境下，需要使用 `server` 来搭建内部镜像站，已提 [Issue#1876](https://github.com/pingcap/tiup/issues/1876)，期待这个组件可以回归。

- pushgateway-v0.7.0-linux-amd64.tar.gz

pushgateway 作为独立组件一直保留，但是对于 Grafana 监控系统而言，[从 TiDB 2.1.3 版本开始，去掉了 Pushgateway 这个单点组件](https://docs.pingcap.com/zh/tidb/v6.0/grafana-monitor-best-practices#%E7%9B%91%E6%8E%A7%E6%9E%B6%E6%9E%84)。故在 TiDB v6.0 中彻底将其移除可以理解。

### `tidb-community-toolkit-{version}-linux-amd64.tar.gz` 的变化

在 v5.4 版本的包中，只有 7 个可执行的二进制文件，而在 v6.0 中就非常丰富了，除了从 `tidb-community-server` 包中转移过来的工具，还发生了一些新的变化。

![2.jpg](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/2-1652251043215.jpg)

主要体现在，新增了 `binlogctl`, `etcdctl` 和 `mydumper`。

`binlogctl` 和 `etcdctl` 是 server 包里 `ctl` (`ctl-v6.0.0-linux-amd64.tar.gz`) 组件里的两个可执行文件，这次更新是将这两个文件单独放置到 toolkit 包中，以配合 TiDB Binlog 和 PD Recover 工具一同使用。

同样的，TiDB 适配版的 `mydumper` 放到 toolkit 包中，是为了配合 TiDB Lighting 进行数据备份。

## 总结

TiDB v6.0 离线包的调整，是 TiDB 可管理性增强的具体体现。对于工具组件包的存储、使用也更加便利、直观。这也是私有云数据库的诉求之一。私有云数据库在云数据库时代占有举足轻重的地位，完备的离线安装包可以助力我们快速、高效地在内网环境下搭建数据库集群。相信 TiDB 在后续的版本中会持续加强离线包，并带来更加稳定、强劲的企业级 HTAP 数据库。

## 参考资料

- [TiDB 社区版软件包](https://pingcap.com/zh/product-community/)
- [PingCAP Clinic 诊断服务简介](https://docs.pingcap.com/zh/tidb/dev/clinic-introduction)
- [TiUP: TiDBAer 必备利器](https://tidb.net/blog/a0d37d88)
- [mydumper & dumpling 知识点汇总](https://tidb.net/blog/6d3a8da2)
