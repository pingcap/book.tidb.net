---
title: 体验 TiDB v6.0.0 之 TiDB 的数据迁移工具 DM-WebUI
hide_title: true
---

# 体验 TiDB v6.0.0 之 TiDB 的数据迁移工具 DM-WebUI

>By [边城元元](https://tidb.net/u/边城元元/post/all)

## 一、背景

&#x20;       TiDB Data Migration (DM)  是一款便捷的数据迁移工具，支持从与 MySQL 协议兼容的数据库到 TiDB 的全量数据迁移和增量数据同步。 ​&#x20;

&#x20;       TiDB v6.0.0 之前，使用 DM 做数据迁移方式是通过 dmctl 和配置文件方式，对命令和配置不熟悉的 TiDBer 不是很方便。在 TiDB v6.0.0 发布同时发布了 DM 的可视化管理工具 WebUI 。真心感觉TiDB越来越好用，更加强大，迫不及待的体验一把。

## 二、DM 准备条件

### 2.1 了解 DM

&#x20;        DM 支持从与 MySQL 协议兼容的数据库（MySQL、MariaDB、Aurora MySQL）到 TiDB 的全量数据迁移和增量数据同步。使用 DM 工具有利于简化数据迁移过程，降低数据迁移运维成本。

#### 2.1.1 DM 组成

&#x20;       DM 主要包括三个组件：DM-master，DM-worker 和 dmctl。

&#x20;       TiDB v6.0.0 增加了WebUI可视化管理（ http\://{master\_ip}:{master\_port}/dashboard/ )

组件说明：

1、DM-master

&#x20;   DM-master 负责管理和调度数据迁移任务的各项操作。

- 保存 DM 集群的拓扑信息
- 监控 DM-worker 进程的运行状态
- 控数据迁移任务的运行状态
- 提供数据迁移任务管理的统一入口
- 协调分库分表场景下各个实例分表的 DDL 迁移

2、DM-worker

&#x20;   DM-worker 负责执行具体的数据迁移任务。

- 将 binlog 数据持久化保存在本地
- 保存数据迁移子任务的配置信息
- 编排数据迁移子任务的运行
- 监控数据迁移子任务的运行状态

3、dmctl

&#x20;   dmctl 是用来控制 DM 集群的命令行工具。

- 创建、更新或删除数据迁移任务
- 查看数据迁移任务状态
- 处理数据迁移任务错误
- 校验数据迁移任务配置的正确性

4、WebUI

&#x20;   DM 可视化管理

#### 2.1.2 Data Migration 架构

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728516677.png)

> 1、可以从 DM 集群的任意 master 节点访问 DM WebUI，访问端口与 DM OpenAPI 保持一致，默认为 `8261`。访问地址示例：`http://{master_ip}:{master_port}/dashboard/`。

### 2.2 使用DM的前提条件

#### 2.2.1 MySQL 协议兼容的数据库

- 数据库版本要求

&#x20;       MySQL 版本 5.5 \~ 5.7 &#x20;

&#x20;       MySQL 版本 = 8.0 （实验特性）

&#x20;       MariaDB 版本 >= 10.1.2 （实验特性）

- 表结构的兼容性

  - 检查上游表是否设置了外键。TiDB  不支持外键，如果上游表设置了外键，则返回警告。
  - （必须）检查字符集是否存在兼容性差异，详见 [TiDB 支持的字符集](https://docs.pingcap.com/zh/tidb/v6.0/character-set-and-collation)。
  - （必须）检查上游表中是否存在主键或唯一键约束（从 v1.0.7 版本引入）。

#### 2.2.2 TiDB 的存储空间

TiKV 总节点要有足够的空间（应大于上游数据源的大小 × 副本数 ×2 ）

为什么 ×2 呢?这里主要考虑到下面两个方面：

- 索引会占据额外的空间
- RocksDB 的空间放大效应

#### 2.2.3 开启WebUI的配置

> 为确保 DM WebUI 能正常显示，在使用 DM WebUI 前，确保以下操作或配置已完成：

- 1、开启 DM OpenAPI 配置：&#x20;

  1）如果你的 DM 集群是通过二进制方式部署的，在该 master 节点的配置中开启 openapi 配置项： openapi = true&#x20;

  2）如果你的 DM 集群是通过 TiUP 部署的，在拓扑文件中添加如下配置：

  ```
  server_configs:
    master:
      openapi: true
  ```

  3\)已经安装好的dm集群

  ```
  tiup-dm  edit-config <dm-clustername>
  tiup-dm reload <dm-clustername> -N <dm-master>
  ```

