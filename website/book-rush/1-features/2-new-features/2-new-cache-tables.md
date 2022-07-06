#  TiDB v6.0.0 DMR 源码阅读——缓存表

## 引言

用过  TiDB 的小伙伴，或多或少都头疼过  TiDB 读写热点的问题，这也是  TiDB 无法避免的问题，而为了有效缓解在实际生产中，比较常见的读写热点问题， TiDB 也在各种方面做出了自己的尝试，比如说，其在 v6.0.0 推出的缓存表，就是一个有效解决小表读热点问题的新特性。注意这里的定语，有两个，一个是小表，一个是读热点，文后笔者会一一解释。



## 简介

在  TiDB 中，数据调度的最小单位为 Region ，新建一张表，意味着新建一个 Region ，如果这张表的数据不够多的话，默认情况下，这些数据就只会存在这一个 Region 上，这样，在  TiDB 上频繁对这些小表进行读查询时，就很容易出现对某个 Region 的热点操作，出现读热点问题，对 TiKV 造成一定的压力，进而导致整个集群出现性能瓶颈，这也就是前面提到的小表读热点问题。

缓存表，主要就是将这种小表中的数据，先一步从 Region 读到 tidb-server的内存中缓存起来，有点类似 MySQL 的内存表，当查询使用到这种表的时候，就直接从 tidb-server 的内存中读取，进而节省到 TiKV 节点访问相应数据的时间。所以，缓存表的优点：

- 减少到 TiKV 节点访问数据的频次，节省分布式组件之间在网络链路上的时间消耗；
- 不会出现，因单个 Region 的读热点造成的， TiDB 整个集群的读性能损失；
- 降低查询时延，提升查询效率，充分利用分布式资源；

 当然，缓存表也有它的使用限制：

- 目前是限制表总大小不能超过 64MB，因为每张小表会被加载到内存中缓存起来，并且这个缓存不是一直存在的，是存在租约时间的（文后会有解释），缓存是会失效的，需要重新加载，所以表不宜过大 ；
- 缓存表对写极不友好，因此适合于只读表，或者几乎不会对表中数据进行更新的表；
- 不允许直接对缓存表进行 DDL 操作，需要将缓存表转换为普通表，才能进行 DDL 操作；

综上，缓存表比较适合于具备以下特点的表：

- 表的数据量不大；
- 只读表，或者几乎很少修改的表；
- 表的访问非常频繁，希望避免因出现读热点而造成的性能损失；

因此 TiDB 缓存表的典型使用场景如下：

- 配置表，业务通过该表读取配置信息
- 金融场景中的存储汇率的表，该表不会实时更新，每天只更新一次
- 银行分行或者网点信息表，该表很少新增记录项

以配置表为例，当业务重启的瞬间，全部连接一起加载配置，会造成较高的数据库读延迟。如果使用了缓存表，则可以解决这样的问题。



## 原理

接下来，笔者会带领大家从源码层面，一点点深入了解缓存表。

### 一、普通表转换为缓存表

一点一点来看，首先来看看普通表转换成缓存表的过程，使用的是 SQL 语句 `ALTER TABLE tbl_name CACHE`  。

1. `ALTER TABLE tbl_name CACHE` 会被 `Parser` 解析转化成为 `ast` 树 `ast.AlterTableCache`；

   ```yacas
   // 	Support caching or non-caching a table in memory for tidb, It can be found in the official Oracle document, see: https://docs.oracle.com/database/121/SQLRF/statements_3001.htm
   |	"CACHE"
   	{
   		$$ = &ast.AlterTableSpec{
   			Tp: ast.AlterTableCache,
   		}
   	}
   |	"NOCACHE"
   	{
   		$$ = &ast.AlterTableSpec{
   			Tp: ast.AlterTableNoCache,
   		}
   	}
   ```

   

2. 执行器 `Executor` 根据语法树类型，比如说这里属于 `DDL` 语句，会生成 `DDLExec`，接着由 `DDLExec` 根据解析出来 ` DDL` 语句的 `stmt`类型，比如说，这里是 `AlterTableStmt` ，就会调用`executeAlterTable` 方法，最终根据`ast.AlterTableCache` 调用 `AlterTableCahe` 方法。

   ```go
   ddl/ddl_api.go:3204     case ast.AlterTableCache:
   ddl/ddl_api.go:3205			err = d.AlterTableCache(sctx, ident)
   ```

