---
title: PointGet的一生
hide_title: true
---

# PointGet 的一生

**作者：jansu-dev**

## 一、前言

​ 此前，作为 DBA 觉得能看源码是一件很牛的事情，花了**大半年时间**对 Golang 和 Rust 入了个门（**可能入门都不算**），并写了个 Rust 小工具: [TiHC(TiDB Healthy Check)](https://github.com/jansu-dev/tihc) 有兴趣的小伙伴可以自取。

​ 期间，看过某些模块，如：[PD 如何调度 Region](https://asktug.com/t/topic/242808)，也只是窥探数据库的局部功能，总有一种 **“根本不了解数据库逻辑概念和代码是怎样关联的！”** 的感觉。因此借着 **“点查”** 避开大量复杂优化器代码的机会，尽己所能的串联一下点查在 TiDB 和 TiKV 间的执行流程。

​ 此后，越发觉得 **“产研”** 及 **“交付”** 价值的不同，比如：不能说看代码就很牛，在文档丰富、产品成熟的前提下，**学习文档才是较快速、较全面、较有价值的方法**，更多思考见总结部分。

> **Tips**
>
> ​ 1.为防止后续代码重构影响，本次对 TiDB v5.3.0 tidb 和 tikv 进行断点调试。
>
> ​ 2.为便于读者理解，在本文首次出现的函数或方法均会给出 Github 锚点链接，重复出现将不再标记 URL 链接。

## 二、摘要

​ 本文主要内容分布在 **“三、点查流程”**，所谓点查，即：执行计划的一种算子，如图所示，详见官网介绍 [Point_Get](https://docs.pingcap.com/zh/tidb/v5.2/explain-indexes#point_get-和-batch_point_get) 。**“3.1 TiDB 部分”**介绍了点查 SQL 在 TiDB 内部流转过程。**“3.2 TiKV 部分”**介绍了点查经由 TiDB 处理并请求给 TiKV 后，如何在 TiKV 内部流转、处理、返回的过程。**“3.3 总结”** 简要介绍了 tidb 点查快的原因。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646718107346.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646718153675.png)

​ 每个模块的 “Model Tips” 均会说明该模块在 TIDB 各所属组件中的作用。并且尽力采用分层描述的方式说明，所谓分层，比如：Executor 调用了 PD Client，那么只在 Executor 部分描述那个函数触发调用 PD Client 的逻辑，而不在这一层详述 PD Client 如何工作。

​ 最后，在 **“四、学习总结”** 中，介绍了**个人对 DBA 的看代码行为的价值**的观点。

## 三、点查流程

### 3.1 TiDB

​ 下述 **3.1** 部分均为点查在 TiDB 组件中涉及处理流程介绍。大致如下图：

​ **1. 首先**，客户端连接进入 MySQL Protocol Layer 接入 TiDB ，在获取 Token 后，传送 SQL 执行；

​ **2. 其次**，SQL 处理进入 Parser 层，解析成 AST（抽象语法树）；

​ **3. 再次**，SQL 处理进入 Compile 层，选出 TSO 并将 AST 编译成执行计划；

​ **4. 然后**，SQL 处理进入 Executor 层[（可 “Batch 处理” 的火山模型）](https://github.com/pingcap/tidb/blob/ad9430039f54bb9af78d44831c176bc5eafcbba0/executor/executor.go#L249-L265)，将执行计划 Open、Next、Close 完成 TiKV 数据获取;

​ **5. 最后**，SQL 处理回到 MySQL Protocol Layer 调用 writeChunks 将 MemBuffer 中数据导出成客户端所需形式返回；

​ 通过追溯 func (cc *clientConn) handleQuery(...) --> func (cc *clientConn) handleStmt(...) --> func (tc \*TiDBContext) ExecuteStmt(...) 是串联点查，从解析、编译、执行、协议回显的方法，看懂此函数对于理解全文至关重要。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646621107730.png)

3.1.1 SQL Protol Deal

> **Model Tips:**
>
> ​ TiDB SQL Protol 处理层仅是 TiDB 为实现 MySQL Protocol 兼容，所做的代码处理。 主要功能包含：监听客户端请求、分发不同 SQL 处理、调用 Parser、Compiler、Executor 完成 SQL 处理，回写结果集等功能。

​ **1. 首先**，启动 Server 时在 Struct clientConn 内部封装了 go 原生包 net 进行 TCP 通信，并在 for 循环起两个 Listener goroutine 处理客户端发过来的消息。

```go
// Run runs the server.
func (s *Server) Run() error {
    go s.startNetworkListener(s.listener, false, errChan)
    go s.startNetworkListener(s.socket, true, errChan)
        ......
}

func (s *Server) startNetworkListener(listener net.Listener, isUnixSocket bool, errChan chan error) {
    for {
        conn, err := listener.Accept()
        ......
        go s.onConn(clientConn)
        }
}
```

​ **2. 其次**，在 Dispatch 方法中会首先获取 [token](https://github.com/pingcap/tidb/blob/ad9430039f54bb9af78d44831c176bc5eafcbba0/server/conn.go#L1291) ，用于限制单个 TiDB Instance 可处理的同时执行请求的 session 个数,详情见: [token-limit](https://docs.pingcap.com/zh/tidb/v4.0/tidb-configuration-file/#token-limit);

​ **3. 再次**，在 [Struct clientConn](https://github.com/pingcap/tidb/blob/bc7304c99538643e2464d884da627979cbfddf02/server/conn.go#L172) 实现了 Run、readPacket、writePacket、handshake、openSession、handleQuery、handleStmt 等等方法，用于实现 [MySQL Client/Server Protocol](https://dev.mysql.com/doc/internals/en/overview.html)。本例中，从 MySQL Client 发来的点查 SQL 通过 [dispatch 方法](https://github.com/pingcap/tidb/blob/ad9430039f54bb9af78d44831c176bc5eafcbba0/server/conn.go#L1237) 遵照 MySQL Protocol 进入 [handleQuery](https://github.com/pingcap/tidb/blob/ad9430039f54bb9af78d44831c176bc5eafcbba0/server/conn.go#L1341) 分支处理；

​ **4. 然后**，handleQuery 会循环处理 Session 中每一个 SQL，在 handleStmt 中对每一条 SQL 进行解析、编译、执行；

​ **5. 最后**，在 handleStmt 中调用 writeResultset 方法，触发组织好的 Executor 的 Next() 方法从 TiKV 获取数据；

#### 3.1.2 SQL Parser Deal

> **Model Tips:** SQL Parser 处理层通过封装 YACC 实现 MySQL 的词法解析，将 SQL 转化为 AST。

​ **1. 首先**，在 handleQuery 中，调用 [func (s \*session) Parse(...)](https://github.com/pingcap/tidb/blob/ad9430039f54bb9af78d44831c176bc5eafcbba0/server/conn.go#L1795) 方法实现 AST 的转化与返回；

​ **2. 其次**，深入了解会发现，该 Parse 方法为调用 [func (s \*session) ParseSQL(...)](https://github.com/pingcap/tidb/blob/27348d67951c5d9e409c84ca095f0e5d3332c1fd/session/session.go#L1459-L1489) 函数实现真正的词法解析动作，并记录解析 SQL 是否成功及解析耗费的时间。

​ **3. 最后**，进入 [func (s \*session) Parse(...)](https://github.com/pingcap/tidb/blob/27348d67951c5d9e409c84ca095f0e5d3332c1fd/session/session.go#L1298-L1318) 首先封装一个 sync.Pool 作为 parserPool 减轻 GC struct 的压力，并 Copy AST 结果返回给上层调用，再深层 DEBUG 将会进入 Parser 模块。

```go
func (s *session) ParseSQL(ctx context.Context, sql string, params ...parser.ParseParam) ([]ast.StmtNode, []error, error) {
    ......
    p := parserPool.Get().(*parser.Parser)
    defer parserPool.Put(p)
    p.SetSQLMode(s.sessionVars.SQLMode)
    p.SetParserConfig(s.sessionVars.BuildParserConfig())
    tmp, warn, err := p.ParseSQL(sql, params...)
    res := make([]ast.StmtNode, len(tmp))
    copy(res, tmp)
    return res, warn, err
}
```

#### 3.1.3 SQL Compile Deal

> **Model Tips:**
>
> ​ SQL Compiler 处理层完成 SQL 语意检查(Preprocess)、编译执行计划(Logical Optimize、Physical Optimize) 工作，将 SQL 编译成可执行的物理执行计划。

​ **1. 首先**，从 MySQL Protocol Layer 串联起 “解析”、“执行” 操作，并在 [func (s \*session) ExecuteStmt(...)](https://github.com/pingcap/tidb/blob/27348d67951c5d9e409c84ca095f0e5d3332c1fd/session/session.go#L1735) 中调用 [func (c \*Compiler) Compile(...)](https://github.com/pingcap/tidb/blob/27348d67951c5d9e409c84ca095f0e5d3332c1fd/executor/compiler.go#L51-L109) 进行真正的编译处理。

​ **2. 其次**，在 Compile 内部调用 [func Preprocess(...)](https://github.com/pingcap/tidb/blob/27348d67951c5d9e409c84ca095f0e5d3332c1fd/planner/core/preprocess.go#L114-L130)，进行 Preprocess 完成前置检查，如：语义检查。具体实现流程为，通过 AST 的 [Accept 方法](https://github.com/pingcap/tidb/blob/27348d67951c5d9e409c84ca095f0e5d3332c1fd/parser/ast/ast.go#L40), 构造一个 Vistor 实现对 AST 的遍历。 每个 Visitor 接口包含 Enter、Leave 方法，[并在 Enter 或 Leave 时](https://github.com/pingcap/tidb/blob/27348d67951c5d9e409c84ca095f0e5d3332c1fd/planner/core/preprocess.go#L192)，依据 SQL 类型进行判断。本例 point get 会跳到 [func (n \*SelectStmt) Accept(v Visitor)](https://github.com/pingcap/tidb/blob/27348d67951c5d9e409c84ca095f0e5d3332c1fd/parser/ast/dml.go#L1391-L1503) 中，不断分支处理完成遍历。详情参考 [TiDB 源码阅读之 Compiler --> 进度 10min 左右](https://www.bilibili.com/video/BV1m4411g7Yy?from=search&seid=10358982920062599002&spm_id_from=333.337.0.0)。

​ **3. 最后**，进入 Optimizer 处理，本例中因为是点查会越过大量优化器处理过程，直接进入 [func TryFastPlan(...)](https://github.com/pingcap/tidb/blob/27348d67951c5d9e409c84ca095f0e5d3332c1fd/planner/optimize.go#L131) 进行简单的 “权限检查” 及 “数据库名检查”。

```go
func TryFastPlan(ctx sessionctx.Context, node ast.Node) (p Plan) {
    ......
    case *ast.SelectStmt:
        if fp := tryPointGetPlan(ctx, x, isForUpdateReadSelectLock(x.LockInfo)); fp != nil {
            if checkFastPlanPrivilege(ctx, fp.dbName, fp.TblInfo.Name.L, mysql.SelectPriv) != nil {
                return nil
            }
            if tidbutil.IsMemDB(fp.dbName) {
                return nil
            }
            if fp.IsTableDual {
                return
            }
            p = fp
            return
        }
    }
    return nil
}
```

#### 3.1.4 SQL Executor Deal

> **Model Tips:**
>
> ​ SQL Executor 通过接收经过 Optimizer 的 Plan，并构造、执行火山模型获取执行结果，火山模型详见 [知乎 -- SQL 优化之火山模型](https://zhuanlan.zhihu.com/p/219516250)。

​ **1. 首先**，在 [func (s \*session) ExecuteStmt(...)](https://github.com/pingcap/tidb/blob/ad9430039f54bb9af78d44831c176bc5eafcbba0/session/session.go#L1757) 中调用 [func (a \*ExecStmt) Exec(...)](https://github.com/pingcap/tidb/blob/ad9430039f54bb9af78d44831c176bc5eafcbba0/session/session.go#L1880)，调用 [Open()](https://github.com/pingcap/tidb/blob/ad9430039f54bb9af78d44831c176bc5eafcbba0/executor/adapter.go#L407) 方法从而完成 Executor 变异版火山模型的构造，最后返回一个 RecordSet。

​ **2. 其次**，ExecuteStmt 返回的 RecordSet 包含了 Executor 需要的所有信息，此时可以把 RecordSet 当成返回的结果集，但该执行流从未触发过 Next() 方法，即：没有真正的获取数据。

​ **3. 最后**，实际上 Next（） 触发由 的 writeResultset 触发,详细流程如下：**func (cc \*clientConn) handleStmt(...) --> func (cc \*clientConn) writeResultset(...) --> func (cc \*clientConn) writeChunks(...) --> func (trs \*tidbResultSet) Next(...) --> func (a \*recordSet) Next(...) --> func Next(...) --> func (e \*PointGetExecutor) Next(...) --> func (e \*PointGetExecutor) Next(...) --> func (e \*PointGetExecutor) getAndLock(...) --> func (e \*PointGetExecutor) get(...)** 层层调用，直至 Executor 完成所有数据的获取。

​ **4. 另外**，值得一提的是在 func (a \*ExecStmt) Exec(...) --> Build Executor 时，因为点查使用“主键”或“唯一索引”标定一行，**不存在重复数据读**，所以在 `autoCommit` 情况下直接取 `MaxUint64` 作为事务的 StartTS（该事务只有一个点查），即：无穷大 +∞。同时，还会赋予 `PriorityHigh` 优先级进行处理，详情见 [force-priority](https://docs.pingcap.com/zh/tidb/v5.2/tidb-configuration-file/#force-priority)。

```go
func (a *ExecStmt) buildExecutor() (Executor, error) {
        ......
        } else {
            // Do not sync transaction for Execute statement, because the real optimization work is done in
            // "ExecuteExec.Build".
            useMaxTS, err := plannercore.IsPointGetWithPKOrUniqueKeyByAutoCommit(ctx, a.Plan)
            if useMaxTS {
                if err := ctx.InitTxnWithStartTS(math.MaxUint64); err != nil {
                    return nil, err
                }
            }
            if stmtPri := stmtCtx.Priority; stmtPri == mysql.NoPriority {
                switch {
                case useMaxTS:
                    stmtCtx.Priority = kv.PriorityHigh
                case a.LowerPriority:
                    stmtCtx.Priority = kv.PriorityLow
                }
            }
        }
    }
    b := newExecutorBuilder(ctx, a.InfoSchema, a.Ti, a.SnapshotTS, a.IsStaleness, a.ReplicaReadScope)
    e := b.build(a.Plan)
    return e, nil
}
```

#### 3.1.5 TiKV & PD Client Deal

> **Model Tips:**
>
> ​ TiKV Client 被封装在 TiDB 侧，主要承担从 TiKV 获取 KV 数据的作用。

​ **1. 首先**，通过执行流追溯 func (s *tikvSnapshot) Get(...) --> func (i *TemporaryTableSnapshotInterceptor) OnGet(...) --> func (s \*tikvSnapshot) Get(...) 会直接调用封装了 tikv client 的 tikvSnapshot 结构体的 [Get(...)](https://github.com/pingcap/tidb/blob/cd56aba07e9c9c2a87df5f28fe9d81a3e3dd50a8/store/driver/txn/snapshot.go#L58) 方法，从 TiKV 获取 KV 数据。

​ **2. 其次**，DEBUG 到 TiKV Client 内部细节会发现 TiKV Client 遵照本地缓存是否存在数据，如果不存在构造请求头，并在 for{} 循环中调用 GetRegionCache() 查询 PD Client 的 Region Cache 获取所要查询 Region 在 TiKV 中的位置，向 TiKV 发送请求获取数据。之所以使用 for 循环，是因为 Region Cache 信息从 PD 获取，所以并不一定是最新的、最准确的 Region Location 信息，包含一些错误重拾操作,如：EpochNotMatch 等等，详情见: [Region Cache 缓存和清理逻辑解释](https://docs.google.com/document/d/1BHkeN8W2iWSdgWLK3U16QGwq9K7DA6Le7zxVhLPaQgc/edit) 或 [TiDB 源码阅读系列文章（十八）tikv-client（上）](https://pingcap.com/zh/blog/tidb-source-code-reading-18)。

```go
func (s *KVSnapshot) get(ctx context.Context, bo *retry.Backoffer, k []byte) ([]byte, error) {
    // Check the cached values first.
    s.mu.RLock()
    if s.mu.cached != nil {
        if value, ok := s.mu.cached[string(k)]; ok {
            atomic.AddInt64(&s.mu.hitCnt, 1)
            s.mu.RUnlock()
            return value, nil
        }
    }
    s.mu.RUnlock()
    ......
    s.mu.RLock()
    req := tikvrpc.NewReplicaReadRequest(tikvrpc.CmdGet,
        &kvrpcpb.GetRequest{
            Key:     k,
            Version: s.version,
        }, s.mu.replicaRead, &s.replicaReadSeed, kvrpcpb.Context{
            Priority:         s.priority.ToPB(),
            NotFillCache:     s.notFillCache,
            TaskId:           s.mu.taskID,
            ResourceGroupTag: s.resourceGroupTag,
        })
    s.mu.RUnlock()

    for {
        loc, err := s.store.GetRegionCache().LocateKey(bo, k)
        resp, _, _, err := cli.SendReqCtx(bo, req, loc.Region, client.ReadTimeoutShort, tikvrpc.TiKV, "", ops...)
        regionErr, err := resp.GetRegionError()
        val := cmdGetResp.GetValue()
        return val, nil
    }
}
```

​ **3. 最后**，在 [func (e \*PointGetExecutor) Next(...)](https://github.com/pingcap/tidb/blob/ad9430039f54bb9af78d44831c176bc5eafcbba0/executor/point_get.go#L215) 处理中会通过 `isCommonHandleRead` 是普通查询还是点查，点查 executor 会直接 get 该 key 的 value。由于 TiDB KV 主要作用是对 TiKV 数据获取处理的封装，便不单独提取模块赘述。

```go
func (e *PointGetExecutor) Next(ctx context.Context, req *chunk.Chunk) error {
    if e.idxInfo != nil {
        if isCommonHandleRead(e.tblInfo, e.idxInfo) {
            handleBytes, err := EncodeUniqueIndexValuesForKey(e.ctx, e.tblInfo, e.idxInfo, e.idxVals)
            e.handle, err = kv.NewCommonHandle(handleBytes)
        } else {
            e.idxKey, err = EncodeUniqueIndexKey(e.ctx, e.tblInfo, e.idxInfo, e.idxVals, tblID)
            e.handleVal, err = e.get(ctx, e.idxKey)
        }
    }
    ......
    return nil
}
```

## 3.2TiKV

下述 **3.2** 部分均为点查在 TiKV 组件中涉及处理流程介绍。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1646621186551.png)

#### 3.2.1 KV Grpc & Service Deal

​ **1. 首先**，TiKV 进程启动后，所有的 Grpc 请求处理都由 Service 层接管。位于 `src/server/service/kv.rs` 文件中，例如本次的点查请求会由 [`handle_request!(kv_get, future_get, GetRequest, GetResponse);`](https://github.com/tikv/tikv/blob/005efd56d3405b72a26bf623b5895cf3d9da0a6f/src/server/service/kv.rs#L196) 这样一个声明宏处理，调用 future_get 异步处理。

​ **2. 其次**，从 Grpc 的请求中解析出 key 等相关信息，作为参数传递调用存储引擎方法 [storage.get(...)](https://github.com/tikv/tikv/blob/005efd56d3405b72a26bf623b5895cf3d9da0a6f/src/server/service/kv.rs#L1302-L1305) 进行实际的调用处理,包含构造 snapshot、获取 value 等。

​ **5. 最后**，在 v(value) 异步结果获取后，构造 Grpc 返回给请求端。

```rust
fn future_get<E: Engine, L: LockManager>(
    storage: &Storage<E, L>,
    mut req: GetRequest,
) -> impl Future<Output = ServerResult<GetResponse>> {

    let v = storage.get(
        req.take_context(),
        Key::from_raw(req.get_key()),
        req.get_version().into(),
    );

    async move {
        let mut resp = GetResponse::default();
            match v {
                Ok((val, stats)) => {
                    match val {
                        Some(val) => resp.set_value(val),
                        None => resp.set_not_found(true),
                    }
                }
                Err(e) => resp.set_error(extract_key_error(&e)),
            }
        Ok(resp)
    }
}
```

#### 3.2.2 KV Storage ReadPool Deal

​ **1. 首先**，该函数的作用是从 snapshot 中，搜寻满足 “数据行提交时间戳 < 本次数据行发起请求时间戳” 要求的，无锁的，且 MVCC 多版本数据中时间戳最新的请求行数据 。

​ **2. 其次**，观察函数逻辑，先会对请求的优先级进行判断，然后从 read_pool 线程池中 spawn 一个 handle，并为该 handle 指定解析出来的 “优先级” 在存储层执行请求，关于 SQL 优先级详见 --> [force-priority 说明](https://docs.pingcap.com/zh/tidb/stable/tidb-configuration-file#force-priority)。

​ **3. 再次**，prepare_snap_ctx(...) 会进行内存锁冲突检查，并基于 key、start_ts 等信息构造 snapshot context。

​ **4. 然后**，通过传入 snap_ctx ,在 [`let snapshot = Self::with_tls_engine(|engine| Self::snapshot(engine, snap_ctx)).await?;`](https://github.com/tikv/tikv/blob/005efd56d3405b72a26bf623b5895cf3d9da0a6f/src/storage/mod.rs#L566) 步构造出存储引擎的 snapshot。

​ **5. 最后**，并在 [`let result = snap_store.get(&key, &mut statistics)});`](https://github.com/tikv/tikv/blob/005efd56d3405b72a26bf623b5895cf3d9da0a6f/src/storage/mod.rs#L581-L588) 中获取 result 结果。

```rust
pub fn get(
        &self,
        mut ctx: Context,
        key: Key,
        start_ts: TimeStamp,
    ) -> impl Future<Output = Result<(Option<Value>, KvGetStatistics)>> {

        let priority = ctx.get_priority();

        let res = self.read_pool.spawn_handle(
            async move {

                let snap_ctx = prepare_snap_ctx(
                    &ctx,
                    iter::once(&key),
                    start_ts,
                    &bypass_locks,
                    &concurrency_manager,
                    CMD,
                )?;
                let snapshot = Self::with_tls_engine(|engine| Self::snapshot(engine, snap_ctx)).await?;
                {
                    let snap_store = SnapshotStore::new(
                        snapshot,
                        start_ts,
                        ctx.get_isolation_level(),
                        !ctx.get_not_fill_cache(),
                        bypass_locks,
                        access_locks,
                        false,
                    );
                    let result = snap_store.get(&key, &mut statistics)});

                    Ok((
                        result?,
                        KvGetStatistics {
                            stats: statistics,
                            perf_stats: delta,
                            latency_stats,
                        },
                    ))
                }
            }
            .in_resource_metering_tag(resource_tag),
            priority,
            thread_rng().next_u64(),
        );
    }
```

#### 3.2.3 KV RocksDB Snapshot Deal

​ **1. 首先**，**从 3.2.2 第 4 步构造 snapshot 部分深入**，仔细 DEBUG 会发现构造 snapshot 之前 [fn async_snapshot(...)](https://github.com/tikv/tikv/blob/005efd56d3405b72a26bf623b5895cf3d9da0a6f/src/server/raftkv.rs#L420) 会发起 ReadIndex ，判断此时 leader 是否真的是 leader 。早期 Read Index 是通过发送一次心跳的方式实现的，[关于 read index 详情参考 --> TiKV 功能介绍 - Lease Read](https://pingcap.com/zh/blog/lease-read)。随后 TiKV 引入 Lease Read 优化，[具体概念及由来参考 --> read index 和 local read 情景分析](https://pingcap.com/zh/blog/tikv-source-code-reading-19)，关于本例点查 Lease Read 部分逻辑在 [pub fn propose_raft_command](https://github.com/tikv/tikv/blob/005efd56d3405b72a26bf623b5895cf3d9da0a6f/components/raftstore/src/store/worker/read.rs#L606-L689) 函数下。

​ **2. 其次**，**从 3.2.2 第 5 步构造 snap_store.get(...) 部分深入**，对于点查会构造一个 point_getter ，再 get 对应 value,大概逻辑是通过事务的隔离级别分支处理（现阶段所有请求均是 SI 隔离界别）。在 SI 分支中，针对该 User Key 扫一遍 lock CF ,详情参见代码 --> [`impl PointGetter`](https://github.com/tikv/tikv/blob/005efd56d3405b72a26bf623b5895cf3d9da0a6f/src/storage/mvcc/reader/point_getter.rs#L202-L210)； 因为自动提交的点查使用 max_ts，所以这一步会返回空，意味着查询最新的已提交的 Default CF 数据即可。

​ **3. 最后**，排除锁信息后，进入 load_data(user_key) 会起一个 loop ，构造一个包含 cursor 的 WriteRef 不断的扫 Write CF。因为事务提交后，会在 Write CF 中写一个 key 为 {user_key}{commit_ts}，value 为 {type}{start_ts} 的记录，所以扫 PUT 类型的 Write CF 意味着可以判断出：查询的数据是否存在 Write CF 中，因为 [MVCC 数据读取](https://pingcap.com/zh/blog/tikv-source-code-reading-13) 指出小于 64 字节的数据会直接内嵌在 Lock Info 或 Write Info，否则调用 load_data_from_default_cf(...) 从 Default CF 中获取查询的结果值。

```rust
fn load_data(&mut self, user_key: &Key) -> Result<Option<Value>> {

        loop {
            let write = WriteRef::parse(self.write_cursor.value(&mut self.statistics.write))?;

            match write.write_type {
                WriteType::Put => {
                    match write.short_value {
                        Some(value) => {
                            // Value is carried in `write`.
                            self.statistics.processed_size += user_key.len() + value.len();
                            println!("-short-->{}<---",String::from_utf8_lossy(value));
                            return Ok(Some(value.to_vec()));
                        }
                        None => {
                            let start_ts = write.start_ts;
                            let value = self.load_data_from_default_cf(start_ts, user_key)?;
                            println!("-default-->{:?}<---",String::from_utf8_lossy(&value));
                            self.statistics.processed_size += user_key.len() + value.len();
                            return Ok(Some(value));
                        }
                    }
                }
            }

            if !self.write_cursor.next(&mut self.statistics.write) {
                return Ok(None);
            }
        }
    }
```

### 3.3 总结

​ 简单来说，主要是点查直接可基于唯一 Key 定位所需 value，查询数据较少，又不用走二级索引回表定位数据。其次 PointGet 跳过了大量优化器的规则优化，直接走了 FastPlan 节省了优化器部分的时间。最后，使得点查成为一个效率较高的执行计划。

## 四、学习总结

### 4.1 看源码条件

​ **首先**，需要清楚看源码的目的，本人作为一个 DBA 出于想了解数据库产品的角度出发，觉得满足如下几点基本就可以开始看源码了。1、2 点是基础，3 点是保持看代码的动力源泉、高效方法。

1. 了解基本编程语言语法、语言特性、周边组件，如：rust future、rust 所有权、go gpm、go mod、cargo、Makefile ...... 等等；
2. 掌握数据库组件功能、流程、概念，如：解析、编译、执行、火山模型、向量模型、存储模型 ...... 等等；
3. 保持持续探索的热情，多与社区及相关爱好者交流，终有一天不懂得模块会被看懂。

​ **最后**，其实光看代码很多逻辑思想是看不出来的，需结合官网的文章、作者所讲述概念、行业经验才能看出来，否则代码之间跳来跳去很容易迷失方向。

### 4.2 看代码价值

​ **首先**，个人觉得看代码的行为对不同角色带来的价值是不同的，比如：

    1. 作为数据库内核开发角色，看数据库代码是基本技能，日常工作中了解不同产品特性 ...
       2. 作为 DBA 角色，可以看到更多逻辑概念下的细节,尤其是在产品较不成熟（文档好少、BUG 较多、最佳实践较少）的情况下，在遇到问题时，进一步深入细节发现解决问题的新思路 ...
       3. 作为应用开发角色，可以发现代码实现手段上的“黑科技”，更好依据不同数据库特性、用好不同数据库产品 ...

​ **其次**，谈到价值，个人觉得不可忽略的是 **“投入产出比”**。增加这一衡量因素后，不禁如下疑问从脑中产生：

    1. 该行为如果只是觉得很牛，这件事是否真的值得做？如果做了，可能只是为了满足内心对于某件事的好奇，说明是根本没有衡量该行为的价值,属于冲动行为的结果。当然结果可能是好的，也可能是坏的。
       2.  该行为对 DBA 角色来讲，带来的收益到底有多大？代码看的多可能对逻辑概念、产品特性认知的更准确、牢固，可是这种老牢固与阅读故障案例相比，在同等时间投入下获得的收益 “谁胜谁负” 恐怕是个问号❓。再者，真出现了产品问题，没有产品作者的支持与确认我真的敢改代码、或者下定论吗？
       3. 行业 或 企业对于 DBA 角色的阅读代码技能是怎样定位的？涉及代码问题处理的工作大可以由专业的人负责，专业的人做专业的事效率可能更高效些。如果假设该前提是正确的，那么 DBA 阅读代码无疑是一种低效的行为。
       4. 如果为了构建自己写代码的能力，为什么不去做研发？

​ **最后**，上述种种问题现在我只能提出，而不能回答，也没有资格回答，本人也在不断探索、学习、抉择中 ... ，也可能这件事情没有一个绝对的答案。

​ 总结下来，本片文章在 TiDB 产品层面描述了数据库逻辑概念下，点查行为和代码实现的关联关系，可以进一步提高作者对产品的认知。在看代码学习行为层面，简述了个人对该行为所带来价值多少的衡量。也许，这是本文啰唆表达下所能带来的 2 点 **“仅有的”** 价值。

## 五、引用

[TiDB Blog -- TiDB 源码阅读系列文章（二）初识 TiDB 源码](https://pingcap.com/zh/blog/tidb-source-code-reading-2)

[TiDB Blog -- TiDB 源码阅读系列文章（十三）索引范围计算简介](https://pingcap.com/zh/blog/tidb-source-code-reading-13)

[TiDB Blog -- TiDB 源码阅读系列文章（三）SQL 的一生](https://pingcap.com/zh/blog/tidb-source-code-reading-3)

[TiDB Blog -- TiKV 源码解析系列文章（十九）read index 和 local read 情景分析](https://pingcap.com/zh/blog/tikv-source-code-reading-19)

[TiDB Blog -- TiKV 功能介绍 - Lease Read](https://pingcap.com/zh/blog/lease-read)

[TiDB Blog -- TiKV 源码解析系列文章（十三）MVCC 数据读取](https://pingcap.com/zh/blog/tikv-source-code-reading-13)

[TiDB Blog -- TiDB 源码阅读系列文章（十八）tikv-client（上）](https://pingcap.com/zh/blog/tidb-source-code-reading-18)

[Jack Yu Blog -- 如何阅读 TiDB 的源代码（一）](http://blog.minifish.org/posts/tidb1/)

[Jan Su Blog -- TiDB run and debug on M1](https://asktug.com/t/topic/183125)

[MySQL Doc -- MySQL Client/Server Protocol](https://dev.mysql.com/doc/internals/en/overview.html)

[MySQL Doc -- MySQL 协议分析](https://www.cnblogs.com/davygeek/p/5647175.html)

[Talkgo movie -- TiDB 源码阅读之 Compiler【有彩蛋哦】【 Go 夜读 】](https://www.bilibili.com/video/BV1m4411g7Yy?from=search&seid=5392094730229995526&spm_id_from=333.337.0.0)

[AskTUG Req -- tidb sql 执行](https://asktug.com/t/topic/513044/2)

[Zhihu Blog -- RocksDB 事务实现 TransactionDB 分析](https://zhuanlan.zhihu.com/p/35195328)

[Zhihu Blog -- SQL 优化之火山模型](https://zhuanlan.zhihu.com/p/219516250)
