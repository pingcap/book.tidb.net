---
title: 故障处理 - DM 搭建 MySQL 8.0 同步链路报错 code=26005 - TiDB 社区技术月刊
sidebar_label: 故障处理 - DM 搭建 MySQL 8.0 同步链路报错 code=26005
hide_title: true
description: 本文介绍如何解决 DM 搭建 MySQL 8.0 同步链路报错 code=26005 的问题。
keywords: [DM, MySQL, TiDB,  同步链路]
---

# 故障处理 ｜ DM 搭建 MySQL 8.0 同步链路报错：code=26005

> 作者：MrSylar

## 背景

DM v2.0 版本引入新特性，试验性支持 MySQL 8.0。但因为一些强烈的需求，需要尝试 DM 1.0 支持 MySQL 8.0。所用版本如下：

| Item  | Version                                    |
| ----- | ------------------------------------------ |
| MySQL | mysql-community-server-8.0.25-1.el7.x86_64 |
| DM    | v1.0.0-alpha                               |
| TiDB  | v5.4.2                                     |

## 问题引入

DM 使用 start-task 启动任务以后，程序抛出报错。 使用用 query-status 查看报错详情：

```
      {
        "id": 4,
        "name": "source db dump privilege chcker",
        "desc": "check dump privileges of source DB",
        "state": "fail",
        "errorMsg": "line 1 column 83 near \"FILE, REFERENCES, INDEX, ALTER, SHOW DATABASES, SUPER, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, REPLICATION SLAVE, REPLICATION CLIENT, CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER, CREATE TABLESPACE, CREATE ROLE, DROP ROLE ON *.* TO `root`@`%`\" \ngithub.com/pingcap/errors.AddStack\n\t/go/pkg/mod/github.com/pingcap/errors@v0.11.4/errors.go:174\ngithub.com/pingcap/errors.Trace\n\t/go/pkg/mod/github.com/pingcap/errors@v0.11.4/juju_adaptor.go:15\ngithub.com/pingcap/parser.(*Parser).Parse\n\t/go/pkg/mod/github.com/pingcap/parser@v0.0.0-20191112053614-3b43b46331d5/yy_parser.go:137\ngithub.com/pingcap/parser.(*Parser).ParseOneStmt\n\t/go/pkg/mod/github.com/pingcap/parser@v0.0.0-20191112053614-3b43b46331d5/yy_parser.go:156\ngithub.com/pingcap/tidb-tools/pkg/check.verifyPrivileges\n\t/go/pkg/mod/github.com/pingcap/tidb-tools@v3.0.7-0.20191202034632-451c58d281c7+incompatible/pkg/check/privilege.go:125\ngithub.com/pingcap/tidb-tools/pkg/check.(*SourceDumpPrivilegeChecker).Check\n\t/go/pkg/mod/github.com/pingcap/tidb-tools@v3.0.7-0.20191202034632-451c58d281c7+incompatible/pkg/check/privilege.go:58\ngithub.com/pingcap/tidb-tools/pkg/check.Do.func2\n\t/go/pkg/mod/github.com/pingcap/tidb-tools@v3.0.7-0.20191202034632-451c58d281c7+incompatible/pkg/check/check.go:118\nruntime.goexit\n\t/usr/local/go/src/runtime/asm_amd64.s:1357\ngrants[0] GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, RELOAD, SHUTDOWN, PROCESS, FILE, REFERENCES, INDEX, ALTER, SHOW DATABASES, SUPER, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, REPLICATION SLAVE, REPLICATION CLIENT, CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER, CREATE TABLESPACE, CREATE ROLE, DROP ROLE ON *.* TO `root`@`%`",
        "instruction": "",
        "extra": "address of db instance - 172.16.114.221:3306"
      },
      {
        "id": 5,
        "name": "source db replication privilege chcker",
        "desc": "check replication privileges of source DB",
        "state": "fail",
        "errorMsg": "line 1 column 83 near \"FILE, REFERENCES, INDEX, ALTER, SHOW DATABASES, SUPER, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, REPLICATION SLAVE, REPLICATION CLIENT, CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER, CREATE TABLESPACE, CREATE ROLE, DROP ROLE ON *.* TO `root`@`%`\" \ngithub.com/pingcap/errors.AddStack\n\t/go/pkg/mod/github.com/pingcap/errors@v0.11.4/errors.go:174\ngithub.com/pingcap/errors.Trace\n\t/go/pkg/mod/github.com/pingcap/errors@v0.11.4/juju_adaptor.go:15\ngithub.com/pingcap/parser.(*Parser).Parse\n\t/go/pkg/mod/github.com/pingcap/parser@v0.0.0-20191112053614-3b43b46331d5/yy_parser.go:137\ngithub.com/pingcap/parser.(*Parser).ParseOneStmt\n\t/go/pkg/mod/github.com/pingcap/parser@v0.0.0-20191112053614-3b43b46331d5/yy_parser.go:156\ngithub.com/pingcap/tidb-tools/pkg/check.verifyPrivileges\n\t/go/pkg/mod/github.com/pingcap/tidb-tools@v3.0.7-0.20191202034632-451c58d281c7+incompatible/pkg/check/privilege.go:125\ngithub.com/pingcap/tidb-tools/pkg/check.(*SourceReplicatePrivilegeChecker).Check\n\t/go/pkg/mod/github.com/pingcap/tidb-tools@v3.0.7-0.20191202034632-451c58d281c7+incompatible/pkg/check/privilege.go:96\ngithub.com/pingcap/tidb-tools/pkg/check.Do.func2\n\t/go/pkg/mod/github.com/pingcap/tidb-tools@v3.0.7-0.20191202034632-451c58d281c7+incompatible/pkg/check/check.go:118\nruntime.goexit\n\t/usr/local/go/src/runtime/asm_amd64.s:1357\ngrants[0] GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, RELOAD, SHUTDOWN, PROCESS, FILE, REFERENCES, INDEX, ALTER, SHOW DATABASES, SUPER, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, REPLICATION SLAVE, REPLICATION CLIENT, CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER, CREATE TABLESPACE, CREATE ROLE, DROP ROLE ON *.* TO `root`@`%`",
        "instruction": "",
        "extra": "address of db instance - 172.16.114.221:3306"
      },
```