3. 在`AlterTableCahe` 方法中，主要做的事情：

   - 获取表的元信息，然后根据表的元信息进行一系列判断；

   ```go
   schema, t, err := d.getSchemaAndTableByIdent(ctx, ti)
      if err != nil {
         return err
      }
   ```

   

   - 根据表的元信息，判断表是否已经是缓存表，如是，则直接结束执行，然后返回；

     根据表的元信息，判断表是否位于系统库，如是，则会报错，不支持将系统库中的表转换为缓存表；

     根据表的元信息，判断表是否是视图或临时表，如是，则会报错；

     根据表的元信息，判断表是否为分区表，如是，则会报错；

   ```go
      // if a table is already in cache state, return directly
      // 如果表已经是缓存表，则直接返回，model.TableCacheStatusEnable
      if t.Meta().TableCacheStatusType == model.TableCacheStatusEnable {
         return nil
      }
   
      // forbit cache table in system database.
      // 禁止缓存存在于系统库中的表（这里源码注释写的是forbit，笔者猜测是写错了，应该是 forbid，禁止）
      if util.IsMemOrSysDB(schema.Name.L) {
         return errors.Trace(dbterror.ErrUnsupportedAlterCacheForSysTable)
      // 判断表的TempTableType 是否为TempTableNone，如不是，则就是临时表或者视图中的一种，会报错
      } else if t.Meta().TempTableType != model.TempTableNone {
         return dbterror.ErrOptOnTemporaryTable.GenWithStackByArgs("alter temporary table cache")
      }
   
      // 如果表为分区表，也不能转换为缓存表
      if t.Meta().Partition != nil {
         return dbterror.ErrOptOnCacheTable.GenWithStackByArgs("partition mode")
      }
   ```

   - 计算表的大小，如果超过限制，则会报错；

   ```go
   succ, err := checkCacheTableSize(d.store, t.Meta().ID)
      if err != nil {
         return errors.Trace(err)
      }
      if !succ {
         return dbterror.ErrOptOnCacheTable.GenWithStackByArgs("table too large")
      }
   ```

   

   计算表大小的主要逻辑

   ```go
   const cacheTableSizeLimit = 64 * (1 << 20) // 64M
   err := kv.RunInNewTxn(context.Background(), store, true, func(ctx context.Context, txn kv.Transaction) error {
   		prefix := tablecodec.GenTablePrefix(tableID)
   		it, err := txn.Iter(prefix, prefix.PrefixNext())
   		if err != nil {
   			return errors.Trace(err)
   		}
   		defer it.Close()
   
   		totalSize := 0
   		for it.Valid() && it.Key().HasPrefix(prefix) {
               // 会发现这里表的大小计算，是统计表编码后的kv entry总大小，包括索引数据
   			key := it.Key()
   			value := it.Value()
   			totalSize += len(key)
   			totalSize += len(value)
   
   			if totalSize > cacheTableSizeLimit {
   				succ = false
   				break
   			}
   
   			err = it.Next()
   			if err != nil {
   				return errors.Trace(err)
   			}
   		}
   		return nil
   	})
   ```

   

   - 执行一个 SQL 语句，往 `mysql.table_cache_meta` 中插入一条数据，记录信息；

   ```GO
   ddlQuery, _ := ctx.Value(sessionctx.QueryString).(string)
      // Initialize the cached table meta lock info in `mysql.table_cache_meta`.
      // The operation shouldn't fail in most cases, and if it does, return the error directly.
      // This DML and the following DDL is not atomic, that's not a problem.
      _, err = ctx.(sqlexec.SQLExecutor).ExecuteInternal(context.Background(),
         "insert ignore into mysql.table_cache_meta values (%?, 'NONE', 0, 0)", t.Meta().ID)
      if err != nil {
         return errors.Trace(err)
      }
      ctx.SetValue(sessionctx.QueryString, ddlQuery)
   ```

   

   - 生成一个类型为 `model.ActionAlterCacheTable` 的 `DDLjob`，然后调用 `doDDLjob`执行；

   ```go
   job := &model.Job{
         SchemaID:   schema.ID,
         SchemaName: schema.Name.L,
         TableID:    t.Meta().ID,
         Type:       model.ActionAlterCacheTable,
         BinlogInfo: &model.HistoryInfo{},
         Args:       []interface{}{},
      }
   
      err = d.doDDLJob(ctx, job)
   ```

   

