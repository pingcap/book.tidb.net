---
title: 基于 TiCDC 同步的主从集群数据校验 - TiDB 社区技术月刊
sidebar_label: 基于 TiCDC 同步的主从集群数据校验
hide_title: true
description: TiDB作为分布式数据库，本身已经支持了高可用，然而对于金融级应用，往往还需要多数据中心容灾，这时就需要用到 TiDB 专用的数据同步组件了。TiDB提供了 tidb-binlog 和 TiCDC 两种数据同步组件，并且在最近的几个版本更加推荐使用 TiCDC 做主从TiDB集群的数据同步。那么，TiCDC 是否也支持类似的获取 ts-map 的机制呢？我们尝试阅读 TiCDC 源码来找到答案。
keywords: [TiDB, TiCDC, 集群, 数据校验]
---

# 基于 TiCDC 同步的主从集群数据校验

> 作者：eastfisher

## 背景

数据库作为最核心的基础组件之一，要求它能够安全运行和保障数据安全，这是一个刚需。另外，数据库服务本身的高可用，是我们实现整个对外数据服务连续性的最重要的基石。在这些基础上，光有高可用还是不够的，我们需要考虑到机房级的、数据中心级的、站点级的灾难导致的对业务的影响[1]。 TiDB作为分布式数据库，本身已经支持了高可用，然而对于金融级应用，往往还需要多数据中心容灾，这时就需要用到 TiDB 专用的数据同步组件了。TiDB提供了 tidb-binlog 和 TiCDC 两种数据同步组件，并且在最近的几个版本更加推荐使用 TiCDC 做主从TiDB集群的数据同步。

上下游数据一致性是数据同步的基本前提，tidb-binlog 和 TiCDC 都在实现机制上尽最大可能保障数据同步一致性。然而，我们仍有必要在业务数据层面，通过数据校验的方式来确认上下游数据一致，以避免由业务而非数据库本身导致的数据不一致发生（比如向灾备的从集群写入数据导致的主从数据不一致）。TiDB 提供了 sync-diff-inspector 数据校验工具，可对上下游 TiDB 集群进行数据校验，并且支持多种校验模式，官方文档也给出了基于 tidb-binlog 的主从集群，使用 sync-diff-inspector 工具进行数据校验的方案[2]。在该方案中，tidb-binlog 的 Drainer 组件在把数据同步到 TiDB 时，保存 checkpoint 的同时也会将上下游的 TSO 对应关系保存为 ts-map。sync-diff-inspector 利用 TiDB 的 snapshot read 特性，通过设置上下游的 tidb_snapshot 变量来指定校验查询时的上下游TSO，从而“对齐”上下游数据以进行校验。

遗憾的是，文档中并没有说明 TiCDC 是否支持类似的获取 ts-map 的机制。那么，TiCDC 是否也支持类似机制呢？我们尝试阅读 TiCDC 源码来找到答案。（注：以下所有源码以 v6.1.0 版本 TiCDC 进行展示，但相关逻辑在 v5.0 各个版本也适用）

# 实现

使用 TiCDC 做 TiDB 主从同步的架构如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1662434042641.png)

TiCDC 的 MySQL Sink 提供了 SyncpointStore 功能，用于将 syncpoint 保存到下游 TiDB 的库表中，接口定义如下：

```go
// https://github.com/pingcap/tiflow/blob/v6.1.0/cdc/sink/mysql/syncpointStore.go

type SyncpointStore interface {
    // CreateSynctable create a table to record the syncpoints
    CreateSynctable(ctx context.Context) error

    // SinkSyncpoint record the syncpoint(a map with ts) in downstream db
    SinkSyncpoint(ctx context.Context, id model.ChangeFeedID, checkpointTs uint64) error

    // Close closes the SyncpointSink
    Close() error
}
```

如果保存 syncpoint 的库表不存在，则首先创建库表。这里的库名和表名都是固定值： tidb_cdc.syncpoint_v1 。

```go
// https://github.com/pingcap/tiflow/blob/v6.1.0/cdc/sink/mysql/mysql_syncpoint_store.go#L162

func (s *mysqlSyncpointStore) CreateSynctable(ctx context.Context) error {
    database := mark.SchemaName
    tx, err := s.db.BeginTx(ctx, nil)
    ... // err handling
    _, err = tx.Exec("CREATE DATABASE IF NOT EXISTS " + database)
    ... // err handling
    _, err = tx.Exec("USE " + database)
    ... // err handling
    _, err = tx.Exec("CREATE TABLE IF NOT EXISTS " + syncpointTableName + " (cf varchar(255),primary_ts varchar(18),secondary_ts varchar(18),PRIMARY KEY ( `cf`, `primary_ts` ) )")
    ... // err handling
    err = tx.Commit()
    return cerror.WrapError(cerror.ErrMySQLTxnError, err)
}
```

