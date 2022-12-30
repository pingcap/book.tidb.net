---
title: 从TiDB搭建到监控闭环 - TiDB 社区技术月刊
sidebar_label: 从TiDB搭建到监控闭环
hide_title: true
description: 本文将分享使用 TiDB 过程中遇到的一些小问题以及解决方案，从安装配置、使用、后期监控维护等维度展开。
keywords: [TiDB, 监控闭环, 安装配置]
---

# 从TiDB搭建到监控闭环

> 作者：[xie123](https://tidb.net/u/xie123/answer)

## 背景

使用`TiDB`已经有一段时间了，也陆陆续续遇到了一些问题。有些小问题用着用着才发现，部分需要集群维护重启才能修改，部分只能拓扑文件安装时修改，当然也可以临时修改，不过重启失效，容易遗忘反复出现比较麻烦。计划从头梳理一下，希望对自己和大家从安装配置、使用、后期监控维护有一定帮助。

## 安装

### **1、版本选择**

我们集群目前安装的版本为 `TiDB` v5.4.0 和v5.4.1，操作系统为`debian10`和`Ubuntu 18.04.6 LTS` 。可以先根据 [TiDB 数据库快速上手指南](https://docs.pingcap.com/zh/tidb/stable/quick-start-with-tidb) 选择对应版本单机部署体验一下，在满足功能的基础上对比操作系统要求 [TiDB 软件和硬件环境建议配置](https://docs.pingcap.com/zh/tidb/stable/hardware-and-software-requirements)

### **2、集群拓扑规划**

必备组件：`PD`、`TiDB`、`TiKV`

可选组件：`TiFlash`、`TiCDC`、`TiSpark`、`Monitoring & Grafana` 、`TiDB Binlog`

相关组件功能就不介绍了，具体可以看官网，根据功能规划拓扑。我们线上集群架构如下，三台物理服务器，所有实例部署目录`/home/tidb/tidb-deploy` ，数据存储单独挂`SSD`盘。

| 实例                     | 个数 | IP                         | 数据存储目录           | 配置          |
| ---------------------- | -- | -------------------------- | ---------------- | ----------- |
| `TiDB`                 | 3  | 10.0.1.1 10.0.1.2 10.0.1.3 | 无                | 默认端口 全局目录配置 |
| `PD`                   | 3  | 10.0.1.1 10.0.1.2 10.0.1.3 | 1块 1.8T `SSD`    | 默认端口 全局目录配置 |
| `TiKV`                 | 3  | 10.0.1.1 10.0.1.2 10.0.1.3 | 1块 1.8T `SSD`    | 默认端口 全局目录配置 |
| `TiFlash`              | 1  | 10.0.1.4                   | 1块 1.8T `SSD`    | 默认端口 全局目录配置 |
| `Monitoring & Grafana` | 1  | 10.0.1.4                   | `TiFlash`共用`SSD` | 默认端口 全局目录配置 |

### **3、配置安装**

安装其实挺简单的，几条命令执行就能安装成功，主要是相关环境检查和配置文件配置规划，v6.1版本还有 [TiUniManager](https://docs.pingcap.com/zh/tidb/stable/tiunimanager-overview) 界面一键安装管理，目前还未测试过，这个后续也会调研使用下

1）软件环境检查

2）安装`TiUP`，生成拓扑文件

3）修改拓扑配置`topology.yaml` 并使用`TiUP`一键检查配置安装

该部分比较重要，刚开始我们基本都是按照默认的，只填了对应`ip` 、`data dir` 、`deploy dir`，现在根据维护过程中发现的一些小问题，进行添加修改。更多配置可参考 [通过 TiUP 部署 TiDB 集群的拓扑文件配置](https://docs.pingcap.com/zh/tidb/v5.4/tiup-cluster-topology-reference#pd_servers)

ps：`topology.yaml`所有需要填的 `host`尽量都填内网`ip`

- `PD` **监听端口**
- 在有内外网的情况下，如果`host`填对应主机名，默认组件会监听0.0.0.0，内外网都可访问，但是`etcd`有安全漏洞，若不对外网暴露，需要在配置`PD`部分加`listen_host`为内网`ip` ，或者`host` 填内网`ip`

```
pd_servers:
  # # The ip address of the PD Server.
  - host: xx.xx.xx.xx
    listen_host: xx.xx.xx.xx
```

- **单条**`sql`**查询内存限制**
- 单条 `sql` 语句可以占用的最大内存阈值，单位为字节。默认1G，我们业务压测时有部分`sql`会超出内存限制，跑不出结果，`mem-quota-query`设置为10G

```
server_configs:
  tidb:
    mem-quota-query: 10737418240
```

- `TiDB` **日志保留周期**
- `TiDB` 、`TiKV` 、`PD`，均有如下日志保留周期设置，可根据需要添加

```
# log.file.xx
# max-days
# 日志最大保留的天数。
# 默认值：0
# 默认不清理；如果设置了参数值，在 max-days 之后 TiDB 会清理过期的日志文件。
# max-backups
# 保留的日志的最大数量。
# 默认值：0
# 默认全部保存；如果设置为 7，会最多保留 7 个老的日志文件。
tidb_servers:
 - host: xx.xx.xx.xx
   config:
     log.file.max-days: 7
     log.file.max-backups: 7
```

**混合部署（可选）**

下面配置适合混合部署，机器资源不够时给予各个实例CPU、内存等方面限制。目前我们机器资源还有剩余，后续也会考虑扩容复用，所以也提前配置了部分。

- `label`**调度**
- 对于单机部署多实例`TiKV` ，避免物理机宕机导致3副本中2副本丢失，导致集群不可用问题，以通过 `label` 来实现 `PD` 智能调度，保证同台机器的多 `TiKV` 实例不会出现 `Region Group` 只有 2 副本的情况。

`TiKV` 配置相同物理机配置相同的 `host` 级别 `labe`l 信息：

```
tikv_servers:
  - host: xx.xx.xx.xx
    config:
      server.labels:
        host: tikv3
```

`PD` 需要配置 `labels` 类型来识别并调度 `Region` :

```
server_configs:
  pd:
    replication.location-labels: ["host"]
```

- `TiKV 内存` **读缓存大小**
- `storage CF` (`all RocksDB column families`) 内存，默认`storage.block-cache.shared: true`，`block-cache` 设置为机器总内存的 45%，多个`TiKV`实例会造成机器内存不足，可设置单个实例读缓存大小，我们是设置30G，具体根据实际修改

```
# storage.block-cache.capacity = (MEM_TOTAL * 0.5 / TiKV 实例数量)
server_configs:
  tikv:
    storage.block-cache.capacity: 32212254720
```

- `TiKV CPU`**大小**

`TiKV` 的读取请求分为两类：

1）一类是指定查询某一行或者某几行的简单查询，这类查询会运行在 Storage Read Pool 中

2）另一类是复杂的聚合计算、范围查询，这类请求会运行在 Coprocessor Read Pool 中

从 `TiKV` 5.0 版本起，默认所有的读取请求都通过统一的线程池进行查询

```
readpool.storage.use-unified-pool: true
readpool.coprocessor.use-unified-pool: true
```

混合部署时，该值最好通过绑核分离，再加上此处限制

```
# readpool.unified.max-thread-count = cores * 0.8 / TiKV 数量
server_configs:
  tikv:
    readpool.storage.use-unified-pool: true
    readpool.coprocessor.use-unified-pool: true
    readpool.unified.max-thread-count: 20
```

- `numa_node` **绑核**
- `numa` 绑核使用前，确认已经安装 `numactl` 工具，以及物理机对应的物理机 `cpu` 的信息后，再进行参数配置；`PD`、`TiDB`、`TiKV` 可以运用绑核，根据实际情况绑定`cpu`，我们机器只有两个`cpu`（0、1）

```
pd_servers:
  - host: xx.xx.xx.xx
    numa_node: "0,1"
```

**其他限制（仅了解，尽量不设置）**

目前资源方面，我们只对`TiKV` 读缓存使用内存大小以及`readpool cpu` 有所限制，其他像`TiDB`这些组件实例也有相关资源限制，达到限制会导致正在执行的`sql`语句强制终止，影响使用，所以并未应用生产

- `TiDB`**内存限制**
- 当 `tidb-server` 实例内存使用到达 32 GB 时，正在执行的 `SQL` 语句会被随机强制终止，直至 `tidb-server` 实例内存使用下降到 32 GB 以下。被强制终止的 `SQL` 操作会向客户端返回 `Out Of Global Memory Limit!` 错误信息。

```
# 默认值为 0，表示无内存限制。
# 目前为实验性特性，不建议在生产环境中使用
[performance]
server-memory-quota = 34359738368
```

- `resource_control`：运行时资源控制，该字段下所有配置都将写入 `systemd` 的 `service` 文件中，默认无限制。支持控制的资源如下：

  - `memory_limit`: 限制运行时最大内存，例如 `"2G"` 表示最多使用 2GB 内存
  - `cpu_quota`：限制运行时最大 CPU 占用率，例如 `"200%"`
  - `io_read_bandwidth_max`：读磁盘 I/O 的最大带宽，例如：`"/dev/disk/by-path/pci-0000:00:1f.2-scsi-0:0:0:0 100M"`
  - `io_write_bandwidth_max`：写磁盘 I/O 的最大带宽，例如：`"/dev/disk/by-path/pci-0000:00:1f.2-scsi-0:0:0:0 100M"`
  - `limit_core`：控制 `core dump` 的大小

**监控告警（可选）**

监控方面，默认是采用`Prometheus` 、`Grafana` 、`Alertmanager` 这一套，架构图如下。通过`TiUP` 部署，会自动部署监控报警系统，当然也可以手动部署，不过默认部署的监控会有对应组件机器的告警规则，dashboard等，很方便且能快速使用，但是也有限制，对部分告警规则自定义，需另外配置，否则重启会覆盖修改的配置。

只需要填`Prometheus` 、`Grafana`、`Alertmanager`地址就行，但是如果需要实现告警邮件发送到对应邮箱还需要进行单独配置

```
monitoring_servers:
 - host: xx.xx.xxx.xx

grafana_servers:
  - host: xx.xx.xxx.xx
  
alertmanager_servers:
  - host: xx.xx.xxx.xx
    # 字段指定一个本地文件，该文件会在集群配置初始化阶段被传输到目标机器上，作为 Alertmanager 的配置
    config_file: /local/config/alertmanager.yml
```

`alertmanager.yml`

```
global:
  smtp_smarthost: "xxx:465"
  smtp_from: "xxx"
  smtp_auth_username: "xxx"
  smtp_auth_password: "xxx"
  smtp_require_tls: false
route:
  receiver: "Ops"
  group_by: ["env", "job", "xx"]
  group_wait: 60s
  group_interval: 10m
  repeat_interval: 300m
  routes:
receivers:
  - name: "Ops"
    email_configs:
    - send_resolved: true #是否通知警报被解决，即 Alert 消失也发邮件
      to: 'xxx' #收件人
      headers: { Subject: " 【TiDB监控告警】 {{ .CommonLabels.alertname }} " }
```

### 4、功能验证

## 拓展

### 1、`HAproxy` 实践

通过上述配置安装后，一个已经可以用的`TiDB` 集群已经可以使用了

```
mysql -u root -h ${tidb_server_host_IP_address} -P 4000
```

但是我们有3个`TiDB Server` ，可通过`HAproxy` 实现 `TiDB Server` 层的负载均衡

`HAproxy` 以及`keepalived`高可用等安装配置步骤可以自行配置，如下为官网提供配置

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
   stats socket /var/lib/haproxy/stats     # 统计信息保存位置。

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
   bind 0.0.0.0:3390                       # 浮动 IP 和 监听端口。
   mode tcp                                # HAProxy 要使用第 4 层的传输层。
   balance leastconn                       # 连接数最少的服务器优先接收连接。`leastconn` 建议用于长会话服务，例如 LDAP、SQL、TSE 等，而不是短会话协议，如 HTTP。该算法是动态的，对于启动慢的服务器，服务器权重会在运行中作调整。
   server tidb-1 10.9.18.229:4000 check inter 2000 rise 2 fall 3       # 检测 4000 端口，检测频率为每 2000 毫秒一次。如果 2 次检测为成功，则认为服务器可用；如果 3 次检测为失败，则认为服务器不可用。
   server tidb-2 10.9.39.208:4000 check inter 2000 rise 2 fall 3
   server tidb-3 10.9.64.166:4000 check inter 2000 rise 2 fall 3
```

**空闲超时**

默认官方空闲超时设置非交互式连接无限制，交互式连接超时8小时，在官方提供这个`HAproxy`配置超时 30000s >8h

在实际生产环境中，空闲连接和一直无限执行的 SQL 对数据库和应用都有不好的影响。空闲连接超时我们通过统一入口`HAproxy`配置为半小时，当然也可根据系统参数修改`TiDB`层的超时

交互式连接的`wait_timeout` 继承于`global`的`interactive_timeout`（默认8小时）

非交互式连接的`wait_timeout`继承于`global`的`wait_timeout` （默认0，无限制）

**SQL执行超时**

`TiDB` 提供 `max_execution_time`控制与 Java 应用连接中 SQL 执行的超时时间，即控制 TiDB 与 Java 应用的连接最长忙多久。默认值是 `0`，即默认无限忙碌（一个 SQL 语句执行无限的长的时间），可根据实际情况设置

### 2、监控排查&&整合

**1.**`Grafana` **图表 && 告警规则**

`Grafana` 通过配置方式，在部署目录`provisioning` 分别定义了固定的`dashboards`和`datasources`，我们可以不配置任何东西就有对应集群图表展示。在界面可以根据文件夹名区分不同分组的图表归属，排查对应组件问题。

说实话`TiDB`监控告警规则和告警已经很完善了，对应告警规则也有排查方法，已经满足使用。在`Grafana Alerting` 界面也可看到已经定义的告警规则及告警状态。当我们收到对应邮件告警可根据 [TiDB 集群报警规则](https://docs.pingcap.com/zh/tidb/v5.4/alert-rules) 确定告警级别、告警详情以及处理方法。随着遇到的一些问题，也可以修改一些监控图表和告警指标，单独展示一些重点指标。

**2.日志告警**

之前有遇到一个问题，默认告警策略并未有异常，后续通过`TiDB`日志发现大量警告和错误，正好我们有一套日志告警监控，于是把`TiDB`日志也接入了告警，并根据出现的警告和错误，一一排查，屏蔽可忽略告警，以下列了一些常见告警或警告。

- 忽略不支持的事务隔离级别告警

```
[error="[variable:8048]The isolation level 'READ-UNCOMMITTED' is not supported. Set tidb_skip_isolation_level_check=1 to skip this error"
```

- 修改`tidb_analyze_version`版本，解决内存不断上涨的问题

```
#当 tidb_analyze_version = 2 时，如果执行 ANALYZE 语句后发生 OOM，请设置全局变量 tidb_analyze_version = 1
1、set global tidb_analyze_version = 1; //使用v1版本的 analyze
2、执行以下sql产生的语句 select distinct(concat('DROP STATS ',table_schema, '.', table_name,';')) from information_schema.tables, mysql.stats_histograms where stats_ver = 2 and table_id = tidb_table_id ;
3、步骤二产生的语句全部执行完后，确认stats_ver = 2以下语句没有内容 select distinct(concat(table_schema, '.', table_name)) from information_schema.tables, mysql.stats_histograms where stats_ver = 2 and table_id = tidb_table_id ;
4、重启tidb-server
```

- `get timestamp too slow`

取时间戳是从 `TiDB Server` 向 `PD Server` 批量获取 `TSO` 时间戳，实际消耗主要是在网络层，网络的延迟导致这个操作慢的情况。另外 `PD Server` 系统负载高，`PD` 的 `Goroutin` 调度过程中会有瓶颈。其次就是`TiDB Server` 在进行 `SQL Parse` 或者 `build SQL Plan` 时间较长，会导致获取的时间戳不使用的情况。取`ts`和 `QL Parse` 和 `Build Plan` 是并行的，总时间会取决于慢的那一个，一般情况是因为获取时间戳慢，也有上述情况导致的慢，在监控中变现就是 `“Get Timestamp too slow”`。如果在运维过程中发现 `TiDB`日志中出现大量`“Get Timestamp too slow”`的报错，需要关注以下监控：

```
通过 “PD Client CMD Duration” 中 “99-tso-aync-wait” ,SQL Parse 和 SQL Compile 对延迟的影响情况。
通过 “PD TSO Wait Duration”，可以监控到 TiDB Server Function Request to Feedback 延迟收到网络的影响。
通过 “PD TSO RPC Duration” 可以直观监控的网络的延迟时间，PD 处理慢这个可能性存，但较小。
```

- `expensive query`

`TiDB` 在执行 `SQL` 时，预估出来每个 `operator` 处理了超过 `10000` 条数据就认为这条 `query`是 `expensive query`。可以通过修改 `tidb-server` 配置参数来对这个门限值进行调整，调整后需要重新启动 `tidb-server`。如果创建用户、授权`ddl`是`expensive_query`那么集群有问题了，可以监控设置`expensive`查询有多少就报错

- `Client without Auth Plugin support; Please upgrade client`

客户端的问题：<https://github.com/pingcap/tidb/issues/29725>

- `Specified key was too long; max key length is 3072 bytes`

```
max-index-length
	用于设置新建索引的长度限制。
	默认值：3072
	单位：Byte
	目前的合法值范围 [3072, 3072*4]。MySQL 和 TiDB v3.0.11 之前版本（不包含 v3.0.11）没有此配置项，不过都对新建索引的长度做了限制。MySQL 对此的长度限制为 3072，TiDB 在 v3.0.7 以及之前版本该值为 3072*4，在 v3.0.7 之后版本（包含 v3.0.8、v3.0.9 和 v3.0.10）的该值为 3072。为了与 MySQL 和 TiDB 之前版本的兼容，添加了此配置项。
```

- `function READ ONLY has only noop implementation in tidb now, use tidb_enable_noop_functions to enable these functions`

`tidb_enable_noop_functions` 从 v4.0 版本开始引入，参数不改，观察日志告警反馈业务方

```
作用域：SESSION | GLOBAL
是否持久化到集群：是
默认值：OFF
默认情况下，用户尝试将某些语法用于尚未实现的功能时，TiDB 会报错。若将该变量值设为 ON，TiDB 则自动忽略此类功能不可用的情况，即不会报错。若用户无法更改 SQL 代码，可考虑将变量值设为 ON。
启用 noop 函数可以控制以下行为：
	LOCK IN SHARE MODE 语法
	SQL_CALC_FOUND_ROWS 语法
	START TRANSACTION READ ONLY 和 SET TRANSACTION READ ONLY 语法
	tx_read_only、transaction_read_only、offline_mode、super_read_only、read_only 以及 sql_auto_is_null 系统变量
	GROUP BY ASC|DESC 语法
```

**3.整合统一**

目前我们有3个`TiDB` 集群，根据官方默认安装监控，一共有3套`Grafana` 、`Prometheus` 、`Alertmanager`，一方面是资源浪费，而且自带的告警规则修改还需另外配置，不然`reload`会被覆盖，还需要修改几个集群。另一方面是维护多个界面后台服务很繁琐，于是想统一一个`Grafana`展示监控图表、统一查询入口，一个`Prometheus` 维护监控指标 ，一个`Alertmanager` 提供邮件告警。具体方案也在社区和网络上找了很多，网上方案 [使用 Prometheus + Grafana 打造 TiDB 监控整合方案](https://blog.csdn.net/TiDB_PingCAP/article/details/117654071) 和我们需求基本满足。

为了改动较小，且新增集群也可快速适配，我们选择这套监控搭建在容器上，保留`TiDB`自动部署监控的`exportor` 的数据采集接口，对原有的`Prometheus`数据拉取任务、告警配置修改。新增集群只需要默认安装`Prothemes` ，再配置拉取任务就可实现监控告警，并且对告警添加解决方案链接，可以实现快速定位。

- `Prometheus`**数据pull适配**

拷贝任一集群原有`prometheus conf`配置目录，修改`prometheus.yml`，修改部分注释已标注

```
---
global:
  scrape_interval:     15s # By default, scrape targets every 15 seconds.
  evaluation_interval: 15s # By default, scrape targets every 15 seconds.
  external_labels:
    monitor: "prometheus"
    
rule_files:
  - 'node.rules.yml'
  - 'blacker.rules.yml'
  - 'bypass.rules.yml'
  - 'pd.rules.yml'
  - 'tidb.rules.yml'
  - 'tikv.rules.yml'
  - 'tikv.accelerate.rules.yml'
  - 'tiflash.rules.yml'

alerting:
  alertmanagers:
  - static_configs:
    - targets:
    # 修改为容器alertmanager
      - 'xx.xx.xx.xx:9093'

# 修改所有job
scrape_configs:
  - job_name: "overwritten-nodes"
    honor_labels: true # don't overwrite job & instance labels
    static_configs:
    # targets新增其他集群ip和端口
    - targets:
      - '集群1 node:9100'
      - '集群2 node:9100'
      - '集群3 node:9100'
    # relabel_configs匹配ip，根据tidb_cluster重定义，区分不同集群label
    relabel_configs:
      - source_labels: [ '__address__' ]
        regex: '集群1 node1:(.*)|集群1 node2:(.*)'
        target_label: 'tidb_cluster'
        replacement: '集群1'
      - source_labels: [ '__address__' ]
        regex: '集群2 node1:(.*)|集群2 node2:(.*)'
        target_label: 'tidb_cluster'
        replacement: '集群2'
      - source_labels: [ '__address__' ]
        regex: '集群3 node1:(.*)|集群3 node2:(.*)'
        target_label: 'tidb_cluster'
        replacement: '集群3'
```

- `Prometheus`**告警规则适配**

对上述提供的`rule_files`告警规则文件，批量修改，以如下一个告警规则为例

```
  - alert: TiDB_memory_abnormal
    expr: go_memstats_heap_inuse_bytes{job="tidb"} > 3.2e+10
    for: 3m
    labels:
      # 该标签保留，自定义
      env: xxx
      # 新增resolve_step，该url指向对应告警规则详情，包括解决方法，这个可以慢慢完善
      resolve_step: https://xxxx/TiDB_memory_abnormal
      level: warning
      expr: go_memstats_heap_inuse_bytes{job="tidb"} > 3.2e+10
    annotations:
      # 新增或修改 cluster: {{ $labels.tidb_cluster }}
      description: 'cluster: {{ $labels.tidb_cluster }}, instance: {{ $labels.instance }}, values:{{ $value }}'
      value: '{{ $value }}'
      summary: TiDB heap memory usage is over 32 GB
```

- `Grafana`**展示适配**

拷贝原有集群 `provisioning/dashboards`目录内容，批量修改`json` 文件`datasource` 、集群区分变量、`uid`

```
# datasource 修改为同一个
sed -i '/datasource/ s/tidb-test/tidb-all/g' *

# 修改集群区分变量
# "query": "label_values(pd_scheduler_store_status{tidb_cluster=\"tidb-test\"}, store)",
sed -i 's#\$tidb_cluster#tidb-test#g' *

# 默认tidb安装uid一样的，需要设置为不一样
for line in `grep uid ./ -r --color|awk '{print $NF}'|sed 's/\"//g'|sed 's/,//g'`;do sed -i "s/$line/${line}_change1/g" ./*;done
```

目录结构如下

```
.
├── dashboard_集群1
│   ├── overview.json
│   ├── pd.json
├── dashboard_machine
│   ├── blackbox_exporter.json
│   ├── disk_performance.json
│   └── node.json
├── dashboard_集群2
│   ├── tikv_summary.json
│   └── tikv_trouble_shooting.json
└── dashboard_集群3
    ├── tidb_runtime.json
    ├── tidb_summary.json
    ├── tiflash_proxy_details.json
```

`datasource`配置，统一为一个

```
apiVersion: 1
datasources:
  - name: tidb-all
    type: prometheus
    access: proxy
    url: http://prometheus_ip:9090
    withCredentials: false
    isDefault: false
    tlsAuth: false
    tlsAuthWithCACert: false
    version: 1
    editable: true
```

- `Alertmanager`**配置**

延续原有配置，为减少报警，修改分组和告警频率

```
route:
  receiver: "Ops"
  group_by: ["env", "job", "tidb_cluster"]
  group_wait: 60s
  group_interval: 10m
  repeat_interval: 300m
```

- 自定义`dashboard`和告警

对于一些重点关注图表和告警规则，可通过`Grafana`单独配置告，单独告警走`Grafana`邮件

### 3、配置修改方式

目前的状态也是在问题中不断完善使用方式，优化配置，因此也整理了`TiDB`配置参数的几种修改方式，以及对应参数查找未知，记录一些临时修改的参数

**1.配置文件修改（永久）**

这部分修改肯定是永久保留的，但是需要重启服务更新维护，在业务运行时需要评估影响，且有部分是只能安装是指定，指定后就不能修改了，最好安装时就配置，具体可见上述安装拓扑配置修改

- **只能拓扑安装时修改**

部分字段部署完成之后不能再修改。如下所示：

```
host
listen_host
name
client_port
peer_port
deploy_dir
data_dir
log_dir
arch
os
```

- **可以edit-config修改**

在部署集群之后，如果需要再调整集群服务的配置，则可以使用命令 `tiup cluster edit-config`，它会启动一个编辑器（默认为 $EDITOR 环境变量指定的值，当 EDITOR 环境变量不存在时，使用 vi 打开）允许用户修改指定集群的[拓扑文件](https://docs.pingcap.com/zh/tidb/v5.4/tiup-cluster-topology-reference) 以及[配置文件参数](https://docs.pingcap.com/zh/tidb/v5.4/pd-configuration-file)

```
tiup cluster edit-config <cluster-name> [flags]
```

**2.在线动态修改（临时）**

在线配置变更主要是通过利用 SQL 对包括 TiDB、TiKV 以及 PD 在内的各组件的配置进行在线更新。用户可以通过在线配置变更对各组件进行性能调优而无需重启集群组件。该部分修改值，大部分为临时修改，重启或`reload`后会失效，记得保留临时修改配置

- **在线修改配置**

可以查看[在线修改配置](https://docs.pingcap.com/zh/tidb/stable/dynamic-config) 查找可在线修改的参数，以及配置值

```
# 查看实例配置
show config;
# 目前在线修改 TiDB 实例配置的方式和修改其他组件 (TiKV, PD) 的有所不同
# tikv
set config tikv `split.qps-threshold`=1000
# tidb set
set tidb_slow_log_threshold = 200;
```

- **系统提供的变量**

`TiDB` 系统变量的行为与 MySQL 相似但有一些不同，变量的作用范围可以是全局范围有效 (Global Scope)、实例级别有效 (Instance Scope) 或会话级别有效 (Session Scope)，或组合了上述多个范围。其中：

1）对 `GLOBAL` 作用域变量的更改，设置后**只对新** `TiDB` **连接会话生效**，当前活动连接会话不受影响。更改会被持久化，重启后仍然生效。

2）对 `INSTANCE` 作用域变量的更改，设置后会立即对当前 `TiDB` 实例所有活动连接会话或新连接会话生效，其他 `TiDB` 实例不生效。更改**不会**被持久化，重启 `TiDB` 后会**失效**。

3）作用域为 `NONE` 的变量为只读变量，通常用于展示 `TiDB` 服务器启动后不会改变的静态信息。

使用`set`语句可以设置变量的作用范围为全局级别、实例级别或会话级别。具体参数可查看所记录的[系统变量](https://docs.pingcap.com/zh/tidb/v5.4/system-variables)

```
# 查看
show variables like 'tidb_slow_log_threshold';

# 以下两个语句等价地改变一个 Session 变量
SET tidb_distsql_scan_concurrency = 10;
SET SESSION tidb_distsql_scan_concurrency = 10;

# 以下两个语句等价地改变一个 Global 变量
SET @@global.tidb_distsql_scan_concurrency = 10;
SET  GLOBAL tidb_distsql_scan_concurrency = 10;
```

**3.已临时修改参数记录**

记录了部分集群维护不便暂时未永久设置的参数

```
# tikv 读内存缓存
set config tikv `storage.block-cache.capacity`='30GiB';

# 可以调整当前 TiDB 实例上日志的最大保留天数
set tidb_log_file_max_days=7

# 用来设置是否在日志里记录所有的 SQL 语句。该功能默认关闭。需几个tidb执行
# binlog需另外配置，以此方法记录历史所有sql
set tidb_general_log = 'ON'

# 开启这个开关之后，如果对 tx_isolation 赋值一个 TiDB 不支持的隔离级别，不会报错
# 忽略不支持的事务隔离级别告警
set tidb_skip_isolation_level_check=1;

#当 tidb_analyze_version = 2 时，如果执行 ANALYZE 语句后发生 OOM，请设置全局变量 tidb_analyze_version = 1

#pd 脚本临时修改监听内网 
--client-urls="http://内网_ip:2379"
```