4. 前面生成一个 `model.ActionAlterCacheTable` 类型的 `DDLjob`，接下来进入到该 `DDLjob` 的执行阶段，会根据类型调用 `onAlterCacheTable` 方法，这个方法中的主要逻辑

   - 获取表元信息，进行一系列判断

   ```go
       // 获取表元信息
       tbInfo, err := getTableInfoAndCancelFaultJob(t, job, job.SchemaID)
   	if err != nil {
   		return 0, errors.Trace(err)
   	}
   	// If the table is already in the cache state
       // 判断表是否已经是缓存表，如是则会直接结束该job
   	if tbInfo.TableCacheStatusType == model.TableCacheStatusEnable {
   		job.FinishTableJob(model.JobStateDone, model.StatePublic, ver, tbInfo)
   		return ver, nil
   	}
       
       // 没错，这里又会判断一遍是否为临时表、视图或者分区表
   	if tbInfo.TempTableType != model.TempTableNone {
   		return ver, errors.Trace(dbterror.ErrOptOnTemporaryTable.GenWithStackByArgs("alter temporary table cache"))
   	}
   
   	if tbInfo.Partition != nil {
   		return ver, errors.Trace(dbterror.ErrOptOnCacheTable.GenWithStackByArgs("partition mode"))
   	}
   ```

   

   - 转换表，这里会有三个类型，默认情况下，普通表的 `TableCacheStatusType` 为`TableCacheStatusDisable`，也就是 `disable`，进入这里之后会被转换为 `TableCacheStatusSwitching`，这是一个中间态，意味着表正在往缓存表进行转换，然后，才能从 `switching`转换为`enable`，对应程序里的`TableCacheStatusEnable`，表的缓存状态变成 `enable` 之后，`alterTableCache`  的`DDLjob`才会结束，此时普通表就会转换为缓存表类型，这段转换过程到此就结束了。

   ```go
   switch tbInfo.TableCacheStatusType {
   	case model.TableCacheStatusDisable:
   		// disable -> switching
   		tbInfo.TableCacheStatusType = model.TableCacheStatusSwitching
   		ver, err = updateVersionAndTableInfoWithCheck(t, job, tbInfo, true)
   		if err != nil {
   			return ver, err
   		}
   	case model.TableCacheStatusSwitching:
   		// switching -> enable
   		tbInfo.TableCacheStatusType = model.TableCacheStatusEnable
   		ver, err = updateVersionAndTableInfoWithCheck(t, job, tbInfo, true)
   		if err != nil {
   			return ver, err
   		}
   		// Finish this job.
   		job.FinishTableJob(model.JobStateDone, model.StatePublic, ver, tbInfo)
   	default:
   		job.State = model.JobStateCancelled
   		err = dbterror.ErrInvalidDDLState.GenWithStackByArgs("alter table cache", tbInfo.TableCacheStatusType.String())
   	}
   	return ver, err
   ```



走到这里，会发现转换过程已经结束了，而文档提到的最重要的一个机制，**lease**，在整个转换过程中并未出现，让人不禁好奇，缓存表最重要的租约时间，是在哪赋予给表的？此时表中的数据已经缓存到 tidb-server 内存当中了吗？不急，可以接着往下看。


![image](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-20220616183329620-1655462532116.png)


### 二、lock & lease

摘录文档的一段话：

> 缓存表的写入延时高是受到实现的限制。存在多个  TiDB 实例时，一个  TiDB  实例并不知道其它的  TiDB 实例是否缓存了数据，如果该实例直接修改了表数据，而其它  TiDB 实例依然读取旧的缓存数据，就会读到错误的结果。为了保证数据正确性，缓存表的实现使用了一套基于 lease 的复杂机制：读操作在缓存数据同时，还会对于缓存设置一个有效期，也就是 lease。在 lease 过期之前，无法对数据执行修改操作。因为修改操作必须等待 lease 过期，所以会出现写入延迟。

这段话不难理解，为了实现缓存表，同时为了保证数据的准确性，TiDB 引入了一套基于 lease 的复杂机制，在 lease 期间内，只能对表做读操作，此时会对表上一个 `READ lock`，同时阻塞写操作，而 `READ lease` 过期之后，才能对该表执行数据修改的操作，此时会到 TiKV 中修改，同时读操作也会到 TiKV 中读取相应数据，此时读的性能会下降，进而需要续约。不禁又有疑惑，续约租期时间是怎么续的？

