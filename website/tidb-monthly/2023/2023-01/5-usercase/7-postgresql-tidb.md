---
title: 有什么方法从 PostgreSQL 数据迁移到 TiDB？ - TiDB 社区技术月刊
sidebar_label: 有什么方法从 PostgreSQL 数据迁移到 TiDB？
hide_title: true
description: 本文将分享把数据从 PostgreSQL 迁移到 TiDB 中的几个同步迁移工具。
keywords: [TiDB, PostgreSQL, 数据迁移, Navicat]
---

# 有什么方法从 PostgreSQL 数据迁移到 TiDB？

> 作者：[caiyfc](https://tidb.net/u/caiyfc/answer)

## 一、背景

之前在项目中，收到一个紧急需求，要把数据从 PostgreSQL 迁移到 TiDB 中。由于时间紧任务重，来不及调研高效的方式，笔者直接使用了 Navicat 内置的功能，把数据从 PostgreSQL 迁移到了 TiDB。现在笔者有时间了，就调研了几个同步迁移工具。下面让我们一起看看，这几个工具各有什么特点吧。

## 二、Navicat

Navicat Premium 是一套多连接数据库开发工具，让你在单一应用程序中同时连接多种类型的数据库：MySQL、MariaDB、MongoDB、SQL Server、SQLite、Oracle 和 PostgreSQL，可一次快速方便地访问所有数据库。

### 1.增加数据源与目标库

![image-20230113141117896](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/4ILkMg3PxeRHjEl-1673601778937.png)

![image-20230113141158363](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/IWy15NQk6oesgYX-1673601779421.png)

### 2.打开数据传输工具，填写好相关信息：工具->传输工具

![image-20230113144558675](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/7Z5NRCz4KbHAXJt-1673601779435.png)

### 3.选择全部表

![image-20230113144809225](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/GQcHaKjl7wqUez4-1673601778437.png)

### 4.同步结果

![image-20230113145842464](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/cOPSqmfoHtuXTjW-1673601779479.png)

## 三、DataX

DataX 是阿里云 [DataWorks数据集成](https://www.aliyun.com/product/bigdata/ide) 的开源版本，在阿里巴巴集团内被广泛使用的离线数据同步工具/平台。DataX 实现了包括 MySQL、Oracle、OceanBase、SqlServer、Postgre、HDFS、Hive、ADS、HBase、TableStore(OTS)、MaxCompute(ODPS)、Hologres、DRDS 等各种异构数据源之间高效的数据同步功能。

我们可以把datax的同步功能当作迁移功能使用，看看效果如何。

### 1.环境准备

- Linux
- [JDK(1.8以上，推荐1.8)](http://www.oracle.com/technetwork/cn/java/javase/downloads/index.html)
- [Python(2或3都可以)](https://www.python.org/downloads/)
- [Apache Maven 3.x](https://maven.apache.org/download.cgi) (Compile DataX)

我们这里只简单介绍工具包安装：

```
yum install -y java-1.8.0-openjdk

# python2 自带了，这里不做安装。
# 用工具包安装，不需要部署 Apache Maven
```

### 2.datax部署

1. 直接下载DataX工具包：[DataX下载地址](https://datax-opensource.oss-cn-hangzhou.aliyuncs.com/202210/datax.tar.gz)
2. 上传到linux中
3. 解压 `tar -zxvf datax.tar.gz`
4. 验证环境是否正常 `python ./datax/bin/datax.py ./datax/job/job.json`
5. 验证结果：

![image-20230113103624369](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/skVNhWYA7QiRoDX-1673601779155.png)

### 3.编写job

1. 查看配置模板 `python ./datax/bin/datax.py -r postgresqlreader -w mysqlwriter`
2. 编写配置模板：

```
{
    "job": {
        "content": [
            {
                "reader": {
                    "name": "postgresqlreader",
                    "parameter": {
                        "connection": [
                            {
                                "jdbcUrl": ["jdbc:postgresql://10.3.70.132:30118/dc-master-data-management-pg_migrate_test"],
                                "table": ["crm_lead"]
                            }
                        ],
                        "password": "test",
                        "username": "test",
                        "column": ["*"]
                    }
                },
                "writer": {
                    "name": "mysqlwriter",
                    "parameter": {
                        "connection": [
                            {
                                "jdbcUrl": "jdbc:mysql://10.3.65.137:4000/test?characterEncoding=utf8&useSSL=false&useServerPrepStmts=true&prepStmtCacheSqlLimit=1000&useConfigs=maxPerformance&rewriteBatchedStatements=true&defaultfetchsize=-2147483648",
                                "table": ["crm_lead"]
                            }
                        ],
                        "username": "root",
                        "password": "tidb",
                        "writeMode": "insert",
                        "column": ["*"]
                    }
                }
            }
        ],
        "setting": {
            "speed": {
                "channel": "1"
            }
        }
    }
}

```

### 4.启动datax

1. 启动datax `python ./datax/bin/datax.py ./datax/pg2tidb.json`
2. 完成结果：

![image-20230113104144160](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1mQFg4ETO7lZv8S-1673601779495.png)

## 三、TurboDX

TurboDX for MySQL 专门针对兼容MySQL路线的数据库作为目标库的实时同步工具软件(支持Oracle(RAC)、SQLServer、MySQL、PostgreSQL、DB2、Informix等全量+增量实时同步到MySQL/TiDB/Oceanbase/TDSQL/GlodenDB/SequoiaDB/GreatDB/HotDB等。

### 1.TurboDX 安装部署

1. 准备⼀台Windows环境的机器
2. 下载数据迁移⼯具 [TurboDX for MySQL](http://www.synball.com/resources/TurboDXInstall/TurboDX_ForMySQL_Setup5.0.exe) ，并成功安装
3. 打开Windows 服务控制面板（可直接使用Windows 自带的搜索功能，输入 “服务” 即可快速进入），找到TurboDXDB、TurboDX Server、TurboDXWEB 三项服务，并按顺序依次启动

![image-20230113111800430](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/w4c6TByGAUvJMux-1673601778901.png)

### 2.TurboDX 使用

#### 1.访问 TurboDX

本机访问：<http://127.0.0.1:8422/turbodx> 进入TurboDX 控制中心，默认登录用户密码为 admin/admin

![image-20230113112243263](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/285BAYRtudkMHex-1673601779175.png)

#### 2.配置数据源 PostgreSQL

![image-20230113112534384](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/QmAYG5iXUaR8Ko2-1673601779349.png)

#### 3.配置需要迁移的库表

![image-20230113112940503](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/VIBAw4F8x9W67eq-1673601779353.png)

#### 4.配置目标数据库TiDB

![image-20230113113341436](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/gHALtvSBKR7waqU-1673601779352.png)

#### 5.配置迁移任务

在右侧选项菜单中，找到任务管理，选择子菜单，复制同步，点击左上角新建按钮，配置集群信息，注意全量与增量选项都要勾选，然后保存。

![image-20230113140358162](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/c3jsOai4YRtX9k1-1673601779349.png)

#### 6.完善任务配置

选中任务，并点击打开

![image-20230113114348671](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/uGMYOhBW5FdA3LD-1673601779554.png)

![image-20230113114702751](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/sqAiM1bY62hcQIT-1673601779780.png)

#### 7.迁移目标库表结构

选择迁移库表，调整对应字段，点击确定

![image-20230113122145026](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/LWOR6dk41MDQSA9-1673601779493.png)

![image-20230113122316489](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/oVIQ6ipebvsurTK-1673601778964.png)

#### 8.启动迁移任务

点击运行

![image-20230113115155187](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/kJ97gPp2DjEeXuZ-1673601779198.png)

点击确定

![image-20230113115239893](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/hBYxCI6Was15ifM-1673601779460.png)

#### 9.解决报错

![image-20230113120025392](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/AaIyP9nuVM4GKmN-1673601779491.png)

解决方法：执行 SQL 并重启 postgresql

```
ALTER SYSTEM SET wal_level = 'logical';
```

## 四、总结

1、Navicat

- 优点：方便快捷，操作简单，对于经常使用 Navicat 的小伙伴来说，更加熟悉，简单的数据迁移没有问题。

- 缺点：

  - 收费！
  - 迁移表结构的时候，有时候会报错，应该是字段类型对应关系没做好。

2、DataX

- 优点：对数据同步友好
- 缺点：对数据迁移不够友好。datax主要是做数据同步的，在数据迁移方面有诸多不方便的地方，比如datax是用多个task来实现数据同步的，每个task需要手动编写 json 并指定表名与同步的字段名，如果数据迁移的表与字段太多，task的配置就是非常耗时的一件事情，这对于数据迁移来说实在太麻烦。而且使用datax之前，下游数据库的表结构要自己创建，工作量一下就大了。所以数据量少的时候，可以用datax来做数据迁移，但是有大量数据的情况下，不建议使用 datax。

3、TurboDX

- 优点：部署简单；操作简单易懂；能全库全表迁移，也能自由过滤指定表迁移；迁移不需要人为干预，功能齐全；表结构迁移与数据迁移是分开的两个功能，可以单独操作。
- 缺点：社区版需要使用windows，Linux版本需要联系官方索要。