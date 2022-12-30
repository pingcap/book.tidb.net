---
title: TiCDC 在多种场景的新特性的应用 - TiDB 社区技术月刊
sidebar_label: TiCDC 在多种场景的新特性的应用
hide_title: true
description: 本文将分享 TiCDC 在多种场景下，新特性的各种应用。
keywords: [TiDB, TiCDC, 新特性, 应用]
---

# TiCDC 在多种场景的新特性的应用

> 作者：[pepezzzz](https://tidb.net/u/pepezzzz/answer)

## 逻辑复制库

### 数据一致性

#### 复制过程中的一致性时间点

技术特性：TiCDC TSMAP（v6.3.0 GA，类似 Binlog drainer TSMAP）

- 保证复制过程中数据一致性（事务一致、与上游一致）
- **单个 changefeed 内有效**
- 使用场景：全库逻辑备份、上下游数据比对
- 参考文档：<https://docs.pingcap.com/zh/tidb/v6.4/upstream-downstream-diff>

配置方法：

- changefeed 的 toml 文件或者创建命令行中添加以下参数

```markdown
# 开启 SyncPoint
--enable-sync-point = true
# 每隔 5 分钟对齐一次上下游的 tso
--sync-point-interval = "5m"
# 每隔 1 小时清理一次下游 ts-map 记录点数据
--sync-point-retention = "1h"
```

具体场景中的使用方式

- 查询一致性时间点

```sql
select * from tidb_cdc.syncpoint_v1;
```

在 secondary\_ts 时间点的下游集群数据与在 primary\_ts 时间点的上游集群数据是保证一致的，查询得到与上游时间点 primary\_ts 一致的 secondary\_ts 时间点。

- 在下游集群中使用全库逻辑备份

```bash
./dumpling --snapshot {secondary_ts}
```

- 上下游进行数据一致性比对

在 sync-diff-inspector 工具的比对任务配置文件的数据源小节中添加 snapshot 关键字。

```bash
######################### Datasource config ########################
[data-sources.uptidb]
    host = "172.16.0.1"
    port = 4000
    user = "root"
    password = ""
    snapshot = "{primary_ts}"

[data-sources.downtidb]
    host = "172.16.0.2"
    port = 4000
    user = "root"
    password = ""
    snapshot = "{secondary_ts}"
```

配置定期比对任务增加逻辑复制链路的验证。### **提升逻辑库快照点的易用性**

上述的使用方法需要每次预先查询 ticdc 下游 tidb 集群的 tidb\_cdc.syncpoint\_v1 表，得到一致性时间点的 tso。新版本的改进易用性。

技术特性：tidb\_external\_ts（v6.4.0 GA，类似  set snapshot 的集群永久值）

- 所有的请求都将读取到 tidb\_external\_ts 指定时间之前的历史数据，类似具备一个  set snapshot 的集群变量功能。
- ticdc 会自动配置 tidb\_external\_ts 是最新的 tsmap secondary\_ts，即 tidb\_external\_ts = max {secondary\_ts}，使用 Syncpoint 功能需要 ticdc 同步任务 sink 配置的用户拥有下游集群的 SYSTEM\_VARIABLES\_ADMIN 或者 SUPER 权限。
- 在下游 TiDB 集群使用 tidb\_enable\_external\_ts\_read 来控制在当前会话或全局启用读取历史数据的功能，一旦全局开启，所有的新会话请求都将读取到 tidb\_external\_ts 指定时间之前的历史数据，等同于会话自动配置 set snapshot ，自动获得一致性的时间点。
- 参考文档：https\://docs.pingcap.com/zh/tidb/v6.4/tidb-external-ts

配置方法：

- changefeed 的 toml 文件或者创建命令行中启用 SyncPoint
- 在下游集群中全局启用读取历史数据的功能

```markdown
SET GLOBAL|SESSION tidb_enable_external_ts_read = ON;
```

具体场景中的使用方式

- 从库用于查询库或者备份时有全局事务一致性要求

#### **计划外中断切换时**的数据一致性

技术特性：TiCDC REDO（v5.3.0 引入，推荐 > v6.1.1 / v6.3.0，类似 DM worker relay log）

- 保证逻辑复制上下游的主从集群切换时的数据一致性（事务一致、与上游一致）
- **单个 changefeed 内有效**
- 使用场景：逻辑复制从库复制中断升级为主库接管业务
- 参考文档：https\://docs.pingcap.com/zh/tidb/v6.4/manage-ticdc    #灾难场景的最终一致性复制

配置方法：

- changefeed 的 toml 文件或者创建命令行中添加以下参数

```markdown
[consistent]
level = "eventual"      # - eventual： 使用 redo log，提供上游灾难情况下的最终一致性。
max-log-size = 64     # 单个 redo log 文件大小，单位 MiB，默认值 64，建议该值不超过 128。
flush-interval = 1000 # 刷新或上传 redo log 至 S3 的间隔，单位毫秒，默认 1000。
storage = "s3://$NAME?endpoint=http://$ENDPOINT&access-key=?&secret-access-key=?"
```

具体场景中的使用方式

- 激活从集群前，在从集群上使用 cdc 程序应用 S3 存储上的 redo 实现下游的数据一致性

```sql
./cdc redo apply --tmp-dir="/tmp/cdc/redo/apply" --storage="s3://$NAME?endpoint=http://$ENDPOINT&access-key=?&secret-access-key=?" --sink-uri="mysql://cdcuser:cdcuser@STANDBY-TiDB-IP:Port"
```

**此时使用 cdc redo apply  的 cdc 二进制版本要求与上游一致。**

## 防范逻辑复制下游集群的误操作

技术特性：tidb\_restricted\_read\_only（v5.2.0 GA，类似 MySQL Super） 

- 保证逻辑复制下游的从集群处于只读状态，只能应用 ticdc 的数据复制，其他业务不能操作。
- 使用场景：逻辑复制从库复制中断升级为主库接管业务
- 参考文档：https\://docs.pingcap.com/zh/tidb/v6.4/system-variables  #tidb\_restricted\_read\_only

配置方法：

- 下游集群创建 ticdc 同步任务 sink 配置的用户需要有 restricted\_replica\_writer\_admin 角色

```markdown

grant all privileges on {DBNAME}.* to cdcuser;
grant  restricted_replica_writer_admin  on *.* to cdcuser; # 只读状态下写入权限
set global tidb_restricted_read_only = on;                 # 设置tidb-cdc集群只读 
```

具体场景中的使用方式

- 集群只读配置完成后，会在执行 SQL 语句前检查是否只读。为防止被置于只读模式后某些长期运行的 auto commit 语句可能修改数据的情况，重启从集群的 tidb-server 能重置旧会话，保证新会话都符合只读模式。

```sql

tiup cluster restart tidb-cdc -R tidb      
```

- 注：从 v6.2.0 起，改为提交 SQL 前检查只读模式，理论上可以不用重启从集群的 tidb-server。

- 从集群在激活接管业务前需要退出只读，恢复读写模式。

```sql
set global tidb_restricted_read_only = off;
set global tidb_super_read_only=off;
```

### 复制延时的部分配置优化

**整库复制中单表延时成为短板**- 默认情况下，ticdc 的 mysql sink 使用 safe\_mode ，即 update=delete+replace into / insert=replace into，会影响性能。
  mysql sink 配置可关闭 safe\_mode（ticdc v6.1.3 默认情况下关闭 safeMode）。**开启 redo 后出现复制延时**- tiup cluster edit-config tidb-primary 的 cdc 节点的 config 配置 per-table-memory-quota：512 MB
- v6.1.1 等高版本有实现攒批优化
- v6.1.1 等高版本的 changefeed 定义配置新特性 transaction-atomicity=none 放弃表内事务，对大事务场景有效。# **明细归档后的近线查询库**

**支持 T-1 的流水表长期历史数据的独立查询能力**

技术特性：event filter （v6.2.0 GA，类似 DM event filter ）

- 逻辑复制上游的主集群的流水表能复制到下游用于近线查询的从集群的流水表
- 保证上游进行流水表的记录删除或者 truncate 操作时不影响下游
- 参考文档：https\://docs.pingcap.com/zh/tidb/v6.4/manage-ticdc    #事件过滤器规则

配置方法

- changefeed 的 toml 文件或者创建命令行中添加以下参数

```markdown
[filter]
rules = ['xxdb.tll_jrnl',...,'xxdb.tll_jrnl_2']
[[filter.event-filters]]
matcher = ["xxdb.tll_jrnl",...,"xxdb.tll_jrnl_2"]
ignore-event = ["truncate table","delete"]

```

具体场景中的使用方式

- 逻辑复制上游的主集群的流水表使用 non-transactional DML 进行历史数据的删除

```markdown
BATCH ON id LIMIT 1000 delete from xxdb.tll_jrnl where create_data > {now()+2}
```

- delete 语句被过滤，不会复制到逻辑复制下游的从集群的流水表，可以进一步归档为年表或月表等。