## 直接原因

通过 stack 信息，可以看到报错的是 SourceDumpPrivilegeChecker 以及 SourceReplicatePrivilegeChecker，最终都在 check.verifyPrivileges 报错。SourceDumpPrivilegeChecker 和 SourceReplicatePrivilegeChecker 都位于github.com/pingcap/tidb-tools/pkg/check 包，代码如下：

```
// SourceDumpPrivilegeChecker 源码
func (pc *SourceDumpPrivilegeChecker) Check(ctx context.Context) *Result {
  result := &Result{
    Name:  pc.Name(),
    Desc:  "check dump privileges of source DB",
    State: StateFailure,
    Extra: fmt.Sprintf("address of db instance - %s:%d", pc.dbinfo.Host, pc.dbinfo.Port),
  }

  grants, err := dbutil.ShowGrants(ctx, pc.db, "", "")
  if err != nil {
    markCheckError(result, err)
    return result
  }

  verifyPrivileges(result, grants, dumpPrivileges)
  return result
}

// SourceDumpPrivilegeChecker 源码
func (pc *SourceDumpPrivilegeChecker) Name() string {
  return "source db dump privilege checker"
}

//
func (pc *SourceReplicatePrivilegeChecker) Check(ctx context.Context) *Result {
  result := &Result{
    Name:  pc.Name(),
    Desc:  "check replication privileges of source DB",
    State: StateFailure,
    Extra: fmt.Sprintf("address of db instance - %s:%d", pc.dbinfo.Host, pc.dbinfo.Port),
  }

  grants, err := dbutil.ShowGrants(ctx, pc.db, "", "")
  if err != nil {
    markCheckError(result, err)
    return result
  }

  verifyPrivileges(result, grants, replicationPrivileges)
  return result
}
```

两个方法首先都是调用 dbutil.ShowGrants，而后调用 verifyPrivileges

