---
title: tidb-dm报警DM_sync_process_exists_with_error排查 - TiDB 社区技术月刊
sidebar_label: tidb-dm报警DM_sync_process_exists_with_error排查
hide_title: true
description: 本文主要介绍关于 tidb-dm 报警 DM_sync_process_exists_with_error 排查。
keywords: TiDB, dm sync process exists with error, mysql, tikv, pd, cluster tidb, invalid connection
---

# tidb-dm报警DM_sync_process_exists_with_error排查

> **作者**：db_user

## 一、背景

dm同步任务报警DM_sync_process_exists_with_error，一分钟后自动恢复，想着排查一下原因

## 二、观测日志报错

### 1.dm日志

```bash
[2022/06/28 14:31:13.364 +00:00] [ERROR] [db.go:201] ["execute statements failed after retry"] [task=task-name] [unit="binlog replication"] [queries="[sql]"] [arguments="[[]]"] [error="[code=10006:class=database:scope=not-set:level=high], Message: execute statement failed: commit, RawCause: invalid connection"]
```

### 2.上游mysql日志

```bash
2022-06-28T14:31:19.413211Z 28801 [Note] Aborted connection 28801 to db: 'unconnected' user: '***' host: 'ip' (Got an error reading communication packets)
2022-06-28T14:31:22.154980Z 28802 [Note] Aborted connection 28802 to db: 'unconnected' user: '***' host: 'ip' (Got an error reading communication packets)
2022-06-28T14:31:32.158508Z 28804 [Note] Start binlog_dump to master_thread_id(28804) slave_server(429505412), pos(mysql-bin-changelog.103037, 36247149)
2022-06-28T14:31:32.158739Z 28803 [Note] Start binlog_dump to master_thread_id(28803) slave_server(429505202), pos(mysql-bin-changelog.103037, 40373779)
```

### 3.下游tidb日志

```bash
[2022/06/28 14:31:12.419 +00:00] [WARN] [client_batch.go:638] ["wait response is cancelled"] [to=dm_worker_ip:20160] [cause="context canceled"]
[2022/06/28 14:31:12.419 +00:00] [WARN] [client_batch.go:638] ["wait response is cancelled"] [to=dm_worker_ip:20160] [cause="context canceled"]
[2022/06/28 14:31:12.419 +00:00] [WARN] [client_batch.go:638] ["wait response is cancelled"] [to=dm_worker_ip:20160] [cause="context canceled"]
[2022/06/28 14:31:12.419 +00:00] [WARN] [client_batch.go:638] ["wait response is cancelled"] [to=dm_worker_ip:20160] [cause="context canceled"]
[2022/06/28 14:31:12.419 +00:00] [WARN] [client_batch.go:638] ["wait response is cancelled"] [to=dm_worker_ip:20160] [cause="context canceled"]
```

### 4.下游tikv日志

