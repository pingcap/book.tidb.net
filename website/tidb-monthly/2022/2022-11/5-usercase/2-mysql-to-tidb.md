---
title: 教你一招，安全的从 MySQL 切换到 TiDB - TiDB 社区技术月刊
sidebar_label: 教你一招，安全的从 MySQL 切换到 TiDB
hide_title: true
description: 原应用系统是跑在单机 MySQL 上，随着业务量的慢慢递增，单机 MySQL 渐渐支撑不住了，故需要迁移到 TiDB 上，这时候就有一些问题出现了。首先，希望在切换数据库的时候，业务侧不希望停机很久，其次，希望能在 TiDB 发生无法及时处理的故障的时候，迅速切换回 MySQL。基于这两点要求，想到了一个好法子，能够安全快速的从 TiDB 切换到 MySQL，同时能够切换回原 MySQL。本文见详细介绍。
keywords: [TiDB, MySQL, 数据库切换, 业务量增加]
---

# 教你一招，安全的从 MySQL 切换到 TiDB

> 作者：[CuteRay](https://tidb.net/u/CuteRay/answer)

## 背景

原应用系统是跑在单机 MySQL 上，随着业务量的慢慢递增，单机 MySQL 渐渐支撑不住了，故需要迁移到 TiDB 上，这时候就有一些问题出现了。首先，希望在切换数据库的时候，业务侧不希望停机很久，其次，希望能在 TiDB 发生无法及时处理的故障的时候，迅速切换回 MySQL。基于这两点要求，想到了一个好法子，能够安全快速的从 TiDB 切换到 MySQL，同时能够切换回原 MySQL。

## 方案介绍

这个方案主要分为两个部分：

- MySQL 同步数据到 TiDB，全量+增量数据的同步，数据追平后，应用切换到 TiDB；
- 切换到 TiDB 之后，开启数据反向同步，从 TiDB 侧同步增量数据到 MySQL，保证原 MySQL 数据与 TiDB 一致；

### MySQL 到 TiDB 全量 + 增量数据迁移

这一部分，选择的工具主要是 DM（TiDB Data Migration），其支持从 MySQL 协议兼容多的数据库（MySQL、MariaDB、Aurora MySQL）到 TiDB 的全量数据迁移与增量数据同步。使用 DM，一定程度上能简化数据迁移过程，降低运维数据迁移的成本。

1. 部署DM集群

部署的详细就不提了，过于基础，详可参考官方文档。

```
# 执行部署命令
tiup dm deploy dm-test v5.3.1 ./topoloy.yaml --user tidb -p

# 查看 DM 集群状况
tiup dm display dm-test
```

2. 添加数据源

数据源配置文件 `mysql-source.yaml`

```
source-id: "mysql-test" 

from:
  host: "xxx.xxx.xxx.234"
  port: 3306
  user: "root"
  # password 使用 tiup dmctl encrypt '<password>'生成
  password: "WTy21lJlYSzEaaspVxxyCyilxxxbF6xxgxx"

```

```
# 创建数据源
tiup dmctl –master-addr xxx.xxx.xxx.238:8261 operate-source create ./mysql-source.yaml

# 查看创建的数据源
tiup dmctl –master-addr xxx.xxx.xxx.238:8261 operate-source show
```

3. 创建同步任务

- 前置检查

  - 上游 MySQL 需要开启 Binlog，并设置Server ID；
  - 上游 MySQL 需要迁移的表都拥有主键或者唯一索引；
  - 上游 MySQL 需要迁移的表 Collation 在 TiDB 中是否兼容；
  - ...... 可参考 check-task

- 编写数据同步任务配置文件 work-task.yaml

```
name: test                      
task-mode: all
case-sensitive: true      # schema/table 是否大小写敏感online-ddl: true          # 支持上游 "gh-ost" 、"pt" 的自动处理
clean-dump-file: true     # 是否清理 dump 阶段产生的文件，包括 metadata 文件、建库建表 SQL 文件以及数据导入 SQL 文件

target-database:                # 下游数据库实例配置
  host: "xxx.xxx.xxx.236"
  port: 4000
  user: "root"
  password: ""  

block-allow-list:                    
  bw-rule-1:                             
do-dbs: ["ba","busapi","cboard","express","im","pm","seed","ui","wms"] 
    ignore-tables: 
    - db-name: "im"
      tbl-name: "Edo"
    - db-name: "ui"
      tbl-name: "t1"
    - db-name: "ui"
      tbl-name: "t2"
    - db-name: "pm"
      tbl-name: "Sheet4"
    - db-name: "pm"
      tbl-name: "bus_api_log"
    - db-name: "busapi"
      tbl-name: "itl_user"
    - db-name: "busapi"
      tbl-name: "mew_ebs"
    - db-name: "busapi"
      tbl-name: "mew_pts_interface"

mysql-instances:
  - source-id: "mysql-test"         
    block-allow-list: "bw-rule-1"

```

- 检查任务是否能正常运行

  ```
  tiup dmctl –master-addr xxx.xxx.xxx.238:8261 check-task ./dm-work-task.yaml
  ```

  - `tiup check` 检查项包含：

    - 检查上游 MySQL 实例用户的 dump 相关权限
    - 检查上游 MySQL 实例用户的 replication 相关权限
    - 检查上游数据库版本
    - 检查上游数据库是否设置 server\_id
    - 检查上游数据库是否已启用 binlog
    - 检查上游数据库 binlog 格式是否为 ROW
    - 检查上游数据库 binlog\_row\_image 是否为 FULL
    - 检查上游 MySQL 表结构的兼容性
    - 检查上游 MySQL 多实例分库分表的表结构一致性
    - 检查上游 MySQL 多实例分库分表的自增主键冲突

- 启动数据同步任务

```
tiup dmctl –master-addr xxx.xxx.xxx.238:8261 start-task ./dm-work-task.yaml
```

- 查看数据同步任务

```
#这里的 task-name 是前面任务配置中，name后面所填写的内容，也就是 test
tiup dmctl –master-addr xxx.xxx.xxx.238:8261 query-status <task-name>
```

#### 然后简单说一下遇到的坑吧，以及笔者解决的方法

前面提到过，`dmctl` 中的 `check-task` 不是会检查那几个项目吗，但是即使所有的 `check-task` 全都通过了，DM 同步任务也不一定能够正常进行，比如如果碰到表中字段的 `collate` 这一项与TiDB不兼容的情况，就会卡住。

![image-20221013110008852.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-20221013110008852-1668153213370.png)

这次遇到的就是这种情况，`dmctl check-task` 检查已经全部通过了，但是在执行迁移任务的时候，仍然遇到报错，检查发现，是上游 MySQL 数据库部分表的部分字段的`COLLATE` 属性在 TiDB 中不支持，DM 执行同步任务时，创表阶段就会报错。

一般而言，遇到这种情况，应该去修改源表对应字段的 `COLLATE` ，改成 TiDB 兼容的格式，比如统一改成 `utf8mb4_bin` ，但是由于种种限制，不适合在生产环境直接对表进行DDL，于是只能尝试另一种方法。

这就涉及到 DM 迁移数据的流程逻辑了，简单说明一下，DM在做 full 模式的数据迁移时，会先全量逻辑导出数据，导出的目录位于执行该任务的 DM-worker 机器上，默认情况下，导出的数据目录位于 DM-worker 的 部署目录下的`dumped_data.\<task-name>` 中，task-name 就是前文中数据同步配置文件中的 `name` 项配置，而在这个数据目录中，就保存着导入到 TiDB 需要执行的SQL文件，包括建表语句。执行完这个目录下的所有 SQL 文件之后，意味着全量数据迁移完成，后续开始同步增量数据。

![image-20221111154102175.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-20221111154102175-1668153225810.png)

遇到前面的错误，这时候就可以进入到该目录，找到对应表的建表 SQL 文件，默认情况下，该表的文件命名格式 `<database-name>.<tale-name>-schema.sql` ，直接去修改该SQL文件中的内容，接着继续运行 DM 任务即可。

### 切换到 TiDB

当 DM 工具将上游的 MySQL 数据全部同步到下游，数据追平，并且稳定同步一段时间之后，此时就可以考虑将读写流量打到TiDB上，同时开启TiDB到原MySQL数据库的反向数据增量同步，保证TiDB与MySQL数据完全一致，就可以让应用随时从TiDB切换回MySQL。

此时需要注意的是，数据库在切换的时候，需要将应用服务停掉，切换完成之后，重启应用服务，在事先准备好配置文件时，整个过程不超过1分钟。

- 停止DM数据同步

```
tiup dmctl –master-addr xxx.xxx.xxx.238:8261 stop-task test

# 确认任务停止，查询不到代表任务已经停止
tiup dmctl –master-addr xxx.xxx.xxx.238:8261 query-status test
```

- 开启 Binlog 增量同步

原 TiDB 集群扩容一个 Drainer，开启数据反向同步，详细说明可见下一节。

#### TiDB 到 MySQL 反向数据同步

这一部分，选择的工具则是 TiDB Binlog，这是一个十分简单的工具，提供准实时备份与数据同步。

1. 编写 Drainer 部署配置

```
drainer_servers:
  - host: xxx.xxx.xxx.123
    commit_ts: -1
    config:
      syncer.db-type: "mysql"
      # 需要同步的数据库
      syncer.replicate-do-db: 
        - ba
        - busapi
        - cboard
        - dispatch
        - express
        - im
        - pm
        - seed
        - ui
        - wms
      syncer.to.host: "xxx.xxx.xxx.234"
      syncer.to.user: "root"
      syncer.to.password: "<password>"
      syncer.to.port: 3306
      syncer.to.checkpoint:
        schema: "tidb_binlog"
        type: "mysql"
        host: "xxx.xxx.xxx.234"
        user: "root"
        password: "<password>"
        port: 3306

```

2. 使用 tiup 扩容 drainer

```
tiup cluster scale-out tidb-test ./scale-out-drainer.yaml --user tidb -p
```

扩容完成之后，数据反向同步就已经开始，可以简单测试一下，然后就可以启动前端服务，将读写流量全部交给 TiDB 数据库接管。

### 故障切换回 MySQL

当应用切换回 TiDB 之后，发生故障，需要切换回原 MySQL 来保障服务的正常运行，这时候需要将应用服务停止，接着停止 TiDB 到 MySQL 的反向同步，关闭并移除 Drainer，即可切换回原 MySQL，并且整个过程数据不会丢失。

## 总结

简单列一下，涉及到的操作步骤：

| 操作步骤                     | 使用工具                | 说明                                                                                |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------- |
| MySQL 到 TiDB 全量+增量数据迁移同步 | TiDB Data Migration | 数据同步过程中，应用服务不需要停机，数据迁移的完整时长由机器配置决定，配置越高，速度越快。                                     |
| 应用数据库从 MySQL 切换到 TiDB    | TiDB Binlog         | 切换过程中应用需要停机，停机时间很短，需要注意的是要先启动TiDB 到MySQL 的反向同步任务，才可安全将应用切换数据库。                    |
| 应用数据库从 TiDB 切换回 MySQL    | \\                  | 切换回MySQL之后，并未将后续MySQL的增量数据同步到TiDB，可待问题排查完之后，先全备一份TiDB数据，然后清空TiDB数据库，接着重新开启数据迁移任务。 |

