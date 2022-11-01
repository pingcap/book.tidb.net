---
title: Hackathon 实用指南 - 快速给 TiDB 新增一个功能 - TiDB 社区技术月刊
sidebar_label: Hackathon 实用指南 - 快速给 TiDB 新增一个功能
hide_title: true
description: 本文将通过 step-by-step 的方式，介绍如何快速给 TiDB 新增一个功能，让没有太多知识背景的人也能快速上手。
keywords: [TiDB, 新增功能, 指南, step-by-step]
---

# 实用指南丨快速给 TiDB 新增一个功能

> 作者：陈霜

本文将通过 step-by-step 的方式，介绍如何快速给 TiDB 新增一个功能，让没有太多知识背景的人也能快速上手。

假设我们想要将 SST 文件导入 TiDB 中，通过新增 `LOAD SST FILE <file_path>`语法来实现。

TiDB 数据库在收到一条 SQL 请求后，大概的执行流程是 生成 AST 语法树 -> 生成执行计划 -> 构造 Executor 并执行。我们先来实现语法。

## 语法实现

要如何实现语法呢？我们可以照葫芦画瓢，找一个类似的 `LOAD DATA`语法作为葫芦，然后开始画瓢。

### Step-1: 新增 AST 语法树

`LOAD DATA`语法是用 `ast.LoadDataStmt`表示的，我们照葫芦画瓢在 `tidb/parser/ast/dml.go`中新增一个 `LoadSSTFileStmt AST`语法树：

```
// LoadSSTFileStmt is a statement to load sst file.
type LoadSSTFileStmt struct {
   dmlNode

   Path string
}

// Restore implements Node interface.
func (n *LoadSSTFileStmt) Restore(ctx *format.RestoreCtx) error {
   ctx.WriteKeyWord("LOAD SST FILE ")
   ctx.WriteString(n.Path)
   return nil
}

// Accept implements Node Accept interface.
func (n *LoadSSTFileStmt) Accept(v Visitor) (Node, bool) {
   newNode, _ := v.Enter(n)
   return v.Leave(newNode)
}
```

Restore 方法用来根据 AST 语法树还原出对应的 SQL 语句。 Accept 方法是方便其他工具遍历这个 AST 语法树，例如 TiDB 在预处理是会通过 AST 语法树的 Accept 方法来遍历 AST 语法树中的所有节点。

### Step-2：新增语法

LOAD DATA 语法是通过 `LoadDataStmt`实现的，我们也照葫芦画瓢，在 `tidb/parser/parser.y`中，新增 `LoadSSTFileStmt`语法，这里需要修改好几处地方，下面用 git diff 展示修改：

```
diff --git a/parser/parser.y b/parser/parser.y
index 1539bb13db..079859e8a9 100644
--- a/parser/parser.y
+++ b/parser/parser.y
@@ -243,6 +243,7 @@ import (
        sqlCalcFoundRows  "SQL_CALC_FOUND_ROWS"
        sqlSmallResult    "SQL_SMALL_RESULT"
        ssl               "SSL"
+       sst               "SST"
        starting          "STARTING"
        statsExtended     "STATS_EXTENDED"
        straightJoin      "STRAIGHT_JOIN"
@@ -908,6 +909,7 @@ import (
        IndexAdviseStmt            "INDEX ADVISE statement"
        KillStmt                   "Kill statement"
        LoadDataStmt               "Load data statement"
+       LoadSSTFileStmt            "Load sst file statement"
        LoadStatsStmt              "Load statistic statement"
        LockTablesStmt             "Lock tables statement"
        NonTransactionalDeleteStmt "Non-transactional delete statement"
@@ -11324,6 +11326,7 @@ Statement:
 |      IndexAdviseStmt
 |      KillStmt
 |      LoadDataStmt
+|      LoadSSTFileStmt
 |      LoadStatsStmt
 |      PlanReplayerStmt
 |      PreparedStmt
@@ -13496,6 +13499,14 @@ LoadDataStmt:
                $ = x
        }

+LoadSSTFileStmt:
+       "LOAD" "SST" "FILE" stringLit
+       {
+               $ = &ast.LoadSSTFileStmt{
+                       Path: $4,
+               }
+       }
+
```

上面的修改中：

第 9 行是因为语法中 `SST`是一个新的关键字，所以需要注册一个新的关键字。

第 17 行 和 25 行是注册一个新语法叫 `LoadSSTFileStmt`。