- 2、首次部署 Grafana 时，已正确安装监控相关组件：monitoring\_servers 和 grafana\_servers。grafana\_servers 须按如下进行配置 （ v6.1版本中已去掉此步骤）：

  ```
  grafana_servers:
  
    - host: 10.0.1.14
      # port: 3000
      # deploy_dir: /tidb-deploy/grafana-3000
      config:       # 请确保执行 tiup dm -v 的 TiUP 版本在 v1.9.0 及以上
        auth.anonymous.enabled: true
        security.allow_embedding: true
  ```

- 若 grafana\_servers 使用了非默认的 IP 和端口，则需要在 WebUI 的 Dashboard 界面填写正确的 IP 和端口。

## 三、DM 演练说明

本次演练 mysql 环境为  MySQL5.7.26 （ Window 10 ）。

### 3.1 演练图示

本次演练从 mysql3306 单实例 迁移到 TiDB 4000

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728532491.png)

### 3.2 上游数据源 Mysql3306

#### 3.2.1 上游 mysql 数据库 test-dm

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728540483.png)

#### 3.2.2 my.ini 配置&#x20;

```
# 开启gtid
gtid_mode=on
enforce_gtid_consistency=on
# 开启binlog
log_bin=on
binlog_format=row
# 开启binlog日志记录数据库的二进制日志
binlog_ignore_db=mysql
binlog_do_db=test-dm

```

#### 3.2.3 GTID

> 1、如果上游源数据库存在主从切换，请务必在上游 MySQL 开启 GTID，并在创建上游配置时将 GTID 设为 True，否则数据迁移任务将在主从切换时中断（AWS Aurora 除外）；

#### 3.2.4 Relay log

> 1、当多个迁移任务使用同一个上游时，可能对其造成额外压力。建议开启 relay log 可降低对上游的影响。
>
> 2、DM-worker 在运行过程中，会将上游 binlog 实时迁移到本地文件。DM-worker 的 sync 处理单元会实时读取本地 relay log 的 binlog 事件，将这些事件转换为 SQL 语句，再将 SQL 语句迁移到下游数据库。
>
> 3、在启用 relay log 功能后，DM-worker 会自动将上游 binlog 迁移到本地配置目录（若使用 TiUP 部署 DM，则迁移目录默认为 `<deploy_dir> / <relay_log>`）。自 v5.4.0 版本起，你可以在 [DM-worker 配置文件](https://docs.pingcap.com/zh/tidb/stable/dm-worker-configuration-file)中通过 `relay-dir` 配置本地配置目录，其优先级高于上游数据库的配置文件。

#### 3.2.5 验证上游数据库

```
# 检测是否开启binlog
# log_bin=on
# binlog_format=row
show variables like '%binlog%'
# 开启gtid
# gtid_mode=on
# enforce_gtid_consistency=on
show variables like '%gtid%'

```

### 3.3 TiDB 集群 cluster111

此处集群名字为以各组件节点数来初始化的名字，建议可根据实际情况起个有意义的辨识度高的名字。

#### 3.3.1 cluster111 拓扑

> <https://tidb.net/blog/af8080f7#cluster111>

```
# cluster111.yml
global:
  user: "tidb"
  ssh_port: 22
  deploy_dir: "/tidb-deploy111"
  data_dir: "/tidb-data111"
server_configs:
  tidb:
    log.slow-threshold: 300
  tikv:
    readpool.storage.use-unified-pool: false
    readpool.coprocessor.use-unified-pool: true
  pd:
    replication.max-replicas: 1
pd_servers:
  - host: 10.0.2.15
    client_port: 2379 #注意与tidb-server,tikv的key不一样
    peer_port: 2380 #注意与tidb-server,tikv的key不一样
tidb_servers:
  - host: 10.0.2.15
    port: 4000
    status_port: 10080
tikv_servers:
  - host: 10.0.2.15
    port: 20160
    status_port: 20180
   
# 监控
monitoring_servers:
  - host: 10.0.2.15
grafana_servers:
  - host: 10.0.2.15
    config:       #  Enable this part if you want to use WebUI, make sure tiup dm -v newer than v1.9.0.
      auth.anonymous.enabled: true
      security.allow_embedding: true
alertmanager_servers:
  - host: 10.0.2.15

```

#### 3.3.2 部署和启动 cluster111

离线安装： <https://pingcap.com/zh/product-community/#TiDB> 6.0.0-DMR

1）下载安装包 tidb-community-server-v6.0.0-linux-amd64.tar.gz&#x20;

2）下载tookit tidb-community-toolkit-v6.0.0-linux-amd64.tar.gz

```
# 安装cluster111
tiup cluster deploy cluster111 v6.0.0 ./cluster111.yml --user root -p

# 启动集群
tiup cluster start cluster111
tiup cluster display cluster111
```

### 3.4 部署 DM 集群

#### 3.4.1 DM 拓扑

- 生成 dm 的拓扑

```
cd /usr/local0/webserver/tidb/tidb-community-toolkit-v6.0.0-linux-amd64
tar -zxvf dm-v1.9.4-linux-amd64.tar.gz
cp ./tiup-dm /root/.tiup/bin/

tiup-dm -h
tiup-dm template --full >dm-cluster111.toml
```

- dm-cluster111 拓扑

```
#dm-cluster111
server_configs:
  master:
    # 开启webui
    openapi: true
master_servers:
  - host: 10.0.2.15
    port: 8261
worker_servers:
  - host: 10.0.2.15
    port: 8262
    
#监控
monitoring_servers:
  - host: 10.0.2.15
    port: 19090
grafana_servers:
  - host: 10.0.1.14
    port: 13000
    config:   # Enable this part if you want to use WebUI, make sure tiup dm -v newer than v1.9.0.
      auth.anonymous.enabled: true
      security.allow_embedding: true
alertmanager_servers:
  - host: 10.0.1.15
    web_port: 19093
    cluster_port: 19094
```

#### 3.4.2 部署集群

```
tiup-dm deploy dm-cluster111 v6.0.0 ./dm-cluster111.toml --user root -p 
tiup-dm start dm-cluster111
tiup-dm display dm-cluster111
```

#### 3.4.3 登录 Dm-WebUI

[http://127.0.0.1:8261/dashboard](http://127.0.0.1:8261/dashboard]\(http://127.0.0.1:8261/dashboard\))

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728557176.png)

注意：web-ui 上的 dashboard 上的监控需要设置的 ip 为 master 机器可以访问到的 grafana 的地址和端口

### 3.5 使用 DM-WebUI 做数据迁移

任务模式 task-mode:

- all 全量+增量
- full 全量
- incremental 增量

**创建上游数据源配置**

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728565361.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728571852.png)