刚创建缓存表，没有对该表做任何查询、更新操作，通过 `mysql.table_cache_meta` 去看该表的 `CACHE` 信息，会发现，该表此时是没有上锁，也没有租约时间的，按照笔者的想法，这里应该有个 `READ lock`，但事实是没有的，刚创建的缓存表，`lock_type` 为 `NONE`，lease 也为 0 。

```mysql
MySQL [test]> alter table settings cache;
Query OK, 0 rows affected, 1 warning (0.27 sec)

MySQL [test]> SHOW CREATE TABLE settings\G
*************************** 1. row ***************************
       Table: settings
Create Table: CREATE TABLE `settings` (
  `id` int(11) NOT NULL,
  `name` varchar(36) NOT NULL,
  `value` varchar(36) NOT NULL,
  `enabled` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin /* CACHED ON */
1 row in set (0.08 sec)


MySQL [test]> select * from mysql.table_cache_meta;
+-----+-----------+--------------------+--------------+
| tid | lock_type | lease              | oldReadLease |
+-----+-----------+--------------------+--------------+
|  65 | NONE      | 0                  |            0 |
+-----+-----------+--------------------+--------------+
1 row in set (0.08 sec)

```

此时，查询数据会直接从缓存中读数据吗？

```mysql
MySQL [test]> trace select * from settings;
+------------------------------------------------------------------------+-----------------+------------+
| operation                                                              | startTS         | duration   |
+------------------------------------------------------------------------+-----------------+------------+
| trace                                                                  | 09:08:31.272490 | 5.707961ms |
|   ├─session.ExecuteStmt                                                | 09:08:31.272496 | 513.097µs  |
|   │ ├─executor.Compile                                                 | 09:08:31.272505 | 215.399µs  |
|   │ └─session.runStmt                                                  | 09:08:31.272758 | 230.399µs  |
|   │   └─UnionScanExec.Open                                             | 09:08:31.272857 | 94.299µs   |
|   │     ├─TableReaderExecutor.Open                                     | 09:08:31.272862 | 54.999µs   |
|   │     │ └─distsql.Select                                             | 09:08:31.272879 | 22.399µs   |
|   │     │   └─regionRequest.SendReqCtx                                 | 09:08:31.273055 | 4.980766ms |
|   │     │     └─rpcClient.SendRequest, RegionID: 2, type: Cop         | 09:08:31.273086 | 4.903467ms |
|   │     ├─buildMemTableReader                                          | 09:08:31.272926 | 6.2µs      |
|   │     └─memTableReader.getMemRows                                    | 09:08:31.272937 | 4.7µs      |
|   ├─*executor.ProjectionExec.Next                                      | 09:08:31.273020 | 5.123365ms |
|   │ └─*executor.UnionScanExec.Next                                     | 09:08:31.273022 | 5.112565ms |
|   │   ├─*executor.TableReaderExecutor.Next                             | 09:08:31.273025 | 5.068765ms |
|   │   └─*executor.TableReaderExecutor.Next                             | 09:08:31.278118 | 7.6µs      |
|   └─*executor.ProjectionExec.Next                                      | 09:08:31.278152 | 22.899µs   |
|     └─*executor.UnionScanExec.Next                                     | 09:08:31.278154 | 16.499µs   |
|       └─*executor.TableReaderExecutor.Next                             | 09:08:31.278157 | 3.999µs    |
+------------------------------------------------------------------------+-----------------+------------+
18 rows in set (0.09 sec)

MySQL [test]> trace select * from settings;
+-------------------------------------------+-----------------+------------+
| operation                                 | startTS         | duration   |
+-------------------------------------------+-----------------+------------+
| trace                                     | 09:04:16.749634 | 613.899µs  |
|   ├─session.ExecuteStmt                   | 09:04:16.749639 | 546.599µs  |
|   │ ├─executor.Compile                    | 09:04:16.749647 | 167µs      |
|   │ └─session.runStmt                     | 09:04:16.749836 | 329.699µs  |
|   │   └─UnionScanExec.Open                | 09:04:16.750039 | 85.099µs   |
|   │     ├─TableReaderExecutor.Open        | 09:04:16.750042 | 16.7µs     |
|   │     ├─buildMemTableReader             | 09:04:16.750073 | 6.2µs      |
|   │     └─memTableReader.getMemRows       | 09:04:16.750085 | 26.899µs   |
|   ├─*executor.ProjectionExec.Next         | 09:04:16.750195 | 13.8µs     |
|   │ └─*executor.UnionScanExec.Next        | 09:04:16.750198 | 4.9µs      |
|   └─*executor.ProjectionExec.Next         | 09:04:16.750217 | 7.3µs      |
|     └─*executor.UnionScanExec.Next        | 09:04:16.750218 | 1.6µs      |
+-------------------------------------------+-----------------+------------+
12 rows in set (0.08 sec)

MySQL [test]> select * from mysql.table_cache_meta;
+-----+-----------+--------------------+--------------+
| tid | lock_type | lease              | oldReadLease |
+-----+-----------+--------------------+--------------+
|  65 | READ      | 433962085081415680 |            0 |
+-----+-----------+--------------------+--------------+
1 row in set (0.08 sec)

```