Sink 会根据配置的时间间隔，定时触发保存 syncpoint。首先查询下游的tidb_current_ts系统变量，得到下游当前TSO，然后将当前上游同步的TSO和下游TSO写入到之前创建的表中，用 namespace 和 changefeed id 进行区分。

```go
// https://github.com/pingcap/tiflow/blob/v6.1.0/cdc/sink/mysql/mysql_syncpoint_store.go#L174

func (s *mysqlSyncpointStore) SinkSyncpoint(ctx context.Context, id model.ChangeFeedID, checkpointTs uint64) error {
    tx, err := s.db.BeginTx(ctx, nil)
    ... // err handling
    row := tx.QueryRow("select @@tidb_current_ts")
    ... // err handling
    query := "insert ignore into " + mark.SchemaName + "." + syncpointTableName
           + "(cf, primary_ts, secondary_ts) VALUES (?,?,?)"
    _, err = tx.Exec(query, id.Namespace+"_"+id.ID, checkpointTs, secondaryTs)
    ... // err handling
    err = tx.Commit()
    return cerror.WrapError(cerror.ErrMySQLTxnError, err)
}
```

写到表中的数据格式如下：

```markdown
+-----------------------------------+--------------------+--------------------+
| cf                                | primary_ts         | secondary_ts       |
+-----------------------------------+--------------------+--------------------+
| default_simple-replication-task   | 435782288912416770 | 435782288872570881 |
| default_simple-replication-task   | 435782291533856768 | 435782291546439681 |
+-----------------------------------+--------------------+--------------------+
```

默认情况下，创建 TiCDC 的 changefeed 是不会开启 syncpoint 写入的，需要在创建 changefeed 时额外指定 `sync-point` 和 `sync-interval` 这两个参数：

```bash
> cdc changefeed --sink-uri='mysql://root:@127.0.0.1:4000/' --changefeed-id="simple-replication-task" --sync-point=true --sync-interval=10s create
```

相关的代码如下：

```go
// https://github.com/pingcap/tiflow/blob/v6.1.0/pkg/cmd/cli/cli_changefeed_create.go#L71

func (o *changefeedCommonOptions) addFlags(cmd *cobra.Command) {
    if o == nil {
        return
    }

    // ...
    cmd.PersistentFlags().BoolVar(&o.syncPointEnabled, "sync-point", false, "(Experimental) Set and Record syncpoint in replication(default off)")
    cmd.PersistentFlags().DurationVar(&o.syncPointInterval, "sync-interval", 10*time.Minute, "(Experimental) Set the interval for syncpoint in replication(default 10min)")
    // ...
}
```

使用 sync-diff-inspector 工具执行校验时，可根据 changefeed id 查询 primary_ts 最大的一条记录：

```markdown
> SELECT * FROM tidb_cdc.syncpoint_v1 WHERE cf = 'default_{changefeed_id}' ORDER BY primary_ts DESC LIMIT 1;
```

然后按照 sync-diff-inspector 的 Datasource 配置，在上下游的 snapshot 配置项中填写相应值。

```markdown
######################### Datasource config ########################
[data-sources.uptidb]
host = "172.16.0.1"
port = 4000
user = "root"
password = ""
snapshot = "409621863377928194"

[data-sources.downtidb]
host = "172.16.0.2"
port = 4000
user = "root"
password = ""
snapshot = "409621863377928345"
```

## 注意事项

仅当使用 TiCDC 将数据写入下游 TiDB 时可以使用以上方式进行数据校验，如果下游是 MySQL，使用以上方式会导致 changefeed 同步报错，直接原因是 MySQL 没有 tidb_current_ts 这个系统变量使得查询下游 TSO 失败，本质原因是 MySQL 不支持 snapshot read。

此外，使用这种方式进行上下游校验，由于是读取到的 snapshot 数据，Sink 写入下游一直失败时，使用 snapshot 数据进行校验有可能仍然是一致的，这种情况的数据异常需要通过 TiCDC 的延迟监控发现，或者在做校验时，检查上游 TiDB 的当前 TSO 和 syncpoint 最新的上游 TSO 是否偏差过大。



## 参考资料

1. [TiDB 金融级备份及多中心容灾](https://cn.pingcap.com/blog/tidb-financial-grade-backup-and-multi-center-disaster-recovery)

2. [TiDB 主从集群的数据校验](https://docs.pingcap.com/zh/tidb/stable/upstream-downstream-diff)