后边要多次使用这个上游数据源，所以开启了relaylog。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728578080.png)

#### 3.5.1 测试全量迁移

> test\_dm(Mysql3306)--->test\_dm\_full(TiDB 4000) 上游数据库:test\_dm(Mysql3306) 已经准备完毕

##### 3.5.1.1 新建test\_dm\_full数据库

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728586402.png)

##### 3.5.1.2 添加任务-基本信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728592529.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728598894.png)

任务名：task-test-dm-full 原信息：meta\_test\_dm\_full&#x20;

**注意：** 这里自定义的存储路径无效，实际将保存在 dm-worker 节点下的 dumped\_data.xxx 目录下。 如：/tidb-deploy111/dm-worker-8262/dumped\_data.xxx/

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728605002.png)

##### 3.5.1.3 添加任务-上游信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728611893.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728619322.png)

##### 3.5.1.4 添加任务-下游信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728626069.png)

##### 3.5.1.5 添加任务-事件过滤

事件过滤器根据具体情况填写（这里可以不填写）

##### 3.5.1.6 添加任务-同步规则

必须填写

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728633860.png)

##### 3.5.1.7 添加任务-保存任务并运行

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728642983.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728649599.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728656880.png)

##### 3.5.1.8 任务列表-任务完成

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728662545.png)

##### 3.5.1.9 验证数据完整性

###### 1）Mysql3306 源数据库 test\_dm 记录信息

```

-- 统计指定数据库下的表记录数
-- 生成sql语句
select concat(
    'select \'', 
    TABLE_name, 
    '\' , count(*) from ',     
    TABLE_name,
    ' union all'
)  from information_schema.tables 
where TABLE_SCHEMA='test_dm';

select 'm_cust_data', count(*) ct from m_cust_data union all
select 'm_cust_main', count(*) from m_cust_main union all
select 'm_cust_oneall', count(*) from m_cust_oneall union all
select 'm_cust_org', count(*) from m_cust_org union all
select 'm_user', count(*) from m_user union all
select 'rpt_detail_org', count(*) from rpt_detail_org


```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728670883.png)