```bash
[2022/06/28 14:31:12.585 +00:00] [WARN] [endpoint.rs:537] [error-response] [err="Region error (will back off and retry) message: \"peer is not leader for region 2641161, leader may Some(id: 2641164 store_id: 5)\" not_leader { region_id: 2641161 leader { id: 2641164 store_id: 5 } }"]
[2022/06/28 14:31:12.585 +00:00] [WARN] [endpoint.rs:537] [error-response] [err="Region error (will back off and retry) message: \"peer is not leader for region 2641165, leader may Some(id: 2641167 store_id: 4)\" not_leader { region_id: 2641165 leader { id: 2641167 store_id: 4 } }"]
[2022/06/28 14:31:12.585 +00:00] [WARN] [endpoint.rs:537] [error-response] [err="Region error (will back off and retry) message: \"peer is not leader for region 2709997, leader may Some(id: 2709999 store_id: 4)\" not_leader { region_id: 2709997 leader { id: 2709999 store_id: 4 } }"]
[2022/06/28 14:31:12.585 +00:00] [WARN] [endpoint.rs:537] [error-response] [err="Region error (will back off and retry) message: \"peer is not leader for region 2839445, leader may Some(id: 2839447 store_id: 4)\" not_leader { region_id: 2839445 leader { id: 2839447 store_id: 4 } }"]
[2022/06/28 14:31:20.400 +00:00] [WARN] [endpoint.rs:537] [error-response] [err="Region error (will back off and retry) message: \"peer is not leader for region 2957169, leader may Some(id: 2957170 store_id: 1)\" not_leader { region_id: 2957169 leader { id: 2957170 store_id: 1 } }"]
[2022/06/28 14:31:20.400 +00:00] [WARN] [endpoint.rs:537] [error-response] [err="Region error (will back off and retry) message: \"peer is not leader for region 2957169, leader may Some(id: 2957170 store_id: 1)\" not_leader { region_id: 2957169 leader { id: 2957170 store_id: 1 } }"]
[2022/06/28 14:31:20.400 +00:00] [WARN] [endpoint.rs:537] [error-response] [err="Region error (will back off and retry) message: \"peer is not leader for region 2957169, leader may Some(id: 2957170 store_id: 1)\" not_leader { region_id: 2957169 leader { id: 2957170 store_id: 1 } }"]
[2022/06/28 14:31:05.617 +00:00] [WARN] [endpoint.rs:537] [error-response] [err="Key is locked (will clean up) primary_lock: 748000000F000 lock_version: 434222311815512066 key: 748000009725552F000 lock_ttl: 3003 txn_size: 1"]
[2022/06/28 14:31:05.634 +00:00] [WARN] [endpoint.rs:537] [error-response] [err="Key is locked (will clean up) primary_lock: 7480000000092F000 lock_version: 434222311815512092 key: 748000000000 lock_ttl: 3018 txn_size: 5"]
[2022/06/28 14:31:15.389 +00:00] [ERROR] [kv.rs:931] ["KvService response batch commands fail"]
[2022/06/28 14:31:15.432 +00:00] [ERROR] [kv.rs:931] ["KvService response batch commands fail"]
```

### 5.pd日志

```bash
[2022/06/28 14:30:55.329 +00:00] [INFO] [operator_controller.go:424] ["add operator"] [region-id=2641161] [operator="\"transfer-hot-read-leader {transfer leader: store 1 to 5} (kind:hot-region,leader, region:2641161(25913,5), createAt:2022-06-28 14:30:55.329497692 +0000 UTC m=+8421773.911777457, startAt:0001-01-01 00:00:00 +0000 UTC, currentStep:0, steps:[transfer leader from store 1 to store 5])\""] ["additional info"=]
[2022/06/28 14:30:55.329 +00:00] [INFO] [operator_controller.go:620] ["send schedule command"] [region-id=2641161] [step="transfer leader from store 1 to store 5"] [source=create]
[2022/06/28 14:30:55.342 +00:00] [INFO] [cluster.go:567] ["leader changed"] [region-id=2641161] [from=1] [to=5]
[2022/06/28 14:30:55.342 +00:00] [INFO] [operator_controller.go:537] ["operator finish"] [region-id=2641161] [takes=12.961676ms] [operator="\"transfer-hot-read-leader {transfer leader: store 1 to 5} (kind:hot-region,leader, region:2641161(25913,5), createAt:2022-06-28 14:30:55.329497692 +0000 UTC m=+8421773.911777457, startAt:2022-06-28 14:30:55.329597613 +0000 UTC m=+8421773.911877386, currentStep:1, steps:[transfer leader from store 1 to store 5]) finished\""] ["additional info"=]
```

### 6.监控 cluster_tidb --> kv errors

![在这里插入图片描述](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/bff6de8fd8ee4f288ab3c111be3b91be-1656574391538.png)

## 三、结论

可以看到这个报警的引起是由于dm-worker产生报错invalid connection，而这个报错这是由于tidb出现了wait response is cancelled,而tidb出现了这种问题则是由于tikv出现了锁和backoff导致的，至于为什么出现锁和backoff,可以看到pd的日志对hot-read-leader做了调度，这是产生backoff的关键，而lock的原因则要从业务sql中去查找

**官方文档**：[锁冲突描述文档](https://docs.pingcap.com/zh/tidb/v4.0/troubleshoot-lock-conflicts)