```
// dbutil.ShowGrants 部分代码
func ShowGrants(ctx context.Context, db QueryExecutor, user, host string) ([]string, error) {
  if host == "" {
    host = "%"
  }

  var query string
  if user == "" {
    // for current user.
    query = "SHOW GRANTS"
  } else {
    query = fmt.Sprintf("SHOW GRANTS FOR '%s'@'%s'", user, host)
  }

  readGrantsFunc := func() ([]string, error) {
    rows, err := db.QueryContext(ctx, query)
    if err != nil {
      return nil, errors.Trace(err)
    }
    defer rows.Close()
....
```

可以看到本质上执行的 是 show grants for 语句，我们可以手动执行该语句或者授权语句：

```
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, RELOAD, SHUTDOWN, PROCESS, FILE, REFERENCES, INDEX, ALTER, SHOW DATABASES, SUPER, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, REPLICATION SLAVE, REPLICATION CLIENT, CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER, CREATE TABLESPACE, CREATE ROLE, DROP ROLE ON *.* TO `root`@`%`;

GRANT APPLICATION_PASSWORD_ADMIN,AUDIT_ADMIN,BACKUP_ADMIN,BINLOG_ADMIN,BINLOG_ENCRYPTION_ADMIN,CLONE_ADMIN,CONNECTION_ADMIN,ENCRYPTION_KEY_ADMIN,FLUSH_OPTIMIZER_COSTS,FLUSH_STATUS,FLUSH_TABLES,FLUSH_USER_RESOURCES,GROUP_REPLICATION_ADMIN,INNODB_REDO_LOG_ARCHIVE,INNODB_REDO_LOG_ENABLE,PERSIST_RO_VARIABLES_ADMIN,REPLICATION_APPLIER,REPLICATION_SLAVE_ADMIN,RESOURCE_GROUP_ADMIN,RESOURCE_GROUP_USER,ROLE_ADMIN,SERVICE_CONNECTION_ADMIN,SESSION_VARIABLES_ADMIN,SET_USER_ID,SHOW_ROUTINE,SYSTEM_USER,SYSTEM_VARIABLES_ADMIN,TABLE_ENCRYPTION_ADMIN,XA_RECOVER_ADMIN ON *.* TO `root`@`%`;
```

将该语句在 tidb 上执行会报错

## 根本原因

MySQL 8.0 权限表结构与之前的版本不同，以 mysql.user 举例，差异如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1660215914100.png)

而 TiDB 权限机制兼容 MySQL 5.7，由此导致 SQL 语句失败

## Workaroud

### 升级 DM 版本

毫无疑问，这始终是最正确的做法。本着探索的精神，这里尝试别的可能解决方案

## TiDB 忽略授权语句执行报错

可以参加 PR ：https://github.com/pingcap/parser/pull/1319

这里未做尝试

### 修改 DM 源码

> 思路：错误是在 check 阶段抛出，自然我们可以考虑注释掉相关的检查项

DM v1.0.0-alpha 对于检查项的定义放在 dm/checker/checker.go 文件内，源代码如下：

```
c.checkList = append(c.checkList, check.NewMySQLBinlogEnableChecker(instance.sourceDB, instance.sourceDBinfo))
c.checkList = append(c.checkList, check.NewMySQLBinlogFormatChecker(instance.sourceDB, instance.sourceDBinfo))
c.checkList = append(c.checkList, check.NewMySQLBinlogRowImageChecker(instance.sourceDB, instance.sourceDBinfo))
//c.checkList = append(c.checkList, check.NewSourcePrivilegeChecker(instance.sourceDB, instance.sourceDBinfo))
c.checkList = append(c.checkList, check.NewTablesChecker(instance.sourceDB, instance.sourceDBinfo, checkTables))
```

很显然，NewSourcePrivilegeChecker 就是同步报错的检查项。我们注释这一行代码、重新编译 dm-worker、dm-master、dmctl 并替换测试环境的对应的 binary，重启同步任务。程序顺利同步运行

**特别说明：**

- 这里只给同步用户最小权限：SELECT, RELOAD, REPLICATION SLAVE, REPLICATION CLIENT, SHOW VIEW
- 这个方式未经充分验证，一定不要线上环境用