###### 2）TiDB4000 目标数据库 test\_dm\_full 记录信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728677159.png)

###### 3）源数据与目标数据表和记录数一致。

#### 3.5.2 测试增量迁移

> test\_dm(Mysql3306)--->test-dm-incremental(TiDB 4000) 上游数据库:test-dm(Mysql3306) 已经准备完毕
>
> 注意：incremental: 仅进行增量数据同步，需要指定开始时间或 binlog 位置。

##### 3.5.2.1 新建 test\_dm\_incremental 数据库

> 为了让增量使用单独的dm-work 新建上游数据源 mysql3306-(test\_dm)3

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728684733.png)

##### 3.5.2.2 添加任务-基本信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728691961.png)

> 任务名：task-test-dm-incremental 原信息：meta\_test\_dm\_incremental 存储路径：/tidb/dm/task-test-dm-incremental/dump\_data

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728697744.png)

##### 3.5.2.3 添加任务-上游信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728704817.png)

##### 3.5.2.4 添加任务-下游信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728710637.png)

##### 3.5.2.5 添加任务-事件过滤

事件过滤器根据具体情况填写（这里可以不填写）

##### 3.5.2.6 添加任务-同步规则

必须填写

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728718398.png)

##### 3.5.2.7 添加任务-运行

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728725016.png)

##### 3.5.2.8 验证数据

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728731223.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728738410.png)

增量数据按照预期同步到增量库中。

#### 3.5.3 测试全量+增量迁移

> Mysql(test\_dm)--->TiDB(test\_dm\_all)

##### 3.5.3.1 新建test\_dm\_all

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728745941.png)

##### 3.5.3.2 添加任务-基本信息

任务名：task-test-dm-all 原信息：meta\_test\_dm\_all 存储路径：/tidb/dm/task-test-dm-all/dump\_data

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728753030.png)

##### 3.5.3.3 添加任务-上游信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728759994.png)

##### 3.5.3.4 添加任务-下游信息

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728766768.png)

##### 3.5.3.5 添加任务-事件过滤

事件过滤器根据具体情况填写（这里可以不填写）

##### 3.5.3.6 添加任务-同步规则

\> 必须填写

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728774300.png)

提示错误：“test-dm 必须配置到需要 binlog 的日志里”

my.ini

```
#上游 
binlog_do_db=test_dm
```

如何复用已经存在的 dm-work

- 方式1：停止 dm-work，停止任务、删除上游
- 方式2：扩容一个 dm-work

本示例采用扩容一个 dm-work 的方式

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728792550.png)

##### 3.5.3.7 验证数据一致性

```
-- 源库中执行
select c.* from (
select concat(
    'select \'', 
    TABLE_name, 
    '\' tablename , count(*) ct from ',     
    TABLE_name,
    ' union all'
)  from information_schema.tables 
where TABLE_SCHEMA='test_dm') c  union all 
select 'select 0,0 from dual order by ct desc ' ;


-- Tidb库中执行
select 'm_cust_data' tablename , count(*) ct from m_cust_data union all
select 'm_cust_main' tablename , count(*) ct from m_cust_main union all
select 'm_cust_oneall' tablename , count(*) ct from m_cust_oneall union all
select 'm_cust_org' tablename , count(*) ct from m_cust_org union all
select 'm_user' tablename , count(*) ct from m_user union all
select 'rpt_detail_org' tablename , count(*) ct from rpt_detail_org union all
select 0,0 from dual order by ct desc 

```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728801946.png)

##### 3.5.3.8 对上游数据源（Mysql test\_dm）数据做变更测试增量

> 主要包括：新增表，新增数据，修改数据，删除数据

1、新建表 test\_dm

```
# 创建表
CREATE TABLE `m_user_new` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL DEFAULT '',
  `age` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=innodb AUTO_INCREMENT=112 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

# 新增
INSERT INTO `test_dm`.`m_user_new`(`id`, `name`, `age`) VALUES (1, 'a', 1);
INSERT INTO `test_dm`.`m_user_new`(`id`, `name`, `age`) VALUES (2, 'b', 22);

# 修改
update `test_dm`.`m_user_new` set name='namennnnnnnnnnnn' where id=1;
update `test_dm`.`m_user_new` set name='mmmmmmmm' where id=2;

INSERT INTO `test_dm`.`m_user_new`(`id`, `name`, `age`) VALUES (3, 'cccccccccccccccccc', 99);

# 删除
delete from `test_dm`.`m_user_new`  where id=2;

# 新增2
CREATE TABLE `m_user_new2` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_bin NOT NULL DEFAULT '',
  `age` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=innodb AUTO_INCREMENT=112 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

# 插入
-- 在test_dm中执行插入，在tidb中的all模式下基本没有延迟就可以看到新插入的记录
INSERT INTO `test_dm`.`m_user_new2`( `name`, `age`) VALUES ( 'ddddddddddd', 99);



```