第 33 - 40 行是定义 `LoadSSTFileStmt`语法结构为：`LOAD SST FILE <file_path>`，这里前 3 个关键字都是固定的，所以直接定义 `"LOAD" "SST" "FILE"`即可，第 4 个是文件路径，一个变量值，我们用 `stringLit`来提取这个变量的值，然后再用这个的值来初始化 `ast.LoadSSTFileStmt`，其中 $4 是指第 4 个变量 `stringLit`的值。

因为引入了新的关键字 `SST`，所以还需要在 `tidb/parser/misc.go`中新增这个关键字：

```
diff --git a/parser/misc.go b/parser/misc.go
index 140619bb07..418e9dd6a4 100644
--- a/parser/misc.go
+++ b/parser/misc.go
@@ -669,6 +669,7 @@ var tokenMap = map[string]int{
        "SQL_TSI_YEAR":             sqlTsiYear,
        "SQL":                      sql,
        "SSL":                      ssl,
+       "SST":                      sst,
        "STALENESS":                staleness,
        "START":                    start,
        "STARTING":                 starting,
```

### Step-3：编译和测试

编译生成新的 `parser`文件。

```
cd parser
make fmt  #格式化代码
make      # 编译生成新的 parser 文件
```

我们可以在 `tidb/parser/parser_test.go`文件中的 `TestDMLStmt`中新增一个测试，来验证我们新增的语法生效了，下面是 git diff 展示的修改：

```
diff --git a/parser/parser_test.go b/parser/parser_test.go
index 7093c3889f..d2c75c4c59 100644
--- a/parser/parser_test.go
+++ b/parser/parser_test.go
@@ -666,6 +666,9 @@ func TestDMLStmt(t *testing.T) {
                {"LOAD DATA LOCAL INFILE '/tmp/t.csv' IGNORE INTO TABLE t1 FIELDS TERMINATED BY ',' LINES TERMINATED BY '\n';", true, "LOAD DATA LOCAL INFILE '/tmp/t.csv' IGNORE INTO TABLE `t1` FIELDS TERMINATED BY ','"},
                {"LOAD DATA LOCAL INFILE '/tmp/t.csv' REPLACE INTO TABLE t1 FIELDS TERMINATED BY ',' LINES TERMINATED BY '\n';", true, "LOAD DATA LOCAL INFILE '/tmp/t.csv' REPLACE INTO TABLE `t1` FIELDS TERMINATED BY ','"},

+               // load sst file test
+               {"load sst file 'table0.sst'", true, "LOAD SST FILE 'table0.sst'"},
+
```

然后跑测试：

```
cd parser
make test #跑 parser 的所有测试，快速验证可以用 go test -run="TestDMLStmt" 命令只跑修改的 TestDMLStmt 测试
```

## 生成执行计划

TiDB 在生成 AST 语法树后，需要生成对应的执行计划。我们需要先定义 `LOAD SST FILE`的执行计划。同样的照葫芦画瓢，我们先在 `tidb/planner/core/common_plans.go`文件中找到 `LOAD DATA`的执行计划 `LoadData`, 然后开始画瓢定义 `LoadSSTFile`执行计划：

```
// LoadSSTFile represents a load sst file plan.
type LoadSSTFile struct {
        baseSchemaProducer

        Path        string
}
```

为了让 TiDB 能更具 `ast.LoadSSTFileStmt`语法树生成对应的 `LoadSSTFile`执行计划，

需要在 `tidb/planner/core/planbuilder.go`文件中，参考 `buildLoadData`方法，来实现我们的 `buildLoadSSTFile`方法，用来生成执行计划, 下面是 git diff 展示修改内容：

```
diff --git a/planner/core/planbuilder.go b/planner/core/planbuilder.go
index ad7ce64748..c68e992b35 100644
--- a/planner/core/planbuilder.go
+++ b/planner/core/planbuilder.go
@@ -734,6 +734,8 @@ func (b *PlanBuilder) Build(ctx context.Context, node ast.Node) (Plan, error) {
                return b.buildInsert(ctx, x)
        case *ast.LoadDataStmt:
                return b.buildLoadData(ctx, x)
+       case *ast.LoadSSTFileStmt:
+               return b.buildLoadSSTFile(x)
@@ -3979,6 +3981,13 @@ func (b *PlanBuilder) buildLoadData(ctx context.Context, ld *ast.LoadDataStmt) (
        return p, nil
 }

+func (b *PlanBuilder) buildLoadSSTFile(ld *ast.LoadSSTFileStmt) (Plan, error) {
+       p := &LoadSSTFile{
+               Path: ld.Path,
+       }
+       return p, nil
+}
+
```

## 构造 Executor 并执行

