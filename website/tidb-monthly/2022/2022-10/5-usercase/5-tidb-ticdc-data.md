---
title: TiCDC 实践：TiDB 到 TiDB 增量数据迁移 - TiDB 社区技术月刊
sidebar_label: TiCDC 实践：TiDB 到 TiDB 增量数据迁移
hide_title: true
description: 本文将介绍因降本等原因，需要将流量较小的 TiDB 集群下线，将数据合并到其他 TiDB 集群的具体操作实践。
keywords: [TiDB, TiDB 集群, 降本, 流量较小, 数据合并, TiCDC]
---

# TiCDC 实践：TiDB 到 TiDB 增量数据迁移

> 作者：[Hacker_小峰](https://tidb.net/u/Hacker_小峰/answer)

## 背景

因降本等原因，需要将流量较小的 TiDB 集群下线，将数据合并到其他 TiDB 集群。

上游 TiDB 集群版本：5.4.0

下游 TiDB 集群版本：5.4.2

此次合并集群用的工具有：

**dumpling 导出 + loader 导入 + TiCDC 增量数据实时同步**；

TiCDC 数据同步原理可参考[TiCDC 架构和数据同步链路解析](https://tidb.net/blog/6155c3be) 。

## 第 1 步：搭建环境

**1、部署上下游 TiDB 集群，分别扩容 TiCDC 节点。**

编写 `vim scale-out-ticdc.yaml` 文件：

```
cdc_servers:
  - host: 10.1.1.1
    gc-ttl: 86400
    data_dir: /data04/deploy/install/data/cdc-8300
  - host: 10.1.1.2
    gc-ttl: 86400
    data_dir: /data04/deploy/install/data/cdc-8300
```

运行扩容命令:

```
tiup cluster scale-out prod-tidb-004 /home/tidb/prod-tidb-004/scale-out-ticdc.yaml
```

**2、查看集群拓扑，确认上下游集群 TiCDC 节点都已经扩容完成。**

```
$ tiup cluster display prod-tidb-004
```

```
Cluster name:       prod-tidb-004
Cluster version:    v5.4.2
......
10.1.1.1:8300   cdc           10.1.1.1  8300         linux/x86_64  Up         /data04/deploy/install/data/cdc-8300  /data/tidb-deploy/cdc-8300
10.1.1.2:8300   cdc           10.1.1.2  8300         linux/x86_64  Up         /data04/deploy/install/data/cdc-8300  /data/tidb-deploy/cdc-8300
......
```

## 第 2 步：迁移全量数据

**1、关闭 GC。**

```
SELECT @@global.tidb_gc_enable;
SET GLOBAL tidb_gc_enable=false;
SELECT @@global.tidb_gc_enable;
```

**2、备份数据。**

使用 [Dumpling](https://docs.pingcap.com/zh/tidb/v5.0/dumpling-overview) 工具导出上游集群多个库的全量数据。

```
cd /data01/tidb-toolkit-v5.2.2-linux-amd64/bin/

./dumpling -u dba -p passwd -h 10.1.1.xx -P 4000  -F 64MiB  -t 4 -B db1,db2,db3,db4 --params "tidb_distsql_scan_concurrency=5,tidb_mem_quota_query=8589934592"   -o /data01/tidb_backup/migrate_to_prod004_4db/ 

```

2.1、导出完毕后，查看备份文件,确认多个库均已导出完成。

2.2、查看备份的点位，
执行如下命令查看导出数据的元信息，metadata 文件中的 Pos 就是导出快照的 TSO，将其记录为 BackupTS：

```
cat metadata

Started dump at: 2022-10-12 17:25:15
SHOW MASTER STATUS:
	Log: tidb-binlog
	Pos: 436618321009573893
	GTID:

Finished dump at: 2022-10-12 17:35:14
```

**3、恢复数据**。

使用 [Loader](https://docs.pingcap.com/zh/tidb/v4.0/loader-overview) 将 Dumpling 导出的上游全量数据导入到下游 TiDB 实例：

```
# loader 可以断点续传真是太棒了！
#遇到上下游TiDB版本不一致导致表结构导入有报错时，方便统一表结构后再次导入下游

cd /data01/tidb-enterprise-tools-nightly-linux-amd64/bin

./loader -u dba -p 'passwd' -h 10.1.1.xx -P 4002 -t 2 -d /data01/tidb_backup/migrate_to_prod004_4db/
```

这里也可以采用 [TiDB Lightning](https://docs.pingcap.com/zh/tidb/v6.0/tidb-lightning-overview) 工具做导入(`TiDB v5.3.0` 及以上可使用)，为避免影响下游可使用 `TiDB-backend` 模式（配置文件中设置 `backend = "tidb"`）。

## 第 3 步：迁移增量数据

**1、创建 CDC 同步任务。**

【编写配置文件】：

```
cd /home/tidb/ticdc
vim migrate_to_prod004_ticdc_config.toml
```

```
#cat migrate_to_prod004_4db_ticdc_config.toml
# 指定配置文件中涉及的库名、表名是否为大小写敏感
# 该配置会同时影响 filter 和 sink 相关配置，默认为 true
case-sensitive = true

# 是否输出 old value，从 v4.0.5 开始支持，从 v5.0 开始默认为 true
enable-old-value = true

[filter]
# 过滤器规则
# 过滤规则语法：https://docs.pingcap.com/zh/tidb/stable/table-filter#表库过滤语法
rules = ['db1.*', 'db2.*', 'db3.*', 'db4.*']

[mounter]
# mounter 线程数，用于解码 TiKV 输出的数据
worker-num = 8
```

【创建同步任务】：

```
$ tiup ctl:v5.4.0 cdc changefeed create --pd=http://10.1.xx.xx:2379 --sink-uri="mysql://dba:passwd@10.1.xx.xx:4000/?worker-count=16&max-txn-row=5000&time-zone=SYSTEM" --changefeed-id="task-migrate-to-prod004" --sort-engine="unified" --start-ts=436612662618488841 --config /home/tidb/ticdc/migrate_to_prod004_ticdc_config.toml
```

以上命令中：

- `--pd`：实际的上游集群的地址
- `--sink-uri`：同步任务下游的地址
- `--changefeed-id`：同步任务的 ID，格式需要符合正则表达式 `^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$`
- `--start-ts`：TiCDC 同步的起点，需要设置为实际的备份时间点，也就是第 2 步：迁移全量数据中 “备份数据” 提到的 BackupTS

更多关于 changefeed 的配置，[可以参考官网【同步任务配置文件】](https://docs.pingcap.com/zh/tidb/v5.4/manage-ticdc#%E5%90%8C%E6%AD%A5%E4%BB%BB%E5%8A%A1%E9%85%8D%E7%BD%AE%E6%96%87%E4%BB%B6%E6%8F%8F%E8%BF%B0)。

【查看所有任务】：

```
$ tiup ctl:v5.4.0 cdc changefeed list --pd=http://10.1.xx.xx:2379
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v5.4.0/ctl cdc changefeed list --pd=http://10.1.xx.xx:2379
[
  {
    "id": "task-migrate-to-prod004",
    "summary": {
      "state": "normal",
      "tso": 436641144642469889,
      "checkpoint": "2022-10-13 17:36:20.527",
      "error": null
    }
  }
]
```

**2、上游重新开启 GC。**

```
SELECT @@global.tidb_gc_enable;
SET GLOBAL tidb_gc_enable=TRUE;
SELECT @@global.tidb_gc_enable;
```

**3、查看 TiCDC 任务状态**
【查看指定的任务】：

```
$ tiup ctl:v5.4.0 cdc changefeed query -s --pd=http:10.1.xx.xx:2379 --changefeed-id=task-migrate-to-prod004
```

【查看任务详细信息】：

```
$ tiup ctl:v5.4.0 cdc changefeed query --pd=http://10.1.xx.xx:2379 -c task-migrate-to-prod004
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v5.4.0/ctl cdc changefeed query --pd=http://10.1.xx.xx:2379 -c task-migrate-to-prod004
{
  "info": {
    "sink-uri": "mysql://dba:passwd@10.1.xx.xx:4002/",
    "opts": {
      "_changefeed_id": "sink-verify"
    },
    "create-time": "2022-10-13T16:28:29.526804276+08:00",
    "start-ts": 436639195916664835,
    "target-ts": 0,
    "admin-job-type": 0,
    "sort-engine": "unified",
    "sort-dir": "",
    "config": {
      "case-sensitive": true,
      "enable-old-value": true,
      "force-replicate": false,
      "check-gc-safe-point": true,
      "filter": {
        "rules": [
          "db1.*",
          "db2.*",
          "db3.*",
          "db4.*"
        ],
        "ignore-txn-start-ts": null
      },
      "mounter": {
        "worker-num": 8
      },
      "sink": {
        "dispatchers": null,
        "protocol": "",
        "column-selectors": null
      },
      "cyclic-replication": {
        "enable": false,
        "replica-id": 0,
        "filter-replica-ids": null,
        "id-buckets": 0,
        "sync-ddl": false
      },
      "scheduler": {
        "type": "table-number",
        "polling-time": -1
      },
      "consistent": {
        "level": "none",
        "max-log-size": 64,
        "flush-interval": 1000,
        "storage": ""
      }
    },
    "state": "normal",
    "error": null,
    "sync-point-enabled": false,
    "sync-point-interval": 600000000000,
    "creator-version": "v5.4.0"
  },
  "status": {
    "resolved-ts": 436641687359455233,
    "checkpoint-ts": 436641687044882437,
    "admin-job-type": 0
  },
  "count": 0,
  "task-status": [
    {
      "capture-id": "3786de8d-b1e4-40f8-927c-88e2e56665f5",
      "status": {
        "tables": {
          "311": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "333": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "346": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "348": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "363": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "366": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "423": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "427": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "429": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "431": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "446": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "448": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "450": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "456": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          }
        },
        "operation": {},
        "admin-job-type": 0
      }
    },
    {
      "capture-id": "5df19b4c-e31d-4f81-a757-95551b1cd3c2",
      "status": {
        "tables": {
          "335": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "350": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "354": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "356": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "373": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "383": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "421": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "425": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "433": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "435": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "437": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "444": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          },
          "458": {
            "start-ts": 436640265844293633,
            "mark-table-id": 0
          }
        },
        "operation": {},
        "admin-job-type": 0
      }
    }
  ]
}
```

【暂停任务】：

```
tiup ctl:v5.4.0 cdc changefeed pause --pd=http://10.1.xx.xx:23799 --changefeed-id=task-migrate-to-prod004

#然后确认"state": "stopped"
tiup ctl:v5.4.0 cdc changefeed query --pd=http://10.1.xx.xx:2379 --changefeed-id=task-migrate-to-prod004
```

【恢复任务】：

```
tiup ctl:v5.4.0 cdc changefeed resume --pd=http://10.1.xx.xx:23799 --changefeed-id=task-migrate-to-prod004
```

**4、校验同步情况**

- 查看上下游数据内容是否一致；
- 测试过滤是否生效：上游建表，测试表DML/DDL 是否同步到下游。

```
#上游建表
use db1;#本次迁移的多库之一
CREATE TABLE `zlz001` (
  `id`  bigint(20)  NOT NULL auto_random COMMENT '主键',
  `params` varchar(100) NOT NULL COMMENT '值',
  `created_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  PRIMARY KEY (`id`) /*T![clustered_index] NONCLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='测试表';

create database zlz;#非本次迁移的库
use zlz;
CREATE TABLE `zlz002` (
  `id` bigint(20) unsigned NOT NULL auto_random COMMENT '主键ID',
  `content` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '短信内容',
  `created_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB COMMENT='测试表';

insert into db1.zlz001(params) values('params'),('paramsparams'),('paramsparamsparamsparamsparams');
insert into zlz.zlz002(content) values('heeha');

#查看数据是否同步到下游
select * from db1.zlz001;#本次同步的库，应查到数据
select * from zlz.zlz002;#非本次TiCDC同步的库，下游应查不到数据

#删表，查看数据是否同步到下游
drop table if exists db1.zlz001;
drop table if exists zlz.zlz002;

#清理测试库
drop database zlz;
```

这里就不写详细过程了。

## 第 4 步：平滑切换业务

通过 TiCDC 创建上下游的同步链路后，原集群的写入数据会以非常低的延迟同步到新集群，此时可以逐步将读流量迁移到新集群了。观察一段时间，如果新集群表现稳定，就可以将写流量接入新集群，步骤如下：

**1、停止上游集群的写业务。**

**2、确认上游数据已全部同步到下游后，停止上游到下游集群的 changefeed。**

```
#停止旧集群到新集群的 changefeed
tiup ctl:v5.4.0 cdc changefeed pause --pd=http://10.1.xx.xx:2379 --changefeed-id=task-migrate-to-prod004
```

```
# 查看 changefeed 状态
tiup ctl:v5.4.0 cdc changefeed query --pd=http://10.1.xx.xx:2379 --changefeed-id=task-migrate-to-prod004
```

```
[
  {
    "id": "task-migrate-to-prod004",
    "summary": {
      "state": "stopped",# 需要确认这里的状态为 stopped
      "tso": 436640265844293633,
      "checkpoint": "2022-10-13 17:40:28.178",# 确认这里的时间晚于停写的时间
      "error": null
    }
  }
]
```

**3、将写业务迁移到下游集群**

更新库对应的数据源配置为下游新集群。

**4、观察一段时间后，等新集群表现稳定，便可以弃用原集群**

**5、删除 TiCDC 同步任务**

【删除同步任务】：

```
tiup ctl:v5.4.0 cdc changefeed remove --pd=http://10.1.xx.xx:2379 --changefeed-id=task-zlz
```

【查看所有任务】：

```
tiup ctl:v5.4.0 cdc changefeed list --pd=http://10.1.xx.xx:2379
```

## 其他

### 需要关注上下游集群时区是否一致

time\_zone 的默认值是 System 。

```
mysql> SELECT @@global.time_zone, @@session.time_zone, @@global.system_time_zone;
+--------------------+---------------------+---------------------------+
| @@global.time_zone | @@session.time_zone | @@global.system_time_zone |
+--------------------+---------------------+---------------------------+
| SYSTEM             | SYSTEM              | UTC                       |
+--------------------+---------------------+---------------------------+
1 row in set (0.01 sec)
```

修改时区：

```
set global time_zone='Asia/Shanghai';
```

```
mysql> SELECT @@global.time_zone, @@session.time_zone, @@global.system_time_zone;
+--------------------+---------------------+---------------------------+
| @@global.time_zone | @@session.time_zone | @@global.system_time_zone |
+--------------------+---------------------+---------------------------+
| Asia/Shanghai      | Asia/Shanghai       | UTC                       |
+--------------------+---------------------+---------------------------+
1 row in set (0.00 sec)
```

也可以在 JDBC 链接中指定时区 `serverTimezone=Asia/Shanghai`，比如：

```
 jdbc:mysql://10.1.1.1:4002/dbname?useUnicode=true&characterEncoding=utf8&rewriteBatchedStatements=true&useServerPrepStmts=true&cachePrepStmts=true&allowMultiQueries=true&useConfigs=maxPerformance&useSSL=false&serverTimezone=Asia/Shanghai
```

## 参考文档

<https://docs.pingcap.com/zh/tidb/stable/migrate-from-tidb-to-tidb>

<https://asktug.com/t/topic/813124>