2、下游（目标库 test\_dm\_all）

```
show tables;

select * from m_user_new;
select * from m_user_new2;

-- 对源的删除很快会反馈到 目标库表

```

> 注意： 1、如果在任务中没有做事件过滤，那么对tidb的表的操作 将会被 源数据库中对应的记录的操作所覆盖。通常这种情况出现在同时写入源和目标库的情况下。 2、如果任务停止，再次启动任务时将从上次同步的时间点继续同步数据。

##### 3.5.3.9 验证增量数据

1）Mysql test\_dm 库

```
select 'm_cust_data', count(*) ct from m_cust_data union all
select 'm_cust_main', count(*) from m_cust_main union all
select 'm_cust_oneall', count(*) from m_cust_oneall union all
select 'm_cust_org', count(*) from m_cust_org union all
select 'm_user', count(*) from m_user union all
select 'm_user_new', count(*) from m_user_new union all
select 'm_user_new2', count(*) from m_user_new2 union all
select 'rpt_detail_org', count(*) from rpt_detail_org order by ct desc;
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728816817.png)

2）TiDB test\_dm\_all库

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728825006.png)

3）数据全量+增量同步 经验证数据是一致的。

#### 3.5.4 适用场景

- 从小数据量 MySQL 迁移数据到 TiDB&#x20;

&#x20;       1）“小数据量”通常指 TB 级别以下&#x20;

&#x20;       2）直接使用 DM 进行数据同步到 TiDB

- 从大数据量 MySQL 迁移数据到 TiDB&#x20;

&#x20;       1）使用 Dumpling 导出全量数据&#x20;

&#x20;       2）使用 Lightning 导入全量数据&#x20;

&#x20;       3）使用 DM 持续复制增量数据到 TiDB 需要记录 binlog-name 和 binlog-pos 或 binlog-gtid

- 从小数据量分库分表 MySQL 合并迁移数据到 TiDB

&#x20;       1）“小数据量”通常指 TB 级别以下&#x20;

&#x20;       2）直接使用 DM 进行数据同步到 TiDB

- 从大数据量分库分表 MySQL 合并迁移数据到 TiDB

&#x20;       1）使用 Dumpling 导出全量数据备份&#x20;

&#x20;       2）适用 Lightning 执行导入多个分库的全量数据到 TiDB 中的特定表&#x20;

&#x20;       3）使用 DM 进行增量数据迁移

## 四、DM诊断

#### 4.1 监控

DM 集群会默认部署一套监控

##### 4.1.1 查看监控的方式

1、<http://127.0.0.1:13000/#grafana>

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728837646.png)

2、WebUI (dashboard)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728844452.png)

#### 4.2 clinic

clinic 对 dm 的收集使用独立的命令

tiup diag help tiup diag collectdm \<dm-clustername>

**收集诊断信息**

```
tiup diag collectdm dm-cluster111
tiup diag package ${diagfilepath}
tiup diag upload ${diagfilepath}.diag

```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1651728853669.png)

## 五、注意

### 5.1 webui 与 dmctl

- DM WebUI 中 `task` 的生命周期有所改变，不建议与 dmctl 同时使用。
- 如果你不习惯 dmctl 可以使用 webui 替代

## 六、体验过程遇到的小坑

#### 1、 存储路径

每次编辑都会发生变化修改为默认值， 有 强迫症的朋友要每次改为自己指定的路径 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652108425460.png)

#### 2、 上游配置

密码端口填写配置错误要到最后提交任务才会告诉你。（可以优化增加一个验证功能）

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652108433935.png)

#### 3、 在不指定特定表的情况下

如果不需要改变原有表名，下面的空不要填写，下游这里的表名应该留空。注意：不能填写 `*` 星号 否则没有效果。



![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652108442024.png)



## 七、总结

1、使用 DM 的 WebUI 总体是比较顺畅丝滑，中间遇到了一些问题在官方和社区朋友的帮助下得以解决。

2、特别感谢 PingCAP，感谢社区热心的朋友帮助和支持！