通过 trace 来看，缓存表刚创建时，第一次读取读表中数据，还是会通过 `rpcClient.SendRequest` 到  TiKV 中查询数据，此时数据是还存储在 TiKV 中，而在 lease 时间内，再读一次，会发现此时数据是通过 `memTableReader.getMemRows` 从缓存中读取。

这时，前面的疑惑就解开了，**缓存表刚创建时，表中的数据还没有缓存到 tidb-server 的内存当中，而是在第一次读取数据之后，才会缓存数据，同时赋予表 lease 期限**，这也意味着在 lease 期间读数据，都是直接从 tidb-server 的内存中读取数据。

关于续约的问题也迎刃而解了，**当租约过期之后，TiDB 是不会主动从 TiKV 中将对应的数据读取到 tidb-server 的内存中缓存起来的，当重新再读这张表的时候，就会被赋予一个新的 lease 期限，就相当于续约啦**。

```go
// 生成一个新 lease
func (c *cachedTable) renewLease(ts uint64, data *cacheData, leaseDuration time.Duration) {
   defer func() { <-c.renewReadLease }()

   failpoint.Inject("mockRenewLeaseABA2", func(_ failpoint.Value) {
      <-TestMockRenewLeaseABA2
   })

   tid := c.Meta().ID
   lease := leaseFromTS(ts, leaseDuration)
   newLease, err := c.handle.RenewReadLease(context.Background(), tid, data.Lease, lease)
   if err != nil && !kv.IsTxnRetryableError(err) {
      log.Warn("Renew read lease error", zap.Error(err))
   }
   if newLease > 0 {
      c.cacheData.Store(&cacheData{
         Start:     data.Start,
         Lease:     newLease,
         MemBuffer: data.MemBuffer,
      })
   }

   failpoint.Inject("mockRenewLeaseABA2", func(_ failpoint.Value) {
      TestMockRenewLeaseABA2 <- struct{}{}
   })
}
```



## 总结

本篇文章主要带领大家从源码层面，了解缓存表整个的创建过程，对其源码有一个简单的分析与介绍，其次，对于缓存表的 lease 机制有一个简单的解释，其实里面还有很多复杂的设计，也十分的精彩，未来如果有时间的话，笔者再拉出相应代码，一起分析下。

其实，笔者对于配合缓存表推出的系统表`mysql.table_cache_meta` ，有几点想吐槽，

- 第一，如果不翻看源码，还真不知道这个表的存在，后面看到[专栏 - 一篇文章说透缓存表 |  `TiDB` 社区](https://tidb.net/blog/f663f0f5)才知道有这个表的存在；
- 第二，这张表在使用体验上，并不是那么的美好，信息更新有滞后性，不准，比如说，test 缓存表的租约到期之后，这张表上显示的 test 表的 lock_type 仍为 `READ`，但实际上，test表 此时是能够直接插入数据的，并不会出现写阻塞，只有往 test 缓存表写进去一条数据，`table_cache_meta`表中关于 test 表的信息才会更新，`READ lock` 变为 `WRITE lock`；
- 第三，如果将缓存表变为普通表，`mysql.table_cache_meta` 中的记录并不会被删除，是否有点不合理？个人感觉删除会好一些。

也许这种表在设计之初就还没打算让用户知道。

不过，作为一个在v6.0.0 DMR 推出的新特性，其在解决小表读热点问题上的突出表现，有很多测试文章中已经得到了证明，这已经十分优秀了，纵使存在一点不足之处，相信在后面，会慢慢变得完善，完美。
