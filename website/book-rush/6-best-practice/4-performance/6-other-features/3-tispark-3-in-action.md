---
title: TiSpark 3.0.0 新特性实践 
hide_title: true
---

# TiSpark 3.0.0 新特性实践 

## 背景

TiSpark 3.0.0 于 6 月 15 号发布了，新的版本中提到了很多期望已久的功能，本文对几个新特性做了对比测试，验证新版本的特性是否符合线上要求。本文基础运行环境为 Spark On kubernetes，Spark 镜像打包时，已包含 TiSpark 必要的依赖。

## 阅读收益

## TiSpark 3.0.0 兼容性更改与新特性解析

下面的兼容性更改与新特性摘自官方：

#### 兼容性更改

- TiSpark without catalog plugin is no more supported. You must configure catalog configs and use tidb\_catalog now
  - 此特性简言之就是在 3.0.0 版本中，不再支持非 catalog plugin 的配置，更改说明如下：
    在 TiSpark 2.5.0 中，如下配置时是可以正常读取数据的：
    ```
    .set("spark.sql.extensions", "org.apache.spark.sql.TiExtensions")
    .set("spark.tispark.pd.addresses", pd_addr);
    ```
    数据读取：
    ```
    spark.sql("use sbtest");
    String source_sql = "select id,avg(k),max(c),count(`pad`) from sbtest_o so group by id order by id";
    spark.sql(source_sql).show();
    ```
    注意 use sbtest 中的 sbtest 是 tidb 的数据库。
    在 TiSpark 3.0.0 中需按照如下配置：
    ```
    .set("spark.sql.extensions", "org.apache.spark.sql.TiExtensions")
    .set("spark.sql.catalog.tidb_catalog", "org.apache.spark.sql.catalyst.catalog.TiCatalog")
    .set("spark.sql.catalog.tidb_catalog.pd.addresses", pd_addr)
    .set("spark.tispark.pd.addresses", pd_addr);
    ```
    数据读取：
    ```
    spark.sql("use tidb_catalog.sbtest");
    String source_sql = "select id,avg(k),max(c),count(`pad`) from sbtest_o so group by id order by id";
    spark.sql(source_sql).show();
    ```
  - 此案例中 use tidb\_catalog.sbtest 中 tidb\_catalog 是 spark.sql.catalog.tidb\_catalog 配置中指定的，如果配置时使用.set("spark.sql.catalog.tidb\_catalog2", "org.apache.spark.sql.catalyst.catalog.TiCatalog")，那么 use 时，需使用 use tidb\_catalog2.sbtest
- TiSpark's jar has a new naming rule like tispark-assembly-{$spark\_version}\_{$scala\_version}-{$tispark\_verison}
  - 此特性把 scala\_version 版本号体现在版本命名中，版本包命名由 tispark-assembly-3.0-2.5.1.jar 变化成了 tispark-assembly-3.0\_2.12-3.0.0.jar。

#### 新功能

- Support DELETE statement
  - 基于兼容性更改中 Datasource API 版本的替换，在 Spark 3.0.0 中可以支持 DELETE 特性，例如可以执行如下语句：spark.sql("delete from tidb\_catalog.db.table where xxx")。
- Support Spark 3.2
  - 支持 Spark 3.2 运行环境。
- Support telemetry to collect information
  - 支持遥测信息收集
- Support stale read to read historical versions of data
  - 支持过时读取特性（ Stale Read ），使用此特性时需要在配置中指定毫秒级时间戳，指定时间戳后，数据读取时，程序按照指定时间戳读取一个 Snapshot，所有的 SELECT 语句都会从这个 Snapshot 中读取数据。如果每个 SQL 都需要读取不同的 Snapshot，需要在每个 SQL 之前配置不同的时间戳 (java 示例)：
    ```
    val spark = SparkSession.builder.config(sparkConf).getOrCreate();

    spark.conf().set("spark.tispark.stale_read", 1651766410000L); //"2022-05-06 00:00:10"
    spark.sql("select * from test.t");

    spark.conf().set("spark.tispark.stale_read", 1651766420000L); //"2022-05-06 00:00:20"
    spark.sql("select * from test.t");

    spark.conf().set("spark.tispark.stale_read", "");
    spark.sql("select * from test.t");
    ```
- Support TLS with reload capability
  - 支持 TLS 并具备动态更新证书的能力

## 特性评测

我们有个 tidb 实验环境，是在 k8s 里面的，这个环境配套了一个 spark on k8s 环境。这次测试是在 spark on k8s+tidb on k8s 中测试的。

#### 非 catalog plugin 的配置运行情况

基于 spark 3.0.3 on k8s 测试非 catalog plugin 的配置运行情况。
因为以前的项目都是基于 maven 的，本次已经在 maven 项目下进行测试，首先修改项目依赖：

```
<properties>
    <tispark.spark.version>3.0_2.12</tispark.spark.version>
    <tispark.version>3.0.0</tispark.version>
</properties>
<dependency>
    <groupId>com.pingcap.tispark</groupId>
    <artifactId>tispark-assembly-${tispark.spark.version}</artifactId>
    <version>${tispark.version}</version>
</dependency>
```

