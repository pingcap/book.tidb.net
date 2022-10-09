---
title: TiDB分布式事务—写写冲突 - TiDB 社区技术月刊
sidebar_label: TiDB分布式事务—写写冲突
hide_title: true
description: TiDB 支持分布式事务，提供 乐观事务 与 悲观事务 两种事务模式。TiDB 3.0.8 及以后版本，TiDB 默认采用悲观事务模式。本文介绍如何解决写写冲突。
keywords: [分布式事务, 乐观事物, TiDB, 悲观事物, 写写冲突]
---

# TiDB分布式事务—写写冲突

> 作者：[Hacker_Yv76YjBL](https://tidb.net/u/Hacker_Yv76YjBL/answer)

> TiDB 支持分布式事务，提供 乐观事务 与 悲观事务 两种事务模式。TiDB 3.0.8 及以后版本，TiDB 默认采用悲观事务模式。

## TiDB 乐观事务模式

TiDB 的乐观事务模型，只有在真正提交的时候，才会做冲突检测。如果有冲突，则需要重试。这种模型在冲突严重的场景下，会比较低效，因为重试之前的操作都是无效的，需要重复做。举一个比较极端的例子，就是把数据库当做计数器用，如果访问的并发度比较高，那么一定会有严重的冲突，导致大量的重试甚至是超时。但是如果访问冲突并不十分严重，那么乐观锁模型具备较高的效率。在冲突严重的场景下，推荐使用悲观锁。

### 乐观事务原理

1.客户端开始一个事务。

- TiDB 从 PD 获取一个全局唯一递增的时间戳作为当前事务的唯一事务 ID，这里称为该事务的 start_ts。TiDB 实现了多版本并发控制 (MVCC)，因此 start_ts 同时也作为该事务获取的数据库快照版本。该事务只能读到此 start_ts 版本可以读到的数据。

2.客户端发起读请求。

- TiDB 从 PD 获取数据路由信息，即数据具体存在哪个 TiKV 节点上。
- TiDB 从 TiKV 获取 start_ts 版本下对应的数据。

3.客户端发起写请求。

- TiDB 校验写入数据是否符合约束（如数据类型是否正确、是否符合非空约束等）。校验通过的数据将存放在 TiDB 中该事务的私有内存里。

4.客户端发起 commit。

5.TiDB 开始两阶段提交，在保证事务原子性的前提下，进行数据持久化。

- TiDB 从当前要写入的数据中选择一个 Key 作为当前事务的 Primary Key。
- TiDB 从 PD 获取所有数据的写入路由信息，并将所有的 Key 按照所有的路由进行分类。
- TiDB 并发地向所有涉及的 TiKV 发起 prewrite 请求。TiKV 收到 prewrite 数据后，检查数据版本信息是否存在冲突或已过期。符合条件的数据会被加锁。
- TiDB 收到所有 prewrite 响应且所有 prewrite 都成功。
- TiDB 向 PD 获取第二个全局唯一递增版本号，定义为本次事务的 commit_ts。
- TiDB 向 Primary Key 所在 TiKV 发起第二阶段提交。TiKV 收到 commit 操作后，检查数据合法性，清理 prewrite 阶段留下的锁。
- TiDB 收到两阶段提交成功的信息。

6.TiDB 向客户端返回事务提交成功的信息。

7.TiDB 异步清理本次事务遗留的锁信息。

**流程图**

![0001.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/0001-1662709102125.png)

### 遇到写写冲突怎么办？

当事务提交时，如果发现写写冲突，TiDB 内部重新执行包含写操作的 SQL 语句。你可以通过设置 tidb_disable_txn_auto_retry = OFF 开启自动重试，并通过 tidb_retry_limit 设置重试次数：

> \# 设置是否禁用自动重试，默认为 “on”，即不重试。
>
> tidb_disable_txn_auto_retry = OFF
>
> \# 控制重试次数，默认为 “10”。只有自动重试启用时该参数才会生效。
>
> 当 “tidb_retry_limit= 0” 时，也会禁用自动重试。
>
> tidb_retry_limit = 10

TiDB 默认不进行事务重试，因为重试事务可能会导致更新丢失，从而破坏可重复读的隔离级别。事务重试的局限性与其原理有关。事务重试可概括为以下三个步骤：

- 重新获取 start_ts。
- 重新执行包含写操作的 SQL 语句。
- 再次进行两阶段提交。

第二步中，重试时仅重新执行包含写操作的 SQL 语句，并不涉及读操作的 SQL 语句。但是当前事务中读到数据的时间与事务真正开始的时间发生了变化，写入的版本变成了重试时获取的 start_ts 而非事务一开始时获取的 start_ts。因此，当事务中存在依赖查询结果来更新的语句时，重试将无法保证事务原本可重复读的隔离级别，最终可能导致结果与预期出现不一致。

如果业务可以容忍事务重试导致的异常，或并不关注事务是否以可重复读的隔离级别来执行，则可以开启自动重试。

## TiDB 悲观事务模式

TiDB 的悲观事务模式，悲观事务的行为和 MySQL 基本一致，在执行阶段就会上锁，先到先得，避免冲突情况下的重试，可以保证有较多冲突的事务的成功率。悲观锁同时解决了希望通过 select for update 对数据提前锁定的场景。但如果业务场景本身冲突较少，乐观锁的性能会更有优势。

### 开启悲观事务

> SET GLOBAL tidb_txn_mode = 'pessimistic';
> 或
> BEGIN PESSIMISTIC;

### 悲观事务原理

1.客户端开始一个事务。（与乐观锁相同）

- TiDB 从 PD 获取一个全局唯一递增的时间戳作为当前事务的唯一事务 ID，这里称为该事务的 start_ts。TiDB 实现了多版本并发控制 (MVCC)，因此 start_ts 同时也作为该事务获取的数据库快照版本。该事务只能读到此 start_ts 版本可以读到的数据。

2.客户端发起读请求。（与乐观锁相同）

- TiDB 从 PD 获取数据路由信息，即数据具体存在哪个 TiKV 节点上。
- TiDB 从 TiKV 获取 start_ts 版本下对应的数据。

3.客户端发起写请求。（与乐观锁不同）

- 从 PD 获取当前 tso 作为当前锁的 for_update_ts
- TiDB 将写入信息写入 TiDB 的内存中（与乐观锁相同）
- 使用 for_update_ts 并发地对所有涉及到的 Key 发起加悲观锁（acquire pessimistic lock）请求，
- 如果加锁成功，TiDB 向客户端返回写成功的请求
- 如果加锁失败
- 如果遇到 Write Conflict， 重新回到步骤 1 直到加锁成功。
- 如果超时或其他异常，返回客户端异常信息

4.客户端发起 commit。（与乐观锁相同）

5.TiDB 开始两阶段提交，在保证事务原子性的前提下，进行数据持久化。（与乐观锁相同）

- TiDB 从当前要写入的数据中选择一个 Key 作为当前事务的 Primary Key。
- TiDB 从 PD 获取所有数据的写入路由信息，并将所有的 Key 按照所有的路由进行分类。
- TiDB 并发地向所有涉及的 TiKV 发起 prewrite 请求。TiKV 收到 prewrite 数据后，检查数据版本信息是否存在冲突或已过期。符合条件的数据会被加锁。
- TiDB 收到所有 prewrite 响应且所有 prewrite 都成功。
- TiDB 向 PD 获取第二个全局唯一递增版本号，定义为本次事务的 commit_ts。
- TiDB 向 Primary Key 所在 TiKV 发起第二阶段提交。TiKV 收到 commit 操作后，检查数据合法性，清理 prewrite 阶段留下的锁。
- TiDB 收到两阶段提交成功的信息。

6.TiDB 向客户端返回事务提交成功的信息。（与乐观锁相同） 

7.TiDB 异步清理本次事务遗留的锁信息。（与乐观锁相同）

**流程图**

![0002.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/0002-1662709179787.png)

### 如何加悲观锁

•  检查 TiKV 中锁情况，如果发现有锁

​          • 不是当前同一事务的锁，返回 KeyIsLocked Error

​          • 锁的类型不是悲观锁，返回锁类型不匹配（意味该请求已经超时）

​          • 如果发现 TiKV 里锁的 for_update_ts 小于当前请求的 for_update_ts(同一个事务重复更新)， 使用当前请求的 for_update_ts 更新该锁

​           • 其他情况，为重复请求，直接返回成功

• 检查是否存在更新的写入版本，如果有写入记录

​           • 检查历史版本，如果发现当前请求的事务有没有被 Rollback 过，返回 PessimisticLockRollbacked 错误

​           • 若已提交的 commit_ts 比当前的 for_update_ts 更新，说明存在冲突，返回 WriteConflict Error

​           • 如果已提交的数据是当前事务的 Rollback 记录，返回 PessimisticLockRollbacked 错误

​           • 若已提交的 commit_ts 比当前事务的 start_ts 更新，说明在当前事务 begin 后有其他事务提交过

• 给当前请求 key 加上悲观锁，并返回成功

## 乐观事务的写写冲突

### 出现写写冲突的原因

乐观事务模式下，在事务执行过程中并不会做冲突检测，而是在事务最终 COMMIT 提交时触发两阶段提交，并检测是否存在写写冲突。当出现写写冲突，并且开启了事务重试机制，则 TiDB 会在限定次数内进行重试，最终重试成功或者达到重试次数上限后，会给客户端返回结果。因此，如果 TiDB 集群中存在大量的写写冲突情况，容易导致集群的 Duration 比较高。

写写冲突发生在 prewrite 阶段，当发现有其他的事务在写当前 Key (data.commit_ts > txn.start_ts)，则会发生写写冲突。

### 如何判断当前集群存在写写冲突

- 方式一：

通过 TiDB 监控面板中 KV Errors 监控栏中 KV Retry Duration 监控指标项，查看 KV 重试请求的时间

![0003.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/0003-1662709477418.png)

也可以通过 TiDB 日志查看是否有 [kv:9007]Write conflict 关键字，如果搜索到对应关键字，则可以表明集群中存在写写冲突。

- 方式二：

当出现写写冲突的时候，可以在 TiDB 日志中看到类似的日志：

```
[2020/05/12 15:17:01.568 +08:00] [WARN] [session.go:446] ["commit failed"] [conn=3] ["finished txn"="Txn{state=invalid}"] [error="[kv:9007]Write conflict, txnStartTS=416617006551793665, conflictStartTS=416617018650001409, conflictCommitTS=416617023093080065, key={tableID=47, indexID=1, indexValues={string, }} primary={tableID=47, indexID=1, indexValues={string, }} [try again later]"]
```

## 悲观事务下也有写写冲突？？？

### 场景一：乐观事务与悲观事务混用，会导致写写冲突

测试步骤：先乐观再悲观、悲观先commit、乐观再commit

1.sessionA以乐观模式执行该语句

```
21:26:31 [10.221.184.213] {root} (test) > begin OPTIMISTIC;
Query OK, 0 rows affected (0.00 sec)

21:27:36 [10.221.184.213] {root} (test) > update trade_order_seller_wangw set sub_order_status = 2010 where sub_order_no = '110121151637337178';
Query OK, 1 row affected (0.01 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

2.sessionB以悲观模式执行该语句

```
21:26:38 [10.221.184.213] {root} (test) > START TRANSACTION;
Query OK, 0 rows affected (0.01 sec)

21:27:48 [10.221.184.213] {root} (test) > update trade_order_seller_wangw SET seller_feature = '{\"incomeStatus\":0}' where seller_id = 1613155550 and sub_order_no = '110121151637337178';
Query OK, 1 row affected (0.00 sec)
Rows matched: 1  Changed: 1  Warnings: 0
```

3.sessionB执行commit

```
21:27:52 [10.221.184.213] {root} (test) > commit;
Query OK, 0 rows affected (0.00 sec)
```

4.sessionA执行commit、出现写写冲突

```
21:27:42 [10.221.184.213] {root} (test) > commit;
ERROR 9007 (HY000): Write conflict, txnStartTS=435308476475899906, conflictStartTS=435308479739330659, conflictCommitTS=435308490500341787, key={tableID=147, handle=1} primary={tableID=147, handle=1} [try again later]
21:28:35 [10.221.184.213] {root} (test) >
```

日志错误：

```
[tidb@xxxxx_tidb_tidb-002 log]$ cat tidb.log | grep "commit failed"
[2022/08/15 21:28:34.805 +08:00] [WARN] [session.go:737] ["commit failed"] [conn=2179787] ["finished txn"="Txn{state=invalid}"] [error="[kv:9007]Write conflict, txnStartTS=435308476475899906, conflictStartTS=435308479739330659, conflictCommitTS=435308490500341787, key={tableID=147, handle=1} primary={tableID=147, handle=1} [try again later]"]
[tidb@xxxxx_tidb_tidb-002 log]$ cat tidb.log | grep "can not retry txn"
[2022/08/15 21:28:34.805 +08:00] [WARN] [session.go:721] ["can not retry txn"] [conn=2179787] [label=general] [error="[kv:9007]Write conflict, txnStartTS=435308476475899906, conflictStartTS=435308479739330659, conflictCommitTS=435308490500341787, key={tableID=147, handle=1} primary={tableID=147, handle=1} [try again later]"] [IsBatchInsert=false] [IsPessimistic=false] [InRestrictedSQL=false] [tidb_retry_limit=10] [tidb_disable_txn_auto_retry=true]
[tidb@xxxxx_tidb_tidb-002 log]$ cat tidb.log | grep "run statement failed"
[2022/08/15 21:28:34.805 +08:00] [WARN] [session.go:1583] ["run statement failed"] [conn=2179787] [schemaVersion=80] [error="previous statement: update trade_order_seller_wangw set sub_order_status = 2010 where sub_order_no = '110121151637337178': [kv:9007]Write conflict, txnStartTS=435308476475899906, conflictStartTS=435308479739330659, conflictCommitTS=435308490500341787, key={tableID=147, handle=1} primary={tableID=147, handle=1} [try again later]"] [session="{\n  \"currDBName\": \"test\",\n  \"id\": 2179787,\n  \"status\": 2,\n  \"strictMode\": true,\n  \"user\": {\n    \"Username\": \"root\",\n    \"Hostname\": \"10.50.6.25\",\n    \"CurrentUser\": false,\n    \"AuthUsername\": \"root\",\n    \"AuthHostname\": \"%\"\n  }\n}"]
```

### 场景二：版本的小Bug也会引起写写冲突

某电商场景:

1、卖家发货后，会修改买家订单表的状态，买家订单表的binlog会同步到卖家表，这时会更新卖家表信息。

2、卖家发货后，也会存储卖家自己的一些信息，这时候又会更新卖家表信息。

卖家表存在根据唯一约束索引并发更新的情况，每隔几天则会偶发出现锁锁冲突的报错。

**报错信息：**

```
异常：db error,update fail:Could not commit JDBC transaction; nested exception is java.sql.SQLException: Internal error: Write conflict, txnStartTS=435377787387510819, conflictStartTS=435377787387510812, conflictCommitTS=435377787387510826, key={tableID=89, indexID=5, indexValues={31289032, 185, 185, 664243619, }} primary={tableID=89, indexID=1, indexValues={11012, }} [try again later]
```

### 环境说明

TiDB 版本：5.3.0

遇到的问题：悲观锁事务遇到写冲突报错

复现路径：偶发的update操作

问题现象及影响：update执行失败导致事务回滚

TiDB Server日志：

```
第一次出现update是在10.xxx.122节点，update语句执行成功。152540 [2022/08/17 12:52:44.340 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=16633947] [user=seller_db@10.xx.xx.xx] [schemaVersion=127] [txnStartTS=0] [forUpdateTS=0] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql="SET autocommit=0"]152541 [2022/08/17 12:52:44.341 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=16633947] [user=seller_db@10.xx.xx.xx] [schemaVersion=127] [txnStartTS=0] [forUpdateTS=0] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql="select @@session.transaction_read_only"]152542 [2022/08/17 12:52:44.342 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=16633947] [user=seller_db@10.xx.xx.xx] [schemaVersion=127] [txnStartTS=0] [forUpdateTS=0] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql="/*DD1WW: primary=true :DD1WW*/update trade_xxx      SET seller_feature = '{\"incomeStatus\":0}',                       delivery_no = 'xxxx843360604'             where seller_id = 15604 and sub_order_no = '11012'"]152543 [2022/08/17 12:52:44.345 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=16633947] [user=seller_db@10.xx.xx.xx] [schemaVersion=127] [txnStartTS=435345677198557261] [forUpdateTS=435345677198557261] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql=commit]152545 [2022/08/17 12:52:44.353 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=16633947] [user=seller_db@10.xx.xx.xx] [schemaVersion=127] [txnStartTS=0] [forUpdateTS=0] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql="SET autocommit=1"]
第二次出现update在10.xxxx.30节点，出现update报错情况。105216 [2022/08/17 12:52:44.460 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=28871079] [user=seller_db@10.xx.xx.xx] [schemaVersion=127] [txnStartTS=0] [forUpdateTS=0] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql="SET autocommit=0"]105217 [2022/08/17 12:52:44.460 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=28871079] [user=seller_db@10.xx.xx.xx] [schemaVersion=127] [txnStartTS=0] [forUpdateTS=0] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql="select @@session.transaction_read_only"]105219 [2022/08/17 12:52:44.461 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=28871079] [user=seller_db@10.xx.xx.xx] [schemaVersion=127] [txnStartTS=0] [forUpdateTS=0] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql="/*DD1WW: primary=true :DD1WW*/update trade_xxx      SET sub_order_status = 2010      where sub_order_no = '11012'"]105226 [2022/08/17 12:52:44.473 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=28871079] [user=seller_db@10.xx.xx.xx] [schemaVersion=127] [txnStartTS=435345677198557269] [forUpdateTS=435345677211664411] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql=commit]105229 [2022/08/17 12:52:44.477 +08:00] [WARN] [session.go:721] ["can not retry txn"] [conn=28871079] [label=general] [error="[kv:9007]Write conflict, txnStartTS=435345677198557269, conflictStartTS=435345677198557261, conflictCommitTS=435345677211664401, key={tableID=89, indexID=11, indexValues={1556820604, 1850, 185, 2000, 662874147, }} primary={tableID=89, indexID=1, indexValues={1101, }} [try again later]"] [IsBatchInsert=false] [IsPessimistic=true] [InRestrictedSQL=false] [tidb_retry_limit=10] [tidb_disable_txn_auto_retry=true]105230 [2022/08/17 12:52:44.477 +08:00] [WARN] [session.go:737] ["commit failed"] [conn=28871079] ["finished txn"="Txn{state=invalid}"] [error="[kv:9007]Write conflict, txnStartTS=435345677198557269, conflictStartTS=435345677198557261, conflictCommitTS=435345677211664401, key={tableID=89, indexID=11, indexValues={1556820604, 185, 185, 2000, 662874147, }} primary={tableID=89, indexID=1, indexValues={110122204143168401, }} [try again later]"]105231 [2022/08/17 12:52:44.477 +08:00] [WARN] [session.go:1583] ["run statement failed"] [conn=28871079] [schemaVersion=127] [error="previous statement: /*DD1WW: primary=true :DD1WW*/update trade_XXXX      SET sub_order_status = 2010      where sub_order_no = '110122204143168401': [kv:9007]Write conflict, txnStartTS=435345677198557269, conflictStartTS=435345677198557261, conflictCommitTS=435345677211664401, key={tableID=89, indexID=11, indexValues={1556820604, 185, 185, 2000, 662874147, }} primary={tableID=89, indexID=1, indexValues={11012, }} [try again later]"] [session="{\n  \"currDBName\": \"seller_db\",\n  \"id\": 28871079,\n  \"status\": 0,\n  \"strictMode\": true,\n  \"user\": {\n    \"Username\": \"seller_db\",\n    \"Hostname\": \"10.xxxx.81\",\n    \"CurrentUser\": false,\n           \"AuthUsername\": \"seller_db\",\n    \"AuthHostname\": \"%\"\n  }\n}"]105232 [2022/08/17 12:52:44.477 +08:00] [INFO] [conn.go:1069] ["command dispatched failed"] [conn=28871079] [connInfo="id:28871079, addr:10.240.61.81:53048 status:0, collation:utf8_general_ci, user:seller_db"] [command=Query] [status="inTxn:0, autocommit:0"] [sql=commit] [txn_mode=PESSIMISTIC] [err="[kv:9007]Write conflict, txnStartTS=435345677198557269, conflictStartTS=435345677198557261, conflictCommitTS=435345677211664401, key={tableID=89, indexID=11, indexValues={1556820604, 185, 185, 2000, 662874147, }} primary={tableID=89, indexID=1, indexValues={11012, }} [try again later]\nprevious s       tatement: /*DD1WW: primary=true :DD1WW*/update trade_xxx      SET sub_order_status = 2010      where sub_order_no = '11012'"]105233 [2022/08/17 12:52:44.478 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=28871079] [user=seller_db@10.xxxx.81] [schemaVersion=127] [txnStartTS=0] [forUpdateTS=0] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql=rollback]105234 [2022/08/17 12:52:44.478 +08:00] [INFO] [session.go:2890] [GENERAL_LOG] [conn=28871079] [user=seller_db@10.xxxx.81] [schemaVersion=127] [txnStartTS=0] [forUpdateTS=0] [isReadConsistency=false] [current_db=seller_db] [txn_mode=PESSIMISTIC] [sql="SET autocommit=1"]
```

#### 排查思路

1.查看研发代码，确定是否使用的是悲观事务，是否有悲观事务、乐观事务混用的情况。✅

> 与研发查看，确定此代码都是悲观事务方式执行。

2.查看数据库代理层接入，是否存在链接复用、链接窜用的情况。✅

> 在业务报错的时间点，数据库代理层并未出现错误日志信息，会话链接正常。

3.场景模拟，在悲观事务下是否可以复现该问题。✅

> 通过多个session测试悲观事务下的锁情况，悲观事务不会出现写写冲突。

4.排查完以上原因后，最后一个可能的点就是数据库本身有 Bug。❎

> 我们咨询了社区的其他用户，大部分未反馈该问题，反馈问题的也未得到明确答复。所以我们在 github 的 issue 种排查了相关writ Conflict 的相关 case。
>
> 通过issues排查，找到了类似Bug：https://github.com/tikv/tikv/issues/11612

![0004.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/0004-1662709553426.png)

终于找到了一个和我们类似的问题，并且令人惊喜的是这个issue 已经close，并且 PR 已经被merged 到了一个小版本。而小版本的升级对 TIDB 来说是没有什么风险的。https://github.com/tikv/tikv/pull/12763

1.  业务低峰进行版本升级✅

> TiDB 集群的升级方式是不停机升级，即升级过程中集群仍然可以对外提供服务。升级时会对各节点逐个迁移 leader 后再升级和重启，升级过程中只会造成个别请求耗时变长。
>
> 集群从5.3.0升级为5.3.2版本，观察一周问题没有复现，彻底解决！！！

## Prewrite、Commit阶段

### Prewrite阶段

#### Prewrite阶段（Primary）

首先在所有行的写操作中选出一个作为primary，其他的为secondaries。

PrewritePrimary: 对primaryRow写入到聚族Lock上进行加锁，Lock中会记录本次事务的开始时间戳。写入Lock前会检查:

1.是否已经有别的客户端已经上锁 (Locking)。

2.是否在本次事务开始时间之后，检查聚族Write，是否有更新[startTs, +Inf) 的写操作已经提交 (Conflict)。

在这两种情况下会返回事务冲突。否则，就成功上锁。将行的内容写入row中，时间戳设置为startTs。

#### Prewrite阶段（secondaries）:

将primaryRow的锁上好了以后，进行secondaries的prewrite流程:

1.类似primaryRow 的上锁流程，只不过锁的内容为事务开始时间primaryRow的Lock的信息。

2.检查的事项同primaryRow的一致。

3.当锁成功写入后，写入row，时间戳设置为startTs。

以上Prewrite 流程任何一步发生错误，都会进行回滚：删除Lock，删除版本为startTs的数据。

### Commit阶段

当Prewrite完成以后，进入Commit阶段，当前时间戳为commitTs，且commitTs> startTs :

1.commit primary：将数据写入聚族Write，时间戳为commitTs，内容为startTs，表明数据的最新版本是 startTs 对应的数据。

2.删除聚簇Lock上的锁信息。

如果 primary row提交失败的话，全事务回滚，回滚逻辑同prewrite。如果commit primary成功，则可以异步的commit secondaries, 流程和commit primary 一致， 失败了也无所谓。

## 注意事项

- 写写冲突频繁建议悲观事务 乐观事务模型下，将修改冲突视为事务提交的一部分。因此并发事务不常修改同一行时，可以跳过获取行锁的过程进而提升性能。但是并发事务频繁修改同一行（冲突）时，乐观事务 的性能可能低于 悲观事务。
- autocommit 事务优先采用乐观事务提交。使用悲观事务模式时，autocommit 事务首先尝试使用开销更小的乐观事务模式提交。如果发生了写冲突，重试时才会使用悲观事务提交。所以 tidb_retry_limit = 0 时，autocommit 事务遇到写冲突仍会报 Write Conflict 错误。