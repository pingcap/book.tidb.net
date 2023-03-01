---
title: br 备份时排除某个库 - TiDB 社区技术月刊
sidebar_label: br 备份时排除某个库
hide_title: true
description: 生产环境中我们使用br来备份数据库，但是有时候可能需要排除某个库，本文将分析如何进行实现与操作。
keywords: [TiDB, br 备份, 数据库备份, 排除库]
---

# br 备份时排除某个库

> 作者：[qhd2004](https://tidb.net/u/qhd2004/answer)

生产环境中我们使用br来备份数据库，但是有时候可能需要排除某个库，比如，skywalking后台库（实际中是skywalking暂时放在tidb中，后面会转到es，并且skywalking的数据对我们来说可以不备份）。

在br文档中有使用 `--filter` 或 `-f` 来指定[表库过滤](https://docs.pingcap.com/zh/tidb/v5.4/table-filter)规则，但是这是指定的需要备份的表，跟上面需求不符合。通过查询文档，在[文章中提到](https://docs.pingcap.com/zh/tidb/v5.4/table-filter#%E4%BD%BF%E7%94%A8%E9%80%9A%E9%85%8D%E7%AC%A6)有指定通配符，但需要符合排除规则才可以，如下：

## 使用通配符

表名的两个部分均支持使用通配符（详情见 [fnmatch(3)](https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html#tag_18_13) ）。

- `*`：匹配零个或多个字符。
- `?`：匹配一个字符。
- `[a-z]`：匹配 "a" 和 "z" 之间的一个字符。
- `[!a-z]`：匹配不在 "a" 和 "z" 之间的一个字符。

## 排除规则

在一条过滤规则的开头加上 `!`，则表示符合这条规则的表不会被 TiDB 数据迁移工具处理。通过应用排除规则，库表过滤可以作为屏蔽名单来使用。

```markdown
*.*
#^ 注意：必须先添加 *.* 规则来包括所有表
!*.Password
!employees.salaries
```

根据上面的通配与排除规则，那br的备份命令可以如下写出：

`br backup full --pd "{PDIP}:{PORT}" -f '*.*' -f '!dbname.*' -s 'local:///tmp/backup'`

## 测试过程

### 1 创建测试数据

`create database monitor_db_skywalking;`

`create table moe_test ...`

`create database syk_db;`

`create table syk_test ...`

### 2 br备份

`[root@opsys-103-236-30 ~]# /root/tidb-toolkit-v6.5.0-linux-amd64/br backup full --pd "10.103.236.30:2379" -f '*.*' -f '!monitor_db_skywalking.*' -s 'local:///tmp/backup'
Detail BR log in /tmp/br.log.2023-02-09T11.34.00+0800
Full Backup <-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------> 100.00%
Checksum <--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------> 100.00% [2023/02/09 11:34:01.794 +08:00] [INFO] [collector.go:73] ["Full Backup success summary"] [total-ranges=22] [ranges-succeed=22] [ranges-failed=0] [backup-checksum=91.994496ms] [backup-fast-checksum=11.178486ms] [backup-total-ranges=80] [backup-total-regions=80] [total-take=1.416143685s] [BackupTS=439330705621123078] [total-kv=1114] [total-kv-size=269.8kB] [average-speed=190.5kB/s] [backup-data-size(after-compressed)=74.35kB] [Size=74346] [root@opsys-103-236-30 ~]# grep syk_test /tmp/br.log.2023-02-09T11.34.00+0800 [2023/02/09 11:34:01.686 +08:00] [INFO] [worker.go:76] ["Calculate table checksum start"] [db=syk_db] [table=syk_test] [2023/02/09 11:34:01.691 +08:00] [INFO] [worker.go:76] ["Calculate table checksum completed"] [db=syk_db] [table=syk_test] [Crc64Xor=1484897629768183948] [TotalKvs=6] [TotalBytes=367] [calculate-take=5.027214ms] [flush-take=804ns] [2023/02/09 11:34:01.790 +08:00] [INFO] [validate.go:82] ["checksum success"] [db=syk_db] [table=syk_test] [root@opsys-103-236-30 ~]# grep moe_test /tmp/br.log.2023-02-09T11.34.00+0800 [root@opsys-103-236-30 ~]# grep syk_db /tmp/br.log.2023-02-09T11.34.00+0800 [2023/02/09 11:34:01.686 +08:00] [INFO] [worker.go:76] ["Calculate table checksum start"] [db=syk_db] [table=syk_test] [2023/02/09 11:34:01.691 +08:00] [INFO] [worker.go:76] ["Calculate table checksum completed"] [db=syk_db] [table=syk_test] [Crc64Xor=1484897629768183948] [TotalKvs=6] [TotalBytes=367] [calculate-take=5.027214ms] [flush-take=804ns] [2023/02/09 11:34:01.790 +08:00] [INFO] [validate.go:82] ["checksum success"] [db=syk_db] [table=syk_test] [root@opsys-103-236-30 ~]# grep monitor_db_skywalking /tmp/br.log.2023-02-09T11.34.00+0800 [2023/02/09 11:34:00.378 +08:00] [INFO] [common.go:718] [arguments] [__command="br backup full"] [filter="[.,!monitor_db_skywalking.*]"] [pd="[10.103.236.30:2379]"] [storage=local:///tmp/backup]`

使用grep后发现moe\_test没有备份，说明br命令符合需求。

### 3 恢复测试

`mysql [root@10.103.236.30:monitor_db_skywalking]> show databases; +-----------------------+ | Database              | +-----------------------+ | INFORMATION_SCHEMA    | | METRICS_SCHEMA        | | PERFORMANCE_SCHEMA    | | monitor_db_skywalking | | mysql                 | | syk_db                | +-----------------------+
6 rows in set (0.00 sec)`

`mysql [root@10.103.236.30:monitor_db_skywalking]> drop database monitor_db_skywalking;
Query OK, 0 rows affected (0.28 sec)`

`mysql [root@10.103.236.30:monitor_db_skywalking]> drop database syk_db
;
Query OK, 0 rows affected (0.28 sec)`

`[root@opsys-103-236-30 ~]# /root/tidb-toolkit-v6.5.0-linux-amd64/br restore full --pd "10.103.236.30:2379" -s 'local:///tmp/backup'
Detail BR log in /tmp/br.log.2023-02-09T11.36.31+0800
Full Restore <----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------> 100.00% [2023/02/09 11:36:35.600 +08:00] [INFO] [collector.go:73] ["Full Restore success summary"] [total-ranges=14] [ranges-succeed=14] [ranges-failed=0] [split-region=589.01µs] [restore-ranges=5] [total-take=4.071264805s] [BackupTS=439330705621123078] [RestoreTS=439330744981782573] [total-kv=10] [total-kv-size=733B] [average-speed=180B/s] [restore-data-size(after-compressed)=8.692kB] [Size=8692]`

`mysql [root@10.103.236.30:monitor_db_skywalking]> show databases; +--------------------+ | Database           | +--------------------+ | INFORMATION_SCHEMA | | METRICS_SCHEMA     | | PERFORMANCE_SCHEMA | | mysql              | | syk_db             | +--------------------+
5 rows in set (0.00 sec)`

`mysql [root@10.103.236.30:monitor_db_skywalking]> select count() from syk_db.syk_test; +----------+ | count() | +----------+ |        6 | +----------+
1 row in set (0.00 sec)`

恢复完成，从备份到恢复都是按我们需求来完成的。

## br排除规则

需要使用 两个`--filter` 或 `-f` 来指定[表库过滤](https://docs.pingcap.com/zh/tidb/v5.4/table-filter)规则。先加所有，然后再加排除。

```markdown
必须先添加 *.* 规则来包括所有表
然后对需要排除的库开头加上 !
```

## 特别感谢

感谢微信群 TiDB社区技术布道师中小伙伴 咖啡哥-上海、清风明月、caiyfc-武汉-神州数码、db_user-北京-鲸算、黄漫绅|tidb （排名不分前后） 。