本次依赖包的命名有变化，artifactId 由 tispark-assembly 改变成 tispark-assembly-3.0\_2.12
也就是说对应每个版本的 spark，artifactId 不同，类似下表所列：

| spark 版本    | artifactid 版本              |
| ----------- | -------------------------- |
| spark 3.0.X | tispark-assembly-3.0\_2.12 |
| spark 3.1.X | tispark-assembly-3.1\_2.12 |
| spark 3.2.X | tispark-assembly-3.2\_2.12 |

其次隐藏掉关于 catalog 的两行配置，修改后如下所示：

```
SparkConf conf = new SparkConf().set("spark.sql.extensions", "org.apache.spark.sql.TiExtensions")
        //.set("spark.sql.catalog.tidb_catalog", "org.apache.spark.sql.catalyst.catalog.TiCatalog")
        //.set("spark.sql.catalog.tidb_catalog.pd.addresses", pd_addr)
        .set("spark.tispark.pd.addresses", pd_addr);
```

运行 spark 程序，具体运行配置过程参考：[TiSpark On Kubernetes实践](https://tidb.net/blog/30f417ad) &##x20;
运行日志如下：

```
22/06/21 01:42:49 ERROR TiExtensions$: TiSpark must work with TiCatalog. Please add TiCatalog in spark conf.
com.pingcap.tikv.exception.TiInternalException: TiSpark must work with TiCatalog. Please add TiCatalog in spark conf.
	at org.apache.spark.sql.TiExtensions$.validateCatalog(TiExtensions.scala:79)
```

代码中加了个检查，在没有配置 Catalog 的情况下，检查报错，提示 TiSpark must work with TiCatalog。

## Spark 3.0.3 + stale read + delete 特性测试

实际运行时，建议最低使用 TiSpark 3.0.1 ，这个版本的已知问题比较少，各个 Spark 版本下也都测试通过。

Spark 3.2.1+TiSpark 3.0.1 stale read + delete 特性测试
测试构建代码如下：

```
String pd_addr = "basic-pd.tidb-cluster:2379";
String tidb_addr = "basic-tidb.tidb-cluster";

SparkConf conf = new SparkConf().set("spark.sql.extensions", "org.apache.spark.sql.TiExtensions")
        .set("spark.sql.catalog.tidb_catalog", "org.apache.spark.sql.catalyst.catalog.TiCatalog")
        .set("spark.sql.catalog.tidb_catalog.pd.addresses", pd_addr)
        .set("spark.tispark.pd.addresses", pd_addr);
SparkSession spark = SparkSession
        .builder().appName("RdbToRdbProcess")
        .config(conf)
        .getOrCreate();
// 通过 TiSpark 将 DataFrame 批量写入 TiDB
Map<String, String> tiOptionMap = new HashMap<String, String>();
tiOptionMap.put("tidb.addr", tidb_addr);
tiOptionMap.put("tidb.port", "4000");
tiOptionMap.put("tidb.user", username);
tiOptionMap.put("tidb.password", password);
tiOptionMap.put("replace", "true");
tiOptionMap.put("spark.tispark.pd.addresses", pd_addr);

spark.sql("use tidb_catalog.sbtest2");
// 获取当前时间戳
long ttl=System.currentTimeMillis();

System.out.println("删除前查询");
spark.sql("select * from sbtest_t_t  where id = 100").show();
System.out.println("删除");
spark.sql("delete from sbtest_t_t where id = 100").show();
System.out.println("删除后查询");
spark.sql("select * from sbtest_t_t  where id = 100").show();
System.out.println("stale read");
spark.conf().set("spark.tispark.stale_read", ttl);
spark.sql("select * from sbtest_t_t  where id = 100").show();
System.out.println("置空时间戳之后查询");
spark.conf().set("spark.tispark.stale_read", "");
spark.sql("select * from sbtest_t_t  where id = 100").show();
```

上述查询结果依次：

```
删除前查询:
+---+------+--------------------+--------------------+
| id|     k|                   c|                 pad|
+---+------+--------------------+--------------------+
|100|503013|72324218654-54342...|17648767791-53546...|
+---+------+--------------------+--------------------+
删除后查询:
+---+---+---+---+
| id|  k|  c|pad|
+---+---+---+---+
+---+---+---+---+
stale read:
+---+------+--------------------+--------------------+
| id|     k|                   c|                 pad|
+---+------+--------------------+--------------------+
|100|503013|72324218654-54342...|17648767791-53546...|
+---+------+--------------------+--------------------+
置空时间戳之后查询:
+---+---+---+---+
| id|  k|  c|pad|
+---+---+---+---+
+---+---+---+---+

```

由以上查询结果可知，数据能够执行删除，删除后正常查询是查询不到的，使用 stale read，利用删除之前的时间戳能够查询到数据，置空时间戳后，恢复普通查询，数据能够查询到。

## 总结

本次版本中 stale read + delete 让 tispark 具有更灵活的应用场景，经过验证 spark 3.2.1 跟 tidb 6.1.0 on k8s 通讯还有些问题仍需解决，另外一方面，也盼望着能兼容分区表的一些操作能发布出来，比如说导入数据之前能够 truncate 分区一类的操作。