生成执行计划之后，就需要构造对应的 Executor 然后执行了。TiDB 是用 Volcano 执行引擎，你可以将相关的初始化工作放在 `Open`方法中，将主要功能的实现都放在 `Next`方法中，以及执行完成后，在 `Close`方法中执行相关的清理和释放资源的操作。

我们需要先定义 `LOAD SST FILE`的 Executor，并让其实现 `executor.Executor`接口，可以把相关定义放到 `tidb/executor/executor.go`文件中：

```
// LoadSSTFileExec represents a load sst file executor.
type LoadSSTFileExec struct {
   baseExecutor

   path string
   done bool
}

// Open implements the Executor Open interface.
func (e *LoadSSTFileExec) Open(ctx context.Context) error {
   logutil.BgLogger().Warn("----- load sst file open, you can initialize some resource here")
   return nil
}

// Next implements the Executor Next interface.
func (e *LoadSSTFileExec) Next(ctx context.Context, req *chunk.Chunk) error {
   req.Reset()
   if e.done {
      return nil
   }
   e.done = true

   logutil.BgLogger().Warn("----- load sst file exec", zap.String("file", e.path))
   return nil
}

// Close implements the Executor Close interface.
func (e *LoadSSTFileExec) Close() error {
   logutil.BgLogger().Warn("----- load sst file close, you can release some resource here")
   return nil
}
```

如果没有初始化工作和清理工作，你也可以不用实现 `Open`和 `Close`方法，因为 `baseExecutor`已经实现过了。

这里为了简化教程在 `LoadSSTFileExec Executor`中仅仅是输出了几条 Log，你需要将自己功能具体实现的代码放在这里。

然后为了让 TiDB 能够根据 `LoadSSTFile`执行计划来生成 `LoadSSTFileExec Executor`, 需要修改 `tidb/executor/builder.go`文件，下面是用 git diff 展示的修改：

```
diff --git a/executor/builder.go b/executor/builder.go
index 1154633bd5..4f0478daa6 100644
--- a/executor/builder.go
+++ b/executor/builder.go
@@ -199,6 +199,8 @@ func (b *executorBuilder) build(p plannercore.Plan) Executor {
                return b.buildInsert(v)
        case *plannercore.LoadData:
                return b.buildLoadData(v)
+       case *plannercore.LoadSSTFile:
+               return b.buildLoadSSTFile(v)
        case *plannercore.LoadStats:
                return b.buildLoadStats(v)
        case *plannercore.IndexAdvise:
@@ -944,6 +946,14 @@ func (b *executorBuilder) buildLoadData(v *plannercore.LoadData) Executor {
        return loadDataExec
 }

+func (b *executorBuilder) buildLoadSSTFile(v *plannercore.LoadSSTFile) Executor {
+       e := &LoadSSTFileExec{
+               baseExecutor: newBaseExecutor(b.ctx, nil, v.ID()),
+               path:         v.Path,
+       }
+       return e
+}
+
```

## 验证

到此，我们已经成功的在 TiDB 中新增了一个 “功能”， 我们可以编译 TiDB 并启动后验证下：

```
make    #编译 TiDB server
bin/tidb-server  # 启动一个 TiDB server
```

然后新起一个终端，用 mysql 客户端连上去试试新功能：

```
▶ mysql -u root -h 127.0.0.1 -P 4000

mysql> load sst file 'table0.sst';
Query OK, 0 rows affected (0.00 sec)
```

可以看到执行成功了，并且在 tidb-server 的输出日志中，可以看到我们这个功能的 Executor 执行时的日志输出：

```
[2022/09/19 15:24:02.745 +08:00] [WARN] [executor.go:2213] ["----- load sst file open, you can initialize some resource here"]
[2022/09/19 15:24:02.745 +08:00] [WARN] [executor.go:2225] ["----- load sst file exec"] [file=table0.sst]
[2022/09/19 15:24:02.745 +08:00] [WARN] [executor.go:2231] ["----- load sst file close, you can release some resource here"]
```

## 总结

本文的代码示例： https://github.com/pingcap/tidb/pull/37936/files

本文通过“照葫芦画瓢” 的方式，教你如何在 TiDB 中新增一个功能，但也忽略了一些细节，例如权限检查，添加完备的测试等等，希望能对读者有所帮助。如果想要了解更多的知识背景和细节，推荐阅读 [TiDB Development Guide ](https://pingcap.github.io/tidb-dev-guide/)和 [TiDB 源码阅读 ](https://cn.pingcap.com/blog/?tag=TiDB 源码阅读)博客。
